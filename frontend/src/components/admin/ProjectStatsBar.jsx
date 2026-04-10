import { useNavigate } from 'react-router-dom';

const StatCard = ({ label, value, sub, color, onClick }) => (
  <div
    onClick={onClick}
    style={{
      borderRadius: 16, border: '1px solid #f3f4f6', padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow 200ms, transform 200ms, border-color 200ms',
      position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)'; } }}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = '#f3f4f6'; } }}
  >
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.5 }} />
    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', margin: '4px 0 8px' }}>{label}</p>
    <p style={{ fontSize: '1.9rem', fontWeight: 800, color, margin: 0, letterSpacing: '-0.03em', lineHeight: 1 }}>
      {value ?? '—'}
    </p>
    {sub && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 6 }}>{sub}</p>}
  </div>
);

const ProjectStatsBar = ({ statistics, loading }) => {
  const navigate = useNavigate();

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 16 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 16, border: '1px solid #f3f4f6', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ height: 12, width: '60%', borderRadius: 6, background: '#f3f4f6', marginBottom: 12 }} />
          <div style={{ height: 28, width: '40%', borderRadius: 6, background: '#f3f4f6' }} />
        </div>
      ))}
    </div>
  );

  if (!statistics) return null;

  const { totals, milestones } = statistics;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 16 }}>
      <StatCard label="Total Projects"      value={totals?.all}        color="#a855f7" onClick={() => navigate('/admin/projects/list')} />
      <StatCard label="Active"              value={totals?.active}     color="#10b981" onClick={() => navigate('/admin/projects/list?status=active')} />
      <StatCard label="Completed"           value={totals?.completed}  color="#6b7280" onClick={() => navigate('/admin/projects/list?status=completed')} />
      <StatCard label="Overdue"             value={totals?.overdue}    color="#ef4444" sub="Past target date" />
      <StatCard label="Unassigned"          value={totals?.unassigned} color="#f59e0b" sub="No owner set" />
      <StatCard label="Overdue Milestones"  value={milestones?.overdue} color="#f59e0b" sub="Across all projects" />
    </div>
  );
};

export default ProjectStatsBar;