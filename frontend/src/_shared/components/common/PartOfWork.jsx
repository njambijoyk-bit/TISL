import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';

/**
 * "Part of" (docs/PROJECTS_STAGE7_SPEC.md, build 7.4): on a module's own record page, which pieces of work the record is part of, and a way to add
 * it to one. One line per page: <PartOfWork type="support.ticket" id={ticket.id} />. It shows nothing when Projects is off, when the person may not
 * use it, or when there is nothing to show and nothing they may do. Only work the person may open is listed (Projects decides).
 */
export default function PartOfWork({ type, id, style }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => {
    if (!id) return;
    try { setData((await api.get('/admin/projects/linked', { params: { type, id } })).data); } catch { setData(null); }   // Projects off or not theirs: say nothing
  }, [type, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!adding) return undefined;
    let live = true;
    const t = setTimeout(() => { api.get('/admin/projects/linked/targets', { params: { type, id, q } }).then((r) => { if (live) setFound(r.data.projects); }).catch(() => { if (live) setFound([]); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [adding, q, type, id]);
  if (!data || (data.projects.length === 0 && !data.can_add)) return null;

  const add = async (projectId) => {
    try { setData((await api.post('/admin/projects/linked', { type, id, project_id: projectId })).data); setAdding(false); setQ(''); setProblem(''); } catch (e) { setProblem(e?.response?.data?.message || 'It could not be added. Try again.'); }
  };
  const chip = { display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface-card)', color: 'var(--color-primary-600)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' };
  const plain = { background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 12.5, color: 'var(--color-primary-600)', fontWeight: 600 };

  return (
    <div data-part-of style={{ display: 'grid', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-hover)', fontSize: 13, color: 'var(--text-primary)', margin: '8px 0 12px', ...style }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{data.projects.length ? 'Part of' : 'Not part of any piece of work yet.'}</span>
        {data.projects.map((p) => <Link key={p.id} to={`/admin/projects/${p.id}?tab=links`} style={chip}>{p.number} {p.title}</Link>)}
        {data.can_add && !adding && <button type="button" style={plain} onClick={() => { setAdding(true); setFound(null); }}>Add to a piece of work</button>}
      </div>
      {adding && (
        <div style={{ display: 'grid', gap: 6 }}>
          <input aria-label="Find the piece of work" value={q} autoFocus placeholder="Its number or name" onChange={(e) => setQ(e.target.value)}
            style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line-strong, var(--line))', background: 'var(--surface-card)', color: 'var(--text-primary)', font: 'inherit' }} />
          <div role="listbox" aria-label="Pieces of work" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {found === null && <span style={{ color: 'var(--text-secondary)' }}>Looking…</span>}
            {found && found.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>No piece of work you can add it to.</span>}
            {found && found.map((p) => <button key={p.id} type="button" role="option" aria-selected="false" style={{ ...chip, cursor: 'pointer' }} onClick={() => add(p.id)}>{p.number} {p.title}</button>)}
          </div>
          <span><button type="button" style={{ ...plain, color: 'var(--text-secondary)' }} onClick={() => { setAdding(false); setQ(''); }}>Cancel</button></span>
        </div>
      )}
      {problem && <span role="alert" style={{ fontSize: 12.5 }}>{problem}</span>}
    </div>
  );
}
