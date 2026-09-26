// careers/pages/legal/AboutCareersPage.jsx
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Briefcase, Globe, Zap } from 'lucide-react';
import LegalLayout, { H2, P, InfoBox } from '../../layouts/LegalLayout';

const VALUES = [
    { icon: Zap,       label: 'Driven',       desc: 'We move fast and hold ourselves to a high standard. Every team member has real ownership.' },
    { icon: Users,     label: 'Collaborative', desc: 'Great work happens in great teams. We invest in each other and build together.' },
    { icon: Globe,     label: 'Grounded',      desc: 'We serve East African industry. That context shapes everything we build and how we work.' },
    { icon: Briefcase, label: 'Purposeful',    desc: 'We are building infrastructure that matters - supply chains, services, and systems that last.' },
];

export default function AboutCareersPage() {
    return (
        <LegalLayout eyebrow="About TISL" title="Build the future of industrial supply.">

            <InfoBox>
                TISL is East Africa's industrial supply platform, connecting businesses with the
                equipment, services, and expertise they need to operate at scale.
            </InfoBox>

            <H2>Who We Are</H2>
            <P>
                We're still putting the finishing touches on this section, check back soon for the full story. 
                In the meantime, if you have questions about who we are or what we do, feel free to reach out to us 
                directly at web@targetisl.co.ke and a member of our team will be happy to help.
            </P>
            <P>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec auctor, nunc id aliquet
                tincidunt, nisl nunc tincidunt nunc, id lacinia nunc nunc id nunc. Lorem ipsum dolor sit
                amet, consectetur adipiscing elit. Donec auctor, nunc id aliquet tincidunt, nisl nunc
                tincidunt nunc, id lacinia nunc nunc id nunc.
            </P>

            <H2>Our Team</H2>
            <P>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut 
                labore et dolore magna aliqua. Ut enim ad minim veniam, 
                quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. 
                Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. 
                Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            </P>

            <H2>Our Values</H2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, margin: '24px 0 32px' }}>
                {VALUES.map(({ icon: Icon, label, desc }) => (
                    <div key={label} style={{
                        background: '#161616', border: '1px solid #1e1e1e',
                        borderRadius: 10, padding: '20px 22px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <span style={{
                                width: 30, height: 30, borderRadius: 7,
                                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <Icon size={14} color="#fff" strokeWidth={2} />
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0e0' }}>{label}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#777', lineHeight: 1.7 }}>{desc}</p>
                    </div>
                ))}
            </div>

            <H2>Why Join Us</H2>
            <P>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec auctor, nunc id aliquet
                tincidunt, nisl nunc tincidunt nunc, id lacinia nunc nunc id nunc.
            </P>

            <div style={{ marginTop: 32 }}>
                <Link
                    to="/careers"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '11px 22px', borderRadius: 8,
                        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                        color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    }}
                >
                    View open roles <ArrowRight size={15} />
                </Link>
            </div>
        </LegalLayout>
    );
}