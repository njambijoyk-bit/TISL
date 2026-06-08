import { useState, useEffect, useCallback } from 'react';
import {
    GitBranch, Plus, RefreshCw, Loader2, AlertCircle,
    ChevronLeft, ChevronRight, X, Edit2, Trash2,
    Link2, GitPullRequest, Hash, Filter, Volume2, VolumeX,
} from 'lucide-react';
import '../../styles/bug.css';
import GeneralLayout from '../../components/layout/GeneralLayout';
import DevNoteForm from '../../components/bugs/DevNoteForm';
import {
    adminGetDevNotes, adminCreateDevNote, adminUpdateDevNote,
    adminUpdateDevNoteStatus, adminDeleteDevNote,
    DEV_NOTE_TYPES, DEV_NOTE_STATUSES,
} from '../../api/bugReportsAPI';
import { useBugAudio } from './settings/useBugAudio';

function getStatusClass(status) { return `bug-dn-status-${status}`; }
function getTypeClass(type)     { return `bug-dn-type-${type}`; }

function NoteStatusBadge({ status }) {
    const label = DEV_NOTE_STATUSES.find(s => s.value === status)?.label ?? status;
    return <span className={`bug-badge bug-badge-sm ${getStatusClass(status)}`} style={{ borderStyle: 'solid' }}>{label}</span>;
}

function NoteTypeTag({ type }) {
    const label = DEV_NOTE_TYPES.find(t => t.value === type)?.label ?? type;
    return <span className={`bug-mono bug-text-xs bug-font-medium ${getTypeClass(type)}`}>{label}</span>;
}

