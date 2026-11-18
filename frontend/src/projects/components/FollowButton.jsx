import { useState } from 'react';
import toast from 'react-hot-toast';
import { message } from '../lib/format';
import { Btn } from './ui';

/**
 * Follow or stop following (docs/PROJECTS_STAGE6_SPEC.md, build 6.3). `state` is { on, automatic }: someone in a conversation or on a task follows
 * it on their own, and the button says so; stopping is always possible.
 */
export default function FollowButton({ what, state, onChange }) {
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true);
    try { await onChange(!state.on); toast.success(state.on ? `You stopped following ${what}` : `You follow ${what}`); } catch (e) { toast.error(message(e, 'That could not be changed.')); } finally { setBusy(false); }
  };
  const tip = state.on ? (state.automatic ? `You follow ${what} because you are in it. Press to stop.` : `Press to stop following ${what}.`) : `Hear about new messages and changes on ${what}.`;

  return <Btn small variant={state.on ? 'plain' : 'quiet'} aria-pressed={state.on} title={tip} busy={busy} onClick={flip} data-follow={what}>{state.on ? 'Following' : 'Follow'}</Btn>;
}
