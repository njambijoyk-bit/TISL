import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import { SelectInput } from '../../../components/admin/ui/Form';
import departmentsAPI from '../../../../_shared/api/departments';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const SENS = { work: 'Work', personal: 'Personal', full: 'Full' };
const STATUS = { active: 'Active', probation: 'Probation', on_leave: 'On leave', suspended: 'Suspended', terminated: 'Left' };
const box = { ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 };
const h2 = { margin: 0, fontSize: '0.95rem', fontWeight: 700 };
const muted = { fontSize: '0.78rem', color: colors.textMuted };
const money = (n, c) => `${c ? `${c} ` : ''}${Number(n ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

/**
 * A department's page (HR stage 1b, docs/HR_STAGE1B_SPEC.md): its branch, leads and people; its cost centre and what it spent (from Books, with
 * books.view), its projects included; the work it owns. HR or the head moves people in and out here.
 */
export default function DepartmentPage() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState('');
  const [moveIn, setMoveIn] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => departmentsAPI.page(id).then(setD).catch((e) => setProblem(errMsg(e, 'This department could not be loaded.'))), [id]);
  useEffect(() => { load(); }, [load]);
  const move = async (employeeId, to) => {
    setBusy(true);
    try { setD(await departmentsAPI.movePerson(id, employeeId, to)); setMoveIn(''); toast.success('Moved'); } catch (e) { toast.error(errMsg(e, 'That move could not be made.')); }
    setBusy(false);
  };
  if (!d) return <AdminLayout><div style={{ padding: 32 }}>{problem || 'Loading…'}</div></AdminLayout>;
  const { department: dep } = d;

  return (
    <AdminLayout>
      <div data-department-page style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p style={{ ...muted, margin: 0 }}><Link to="/admin/settings/departments">Departments</Link> · {dep.branch}</p>
          <h1 style={{ margin: '4px 0 0', fontSize: '1.5rem', fontWeight: 800 }}>{dep.name}{!dep.is_active && <span style={{ ...muted, marginLeft: 8 }}>switched off</span>}</h1>
          {dep.cost_centre && <p style={{ ...muted, margin: '4px 0 0' }} data-department-cc>Cost centre: {dep.cost_centre.path}{dep.cost_centre.code ? ` (${dep.cost_centre.code})` : ''}</p>}
        </div>
        {d.needs_full_lead && <p role="alert" style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center', color: colors.danger, fontSize: '0.84rem', fontWeight: 600 }}><AlertTriangle size={14} /> This department needs a lead with full sensitivity.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <section style={box} data-department-leads>
            <h2 style={h2}>Leads</h2>
            {d.leads.length === 0 ? <p style={muted}>No leads yet.</p> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.leads.map((l) => <li key={l.employee_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.86rem' }}><span><strong>{l.name}</strong> · {l.role === 'head' ? 'Head' : 'Assistant'}</span><span style={muted}>{SENS[l.sensitivity]}</span></li>)}
              </ul>
            )}
            {d.can.leads && <Link to="/admin/settings/departments" style={{ fontSize: '0.8rem' }}>Change leads on the Departments page</Link>}
          </section>

          {d.spend && (
            <section style={box} data-department-spend>
              <h2 style={h2}>Spend</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.86rem', fontVariantNumeric: 'tabular-nums' }}>
                <span style={muted}>This month</span><strong style={{ textAlign: 'right' }}>{money(d.spend.month.spent, d.spend.currency)}</strong>
                <span style={muted}>This year</span><strong style={{ textAlign: 'right' }}>{money(d.spend.year.spent, d.spend.currency)}</strong>
                {(d.spend.year.income ?? 0) !== 0 && (<><span style={muted}>Income this year</span><span style={{ textAlign: 'right' }}>{money(d.spend.year.income, d.spend.currency)}</span></>)}
              </div>
              <p style={{ ...muted, margin: 0 }}>From Books, on its cost centre and the {d.spend.cost_centres - 1} under it (its projects included).</p>
            </section>
          )}

          {d.projects.length > 0 && (
            <section style={box} data-department-projects>
              <h2 style={h2}>Work it owns</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.84rem' }}>
                {d.projects.map((p) => <li key={p.id}><Link to={`/admin/projects/${p.id}`}>{p.number}</Link> {p.title}{p.lead ? '' : <span style={muted}> · shared</span>}{p.state === 'on_hold' && <span style={muted}> · on hold</span>}</li>)}
              </ul>
            </section>
          )}
        </div>

        <section style={box} data-department-people>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={h2}>People ({d.people.length})</h2>
            {d.can.move && d.others.length > 0 && (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <SelectInput aria-label="Move someone in" value={moveIn} style={{ width: 'auto' }} onChange={(e) => setMoveIn(e.target.value)}>
                  <option value="">Move someone in…</option>
                  {d.others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </SelectInput>
                <button type="button" style={btnPrimary} disabled={busy || !moveIn} onClick={() => move(Number(moveIn), dep.id)}>Move in</button>
              </span>
            )}
          </div>
          {d.people.length === 0 ? <p style={muted}>Nobody works here yet.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: '0.84rem' }}>
                <thead><tr>{['Name', 'Job', 'Status', 'Reports to', ''].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted }}>{h}</th>)}</tr></thead>
                <tbody>
                  {d.people.map((p) => (
                    <tr key={p.id} data-department-person={p.name} style={{ borderTop: `1px solid ${colors.border ?? 'var(--line)'}` }}>
                      <td style={{ padding: '7px 8px' }}><Link to={`/admin/employees/${p.id}`}>{p.name}</Link>{p.lead && <span style={{ ...muted, marginLeft: 6 }}>{p.lead === 'head' ? 'Head' : 'Assistant'}</span>}</td>
                      <td style={{ padding: '7px 8px' }}>{p.job_title}</td>
                      <td style={{ padding: '7px 8px' }}>{STATUS[p.status] ?? p.status}</td>
                      <td style={{ padding: '7px 8px' }}>{p.manager ?? '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                        {d.can.move && d.departments.length > 0 && (
                          <SelectInput aria-label={`Move ${p.name} to`} value="" style={{ width: 'auto' }} disabled={busy} onChange={(e) => e.target.value && move(p.id, Number(e.target.value))}>
                            <option value="">Move to…</option>
                            {d.departments.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                          </SelectInput>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {!d.can.money && <p style={{ ...muted, margin: 0 }}>Spend shows to those who may see the books.</p>}
        <button type="button" style={{ ...btnGhost, alignSelf: 'flex-start' }} onClick={load}>Refresh</button>
      </div>
    </AdminLayout>
  );
}
