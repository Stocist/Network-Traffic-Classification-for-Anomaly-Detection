import { useState, useCallback, useMemo } from 'react';
import type { PredictionRow } from '../types/inference';

export type FilterState = {
  attackType: string[];
  scoreRange: [number, number] | null;
  service: string[];
  prediction: string | null;
};

// * Normalize attack category names to match backend normalization
const normalizeAttackCategory = (category: string): string => {
  const catLower = category.toLowerCase().trim();
  
  const normalizationMap: Record<string, string> = {
    'backdoors': 'Backdoor',
    'backdoor': 'Backdoor',
    'fuzzers': 'Fuzzers',
    'fuzzer': 'Fuzzers',
    'exploits': 'Exploits',
    'exploit': 'Exploits',
    'worms': 'Worms',
    'worm': 'Worms',
    'shellcode': 'Shellcode',
    'shellcodes': 'Shellcode',
    'reconnaissance': 'Reconnaissance',
    'generic': 'Generic',
    'dos': 'DoS',
    'analysis': 'Analysis'
  };
  
  return normalizationMap[catLower] || category;
};

export function useLinkedVisualization(initialData: PredictionRow[]) {
  const [filters, setFilters] = useState<FilterState>({
    attackType: [],
    scoreRange: null,
    service: [],
    prediction: null
  });

  // * Apply all active filters to the data
  const filteredData = useMemo(() => {
    return initialData.filter(row => {
      // Filter by attack type (multiple selection)
      if (filters.attackType.length > 0) {
        const attackCat = row.data?.attack_cat || row.data?.label_family || row.data?.threat_type;
        if (!attackCat) {
          return false;
        }
        // * Normalize the attack category before comparison
        const normalizedCat = normalizeAttackCategory(String(attackCat));
        if (!filters.attackType.includes(normalizedCat)) {
          return false;
        }
      }

      // Filter by score range
      if (filters.scoreRange && row.score !== undefined && row.score !== null) {
        const [min, max] = filters.scoreRange;
        if (row.score < min || row.score > max) {
          return false;
        }
      }

      // Filter by service (multiple selection)
      if (filters.service.length > 0) {
        const service = row.data?.service;
        if (!service || !filters.service.includes(String(service))) {
          return false;
        }
      }

      // Filter by prediction
      if (filters.prediction) {
        if (row.prediction !== filters.prediction) {
          return false;
        }
      }

      return true;
    });
  }, [initialData, filters]);

  // * Update a specific filter (toggle for arrays, replace for single values)
  const updateFilter = useCallback((filterType: keyof FilterState, value: any) => {
    setFilters(prev => {
      // Handle array-based filters (attackType, service)
      if (filterType === 'attackType' || filterType === 'service') {
        const currentArray = prev[filterType] as string[];
        const valueStr = String(value);
        
        // Toggle: if already in array, remove it; otherwise add it
        if (currentArray.includes(valueStr)) {
          return { ...prev, [filterType]: currentArray.filter(v => v !== valueStr) };
        } else {
          return { ...prev, [filterType]: [...currentArray, valueStr] };
        }
      }
      
      // Handle single-value filters (scoreRange, prediction)
      const currentValue = prev[filterType];
      
      // Toggle off if clicking the same value
      if (filterType !== 'scoreRange' && currentValue === value) {
        return { ...prev, [filterType]: null };
      }
      
      return { ...prev, [filterType]: value };
    });
  }, []);

  // * Clear a specific filter
  const clearFilter = useCallback((filterType: keyof FilterState) => {
    if (filterType === 'attackType' || filterType === 'service') {
      setFilters(prev => ({ ...prev, [filterType]: [] }));
    } else {
      setFilters(prev => ({ ...prev, [filterType]: null }));
    }
  }, []);

  // * Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilters({
      attackType: [],
      scoreRange: null,
      service: [],
      prediction: null
    });
  }, []);

  // * Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.attackType.length > 0) count++;
    if (filters.scoreRange !== null) count++;
    if (filters.service.length > 0) count++;
    if (filters.prediction !== null) count++;
    return count;
  }, [filters]);

  // * Get filter summary for display
  const filterSummary = useMemo(() => {
    const summary: Array<{ key: keyof FilterState; label: string }> = [];
    
    if (filters.attackType.length > 0) {
      const label = filters.attackType.length === 1 
        ? `Attack: ${filters.attackType[0]}`
        : `Attacks: ${filters.attackType.length} selected`;
      summary.push({ key: 'attackType', label });
    }
    if (filters.scoreRange) {
      const [min, max] = filters.scoreRange;
      summary.push({ key: 'scoreRange', label: `Score: ${min.toFixed(2)}-${max.toFixed(2)}` });
    }
    if (filters.service.length > 0) {
      const label = filters.service.length === 1
        ? `Service: ${filters.service[0]}`
        : `Services: ${filters.service.length} selected`;
      summary.push({ key: 'service', label });
    }
    if (filters.prediction) {
      summary.push({ key: 'prediction', label: `Type: ${filters.prediction}` });
    }
    
    return summary;
  }, [filters]);

  return {
    filters,
    filteredData,
    updateFilter,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    filterSummary
  };
}

