import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * The record of what happened (docs/PROJECTS_STAGE1_SPEC.md, build 1.6): every action and every refusal, newest first, with the old and new
 * values of a change. It only reads: nothing in the application changes or removes a line. `fetch(params)` gets a page; `showProject` adds the
 * column that says which piece of work a line is about (the module-wide log).
 */
const at = (d) => (d ? new Date(String(d).replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const show = (v) => (v === null || v === undefined || v === '' ? 'nothing' : v === true ? 'yes' : v === false ? 'no' : Array.isArray(v) ? v.join(', ') : String(v));
const label = (k) => { const s = String(k).replace(/_id$/, '').replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

function Changes({ oldValues, newValues }) {
  const keys = [...new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})])];
  if (!keys.length) return null;
  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
      {keys.map((k) => (
        <div key={k}>
          {label(k)}: {oldValues && k in oldValues ? <><s>{show(oldValues[k])}</s> → </> : null}{newValues && k in newValues ? <span style={{ color: 'var(--text-primary)' }}>{show(newValues[k])}</span> : 'removed'}
        </div>
      ))}
    </div>
  );
}

export default function ActivityPanel({ fetch, showProject = false, title = 'Activity', hint, describe = (w) => w }) {
  const [filters, setFilters] = useState({ result: '', q: '', page: 1 });
  const [typed, setTyped] = useState('');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    try { setData(await fetch({ ...filters, result: filters.result || undefined, per_page: 50 })); setFailed(''); } catch (e) { setFailed(message(e, 'The log could not be loaded. Try again.')); }
  }, [fetch, filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.q === typed ? f : { ...f, q: typed, page: 1 })), 300);
    return () => clearTimeout(id);
  }, [typed]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <Panel>
      <PanelTitle hint={hint || 'Everything that was done, and everything that was refused. Lines are only ever added.'}>{title}</PanelTitle>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label htmlFor="log-result" style={{ position: 'absolute', left: -9999 }}>Show</label>
        <SelectInput id="log-result" value={filters.result} onChange={(e) => setFilters({ ...filters, result: e.target.value, page: 1 })} style={{ width: 'auto', minWidth: 170 }}>
          <option value="">Done and refused</option><option value="done">Only what was done</option><option value="refused">Only what was refused</option>
        </SelectInput>
        <label htmlFor="log-search" style={{ position: 'absolute', left: -9999 }}>Search the log</label>
        <TextInput id="log-search" type="search" placeholder="Search by person, action or reason" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ flex: '1 1 220px', maxWidth: 340 }} />
      </div>
      {failed && <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      {data && data.data.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing matches.</p>}
      {data && data.data.length > 0 && (
        <DataTable minWidth={showProject ? 760 : 620}>
          <thead><tr><th style={th}>When</th><th style={th}>Who</th><th style={th}>What</th>{showProject && <th style={th}>On</th>}<th style={th}>Result</th></tr></thead>
          <tbody>
            {data.data.map((r) => (
              <tr key={r.id} data-log={r.action}>
                <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{at(r.at)}</td>
                <td style={{ ...td, verticalAlign: 'top' }}>{r.actor}</td>
                <td style={{ ...td, verticalAlign: 'top' }}>{r.result === 'refused' ? 'Tried: ' : ''}{describe(r.what)}<Changes oldValues={r.old} newValues={r.new} /></td>
                {showProject && <td style={{ ...td, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{r.project_id && r.project_number ? <Link to={`/admin/projects/${r.project_id}`} style={{ color: 'var(--color-primary-500)', textDecoration: 'none' }}>{r.project_number}</Link> : '—'}</td>}
                <td style={{ ...td, verticalAlign: 'top' }}>
                  <Chip status={r.result === 'refused' ? 'warning' : 'good'}>{r.result === 'refused' ? 'Refused' : 'Done'}</Chip>
                  {r.reason && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>{r.reason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {data && pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Page {data.page} of {pages} · {data.total} lines</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small disabled={data.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</Btn>
            <Btn small disabled={data.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}
