// careers/pages/legal/TermsOfServicePage.jsx
import LegalLayout, { H2, P, Ul, Li, Highlight, InfoBox } from '../../layouts/LegalLayout';

export default function TermsOfServicePage() {
    return (
        <LegalLayout eyebrow="Legal" title="Terms of Service" lastUpdated="May 2026">

            <InfoBox>
                By creating an account or submitting an application through the TISL Careers portal,
                you agree to these Terms of Service. Please read them carefully.
            </InfoBox>

            <H2>1. Acceptance of Terms</H2>
            <P>
                These terms govern your use of the TISL Careers portal. By registering or applying
                for a position, you confirm that you have read, understood, and agree to be bound
                by these terms.
            </P>

            <H2>2. Eligibility</H2>
            <P>To use the Careers portal you must:</P>
            <Ul>
                <Li>Be at least 18 years of age</Li>
                <Li>Provide accurate and truthful information in your profile and applications</Li>
                <Li>Not create multiple accounts for the same individual</Li>
            </Ul>

            <H2>3. Your Account</H2>
            <P>
                You are responsible for maintaining the confidentiality of your account credentials.
                You agree to notify us immediately at <Highlight>web@targetisl.co.ke</Highlight> if
                you suspect any unauthorised access to your account.
            </P>

            <H2>4. Application Conduct</H2>
            <P>When submitting applications you agree to:</P>
            <Ul>
                <Li>Provide accurate, complete, and up-to-date information</Li>
                <Li>Only upload documents you own or have the right to share</Li>
                <Li>Not submit applications on behalf of another person without their consent</Li>
                <Li>Not attempt to manipulate or circumvent the application process</Li>
            </Ul>

            <H2>5. Intellectual Property</H2>
            <P>
                All content on the TISL Careers portal — including branding, design, and copy — is
                the property of TISL. You may not reproduce, distribute, or create derivative works
                without our written permission.
            </P>

            <H2>6. Uploaded Content</H2>
            <P>
                You retain ownership of documents you upload (CVs, certificates, etc.). By uploading,
                you grant TISL a non-exclusive licence to store and use those documents solely for
                the purpose of evaluating your application.
            </P>

            <H2>7. Account Termination</H2>
            <P>
                TISL reserves the right to suspend or terminate accounts that violate these terms,
                provide false information, or engage in abusive behaviour toward our team.
                You may delete your account at any time by contacting us.
            </P>

            <H2>8. Limitation of Liability</H2>
            <P>
                TISL is not liable for any indirect or consequential loss arising from your use of
                the Careers portal, including unsuccessful applications or service interruptions.
                The portal is provided "as is" without warranties of any kind.
            </P>

            <H2>9. Changes to These Terms</H2>
            <P>
                We may update these terms from time to time. Continued use of the portal after
                changes are posted constitutes acceptance of the updated terms. We will notify
                registered applicants of material changes by email.
            </P>

            <H2>10. Governing Law</H2>
            <P>
                These terms are governed by the laws of Kenya. Any disputes shall be subject to
                the exclusive jurisdiction of the Kenyan courts.
            </P>

            <H2>11. Contact</H2>
            <P>
                Questions about these terms? Reach us at <Highlight>web@targetisl.co.ke</Highlight>.
            </P>
        </LegalLayout>
    );
}