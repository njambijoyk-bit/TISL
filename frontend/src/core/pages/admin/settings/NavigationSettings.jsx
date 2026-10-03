import React, { useState, useEffect, useCallback } from 'react';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import navigationAPI from '../../../../_shared/api/navigation';
import {
  Compass, CheckCircle2, XCircle, Lock, RefreshCw, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const card = {
  background: 'var(--surface-card, #fff)', borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};

/**
 * The green-tick / red-x visibility toggle. Locked (greyed) when the module is
 * switched off, matching the backend which refuses the change.
 */
function VisibilityToggle({ visible, disabled, onToggle }) {
  const color = disabled ? '#9ca3af' : visible ? '#059669' : '#dc2626';
  const bg = disabled ? 'rgba(107,114,128,0.10)' : visible ? 'rgba(5,150,105,0.10)' : 'rgba(220,38,38,0.10)';
  const Icon = visible ? CheckCircle2 : XCircle;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={disabled ? 'Switch the module on to change this' : (visible ? 'Visible to customers — click to hide' : 'Hidden — click to show')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
        border: `1.5px solid ${color}`, background: bg, color, fontSize: '0.76rem', fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.7 : 1,
      }}
    >
      {disabled ? <Lock size={14} /> : <Icon size={15} />}
      {visible ? 'Visible' : 'Hidden'}
    </button>
  );
}

export default function NavigationSettings() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await navigationAPI.getAdmin();
      setGroups(d.groups || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not load navigation.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (groupIdx, linkIdx) => {
    const group = groups[groupIdx];
    const link = group.links[linkIdx];
    if (!group.active) return;
    const next = !link.visible;

    // optimistic
    setGroups((gs) => gs.map((g, gi) => gi !== groupIdx ? g : {
      ...g, links: g.links.map((l, li) => li !== linkIdx ? l : { ...l, visible: next }),
    }));
    setSavingId(link.id);
    try {
      const res = await navigationAPI.updateLink(link.id, { visible: next });
      if (!res.ok) throw new Error(res.message);
    } catch (e) {
      // revert
      setGroups((gs) => gs.map((g, gi) => gi !== groupIdx ? g : {
        ...g, links: g.links.map((l, li) => li !== linkIdx ? l : { ...l, visible: !next }),
      }));
      toast.error(e.response?.data?.message || e.message || 'Could not save.');
    } finally { setSavingId(null); }
  };

  if (loading) {
    return <SettingsLayout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}><RefreshCw size={18} /> Loading…</div></SettingsLayout>;
  }

  return (
    <SettingsLayout>
      <div style={{ padding: '20px 4px', maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Compass size={22} color="var(--color-primary-600)" />
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Storefront navigation</h1>
        </div>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Choose which links customers see in the header. Only links for modules you've licensed appear here; a module that's switched off locks its links until you switch it back on.
        </p>

        {groups.length === 0 && (
          <div style={{ ...card, padding: 20, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No navigation links yet. Run the <code>12_nav_links.sql</code> script to seed them.
          </div>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          {groups.map((group, gi) => (
            <div key={group.module} style={{ ...card, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{group.name}</h2>
                {!group.active && group.module !== 'core' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600, color: '#b45309', background: 'rgba(217,119,6,0.12)', padding: '3px 9px', borderRadius: 999 }}>
                    <Lock size={12} /> Module switched off — links locked
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {group.links.map((link, li) => (
                  <div key={link.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-card, #fff)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <Link2 size={14} style={{ color: 'var(--color-primary-500)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{link.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{link.path}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {savingId === link.id && <RefreshCw size={13} color="#9ca3af" />}
                      <VisibilityToggle
                        visible={link.visible}
                        disabled={!group.active}
                        onToggle={() => toggle(gi, li)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SettingsLayout>
  );
}
