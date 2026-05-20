import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import { useThemeStore, useAuthStore } from './store';

import InstallPrompt from './components/common/InstallPrompt';
import Mimi from './components/chat/Mimi';

// ── Auth Pages ────────────────────────────────────────────────────────────────
const Login               = lazy(() => import('./pages/auth/Login'));
const Register            = lazy(() => import('./pages/auth/Register'));
const OAuthCallback       = lazy(() => import('./pages/auth/OAuthCallback'));
const ForceChangePassword = lazy(() => import('./pages/auth/ForceChangePassword.jsx'));
const ForgotPassword      = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword       = lazy(() => import('./pages/auth/ResetPassword'));

// ── Customer Pages ────────────────────────────────────────────────────────────
const Home                 = lazy(() => import('./pages/customer/Home'));
const Products             = lazy(() => import('./pages/customer/Products'));
const ProductDetail        = lazy(() => import('./pages/customer/ProductDetail'));
const AuctionListPage      = lazy(() => import('./pages/customer/AuctionListPage'));
const AuctionDetailPage    = lazy(() => import('./pages/customer/AuctionDetailPage'));
const Cart                 = lazy(() => import('./pages/customer/Cart'));
const Wishlist             = lazy(() => import('./pages/customer/Wishlist'));
const QuoteList            = lazy(() => import('./pages/customer/QuoteList'));
const Checkout             = lazy(() => import('./pages/customer/Checkout'));
const MyOrders             = lazy(() => import('./pages/customer/MyOrders'));
const CustomerOrderDetail  = lazy(() => import('./pages/customer/OrderDetail'));
const Services             = lazy(() => import('./pages/customer/Services'));
const ServiceDetail        = lazy(() => import('./pages/customer/ServiceDetail'));
const SpecialsPage         = lazy(() => import('./pages/customer/SpecialsPage'));
const RequestQuote         = lazy(() => import('./pages/customer/RequestQuote'));
const MyQuoteRequests      = lazy(() => import('./pages/customer/MyQuoteRequests'));
const MyQuoteRequestDetail = lazy(() => import('./pages/customer/MyQuoteRequestDetail'));
const MyQuotes             = lazy(() => import('./pages/customer/MyQuotes'));
const CustomerQuoteDetail  = lazy(() => import('./pages/customer/CustomerQuoteDetail'));
const MyProjects           = lazy(() => import('./pages/customer/MyProjects'));
const MyProjectDetail      = lazy(() => import('./pages/customer/MyProjectDetail'));
const Profile              = lazy(() => import('./pages/customer/Profile'));
const About                = lazy(() => import('./pages/customer/About'));
const Contact              = lazy(() => import('./pages/customer/Contact'));
const Manual               = lazy(() => import('./pages/customer/Manual'));
const PrivacyPolicy        = lazy(() => import('./components/legal/PrivacyPolicy'));
const TermsOfService       = lazy(() => import('./components/legal/TermsOfService'));
const CookiePolicy         = lazy(() => import('./components/legal/CookiePolicy'));
const MyTickets            = lazy(() => import('./pages/customer/MyTickets'));
const MyTicketDetail       = lazy(() => import('./pages/customer/MyTicketDetail'));
const HamperListPage       = lazy(() => import('./pages/customer/HamperListPage'));
const HamperDetail         = lazy(() => import('./pages/customer/HamperDetail'));
const HamperCheckout       = lazy(() => import('./pages/customer/HamperCheckout'));
const MyHamperOrders       = lazy(() => import('./pages/customer/MyHamperOrders'));
const MyHamperOrderDetail  = lazy(() => import('./pages/customer/MyHamperOrderDetail'));

const MyBookings           = lazy(() => import('./pages/customer/MyBookings'));
const MyBookingDetail      = lazy(() => import('./pages/customer/MyBookingDetail'));
const BookService          = lazy(() => import('./pages/customer/BookService'));

const BrochureListPage     = lazy(() => import('./pages/customer/BrochureListPage'));
const BrochureDetail       = lazy(() => import('./pages/customer/BrochureDetail'));
const PublicationDetail    = lazy(() => import('./pages/customer/PublicationDetail'));

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

import AboutCareersPage      from './careers/pages/legal/AboutCareersPage';
import ContactCareersPage    from './careers/pages/legal/ContactCareersPage';
import PrivacyPolicyPage     from './careers/pages/legal/PrivacyPolicyPage';
import TermsOfServicePage    from './careers/pages/legal/TermsOfServicePage';
import CookiePolicyPage       from './careers/pages/legal/CookiePolicyPage';

