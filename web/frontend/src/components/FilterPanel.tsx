import { FaFilter, FaTimes, FaArrowDown } from 'react-icons/fa';
import type { FilterState } from '../hooks/useLinkedVisualization';

type FilterPanelProps = {
  filters: FilterState;
  filteredCount: number;
  totalCount: number;
  onClearFilter: (filterType: keyof FilterState) => void;
  onClearAll: () => void;
  onJumpToTable?: () => void;
  availableAttackTypes: string[];
  availableServices: string[];
  onFilterChange?: (filterType: keyof FilterState, value: any) => void;
};

export function FilterPanel({
  filters,
  filteredCount,
  totalCount,
  onClearFilter,
  onClearAll,
  onJumpToTable,
  availableAttackTypes,
  availableServices,
  onFilterChange
}: FilterPanelProps) {
  const hasActiveFilters = filters.attackType.length > 0 || filters.service.length > 0 || 
                          filters.scoreRange !== null || filters.prediction !== null;
  
  const activeCount = (filters.attackType.length > 0 ? 1 : 0) + 
                      (filters.service.length > 0 ? 1 : 0) + 
                      (filters.scoreRange !== null ? 1 : 0) + 
                      (filters.prediction !== null ? 1 : 0);

  return (
    <article className="card filter-panel-card">
      <div className="filter-panel-header">
        <FaFilter className="filter-header-icon" />
        <h3>Active Filters</h3>
        {hasActiveFilters && (
          <button className="reset-filters-btn" onClick={onClearAll} title="Reset all filters">
            Reset
          </button>
        )}
      </div>
      
      <div className="filter-status-summary">
        <span className="filter-showing">
          Showing <strong>{filteredCount.toLocaleString()}</strong> of <strong>{totalCount.toLocaleString()}</strong> rows
        </span>
        {hasActiveFilters && filteredCount !== totalCount && (
          <span className="filter-badge">{activeCount} active</span>
        )}
      </div>

      <div className="filter-groups">
        {/* Attack Type Filter */}
        {availableAttackTypes.length > 0 && (
          <div className="filter-group">
            <label className="filter-group-label">Attack Type</label>
            <div className="filter-checkboxes">
              {availableAttackTypes.map(type => (
                <label key={type} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.attackType.includes(type)}
                    onChange={() => onFilterChange?.('attackType', type)}
                    className="filter-checkbox"
                  />
                  <span className="filter-checkbox-text">{type}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Service Filter */}
        {availableServices.length > 0 && (
          <div className="filter-group">
            <label className="filter-group-label">Service</label>
            <div className="filter-checkboxes">
              {availableServices.map(service => (
                <label key={service} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.service.includes(service)}
                    onChange={() => onFilterChange?.('service', service)}
                    className="filter-checkbox"
                  />
                  <span className="filter-checkbox-text">{service}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {onJumpToTable && hasActiveFilters && (
        <button className="jump-to-results-btn" onClick={onJumpToTable}>
          <FaArrowDown /> View Filtered Results
        </button>
      )}

      {!hasActiveFilters && (
        <p className="filter-hint">
          Click any chart segment to filter results
        </p>
      )}
    </article>
  );
}

