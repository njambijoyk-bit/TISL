import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Linkedin, Globe, Phone, MapPin, Briefcase, Clock,ChevronRight, ExternalLink } from 'lucide-react';
import { adminApi } from '../../../_shared/api/careersApi';
import ApplicationDetailPanel from '../components/ApplicationDetailPanel'; 
import useAdminCareersStore from '../../../_shared/store/useAdminCareersStore';  
import AdminCareersHeader from '../../layouts/AdminCareersHeader';

const STATUS_STYLES = {
    active:    { bg: 'rgba(16,185,129,0.12)',  color: 'var(--status-success)', label: 'Active' },
    suspended: { bg: 'rgba(239,68,68,0.12)',   color: 'var(--status-error)', label: 'Suspended' },
};

const APP_STATUS_STYLES = {
    submitted:   { color: 'var(--status-info)', label: 'Submitted' },
    reviewing:   { color: 'var(--status-warning)', label: 'Reviewing' },
    shortlisted: { color: 'var(--color-primary-500)', label: 'Shortlisted' },
    interview:   { color: 'var(--status-info)', label: 'Interview' },
    offered:     { color: 'var(--status-success)', label: 'Offered' },
    rejected:    { color: 'var(--status-error)', label: 'Rejected' },
    withdrawn:   { color: 'var(--text-tertiary)',    label: 'Withdrawn' },
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
    const [resetError, setResetError] = useState('');
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
        setResetError('');
        try {
            await adminApi.resetApplicantPassword(id, tempPwd.trim());
            setResetDone(true);
            setTempPwd('');
            setTimeout(() => { setResetModal(false); setResetDone(false); }, 2000);
        } catch (err) {
            // the server says why in plain words (too short, too common, contains their name...)
            setResetError(err?.errors?.temporary_password?.[0] ?? err?.message ?? 'That did not work.');
        } finally {
            setResetting(false);
        }
    };

    if (loading) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "var(--font-body, system-ui), sans-serif" }}>
            <AdminCareersHeader />
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '64px 0' }}>Loading…</p>
        </div>
    );

    if (!applicant) return null;

    const st = STATUS_STYLES[applicant.status] ?? STATUS_STYLES.active;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "var(--font-body, system-ui), sans-serif" }}>
            <AdminCareersHeader />

            <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 32px 80px' }}>

                {/* ── Back ── */}
                <Link to="/admin/careers/applicants" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, color: 'var(--text-tertiary)', textDecoration: 'none', marginBottom: 24,
                }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                >
                    <ArrowLeft size={14} /> All Applicants
                </Link>

                {/* ── Profile card ── */}
                <div style={{ background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 28, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>

                        {/* Avatar */}
                        <div style={{
                            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, fontWeight: 700, color: '#fff',
                        }}>
                            {applicant.first_name?.[0]?.toUpperCase()}
                        </div>

                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {applicant.first_name} {applicant.last_name}
                                </h1>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                                    background: st.bg, color: st.color, textTransform: 'uppercase', letterSpacing: '0.06em',
                                }}>
                                    {st.label}
                                </span>
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{applicant.email}</p>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                            onClick={() => { setResetModal(true); setResetDone(false); setTempPwd(''); }}
                            style={{
                                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                border: '1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)', background: 'rgba(245,158,11,0.08)',
                                color: 'var(--status-warning)', cursor: 'pointer', transition: 'all 0.15s',
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
                                borderColor: applicant.status === 'active' ? 'color-mix(in srgb, var(--status-error) 40%, transparent)' : 'color-mix(in srgb, var(--status-success) 35%, transparent)',
                                background:  applicant.status === 'active' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                                color:       applicant.status === 'active' ? 'var(--status-error)' : 'var(--status-success)',
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
                                    style={{ color: 'var(--status-info)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    View profile <ExternalLink size={11} />
                                </a>}
                            />
                        )}
                        {applicant.portfolio_url && (
                            <Detail
                                icon={<Globe size={13} />} label="Portfolio"
                                value={<a href={applicant.portfolio_url} target="_blank" rel="noreferrer"
                                    style={{ color: 'var(--status-info)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    View portfolio <ExternalLink size={11} />
                                </a>}
                            />
                        )}
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
                        <Stat label="Total Applications" value={applicant.applications_count ?? 0} />
                        <Stat label="Active Applications" value={applicant.active_applications_count ?? 0} accent />
                        <Stat label="Member Since" value={new Date(applicant.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })} />
                    </div>
                </div>

                {/* ── Application history ── */}
                <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                    Applications
                </h2>

                {(applicant.applications ?? []).length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No applications yet.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {applicant.applications.map(app => {
                            const as = APP_STATUS_STYLES[app.status] ?? { color: 'var(--text-secondary)', label: app.status };
                            return (
                                <div
                                    key={app.id}
                                    onClick={() => handleOpenApplication(app.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        background: 'var(--surface-card)', border: '1px solid var(--line)',
                                        borderRadius: 10, padding: '14px 18px',
                                        cursor: 'pointer', // 👈 Add cursor
                                        transition: 'border-color 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
                                >
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {app.job_posting?.title ?? '—'}
                                        </p>
                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                            {app.job_posting?.department}
                                            {app.created_at && ` · Applied ${new Date(app.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                        </p>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: as.color }}>{as.label}</span>
                                    <ChevronRight size={14} color="var(--text-tertiary)" />
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
                        background: 'var(--bg-primary)', border: '1px solid var(--line)', borderRadius: 14,
                        padding: 0, width: '100%', maxWidth: 900, maxHeight: '90vh',
                        overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr',
                    }}>
                        {/* Panel Header with Close Button */}
                        <div style={{
                            padding: '16px 24px', borderBottom: '1px solid var(--line)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                Application Details
                            </span>
                            <button
                                onClick={() => setSelectedAppId(null)}
                                style={{
                                    background: 'none', border: 'none', color: 'var(--text-tertiary)',
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
                        background: 'var(--bg-primary)', border: '1px solid var(--line)', borderRadius: 14,
                        padding: '32px 28px', width: '100%', maxWidth: 400,
                        fontFamily: "var(--font-body, system-ui), sans-serif",
                    }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                            Reset Password
                        </h3>
                        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                            Set a temporary password for <strong style={{ color: 'var(--text-primary)' }}>{applicant.first_name}</strong>.
                            They will be emailed this password and forced to change it on next login.
                        </p>

                        {resetDone ? (
                            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '12px 14px', color: 'var(--status-success)', fontSize: 13 }}>
                                ✓ Temporary password set and emailed.
                            </div>
                        ) : (
                            <>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7 }}>
                                    Temporary password
                                </label>
                                <input
                                    value={tempPwd}
                                    onChange={e => setTempPwd(e.target.value)}
                                    placeholder="Min. 10 characters"
                                    style={{
                                        width: '100%', padding: '10px 13px', borderRadius: 8,
                                        border: '1px solid var(--line)', background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                                        boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 20,
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'var(--status-warning)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--line)'}
                                />
                                {resetError && <p style={{ margin: '-12px 0 16px', fontSize: 12, color: 'var(--status-error, #ef4444)' }}>{resetError}</p>}
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button
                                        onClick={handleAdminReset}
                                        disabled={resetting || tempPwd.trim().length < 10}
                                        style={{
                                            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                                            background: 'var(--status-warning)', color: 'var(--text-inverse)', fontSize: 13, fontWeight: 700,
                                            cursor: resetting || tempPwd.trim().length < 10 ? 'default' : 'pointer',
                                            opacity: resetting || tempPwd.trim().length < 10 ? 0.5 : 1,
                                            fontFamily: 'inherit',
                                        }}
                                    >
                                        {resetting ? 'Setting…' : 'Set & email password'}
                                    </button>
                                    <button
                                        onClick={() => setResetModal(false)}
                                        style={{
                                            padding: '10px 16px', borderRadius: 8,
                                            border: '1px solid var(--line)', background: 'transparent',
                                            color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
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
            <span style={{ color: 'var(--text-tertiary)', marginTop: 1, flexShrink: 0 }}>{icon}</span>
            <div>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-primary)' }}>{value}</p>
            </div>
        </div>
    );
}

function Stat({ label, value, accent }) {
    return (
        <div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: accent ? 'var(--color-primary-500)' : 'var(--text-primary)' }}>{value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</p>
        </div>
    );
}