import AdminJobsPage          from './careers/admin/pages/AdminJobsPage';
import AdminJobDetailPage     from './careers/admin/pages/AdminJobDetailPage';
import AdminApplicationsPage  from './careers/admin/pages/AdminApplicationsPage';
import AdminCareersStatsPage  from './careers/admin/pages/AdminCareersStatsPage';
import AdminApplicantsPage    from './careers/admin/pages/AdminApplicantsPage'
import AdminApplicantDetailPage from './careers/admin/pages/AdminApplicantDetailPage'

// ── Admin Pages ───────────────────────────────────────────────────────────────
const AdminProfile       = lazy(() => import('./pages/admin/AdminProfile'));
const Dashboard          = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts      = lazy(() => import('./pages/admin/Products'));
const ProductForm        = lazy(() => import('./pages/admin/ProductForm'));
const AdminAuctions      = lazy(() => import('./pages/admin/AdminAuctions'));
const AdminAuctionDetail = lazy(() => import('./pages/admin/AdminAuctionDetail'));
const AdminAuctionCreator = lazy(() => import('./pages/admin/AdminAuctionCreator'));
const Categories         = lazy(() => import('./pages/admin/Categories'));
const CategoryForm       = lazy(() => import('./pages/admin/CategoryForm'));
const Brands             = lazy(() => import('./pages/admin/Brands'));
const BrandForm          = lazy(() => import('./pages/admin/BrandForm'));
const AdminOrders        = lazy(() => import('./pages/admin/Orders'));
const OrderDetail        = lazy(() => import('./pages/admin/OrderDetail'));
const AdminServices      = lazy(() => import('./pages/admin/Services'));
const ServiceForm        = lazy(() => import('./pages/admin/ServiceForm'));
const ServiceCategories  = lazy(() => import('./pages/admin/ServiceCategories'));
const Work               = lazy(() => import('./pages/admin/Work'));
const QuoteRequests      = lazy(() => import('./pages/admin/QuoteRequests'));
const QuoteRequestDetail = lazy(() => import('./pages/admin/QuoteRequestDetail'));
const Quotes             = lazy(() => import('./pages/admin/Quotes'));
const QuoteCreatePage    = lazy(() => import('./pages/admin/QuoteCreatePage.jsx'));
const QuoteDetail        = lazy(() => import('./components/quotes/QuoteDetail'));
const QuoteEdit          = lazy(() => import('./components/quotes/QuoteEdit'));
const AdminCustomers     = lazy(() => import('./pages/admin/Customers'));
const CustomerDetail     = lazy(() => import('./pages/admin/CustomerDetail'));
const AdminReviews       = lazy(() => import('./pages/admin/Reviews'));
const Reports            = lazy(() => import('./pages/admin/Reports'));
const ProjectDashboard   = lazy(() => import('./pages/admin/ProjectDashboard'));
const Projects           = lazy(() => import('./pages/admin/Projects'));
const ProjectCreate      = lazy(() => import('./pages/admin/ProjectCreate'));
const ProjectDetail      = lazy(() => import('./pages/admin/ProjectDetail'));
const UsersPage          = lazy(() => import('./pages/admin/users/Users'));
const UserDetail         = lazy(() => import('./pages/admin/users/UserDetail'));
const EmployeeList       = lazy(() => import('./pages/admin/employees/EmployeeList'));
const EmployeeDetail     = lazy(() => import('./pages/admin/employees/EmployeeDetail'));
const EmployeeForm       = lazy(() => import('./pages/admin/employees/EmployeeForm'));
const Referrals          = lazy(() => import('./pages/admin/referrals/Referrals'));
const ReferralDetail     = lazy(() => import('./pages/admin/referrals/ReferralDetail'));
const PromoCodes         = lazy(() => import('./pages/admin/referrals/PromoCodes'));
const PromoCodeDetail    = lazy(() => import('./pages/admin/referrals/PromoCodeDetail'));
const AdminTickets       = lazy(() => import('./pages/admin/Tickets'));
const AdminTicketDetail  = lazy(() => import('./pages/admin/TicketDetail'));
const PaymentsDashboard  = lazy(() => import('./pages/admin/finance/PaymentsDashboard'));
const PaymentDetail      = lazy(() => import('./pages/admin/finance/PaymentDetail'));
const OrderPaymentsPanel = lazy(() => import('./pages/admin/finance/OrderPaymentsPanel'));
const InitiatePaymentModal = lazy(() => import('./pages/admin/finance/InitiatePaymentModal'));
const LoyaltyLedger        = lazy(() => import('./pages/admin/LoyaltyLedger'));
const LoyaltySettings      = lazy(() => import('./pages/admin/LoyaltySettings'));
const LoyaltyLedgerDetail  = lazy(() => import('./pages/admin/LoyaltyLedgerDetail'));
const AdminHampers         = lazy(() => import('./pages/admin/hampers/AdminHampers'));
const AdminHamperDetail    = lazy(() => import('./pages/admin/hampers/AdminHamperDetail'));
const AdminHamperEdit      = lazy(() => import('./pages/admin/hampers/AdminHamperEdit'));
const AdminHamperCreate    = lazy(() => import('./pages/admin/hampers/AdminHamperCreate'));
const AdminHamperOrderDetail = lazy(() => import('./pages/admin/hampers/AdminHamperOrderDetail'));

