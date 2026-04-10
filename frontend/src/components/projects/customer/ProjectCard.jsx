import { useNavigate } from 'react-router-dom';
import { Calendar, AlertTriangle } from 'lucide-react';
import ProjectStatusBadge from '../../admin/ProjectStatusBadge';
import ProjectPriorityBadge from '../../admin/ProjectPriorityBadge';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isOverdue = (dateStr, status) => {
  if (!dateStr || ['completed', 'cancelled'].includes(status)) return false;
  return new Date(dateStr) < new Date();
};

const ProjectCard = ({ project }) => {
  const navigate = useNavigate();
  const overdue  = isOverdue(project.target_end_date, project.status);

  return (
    <div
      onClick={() => navigate(`/my-projects/${project.id}`)}
      style={{
        borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)',
        padding: '20px 24px', cursor: 'pointer', overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'box-shadow 200ms, transform 200ms, border-color 200ms',
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(168,85,247,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; }}
    >
      {/* Status accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#a855f7', opacity: 0.5 }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10, marginTop: 4 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#a855f7', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.title}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>{project.project_number}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      {/* Description */}
      {project.description && (
        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {project.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(168,85,247,0.1)' }}>
        <ProjectPriorityBadge priority={project.priority} showDot />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.75rem' }}>
          {project.target_end_date && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: overdue ? '#ef4444' : '#9ca3af', fontWeight: overdue ? 700 : 400 }}>
              {overdue
                ? <AlertTriangle size={12} color="#ef4444" />
                : <Calendar size={12} color="#9ca3af" />}
              {overdue && 'Overdue · '}
              {formatDate(project.target_end_date)}
            </span>
          )}
          {project._permissions?.role && (
            <span style={{ color: '#9ca3af', textTransform: 'capitalize' }}>
              {project._permissions.role.replace('customer_', '')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;