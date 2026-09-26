import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import 'leaflet/dist/leaflet.css';
import { useThemeStore, useAuthStore } from './_shared/store/index';

import InstallPrompt from './_shared/components/common/InstallPrompt';
import AlgorithmBanner from './_shared/components/layout/AlgorithmBanner';
import BookmarkNote from './_shared/components/BookmarkNote';
import AiPanelRoot from './core/components/ai/AiPanelRoot';
import Mimi from './core/components/chat/Mimi';
import FloatingJournalModal from './core/components/finance/FloatingJournalModal';
import Portal from './_shared/pwa/Portal';
import PWANavBar from './_shared/pwa/PWANavBar';

import { FINANCE_READ } from './_shared/lib/roles';

// ── Auth Pages ────────────────────────────────────────────────────────────────
const Login               = lazy(() => import('./core/pages/auth/Login'));
const Register            = lazy(() => import('./core/pages/auth/Register'));
const OAuthCallback       = lazy(() => import('./core/pages/auth/OAuthCallback'));
const ForceChangePassword = lazy(() => import('./core/pages/auth/ForceChangePassword.jsx'));
const ForgotPassword      = lazy(() => import('./core/pages/auth/ForgotPassword'));
const ResetPassword       = lazy(() => import('./core/pages/auth/ResetPassword'));

// ── Customer Pages ────────────────────────────────────────────────────────────
const Home                 = lazy(() => import('./core/pages/customer/Home'));
const Products             = lazy(() => import('./core/pages/customer/Products'));
const ProductDetail        = lazy(() => import('./core/pages/customer/ProductDetail'));
const AuctionListPage      = lazy(() => import('./ecommerce/pages/customer/AuctionListPage'));
const AuctionDetailPage    = lazy(() => import('./ecommerce/pages/customer/AuctionDetailPage'));
const Cart                 = lazy(() => import('./core/pages/customer/Cart'));
const Wishlist             = lazy(() => import('./core/pages/customer/Wishlist'));
const QuoteList            = lazy(() => import('./core/pages/customer/QuoteList'));
const Checkout             = lazy(() => import('./core/pages/customer/Checkout'));
const MyOrders             = lazy(() => import('./core/pages/customer/MyOrders'));
const CustomerOrderDetail  = lazy(() => import('./core/pages/customer/OrderDetail'));
const Services             = lazy(() => import('./core/pages/customer/Services'));
const ServiceDetail        = lazy(() => import('./core/pages/customer/ServiceDetail'));
const SpecialsPage         = lazy(() => import('./core/pages/customer/SpecialsPage'));
const RequestQuote         = lazy(() => import('./core/pages/customer/RequestQuote'));
const MyQuoteRequests      = lazy(() => import('./core/pages/customer/MyQuoteRequests'));
const MyQuoteRequestDetail = lazy(() => import('./core/pages/customer/MyQuoteRequestDetail'));
const MyQuotes             = lazy(() => import('./core/pages/customer/MyQuotes'));
const CustomerQuoteDetail  = lazy(() => import('./core/pages/customer/CustomerQuoteDetail'));
const MyProjects           = lazy(() => import('./projects/pages/customer/MyProjects'));
const MyProjectDetail      = lazy(() => import('./projects/pages/customer/MyProjectDetail'));
const Profile              = lazy(() => import('./core/pages/customer/Profile'));
const About                = lazy(() => import('./core/pages/customer/About'));
const Contact              = lazy(() => import('./core/pages/customer/Contact'));
const Manual               = lazy(() => import('./core/pages/customer/Manual'));
const PolicyPage           = lazy(() => import('./_shared/components/legal/shared/PolicyPage'));
const PrivacyPolicy        = lazy(() => import('./_shared/components/legal/PrivacyPolicy'));
const TermsOfService       = lazy(() => import('./_shared/components/legal/TermsOfService'));
const CookiePolicy         = lazy(() => import('./_shared/components/legal/CookiePolicy'));
const CookieConsentBanner  = lazy(() => import('./_shared/components/legal/shared/CookieConsentBanner'));
const WebsitePolicy        = lazy(() => import('./_shared/components/legal/WebsitePolicy'));
const HamperPolicy         = lazy(() => import('./_shared/components/legal/HamperPolicy'));
const AiPolicy             = lazy(() => import('./_shared/components/legal/AiPolicy'));
const OrderPolicy          = lazy(() => import('./_shared/components/legal/OrderPolicy'));
const BookingPolicy        = lazy(() => import('./_shared/components/legal/BookingPolicy'));
const MyTickets            = lazy(() => import('./core/pages/customer/MyTickets'));
const MyTicketDetail       = lazy(() => import('./core/pages/customer/MyTicketDetail'));
const HamperListPage       = lazy(() => import('./core/pages/customer/HamperListPage'));
const HamperDetail         = lazy(() => import('./core/pages/customer/HamperDetail'));
const HamperCheckout       = lazy(() => import('./core/pages/customer/HamperCheckout'));
const MyHamperOrders       = lazy(() => import('./core/pages/customer/MyHamperOrders'));
const MyHamperOrderDetail  = lazy(() => import('./core/pages/customer/MyHamperOrderDetail'));
const BugReportPage        = lazy(() => import('./core/pages/customer/BugReportPage'));
const BugTrackerPage       = lazy(() => import('./core/pages/customer/BugTrackerPage'));
const MyBugReports         = lazy(() => import('./core/pages/customer/MyBugReports'));

const MyBookings           = lazy(() => import('./core/pages/customer/MyBookings'));
const MyBookingDetail      = lazy(() => import('./core/pages/customer/MyBookingDetail'));
const BookService          = lazy(() => import('./core/pages/customer/BookService'));

