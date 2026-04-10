import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '',           label: 'All Statuses' },
  { value: 'planning',   label: 'Planning'     },
  { value: 'active',     label: 'Active'       },
  { value: 'on_hold',    label: 'On Hold'      },
  { value: 'completed',  label: 'Completed'    },
  { value: 'cancelled',  label: 'Cancelled'    },
];

const PRIORITY_OPTIONS = [
  { value: '',        label: 'All Priorities' },
  { value: 'urgent',  label: 'Urgent'         },
  { value: 'high',    label: 'High'           },
  { value: 'medium',  label: 'Medium'         },
  { value: 'low',     label: 'Low'            },
];

const selectStyle = {
  padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb',
  fontSize: '0.82rem', outline: 'none', color: '#374151',
  cursor: 'pointer', fontWeight: 500,
};

const ProjectFilters = ({ filters, onFilterChange, onSearch, loading }) => {
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(filters.search || '');

  useEffect(() => {
    const status   = searchParams.get('status')   || '';
    const priority = searchParams.get('priority') || '';
    if (status || priority) onFilterChange({ status, priority });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) onSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSelect = (key, value) => onFilterChange({ [key]: value, page: 1 });

  const hasActiveFilters =
    filters.status || filters.priority || filters.search ||
    filters.customer_id || filters.owner_admin_id;

  return (
    <div style={{ borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>

        {/* Search */}
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search by title or project number…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ width: '100%', padding: '9px 36px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none', color: '#111827', boxSizing: 'border-box', fontWeight: 500 }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); onSearch(''); }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status */}
        <select
          value={filters.status}
          onChange={e => handleSelect('status', e.target.value)}
          style={selectStyle}
          onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Priority */}
        <select
          value={filters.priority}
          onChange={e => handleSelect('priority', e.target.value)}
          style={selectStyle}
          onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Clear */}
        {hasActiveFilters && (
          <button type="button"
            onClick={() => { setSearchInput(''); onFilterChange({ status: '', priority: '', search: '', customer_id: '', owner_admin_id: '', page: 1 }); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1.5px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.04)' }}>
            <X size={13} /> Clear
          </button>
        )}

        {/* Loading spinner */}
        {loading && (
          <RefreshCw size={15} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
        )}
      </div>
    </div>
  );
};

export default ProjectFilters;