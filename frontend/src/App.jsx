import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import 'leaflet/dist/leaflet.css';
import { useThemeStore, useAuthStore, useModuleStore, useLocationStore } from './_shared/store/index';
import ModuleRoute from './_shared/components/routing/ModuleRoute';

import InstallPrompt from './_shared/components/common/InstallPrompt';
import AlgorithmBanner from './_shared/components/layout/AlgorithmBanner';
import BookmarkNote from './_shared/components/BookmarkNote';
import AiPanelRoot from './core/components/ai/AiPanelRoot';
import Mimi from './core/components/chat/Mimi';
import MemoDock from './core/components/finance/MemoDock';
import Portal from './_shared/pwa/Portal';
import PWANavBar from './_shared/pwa/PWANavBar';

import { hasPermission, isDriver, isStaff } from './_shared/lib/roles';

// ── Auth Pages ────────────────────────────────────────────────────────────────
const Login               = lazy(() => import('./core/pages/auth/Login'));
const Register            = lazy(() => import('./core/pages/auth/Register'));
const OAuthCallback       = lazy(() => import('./core/pages/auth/OAuthCallback'));
const ForceChangePassword = lazy(() => import('./core/pages/auth/ForceChangePassword.jsx'));
const ForgotPassword      = lazy(() => import('./core/pages/auth/ForgotPassword'));
const StockAlertStop      = lazy(() => import('./core/pages/customer/StockAlertStop'));
const ReminderStop        = lazy(() => import('./core/pages/customer/ReminderStop'));
const ResetPassword       = lazy(() => import('./core/pages/auth/ResetPassword'));

// ── Customer Pages ────────────────────────────────────────────────────────────
const Home                 = lazy(() => import('./core/pages/customer/Home'));
const Products             = lazy(() => import('./ecommerce/pages/customer/Products'));
const ProductDetail        = lazy(() => import('./ecommerce/pages/customer/ProductDetail'));
const CampaignsPage        = lazy(() => import('./campaigns/pages/public/CampaignsPage'));
const CampaignPage         = lazy(() => import('./campaigns/pages/public/CampaignPage'));
const WorldPage            = lazy(() => import('./campaigns/pages/public/WorldPage'));
const PinPage              = lazy(() => import('./campaigns/pages/public/PinPage'));
const BoardPage            = lazy(() => import('./campaigns/pages/public/BoardPage'));
const MyBoardsPage         = lazy(() => import('./campaigns/pages/public/MyBoardsPage'));
const MyBoardPage          = lazy(() => import('./campaigns/pages/public/MyBoardPage'));
const MyMoodboardsPage     = lazy(() => import('./campaigns/pages/public/MyMoodboardsPage'));
const MyMoodboardPage      = lazy(() => import('./campaigns/pages/public/MyMoodboardPage'));
const MoodboardsPage       = lazy(() => import('./campaigns/pages/public/MoodboardsPage'));
const MoodboardPage        = lazy(() => import('./campaigns/pages/public/MoodboardPage'));
const MoodboardList        = lazy(() => import('./campaigns/pages/admin/MoodboardList'));
const MoodboardEditor      = lazy(() => import('./campaigns/pages/admin/MoodboardEditor'));
const CampaignList         = lazy(() => import('./campaigns/pages/admin/CampaignList'));
const PinLibrary           = lazy(() => import('./campaigns/pages/admin/PinLibrary'));
const BoardList            = lazy(() => import('./campaigns/pages/admin/BoardList'));
const BoardEditor          = lazy(() => import('./campaigns/pages/admin/BoardEditor'));
const CampaignEditor       = lazy(() => import('./campaigns/pages/admin/CampaignEditor'));
const AuctionListPage      = lazy(() => import('./ecommerce/pages/customer/AuctionListPage'));
const AuctionDetailPage    = lazy(() => import('./ecommerce/pages/customer/AuctionDetailPage'));
const Cart                 = lazy(() => import('./core/pages/customer/Cart'));
const Wishlist             = lazy(() => import('./ecommerce/pages/customer/Wishlist'));
const Checkout             = lazy(() => import('./core/pages/customer/Checkout'));
const MyOrders             = lazy(() => import('./core/pages/customer/MyOrdersPage'));
const CustomerOrderDetail  = lazy(() => import('./core/pages/customer/CustomerOrderPage'));
const Services             = lazy(() => import('./ecommerce/pages/customer/Services'));
const ServiceDetail        = lazy(() => import('./ecommerce/pages/customer/ServiceDetail'));
const SpecialsPage         = lazy(() => import('./ecommerce/pages/customer/SpecialsPage'));
const MyAccount            = lazy(() => import('./core/pages/customer/MyAccount'));
const MyGiftVouchers       = lazy(() => import('./core/pages/customer/MyGiftVouchers'));
const RequestQuote         = lazy(() => import('./core/pages/customer/RequestQuote'));
const MyQuotes             = lazy(() => import('./core/pages/customer/MyQuotations'));
const CustomerQuoteDetail  = lazy(() => import('./core/pages/customer/CustomerQuotationDetail'));
const MyProjects           = lazy(() => import('./projects/pages/customer/MyProjects'));
const MyProjectDetail      = lazy(() => import('./projects/pages/customer/MyProjectDetail'));
const Profile              = lazy(() => import('./core/pages/customer/Profile'));
const CustomerAppearance   = lazy(() => import('./core/pages/customer/AppearanceSettings'));
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
const AuctionTerms         = lazy(() => import('./_shared/components/legal/AuctionTerms'));
const BookingPolicy        = lazy(() => import('./_shared/components/legal/BookingPolicy'));
const MyTickets            = lazy(() => import('./core/pages/customer/MyTickets'));
const MyTicketDetail       = lazy(() => import('./core/pages/customer/MyTicketDetail'));
const HamperListPage       = lazy(() => import('./ecommerce/pages/customer/HamperListPage'));
const HamperDetail         = lazy(() => import('./ecommerce/pages/customer/HamperDetail'));
const BugReportPage        = lazy(() => import('./core/pages/customer/BugReportPage'));
const BugTrackerPage       = lazy(() => import('./core/pages/customer/BugTrackerPage'));
const MyBugReports         = lazy(() => import('./core/pages/customer/MyBugReports'));



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
const MimiKnowledgePage  = lazy(() => import('./extras/pages/admin/ai-analytics/MimiKnowledgePage'));

