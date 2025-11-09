import { FaTimes, FaFilter, FaArrowDown } from 'react-icons/fa';
import type { FilterState } from '../hooks/useLinkedVisualization';

type FilterStatusPanelProps = {
  filters: FilterState;
  filteredCount: number;
  totalCount: number;
  onClearFilter: (filterType: keyof FilterState) => void;
  onClearAll: () => void;
  onJumpToTable?: () => void;
};

export function FilterStatusPanel({
  filters,
  filteredCount,
  totalCount,
  onClearFilter,
  onClearAll,
  onJumpToTable
}: FilterStatusPanelProps) {
  const activeFilters = getActiveFilters(filters);

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="filter-status-panel">
      <div className="filter-status-header">
        <FaFilter className="filter-icon" />
        <span className="filter-count-badge">{activeFilters.length}</span>
        <span className="filter-label">Filters</span>
      </div>
      <span className="filter-results">
        Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} rows
      </span>
      <div className="filter-chips">
        {activeFilters.map(filter => (
          <div key={filter.key} className="filter-chip">
            <span className="filter-chip-label">{filter.label}</span>
            <button
              className="filter-chip-remove"
              onClick={() => onClearFilter(filter.key)}
              aria-label={`Remove ${filter.key} filter`}
              title="Remove filter"
            >
              <FaTimes />
            </button>
          </div>
        ))}
        <button className="clear-all-btn" onClick={onClearAll}>
          Clear All {activeFilters.length > 1 ? 'Filters' : 'Filter'}
        </button>
        
        {onJumpToTable && (
          <button className="jump-to-table-btn" onClick={onJumpToTable} title="Scroll to filtered results">
            <FaArrowDown /> View Results
          </button>
        )}
      </div>
    </div>
  );
}

function getActiveFilters(filters: FilterState): Array<{ key: keyof FilterState; label: string }> {
  const active: Array<{ key: keyof FilterState; label: string }> = [];

  if (filters.attackType) {
    active.push({ key: 'attackType', label: `Attack Type: ${filters.attackType}` });
  }
  if (filters.scoreRange) {
    const [min, max] = filters.scoreRange;
    active.push({ key: 'scoreRange', label: `Score: ${min.toFixed(2)} - ${max.toFixed(2)}` });
  }
  if (filters.service) {
    active.push({ key: 'service', label: `Service: ${filters.service}` });
  }
  if (filters.prediction) {
    active.push({ key: 'prediction', label: `Prediction: ${filters.prediction}` });
  }

  return active;
}

