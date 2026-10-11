import { useState } from 'react';
import ResetSigninMethods from '/src/core/components/admin/users/ResetSigninMethods.jsx';

/** Only the browser checks load this (see harness.html): the "reset sign-in methods" window for the person named in ?id= and ?name=, opened by a button, with the server's answer shown under it. */
export default function ResetProbe() {
  const q = new URLSearchParams(window.location.search);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');

  return (
    <div>
      <button type="button" data-testid="probe-open" onClick={() => { setAnswer(''); setOpen(true); }}>Reset sign-in methods</button>
      <p data-testid="probe-answer">{answer}</p>
      {open && <ResetSigninMethods user={{ id: Number(q.get('id')), name: q.get('name') ?? 'Someone' }} onClose={() => setOpen(false)} onDone={(r) => setAnswer(r.message)} />}
    </div>
  );
}