const Dashboard          = lazy(() => import('./core/pages/admin/Dashboard'));
const PolicySettings     = lazy(() => import('./core/pages/admin/settings/policies/PolicySettings'))
const AdminProducts      = lazy(() => import('./ecommerce/pages/admin/Products'));
const ProductForm        = lazy(() => import('./ecommerce/pages/admin/ProductForm'));
const AdminPurchases     = lazy(() => import('./core/pages/admin/stock/Purchases'));
const PurchaseForm       = lazy(() => import('./core/pages/admin/stock/PurchaseForm'));
const ExpiringStock      = lazy(() => import('./core/pages/admin/stock/ExpiringStock'));
const HeldStock          = lazy(() => import('./core/pages/admin/stock/HeldStock'));
const Vendors            = lazy(() => import('./core/pages/admin/stock/Vendors'));
const StockTransfers     = lazy(() => import('./core/pages/admin/stock/StockTransfers'));
const StockCounts        = lazy(() => import('./core/pages/admin/stock/StockCounts'));
const Recipes            = lazy(() => import('./menus/pages/admin/Recipes'));
const StockJournal       = lazy(() => import('./core/pages/admin/stock/StockJournal'));
const StockReports       = lazy(() => import('./core/pages/admin/stock/StockReports'));
const StockJobs          = lazy(() => import('./core/pages/admin/stock/StockJobs'));
const AdminAuctions      = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctions'));
const AdminAuctionDetail = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctionDetail'));
const AdminAuctionCreator = lazy(() => import('./ecommerce/pages/admin/auctions/AdminAuctionCreator'));
const Categories         = lazy(() => import('./ecommerce/pages/admin/Categories'));
const CategoryForm       = lazy(() => import('./ecommerce/pages/admin/CategoryForm'));
const Brands             = lazy(() => import('./ecommerce/pages/admin/Brands'));
const BrandForm          = lazy(() => import('./ecommerce/pages/admin/BrandForm'));
const AdminServices      = lazy(() => import('./ecommerce/pages/admin/Services'));
const ServiceForm        = lazy(() => import('./ecommerce/pages/admin/ServiceForm'));
const ServiceCategories  = lazy(() => import('./ecommerce/pages/admin/ServiceCategories'));
const Brochures          = lazy(() => import('./ecommerce/pages/admin/Brochures'));
const PriceLists         = lazy(() => import('./ecommerce/pages/admin/PriceLists'));
const PriceListEditor    = lazy(() => import('./ecommerce/pages/admin/PriceListEditor'));
const PriceListView      = lazy(() => import('./ecommerce/pages/admin/PriceListView'));
const PriceListArchive   = lazy(() => import('./ecommerce/pages/admin/PriceListArchive'));
const Catalogues         = lazy(() => import('./ecommerce/pages/admin/Catalogues'));
const CatalogueEditor    = lazy(() => import('./ecommerce/pages/admin/CatalogueEditor'));
const CatalogueItems     = lazy(() => import('./ecommerce/pages/admin/CatalogueItems'));
const CatalogueSettings  = lazy(() => import('./ecommerce/pages/admin/CatalogueSettings'));
const CustomerBrochures  = lazy(() => import('./ecommerce/pages/customer/Brochures'));
const CustomerPriceLists = lazy(() => import('./ecommerce/pages/customer/PriceListsPage'));
const CustomerPriceList  = lazy(() => import('./ecommerce/pages/customer/PriceListPublic'));
const Bookings           = lazy(() => import('./core/pages/admin/calendar/Bookings'));
const MyBookings         = lazy(() => import('./core/pages/customer/MyBookings'));
const MyCalendar         = lazy(() => import('./core/pages/admin/calendar/MyCalendar'));
const TeamCalendar       = lazy(() => import('./core/pages/admin/calendar/TeamCalendar'));
const StaffResources     = lazy(() => import('./core/pages/admin/calendar/StaffResources'));
const EngagementSettings = lazy(() => import('./extras/pages/admin/EngagementSettings'));
const ServiceSettings    = lazy(() => import('./ecommerce/pages/admin/ServiceSettings'));
const Quotes             = lazy(() => import('./core/pages/admin/quotations/QuotationsPage'));
const QuoteDetail        = lazy(() => import('./core/pages/admin/quotations/QuotationDetailPage'));
const QuoteEdit          = lazy(() => import('./core/pages/admin/quotations/QuotationEditPage'));
const AdminCustomers     = lazy(() => import('./core/pages/admin/Customers'));
const CustomerDetail     = lazy(() => import('./core/pages/admin/CustomerDetail'));
const CreditDashboard    = lazy(() => import('./core/pages/admin/CreditDashboard'));
const CreditDetail       = lazy(() => import('./core/pages/admin/CustomerCreditDetail'));
const EngagementQueue    = lazy(() => import('./extras/pages/admin/EngagementQueue'));
const BooksHub           = lazy(() => import('./core/pages/admin/books/BooksHub'));
const VoucherForm        = lazy(() => import('./core/pages/admin/books/VoucherForm'));
const Verification       = lazy(() => import('./core/pages/admin/verification/Verification'));
const MyPayslips         = lazy(() => import('./core/pages/admin/payroll/MyPayslips'));
const Payroll            = lazy(() => import('./core/pages/admin/payroll/Payroll'));
const Gratuity           = lazy(() => import('./core/pages/admin/payroll/Gratuity'));
const PayrollSettings    = lazy(() => import('./core/pages/admin/payroll/PayrollSettings'));
const Attendance         = lazy(() => import('./core/pages/admin/attendance/Attendance'));
const PettyCash          = lazy(() => import('./core/pages/admin/books/PettyCash'));
const CashPage           = lazy(() => import('./core/pages/admin/books/CashPage'));
const ChequeRegister     = lazy(() => import('./core/pages/admin/books/ChequeRegister'));
const EditLog            = lazy(() => import('./core/pages/admin/books/EditLog'));
const VoucherView        = lazy(() => import('./core/pages/admin/books/VoucherView'));
const ReturnFromInvoice  = lazy(() => import('./core/pages/admin/books/ReturnFromInvoice'));
const OrdersRegister     = lazy(() => import('./core/pages/admin/books/OrdersRegister'));
const OtherCompanies     = lazy(() => import('./core/pages/admin/books/OtherCompanies'));
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
const LoyaltyLedger        = lazy(() => import('./core/pages/admin/LoyaltyLedger'));
const LoyaltySettings      = lazy(() => import('./core/pages/admin/LoyaltySettings'));
const LoyaltyLedgerDetail  = lazy(() => import('./core/pages/admin/LoyaltyLedgerDetail'));
const AdminHampers         = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHampers'));
const AdminHamperDetail    = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHamperDetail'));
const AdminHamperEdit      = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHamperEdit'));
const AdminHamperCreate    = lazy(() => import('./ecommerce/pages/admin/hampers/AdminHamperCreate'));
const CustomerAlgorithmPanel = lazy(() => import('./core/pages/admin/CustomerAlgorithmPanel'));
const InventoryPage          = lazy(() => import('./core/pages/admin/InventoryPage'));
const CatalogueBoostPage     = lazy(() => import('./core/pages/admin/algorithm/CatalogueBoostPage'));
const MemorandaRegister      = lazy(() => import('./core/pages/admin/books/MemorandaRegister'));
const MemorandumForm         = lazy(() => import('./core/pages/admin/books/MemorandumForm'));
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
const DriverProfilePage        = lazy(() => import('./extras/pages/admin/driver/DriverProfilePage'));
const DriverRatingsPage        = lazy(() => import('./extras/pages/admin/driver/DriverRatingsPage'));
const DriverIncidentsPage      = lazy(() => import('./extras/pages/admin/driver/DriverIncidentsPage'));
const DeliveryInsightsPage     = lazy(() => import('./extras/pages/admin/delivery/DeliveryInsightsPage'));

