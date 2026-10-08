import { useState } from 'react';
import toast from 'react-hot-toast';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, h2, sub, chip, td, th } from './ui';

const MODES = [
  ['off', 'Off', 'Nobody is limited by branch.'],
  ['log', 'Test', 'Nothing is hidden or refused. The Activity tab lists what would have been, so you can fix branch assignments first.'],
  ['on', 'On', 'People see only their default branch and the branches they were given, and can only post there.'],
];
const modeName = (m) => MODES.find(([k]) => k === m)?.[1] ?? m;

/** Branch limits, switched on one area at a time. Test mode first; then On once the Activity tab is quiet. */
export default function LimitsTab({ data, reload }) {
  const canEdit = data.mine.can_roles;
  const sc = data.scope;
  const [busy, setBusy] = useState('');

  const set = async (area, mode, label) => {
    if (mode === 'on') {
      const a = sc.areas.find((x) => x.key === area);
      const msg = `Switch branch limits ON for ${label ?? 'every area without its own setting'}?\n\n`
        + `${sc.limited_people.length} ${sc.limited_people.length === 1 ? 'person is' : 'people are'} limited to their branches. From now on they will not see, or post to, other branches there.\n`
        + (a && a.events > 0 ? `In the last 7 days test mode would have hidden ${a.hidden} records and refused ${a.refused} posts (${a.people} ${a.people === 1 ? 'person' : 'people'}).\n` : '')
        + '\nYou can switch it back at any time.';
      if (!window.confirm(msg)) return;
    }
    setBusy(area);
    try { await accessAPI.setScopeMode(area, mode); toast.success('Saved'); reload(); } catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setBusy(''); }
  };

  const Control = ({ area, current, label, own }) => (
    <div>
      <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', borderRadius: 9, overflow: 'hidden', border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
        {MODES.map(([k, text]) => (
          <button
            key={k} type="button" role="radio" aria-checked={current === k} disabled={!canEdit || busy === area}
            onClick={() => current !== k && set(area, k, label)}
            style={{ padding: '7px 16px', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit', border: 'none', cursor: canEdit ? 'pointer' : 'default',
              background: current === k ? (k === 'on' ? '#16a34a' : k === 'log' ? '#d97706' : 'var(--color-primary-500)') : 'transparent', color: current === k ? 'white' : 'var(--text-secondary)' }}
          >{text}</button>
        ))}
      </div>
      {own && area !== 'default' && canEdit && (
        <button type="button" disabled={busy === area} onClick={() => accessAPI.setScopeMode(area, 'default').then(() => { toast.success('Saved'); reload(); }).catch((e) => toast.error(errMsg(e, 'Could not save')))}
          style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-600)', fontSize: '0.75rem', fontWeight: 700 }}>Follow the default</button>
      )}
    </div>
  );

  if (!sc.ready) {
    return <div style={card}><h2 style={h2}>Branch limits</h2><p style={sub}>Run <code>database/sql/99_access_scope_settings.sql</code> in MySQL to be able to change these here. Until then the server setting applies (test mode).</p></div>;
  }

  return (
    <>
      <div style={card}>
        <h2 style={h2}>Branch limits</h2>
        <p style={sub}>
          A person limited to branches sees only their <strong>default branch</strong> and the branches they were given, in the area you switch on, and can only post there.
          Admin, super admin and the senior accountant are never limited; neither are customers and vendors. Records that belong to no branch stay visible to everyone.
          {!sc.unassigned_sees_all ? ' Staff with no branch set see nothing.' : ' Staff with no branch set still see every branch until you give them one.'}
        </p>
        <p style={{ ...sub, margin: 0 }}>Start in <strong>Test</strong>, look at the Activity tab for a week, fix who has which branch, then switch an area <strong>On</strong>.</p>
        {!canEdit && <p style={{ ...sub, marginTop: 10 }}>Only the owner can change these.</p>}
      </div>

      <div style={card}>
        <h2 style={h2}>Areas</h2>
        <p style={sub}>Each area can be switched on separately.</p>
        {sc.areas.map((a) => (
          <div key={a.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto', gap: 12, alignItems: 'start', padding: '12px 0', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{a.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                {a.own ? `Set to ${modeName(a.mode)}.` : `Following the default (${modeName(a.mode)}).`} {MODES.find(([k]) => k === a.mode)?.[2]}
              </div>
              {a.mode === 'log' && (
                <div style={{ marginTop: 6 }}>
                  {a.events === 0
                    ? <span style={{ ...chip('#16a34a') }}>Quiet: nothing would have been hidden or refused in the last 7 days</span>
                    : <span style={{ ...chip('#d97706') }}>Last 7 days: {a.hidden} records would have been hidden, {a.refused} posts refused ({a.people} {a.people === 1 ? 'person' : 'people'})</span>}
                </div>
              )}
            </div>
            <Control area={a.key} current={a.mode} label={a.label} own={a.own} />
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)' }}>
          <div><div style={{ fontWeight: 700, fontSize: '0.88rem' }}>The default</div><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 3 }}>Used by every area that has no setting of its own, and by checks that name a branch elsewhere.</div></div>
          <Control area="default" current={sc.default} label="the default" own />
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Who is limited</h2>
        <p style={sub}>Staff who are not admin, super admin or senior accountant and have a default branch or branch access.</p>
        {sc.limited_people.length === 0 ? <p style={sub}>No one yet. Give people a default branch on the People tab.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Person</th><th style={th}>Branches</th></tr></thead>
              <tbody>
                {sc.limited_people.map((p) => (
                  <tr key={p.id}>
                    <td style={td}><strong>{p.name}</strong> <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{p.role.replace(/_/g, ' ')}</span></td>
                    <td style={td}><span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>{p.branches.length ? p.branches.map((b) => <span key={b} style={chip()}>{b}</span>) : <span style={{ color: 'var(--text-tertiary)' }}>No branch</span>}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