const BrochureListPage     = lazy(() => import('./core/pages/customer/BrochureListPage'));
const BrochureDetail       = lazy(() => import('./core/pages/customer/BrochureDetail'));
const PublicationDetail    = lazy(() => import('./core/pages/customer/PublicationDetail'));

import CareersLayout       from './careers/layouts/CareersLayout';
import CareersPage         from './careers/pages/CareersPage';
import JobDetailPage       from './careers/pages/JobDetailPage';
import ApplicantAuthPage   from './careers/pages/ApplicantAuthPage';
import ApplicantPortalPage from './careers/pages/ApplicantPortalPage';
import ApplicantGate       from './careers/components/ApplicantGate';
import ForgotPasswordPage  from './careers/pages/ForgotPasswordPage';
import ResetPasswordPage   from './careers/pages/ResetPasswordPage';
import ApplicantProfilePage    from './careers/pages/ApplicantProfilePage';
import ForceChangePasswordPage from './careers/pages/ForceChangePasswordPage';

import AboutCareersPage      from './careers/pages/Legal/AboutCareersPage';
import ContactCareersPage    from './careers/pages/Legal/ContactCareersPage';
import PrivacyPolicyPage     from './careers/pages/Legal/PrivacyPolicyPage';
import TermsOfServicePage    from './careers/pages/Legal/TermsOfServicePage';
import CookiePolicyPage       from './careers/pages/Legal/CookiePolicyPage';

import AdminJobsPage          from './careers/admin/pages/AdminJobsPage';
import AdminJobDetailPage     from './careers/admin/pages/AdminJobDetailPage';
import AdminApplicationsPage  from './careers/admin/pages/AdminApplicationsPage';
import AdminCareersStatsPage  from './careers/admin/pages/AdminCareersStatsPage';
import AdminApplicantsPage    from './careers/admin/pages/AdminApplicantsPage'
import AdminApplicantDetailPage from './careers/admin/pages/AdminApplicantDetailPage'

// ── Admin Pages ───────────────────────────────────────────────────────────────
const AdminProfile       = lazy(() => import('./core/pages/admin/AdminProfile'));
const AiAnalyticsSettings = lazy(() => import('./extras/pages/admin/ai-analytics/AiAnalyticsSettings'));
const AiKeysPage         = lazy(() => import('./extras/pages/admin/ai-analytics/AiKeysPage'));  
const AiModulesPage      = lazy(() => import('./extras/pages/admin/ai-analytics/AiModulesPage'));
const AiSessionsPage     = lazy(() => import('./extras/pages/admin/ai-analytics/AiSessionsPage'));
const MimiOverviewPage   = lazy(() => import('./extras/pages/admin/ai-analytics/MimiOverviewPage'));
const Mimisessionspage   = lazy(() => import('./extras/pages/admin/ai-analytics/MimiSessionsPage'));
const Mimiblockspage     = lazy(() => import('./extras/pages/admin/ai-analytics/MimiBlocksPage'));
const Mimiharmfulpage    = lazy(() => import('./extras/pages/admin/ai-analytics/MimiHarmfulPage'));

