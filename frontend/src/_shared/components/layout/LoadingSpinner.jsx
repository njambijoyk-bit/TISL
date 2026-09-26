import { Package } from 'lucide-react';

export default function LoadingSpinner({ size = 'md', fullScreen = false }) {
  const sizeMap = { sm: 32, md: 48, lg: 64 };
  const px = sizeMap[size];

  const spinner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* Layered ring animation */}
      <div style={{ position: 'relative', width: px, height: px }}>
        {/* Outer ring - slow */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `${px * 0.06}px solid transparent`,
          borderTopColor: 'var(--color-primary-500)',
          borderRightColor: 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
          animation: 'spin-slow 1.4s linear infinite',
        }} />
        {/* Middle ring - medium, reverse */}
        <div style={{
          position: 'absolute', inset: px * 0.15, borderRadius: '50%',
          border: `${px * 0.06}px solid transparent`,
          borderTopColor: 'var(--color-primary-600)',
          borderLeftColor: 'color-mix(in srgb, var(--color-primary-600) 30%, transparent)',
          animation: 'spin-reverse 1s linear infinite',
        }} />
        {/* Inner dot */}
        <div style={{
          position: 'absolute', inset: px * 0.35, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
          animation: 'pulse-scale 1.4s ease-in-out infinite',
          boxShadow: '0 0 12px color-mix(in srgb, var(--color-primary-500) 50%, transparent)',
        }} />
      </div>

      {/* Bouncing dots */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i === 0 ? 'var(--color-primary-400)' : i === 1 ? 'var(--color-primary-500)' : 'var(--color-primary-600)',
            animation: `bounce-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes spin-slow {
          to { transform: rotate(360deg); }
        }
        @keyframes spin-reverse {
          to { transform: rotate(-360deg); }
        }
        @keyframes pulse-scale {
          0%, 100% { transform: scale(0.85); opacity: 0.7; }
          50%       { transform: scale(1.1);  opacity: 1;   }
        }
        @keyframes bounce-dot {
          0%, 100% { transform: translateY(0);   opacity: 0.4; }
          50%       { transform: translateY(-6px); opacity: 1;   }
        }
      `}</style>
    </div>
  );

  if (fullScreen) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(4px)',
      }} className="dark:bg-gray-900/85">
        {spinner}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem 0' }}>
      {spinner}
    </div>
  );
}