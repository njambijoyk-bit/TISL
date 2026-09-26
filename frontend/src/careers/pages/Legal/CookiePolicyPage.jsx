// careers/pages/legal/CookiePolicyPage.jsx
import LegalLayout, { H2, P, Ul, Li, Highlight, InfoBox } from '../../layouts/LegalLayout';

export default function CookiePolicyPage() {
    return (
        <LegalLayout eyebrow="Legal" title="Cookie Policy" lastUpdated="May 2026">

            <InfoBox>
                The TISL Careers portal uses a small number of essential cookies to function correctly.
                We do not use advertising or tracking cookies.
            </InfoBox>

            <H2>1. What Are Cookies</H2>
            <P>
                Cookies are small text files stored on your device by your browser. They help websites
                remember information about your visit, such as your login session.
            </P>

            <H2>2. Cookies We Use</H2>
            <P>The Careers portal uses only essential cookies necessary for the site to function:</P>
            <Ul>
                <Li>
                    <Highlight>Authentication token</Highlight> - stored in your browser's local storage
                    to keep you logged in to the applicant portal. Cleared when you sign out.
                </Li>
                <Li>
                    <Highlight>Session cookie</Highlight> - a short-lived cookie used to maintain
                    your browsing session. Expires when you close your browser.
                </Li>
            </Ul>

            <H2>3. Cookies We Do Not Use</H2>
            <P>We do not use:</P>
            <Ul>
                <Li>Advertising or retargeting cookies</Li>
                <Li>Analytics tracking cookies (e.g. Google Analytics)</Li>
                <Li>Social media tracking pixels</Li>
                <Li>Third-party cookies of any kind</Li>
            </Ul>

            <H2>4. Managing Cookies</H2>
            <P>
                You can control cookies through your browser settings. Disabling essential cookies
                may prevent you from logging in or using the applicant portal. Clearing your browser's
                local storage will sign you out of the portal.
            </P>

            <H2>5. Changes to This Policy</H2>
            <P>
                If we introduce new cookies in the future, this policy will be updated accordingly.
                We will notify registered applicants of material changes.
            </P>

            <H2>6. Contact</H2>
            <P>
                Cookie-related questions? Contact us at <Highlight>web@targetisl.co.ke</Highlight>.
            </P>
        </LegalLayout>
    );
}