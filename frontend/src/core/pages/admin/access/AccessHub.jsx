import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, RefreshCw, Users, KeyRound, Layers, ScrollText, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, chip } from './ui';
import PeopleTab from './PeopleTab';
import RolesTab from './RolesTab';
import LevelsTab from './LevelsTab';
import LimitsTab from './LimitsTab';
import LogTab from './LogTab';

/**
 * Settings → Roles & access. Who can do what, where and until when.
 * A person has a clearance (0 to 6): it limits which roles they may hold and whom they may manage. A role grants permissions, modules,
 * approval limits and restrictions. Branch access is the default branch plus grants that can end on a date.
 */

const TABS = [
  ['people', 'People', Users],
  ['roles', 'Roles', KeyRound],
  ['levels', 'Clearance levels', Layers],
  ['limits', 'Branch limits', MapPin],
  ['log', 'Activity', ScrollText],
];

const MODE = {
  off: ['Branch limits are off', 'Everyone sees every branch.'],
  log: ['Branch limits are in test mode', 'Nothing is refused yet. The Activity tab lists what would have been, so you can fix branch assignments before switching them on.'],
  on: ['Branch limits are on', 'People outside their branches are refused. Some areas may still be in test: see the Branch limits tab.'],
};

export default function AccessHub() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'people';
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');   // loading | ready | setup | error

  const load = useCallback(async () => {
    try {
      setData(await accessAPI.overview());
      setState('ready');
    } catch (e) {
      if (e.response?.status === 409) setState('setup');
      else { setState('error'); toast.error(errMsg(e, 'Could not load roles and access')); }
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const head = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <ShieldCheck size={22} color="var(--color-primary-600)" />
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Roles &amp; access</h1>
      </div>
      <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: 760 }}>
        Each person has a <strong>clearance</strong> from 0 to 6. It decides which roles they may hold and whom they may manage. A <strong>role</strong> grants what they can do,
        which modules they can open, what they may approve and any limits. <strong>Branch access</strong> says where, and until when.
      </p>
    </>
  );

  if (state === 'loading') {
    return <SettingsLayout><div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>{head}<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}><RefreshCw size={18} /> Loading…</div></div></SettingsLayout>;
  }
  if (state === 'setup') {
    return (
      <SettingsLayout>
        <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
          {head}
          <div style={card}>
            <h2 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 800 }}>Access is not set up yet</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Run <code>database/sql/98_access_engine.sql</code> in MySQL, then run <code>php artisan access:seed</code> on the server. Everything keeps working as before until then.
            </p>
          </div>
        </div>
      </SettingsLayout>
    );
  }
  if (state === 'error' || !data) {
    return <SettingsLayout><div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>{head}<button type="button" onClick={load} style={{ cursor: 'pointer' }}>Try again</button></div></SettingsLayout>;
  }

  const modes = new Set([data.scope.default, ...data.scope.areas.map((a) => a.mode)]);
  const overall = modes.size === 1 ? [...modes][0] : (modes.has('on') ? 'on' : 'log');
  const [modeTitle, modeText] = MODE[overall] ?? MODE.log;
  const props = { data, reload: load };

  return (
    <SettingsLayout>
      <div style={{ padding: '20px 4px', maxWidth: 1100, margin: '0 auto' }}>
        {head}
        <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px' }}>
          <span style={chip(overall === 'on' ? '#16a34a' : '#d97706')}>{modeTitle}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{modeText}</span>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {TABS.map((t) => {
            const [key, text] = t;
            const Icon = t[2];
            return (
              <button
                key={key} type="button" role="tab" aria-selected={tab === key}
                onClick={() => setParams({ tab: key }, { replace: true })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'inherit',
                  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 22%, transparent)',
                  background: tab === key ? 'var(--color-primary-500)' : 'transparent', color: tab === key ? 'white' : 'var(--color-primary-600)',
                }}
              >
                <Icon size={15} /> {text}
              </button>
            );
          })}
        </div>

        {tab === 'people' && <PeopleTab {...props} />}
        {tab === 'roles' && <RolesTab {...props} />}
        {tab === 'levels' && <LevelsTab {...props} />}
        {tab === 'limits' && <LimitsTab {...props} />}
        {tab === 'log' && <LogTab {...props} />}
      </div>
    </SettingsLayout>
  );
}
