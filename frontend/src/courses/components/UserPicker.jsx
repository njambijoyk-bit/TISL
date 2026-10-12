import { useEffect, useState } from 'react';
import { TextInput } from '../../core/components/admin/ui/Form';
import coursesAPI from '../../_shared/api/courses';
import { colors } from '../../_shared/theme/tokens';

/** Find a person by name or email. Calls onPick({id, name, email}). */
export default function UserPicker({ id, onPick, placeholder = 'Search by name or email' }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => { coursesAPI.people(q).then((r) => setFound(r.users)).catch(() => setFound([])); }, 250);

    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <TextInput id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {found.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>
          {found.map((u) => (
            <li key={u.id}><button type="button" onClick={() => { onPick(u); setQ(''); setFound([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text, textAlign: 'left', padding: '4px 0' }}>{u.name} <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{u.email}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
