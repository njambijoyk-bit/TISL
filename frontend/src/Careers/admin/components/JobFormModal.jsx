import { useState, useEffect } from 'react';
import useAdminCareersStore from '../../../store/useAdminCareersStore';

const TYPES = ['full_time','part_time','contract','internship','temporary'];
const TYPE_LABELS = { full_time:'Full Time', part_time:'Part Time', contract:'Contract', internship:'Internship', temporary:'Temporary' };
const EXP_LEVELS = ['entry','mid','senior','lead','executive'];
const DOC_TYPES  = ['cv','cover_letter','certificate','portfolio','id_document','other'];
const DOC_LABELS = { cv:'CV / Résumé', cover_letter:'Cover Letter', certificate:'Certificate', portfolio:'Portfolio', id_document:'ID Document', other:'Other' };

const EMPTY = {
    title: '', department: '', location: '', type: 'full_time', experience_level: '',
    description: '', responsibilities: [], requirements: [], nice_to_haves: [],
    required_documents: [], salary_min: '', salary_max: '', salary_currency: 'KES',
    salary_visible: false, deadline: '', status: 'draft',
};

const s = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', overflowY: 'auto' },
    modal: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: 16, padding: '36px 36px 40px', width: '100%', maxWidth: 720, flexShrink: 0 },
    hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
    hdrtitle: { fontSize: 22, fontWeight: 700, color: '#f0f0f0', fontFamily: "'DM Serif Display', serif" },
    closeBtn: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 22 },
    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#555', fontWeight: 600, marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #1e1e1e' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
    field: { marginBottom: 16 },
    label: { display: 'block', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#666', marginBottom: 7, fontWeight: 600 },
    input: { width: '100%', padding: '10px 13px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#0f0f0f', color: '#f0f0f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
    select: { width: '100%', padding: '10px 13px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#0f0f0f', color: '#f0f0f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '10px 13px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#0f0f0f', color: '#f0f0f0', fontSize: 14, resize: 'vertical', minHeight: 110, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
    listRow: { display: 'flex', gap: 8, marginBottom: 8 },
    listInput: { flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#0f0f0f', color: '#f0f0f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
    addBtn: { padding: '9px 14px', borderRadius: 8, border: '1px solid #2a2a2a', background: 'transparent', color: '#a855f7', cursor: 'pointer', fontSize: 18, lineHeight: 1 },
    removeBtn: { padding: '9px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#555', cursor: 'pointer', fontSize: 16 },
    chip: (active) => ({ padding: '5px 12px', borderRadius: 20, border: `1px solid ${active ? '#a855f7' : '#2a2a2a'}`, background: active ? '#2d1b4e' : 'transparent', color: active ? '#c084fc' : '#666', fontSize: 12, cursor: 'pointer', fontWeight: 500 }),
    chipsRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
    toggle: (on) => ({ width: 40, height: 22, borderRadius: 11, background: on ? '#a855f7' : '#2a2a2a', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }),
    toggleKnob: (on) => ({ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }),
    footer: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 32, paddingTop: 24, borderTop: '1px solid #1e1e1e' },
    cancelBtn: { padding: '11px 24px', borderRadius: 9, border: '1px solid #2a2a2a', background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer' },
    saveBtn: { padding: '11px 28px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    publishBtn: { padding: '11px 28px', borderRadius: 9, border: 'none', background: '#1a3a1a', color: '#4ade80', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    errMsg: { color: '#f87171', fontSize: 13, marginTop: 8 },
};

function ListEditor({ label, items, onChange, placeholder }) {
    const [draft, setDraft] = useState('');
    const add = () => { if (!draft.trim()) return; onChange([...items, draft.trim()]); setDraft(''); };
    const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
    return (
        <div style={s.field}>
            <label style={s.label}>{label}</label>
            <div style={s.listRow}>
                <input style={s.listInput} value={draft} onChange={(e) => setDraft(e.target.value)}
                    placeholder={placeholder} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
                <button type="button" style={s.addBtn} onClick={add}>+</button>
            </div>
            {items.map((item, i) => (
                <div key={i} style={{ ...s.listRow, alignItems: 'center' }}>
                    <span style={{ ...s.listInput, color: '#ccc', padding: '8px 12px', fontSize: 13 }}>{item}</span>
                    <button type="button" style={s.removeBtn} onClick={() => remove(i)}>×</button>
                </div>
            ))}
        </div>
    );
}

export default function JobFormModal({ job, onClose, onSaved }) {
    const { createJob, updateJob } = useAdminCareersStore();
    const isEdit = !!job;
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (job) {
            setForm({
                title:              job.title ?? '',
                department:         job.department ?? '',
                location:           job.location ?? '',
                type:               job.type ?? 'full_time',
                experience_level:   job.experience_level ?? '',
                description:        job.description ?? '',
                responsibilities:   job.responsibilities ?? [],
                requirements:       job.requirements ?? [],
                nice_to_haves:      job.nice_to_haves ?? [],
                required_documents: job.required_documents ?? [],
                salary_min:         job.salary_min ?? '',
                salary_max:         job.salary_max ?? '',
                salary_currency:    job.salary_currency ?? 'KES',
                salary_visible:     job.salary_visible ?? false,
                deadline:           job.deadline ? job.deadline.substring(0, 10) : '',
                status:             job.status ?? 'draft',
            });
        }
    }, [job]);

    const patch = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
    const patchArr = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));

    const toggleDoc = (type) => {
        const docs = form.required_documents;
        setForm((f) => ({
            ...f,
            required_documents: docs.includes(type) ? docs.filter((d) => d !== type) : [...docs, type],
        }));
    };

    const handleSave = async (publishAfter = false) => {
        const clientErrors = {};
        if (!form.title.trim())       clientErrors.title       = ['Job title is required.'];
        if (!form.description.trim()) clientErrors.description = ['Description is required.'];
        if (Object.keys(clientErrors).length) { setErrors(clientErrors); return; }

        setSaving(true); setErrors({});
        const payload = { ...form };
        if (publishAfter) payload.status = 'published';
        try {
            const res = isEdit ? await updateJob(job.id, payload) : await createJob(payload);
            onSaved?.(res.data);
            onClose();
        } catch (err) {
            if (err.errors) setErrors(err.errors);
        } finally { setSaving(false); }
    };

    return (
        <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={s.modal}>
                <div style={s.hdr}>
                    <p style={s.hdrtitle}>{isEdit ? 'Edit Job Posting' : 'New Job Posting'}</p>
                    <button style={s.closeBtn} onClick={onClose}>×</button>
                </div>

                {/* Basics */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>Basic Info</p>
                    <div style={s.field}>
                        <label style={s.label}>Job Title *</label>
                        <input style={s.input} value={form.title} onChange={patch('title')} placeholder="e.g. Senior Mechanical Engineer" />
                        {errors.title && <p style={s.errMsg}>{errors.title[0]}</p>}
                    </div>
                    <div style={s.grid3}>
                        <div style={s.field}>
                            <label style={s.label}>Department</label>
                            <input style={s.input} value={form.department} onChange={patch('department')} placeholder="Engineering" />
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>Location</label>
                            <input style={s.input} value={form.location} onChange={patch('location')} placeholder="Nairobi, Kenya" />
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>Deadline</label>
                            <input style={s.input} type="date" value={form.deadline} onChange={patch('deadline')} />
                        </div>
                    </div>
                    <div style={s.grid2}>
                        <div style={s.field}>
                            <label style={s.label}>Type *</label>
                            <select style={s.select} value={form.type} onChange={patch('type')}>
                                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                            </select>
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>Experience Level</label>
                            <select style={s.select} value={form.experience_level} onChange={patch('experience_level')}>
                                <option value="">— Any —</option>
                                {EXP_LEVELS.map((e) => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Description */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>Description *</p>
                    <textarea style={s.textarea} value={form.description} onChange={patch('description')} placeholder="Overview of the role…" />
                    {errors.description && <p style={s.errMsg}>{errors.description[0]}</p>}
                </div>

                {/* Lists */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>Role Details</p>
                    <ListEditor label="Responsibilities" items={form.responsibilities} onChange={patchArr('responsibilities')} placeholder="Add a responsibility and press Enter" />
                    <ListEditor label="Requirements" items={form.requirements} onChange={patchArr('requirements')} placeholder="Add a requirement and press Enter" />
                    <ListEditor label="Nice to Have" items={form.nice_to_haves} onChange={patchArr('nice_to_haves')} placeholder="Add a nice-to-have and press Enter" />
                </div>

                {/* Salary */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>Compensation <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· per month</span></p>
                    <div style={s.grid3}>
                        <div style={s.field}>
                            <label style={s.label}>Min Salary</label>
                            <input style={s.input} type="number" value={form.salary_min} onChange={patch('salary_min')} placeholder="0" />
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>Max Salary</label>
                            <input style={s.input} type="number" value={form.salary_max} onChange={patch('salary_max')} placeholder="0" />
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>Currency</label>
                            <input style={s.input} value={form.salary_currency} onChange={patch('salary_currency')} placeholder="KES" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button type="button" style={s.toggle(form.salary_visible)} onClick={() => setForm((f) => ({ ...f, salary_visible: !f.salary_visible }))}>
                            <div style={s.toggleKnob(form.salary_visible)} />
                        </button>
                        <span style={{ fontSize: 13, color: '#888' }}>Show salary publicly</span>
                    </div>
                </div>

                {/* Required Documents */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>Required Documents from Applicants</p>
                    <div style={s.chipsRow}>
                        {DOC_TYPES.map((t) => (
                            <button type="button" key={t} style={s.chip(form.required_documents.includes(t))} onClick={() => toggleDoc(t)}>
                                {DOC_LABELS[t]}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={s.footer}>
                    <button type="button" style={s.cancelBtn} onClick={onClose}>Cancel</button>
                    <button type="button" style={s.saveBtn} onClick={() => handleSave(false)} disabled={saving}>
                        {saving ? 'Saving…' : 'Save as Draft'}
                    </button>
                    {!isEdit && (
                        <button type="button" style={s.publishBtn} onClick={() => handleSave(true)} disabled={saving}>
                            Save & Publish
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}