// ApplicantGate.jsx — fixed
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useCareersStore from '../../store/useCareersStore';
import { getApplicantToken } from '../../api/careersApi';

export default function ApplicantGate({ children }) {
    const navigate  = useNavigate();
    const location  = useLocation();
    const fetchMe   = useCareersStore((s) => s.fetchMe);
    const applicant = useCareersStore((s) => s.applicant);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const token = getApplicantToken();

        if (!token) {
            // No token at all — go to login immediately
            navigate(
                `/careers/login?next=${encodeURIComponent(location.pathname)}`,
                { replace: true }
            );
            return;
        }

        // Token exists but applicant may not be in store (e.g. fresh tab)
        if (!applicant) {
            fetchMe().finally(() => setChecking(false));
        } else {
            setChecking(false);
        }
    }, []);

    // After checking: if admin forced a password reset, redirect to change page
    // unless we're already on it (avoid redirect loop)
    const mustChange = applicant?.must_change_password;
    const onChangePage = location.pathname === '/careers/portal/change-password';
    if (!checking && mustChange && !onChangePage) {
        navigate('/careers/portal/change-password', { replace: true });
        return null;
    }

    if (checking) return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      color: '#555', fontFamily: "'DM Sans', sans-serif" }}>
            Verifying session…
        </div>
    );

    // fetchMe cleared the token (401) — redirect
    if (!getApplicantToken()) {
        navigate(`/careers/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
        return null;
    }

    return children;
}