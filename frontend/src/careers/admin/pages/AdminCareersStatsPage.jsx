import { useEffect } from 'react';
import useAdminCareersStore from '../../../_shared/store/useAdminCareersStore';
import AdminCareersHeader from '../../layouts/AdminCareersHeader';

const STATUS_COLORS = { submitted:'var(--status-info)', under_review:'var(--status-warning)', shortlisted:'var(--status-success)', interviewed:'var(--status-info)', rejected:'var(--status-error)', hired:'var(--status-success)', withdrawn:'var(--text-tertiary)' };
const STATUS_LABELS = { submitted:'Received', under_review:'Under Review', shortlisted:'Shortlisted', interviewed:'Interview', rejected:'Rejected', hired:'Hired', withdrawn:'Withdrawn' };
const REC_COLORS   = { strong_yes:'var(--status-success)', yes:'var(--status-success)', maybe:'var(--status-warning)', no:'var(--status-error)' };
const REC_LABELS   = { strong_yes:'Strong Yes', yes:'Yes', maybe:'Maybe', no:'No' };

const s = {
    page: { padding: '32px 36px', fontFamily: "var(--font-body, system-ui), sans-serif", background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' },
    pageTitle: { fontSize: 26, fontWeight: 700, fontFamily: "var(--font-heading, serif), serif", marginBottom: 4 },
    pageSub: { fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 36 },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 },
    statCard: { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 12, padding: '20px 24px' },
    statVal: { fontSize: 36, fontWeight: 700, lineHeight: 1, marginBottom: 6 },
    statLabel: { fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 },
    card: { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 12, padding: '24px' },
    cardTitle: { fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 20 },
    barRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
    barLabel: { width: 110, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 },
    barTrack: { flex: 1, height: 8, background: 'var(--surface-input)', borderRadius: 4, overflow: 'hidden' },
    barFill: (pct, color) => ({ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }),
    barCount: { width: 32, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'right' },
    topJobRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line)', fontSize: 13 },
    topJobName: { color: 'var(--text-primary)', flex: 1 },
    topJobCount: { fontWeight: 700, color: 'var(--color-primary-500)' },
    badge: (color) => ({ display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `color-mix(in srgb, ${color} 13%, transparent)`, color }),
    conversionBox: { background: 'color-mix(in srgb, var(--status-success) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--status-success) 35%, transparent)', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20 },
    convPct: { fontSize: 48, fontWeight: 700, color: 'var(--status-success)', lineHeight: 1 },
    convLabel: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },
};

function BarChart({ data, colors, labels, total }) {
    if (!data || Object.keys(data).length === 0) return <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No data yet.</p>;
    return Object.entries(data).map(([key, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
            <div key={key} style={s.barRow}>
                <span style={s.barLabel}>{labels[key] ?? key}</span>
                <div style={s.barTrack}>
                    <div style={s.barFill(pct, colors[key] ?? 'var(--text-tertiary)')} />
                </div>
                <span style={s.barCount}>{count}</span>
            </div>
        );
    });
}

export default function AdminCareersStatsPage() {
    const { stats, statsLoading, fetchStats } = useAdminCareersStore();

    useEffect(() => { fetchStats(); }, []);

    if (statsLoading || !stats) {
        return (
            <div style={s.page}>
                <p style={s.pageTitle}>Careers Overview</p>
                <p style={{ color: 'var(--text-tertiary)' }}>Loading stats…</p>
            </div>
        );
    }

    return (
        <div style={s.page}>
            <style>{`
                @media (max-width: 768px) {
                    .stats-grid4 { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
                    .stats-grid2 { grid-template-columns: 1fr !important; }
                    .stats-conv  { flex-direction: column !important; gap: 16px !important; }
                    .stats-conv-right { border-left: none !important; border-top: 1px solid color-mix(in srgb, var(--status-success) 35%, transparent) !important; padding-left: 0 !important; padding-top: 16px !important; }
                }
                @media (max-width: 480px) {
                    .stats-grid4 { grid-template-columns: 1fr !important; }
                }
            `}</style>
            <AdminCareersHeader />
            <p style={s.pageTitle}>Careers Overview</p>
            <p style={s.pageSub}>Aggregate application statistics</p>

            {/* Top stats */}
            <div style={s.grid4} className="stats-grid4">
                <div style={s.statCard}>
                    <p style={s.statVal}>{stats.total ?? 0}</p>
                    <p style={s.statLabel}>Total Applications</p>
                </div>
                <div style={s.statCard}>
                    <p style={{ ...s.statVal, color: 'var(--color-primary-500)' }}>{stats.screened ?? 0}</p>
                    <p style={s.statLabel}>AI Screened</p>
                </div>
                <div style={s.statCard}>
                    <p style={{ ...s.statVal, color: 'var(--status-warning)' }}>{stats.unscreened ?? 0}</p>
                    <p style={s.statLabel}>Awaiting Screening</p>
                </div>
                <div style={s.statCard}>
                    <p style={{ ...s.statVal, color: 'var(--status-success)' }}>{stats.avg_ai_score ? Math.round(stats.avg_ai_score) : '—'}</p>
                    <p style={s.statLabel}>Avg AI Score</p>
                </div>
            </div>

            {/* Conversion rate */}
            {stats.conversion_rate != null && (
                <div style={{ ...s.conversionBox, marginBottom: 32 }} className="stats-conv">
                    <div>
                        <p style={s.convPct}>{stats.conversion_rate}%</p>
                        <p style={s.convLabel}>Hire conversion rate</p>
                    </div>
                    <div style={{ flex: 1, paddingLeft: 24, borderLeft: '1px solid color-mix(in srgb, var(--status-success) 35%, transparent)' }} className="stats-conv-right">
                        <p style={{ fontSize: 13, color: 'var(--status-success)', marginBottom: 4 }}>
                            {stats.by_status?.hired ?? 0} hired out of {stats.total ?? 0} total applications
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Across all job postings</p>
                    </div>
                </div>
            )}

            <div style={s.grid2} className="stats-grid2">
                {/* By status */}
                <div style={s.card}>
                    <p style={s.cardTitle}>Applications by Status</p>
                    <BarChart
                        data={stats.by_status}
                        colors={STATUS_COLORS}
                        labels={STATUS_LABELS}
                        total={stats.total}
                    />
                </div>

                {/* AI recommendation breakdown */}
                <div style={s.card}>
                    <p style={s.cardTitle}>AI Recommendation Breakdown</p>
                    {stats.screened > 0 ? (
                        <BarChart
                            data={stats.by_ai_recommendation}
                            colors={REC_COLORS}
                            labels={REC_LABELS}
                            total={stats.screened}
                        />
                    ) : (
                        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No applications screened yet.</p>
                    )}
                </div>
            </div>

            {/* Top jobs */}
            {stats.top_jobs?.length > 0 && (
                <div style={s.card}>
                    <p style={s.cardTitle}>Top Roles by Applications</p>
                    {stats.top_jobs.map((row, i) => (
                        <div key={i} style={s.topJobRow}>
                            <span style={s.topJobName}>{row.job?.title ?? '—'}</span>
                            {row.job?.department && (
                                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginRight: 16 }}>{row.job.department}</span>
                            )}
                            <span style={s.topJobCount}>{row.count}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}