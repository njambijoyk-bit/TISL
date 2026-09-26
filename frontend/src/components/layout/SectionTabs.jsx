import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { liveTabs } from '../../navigation/adminNav';

/**
 * The tab strip above a page whose sidebar item has sub-pages (Products →
 * All products / Bulk edit, Settings → General / Currency / …). Tabs come
 * from the nav registry; group labels (Settings) show as small dividers.
 */
export default function SectionTabs({ item, activeTab }) {
  const activeRef = useRef(null);
  const tabs = liveTabs(item);

  // Keep the active tab in view when the strip scrolls sideways
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeTab?.path]);

  if (!item || item.hideTabs || tabs.length < 2) return null;

  const Icon = item.icon;

  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-primary, #fff)',
        borderBottom: '1px solid rgba(168,85,247,0.12)',
      }}
    >
      <nav
        aria-label={`${item.title} sections`}
        className="admin-section-tabs"
        style={{
          display: 'flex', alignItems: 'stretch', gap: 2,
          height: 46, padding: '0 24px 0 28px',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
          marginRight: 14, paddingRight: 16,
          borderRight: '1px solid rgba(168,85,247,0.15)',
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: item.color,
        }}>
          <Icon size={14} /> {item.title}
        </span>

        {tabs.map((tab, i) => {
          const isActive = activeTab?.path === tab.path;
          const newGroup = tab.group && tab.group !== tabs[i - 1]?.group;
          return (
            <Fragment key={tab.path}>
              {newGroup && i > 0 && (
                <span aria-hidden style={{
                  alignSelf: 'center', flexShrink: 0, margin: '0 6px 0 10px',
                  fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--color-text-disabled, var(--color-text-muted, #9ca3af))',
                }}>
                  {tab.group}
                </span>
              )}
              <Link
                ref={isActive ? activeRef : undefined}
                to={tab.path}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                  padding: '0 12px',
                  fontSize: '0.8rem', fontWeight: isActive ? 700 : 500,
                  whiteSpace: 'nowrap', textDecoration: 'none',
                  color: isActive ? item.color : 'var(--color-text-secondary, var(--color-text-muted, #6b7280))',
                  borderBottom: `2px solid ${isActive ? item.color : 'transparent'}`,
                  transition: 'color 150ms, border-color 150ms',
                }}
              >
                {tab.title}
              </Link>
            </Fragment>
          );
        })}
      </nav>
      <style>{'.admin-section-tabs::-webkit-scrollbar{display:none}@media (max-width:767px){.admin-section-tabs{padding:0 12px!important}}'}</style>
    </div>
  );
}