const Dashboard          = lazy(() => import('./core/pages/admin/Dashboard'));
const PolicySettings     = lazy(() => import('./core/pages/admin/settings/policies/PolicySettings'))
const AdminProducts      = lazy(() => import('./core/pages/admin/Products'));
const ProductForm        = lazy(() => import('./core/pages/admin/ProductForm'));
const AdminAuctions      = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctions'));
const AdminAuctionDetail = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctionDetail'));
const AdminAuctionCreator = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctionCreator'));
const AdminAuctionOrders   = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctionOrders'));
const AdminAuctionOrderPayments = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctionOrderPayments'));
const AdminAuctionOrderDetail = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctionOrderDetail'));
const Categories         = lazy(() => import('./core/pages/admin/Categories'));
const CategoryForm       = lazy(() => import('./core/pages/admin/CategoryForm'));
const Brands             = lazy(() => import('./core/pages/admin/Brands'));
const BrandForm          = lazy(() => import('./core/pages/admin/BrandForm'));
const AdminOrders        = lazy(() => import('./core/pages/admin/Orders'));
const OrderDetail        = lazy(() => import('./core/pages/admin/OrderDetail'));
const AdminServices      = lazy(() => import('./core/pages/admin/Services'));
const ServiceForm        = lazy(() => import('./core/pages/admin/ServiceForm'));
const ServiceCategories  = lazy(() => import('./core/pages/admin/ServiceCategories'));
const Work               = lazy(() => import('./core/pages/admin/Work'));
const QuoteRequests      = lazy(() => import('./core/pages/admin/QuoteRequests'));
const QuoteRequestDetail = lazy(() => import('./core/pages/admin/QuoteRequestDetail'));
const Quotes             = lazy(() => import('./core/pages/admin/Quotes'));
const QuoteCreatePage    = lazy(() => import('./core/pages/admin/QuoteCreatePage.jsx'));
const QuoteDetail        = lazy(() => import('./ecommerce/components/admin/quotes/QuoteDetail'));
const QuoteEdit          = lazy(() => import('./ecommerce/components/admin/quotes/QuoteEdit'));
const AdminCustomers     = lazy(() => import('./core/pages/admin/Customers'));
const CustomerDetail     = lazy(() => import('./core/pages/admin/CustomerDetail'));
const CreditDashboard    = lazy(() => import('./core/pages/admin/CreditDashboard'));
const CreditDetail       = lazy(() => import('./core/pages/admin/CustomerCreditDetail'));
const AdminReviews       = lazy(() => import('./core/pages/admin/Reviews'));
const Reports            = lazy(() => import('./core/pages/admin/Reports'));
const ProjectDashboard   = lazy(() => import('./projects/pages/admin/ProjectDashboard'));
const Projects           = lazy(() => import('./projects/pages/admin/Projects'));
const ProjectCreate      = lazy(() => import('./projects/pages/admin/ProjectCreate'));
const ProjectDetail      = lazy(() => import('./projects/pages/admin/ProjectDetail'));
const UsersPage          = lazy(() => import('./core/pages/admin/users/Users'));
const UserDetail         = lazy(() => import('./core/pages/admin/users/UserDetail'));
const EmployeeList       = lazy(() => import('./extras/pages/admin/employees/EmployeeList'));
const EmployeeDetail     = lazy(() => import('./extras/pages/admin/employees/EmployeeDetail'));
const EmployeeForm       = lazy(() => import('./extras/pages/admin/employees/EmployeeForm'));
const Referrals          = lazy(() => import('./core/pages/admin/referrals/Referrals'));
const ReferralDetail     = lazy(() => import('./core/pages/admin/referrals/ReferralDetail'));
const PromoCodes         = lazy(() => import('./core/pages/admin/referrals/PromoCodes'));
const PromoCodeDetail    = lazy(() => import('./core/pages/admin/referrals/PromoCodeDetail'));
const AdminTickets       = lazy(() => import('./core/pages/admin/Tickets'));
const AdminTicketDetail  = lazy(() => import('./core/pages/admin/TicketDetail'));
const ActivityLogs       = lazy(() => import('./core/pages/admin/ActivityLogs'));
const PaymentsDashboard  = lazy(() => import('./core/pages/admin/finance/PaymentsDashboard'));
const PaymentDetail      = lazy(() => import('./core/pages/admin/finance/PaymentDetail'));
const OrderPaymentsPanel = lazy(() => import('./core/pages/admin/finance/OrderPaymentsPanel'));
const InitiatePaymentModal = lazy(() => import('./core/pages/admin/finance/InitiatePaymentModal'));
const LoyaltyLedger        = lazy(() => import('./core/pages/admin/LoyaltyLedger'));
const LoyaltySettings      = lazy(() => import('./core/pages/admin/LoyaltySettings'));
const LoyaltyLedgerDetail  = lazy(() => import('./core/pages/admin/LoyaltyLedgerDetail'));
const AdminHampers         = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHampers'));
const AdminHamperDetail    = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHamperDetail'));
const AdminHamperEdit      = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHamperEdit'));
const AdminHamperCreate    = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHamperCreate'));
const AdminHamperOrderDetail = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHamperOrderDetail'));
const CustomerAlgorithmPanel = lazy(() => import('./core/pages/admin/CustomerAlgorithmPanel'));
const InventoryPage          = lazy(() => import('./core/pages/admin/InventoryPage'));
const CatalogueBoostPage     = lazy(() => import('./core/pages/admin/algorithm/CatalogueBoostPage'));
const FinancialNotes         = lazy(() => import('./core/pages/admin/finance/FinancialNotes'));
const ReconciliationPage     = lazy(() => import('./core/pages/admin/finance/ReconciliationPage'));
const ReconciliationDetail   = lazy(() => import('./core/pages/admin/finance/ReconciliationDetail'));
const DataEnginePage         = lazy(() => import('./extras/pages/admin/ai-analytics/DataEnginePage'));
const LogExportPage          = lazy(() => import('./core/pages/admin/LogExportPage'));

// ── Admin Delivery ────────────────────────────────────────────────────────────
const DeliveryOverviewPage    = lazy(() => import('./extras/pages/admin/delivery/DeliveryOverviewPage'));
const ManifestsPage           = lazy(() => import('./extras/pages/admin/delivery/ManifestsPage'));
const ManifestDetailPage      = lazy(() => import('./extras/pages/admin/delivery/ManifestDetailPage'));
const CreateManifestPage      = lazy(() => import('./extras/pages/admin/delivery/CreateManifestPage'))
const ManifestTransferPage    = lazy(() => import('./extras/pages/admin/delivery/ManifestTransferPage'));
const ManifestRoutePage       = lazy(() => import('./extras/pages/admin/delivery/ManifestRoutePage'));
const DriversPage             = lazy(() => import('./extras/pages/admin/delivery/DriversPage'));
const DriverDetailPage        = lazy(() => import('./extras/pages/admin/delivery/DriverDetailPage'));
const IncidentsPage           = lazy(() => import('./extras/pages/admin/delivery/IncidentsPage'));
const RatingsPage             = lazy(() => import('./extras/pages/admin/delivery/RatingsPage'));
const DeliveryReportsPage     = lazy(() => import('./extras/pages/admin/delivery/DeliveryReportsPage'));

// ── Driver Pages ──────────────────────────────────────────────────────────────
const DriverManifestsPage      = lazy(() => import('./extras/pages/admin/driver/DriverManifestsPage'));
const DriverManifestDetailPage = lazy(() => import('./extras/pages/admin/driver/DriverManifestDetailPage'));
const DriverRatingsPage        = lazy(() => import('./extras/pages/admin/driver/DriverRatingsPage'));
const DriverIncidentsPage      = lazy(() => import('./extras/pages/admin/driver/DriverIncidentsPage'));
const DeliveryInsightsPage     = lazy(() => import('./extras/pages/admin/delivery/DeliveryInsightsPage'));

const AdminBugReportsPage = lazy(() => import('./core/pages/admin/AdminBugReportsPage'));
const AdminDevNotesPage   = lazy(() => import('./core/pages/admin/AdminDevNotesPage'));
const AdminDevKeysPage    = lazy(() => import('./core/pages/admin/AdminDevKeysPage'));
const DevAuthPage         = lazy(() => import('./core/pages/admin/DevAuthPage'));
const DevPortalPage       = lazy(() => import('./core/pages/admin/DevPortalPage'));

