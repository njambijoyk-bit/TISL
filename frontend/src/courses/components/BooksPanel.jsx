import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { SelectInput } from '../../core/components/admin/ui/Form';
import coursesAPI from '../../_shared/api/courses';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';

/** The books a course asks for or suggests. They are offered on its page and sold from the library by invoice. */
export default function BooksPanel({ offering }) {
  const [all, setAll] = useState(null);
  const [rows, setRows] = useState(null);
  const [add, setAdd] = useState('');
  useEffect(() => {
    coursesAPI.books().then((r) => setAll(r)).catch(() => setAll({ ready: false, books: [] }));
    coursesAPI.offeringBooks(offering.id).then((r) => setRows(r.books.map((b) => ({ book_id: b.id, title: b.title, relation: b.relation })))).catch(() => setRows([]));
  }, [offering.id]);
  if (!all || !rows) return <p>Loading…</p>;
  if (!all.ready) return <p role="status" style={{ color: colors.textMuted }}>Run database script 156_courses_books.sql to switch books on.</p>;
  const save = async () => {
    try { await coursesAPI.setOfferingBooks(offering.id, rows.map((r) => ({ book_id: r.book_id, relation: r.relation }))); toast.success('Books saved.'); } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); }
  };
  const free = all.books.filter((b) => b.is_active && !rows.some((r) => r.book_id === b.id));

  return (
    <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
      <strong>Books for this offering</strong>
      {rows.length === 0 && <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.86rem' }}>None. Add the books students need or may like; they are shown on the offering's page with a way to buy them.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {rows.map((r) => (
          <li key={r.book_id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 180 }}>{r.title}</span>
            <SelectInput aria-label={`${r.title} is`} value={r.relation} onChange={(e) => setRows((x) => x.map((y) => (y.book_id === r.book_id ? { ...y, relation: e.target.value } : y)))} style={{ maxWidth: 160 }}><option value="required">Required</option><option value="recommended">Recommended</option></SelectInput>
            <button type="button" aria-label={`Remove ${r.title}`} style={{ ...btnGhost, color: colors.danger }} onClick={() => setRows((x) => x.filter((y) => y.book_id !== r.book_id))}><Trash2 size={13} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <SelectInput aria-label="Add a book" value={add} onChange={(e) => setAdd(e.target.value)} style={{ maxWidth: 260 }}><option value="">Add a book…</option>{free.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</SelectInput>
        <button type="button" style={btnGhost} disabled={!add} onClick={() => { const b = all.books.find((x) => String(x.id) === add); setRows((x) => [...x, { book_id: b.id, title: b.title, relation: 'recommended' }]); setAdd(''); }}>Add</button>
        <button type="button" style={btnPrimary} onClick={save}>Save</button>
      </div>
    </section>
  );
}
