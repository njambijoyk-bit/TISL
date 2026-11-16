import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { useProjectNames } from '../../lib/names';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, Tabs, TextInput } from '../../components/ui';
import { check, td, th } from '../../components/uiTokens';
import ProjectRolesPanel from '../../components/ProjectRolesPanel';
import ShapePanel from '../../components/ShapePanel';
import ShortcutsPanel from '../../components/ShortcutsPanel';
import AccessSettingsPanel from '../../components/AccessSettingsPanel';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * Projects configuration (docs/PROJECTS_STAGE1_SPEC.md, build 1.2): the company's default industry, what things are called, each person's own
 * naming, and the history of the settings with roll back. More tabs arrive with later builds (types and stages, fields, project roles).
 * What a person may change comes from the server (`can`); a part they may not use is not drawn at all.
 */
const GROUPS = { common: 'Common', niche: 'Specialist', basic: 'Basic' };
const message = (e, fallback) => e?.response?.data?.message || fallback;
const when = (d) => (d ? new Date(d.replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function IndustryOptions({ industries, activeOnly = true }) {
  return Object.entries(GROUPS).map(([group, label]) => {
    const list = industries.filter((i) => i.group === group && (!activeOnly || i.is_active));
    return list.length ? (
      <optgroup key={group} label={label}>
        {list.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
      </optgroup>
    ) : null;
  });
}

function NameRow({ term, canEdit, onSave, onReset }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(term.name);
  const [plural, setPlural] = useState(term.plural);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(term.name); setPlural(term.plural); setEditing(false); }, [term.name, term.plural, term.key]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onSave(term.key, name, plural);
    setBusy(false);
    if (ok) setEditing(false);
  };

  return (
    <tr>
      <td style={td}>
        <div style={{ fontWeight: 600 }}>{term.shipped_name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{term.description}</div>
      </td>
      <td style={td}>
        {editing ? (
          <form onSubmit={save} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="One" htmlFor={`term-${term.key}-name`} style={{ flex: '1 1 140px' }}>
              <TextInput id={`term-${term.key}-name`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus required />
            </Field>
            <Field label="Several" htmlFor={`term-${term.key}-plural`} style={{ flex: '1 1 140px' }}>
              <TextInput id={`term-${term.key}-plural`} value={plural} maxLength={80} onChange={(e) => setPlural(e.target.value)} required />
            </Field>
            <Btn type="submit" variant="primary" small busy={busy}>Save name</Btn>
            <Btn small onClick={() => { setEditing(false); setName(term.name); setPlural(term.plural); }}>Cancel</Btn>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span><b>{term.name}</b> <span style={{ color: 'var(--text-secondary)' }}>/ {term.plural}</span></span>
            {term.changed && <Chip status="brand">Changed by you</Chip>}
          </div>
        )}
      </td>
      {canEdit && (
        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {!editing && <Btn small variant="quiet" onClick={() => setEditing(true)} aria-label={`Rename ${term.shipped_name}`}>Rename</Btn>}
          {!editing && term.changed && <Btn small variant="quiet" onClick={() => onReset(term.key)} aria-label={`Put ${term.shipped_name} back`}>Put back</Btn>}
        </td>
      )}
    </tr>
  );
}

export default function ProjectConfiguration() {
  const navigate = useNavigate();
  const { t, apply: applyNames, reload: reloadNames } = useProjectNames();
  const [tab, setTab] = useState('names');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const [general, setGeneral] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async (industry) => {
    try {
      const d = await projectsAPI.configuration(industry);
      setData(d);
      setGeneral(d.general);
      setFailed('');
    } catch (e) {
      setFailed(message(e, 'The configuration could not be loaded. Check your connection and try again.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === 'history' && history === null) {
      projectsAPI.configurationHistory().then((r) => setHistory(r.versions)).catch(() => setHistory([]));
    }
  }, [tab, history]);

  const saveGeneral = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await projectsAPI.saveGeneral(data.can.industry ? general : { project_may_use_other_industry: general.project_may_use_other_industry, trash_days: general.trash_days });
      toast.success(r.changed.length ? 'Saved' : 'Nothing was changed');
      setHistory(null);
      await Promise.all([load(r.changed.includes('default_industry') ? r.value.default_industry : data.viewing), reloadNames()]);
    } catch (err) {
      toast.error(message(err, 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (term, name, plural) => {
    try {
      await projectsAPI.renameTerm(data.viewing, term, name, plural);
      toast.success('Name saved');
      await Promise.all([load(data.viewing), reloadNames()]);
      return true;
    } catch (err) {
      toast.error(message(err, 'Could not save the name. Try again.'));
      return false;
    }
  };

  const reset = async (term) => {
    try {
      await projectsAPI.resetTerm(data.viewing, term);
      toast.success('Name put back');
      await Promise.all([load(data.viewing), reloadNames()]);
    } catch (err) {
      toast.error(message(err, 'Could not put the name back. Try again.'));
    }
  };

  const toggleIndustry = async (industry) => {
    try {
      await projectsAPI.setIndustryActive(industry.key, !industry.is_active);
      toast.success(industry.is_active ? `${industry.name} switched off` : `${industry.name} switched on`);
      await load(data.viewing);
    } catch (err) {
      toast.error(message(err, 'Could not change that industry. Try again.'));
    }
  };

  const setMyNaming = async (industry) => {
    try {
      applyNames(await projectsAPI.setMyNaming(industry || null));
      toast.success(industry ? 'Your screens now use these names' : 'Your screens use the company names again');
      await load(data.viewing);
    } catch (err) {
      toast.error(message(err, 'Could not change your names. Try again.'));
    }
  };

  const rollback = async (version) => {
    setBusy(true);
    try {
      await projectsAPI.rollbackConfiguration(version);
      toast.success(`Version ${version} brought back`);
      setHistory(null);
      await Promise.all([load(), reloadNames()]);
    } catch (err) {
      toast.error(message(err, 'Could not bring that version back. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const industryName = (key) => data?.industries.find((i) => i.key === key)?.name || key;
  const tabs = [{ key: 'names', label: 'Industry and names' }, { key: 'industries', label: 'Industries' }, { key: 'stages', label: 'Kinds of work and stages' }, { key: 'fields', label: 'Fields' }, { key: 'roles', label: 'Project roles' }, { key: 'access', label: 'Access' }, { key: 'shortcuts', label: 'Shortcuts' }, { key: 'history', label: 'History and roll back' }];

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader
        title={`${t('project', true)} configuration`}
        subtitle="The industry you work in and what things are called"
        actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>}
      />

      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={() => load()}>Try again</Btn></Notice>}
      {!data && !failed && <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading the configuration…</p></Panel>}
      {data && !data.ready && (
        <Notice status="warning">Projects is not set up yet. The database script 257 has to be run before anything here can be saved.</Notice>
      )}

      {data && data.ready && (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Configuration" />

          {tab === 'names' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, gridColumn: '1 / -1' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
                  <Panel as="form" onSubmit={saveGeneral}>
                    <PanelTitle hint="Sets the names on every screen, export and printed document.">Default industry</PanelTitle>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <Field label="Industry" htmlFor="cfg-default-industry" hint={data.can.industry ? null : 'You may not change the default industry.'}>
                        <SelectInput id="cfg-default-industry" value={general.default_industry} disabled={!data.can.industry} onChange={(e) => setGeneral({ ...general, default_industry: e.target.value })}>
                          <IndustryOptions industries={data.industries} />
                        </SelectInput>
                      </Field>
                      <label htmlFor="cfg-other-industry" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5 }}>
                        <input id="cfg-other-industry" type="checkbox" style={check} checked={!!general.project_may_use_other_industry} disabled={!data.can.manage} onChange={(e) => setGeneral({ ...general, project_may_use_other_industry: e.target.checked })} />
                        <span>One piece of work may use a different industry from the default, for a company with more than one line of work.</span>
                      </label>
                      <Field label="Days things stay in the trash" htmlFor="cfg-trash-days">
                        <TextInput id="cfg-trash-days" type="number" min={1} max={3650} value={general.trash_days} disabled={!data.can.manage} onChange={(e) => setGeneral({ ...general, trash_days: e.target.value === '' ? '' : Number(e.target.value) })} style={{ maxWidth: 140 }} />
                      </Field>
                      {data.can.manage && <div><Btn type="submit" variant="primary" busy={busy}>Save</Btn></div>}
                    </div>
                  </Panel>

                  {data.personal && (
                    <Panel>
                      <PanelTitle hint="Only changes what you see. Exports and documents keep the company's names.">My own names</PanelTitle>
                      <Field label="Show me the names of" htmlFor="cfg-my-naming">
                        <SelectInput id="cfg-my-naming" value={data.personal.industry || ''} onChange={(e) => setMyNaming(e.target.value)}>
                          <option value="">The company's: {industryName(data.general.default_industry)}</option>
                          <IndustryOptions industries={data.industries} />
                        </SelectInput>
                      </Field>
                    </Panel>
                  )}
                </div>

                <Panel>
                  <PanelTitle
                    hint={data.can.names ? 'Rename anything to the word your company uses. Put back returns it to the name the industry ships with.' : 'These are the names in use.'}
                    right={(
                      <Field label="Names of" htmlFor="cfg-viewing" style={{ minWidth: 220 }}>
                        <SelectInput id="cfg-viewing" value={data.viewing} onChange={(e) => load(e.target.value)}>
                          <IndustryOptions industries={data.industries} activeOnly={false} />
                        </SelectInput>
                      </Field>
                    )}
                  >
                    What things are called in {industryName(data.viewing)}
                  </PanelTitle>
                  <DataTable>
                    <thead>
                      <tr><th style={th}>Thing</th><th style={th}>Called</th>{data.can.names && <th style={th}><span style={{ position: 'absolute', left: -9999 }}>Actions</span></th>}</tr>
                    </thead>
                    <tbody>
                      {data.terms.map((term) => <NameRow key={term.key} term={term} canEdit={data.can.names} onSave={rename} onReset={reset} />)}
                    </tbody>
                  </DataTable>
                </Panel>
              </div>
            </div>
          )}

          {tab === 'industries' && (
            <Panel>
              <PanelTitle hint="An industry that is switched off cannot be chosen for new work. Every industry uses the same fields; only the names differ.">Industries</PanelTitle>
              <DataTable minWidth={480}>
                <thead><tr><th style={th}>Industry</th><th style={th}>Group</th><th style={th}>State</th>{data.can.manage && <th style={th} />}</tr></thead>
                <tbody>
                  {data.industries.map((i) => (
                    <tr key={i.key}>
                      <td style={{ ...td, fontWeight: 600 }}>{i.name} {i.key === data.general.default_industry && <Chip status="brand">Default</Chip>}</td>
                      <td style={td}>{GROUPS[i.group] || i.group}</td>
                      <td style={td}><Chip status={i.is_active ? 'good' : 'neutral'}>{i.is_active ? 'On' : 'Off'}</Chip></td>
                      {data.can.manage && (
                        <td style={{ ...td, textAlign: 'right' }}>
                          {i.key !== data.general.default_industry && <Btn small onClick={() => toggleIndustry(i)} aria-label={`${i.is_active ? 'Switch off' : 'Switch on'} ${i.name}`}>{i.is_active ? 'Switch off' : 'Switch on'}</Btn>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Panel>
          )}

          {(tab === 'stages' || tab === 'fields') && (
            <ShapePanel key={tab} part={tab} industries={data.industries} startIndustry={data.general.default_industry}
              wordsOf={() => ({ customer_id: t('client'), reference: t('reference'), authority: t('authority'), place: t('place'), start_date: 'Start date', due_date: 'Expected end', description: 'Description' })} />
          )}
          {tab === 'roles' && <ProjectRolesPanel canEdit={!!data.can.roles} />}
          {tab === 'access' && data.access && <AccessSettingsPanel key={JSON.stringify(data.access)} value={data.access} canEdit={!!data.can.manage} onSaved={setData} thing={t('project', false, true)} />}
          {tab === 'shortcuts' && <ShortcutsPanel onChanged={reloadNames} />}

          {tab === 'history' && (
            <Panel>
              <PanelTitle hint="Every save is kept. Bringing a version back makes a new version; nothing is ever erased.">History of the settings</PanelTitle>
              {history === null && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading the history…</p>}
              {history && history.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Nothing has been saved yet.</p>}
              {history && history.length > 0 && (
                <DataTable>
                  <thead><tr><th style={th}>Version</th><th style={th}>Saved</th><th style={th}>Default industry</th><th style={th}>Trash</th>{data.can.manage && <th style={th} />}</tr></thead>
                  <tbody>
                    {history.map((v) => (
                      <tr key={v.version}>
                        <td style={td}><b>{v.version}</b> {v.is_current && <Chip status="good">In use</Chip>}{v.note && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v.note}</div>}</td>
                        <td style={td}>{when(v.saved_at)}<div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v.saved_by || 'The system'}</div></td>
                        <td style={td}>{industryName(v.value.default_industry)}</td>
                        <td style={td}>{v.value.trash_days} days</td>
                        {data.can.manage && <td style={{ ...td, textAlign: 'right' }}>{!v.is_current && <Btn small busy={busy} onClick={() => rollback(v.version)} aria-label={`Bring back version ${v.version}`}>Bring back</Btn>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </Panel>
          )}
        </>
      )}
    </AdminLayout>
  );
}
