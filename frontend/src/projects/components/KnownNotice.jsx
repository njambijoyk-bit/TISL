import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import projectsAPI from '../../_shared/api/projects';
import { Notice } from './ui';

/**
 * "Do we already know them?" (docs/PROJECTS_STAGE3_SPEC.md): while someone is being added, the leads, clients, contacts and other parties with
 * the same name, email or phone are shown. It warns and never stops anyone. `except` is { type, id } of the record being edited.
 */
export default function KnownNotice({ name, email, phone, except }) {
  const [known, setKnown] = useState([]);
  const exceptType = except?.type; const exceptId = except?.id;
  useEffect(() => {
    if (!name?.trim() && !email?.trim() && !phone?.trim()) { setKnown([]); return undefined; }
    let live = true;
    const id = setTimeout(() => {
      projectsAPI.known({ name, email, phone, ...(exceptType ? { except_type: exceptType, except_id: exceptId } : {}) }).then((r) => { if (live) setKnown(r); }).catch(() => { if (live) setKnown([]); });
    }, 400);
    return () => { live = false; clearTimeout(id); };
  }, [name, email, phone, exceptType, exceptId]);

  if (!known.length) return null;
  return (
    <div data-known><Notice status="warning">
      <strong>You may already know them.</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {known.map((k) => <li key={`${k.type}-${k.id}`}>{k.url ? <Link to={k.url} style={{ color: 'var(--color-primary-500)' }}>{k.name}</Link> : k.name}: {k.detail}</li>)}
      </ul>
    </Notice></div>
  );
}
