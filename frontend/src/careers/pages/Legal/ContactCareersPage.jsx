// careers/pages/legal/ContactCareersPage.jsx
import { Mail, MapPin, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import LegalLayout, { H2, P, InfoBox } from '../../layouts/LegalLayout';

const CONTACTS = [
    {
        icon: Mail,
        label: 'Recruitment Enquiries',
        value: 'web@targetisl.co.ke',
        href: 'mailto:web@targetisl.co.ke',
        sub: 'For application questions, interview scheduling, and role queries',
    },
    {
        icon: Mail,
        label: 'General',
        value: 'web@targetisl.co.ke',
        href: 'mailto:web@targetisl.co.ke',
        sub: 'For privacy, data, or account-related requests',
    },
    {
        icon: MapPin,
        label: 'Location',
        value: 'Nairobi, Kenya',
        href: null,
        sub: 'We are based in Nairobi and serve clients across East Africa',
    },
    {
        icon: Clock,
        label: 'Response Time',
        value: 'Within 2 business days',
        href: null,
        sub: 'Monday – Friday, 8 AM – 6 PM EAT',
    },
];

export default function ContactCareersPage() {
    return (
        <LegalLayout eyebrow="Get in Touch" title="Contact Us">

            <InfoBox>
                Have a question about a role, your application, or the hiring process?
                We're happy to help, reach out using the details below.
            </InfoBox>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '0 0 48px' }}>
                {CONTACTS.map(({ icon: Icon, label, value, href, sub }) => (
                    <div key={label} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 16,
                        background: '#161616', border: '1px solid #1e1e1e',
                        borderRadius: 10, padding: '18px 22px',
                    }}>
                        <span style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0, marginTop: 2,
                            background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Icon size={16} color="#a855f7" strokeWidth={1.8} />
                        </span>
                        <div>
                            <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555' }}>
                                {label}
                            </p>
                            {href ? (
                                <a href={href} style={{ fontSize: 15, fontWeight: 600, color: '#c084fc', textDecoration: 'none' }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#c084fc'}
                                >
                                    {value}
                                </a>
                            ) : (
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#d0d0d0' }}>{value}</p>
                            )}
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#555' }}>{sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            <H2>Applying for a Role?</H2>
            <P>
                If you have a question about a specific position or haven't heard back about
                your application, please email <strong style={{ color: '#d0d0d0' }}>web@targetisl.co.ke</strong> with
                your full name and the role you applied for and we'll look into it.
            </P>

            <H2>Already Applied?</H2>
            <P>
                You can check your application status at any time from your portal dashboard.
            </P>

            <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link
                    to="/careers/portal"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '11px 22px', borderRadius: 8,
                        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                        color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    }}
                >
                    My Applications <ArrowRight size={15} />
                </Link>
                <Link
                    to="/careers"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '11px 22px', borderRadius: 8,
                        border: '1px solid #2a2a2a', background: 'transparent',
                        color: '#888', fontSize: 14, fontWeight: 500, textDecoration: 'none',
                    }}
                >
                    View Open Roles
                </Link>
            </div>
        </LegalLayout>
    );
}