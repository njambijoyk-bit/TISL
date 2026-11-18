import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import notificationSettingsAPI from '../../../_shared/api/notificationSettings';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const box = { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 };

/**
 * How I hear about things (docs/PROJECTS_STAGE6_SPEC.md, build 6.4): per group of notices, bell only, bell and email, or bell and WhatsApp to the
 * phone on the staff profile. "As the company sets it" follows the company's default; a group the company has locked shows what it uses and why.
 */
export default function MyChannels() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => { notificationSettingsAPI.myChannels().then(setData).catch((e) => setProblem(errMsg(e, 'Your choices could not be loaded.'))); }, []);
  if (!data) return problem ? <p role="alert" style={{ color: 'var(--status-danger, var(--text-primary))' }}>{problem}</p> : null;
  if (!data.ready) return <div style={box}>Choosing how you hear about things needs database script 262.</div>;

  const choose = async (grp, mode) => {
    setBusy(grp);
    try { setData((await notificationSettingsAPI.saveMyChannels({ [grp]: mode })).data); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(errMsg(e, 'That could not be saved.')); } finally { setBusy(''); }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }} data-my-channels>
      <div style={box}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>How I hear about things</h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Everything always shows on the bell. Choose where else each kind of notice reaches you. Email goes to {data.email || 'your email'}; WhatsApp goes to {data.phone || 'the phone on your staff profile (none yet)'}.
          {!data.whatsapp_on && ' The company does not send WhatsApp messages yet.'}
        </p>
      </div>
      {problem && <p role="alert" style={{ margin: 0, fontSize: '0.85rem' }}>{problem}</p>}
      {data.groups.map((g) => (
        <div key={g.key} style={{ ...box, display: 'grid', gap: 8 }} data-channel-group={g.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong style={{ fontSize: '0.92rem' }}>{g.label}</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Now: {data.modes[g.uses]}</span>
          </div>
          {g.types.length > 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{g.types.join(' · ')}</p>}
          {g.locked ? (
            <p style={{ margin: 0, fontSize: '0.82rem' }}>The company decides this one: {data.modes[g.company].toLowerCase()}.</p>
          ) : (
            <div role="radiogroup" aria-label={g.label} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.85rem' }}>
              {[['default', `As the company sets it (${data.modes[g.company].toLowerCase()})`], ...Object.entries(data.modes)].map(([k, label]) => {
                const off = k === 'whatsapp' && (!data.whatsapp_on || !data.phone);
                return (
                  <label key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: off ? 0.5 : 1 }}>
                    <input type="radio" name={`ch-${g.key}`} checked={(g.mine ?? 'default') === k} disabled={off || busy === g.key} onChange={() => choose(g.key, k)} /> {label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
