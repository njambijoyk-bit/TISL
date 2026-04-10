import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Eye, Trash2, UserX } from 'lucide-react';
import ProjectStatusBadge from '../admin/ProjectStatusBadge';
import ProjectPriorityBadge from '../admin/ProjectPriorityBadge';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isOverdue = (dateStr, status) => {
  if (!dateStr || ['completed', 'cancelled'].includes(status)) return false;
  return new Date(dateStr) < new Date();
};

const thStyle = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  borderBottom: '1px solid #c084fc', whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px', fontSize: '0.82rem', color: '#374151',
  borderBottom: '1px solid #f9fafb', verticalAlign: 'middle',
};

const SkeletonRow = () => (
  <tr>
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} style={tdStyle}>
        <div style={{ height: 14, borderRadius: 6, background: '#f3f4f6', width: i === 0 ? '70%' : '50%' }} />
      </td>
    ))}
  </tr>
);

const ProjectTable = ({ projects, loading, onDelete }) => {
  const navigate = useNavigate();

  return (
    <div style={{ borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Project</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Owner</th>
              <th style={thStyle}>Target Date</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '48px 16px', color: '#9ca3af' }}>
                  No projects found.
                </td>
              </tr>
            ) : (
              projects.map(project => {
                const overdue = isOverdue(project.target_end_date, project.status);
                return (
                  <tr key={project.id}
                    onClick={() => navigate(`/admin/projects/${project.id}`)}
                    style={{ cursor: 'pointer', transition: 'background 150ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Title + number */}
                    <td style={tdStyle}>
                      <p style={{ fontWeight: 700, color: '#c084fc', margin: 0, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.title}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>
                        {project.project_number}
                      </p>
                    </td>

                    {/* Customer */}
                    <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {`${project.customer?.first_name || ''} ${project.customer?.last_name || ''}`.trim() || '—'}
                    </td>

                    {/* Status */}
                    <td style={tdStyle}><ProjectStatusBadge status={project.status} /></td>

                    {/* Priority */}
                    <td style={tdStyle}><ProjectPriorityBadge priority={project.priority} showDot={false} /></td>

                    {/* Owner */}
                    <td style={{ ...tdStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.owner_admin?.name || (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                          <UserX size={12} /> Unassigned
                        </span>
                      )}
                    </td>

                    {/* Target date */}
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: overdue ? '#ef4444' : '#374151', fontWeight: overdue ? 700 : 400 }}>
                        {overdue && <AlertTriangle size={12} color="#ef4444" />}
                        {formatDate(project.target_end_date)}
                      </span>
                      {overdue && <p style={{ fontSize: '0.68rem', color: '#ef4444', margin: '2px 0 0', fontWeight: 600 }}>Overdue</p>}
                    </td>

                    {/* Actions */}
                    <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => navigate(`/admin/projects/${project.id}`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.3)', color: '#a855f7', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(168,85,247,0.05)', transition: 'all 150ms' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.05)'; }}
                        >
                          <Eye size={12} /> View
                        </button>
                        {onDelete && (
                          <button
                            onClick={() => onDelete(project)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1.5px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.05)', transition: 'all 150ms' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectTable;