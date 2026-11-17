import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { message } from '../../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, SelectInput, TextInput } from '../../components/ui';
import { check, td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * The directory (docs/PROJECTS_STAGE3_SPEC.md, build 3.6): yellow pages (organisations by trade) and white pages (people by name), over
 * clients, contacts, other parties, vendors and staff. Phone numbers and emails are masked until revealed, and each reveal is logged.
 * Each entry says who may see it: staff only, clients who share work with it, or public.
 */
const LEVEL = { staff: ['Staff only', 'neutral'], clients: ['Clients on shared work', 'info'], public: ['Public', 'good'] };

export default function ProjectsDirectory() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState({ book: 'yellow', trade: '', q: '', page: 1 });
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [shown, setShown] = useState({});   // type:id => { phone, email } once revealed
  const [editing, setEditing] = useState(null);   // the entry whose trades are being set
  const [trades, setTrades] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await projectsAPI.directory(filter); setData(d); setFailed(''); if (d.book !== filter.book) setFilter((f) => ({ ...f, book: d.book })); }
    catch (e) { setFailed(message(e, 'The directory could not be loaded. Try again.')); }
  }, [filter]);
  useEffect(() => { const id = setTimeout(load, filter.q ? 250 : 0); return () => clearTimeout(id); }, [load, filter.q]);
  const pick = (patch) => setFilter({ ...filter, ...patch, page: 1 });
  const key = (e) => `${e.type}:${e.id}`;
  const reveal = async (e) => {
    try { setShown({ ...shown, [key(e)]: await projectsAPI.revealDirectory(e.type, e.id) }); } catch (err) { toast.error(message(err, 'That could not be shown.')); }
  };
  const change = async (e, d, done) => {
    setBusy(true);
    try { await projectsAPI.changeDirectory(e.type, e.id, d); toast.success(done); setEditing(null); await load(); } catch (err) { toast.error(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };
  const exportIt = async () => {
    setBusy(true);
    try {
      const blob = await projectsAPI.exportDirectory(filter.book);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `directory-${filter.book}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(message(e, 'The export could not be made. Try again.')); } finally { setBusy(false); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;
  const can = data?.can || {};

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Directory" subtitle="Find anyone you work with" actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => navigate('/admin/projects')}>Close</Btn>
          {can.export && <Btn data-hotkey="F9" busy={busy} onClick={exportIt}>Export</Btn>}
        </div>
      )} />
      {data && !data.ready && <Notice status="warning" style={{ marginBottom: 16 }}>The directory needs database script 259.</Notice>}
      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div role="group" aria-label="Which pages" style={{ display: 'inline-flex', gap: 4 }}>
          {can.yellow && <Btn small variant={filter.book === 'yellow' ? 'primary' : 'plain'} aria-pressed={filter.book === 'yellow'} onClick={() => pick({ book: 'yellow', trade: '' })}>Yellow pages</Btn>}
          {can.white && <Btn small variant={filter.book === 'white' ? 'primary' : 'plain'} aria-pressed={filter.book === 'white'} onClick={() => pick({ book: 'white', trade: '' })}>White pages</Btn>}
        </div>
        <TextInput type="search" aria-label="Search the directory" placeholder={filter.book === 'yellow' ? 'Search an organisation' : 'Search a name'} value={filter.q} onChange={(e) => pick({ q: e.target.value })} style={{ flex: '1 1 220px', maxWidth: 320 }} />
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: filter.book === 'yellow' ? 'minmax(170px, 220px) 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
          {filter.book === 'yellow' && (
            <nav aria-label="Trades" style={{ display: 'grid', gap: 2 }}>
              {[{ key: '', name: 'Every trade', count: null }, ...data.trades, { key: 'none', name: 'No trade yet', count: data.no_trade }].map((t) => (
                <button key={t.key || 'all'} type="button" aria-pressed={filter.trade === t.key} onClick={() => pick({ trade: t.key })}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600,
                    background: filter.trade === t.key ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent', color: filter.trade === t.key ? 'var(--color-primary-500)' : 'var(--text-secondary)' }}>
                  <span>{t.name}</span>{t.count !== null && <span>{t.count}</span>}
                </button>
              ))}
            </nav>
          )}
          <Panel style={{ minWidth: 0 }}>
            {data.entries.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>{filter.q ? 'No one matches that.' : 'No one here yet.'}</p>}
            {data.entries.length > 0 && (
              <DataTable minWidth={820}>
                <thead><tr><th style={th}>Name</th><th style={th}>Is</th><th style={th}>Phone and email</th><th style={th}>Worked with on</th><th style={th}>Who can see</th></tr></thead>
                <tbody>
                  {data.entries.map((e) => {
                    const s = shown[key(e)];
                    return (
                      <tr key={key(e)} data-entry={e.name}>
                        <td style={td}>
                          {e.url ? <Link to={e.url} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{e.name}</Link> : <strong>{e.name}</strong>}
                          {(e.job_title || e.works_for) && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{[e.job_title, e.works_for].filter(Boolean).join(', ')}</span>}
                          {filter.book === 'yellow' && (
                            editing === key(e)
                              ? (
                                <form onSubmit={(ev) => { ev.preventDefault(); change(e, { trades }, 'Trades saved'); }} style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {data.trades.filter((t) => t.is_active).map((t) => <label key={t.key} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" style={check} checked={trades.includes(t.key)} onChange={(x) => setTrades(x.target.checked ? [...trades, t.key] : trades.filter((k) => k !== t.key))} />{t.name}</label>)}
                                  </div>
                                  <span style={{ display: 'flex', gap: 6 }}><Btn type="submit" small variant="primary" busy={busy}>Save trades</Btn><Btn small onClick={() => setEditing(null)}>Cancel</Btn></span>
                                </form>
                              )
                              : <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                                {e.trades.map((t) => <Chip key={t.key}>{t.name}</Chip>)}
                                {can.manage && <Btn small variant="quiet" aria-label={`Set the trades of ${e.name}`} onClick={() => { setEditing(key(e)); setTrades(e.trades.map((t) => t.key)); }}>{e.trades.length ? 'Change' : 'Set trades'}</Btn>}
                              </span>
                          )}
                        </td>
                        <td style={td}><Chip>{e.is}</Chip></td>
                        <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                          {s ? <>{s.phone && <span style={{ display: 'block' }}>{s.phone}</span>}{s.email && <span style={{ display: 'block' }}>{s.email}</span>}</>
                            : <>{e.phone && <span style={{ display: 'block' }}>{e.phone}</span>}{e.email && <span style={{ display: 'block' }}>{e.email}</span>}{!e.phone && !e.email && <span style={{ color: 'var(--text-secondary)' }}>None given</span>}</>}
                          {!s && can.reveal && (e.has_phone || e.has_email) && <Btn small style={{ marginTop: 4 }} aria-label={`Show the details of ${e.name}`} onClick={() => reveal(e)}>Show</Btn>}
                        </td>
                        <td style={td}>{e.work ? `${e.work} ${e.work === 1 ? 'piece' : 'pieces'} of work` : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                        <td style={td}>
                          {can.visibility
                            ? <SelectInput aria-label={`Who can see ${e.name}`} value={e.visibility} disabled={busy} onChange={(x) => change(e, { visibility: x.target.value }, 'Saved')} style={{ width: 'auto' }}>
                              {data.levels.filter((l) => l !== 'public' || can.publish || e.visibility === 'public').map((l) => <option key={l} value={l}>{LEVEL[l][0]}</option>)}
                              {!data.levels.includes(e.visibility) && <option value={e.visibility} disabled>{LEVEL[e.visibility][0]} (switched off)</option>}
                            </SelectInput>
                            : <Chip status={LEVEL[e.visibility][1]}>{LEVEL[e.visibility][0]}</Chip>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
            {can.reveal && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>Each time details are shown it is written to the activity log.</p>}
            {pages > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, fontSize: 13 }}>
                <Btn small disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Previous</Btn>
                <span>Page {filter.page} of {pages}</span>
                <Btn small disabled={filter.page >= pages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Btn>
              </div>
            )}
          </Panel>
        </div>
      )}
    </AdminLayout>
  );
}
