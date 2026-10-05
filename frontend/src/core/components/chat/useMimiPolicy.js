import { useCallback, useEffect, useState } from 'react';
import policyAPI from '../../../_shared/api/policy';

const KEY = 'mimi_ai_policy';
const LOCAL = 'mimi_policy_major';   // a guest's agreement is remembered on their device only (the major version they agreed to)
const read = () => { try { return Number(localStorage.getItem(LOCAL)) || 0; } catch { return 0; } };

/**
 * Has this person agreed to the Mimi AI policy? Asked the first time they open Mimi and again only when the policy gets a new major version.
 * Signed-in people are recorded on their account; guests on their device. If the policy cannot be reached, Mimi opens anyway.
 * state: 'loading' | 'needed' | 'ok'
 */
export function useMimiPolicy(isAuthenticated, enabled) {
  const [state, setState] = useState('loading');
  const [major, setMajor] = useState(null);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const fin = (required, accepted, p) => { if (!live) return; setMajor(p?.major_version ?? null); setTitle(p?.title ?? ''); setVersion(p?.version ?? ''); setState(!required || accepted ? 'ok' : 'needed'); };
    if (isAuthenticated) {
      policyAPI.mimiStatus().then((r) => fin(r.required, r.accepted, r)).catch(() => live && setState('ok'));
    } else {
      policyAPI.getByKey(KEY).then((p) => fin(p.is_active && p.requires_acceptance, read() >= p.major_version, p)).catch(() => live && setState('ok'));
    }
    return () => { live = false; };
  }, [isAuthenticated, enabled]);

  const accept = useCallback(async () => {
    if (isAuthenticated) await policyAPI.logAcceptance({ policy_key: KEY, action_context: 'ai_assistant', response: 'accepted' });
    else { try { localStorage.setItem(LOCAL, String(major ?? 1)); } catch { /* storage blocked: asked again next time */ } }
    setState('ok');
  }, [isAuthenticated, major]);

  return { state, accept, title, version };
}

export default useMimiPolicy;
