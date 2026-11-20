import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Notice, Panel, PanelTitle, TextInput } from './ui';

/**
 * The opening check on a piece of work (docs/PROJECTS_STAGE11_SPEC.md, build 11.2): each question answered yes or no with a note, signed with a
 * typed name; and who else is involved, with a possible conflict marked. When the kind of work requires it, the work cannot leave its first
 * stage until it passes.
 */
export default function OpeningCheckPanel({ projectId, onChanged }) {
  const [d, setD] = useState(null);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setD(await projectsAPI.openingCheck(projectId)); } catch { setD(null); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!d?.ready || (d.questions.length === 0 && d.involved.length === 0)) return null;
  const run = async (fn, done) => { try { setD(await fn()); setProblem(''); if (done) toast.success(done); onChanged?.(); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const answer = (q, patch) => run(() => projectsAPI.answerOpeningCheck(projectId, { [q.key]: { answer: q.answer, note: q.note, ...patch } }));
  const status = d.state === 'done' ? (d.passed ? ['good', 'Passed'] : ['problem', 'Did not pass']) : ['warning', d.state === 'draft' ? 'Being answered' : 'Not done'];

  return (
    <Panel data-opening-check style={{ gridColumn: '1 / -1' }}>
      <PanelTitle hint={d.required ? 'It must pass before the work moves on from its first stage.' : 'Before the work begins.'} right={<Chip status={status[0]}>{status[1]}</Chip>}>{d.name}</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {d.questions.map((q) => (
        <div key={q.key} data-opening-question={q.key} style={{ display: 'grid', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
            <span>{q.question}{!q.must_be_yes && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> · for the record</span>}</span>
            {d.can.answer ? (
              <span style={{ display: 'flex', gap: 6 }}>
                {['yes', 'no'].map((v) => <Btn key={v} small variant={q.answer === v ? 'primary' : 'plain'} aria-pressed={q.answer === v} aria-label={`${q.question}: ${v}`} onClick={() => answer(q, { answer: v })}>{v === 'yes' ? 'Yes' : 'No'}</Btn>)}
              </span>
            ) : q.answer && <Chip status={q.answer === 'yes' ? 'good' : q.must_be_yes ? 'problem' : 'neutral'}>{q.answer === 'yes' ? 'Yes' : 'No'}</Chip>}
          </div>
          {d.can.answer ? <TextInput aria-label={`Note on: ${q.question}`} placeholder="A note (optional)" defaultValue={q.note ?? ''} onBlur={(e) => e.target.value !== (q.note ?? '') && answer(q, { note: e.target.value })} />
            : q.note && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{q.note}</span>}
        </div>
      ))}
      {d.signed && <p style={{ margin: '8px 0 0', fontSize: 13 }}>Signed by <strong>{d.signed.name}</strong> on {d.signed.at?.slice(0, 16).replace('T', ' ')}.</p>}
      {d.can.answer && d.questions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <TextInput aria-label="Type your full name to sign the check" placeholder="Type your full name to sign" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <Btn variant="primary" onClick={async () => { if (await run(() => projectsAPI.signOpeningCheck(projectId, name), 'Signed')) setName(''); }}>Sign</Btn>
        </div>
      )}
      {d.can.redo && <Btn small variant="quiet" style={{ marginTop: 8 }} onClick={() => { const why = window.prompt('Why is the check done again?'); if (why) run(() => projectsAPI.redoOpeningCheck(projectId, why), 'Started again'); }}>Do it again</Btn>}
      {d.involved.length > 0 && (
        <div data-involved style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-secondary)', marginBottom: 4 }}>Who else is involved</div>
          {d.involved.map((x) => (
            <div key={`${x.as}-${x.who}`} data-involved-who={x.who} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
              <strong>{x.who}</strong> <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>({x.as.toLowerCase()})</span>
              {x.matches.length === 0 ? <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}> · not found anywhere else</span> : (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {x.matches.map((m) => <li key={`${m.type}${m.id}`} style={{ fontSize: 12.5 }}>{m.conflict && <><Chip status="problem">Possible conflict</Chip> </>}{m.name}: {m.detail}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
