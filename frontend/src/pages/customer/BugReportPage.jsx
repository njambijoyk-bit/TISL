import { Bug } from 'lucide-react';
import '../../styles/bug.css';
import Header from '../../components/layout/Header';
import BugReportForm from '../../components/bugs/BugReportForm';
import MimiFooter from '../../components/bugs/MimiFooter';

// Replace with your actual auth hook, e.g. useAuth() from your context
// import { useAuth } from '../../context/AuthContext';

/**
 * BugReportPage — /report-bug
 * Public standalone page. Works for guests, customers, and admins.
 */
export default function BugReportPage() {
  // const { user } = useAuth();
  const user = null; // swap with real auth

  return (
    <div className="bug-page">
      <Header />
      <main className="bug-main">
        <div className="bug-container">

          {/* page header */}
          <div className="bug-flex-col bug-gap-2">
            <div className="bug-flex bug-items-center bug-gap-2.5">
              <div className="bug-icon-box bug-icon-box-md bug-icon-box-blue">
                <Bug size={18} />
              </div>
              <h1 className="bug-text-2xl bug-font-bold bug-text">Report a Bug</h1>
            </div>
            <p className="bug-text-sm bug-text-muted" style={{ paddingLeft: 2 }}>
              Found something broken? Let us know and we'll get it fixed.
            </p>
          </div>

          {/* form card */}
          <div className="bug-card-2xl">
            <BugReportForm
              isModal={false}
              currentUser={user}
            />
          </div>
        </div>
      </main>

      <MimiFooter />
    </div>
  );
}
