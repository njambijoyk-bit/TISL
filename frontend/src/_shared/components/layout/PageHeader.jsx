export default function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              marginTop: 6,
              marginBottom: 0,
              fontSize: 14,
              color: 'rgba(168,85,247,0.7)',
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            {actions}
          </div>
        )}
      </div>

      {children && (
        <div style={{ marginTop: 24 }}>
          {children}
        </div>
      )}
    </div>
  );
}