const AdminBugReportsPage = lazy(() => import('./core/pages/admin/AdminBugReportsPage'));
const AdminDevNotesPage   = lazy(() => import('./core/pages/admin/AdminDevNotesPage'));
const AdminDevKeysPage    = lazy(() => import('./core/pages/admin/AdminDevKeysPage'));
const DevAuthPage         = lazy(() => import('./core/pages/admin/DevAuthPage'));
const DevPortalPage       = lazy(() => import('./core/pages/admin/DevPortalPage'));


const CustomerShipmentTracking = lazy(() => import('./core/pages/customer/CustomerShipmentTracking'));
const CustomerEnroute          = lazy(() => import('./core/pages/customer/CustomerEnroute'));
const CustomerDeliveryHistory  = lazy(() => import('./core/pages/customer/CustomerDeliveryHistoryPage'));

// ── Admin Settings Pages ──────────────────────────────────────────────────────
const AdminShell           = lazy(() => import('./_shared/components/layout/AdminShell'));
const ProductBulkPage      = lazy(() => import('./core/pages/admin/general/bulk/ProductBulkPage'));
const CustomerBulkPage     = lazy(() => import('./core/pages/admin/general/bulk/CustomerBulkPage'));
const EmployeeBulkPage     = lazy(() => import('./core/pages/admin/general/bulk/EmployeeBulkPage'));

const VaultPage            = lazy(() => import('./core/pages/admin/vault/VaultPage'));

const Settings             = lazy(() => import('./core/pages/admin/settings/Settings'));
const ModuleCenter         = lazy(() => import('./core/pages/admin/settings/ModuleCenter'));
const StockSettings        = lazy(() => import('./core/pages/admin/settings/StockSettings'));
const AccessHub            = lazy(() => import('./core/pages/admin/access/AccessHub'));
const NavigationSettings   = lazy(() => import('./core/pages/admin/settings/NavigationSettings'));
const LocationsSettings    = lazy(() => import('./core/pages/admin/settings/LocationsSettings'));
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
const PaymentSettings = lazy(() => import('./core/pages/admin/settings/PaymentSettings'));
const SecuritySettings     = lazy(() => import('./core/pages/admin/settings/SecuritySettings'));
const EmailSettings        = lazy(() => import('./core/pages/admin/settings/EmailSettings'));
const BackupSettings       = lazy(() => import('./core/pages/admin/settings/BackupSettings'));
const CostCentres          = lazy(() => import('./core/pages/admin/settings/CostCentres'));
const Departments          = lazy(() => import('./core/pages/admin/settings/Departments'));
const AppearanceSettings   = lazy(() => import('./core/pages/admin/settings/AppearanceSettings'));
const AppearancePage       = lazy(() => import('./core/pages/admin/AppearancePage'));
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
        borderTopColor: 'var(--color-primary-500)',
        animation: 'spin 600ms linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ── Protected Route ───────────────────────────────────────────────────────────
