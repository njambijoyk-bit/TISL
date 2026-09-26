// careers/pages/legal/PrivacyPolicyPage.jsx
import LegalLayout, { H2, P, Ul, Li, Highlight, InfoBox } from '../../layouts/LegalLayout';

export default function PrivacyPolicyPage() {
    return (
        <LegalLayout eyebrow="Legal" title="Privacy Policy" lastUpdated="May 2026">

            <InfoBox>
                This Privacy Policy explains how TISL collects, uses, and protects personal information
                you provide when using the TISL Careers portal.
            </InfoBox>

            <H2>1. Information We Collect</H2>
            <P>When you create an applicant account or submit a job application, we collect:</P>
            <Ul>
                <Li><Highlight>Identity information</Highlight> - first name, last name, email address</Li>
                <Li><Highlight>Professional information</Highlight> - current role, years of experience, LinkedIn URL, portfolio URL</Li>
                <Li><Highlight>Contact information</Highlight> - phone number, location</Li>
                <Li><Highlight>Application materials</Highlight> - cover letters, uploaded documents (CVs, certificates, etc.)</Li>
            </Ul>

            <H2>2. How We Use Your Information</H2>
            <P>We use the information you provide to:</P>
            <Ul>
                <Li>Process and evaluate your job applications</Li>
                <Li>Communicate with you regarding your application status</Li>
                <Li>Maintain your applicant account and portal access</Li>
                <Li>Send transactional emails (application confirmations, status updates, password resets)</Li>
                <Li>Comply with legal and regulatory obligations</Li>
            </Ul>

            <H2>3. Data Sharing</H2>
            <P>
                We do not sell, rent, or trade your personal information to third parties.
                Your data may be accessed by TISL hiring managers and HR personnel involved in the
                recruitment process. We do not share your information with external recruiters or
                advertising platforms.
            </P>

            <H2>4. Data Retention</H2>
            <P>
                We retain your applicant profile and application data for up to <Highlight>24 months</Highlight> after
                your last activity on the portal. You may request deletion of your data at any time by
                contacting us at <Highlight>web@targetisl.co.ke</Highlight>.
            </P>

            <H2>5. Security</H2>
            <P>
                We implement industry-standard security measures including encrypted passwords, HTTPS
                transmission, and token-based authentication to protect your personal data. Access to
                applicant data is restricted to authorised TISL personnel only.
            </P>

            <H2>6. Your Rights</H2>
            <P>You have the right to:</P>
            <Ul>
                <Li>Access the personal data we hold about you</Li>
                <Li>Correct inaccurate or incomplete information via your profile page</Li>
                <Li>Request deletion of your account and associated data</Li>
                <Li>Withdraw a job application at any time</Li>
            </Ul>

            <H2>7. Cookies</H2>
            <P>
                The Careers portal uses essential cookies for authentication and session management.
                See our <a href="/careers/cookies" style={{ color: '#a855f7' }}>Cookie Policy</a> for details.
            </P>

            <H2>8. Contact</H2>
            <P>
                For privacy-related enquiries, contact us at <Highlight>web@targetisl.co.ke</Highlight> or
                visit our <a href="/careers/contact" style={{ color: '#a855f7' }}>Contact page</a>.
            </P>
        </LegalLayout>
    );
}