function GitDetails({ note }) {
    const items = [
        note.pr_number  && { icon: GitPullRequest, text: `PR #${note.pr_number}`, href: note.pr_url },
        note.branch_name && { icon: GitBranch,     text: note.branch_name },
        note.commit_hash && { icon: Hash,           text: note.commit_hash.slice(0, 8) },
    ].filter(Boolean);

    if (!items.length) return null;
    return (
        <div className="bug-flex bug-flex-wrap bug-gap-2" style={{ marginTop: 8 }}>
            {items.map((item, i) => {
                const Icon  = item.icon;
                const inner = <span className="bug-git-tag"><Icon size={10} /> {item.text}</span>;
                return item.href
                    ? <a key={i} href={item.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>
                    : <span key={i}>{inner}</span>;
            })}
        </div>
    );
}

function NoteCard({ note, onEdit, onDelete, onStatusChange, audio }) {
    const [deleting,     setDeleting]     = useState(false);
    const [statusSaving, setStatusSaving] = useState(false);

    const handleDelete = async () => {
        if (!window.confirm('Delete this dev note?')) return;
        setDeleting(true);
        audio.playClose();
        try { await onDelete(note.id); } finally { setDeleting(false); }
    };

    const handleStatusChange = async (e) => {
        setStatusSaving(true);
        try {
            await onStatusChange(note.id, e.target.value);
            audio.playSuccess();
        } finally {
            setStatusSaving(false);
        }
    };

    return (
        <div className="bug-note-card">
            {/* Top row */}
            <div className="bug-flex bug-items-start bug-justify-between bug-gap-3">
                <div className="bug-flex-col bug-gap-1 bug-min-w-0">
                    <div className="bug-flex bug-items-center bug-gap-2 bug-flex-wrap">
                        <NoteTypeTag type={note.type} />
                        {note.bug_report_id && (
                            <span className="bug-flex bug-items-center bug-gap-1 bug-text-xs bug-text-muted">
                                <Link2 size={10} /> Bug #{note.bug_report_id}
                            </span>
                        )}
                        <span className="bug-mono bug-text-xs bug-text-muted">{note.note_number}</span>
                    </div>
                    <p className="bug-text-sm bug-font-medium bug-text">{note.title}</p>
                </div>
                <div className="bug-flex bug-items-center bug-gap-1" style={{ flexShrink: 0 }}>
                    <button
                        onClick={() => { onEdit(note); audio.playClick(); }}
                        onMouseEnter={audio.playHover}
                        className="bug-copy-btn"
                        style={{ padding: 6, borderRadius: 8 }}
                    >
                        <Edit2 size={13} />
                    </button>
                    <button
                        onClick={handleDelete}
                        onMouseEnter={audio.playHover}
                        disabled={deleting}
                        className="bug-copy-btn"
                        style={{ padding: 6, borderRadius: 8, opacity: deleting ? 0.4 : 1 }}
                    >
                        {deleting ? <Loader2 size={13} className="bug-animate-spin" /> : <Trash2 size={13} />}
                    </button>
                </div>
            </div>

            {note.description && (
                <p className="bug-text-xs bug-text-muted bug-whitespace-pre bug-line-clamp">{note.description}</p>
            )}

            <GitDetails note={note} />

            {/* Bottom row */}
            <div className="bug-flex bug-items-center bug-justify-between bug-gap-2" style={{ paddingTop: 4, borderTop: '1px solid var(--bug-border-light)' }}>
                <div className="bug-flex bug-items-center bug-gap-2">
                    <NoteStatusBadge status={note.status} />
                    {statusSaving && <Loader2 size={12} className="bug-animate-spin bug-text-muted" />}
                </div>
                <div className="bug-flex bug-items-center bug-gap-3">
                    <select
                        value={note.status}
                        onChange={handleStatusChange}
                        onFocus={audio.playHover}
                        disabled={statusSaving}
                        className="bug-select"
                        style={{ fontSize: 12, padding: '4px 8px', opacity: statusSaving ? 0.4 : 1 }}
                    >
                        {DEV_NOTE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <span className="bug-text-xs bug-text-muted">{new Date(note.created_at).toLocaleDateString()}</span>
                    {note.entered_by_dev && <span className="bug-text-xs bug-text-indigo bug-font-medium">Dev</span>}
                </div>
            </div>
        </div>
    );
}

export default function AdminDevNotesPage() {
    const audio = useBugAudio();

    const [notes,    setNotes]    = useState([]);
    const [meta,     setMeta]     = useState(null);
    const [page,     setPage]     = useState(1);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState(null);
    const [filters,  setFilters]  = useState({ status: '', type: '', linked: '' });
    const [showForm, setShowForm] = useState(false);
    const [editNote, setEditNote] = useState(null);

    const load = useCallback(async (p = 1, f = filters) => {
        setLoading(true); setError(null);
        try {
            const params = {
                page: p, per_page: 20,
                ...(f.status && { status: f.status }),
                ...(f.type   && { type: f.type }),
                ...(f.linked !== '' && { linked: f.linked === 'true' }),
            };
            const res = await adminGetDevNotes(params);
            setNotes(res.data);
            setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            setPage(p);
        } catch {
            setError('Failed to load dev notes.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { load(1, filters); }, [filters]);

    const handleCreate = async (data) => {
        await adminCreateDevNote(data);
        audio.playSuccess();
        setShowForm(false);
        load(1);
    };

    const handleUpdate = async (data) => {
        await adminUpdateDevNote(editNote.id, data);
        audio.playSuccess();
        setEditNote(null);
        load(page);
    };

    const handleDelete       = async (id)     => { await adminDeleteDevNote(id); load(page); };
    const handleStatusChange = async (id, st) => {
        await adminUpdateDevNoteStatus(id, st);
        setNotes(prev => prev.map(n => n.id === id ? { ...n, status: st } : n));
    };

    const handleFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
    const clearFilters = () => { setFilters({ status: '', type: '', linked: '' }); audio.playClick(); };
    const hasFilters   = filters.status || filters.type || filters.linked !== '';

    return (
        <GeneralLayout>
            <div className="bug-container-lg">

                {/* ── Header ── */}
                <div className="bug-flex bug-items-center bug-justify-between bug-gap-4">
                    <div className="bug-flex bug-items-center bug-gap-3">
                        <div className="bug-icon-box bug-icon-box-md bug-icon-box-indigo">
                            <GitBranch size={18} />
                        </div>
                        <div>
                            <h1 className="bug-text-xl bug-font-bold bug-text">Dev Notes</h1>
                            {meta && <p className="bug-text-xs bug-text-muted">{meta.total} note{meta.total !== 1 ? 's' : ''}</p>}
                        </div>
                    </div>
                    <div className="bug-flex bug-items-center bug-gap-2">
                        <button
                            onClick={audio.toggleMute}
                            onMouseEnter={audio.playHover}
                            className="bug-btn"
                            style={{ padding: 8 }}
                            title={audio.muted ? 'Unmute sounds' : 'Mute sounds'}
                        >
                            {audio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        <button
                            onClick={() => { load(page); audio.playClick(); }}
                            onMouseEnter={audio.playHover}
                            disabled={loading}
                            className="bug-btn"
                            style={{ padding: 8 }}
                            title="Refresh"
                        >
                            <RefreshCw size={15} className={loading ? 'bug-animate-spin' : ''} />
                        </button>
                        <button
                            onClick={() => { setEditNote(null); setShowForm(true); audio.playOpen(); }}
                            onMouseEnter={audio.playHover}
                            className="bug-btn bug-btn-indigo"
                        >
                            <Plus size={15} /> New Note
                        </button>
                    </div>
                </div>

                {/* ── Filters ── */}
                <div className="bug-flex bug-flex-wrap bug-items-center bug-gap-2">
                    <Filter size={13} className="bug-text-muted" />
                    <select value={filters.status} onChange={e => { handleFilter('status', e.target.value); audio.playHover(); }} className="bug-select">
                        <option value="">All Statuses</option>
                        {DEV_NOTE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select value={filters.type} onChange={e => { handleFilter('type', e.target.value); audio.playHover(); }} className="bug-select">
                        <option value="">All Types</option>
                        {DEV_NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select value={filters.linked} onChange={e => { handleFilter('linked', e.target.value); audio.playHover(); }} className="bug-select">
                        <option value="">Linked + Standalone</option>
                        <option value="true">Linked to Bug</option>
                        <option value="false">Standalone</option>
                    </select>
                    {hasFilters && (
                        <button onClick={clearFilters} onMouseEnter={audio.playHover} className="bug-btn bug-text-muted" style={{ fontSize: 12, padding: '6px 10px' }}>
                            <X size={11} /> Clear
                        </button>
                    )}
                </div>

                {/* ── Create / Edit form panel ── */}
                {(showForm || editNote) && (
                    <div className="bug-card" style={{ padding: 24 }}>
                        <div className="bug-flex bug-items-center bug-justify-between" style={{ marginBottom: 20 }}>
                            <h2 className="bug-text-sm bug-font-semibold bug-text">
                                {editNote ? 'Edit Dev Note' : 'New Dev Note'}
                            </h2>
                            <button
                                onClick={() => { setShowForm(false); setEditNote(null); audio.playClose(); }}
                                onMouseEnter={audio.playHover}
                                className="bug-copy-btn"
                                style={{ padding: 6, borderRadius: 8 }}
                            >
                                <X size={15} />
                            </button>
                        </div>
                        <DevNoteForm
                            initial={editNote ?? {}}
                            onSubmit={editNote ? handleUpdate : handleCreate}
                            onCancel={() => { setShowForm(false); setEditNote(null); audio.playClose(); }}
                            submitLabel={editNote ? 'Update Note' : 'Create Note'}
                        />
                    </div>
                )}

                {/* ── Content ── */}
                {loading && (
                    <div className="bug-flex bug-items-center bug-justify-center" style={{ padding: '64px 0' }}>
                        <Loader2 size={22} className="bug-animate-spin bug-text-muted" />
                    </div>
                )}
                {error && !loading && (
                    <div className="bug-flex bug-items-center bug-gap-2 bug-text-sm bug-text-red">
                        <AlertCircle size={15} /> {error}
                    </div>
                )}
                {!loading && !error && notes.length === 0 && (
                    <div className="bug-flex-col bug-items-center bug-gap-3" style={{ padding: '64px 0' }}>
                        <GitBranch size={32} strokeWidth={1.5} className="bug-text-muted" />
                        <p className="bug-text-sm bug-text-muted">No dev notes yet.</p>
                    </div>
                )}

                <div className="bug-flex-col" style={{ gap: 12 }}>
                    {!loading && notes.map(note => (
                        <NoteCard key={note.id} note={note} audio={audio}
                            onEdit={(n) => { setEditNote(n); setShowForm(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            onDelete={handleDelete}
                            onStatusChange={handleStatusChange}
                        />
                    ))}
                </div>

                {/* ── Pagination ── */}
                {meta && meta.last_page > 1 && (
                    <div className="bug-flex bug-items-center bug-justify-between" style={{ paddingTop: 8 }}>
                        <button
                            onClick={() => { load(page - 1); audio.playClick(); }}
                            onMouseEnter={audio.playHover}
                            disabled={page <= 1 || loading}
                            className="bug-flex bug-items-center bug-gap-1 bug-text-sm bug-text-secondary"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page <= 1 || loading ? 0.4 : 1 }}
                        >
                            <ChevronLeft size={15} /> Previous
                        </button>
                        <span className="bug-text-xs bug-text-muted">Page {meta.current_page} of {meta.last_page}</span>
                        <button
                            onClick={() => { load(page + 1); audio.playClick(); }}
                            onMouseEnter={audio.playHover}
                            disabled={page >= meta.last_page || loading}
                            className="bug-flex bug-items-center bug-gap-1 bug-text-sm bug-text-secondary"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page >= meta.last_page || loading ? 0.4 : 1 }}
                        >
                            Next <ChevronRight size={15} />
                        </button>
                    </div>
                )}
            </div>
        </GeneralLayout>
    );
}