const AdminBookings        = lazy(() => import('./core/pages/admin/AdminBookings'));
const AdminBookingDetail   = lazy(() => import('./core/pages/admin/AdminBookingDetail'));
const AdminBookingForm     = lazy(() => import('./core/pages/admin/AdminBookingForm'));
const AdminWorksheetForm   = lazy(() => import('./core/pages/admin/AdminWorksheetForm'));
const BookingSettings      = lazy(() => import('./core/pages/admin/BookingSettings'));

const CustomerShipmentTracking = lazy(() => import('./core/pages/customer/CustomerShipmentTracking'));
const CustomerDeliveryHistory  = lazy(() => import('./core/pages/customer/CustomerDeliveryHistoryPage'));

// ── Admin Settings Pages ──────────────────────────────────────────────────────
const AdminShell           = lazy(() => import('./_shared/components/layout/AdminShell'));
const ProductBulkPage      = lazy(() => import('./core/pages/admin/general/bulk/ProductBulkPage'));
const CustomerBulkPage     = lazy(() => import('./core/pages/admin/general/bulk/CustomerBulkPage'));
const EmployeeBulkPage     = lazy(() => import('./core/pages/admin/general/bulk/EmployeeBulkPage'));

const StudioEditor         = lazy(() => import('./core/components/studio/StudioEditor'));
const PublicationListPage  = lazy(() => import('./core/pages/admin/PublicationListPage'));
const VaultPage            = lazy(() => import('./core/pages/admin/vault/VaultPage'));

const Settings             = lazy(() => import('./core/pages/admin/settings/Settings'));
const FlowchartPage        = lazy(() => import('./core/pages/admin/settings/diagrams/FlowchartPage'));  
const CustFlowchartPage    = lazy(() => import('./core/pages/admin/settings/diagrams/CustFlowchartPage'));
const TxFlowchartPage      = lazy(() => import('./core/pages/admin/settings/diagrams/TxFlowchartPage'));
const AnalyticDashboard    = lazy(() => import('./core/pages/admin/settings/analytics/AdminAnalyticsDashboard'));
const AnalyticsDetail      = lazy(() => import('./core/pages/admin/settings/analytics/AdminAnalyticsDetail'));
const CurrencySettings     = lazy(() => import('./core/pages/admin/settings/CurrencySettings'));
const UnitsOfMeasure       = lazy(() => import('./core/pages/admin/settings/UnitsOfMeasure'));
const TaxCompliance        = lazy(() => import('./core/pages/admin/tax/TaxCompliance'));
const WithholdingCompliance = lazy(() => import('./core/pages/admin/tax/WithholdingCompliance'));
const ShippingSettings     = lazy(() => import('./core/pages/admin/settings/ShippingSettings'));
const CustomerTierSettings = lazy(() => import('./core/pages/admin/settings/CustomerTierSettings'));

const GeneralSettings      = lazy(() => import('./core/pages/admin/settings/GeneralSettings'));
const NotificationSettings = lazy(() => import('./core/pages/admin/settings/NotificationSettings'));
const SecuritySettings     = lazy(() => import('./core/pages/admin/settings/SecuritySettings'));
const EmailSettings        = lazy(() => import('./core/pages/admin/settings/EmailSettings'));
const BackupSettings       = lazy(() => import('./core/pages/admin/settings/BackupSettings'));
const AppearanceSettings   = lazy(() => import('./core/pages/admin/settings/AppearanceSettings'));
const IntegrationSettings  = lazy(() => import('./core/pages/admin/settings/IntegrationSettings'));
const AboutSettings        = lazy(() => import('./core/pages/admin/settings/content/AboutSettings'));
const ContactSettings      = lazy(() => import('./core/pages/admin/settings/content/ContactSettings'));
const ManualSettings       = lazy(() => import('./core/pages/admin/settings/content/ManualSettings'));
const HomepageSettings     = lazy(() => import('./core/pages/admin/settings/content/HomepageSettings'));
const FooterSettings       = lazy(() => import('./core/pages/admin/settings/content/FooterSettings'));

// ── Page loading fallback ─────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary, #ffffff)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid #f3f4f6',
        borderTopColor: '#a855f7',
        animation: 'spin 600ms linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ── Protected Route ───────────────────────────────────────────────────────────
