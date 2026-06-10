import { useNavigate } from 'react-router-dom';
import Header from '../layout/Header';
import Footer from '../layout/Footer';
import { ChevronLeft, Shield, Bot, Eye, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import logo from '../../assets/images/logo.png';

const LAST_UPDATED = '9 June 2025';
const VERSION      = 'v1.0';

function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'rgba(168,85,247,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} style={{ color: '#7c3aed' }} />
        </div>
        <h2 style={{
          margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827',
          letterSpacing: '-0.01em',
        }}>{title}</h2>
      </div>
      <div style={{
        fontSize: '0.92rem', lineHeight: 1.9, color: '#374151',
        fontFamily: 'Georgia, "Times New Roman", serif',
        paddingLeft: 42,
      }}>
        {children}
      </div>
    </div>
  );
}

function P({ style, children }) {
  return <p style={{ margin: 0, color: '#374151', ...style }}>{children}</p>;
}

function Li({ children }) {
  return <li style={{ marginBottom: 6, paddingLeft: 4, color: '#374151' }}>{children}</li>;
}

function Ul({ children }) {
  return <ul style={{ margin: '0 0 12px', paddingLeft: 20, color: '#374151' }}>{children}</ul>;
}

export default function AiPolicy() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa', colorScheme: 'light' }}>
      <Header />

      <main style={{ flex: 1, maxWidth: 860, margin: '0 auto', width: '100%', padding: '40px 24px 64px' }}>

        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '0.78rem', fontWeight: 600, color: '#6b7280',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginBottom: 32, fontFamily: 'inherit',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
          onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
        >
          <ChevronLeft size={15} /> Back
        </button>

        <div style={{
          background: 'white', borderRadius: 16,
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 20px rgba(0,0,0,0.06)',
          overflow: 'hidden', position: 'relative',
          colorScheme: 'light',
        }}>

          {/* Watermark */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 0,
          }}>
            <img src={logo} alt="" style={{
              width: 320, height: 320, objectFit: 'contain',
              opacity: 0.04, filter: 'blur(2px) grayscale(100%)',
              userSelect: 'none',
            }} />
          </div>

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Header band */}
            <div style={{
              padding: '32px 40px 28px',
              borderBottom: '1px solid #f3f4f6',
              background: 'linear-gradient(135deg, rgba(168,85,247,0.03), rgba(124,58,237,0.02))',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: 99, marginBottom: 14,
                background: 'rgba(168,85,247,0.06)', color: '#7c3aed',
                border: '1px solid rgba(168,85,247,0.2)',
                fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <Bot size={10} /> AI Assistant Policy
              </div>

              <h1 style={{
                fontSize: '1.75rem', fontWeight: 900, color: '#111827',
                letterSpacing: '-0.02em', margin: '0 0 10px', lineHeight: 1.2,
              }}>
                Mimi AI Assistant — Usage Policy
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                  Version <strong style={{ color: '#7c3aed' }}>{VERSION}</strong>
                </span>
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                  Last updated: {LAST_UPDATED}
                </span>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '36px 40px' }}>

              <Section icon={Bot} title="What is Mimi?">
                <P style={{ marginBottom: 12 }}>
                  Mimi is TISL Store's AI-powered chat assistant, designed to help customers and guests explore our products and services, track orders, manage quotes, and get answers to general store questions.
                </P>
                <P>
                  Mimi is powered by Google Gemini, a large language model. While we configure and guide Mimi's behaviour through system prompts and safety filters, her responses are generated by an AI and may occasionally be imprecise. Always verify critical details — such as pricing, stock availability, or payment instructions — through official store channels.
                </P>
              </Section>

              <Section icon={Eye} title="What data Mimi can access">
                <P style={{ marginBottom: 12 }}>
                  Mimi's access to your data depends on whether you are logged in:
                </P>
                <Ul>
                  <Li><strong style={{ color: '#111827' }}>Guests</strong> — Mimi can only see public store information: products, services, categories, and general store details. No personal data is accessible.</Li>
                  <Li><strong style={{ color: '#111827' }}>Logged-in customers</strong> — Mimi can see your profile summary, recent orders and payment status, active quotes, projects, promo codes, and referral code. This data is scoped strictly to your account and is never shared with other users.</Li>
                  <Li><strong style={{ color: '#111827' }}>Staff</strong> — Mimi has access to broader store data including customer lookups, order management, payment summaries, and admin statistics, based on your assigned role.</Li>
                </Ul>
                <P>
                  Mimi never has access to your password, full payment card details, or M-Pesa PINs. She will never ask you for these.
                </P>
              </Section>

              <Section icon={Lock} title="How your conversations are stored">
                <P style={{ marginBottom: 12 }}>
                  Every message sent to Mimi is logged in our secure database. Each conversation is associated with a session, which records:
                </P>
                <Ul>
                  <Li>Your actor type (customer, staff, or guest)</Li>
                  <Li>Your IP address</Li>
                  <Li>The query you sent and Mimi's response</Li>
                  <Li>Whether the query was flagged or detected as harmful</Li>
                  <Li>Response time and status</Li>
                </Ul>
                <P>
                  Logs are retained for internal moderation, safety review, and service improvement purposes. Authorised TISL admins may review flagged or harmful queries. Conversation logs are not sold or shared with third parties.
                </P>
              </Section>

              <Section icon={AlertTriangle} title="Content restrictions">
                <P style={{ marginBottom: 12 }}>
                  Mimi is configured to decline requests that fall outside TISL Store's scope or that violate our content policies. This includes but is not limited to:
                </P>
                <Ul>
                  <Li>Requests for harmful, violent, or sexually explicit content</Li>
                  <Li>Attempts to extract information about other customers or staff</Li>
                  <Li>Social engineering or phishing-style prompts</Li>
                  <Li>Instructions for illegal activities</Li>
                  <Li>Hate speech, harassment, or discriminatory language</Li>
                </Ul>
                <P>
                  Repeated harmful queries may result in your access to Mimi being suspended. TISL staff can manually block actors at any time at their discretion.
                </P>
              </Section>

              <Section icon={RefreshCw} title="Accuracy and limitations">
                <P style={{ marginBottom: 12 }}>
                  Mimi's responses are AI-generated and based on live store data provided at the time of your query. She may occasionally make errors, misunderstand context, or provide outdated information if store data has changed mid-session.
                </P>
                <P style={{ marginBottom: 12 }}>
                  Mimi is not a substitute for human support. For complex issues — disputed payments, account suspension, legal matters, or anything requiring a firm commitment from TISL — please contact our support team directly at{' '}
                  <a href="mailto:web@targetisl.co.ke" style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}>web@targetisl.co.ke</a>.
                </P>
                <P>
                  TISL Store accepts no liability for actions taken based solely on Mimi's responses without verification from official channels.
                </P>
              </Section>

              <Section icon={Shield} title="Changes to this policy">
                <P>
                  This policy may be updated as Mimi's capabilities evolve. The version number and last updated date at the top of this page reflect the most current revision. Continued use of Mimi following a policy update constitutes acceptance of the revised terms.
                </P>
              </Section>

            </div>

            {/* Footer note */}
            <div style={{
              padding: '14px 40px', borderTop: '1px solid #f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 8,
            }}>
              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0 }}>
                This document governs your use of the Mimi AI assistant on TISL Store. It does not constitute a legal contract of service.
              </p>
              <img src={logo} alt="TISL" style={{ height: 20, opacity: 0.4, objectFit: 'contain' }} />
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}