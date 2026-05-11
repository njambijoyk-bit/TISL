import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Linkedin, Globe, Phone, MapPin, Briefcase, Clock,ChevronRight, ExternalLink } from 'lucide-react';
import { adminApi } from '../../../api/careersApi';
import ApplicationDetailPanel from '../components/ApplicationDetailPanel'; 
import useAdminCareersStore from '../../../store/useAdminCareersStore';  
import AdminCareersHeader from '../../layouts/AdminCareersHeader';

const STATUS_STYLES = {
    active:    { bg: 'rgba(16,185,129,0.12)',  color: '#10b981', label: 'Active' },
    suspended: { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', label: 'Suspended' },
};

const APP_STATUS_STYLES = {
    submitted:   { color: '#60a5fa', label: 'Submitted' },
    reviewing:   { color: '#f59e0b', label: 'Reviewing' },
    shortlisted: { color: '#a855f7', label: 'Shortlisted' },
    interview:   { color: '#06b6d4', label: 'Interview' },
    offered:     { color: '#10b981', label: 'Offered' },
    rejected:    { color: '#ef4444', label: 'Rejected' },
    withdrawn:   { color: '#555',    label: 'Withdrawn' },
};

export default function AdminApplicantDetailPage() {
    const { id } = useParams();
    const { fetchApplication } = useAdminCareersStore();
    const [applicant, setApplicant] = useState(null);
    const [loading, setLoading]     = useState(true);
    const [toggling, setToggling]   = useState(false);
    const [resetModal, setResetModal] = useState(false);
    const [tempPwd, setTempPwd]       = useState('');
    const [resetting, setResetting]   = useState(false);
    const [resetDone, setResetDone]   = useState(false);
    const [selectedAppId, setSelectedAppId] = useState(null);

    useEffect(() => {
        adminApi.getApplicant(id)
            .then(res => setApplicant(res.data))
            .finally(() => setLoading(false));
    }, [id]);

    const toggleStatus = async () => {
        if (toggling) return;
        const next = applicant.status === 'active' ? 'suspended' : 'active';
        const confirmed = window.confirm(
            next === 'suspended'
                ? `Suspend ${applicant.first_name} ${applicant.last_name}? This will revoke their session.`
                : `Reactivate ${applicant.first_name} ${applicant.last_name}?`
        );
        if (!confirmed) return;

        setToggling(true);
        try {
            const res = await adminApi.updateApplicantStatus(id, next);
            setApplicant(prev => ({ ...prev, status: res.applicant.status }));
        } finally {
            setToggling(false);
        }
    };

    // 👇 NEW: Handle clicking an application in history
    const handleOpenApplication = async (appId) => {
        setSelectedAppId(appId);
        await fetchApplication(appId); // Loads into store's currentApp
    };

    const handleAdminReset = async () => {
        if (resetting || !tempPwd.trim()) return;
        setResetting(true);
        try {
            await adminApi.resetApplicantPassword(id, tempPwd.trim());
            setResetDone(true);
            setTempPwd('');
            setTimeout(() => { setResetModal(false); setResetDone(false); }, 2000);
        } finally {
            setResetting(false);
        }
    };

    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', fontFamily: "'DM Sans', sans-serif" }}>
            <AdminCareersHeader />
            <p style={{ color: '#555', textAlign: 'center', padding: '64px 0' }}>Loading…</p>
        </div>
    );

    if (!applicant) return null;

    const st = STATUS_STYLES[applicant.status] ?? STATUS_STYLES.active;

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', fontFamily: "'DM Sans', sans-serif" }}>
            <AdminCareersHeader />

            <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 32px 80px' }}>

                {/* ── Back ── */}
                <Link to="/admin/careers/applicants" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, color: '#555', textDecoration: 'none', marginBottom: 24,
                }}
                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#555'}
                >
                    <ArrowLeft size={14} /> All Applicants
                </Link>

                {/* ── Profile card ── */}
                <div style={{ background: '#161616', border: '1px solid #1e1e1e', borderRadius: 12, padding: 28, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>

                        {/* Avatar */}
                        <div style={{
                            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, fontWeight: 700, color: '#fff',
                        }}>
                            {applicant.first_name?.[0]?.toUpperCase()}
                        </div>

                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f0f0f0' }}>
                                    {applicant.first_name} {applicant.last_name}
                                </h1>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                                    background: st.bg, color: st.color, textTransform: 'uppercase', letterSpacing: '0.06em',
                                }}>
                                    {st.label}
                                </span>
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>{applicant.email}</p>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                            onClick={() => { setResetModal(true); setResetDone(false); setTempPwd(''); }}
                            style={{
                                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                border: '1px solid #2a2a1a', background: 'rgba(245,158,11,0.08)',
                                color: '#f59e0b', cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            Reset Password
                        </button>
                        {/* Status toggle */}
                        <button
                            onClick={toggleStatus}
                            disabled={toggling}
                            style={{
                                flexShrink: 0,
                                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                border: '1px solid',
                                borderColor: applicant.status === 'active' ? '#3a1a1a' : '#1a3a1a',
                                background:  applicant.status === 'active' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                                color:       applicant.status === 'active' ? '#ef4444' : '#10b981',
                                cursor: toggling ? 'default' : 'pointer',
                                opacity: toggling ? 0.5 : 1,
                                transition: 'all 0.15s',
                            }}
                        >
                            {toggling ? '…' : applicant.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </button>
                        </div>
                    </div>

                    {/* Details grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                        {applicant.current_role && (
                            <Detail icon={<Briefcase size={13} />} label="Current Role" value={applicant.current_role} />
                        )}
                        {applicant.years_of_experience != null && (
                            <Detail icon={<Clock size={13} />} label="Experience" value={`${applicant.years_of_experience} yr${applicant.years_of_experience !== 1 ? 's' : ''}`} />
                        )}
                        {applicant.location && (
                            <Detail icon={<MapPin size={13} />} label="Location" value={applicant.location} />
                        )}
                        {applicant.phone && (
                            <Detail icon={<Phone size={13} />} label="Phone" value={applicant.phone} />
                        )}
                        {applicant.linkedin_url && (
                            <Detail
                                icon={<Linkedin size={13} />} label="LinkedIn"
                                value={<a href={applicant.linkedin_url} target="_blank" rel="noreferrer"
                                    style={{ color: '#60a5fa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    View profile <ExternalLink size={11} />
                                </a>}
                            />
                        )}
                        {applicant.portfolio_url && (
                            <Detail
                                icon={<Globe size={13} />} label="Portfolio"
                                value={<a href={applicant.portfolio_url} target="_blank" rel="noreferrer"
                                    style={{ color: '#60a5fa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    View portfolio <ExternalLink size={11} />
                                </a>}
                            />
                        )}
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 20, borderTop: '1px solid #1e1e1e' }}>
                        <Stat label="Total Applications" value={applicant.applications_count ?? 0} />
                        <Stat label="Active Applications" value={applicant.active_applications_count ?? 0} accent />
                        <Stat label="Member Since" value={new Date(applicant.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })} />
                    </div>
                </div>

                {/* ── Application history ── */}
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                    Applications
                </h2>

                {(applicant.applications ?? []).length === 0 ? (
                    <p style={{ color: '#444', fontSize: 13 }}>No applications yet.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {applicant.applications.map(app => {
                            const as = APP_STATUS_STYLES[app.status] ?? { color: '#666', label: app.status };
                            return (
                                <div
                                    key={app.id}
                                    onClick={() => handleOpenApplication(app.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        background: '#161616', border: '1px solid #1e1e1e',
                                        borderRadius: 10, padding: '14px 18px',
                                        cursor: 'pointer', // 👈 Add cursor
                                        transition: 'border-color 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#2a2a2a'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#1e1e1e'}
                                >
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
                                            {app.job_posting?.title ?? '—'}
                                        </p>
                                        <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
                                            {app.job_posting?.department}
                                            {app.created_at && ` · Applied ${new Date(app.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                        </p>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: as.color }}>{as.label}</span>
                                    <ChevronRight size={14} color="#333" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 👇 NEW: Application Detail Panel Modal */}
            {selectedAppId && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 100, padding: 24,
                }} onClick={(e) => {
                    if (e.target === e.currentTarget) setSelectedAppId(null);
                }}>
                    <div style={{
                        background: '#111', border: '1px solid #2a2a2a', borderRadius: 14,
                        padding: 0, width: '100%', maxWidth: 900, maxHeight: '90vh',
                        overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr',
                    }}>
                        {/* Panel Header with Close Button */}
                        <div style={{
                            padding: '16px 24px', borderBottom: '1px solid #1e1e1e',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f0' }}>
                                Application Details
                            </span>
                            <button
                                onClick={() => setSelectedAppId(null)}
                                style={{
                                    background: 'none', border: 'none', color: '#555',
                                    fontSize: 24, cursor: 'pointer', lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>
                        
                        {/* Panel Body */}
                        <div style={{ overflowY: 'auto', padding: 0 }}>
                            <ApplicationDetailPanel
                                applicationId={selectedAppId}
                                onClose={() => setSelectedAppId(null)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reset Password Modal ── */}
            {resetModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 100, padding: 24,
                }} onClick={(e) => { if (e.target === e.currentTarget) setResetModal(false); }}>
                    <div style={{
                        background: '#111', border: '1px solid #2a2a2a', borderRadius: 14,
                        padding: '32px 28px', width: '100%', maxWidth: 400,
                        fontFamily: "'DM Sans', sans-serif",
                    }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#f0f0f0' }}>
                            Reset Password
                        </h3>
                        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#555', lineHeight: 1.6 }}>
                            Set a temporary password for <strong style={{ color: '#ccc' }}>{applicant.first_name}</strong>.
                            They will be emailed this password and forced to change it on next login.
                        </p>

                        {resetDone ? (
                            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '12px 14px', color: '#10b981', fontSize: 13 }}>
                                ✓ Temporary password set and emailed.
                            </div>
                        ) : (
                            <>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', marginBottom: 7 }}>
                                    Temporary password
                                </label>
                                <input
                                    value={tempPwd}
                                    onChange={e => setTempPwd(e.target.value)}
                                    placeholder="Min. 8 characters"
                                    style={{
                                        width: '100%', padding: '10px 13px', borderRadius: 8,
                                        border: '1px solid #222', background: '#0f0f0f',
                                        color: '#f0f0f0', fontSize: 14, outline: 'none',
                                        boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 20,
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#f59e0b'}
                                    onBlur={e => e.target.style.borderColor = '#222'}
                                />
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button
                                        onClick={handleAdminReset}
                                        disabled={resetting || tempPwd.trim().length < 8}
                                        style={{
                                            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                                            background: '#f59e0b', color: '#000', fontSize: 13, fontWeight: 700,
                                            cursor: resetting || tempPwd.trim().length < 8 ? 'default' : 'pointer',
                                            opacity: resetting || tempPwd.trim().length < 8 ? 0.5 : 1,
                                            fontFamily: 'inherit',
                                        }}
                                    >
                                        {resetting ? 'Setting…' : 'Set & email password'}
                                    </button>
                                    <button
                                        onClick={() => setResetModal(false)}
                                        style={{
                                            padding: '10px 16px', borderRadius: 8,
                                            border: '1px solid #2a2a2a', background: 'transparent',
                                            color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>

    );
}

function Detail({ icon, label, value }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: '#555', marginTop: 1, flexShrink: 0 }}>{icon}</span>
            <div>
                <p style={{ margin: 0, fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#ccc' }}>{value}</p>
            </div>
        </div>
    );
}

function Stat({ label, value, accent }) {
    return (
        <div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: accent ? '#a855f7' : '#f0f0f0' }}>{value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#555' }}>{label}</p>
        </div>
    );
}