function ProtectedRoute({ children, requireAdmin = false, requireSuperAdmin = false, roles = null }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Super admin only routes
  if (requireSuperAdmin && user?.role !== 'super_admin') {
    return <Navigate to="/admin" replace />;
  }

  // Admin routes (includes admin, super_admin, manager, finance, logistics, sales_rep)
  if (requireAdmin) {
    const allowedRoles = ['admin', 'super_admin', 'manager', 'logistics', 'finance', 'sales_rep', 'driver'];
    if (!allowedRoles.includes(user?.role)) {
      return <Navigate to="/" replace />;
    }
  }

  // Narrower role list for a specific route (e.g. finance pages)
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

// ── Role Based Profile Component ──────────────────────────────────────────────
function RoleBasedProfile() {
  const { user } = useAuthStore();
  
  const isStaff = ['admin', 'super_admin', 'manager', 'logistics', 'finance', 'sales_rep'].includes(user?.role);
  
  return isStaff ? <AdminProfile /> : <Profile />;
}

function PWARedirect() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isPWA && pathname === '/') {
      navigate('/portal', { replace: true });
    }
  }, []);

  return null;
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <HelmetProvider>
      <Router>
        {/* Toast Notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--toast-bg)',
              color: 'var(--toast-color)',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#fff',
              },
            },
          }}
        />

        <PWARedirect />  
        <InstallPrompt />
        <AlgorithmBanner /> 
        <BookmarkNote />
        <Mimi />
        <AiPanelRoot />
        <FloatingJournalModal />
        <CookieConsentBanner /> 
        <PWANavBar /> 

        {/* All routes are lazy — Suspense handles the loading state */}
        <Suspense fallback={<PageLoader />}>
          <Routes>

            {/* ── Public Routes ───────────────────────────────────────────── */}
            <Route path="/" element={
              window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
                ? <Portal />
                : <Home />
            } />
            <Route path="/home" element={<Home />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/auctions" element={<AuctionListPage />} />
            <Route path="/auctions/:id" element={<AuctionDetailPage />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/services" element={<Services />} />
            <Route path="/specials" element={<SpecialsPage />} />
            <Route path="/services/:id" element={<ServiceDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/quote-list" element={<QuoteList />} />

            {/* Content Pages — public, no auth required */}
            <Route path="/about"   element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/manual"  element={<Manual />} />

            {/* ── Legal / Policy Routes ─────────────────────────────────────────── */}
            <Route path="/privacy"          element={<PrivacyPolicy />} />
            <Route path="/terms"            element={<TermsOfService />} />
            <Route path="/cookies"          element={<CookiePolicy />} />
            <Route path="/website-policy"   element={<WebsitePolicy />} />
            <Route path="/hamper-policy"    element={<HamperPolicy />} />
            <Route path="/order-policy"     element={<OrderPolicy />} />
            <Route path="/booking-policy"   element={<BookingPolicy />} />
            <Route path="ai-policy"         element={<AiPolicy />} />


            <Route path="/brochures" element={<BrochureListPage />} />
            <Route path="/brochures/:slug" element={<BrochureDetail />} />
            <Route path="/news/:slug" element={<PublicationDetail />} />
            <Route path="/blog/:slug" element={<PublicationDetail />} />

            <Route path="/report-bug"        element={<BugReportPage />} />
            <Route path="/track-bug"         element={<BugTrackerPage />} />
            <Route path="/track-bug/:token"  element={<BugTrackerPage />} />

            <Route path="/dev/auth"   element={<DevAuthPage />} />
            <Route path="/dev/portal" element={<DevPortalPage />} />

            {/* ── Auth Routes ─────────────────────────────────────────────── */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/force-change-password" element={<ForceChangePassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route element={<CareersLayout />}>
                <Route path="/careers/about"          element={<AboutCareersPage />} />
                <Route path="/careers/contact"        element={<ContactCareersPage />} />
                <Route path="/careers/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/careers/terms"          element={<TermsOfServicePage />} />
                <Route path="/careers/cookies"        element={<CookiePolicyPage />} />
                
                <Route path="/careers"          element={<CareersPage />} />
                <Route path="/careers/:slug"    element={<JobDetailPage />} />
                <Route path="/careers/login"    element={<ApplicantAuthPage />} />
                <Route path="/careers/register" element={<ApplicantAuthPage />} />
                <Route path="/careers/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/careers/reset-password"  element={<ResetPasswordPage />} />
                <Route path="/careers/portal"   element={
                    <ApplicantGate>
                        <ApplicantPortalPage />
                    </ApplicantGate>
                } />
                <Route path="/careers/portal/profile" element={
                  <ApplicantGate>
                      <ApplicantProfilePage />
                  </ApplicantGate>} />

                <Route path="/careers/portal/change-password" element={
                  <ApplicantGate>
                    <ForceChangePasswordPage />
                  </ApplicantGate>} />
            </Route>

            {/* ── Protected Customer Routes ────────────────────────────────── */}
            <Route path="/hampers" element={<ProtectedRoute><HamperListPage /></ProtectedRoute>} />
            <Route path="/hampers/my-orders" element={<ProtectedRoute><MyHamperOrders /></ProtectedRoute>} />
            <Route path="/hampers/my-orders/:id" element={<ProtectedRoute><MyHamperOrderDetail /></ProtectedRoute>} />
            <Route path="/hampers/:slug" element={<ProtectedRoute><HamperDetail /></ProtectedRoute>} />
            <Route path="/hampers/:slug/checkout" element={<ProtectedRoute><HamperCheckout /></ProtectedRoute>} />

            <Route path="/bookings"      element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
            <Route path="/bookings/:id"  element={<ProtectedRoute><MyBookingDetail /></ProtectedRoute>} />
            <Route path="/services/:id/book" element={<ProtectedRoute><BookService /></ProtectedRoute>} />
            <Route path="/account/bug-reports" element={<ProtectedRoute><MyBugReports /></ProtectedRoute>} />
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <Checkout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <MyOrders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <ProtectedRoute>
                  <CustomerOrderDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id/shipment"
              element={
                <ProtectedRoute>
                  <CustomerShipmentTracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/delivery-history"
              element={
                <ProtectedRoute>
                  <CustomerDeliveryHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/request-quote"
              element={
                <ProtectedRoute>
                  <RequestQuote />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-quote-requests"
              element={
                <ProtectedRoute>
                  <MyQuoteRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-quote-requests/:id"
              element={
                <ProtectedRoute>
                  <MyQuoteRequestDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-quotes"
              element={
                <ProtectedRoute>
                  <MyQuotes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-quotes/:id"
              element={
                <ProtectedRoute>
                  <CustomerQuoteDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-tickets"
              element={
                <ProtectedRoute>
                  <MyTickets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-tickets/:id"
              element={
                <ProtectedRoute>
                  <MyTicketDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            {/* ── Profile Route (Auto-detects admin vs customer) ───────────────── */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <RoleBasedProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-projects"
              element={
                <ProtectedRoute>
                  <MyProjects />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-projects/:id"
              element={
                <ProtectedRoute>
                  <MyProjectDetail />
                </ProtectedRoute>
              }
            />

            {/* ── Admin Routes ─────────────────────────────────────────────── */}
            {/* One frame (sidebar, section tabs, Ctrl+K) for every /admin and /driver page */}
            <Route element={<ProtectedRoute requireAdmin><AdminShell /></ProtectedRoute>}>
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/admin/settings/policy" 
                element={
                  <ProtectedRoute requireAdmin>
                    <PolicySettings />
                  </ProtectedRoute>
                } 
              />
              {/* Admin Career Management */}
              <Route path="/admin/careers" element={
                  <ProtectedRoute requireAdmin>
                      <AdminCareersStatsPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/jobs" element={
                  <ProtectedRoute requireAdmin>
                      <AdminJobsPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/jobs/:id" element={
                  <ProtectedRoute requireAdmin>
                      <AdminJobDetailPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/applications" element={
                  <ProtectedRoute requireAdmin>
                      <AdminApplicationsPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/applicants"    element={
                <ProtectedRoute requireAdmin>
                  <AdminApplicantsPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/careers/applicants/:id" element={
                <ProtectedRoute requireAdmin>
                  <AdminApplicantDetailPage />
                </ProtectedRoute>
              } />

              {/* Admin Profile */}
              <Route
                path="/admin/profile"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminProfile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/products"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminProducts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/products/create"
                element={
                  <ProtectedRoute requireAdmin>
                    <ProductForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/products/:id/edit"
                element={
                  <ProtectedRoute requireAdmin>
                    <ProductForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/vault"
                element={
                  <ProtectedRoute requireAdmin>
                    <VaultPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/hampers" element={<ProtectedRoute requireAdmin><AdminHampers /></ProtectedRoute>} />
              <Route path="/admin/hampers/create" element={<ProtectedRoute requireAdmin><AdminHamperCreate /></ProtectedRoute>} />
              <Route path="/admin/hampers/orders/:id" element={<ProtectedRoute requireAdmin><AdminHamperOrderDetail /></ProtectedRoute>} />
              <Route path="/admin/hampers/:id" element={<ProtectedRoute requireAdmin><AdminHamperDetail /></ProtectedRoute>} />    
              <Route path="/admin/hampers/:id/edit" element={<ProtectedRoute requireAdmin><AdminHamperEdit /></ProtectedRoute>} />

              <Route path="/admin/bookings"              element={<ProtectedRoute requireAdmin><AdminBookings /></ProtectedRoute>} />
              <Route path="/admin/bookings/create"       element={<ProtectedRoute requireAdmin><AdminBookingForm /></ProtectedRoute>} />
              <Route path="/admin/bookings/:id"          element={<ProtectedRoute requireAdmin><AdminBookingDetail /></ProtectedRoute>} />
              <Route path="/admin/bookings/:id/worksheets/:wsId" element={<ProtectedRoute requireAdmin><AdminWorksheetForm /></ProtectedRoute>} />
              <Route path="/admin/settings/bookings"     element={<ProtectedRoute requireAdmin><BookingSettings /></ProtectedRoute>} />

              <Route path="/admin/bug-reports" element={<ProtectedRoute requireAdmin><AdminBugReportsPage /></ProtectedRoute>} />
              <Route path="/admin/dev-notes"   element={<ProtectedRoute requireAdmin><AdminDevNotesPage /></ProtectedRoute>} />
              <Route path="/admin/dev-keys"    element={<ProtectedRoute requireAdmin><AdminDevKeysPage /></ProtectedRoute>} />
              <Route
                path="/admin/ai-analytics"
                element={
                  <ProtectedRoute requireAdmin>
                    <AiAnalyticsSettings /> 
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/ai-analytics/keys"
                element={
                  <ProtectedRoute requireAdmin>
                    <AiKeysPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/ai-analytics/modules"
                element={
                  <ProtectedRoute requireAdmin>
                    <AiModulesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/ai-analytics/sessions"
                element={
                  <ProtectedRoute requireAdmin>
                    <AiSessionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/ai-analytics/mimi"
                element={
                  <ProtectedRoute requireAdmin>
                    <MimiOverviewPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/ai-analytics/mimi-sessions"
                element={
                  <ProtectedRoute requireAdmin>
                    <Mimisessionspage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/ai-analytics/mimi-eligibility"
                element={
                  <ProtectedRoute requireAdmin>
                    <Mimiblockspage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/ai-analytics/mimi-harmful"
                element={
                  <ProtectedRoute requireAdmin>
                    <Mimiharmfulpage />
                  </ProtectedRoute>
                }
              />
              {/* ── Admin Delivery Routes ─────────────────────────────────────────── */}
              {/* Overview */}
              <Route
                path="/admin/delivery"
                element={
                  <ProtectedRoute requireAdmin>
                    <DeliveryOverviewPage />
                  </ProtectedRoute>
                }
              />

              {/* Manifests */}
              <Route
                path="/admin/delivery/manifests"
                element={
                  <ProtectedRoute requireAdmin>
                    <ManifestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/create"
                element={
                  <ProtectedRoute requireAdmin>
                    <CreateManifestPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <ManifestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/transfer"
                element={
                  <ProtectedRoute requireAdmin>
                    <ManifestTransferPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/:id/route"
                element={
                  <ProtectedRoute requireAdmin>
                    <ManifestRoutePage />
                  </ProtectedRoute>
                }
              />

              {/* Drivers */}
              <Route
                path="/admin/delivery/drivers"
                element={
                  <ProtectedRoute requireAdmin>
                    <DriversPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/drivers/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <DriverDetailPage />
                  </ProtectedRoute>
                }
              />

              {/* Incidents */}
              <Route
                path="/admin/delivery/incidents"
                element={
                  <ProtectedRoute requireAdmin>
                    <IncidentsPage />
                  </ProtectedRoute>
                }
              />

              {/* Ratings */}
              <Route
                path="/admin/delivery/ratings"
                element={
                  <ProtectedRoute requireAdmin>
                    <RatingsPage />
                  </ProtectedRoute>
                }
              />

              {/* AI Insights */}
              <Route
                path="/admin/delivery/insights"
                element={
                  <ProtectedRoute requireAdmin>
                    <DeliveryInsightsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/insights/:entityType"
                element={
                  <ProtectedRoute requireAdmin>
                    <DeliveryInsightsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/insights/:entityType/:entityId"
                element={
                  <ProtectedRoute requireAdmin>
                    <DeliveryInsightsPage />
                  </ProtectedRoute>
                }
              />

              {/* Reports */}
              <Route
                path="/admin/delivery/reports"
                element={
                  <ProtectedRoute requireAdmin>
                    <DeliveryReportsPage />
                  </ProtectedRoute>
                }
              />

              {/* ── Driver Routes ─────────────────────────────────────────────────── */}

              <Route
                path="/driver/manifests"
                element={
                  <ProtectedRoute>
                    <DriverManifestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/driver/manifests/:id"
                element={
                  <ProtectedRoute>
                    <DriverManifestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/driver/ratings"
                element={
                  <ProtectedRoute>
                    <DriverRatingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/driver/incidents"
                element={
                  <ProtectedRoute>
                    <DriverIncidentsPage />
                  </ProtectedRoute>
                }
              />
              {/* Admin Auction Routes */}
              <Route
                path="/admin/auctions"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminAuctions />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/admin/auctions/create" 
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminAuctionCreator />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/auction-orders" 
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminAuctionOrders />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/auction-orders/:id" 
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminAuctionOrderDetail />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/auction-orders/:id/payments" 
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminAuctionOrderPayments />
                  </ProtectedRoute>
                }
              />
              {/* Admin Auction Detail/Edit */}
              <Route
                path="/admin/auctions/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminAuctionDetail />
                  </ProtectedRoute>
                }
              />

              {/* Admin Service Routes */}
              <Route
                path="/admin/services"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminServices />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/services/new"
                element={
                  <ProtectedRoute requireAdmin>
                    <ServiceForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/services/:id/edit"
                element={
                  <ProtectedRoute requireAdmin>
                    <ServiceForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/service-categories"
                element={
                  <ProtectedRoute requireAdmin>
                    <ServiceCategories />
                  </ProtectedRoute>
                }
              />

              {/* Categories Routes */}
              <Route
                path="/admin/categories"
                element={
                  <ProtectedRoute requireAdmin>
                    <Categories />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/categories/create"
                element={
                  <ProtectedRoute requireAdmin>
                    <CategoryForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/categories/:id/edit"
                element={
                  <ProtectedRoute requireAdmin>
                    <CategoryForm />
                  </ProtectedRoute>
                }
              />

              {/* Brands Routes */}
              <Route
                path="/admin/brands"
                element={
                  <ProtectedRoute requireAdmin>
                    <Brands />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/brands/create"
                element={
                  <ProtectedRoute requireAdmin>
                    <BrandForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/brands/:id/edit"
                element={
                  <ProtectedRoute requireAdmin>
                    <BrandForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/orders"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminOrders />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/orders/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <OrderDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/orders/:id/ship"
                element={
                  <ProtectedRoute requireAdmin>
                    <OrderDetail />
                  </ProtectedRoute>
                }
              />

              {/* Admin Quote Request Routes */}
              <Route
                path="/admin/quote-requests"
                element={
                  <ProtectedRoute requireAdmin>
                    <QuoteRequests />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/quote-requests/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <QuoteRequestDetail />
                  </ProtectedRoute>
                }
              />

              {/* Admin Quote Routes */}
              <Route
                path="/admin/quotes"
                element={
                  <ProtectedRoute requireAdmin>
                    <Quotes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/quotes/create"
                element={
                  <ProtectedRoute requireAdmin>
                    <QuoteCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/quotes/new"
                element={
                  <ProtectedRoute requireAdmin>
                    <QuoteEdit />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/quotes/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <QuoteDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/quotes/:id/edit"
                element={
                  <ProtectedRoute requireAdmin>
                    <QuoteEdit />
                  </ProtectedRoute>
                }
              />

              {/* Payments Dashboard */}
              <Route
                path="/admin/finance/payments"
                element={
                  <ProtectedRoute requireAdmin>
                    <PaymentsDashboard />
                  </ProtectedRoute>
                }
              />
              {/* Payment Detail */}
              <Route
                path="/admin/finance/payments/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <PaymentDetail />
                  </ProtectedRoute>
                }
              />
              {/* Order Payment History (embedded panel) */}
              <Route
                path="/admin/orders/:id/payments"
                element={
                  <ProtectedRoute requireAdmin>
                    <OrderPaymentsPanel />
                  </ProtectedRoute>
                }
              />

              {/* Projects */}
              <Route
                path="/admin/projects"
                element={
                  <ProtectedRoute requireAdmin>
                    <ProjectDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/projects/list"
                element={
                  <ProtectedRoute requireAdmin>
                    <Projects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/projects/create"
                element={
                  <ProtectedRoute requireAdmin>
                    <ProjectCreate />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/projects/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <ProjectDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/work"
                element={
                  <ProtectedRoute requireAdmin>
                    <Work />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/publications"
                element={
                  <ProtectedRoute requireAdmin>
                    <PublicationListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/publications/:id/edit"
                element={
                  <ProtectedRoute requireAdmin>
                    <StudioEditor />
                  </ProtectedRoute>
                }
              />

              {/* Customers & Users */}
              <Route
                path="/admin/customers"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminCustomers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/customers/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <CustomerDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/credit"
                element={
                  <ProtectedRoute requireAdmin>
                    <CreditDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/credit/customers/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <CreditDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute requireAdmin>
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <UserDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/employees"
                element={
                  <ProtectedRoute requireAdmin>
                    <EmployeeList />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/employees/create"
                element={
                  <ProtectedRoute requireAdmin>
                    <EmployeeForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/employees/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <EmployeeDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/employees/:id/edit"
                element={
                  <ProtectedRoute requireAdmin>
                    <EmployeeForm />
                  </ProtectedRoute>
                }
              />

              {/* Referrals & Promo Codes */}
              <Route
                path="/admin/referrals"
                element={
                  <ProtectedRoute requireAdmin>
                    <Referrals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/referrals/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <ReferralDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/promo-codes"
                element={
                  <ProtectedRoute requireAdmin>
                    <PromoCodes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/promo-codes/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <PromoCodeDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/reviews"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminReviews />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/loyalty"
                element={
                  <ProtectedRoute requireAdmin>
                    <LoyaltyLedger />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/loyalty/settings"
                element={
                  <ProtectedRoute requireAdmin>
                    <LoyaltySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/loyalty/:customerId"
                element={
                  <ProtectedRoute requireAdmin>
                    <LoyaltyLedgerDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/tickets"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminTickets />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/tickets/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminTicketDetail />
                  </ProtectedRoute>
                }
              />

              {/* Admin Reports */}
              <Route
                path="/admin/reports"
                element={
                  <ProtectedRoute requireAdmin>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/logs"
                element={
                  <ProtectedRoute requireAdmin>
                    <ActivityLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/inventory"
                element={
                  <ProtectedRoute requireAdmin>
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/algorithm"
                element={
                  <ProtectedRoute requireAdmin>
                    <CustomerAlgorithmPanel />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/algorithm/catalogue-boosts"
                element={
                  <ProtectedRoute requireAdmin>
                    <CatalogueBoostPage />
                  </ProtectedRoute>}
              />

              {/* ── Financial Notes ─────────────────────────────────────────── */}
              <Route
                path="/admin/financial-notes"
                element={
                  <ProtectedRoute requireAdmin>
                    <FinancialNotes />
                  </ProtectedRoute>
                }
              />

              {/* ── Reconciliation ──────────────────────────────────────────── */}
              <Route
                path="/admin/reconciliation"
                element={
                  <ProtectedRoute requireAdmin>
                    <ReconciliationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/reconciliation/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <ReconciliationDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/data-engine"
                element={
                  <ProtectedRoute requireAdmin>
                    <DataEnginePage />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/admin/logs/export" 
                element={
                    <ProtectedRoute requireAdmin>
                        <LogExportPage />
                    </ProtectedRoute>
                } 
              />

              {/* Admin Settings */}
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute requireAdmin>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/flowchart/orders"
                element={
                  <ProtectedRoute requireAdmin>
                    <FlowchartPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/flowchart/customers"
                element={
                  <ProtectedRoute requireAdmin>
                    <CustFlowchartPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/flowchart/transactions"
                element={
                  <ProtectedRoute requireAdmin>
                    <TxFlowchartPage />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/admin/settings/analytics"
                element={
                  <ProtectedRoute requireAdmin>
                    <AnalyticDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/analytics/:id"
                element={
                  <ProtectedRoute requireAdmin>
                    <AnalyticsDetail />
                  </ProtectedRoute>
                }
              />
              {/* Tax & withholding hubs — finance roles only (mirrors the API) */}
              <Route
                path="/admin/tax"
                element={
                  <ProtectedRoute requireAdmin roles={FINANCE_READ}>
                    <TaxCompliance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/withholding"
                element={
                  <ProtectedRoute requireAdmin roles={FINANCE_READ}>
                    <WithholdingCompliance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/units"
                element={
                  <ProtectedRoute requireAdmin>
                    <UnitsOfMeasure />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/currency"
                element={
                  <ProtectedRoute requireAdmin>
                    <CurrencySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/customer-tiers"
                element={
                  <ProtectedRoute requireAdmin>
                    <CustomerTierSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/shipping"
                element={
                  <ProtectedRoute requireAdmin>
                    <ShippingSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/general"
                element={
                  <ProtectedRoute requireAdmin>
                    <GeneralSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/general/bulk/products"
                element={
                  <ProtectedRoute requireAdmin>
                    <ProductBulkPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/general/bulk/customers"
                element={
                  <ProtectedRoute requireAdmin>
                    <CustomerBulkPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/general/bulk/employees"
                element={
                  <ProtectedRoute requireAdmin>
                    <EmployeeBulkPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/notifications"
                element={
                  <ProtectedRoute requireAdmin>
                    <NotificationSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/security"
                element={
                  <ProtectedRoute requireAdmin>
                    <SecuritySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/email"
                element={
                  <ProtectedRoute requireAdmin>
                    <EmailSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/backup"
                element={
                  <ProtectedRoute requireAdmin>
                    <BackupSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/appearance"
                element={
                  <ProtectedRoute requireAdmin>
                    <AppearanceSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/integrations"
                element={
                  <ProtectedRoute requireAdmin>
                    <IntegrationSettings />
                  </ProtectedRoute>
                }
              />

              {/* Content Pages Routes */}
              <Route
                path="/admin/settings/content/about"
                element={
                  <ProtectedRoute requireAdmin>
                    <AboutSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/contact"
                element={
                  <ProtectedRoute requireAdmin>
                    <ContactSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/manual"
                element={
                  <ProtectedRoute requireAdmin>
                    <ManualSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/homepage"
                element={
                  <ProtectedRoute requireAdmin>
                    <HomepageSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/footer"
                element={
                  <ProtectedRoute requireAdmin>
                    <FooterSettings />
                  </ProtectedRoute>
                }
              />

            </Route>

            {/* ── 404 Page ─────────────────────────────────────────────────── */}
            <Route
              path="*"
              element={
                <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                  <div className="text-center">
                    <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">
                      404
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                      Page not found
                    </p>
                    <a
                      href="/"
                      className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                    >
                      Go Home
                    </a>
                  </div>
                </div>
              }
            />

          </Routes>
        </Suspense>
      </Router>
    </HelmetProvider>
  );
}

export default App;