const AdminBookings        = lazy(() => import('./pages/admin/AdminBookings'));
const AdminBookingDetail   = lazy(() => import('./pages/admin/AdminBookingDetail'));
const AdminBookingForm     = lazy(() => import('./pages/admin/AdminBookingForm'));
const AdminWorksheetForm   = lazy(() => import('./pages/admin/AdminWorksheetForm'));
const BookingSettings      = lazy(() => import('./pages/admin/BookingSettings'));

// ── Admin Settings Pages ──────────────────────────────────────────────────────
const GeneralLayout        = lazy(() => import('./components/layout/GeneralLayout.jsx'))
const ProductBulkPage      = lazy(() => import('./pages/admin/general/bulk/ProductBulkPage'));
const CustomerBulkPage     = lazy(() => import('./pages/admin/general/bulk/CustomerBulkPage'));
const EmployeeBulkPage     = lazy(() => import('./pages/admin/general/bulk/EmployeeBulkPage'));

const StudioEditor         = lazy(() => import('./components/studio/StudioEditor'));
const PublicationListPage  = lazy(() => import('./pages/admin/PublicationListPage'));

const Settings             = lazy(() => import('./pages/admin/settings/Settings'));
const CurrencySettings     = lazy(() => import('./pages/admin/settings/CurrencySettings'));
const ShippingSettings     = lazy(() => import('./pages/admin/settings/ShippingSettings'));
const CustomerTierSettings = lazy(() => import('./pages/admin/settings/CustomerTierSettings'));

const GeneralSettings      = lazy(() => import('./pages/admin/settings/GeneralSettings'));
const NotificationSettings = lazy(() => import('./pages/admin/settings/NotificationSettings'));
const SecuritySettings     = lazy(() => import('./pages/admin/settings/SecuritySettings'));
const EmailSettings        = lazy(() => import('./pages/admin/settings/EmailSettings'));
const BackupSettings       = lazy(() => import('./pages/admin/settings/BackupSettings'));
const AppearanceSettings   = lazy(() => import('./pages/admin/settings/AppearanceSettings'));
const IntegrationSettings  = lazy(() => import('./pages/admin/settings/IntegrationSettings'));
const AboutSettings        = lazy(() => import('./pages/admin/settings/content/AboutSettings'));
const ContactSettings      = lazy(() => import('./pages/admin/settings/content/ContactSettings'));
const ManualSettings       = lazy(() => import('./pages/admin/settings/content/ManualSettings'));
const HomepageSettings     = lazy(() => import('./pages/admin/settings/content/HomepageSettings'));
const FooterSettings       = lazy(() => import('./pages/admin/settings/content/FooterSettings'));

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
function ProtectedRoute({ children, requireAdmin = false, requireSuperAdmin = false }) {
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
    const allowedRoles = ['admin', 'super_admin', 'manager', 'logistics', 'finance', 'sales_rep'];
    if (!allowedRoles.includes(user?.role)) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}

// ── Role Based Profile Component ──────────────────────────────────────────────
function RoleBasedProfile() {
  const { user } = useAuthStore();
  
  const isStaff = ['admin', 'super_admin', 'manager', 'logistics', 'finance', 'sales_rep'].includes(user?.role);
  
  return isStaff ? <AdminProfile /> : <Profile />;
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

        <InstallPrompt />
        <Mimi />

        {/* All routes are lazy — Suspense handles the loading state */}
        <Suspense fallback={<PageLoader />}>
          <Routes>

            {/* ── Public Routes ───────────────────────────────────────────── */}
            <Route path="/" element={<Home />} />
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

            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms"   element={<TermsOfService />} />
            <Route path="/cookies" element={<CookiePolicy />} />

            <Route path="/brochures" element={<BrochureListPage />} />
            <Route path="/brochures/:slug" element={<BrochureDetail />} />
            <Route path="/news/:slug" element={<PublicationDetail />} />
            <Route path="/blog/:slug" element={<PublicationDetail />} />

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
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <Dashboard />
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
            // Admin
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