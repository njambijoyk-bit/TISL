import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { useProjectNames } from '../../lib/names';
import { message } from '../../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, PanelTitle } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * The trash (build 1.6): what was deleted, by whom, and how long it stays. Anything here can be taken back out. Deleting for good is offered only
 * to someone who holds that permission, and never for work the books hold vouchers for.
 */
export default function ProjectsTrash() {
  const navigate = useNavigate();
  const { t } = useProjectNames();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.trash()); setFailed(''); } catch (e) { setFailed(message(e, 'The trash could not be loaded. Try again.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (call, done) => {
    setBusy(true);
    setAsking(null);
    try { setData(await call()); toast.success(done); } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const kind = (i) => (i.type === 'project' ? t('project') : t('phase'));

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Trash" subtitle={data ? `Kept for ${data.days} days, then removed` : ''} actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      {asking && (
        <Notice status="warning" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Delete <b>{asking.label}</b> for good? This cannot be undone. What happened to it stays in the log.</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Btn small variant="danger" onClick={() => run(() => projectsAPI.purge(asking.type, asking.id), 'Deleted for good')}>Yes, delete it for good</Btn>
            <Btn small onClick={() => setAsking(null)}>Keep it</Btn>
          </span>
        </Notice>
      )}
      <Panel>
        <PanelTitle hint="Anything here can be taken back out exactly as it was.">In the trash</PanelTitle>
        {!data && !failed && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p>}
        {data && data.items.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>The trash is empty.</p>}
        {data && data.items.length > 0 && (
          <DataTable minWidth={680}>
            <thead><tr><th style={th}>What</th><th style={th}>Deleted by</th><th style={th}>Stays for</th><th style={th}><span style={{ position: 'absolute', left: -9999 }}>Actions</span></th></tr></thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={`${i.type}-${i.id}`} data-trash={i.label}>
                  <td style={td}>
                    <Chip style={{ marginRight: 8 }}>{kind(i)}</Chip><b>{i.label}</b>
                    {i.within && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>of {i.within}</div>}
                    {i.in_the_books && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>The books hold vouchers for it, so it can never be deleted for good.</div>}
                  </td>
                  <td style={td}>{i.deleted_by || 'Someone who has left'}</td>
                  <td style={td}>{i.in_the_books ? <Chip status="info">Until restored</Chip> : <Chip status={i.days_left <= 3 ? 'warning' : 'neutral'}>{i.days_left === 0 ? 'Goes tonight' : `${i.days_left} day${i.days_left === 1 ? '' : 's'}`}</Chip>}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Btn small busy={busy} aria-label={`Restore ${i.label}`} onClick={() => run(() => projectsAPI.restore(i.type, i.id), 'Restored')}>Restore</Btn>
                    {data.can.purge && !i.in_the_books && <Btn small variant="danger" busy={busy} style={{ marginLeft: 6 }} aria-label={`Delete ${i.label} for good`} onClick={() => setAsking(i)}>Delete for good</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </AdminLayout>
  );
}