function ProtectedRoute({ children, requireAdmin = false, permission = null }) {
  const { isAuthenticated, user, access, fetchCustomer } = useAuthStore();
  const [accessTried, setAccessTried] = useState(false);

  // a session from before the access engine has no `access` yet: load it once
  useEffect(() => {
    if (isAuthenticated && !access) fetchCustomer().finally(() => setAccessTried(true));
  }, [isAuthenticated, access, fetchCustomer]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // everything below is decided by the access summary: wait for it
  if (!access && !accessTried) return <PageLoader />;

  // Drivers only use the driver app (/driver/*); the API refuses them everywhere under /admin
  if (requireAdmin && isDriver(user, access) && !window.location.pathname.startsWith('/driver')) {
    return <Navigate to="/driver/manifests" replace />;
  }

  // Admin routes: everyone who holds admin.access (any role that does), and drivers for their own screens
  if (requireAdmin && !isStaff(user, access) && !isDriver(user, access)) {
    return <Navigate to="/" replace />;
  }

  // The permission the route needs (a comma list: any one of them). Roles are built in the role builder, so a route never names one.
  if (permission && !permission.split(',').some((p) => hasPermission(user, p))) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

// ── Role Based Profile Component ──────────────────────────────────────────────
function RoleBasedProfile() {
  const { user, access } = useAuthStore();

  return isStaff(user, access) ? <AdminProfile /> : <Profile />;
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
  const fetchModules = useModuleStore((s) => s.fetch);
  const fetchLocations = useLocationStore((s) => s.fetch);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Load active modules once at boot (public endpoint) so nav, routes and
  // menus reflect licensing. moduleStore fails closed on error.
  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  // Load active branches once at boot so the storefront branch picker + context
  // are ready (single-branch sites just resolve to Main).
  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

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
        <MemoDock />
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
            <Route path="/campaigns" element={<ModuleRoute module="campaigns"><CampaignsPage /></ModuleRoute>} />
            <Route path="/campaigns/:slug" element={<ModuleRoute module="campaigns"><CampaignPage /></ModuleRoute>} />
            <Route path="/world" element={<ModuleRoute module="campaigns"><WorldPage /></ModuleRoute>} />
            <Route path="/pins/:id" element={<ModuleRoute module="campaigns"><PinPage /></ModuleRoute>} />
            <Route path="/boards/:slug" element={<ModuleRoute module="campaigns"><BoardPage /></ModuleRoute>} />
            <Route path="/moodboards" element={<ModuleRoute module="campaigns"><MoodboardsPage /></ModuleRoute>} />
            <Route path="/moodboards/:slug" element={<ModuleRoute module="campaigns"><MoodboardPage /></ModuleRoute>} />
            <Route path="/my/boards" element={<ProtectedRoute><ModuleRoute module="campaigns"><MyBoardsPage /></ModuleRoute></ProtectedRoute>} />
            <Route path="/my/boards/:id" element={<ProtectedRoute><ModuleRoute module="campaigns"><MyBoardPage /></ModuleRoute></ProtectedRoute>} />
            <Route path="/my/moodboards" element={<ProtectedRoute><ModuleRoute module="campaigns"><MyMoodboardsPage /></ModuleRoute></ProtectedRoute>} />
            <Route path="/my/moodboards/:id" element={<ProtectedRoute><ModuleRoute module="campaigns"><MyMoodboardPage /></ModuleRoute></ProtectedRoute>} />
            <Route path="/auctions" element={<ModuleRoute module="ecommerce.auctions"><AuctionListPage /></ModuleRoute>} />
            <Route path="/auctions/:id" element={<ModuleRoute module="ecommerce.auctions"><AuctionDetailPage /></ModuleRoute>} />
            <Route path="/products" element={<ModuleRoute module="ecommerce"><Products /></ModuleRoute>} />
            <Route path="/catalogues" element={<ModuleRoute module="ecommerce"><CustomerBrochures /></ModuleRoute>} />
            <Route path="/brochures" element={<Navigate to="/catalogues" replace />} />
            <Route path="/price-lists" element={<ModuleRoute module="ecommerce"><CustomerPriceLists /></ModuleRoute>} />
            <Route path="/price-lists/:id" element={<ModuleRoute module="ecommerce"><CustomerPriceList /></ModuleRoute>} />
            <Route path="/products/:id" element={<ModuleRoute module="ecommerce"><ProductDetail /></ModuleRoute>} />
            <Route path="/services" element={<ModuleRoute module="ecommerce"><Services /></ModuleRoute>} />
            <Route path="/specials" element={<ModuleRoute module="ecommerce"><SpecialsPage /></ModuleRoute>} />
            <Route path="/services/:id" element={<ModuleRoute module="ecommerce"><ServiceDetail /></ModuleRoute>} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/wishlist" element={<ModuleRoute module="ecommerce"><Wishlist /></ModuleRoute>} />

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
            <Route path="/auction-terms"    element={<AuctionTerms />} />
            <Route path="/booking-policy"   element={<BookingPolicy />} />
            <Route path="ai-policy"         element={<AiPolicy />} />

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
            <Route path="/stock-alerts/stop/:token" element={<StockAlertStop />} />
            <Route path="/reminders/stop/:token" element={<ReminderStop />} />
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
            <Route path="/hampers" element={<ProtectedRoute><ModuleRoute module="ecommerce.hampers"><HamperListPage /></ModuleRoute></ProtectedRoute>} />
            <Route path="/hampers/:slug" element={<ProtectedRoute><ModuleRoute module="ecommerce.hampers"><HamperDetail /></ModuleRoute></ProtectedRoute>} />

            <Route path="/account/bug-reports" element={<ProtectedRoute><MyBugReports /></ProtectedRoute>} />
            <Route path="/settings/appearance" element={<CustomerAppearance />} />
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <Checkout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute>
                  <MyBookings />
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
              path="/my-deliveries"
              element={
                <ProtectedRoute>
                  <CustomerEnroute />
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
              path="/my-account"
              element={
                <ProtectedRoute>
                  <MyAccount />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gift-vouchers"
              element={
                <ProtectedRoute>
                  <MyGiftVouchers />
                </ProtectedRoute>
              }
            />
            <Route path="/request-quote" element={<RequestQuote />} />
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
                  <ModuleRoute module="projects"><MyProjects /></ModuleRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-projects/:id"
              element={
                <ProtectedRoute>
                  <ModuleRoute module="projects"><MyProjectDetail /></ModuleRoute>
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
                  <ProtectedRoute requireAdmin permission="policies.manage">
                    <PolicySettings />
                  </ProtectedRoute>
                } 
              />
              {/* Admin Career Management */}
              <Route path="/admin/careers" element={
                  <ProtectedRoute requireAdmin permission="careers.manage">
                      <AdminCareersStatsPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/jobs" element={
                  <ProtectedRoute requireAdmin permission="careers.manage">
                      <AdminJobsPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/jobs/:id" element={
                  <ProtectedRoute requireAdmin permission="careers.manage">
                      <AdminJobDetailPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/applications" element={
                  <ProtectedRoute requireAdmin permission="careers.manage">
                      <AdminApplicationsPage />
                  </ProtectedRoute>
              } />
              <Route path="/admin/careers/applicants"    element={
                <ProtectedRoute requireAdmin permission="careers.manage">
                  <AdminApplicantsPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/careers/applicants/:id" element={
                <ProtectedRoute requireAdmin permission="careers.manage">
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
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <AdminProducts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/products/create"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.edit">
                    <ProductForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/products/:id/edit"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <ProductForm />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/purchases" element={<ProtectedRoute requireAdmin permission="books.view"><AdminPurchases /></ProtectedRoute>} />
              <Route path="/admin/purchases/new" element={<ProtectedRoute requireAdmin permission="books.post"><PurchaseForm kind="purchase" /></ProtectedRoute>} />
              <Route path="/admin/purchases/receipt/new" element={<ProtectedRoute requireAdmin permission="books.post"><PurchaseForm kind="receipt" /></ProtectedRoute>} />
              <Route path="/admin/purchases/:id/edit" element={<ProtectedRoute requireAdmin permission="books.post"><PurchaseForm kind="purchase" /></ProtectedRoute>} />
              <Route path="/admin/stock/expiry" element={<ProtectedRoute requireAdmin permission="stock.view"><ExpiringStock /></ProtectedRoute>} />
              <Route path="/admin/stock/held" element={<ProtectedRoute requireAdmin permission="stock.view"><HeldStock /></ProtectedRoute>} />
              <Route path="/admin/vendors" element={<ProtectedRoute requireAdmin permission="vendors.view"><Vendors /></ProtectedRoute>} />
              <Route path="/admin/stock/transfers" element={<ProtectedRoute requireAdmin permission="stock.view"><StockTransfers /></ProtectedRoute>} />
              <Route path="/admin/stock/counts" element={<ProtectedRoute requireAdmin permission="stock.view"><StockCounts /></ProtectedRoute>} />
              <Route path="/admin/menus/recipes" element={<ProtectedRoute requireAdmin permission="menus.view"><Recipes /></ProtectedRoute>} />
              <Route path="/admin/stock/reports" element={<ProtectedRoute requireAdmin permission="stock.view"><StockReports /></ProtectedRoute>} />
              <Route path="/admin/stock/journal" element={<ProtectedRoute requireAdmin permission="stock.view"><StockJournal /></ProtectedRoute>} />
              <Route path="/admin/stock/jobs" element={<ProtectedRoute requireAdmin permission="stock.view"><StockJobs /></ProtectedRoute>} />
              <Route path="/admin/stock/opening" element={<ProtectedRoute requireAdmin permission="books.view"><AdminPurchases initial="opening_stock" /></ProtectedRoute>} />
              <Route path="/admin/stock/opening/new" element={<ProtectedRoute requireAdmin permission="books.post"><PurchaseForm kind="opening" /></ProtectedRoute>} />
              <Route
                path="/admin/vault"
                element={
                  <ProtectedRoute requireAdmin>
                    <VaultPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/hampers" element={<ProtectedRoute requireAdmin permission="hampers.manage"><AdminHampers /></ProtectedRoute>} />
              <Route path="/admin/hampers/create" element={<ProtectedRoute requireAdmin permission="hampers.manage"><AdminHamperCreate /></ProtectedRoute>} />
              <Route path="/admin/hampers/:id" element={<ProtectedRoute requireAdmin permission="hampers.manage"><AdminHamperDetail /></ProtectedRoute>} />    
              <Route path="/admin/hampers/:id/edit" element={<ProtectedRoute requireAdmin permission="hampers.manage"><AdminHamperEdit /></ProtectedRoute>} />


              <Route path="/admin/bug-reports" element={<ProtectedRoute requireAdmin permission="system.devtools"><AdminBugReportsPage /></ProtectedRoute>} />
              <Route path="/admin/dev-notes"   element={<ProtectedRoute requireAdmin permission="system.devtools"><AdminDevNotesPage /></ProtectedRoute>} />
              <Route path="/admin/dev-keys"    element={<ProtectedRoute requireAdmin permission="system.devtools"><AdminDevKeysPage /></ProtectedRoute>} />
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
              <Route
                path="/admin/ai-analytics/mimi-knowledge"
                element={
                  <ProtectedRoute requireAdmin>
                    <MimiKnowledgePage />
                  </ProtectedRoute>
                }
              />
              {/* ── Admin Delivery Routes ─────────────────────────────────────────── */}
              {/* Overview */}
              <Route
                path="/admin/delivery"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <DeliveryOverviewPage />
                  </ProtectedRoute>
                }
              />

              {/* Manifests */}
              <Route
                path="/admin/delivery/manifests"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <ManifestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/create"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <CreateManifestPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/:id"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <ManifestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/transfer"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <ManifestTransferPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/manifests/:id/route"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <ManifestRoutePage />
                  </ProtectedRoute>
                }
              />

              {/* Drivers */}
              <Route
                path="/admin/delivery/drivers"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <DriversPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/drivers/:id"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <DriverDetailPage />
                  </ProtectedRoute>
                }
              />

              {/* Incidents */}
              <Route
                path="/admin/delivery/incidents"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <IncidentsPage />
                  </ProtectedRoute>
                }
              />

              {/* Ratings */}
              <Route
                path="/admin/delivery/ratings"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <RatingsPage />
                  </ProtectedRoute>
                }
              />

              {/* AI Insights */}
              <Route
                path="/admin/delivery/insights"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <DeliveryInsightsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/insights/:entityType"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <DeliveryInsightsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/delivery/insights/:entityType/:entityId"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <DeliveryInsightsPage />
                  </ProtectedRoute>
                }
              />

              {/* Reports */}
              <Route
                path="/admin/delivery/reports"
                element={
                  <ProtectedRoute requireAdmin permission="delivery.manage">
                    <DeliveryReportsPage />
                  </ProtectedRoute>
                }
              />

              {/* ── Driver Routes ─────────────────────────────────────────────────── */}

              <Route
                path="/driver/profile"
                element={
                  <ProtectedRoute>
                    <DriverProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route path="/driver/payslips" element={<ProtectedRoute><MyPayslips driver /></ProtectedRoute>} />
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
                  <ProtectedRoute requireAdmin permission="auctions.manage">
                    <AdminAuctions />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/admin/auctions/create" 
                element={
                  <ProtectedRoute requireAdmin permission="auctions.manage">
                    <AdminAuctionCreator />
                  </ProtectedRoute>
                } 
              />
              {/* Admin Auction Detail/Edit */}
              <Route
                path="/admin/auctions/:id"
                element={
                  <ProtectedRoute requireAdmin permission="auctions.manage">
                    <AdminAuctionDetail />
                  </ProtectedRoute>
                }
              />

              {/* Admin Service Routes */}
              <Route
                path="/admin/services"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <AdminServices />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/services/new"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.edit">
                    <ServiceForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/services/:id/edit"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.edit">
                    <ServiceForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/brochures"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <Brochures />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/price-lists" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><PriceLists /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/price-lists/new" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><PriceListEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/price-lists/:id" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><PriceListView /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/price-list-archive" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><PriceListArchive /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/catalogues" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><Catalogues /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/catalogues/new" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><CatalogueEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/catalogues/:id" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><CatalogueEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/catalogue-items" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><CatalogueItems /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/catalogue-settings" element={<ProtectedRoute requireAdmin permission="catalogue.pricelists"><ModuleRoute module="ecommerce" redirectTo="/admin"><CatalogueSettings /></ModuleRoute></ProtectedRoute>} />
              <Route
                path="/admin/service-categories"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <ServiceCategories />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/bookings" element={<ProtectedRoute requireAdmin permission="bookings.manage"><Bookings /></ProtectedRoute>} />
              <Route path="/admin/calendar" element={<ProtectedRoute requireAdmin><MyCalendar /></ProtectedRoute>} />
              <Route path="/admin/calendar/team" element={<ProtectedRoute requireAdmin permission="calendar.team"><TeamCalendar /></ProtectedRoute>} />
              <Route path="/admin/resources" element={<ProtectedRoute requireAdmin permission="resources.manage"><StaffResources /></ProtectedRoute>} />
              <Route path="/admin/service-settings" element={<ProtectedRoute requireAdmin permission="catalogue.view"><ServiceSettings /></ProtectedRoute>} />
              <Route path="/admin/settings/engagement" element={<ProtectedRoute requireAdmin permission="engagement.settings"><ModuleRoute module="extras" redirectTo="/admin"><EngagementSettings /></ModuleRoute></ProtectedRoute>} />

              {/* Categories Routes */}
              <Route
                path="/admin/categories"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <Categories />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/categories/create"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.edit">
                    <CategoryForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/categories/:id/edit"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <CategoryForm />
                  </ProtectedRoute>
                }
              />

              {/* Brands Routes */}
              <Route
                path="/admin/brands"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <Brands />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/brands/create"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.edit">
                    <BrandForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/brands/:id/edit"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.view">
                    <BrandForm />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/books/other-companies" element={<ProtectedRoute requireAdmin permission="imports.view,imports.export"><OtherCompanies /></ProtectedRoute>} />
              <Route path="/admin/orders" element={<ProtectedRoute requireAdmin permission="books.view"><OrdersRegister /></ProtectedRoute>} />
              <Route path="/admin/orders/:id" element={<ProtectedRoute requireAdmin permission="books.view"><VoucherView /></ProtectedRoute>} />

              {/* Admin Quote Routes (the old quote requests now live as quotations) */}
              <Route path="/admin/quote-requests/*" element={<Navigate to="/admin/quotes" replace />} />
              <Route
                path="/admin/quotes"
                element={
                  <ProtectedRoute requireAdmin permission="quotes.view">
                    <Quotes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/quotes/:id"
                element={
                  <ProtectedRoute requireAdmin permission="quotes.view">
                    <QuoteDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/quotes/:id/edit"
                element={
                  <ProtectedRoute requireAdmin permission="quotes.view">
                    <QuoteEdit />
                  </ProtectedRoute>
                }
              />

              {/* Payments Dashboard */}
              <Route path="/admin/finance/payments" element={<ProtectedRoute requireAdmin permission="books.view"><OrdersRegister initial="receipt" /></ProtectedRoute>} />

              {/* Projects */}
              <Route
                path="/admin/projects"
                element={
                  <ProtectedRoute requireAdmin permission="projects.use">
                    <ProjectDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/projects/list"
                element={
                  <ProtectedRoute requireAdmin permission="projects.use">
                    <Projects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/projects/create"
                element={
                  <ProtectedRoute requireAdmin permission="projects.use">
                    <ProjectCreate />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/projects/:id"
                element={
                  <ProtectedRoute requireAdmin permission="projects.use">
                    <ProjectDetail />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/work" element={<Navigate to="/admin/calendar" replace />} />

              {/* Customers & Users */}
              <Route
                path="/admin/customers"
                element={
                  <ProtectedRoute requireAdmin permission="customers.view">
                    <AdminCustomers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/customers/:id"
                element={
                  <ProtectedRoute requireAdmin permission="customers.view">
                    <CustomerDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/credit"
                element={
                  <ProtectedRoute requireAdmin permission="credit.view">
                    <CreditDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/credit/customers/:id"
                element={
                  <ProtectedRoute requireAdmin permission="credit.view">
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
                  <ProtectedRoute requireAdmin permission="hr.view">
                    <EmployeeList />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/employees/create"
                element={
                  <ProtectedRoute requireAdmin permission="hr.manage,hr.team">
                    <EmployeeForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/employees/:id"
                element={
                  <ProtectedRoute requireAdmin permission="hr.view">
                    <EmployeeDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/employees/:id/edit"
                element={
                  <ProtectedRoute requireAdmin permission="hr.manage,hr.team">
                    <EmployeeForm />
                  </ProtectedRoute>
                }
              />

              {/* Referrals & Promo Codes */}
              <Route
                path="/admin/referrals"
                element={
                  <ProtectedRoute requireAdmin permission="promos.manage">
                    <Referrals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/referrals/:id"
                element={
                  <ProtectedRoute requireAdmin permission="promos.manage">
                    <ReferralDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/promo-codes"
                element={
                  <ProtectedRoute requireAdmin permission="promos.manage">
                    <PromoCodes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/promo-codes/:id"
                element={
                  <ProtectedRoute requireAdmin permission="promos.manage">
                    <PromoCodeDetail />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/reviews" element={<ProtectedRoute requireAdmin permission="engagement.view"><ModuleRoute module="extras" redirectTo="/admin"><EngagementQueue /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/engagement" element={<Navigate to="/admin/reviews" replace />} />   {/* the first name the page had; calendar tasks made then still use it */}

              <Route
                path="/admin/loyalty"
                element={
                  <ProtectedRoute requireAdmin permission="customers.view">
                    <LoyaltyLedger />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/loyalty/settings"
                element={
                  <ProtectedRoute requireAdmin permission="loyalty.configure">
                    <LoyaltySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/loyalty/:customerId"
                element={
                  <ProtectedRoute requireAdmin permission="customers.view">
                    <LoyaltyLedgerDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/tickets"
                element={
                  <ProtectedRoute requireAdmin permission="tickets.manage">
                    <AdminTickets />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/tickets/:id"
                element={
                  <ProtectedRoute requireAdmin permission="tickets.manage">
                    <AdminTicketDetail />
                  </ProtectedRoute>
                }
              />

              {/* The old orders-based Reports page is gone; its address goes to the books' reports */}
              <Route path="/admin/reports" element={<Navigate to="/admin/books?tab=reports" replace />} />
              <Route
                path="/admin/logs"
                element={
                  <ProtectedRoute requireAdmin permission="system.logs">
                    <ActivityLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/assets"
                element={
                  <ProtectedRoute requireAdmin permission="inventory.view">
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/inventory" element={<Navigate to="/admin/assets" replace />} />
              <Route
                path="/admin/algorithm"
                element={
                  <ProtectedRoute requireAdmin permission="algorithm.manage">
                    <CustomerAlgorithmPanel />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/algorithm/catalogue-boosts"
                element={
                  <ProtectedRoute requireAdmin permission="algorithm.manage">
                    <CatalogueBoostPage />
                  </ProtectedRoute>}
              />

              {/* ── Memoranda: notes with debit / credit lines that post nothing ─────────── */}
              <Route path="/admin/books/memoranda" element={<ProtectedRoute requireAdmin><MemorandaRegister /></ProtectedRoute>} />
              <Route path="/admin/books/memoranda/new" element={<ProtectedRoute requireAdmin><MemorandumForm /></ProtectedRoute>} />
              <Route path="/admin/books/memoranda/:id/edit" element={<ProtectedRoute requireAdmin><MemorandumForm /></ProtectedRoute>} />
              <Route path="/admin/campaigns" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><CampaignList /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/pins" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><PinLibrary /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/boards" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><BoardList /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/boards/new" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><BoardEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/boards/:id/edit" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><BoardEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/moodboards" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><MoodboardList /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/moodboards/:id/edit" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><MoodboardEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/campaigns/new" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><CampaignEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/campaigns/:id/edit" element={<ProtectedRoute requireAdmin permission="campaigns.build"><ModuleRoute module="campaigns" redirectTo="/admin"><CampaignEditor /></ModuleRoute></ProtectedRoute>} />
              <Route path="/admin/financial-notes" element={<Navigate to="/admin/books/memoranda" replace />} />

              <Route path="/admin/reconciliation/*" element={<Navigate to="/admin/books" replace />} />
              <Route path="/admin/data-engine" element={<Navigate to="/admin/books" replace />} />
              <Route 
                path="/admin/logs/export" 
                element={
                    <ProtectedRoute requireAdmin permission="system.logs">
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
                  <ProtectedRoute requireAdmin permission="analytics.view">
                    <AnalyticDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/analytics/:id"
                element={
                  <ProtectedRoute requireAdmin permission="analytics.view">
                    <AnalyticsDetail />
                  </ProtectedRoute>
                }
              />
              {/* Books — finance roles only (mirrors the API) */}
              <Route path="/admin/books" element={<ProtectedRoute requireAdmin permission="books.view"><BooksHub /></ProtectedRoute>} />
              <Route path="/admin/books/vouchers/new" element={<ProtectedRoute requireAdmin permission="books.post"><VoucherForm /></ProtectedRoute>} />
              <Route path="/admin/books/vouchers/:id/edit" element={<ProtectedRoute requireAdmin permission="books.post"><VoucherForm /></ProtectedRoute>} />
              <Route path="/admin/verification" element={<ProtectedRoute requireAdmin><Verification /></ProtectedRoute>} />
              <Route path="/admin/my-payslips" element={<ProtectedRoute requireAdmin><MyPayslips /></ProtectedRoute>} />
              <Route path="/admin/payroll" element={<ProtectedRoute requireAdmin permission="payroll.run"><Payroll /></ProtectedRoute>} />
              <Route path="/admin/payroll/gratuity" element={<ProtectedRoute requireAdmin permission="payroll.run"><Gratuity /></ProtectedRoute>} />
              <Route path="/admin/payroll/settings" element={<ProtectedRoute requireAdmin permission="payroll.run"><PayrollSettings /></ProtectedRoute>} />
              <Route path="/admin/attendance" element={<ProtectedRoute requireAdmin><Attendance /></ProtectedRoute>} />
              <Route path="/admin/petty-cash" element={<ProtectedRoute requireAdmin><PettyCash /></ProtectedRoute>} />
              <Route path="/admin/books/cash" element={<ProtectedRoute requireAdmin permission="books.view"><CashPage /></ProtectedRoute>} />
              <Route path="/admin/books/cheques" element={<ProtectedRoute requireAdmin permission="books.view"><ChequeRegister /></ProtectedRoute>} />
              <Route path="/admin/books/edit-log" element={<ProtectedRoute requireAdmin permission="books.view"><EditLog /></ProtectedRoute>} />
              <Route path="/admin/books/vouchers/:id/return" element={<ProtectedRoute requireAdmin permission="books.post"><ReturnFromInvoice /></ProtectedRoute>} />
              <Route path="/admin/books/vouchers/:id" element={<ProtectedRoute requireAdmin permission="books.view"><VoucherView /></ProtectedRoute>} />
              {/* Tax & withholding hubs — finance roles only (mirrors the API) */}
              <Route
                path="/admin/tax"
                element={
                  <ProtectedRoute requireAdmin permission="tax.view">
                    <TaxCompliance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/withholding"
                element={
                  <ProtectedRoute requireAdmin permission="tax.view">
                    <WithholdingCompliance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/modules"
                element={
                  <ProtectedRoute requireAdmin permission="system.modules">
                    <ModuleCenter />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/access"
                element={
                  <ProtectedRoute requireAdmin permission="access.view">
                    <AccessHub />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/cost-centres"
                element={
                  <ProtectedRoute requireAdmin permission="costcentres.view">
                    <CostCentres />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/departments"
                element={
                  <ProtectedRoute requireAdmin permission="hr.view,hr.manage">
                    <Departments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/stock"
                element={
                  <ProtectedRoute requireAdmin permission="stock.settings">
                    <StockSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/backups"
                element={
                  <ProtectedRoute requireAdmin permission="system.backups">
                    <BackupSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/navigation"
                element={
                  <ProtectedRoute requireAdmin permission="system.navigation">
                    <NavigationSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/locations"
                element={
                  <ProtectedRoute requireAdmin permission="locations.manage">
                    <LocationsSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/units"
                element={
                  <ProtectedRoute requireAdmin permission="catalogue.edit">
                    <UnitsOfMeasure />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/currency"
                element={
                  <ProtectedRoute requireAdmin permission="currency.manage">
                    <CurrencySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/customer-tiers"
                element={
                  <ProtectedRoute requireAdmin permission="customers.tiers">
                    <CustomerTierSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/shipping"
                element={
                  <ProtectedRoute requireAdmin permission="shipping.manage">
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
                  <ProtectedRoute requireAdmin permission="catalogue.edit">
                    <ProductBulkPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/general/bulk/customers"
                element={
                  <ProtectedRoute requireAdmin permission="customers.manage">
                    <CustomerBulkPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/general/bulk/employees"
                element={
                  <ProtectedRoute requireAdmin permission="hr.manage">
                    <EmployeeBulkPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/notifications"
                element={
                  <ProtectedRoute requireAdmin permission="notifications.view,notifications.settings">
                    <NotificationSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/payments"
                element={
                  <ProtectedRoute requireAdmin permission="payments.keys">
                    <PaymentSettings />
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
                element={<Navigate to="/admin/settings/notifications?tab=email" replace />}
              />
              <Route
                path="/admin/settings/backup"
                element={
                  <ProtectedRoute requireAdmin permission="system.backups">
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
                path="/admin/appearance"
                element={
                  <ProtectedRoute requireAdmin permission="appearance.manage">
                    <AppearancePage />
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
                  <ProtectedRoute requireAdmin permission="content.manage">
                    <AboutSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/contact"
                element={
                  <ProtectedRoute requireAdmin permission="content.manage">
                    <ContactSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/manual"
                element={
                  <ProtectedRoute requireAdmin permission="content.manage">
                    <ManualSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/homepage"
                element={
                  <ProtectedRoute requireAdmin permission="content.manage">
                    <HomepageSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings/content/footer"
                element={
                  <ProtectedRoute requireAdmin permission="content.manage">
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