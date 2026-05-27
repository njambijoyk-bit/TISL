import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShoppingCart, Heart, User, Sun, Moon, Menu, X, ChevronDown, ChevronRight,
  Package, Wrench, Tag, Award, Star, FileText, ClipboardList, FolderOpen, 
  LogOut, Settings, LayoutDashboard, Users, ShoppingBag, MessageSquare, UserCog,
  BarChart3, Layers, BookOpen, Phone, Info, Zap, Search, BarChart2, LifeBuoy,
} from 'lucide-react';
import logo from '../../assets/images/logo.png';
import ThemeSwitcher from '../common/ThemeSwitcher';
import { useAuthStore, useCartStore, useQuoteListStore } from '../../store';
import useWishlistStore from '../../store/wishlistStore';
import { categoriesAPI, brandsAPI, servicesAPI, serviceCategoriesAPI } from '../../api';

// ── tiny helpers ──────────────────────────────────────────────────────────────
const useFlyout = () => {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const enter = () => { clearTimeout(timer.current); setOpen(true); };
  const leave = () => { timer.current = setTimeout(() => setOpen(false), 120); };
  return { open, enter, leave, setOpen };
};

// ── nav pill ──────────────────────────────────────────────────────────────────
function NavItem({ label, to, icon: Icon, flyout, active }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {to ? (
        <Link to={to} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
          color: active ? '#a855f7' : '#374151', textDecoration: 'none',
          background: active ? 'rgba(168,85,247,0.08)' : 'transparent',
          transition: 'all 150ms ease',
        }}
          className="dark:text-gray-200 hover:text-purple-600"
        >
          {Icon && <Icon size={14} />} {label}
        </Link>
      ) : (
        <button type="button" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
          color: flyout?.open ? '#a855f7' : '#374151',
          background: flyout?.open ? 'rgba(168,85,247,0.08)' : 'transparent',
          border: 'none', cursor: 'pointer', transition: 'all 150ms ease',
        }}
          className="dark:text-gray-200"
          onMouseEnter={flyout?.enter}
          onMouseLeave={flyout?.leave}
        >
          {Icon && <Icon size={14} />} {label}
          <ChevronDown size={12} style={{ transition: 'transform 200ms', transform: flyout?.open ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    </div>
  );
}

// ── mega panel wrapper ────────────────────────────────────────────────────────
function MegaPanel({ open, onEnter, onLeave, children, align = 'left', width = 480 }) {
  if (!open) return null;
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: 'absolute', top: '100%', [align]: 0, zIndex: 999,
        width, background: 'white', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
        border: '1px solid #f3f4f6', marginTop: 8,
        animation: 'fadeInDown 150ms ease',
      }}
      className="dark:bg-gray-800 dark:border-gray-700"
    >
      {children}
    </div>
  );
}

// ── category tree node ────────────────────────────────────────────────────────
function CategoryNode({ cat, onNavigate, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = cat.children && cat.children.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => onNavigate(`/products?category=${cat.id}`)}
          style={{
            flex: 1, textAlign: 'left', padding: `6px ${8 + depth * 12}px`,
            fontSize: '0.82rem', fontWeight: depth === 0 ? 700 : 500,
            color: depth === 0 ? '#111827' : '#374151',
            background: 'none', border: 'none', cursor: 'pointer',
            borderRadius: 8, transition: 'all 120ms ease',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          className="hover:bg-purple-50 dark:hover:bg-gray-700 dark:text-gray-200"
        >
          {depth > 0 && <span style={{ width: 12, height: 1, background: '#d1d5db', flexShrink: 0 }} />}
          {cat.name}
          {cat.products_count != null && (
            <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600, marginLeft: 'auto' }}>
              {cat.products_count}
            </span>
          )}
        </button>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', borderRadius: 4 }}
          >
            <ChevronRight size={12} style={{ transition: 'transform 150ms', transform: expanded ? 'rotate(90deg)' : 'none' }} />
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {cat.children.map(child => (
            <CategoryNode key={child.id} cat={child} onNavigate={onNavigate} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { items: cartItems } = useCartStore();
  const { items: wishlistItems } = useWishlistStore();
  const { items: quoteListItems } = useQuoteListStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [productCategories, setProductCategories] = useState([]);
  const [serviceCategories, setServiceCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const products = useFlyout();
  const services = useFlyout();
  const account = useFlyout();

  const isAdmin = user?.role === 'admin' || 
                  user?.role === 'super_admin' || 
                  user?.role === 'manager' || 
                  user?.role === 'sales_rep';
  const cartCount = cartItems?.reduce((sum, i) => sum + (i.quantity ?? 1), 0) ?? 0;
  const wishlistCount = wishlistItems?.length ?? 0;
  const quoteListCount = quoteListItems?.length ?? 0;
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  useEffect(() => {
    Promise.all([
      categoriesAPI.getCategories().catch(() => []),
      brandsAPI.getBrands().catch(() => []),
      serviceCategoriesAPI.getMainCategories().catch(() => []),  // ← fix
    ]).then(([catRes, brandRes, svcCatRes]) => {
      setProductCategories(catRes?.data ?? catRes ?? []);
      setBrands((brandRes?.data ?? brandRes ?? []).slice(0, 12));
      setServiceCategories(svcCatRes?.data ?? svcCatRes ?? []);
    });
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const [visible, setVisible]   = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      setVisible(y < lastScrollY.current || y < 60);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Close user menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // ── Admin mega menu groups ─────────────────────────────────────────────────
  const adminGroups = [
    {
      label: 'Catalog', items: [
        { label: 'Dashboard',   icon: LayoutDashboard, to: '/admin' },
        { label: 'Products',    icon: Package,         to: '/admin/products' },
        { label: 'Categories',  icon: Layers,          to: '/admin/categories' },
        { label: 'Brands',      icon: Award,           to: '/admin/brands' },
      ],
    },
    {
      label: 'Services', items: [
        { label: 'Services',            icon: Wrench,       to: '/admin/services' },
        { label: 'Service Categories',  icon: Tag,          to: '/admin/service-categories' },
      ],
    },
    {
      label: 'Commerce', items: [
        { label: 'Orders',         icon: ShoppingBag,    to: '/admin/orders' },
        { label: 'Quote Requests', icon: ClipboardList,  to: '/admin/quote-requests' },
        { label: 'Quotes',         icon: FileText,       to: '/admin/quotes' },
        { label: 'Projects',       icon: FolderOpen,     to: '/admin/projects' },
      ],
    },
    {
      label: 'People & Content', items: [
        { label: 'Customers', icon: Users,        to: '/admin/customers' },
        { label: 'Employees',   icon: Star, to: '/admin/employees' },
        { label: 'Users',   icon: UserCog, to: '/admin/users' },
      ],
    },
    {
      label: 'Support', items: [
        { label: 'Reviews',            icon: Star,            to: '/admin/reviews' },
        { label: 'Tickets',            icon: LifeBuoy,       to: '/admin/tickets' },
        { label: 'Reports',            icon: BarChart2,       to: '/admin/reports' },
        { label: 'Settings',  icon: Settings,     to: '/admin/settings' },
      ],
    },
  ];

  const profilePath = isAdmin ? '/admin/profile' : '/profile';

  // ── Customer account menu ──────────────────────────────────────────────────
  const customerLinks = [
    { label: 'My Profile',        icon: User,          to: profilePath },
    { label: 'My Orders',         icon: ShoppingBag,   to: '/orders' },
    { label: 'My Quotes',         icon: FileText,      to: '/my-quotes' },
    { label: 'Quote Requests',    icon: ClipboardList, to: '/my-quote-requests' },
    { label: 'My Projects',       icon: FolderOpen,    to: '/my-projects' },
    { label: 'My Tickets',        icon: FolderOpen,    to: '/my-tickets' },
    { label: 'Wishlist',          icon: Heart,         to: '/wishlist' },
  ];

  return (
    <>
    <div style={{ height: 60, flexShrink: 0 }} />
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to   { opacity: 1; max-height: 600px; }
        }
        @keyframes headerReveal {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
        }
      `}</style>

      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        transform: visible ? 'translateY(0)' : 'translateY(-110%)',
        transition: 'transform 320ms cubic-bezier(0.4,0,0.2,1), background 300ms ease, box-shadow 300ms ease, backdrop-filter 300ms ease',
        background: scrolled
          ? 'rgba(255,255,255,0.72)'
          : 'white',
        backdropFilter: scrolled ? 'blur(18px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(18px) saturate(180%)' : 'none',
        borderBottom: scrolled
          ? '1px solid rgba(168,85,247,0.18)'
          : '1px solid rgba(168,85,247,0.25)',
        boxShadow: scrolled
          ? '0 4px 24px rgba(168,85,247,0.1), 0 1px 0 rgba(168,85,247,0.08)'
          : '0 1px 8px rgba(0,0,0,0.06)',
      }} className="dark:bg-gray-900/80 dark:border-gray-700">

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px', height: 60, display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <img src={logo} alt="TISL" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
          </Link>

          {/* ── Nav links (desktop) ──────────────────────────────────────── */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 16, flex: 1 }} className="hidden-mobile">

            <Link to="/" style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: isActive('/') && location.pathname === '/' ? '#a855f7' : '#374151', textDecoration: 'none', transition: 'all 150ms' }} className="dark:text-gray-200">
              Home
            </Link>

            {/* Products mega menu */}
            <div style={{ position: 'relative' }} onMouseEnter={products.enter} onMouseLeave={products.leave}>
              <button type="button" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                color: isActive('/products') ? '#a855f7' : '#374151',
                background: isActive('/products') ? 'rgba(168,85,247,0.08)' : 'transparent',
                border: 'none', cursor: 'pointer',
              }} className="dark:text-gray-200">
                <Package size={14} /> Products
                <ChevronDown size={12} style={{ transform: products.open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
              </button>

              <MegaPanel open={products.open} onEnter={products.enter} onLeave={products.leave} width={520}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Product Categories</span>
                  <Link to="/products" onClick={() => products.setOpen(false)} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textDecoration: 'none' }}>
                    All Products →
                  </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, maxHeight: 360, overflowY: 'auto' }}>
                  {/* Category tree */}
                  <div style={{ padding: '10px 8px', borderRight: '1px solid #f9fafb' }}>
                    {productCategories.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#9ca3af', padding: '8px 12px' }}>Loading…</p>
                    ) : productCategories.map(cat => (
                      <CategoryNode key={cat.id} cat={cat} onNavigate={(path) => { navigate(path); products.setOpen(false); }} />
                    ))}
                  </div>

                  {/* Brands column */}
                  <div style={{ padding: '10px 8px' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px 8px' }}>Brands</p>
                    {brands.map(brand => (
                      <button
                        key={brand.id}
                        type="button"
                        onClick={() => { navigate(`/products?brand=${brand.id}`); products.setOpen(false); }}
                        style={{ width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 500, color: '#374151', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        className="hover:bg-purple-50 dark:hover:bg-gray-700 dark:text-gray-300"
                      >
                        {brand.logo ? (
                          <img src={brand.logo} alt={brand.name} style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                        ) : (
                          <Award size={13} style={{ color: '#d1d5db', flexShrink: 0 }} />
                        )}
                        {brand.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 6 }}>
                  {[{ label: '🔥 Specials', to: '/specials' }, { label: '⭐ Featured', to: '/products?featured=true' }].map(l => (
                    <Link key={l.to} to={l.to} onClick={() => products.setOpen(false)} style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', background: '#f9fafb', padding: '5px 10px', borderRadius: 20, textDecoration: 'none', transition: 'all 120ms' }}
                      className="hover:bg-purple-100 hover:text-purple-700">
                      {l.label}
                    </Link>
                  ))}
                </div>
              </MegaPanel>
            </div>

            {/* Services mega menu */}
            <div style={{ position: 'relative' }} onMouseEnter={services.enter} onMouseLeave={services.leave}>
              <button type="button" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                color: isActive('/services') ? '#a855f7' : '#374151',
                background: isActive('/services') ? 'rgba(168,85,247,0.08)' : 'transparent',
                border: 'none', cursor: 'pointer',
              }} className="dark:text-gray-200">
                <Wrench size={14} /> Services
                <ChevronDown size={12} style={{ transform: services.open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
              </button>

              <MegaPanel open={services.open} onEnter={services.enter} onLeave={services.leave} width={340}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Service Categories</span>
                  <Link to="/services" onClick={() => services.setOpen(false)} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textDecoration: 'none' }}>
                    All Services →
                  </Link>
                </div>
                <div style={{ padding: '10px 8px', maxHeight: 320, overflowY: 'auto' }}>
                  {serviceCategories.length === 0 ? (
                    <Link to="/services" onClick={() => services.setOpen(false)} style={{ display: 'block', padding: '8px 12px', fontSize: '0.83rem', color: '#6b7280', textDecoration: 'none' }}>
                      Browse all services →
                    </Link>
                  ) : serviceCategories.map(cat => (
                    <CategoryNode key={cat.id} cat={cat} onNavigate={(path) => {
                      navigate(`/services?category=${cat.id}`); services.setOpen(false);
                    }} />
                  ))}
                </div>
                <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6' }}>
                  <Link to="/request-quote" onClick={() => services.setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: '#a855f7', textDecoration: 'none', padding: '6px 8px', borderRadius: 8, background: 'rgba(168,85,247,0.06)' }}>
                    <FileText size={13} /> Request a Custom Quote
                  </Link>
                </div>
              </MegaPanel>
            </div>

            <Link to="/specials" style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: isActive('/specials') ? '#a855f7' : '#ef4444', textDecoration: 'none' }}>
              🔥 Specials
            </Link>

            <Link to="/about" style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: '#374151', textDecoration: 'none' }} className="dark:text-gray-200">
              About
            </Link>
            <Link to="/contact" style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: '#374151', textDecoration: 'none' }} className="dark:text-gray-200">
              Contact
            </Link>
          </nav>

          {/* ── Right icons ──────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>

            {/* Search */}
            <button type="button" onClick={() => setSearchOpen(s => !s)}
              style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#374151' }}
              className="dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Search size={17} />
            </button>

            <ThemeSwitcher />

            {/* Wishlist */}
            <Link to="/wishlist" style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', textDecoration: 'none' }}
              className="dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Heart size={17} />
              {wishlistCount > 0 && <Badge count={wishlistCount} />}
            </Link>

            {/* Quote list */}
            <Link to="/quote-list" style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', textDecoration: 'none' }}
              className="dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Quote List">
              <ClipboardList size={17} />
              {quoteListCount > 0 && <Badge count={quoteListCount} color="#7c3aed" />}
            </Link>

            {/* Cart */}
            <Link to="/cart" style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', textDecoration: 'none' }}
              className="dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
              <ShoppingCart size={17} />
              {cartCount > 0 && <Badge count={cartCount} />}
            </Link>

            {/* User menu */}
            {isAuthenticated ? (
              <div style={{ position: 'relative' }} ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 10px 5px 5px', borderRadius: 24,
                    border: '1.5px solid #e5e7eb', background: 'white',
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                  className="dark:bg-gray-800 dark:border-gray-600 hover:border-purple-400"
                >
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white' }}>
                      {(user?.name || user?.email || 'U')[0].toUpperCase()}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="dark:text-gray-200">
                    {user?.name?.split(' ')[0] || 'Account'}
                  </span>
                  <ChevronDown size={12} style={{ color: '#9ca3af', transform: userMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                </button>

                {userMenuOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 999,
                    background: 'white', borderRadius: 14, minWidth: 240,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.12)', border: '1px solid #f3f4f6',
                    animation: 'fadeInDown 150ms ease',
                    maxHeight: '80vh', overflowY: 'auto',
                  }} className="dark:bg-gray-800 dark:border-gray-700">

                    {/* User info */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0 }} className="dark:text-white">{user?.name}</p>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '2px 0 0' }}>{user?.email}</p>
                      {isAdmin && (
                        <span style={{ display: 'inline-block', marginTop: 6, fontSize: '0.65rem', fontWeight: 800, color: '#7c3aed', background: '#ede9fe', padding: '2px 8px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {user?.role}
                        </span>
                      )}
                    </div>

                    {/* Customer links */}
                    <div style={{ padding: '8px 6px' }}>
                      {customerLinks
                        .filter(link => !isAdmin || ['My Profile'].includes(link.label))
                        .map(link => (
                        <Link key={link.to} to={link.to} onClick={() => setUserMenuOpen(false)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500, color: '#374151', textDecoration: 'none', transition: 'all 120ms' }}
                          className="dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700 hover:text-purple-700">
                          <link.icon size={15} style={{ color: '#9ca3af' }} />
                          {link.label}
                        </Link>
                      ))}
                    </div>

                    {/* Admin section */}
                    {isAdmin && (
                      <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 6px' }}>
                        <p style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px 6px' }}>Admin</p>
                        <Link to="/admin/profile" onClick={() => setUserMenuOpen(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500, color: '#374151', textDecoration: 'none', transition: 'all 120ms' }}
      className="dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700 hover:text-purple-700">
      <User size={14} style={{ color: '#a855f7' }} />
      My Admin Profile
    </Link>
    
                        {adminGroups.map(group => (
                          <div key={group.label}>
                            <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px 2px' }}>{group.label}</p>
                            {group.items.map(item => (
                              <Link key={item.to} to={item.to} onClick={() => setUserMenuOpen(false)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500, color: '#374151', textDecoration: 'none', transition: 'all 120ms' }}
                                className="dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700 hover:text-purple-700">
                                <item.icon size={14} style={{ color: '#a855f7' }} />
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Logout */}
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 6px' }}>
                      <button type="button" onClick={handleLogout}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 120ms' }}
                        className="hover:bg-red-50 dark:hover:bg-red-900/20">
                        <LogOut size={15} /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <Link to="/login" style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, color: '#374151', textDecoration: 'none', border: '1.5px solid #e5e7eb', background: 'white', transition: 'all 150ms' }} className="dark:text-gray-200 dark:border-gray-600 dark:bg-gray-800">
                  Sign In
                </Link>
                <Link to="/register" style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, color: 'white', textDecoration: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 2px 8px rgba(168,85,247,0.3)' }}>
                  Register
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button type="button" onClick={() => setMobileOpen(o => !o)}
              style={{ width: 36, height: 36, borderRadius: 9, display: 'none', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#374151' }}
              className="show-mobile dark:text-gray-200">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* ── Search bar ───────────────────────────────────────────────────── */}
        {searchOpen && (
          <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px', background: 'white' }} className="dark:bg-gray-900 dark:border-gray-700">
            <form onSubmit={handleSearch} style={{ maxWidth: 600, margin: '0 auto', display: 'flex', gap: 8 }}>
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products…"
                style={{ flex: 1, padding: '8px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.85rem', outline: 'none' }}
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
              <button type="submit" style={{ padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                Search
              </button>
              <button type="button" onClick={() => setSearchOpen(false)} style={{ padding: '8px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                <X size={16} />
              </button>
            </form>
          </div>
        )}

        {/* ── Mobile menu ──────────────────────────────────────────────────── */}
        {mobileOpen && (
          <div style={{ borderTop: '1px solid #f3f4f6', background: 'white', maxHeight: '80vh', overflowY: 'auto' }} className="dark:bg-gray-900 dark:border-gray-700">
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { label: 'Home', to: '/' },
                { label: 'Products', to: '/products' },
                { label: 'Services', to: '/services' },
                { label: '🔥 Specials', to: '/specials' },
                { label: 'About', to: '/about' },
                { label: 'Contact', to: '/contact' },
                { label: 'Manual', to: '/manual' },
              ].map(l => (
                <Link key={l.to} to={l.to}
                  style={{ padding: '10px 12px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 600, color: isActive(l.to) ? '#a855f7' : '#374151', textDecoration: 'none', background: isActive(l.to) ? 'rgba(168,85,247,0.08)' : 'transparent' }}
                  className="dark:text-gray-200">
                  {l.label}
                </Link>
              ))}

              {isAuthenticated && (
                <>
                  <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }} />
                  <p style={{ fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px' }}>My Account</p>
                  {customerLinks
                  .filter(link => !isAdmin || ['My Profile'].includes(link.label))
                  .map(l => (
                    <Link key={l.to} to={l.to}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 500, color: '#374151', textDecoration: 'none' }}
                      className="dark:text-gray-300">
                      <l.icon size={15} style={{ color: '#a855f7' }} /> {l.label}
                    </Link>
                  ))}
                </>
              )}

              {isAdmin && (
                <>
                  <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }} />
                  <p style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px' }}>Admin</p>
                  {adminGroups.flatMap(g => g.items).map(item => (
                    <Link key={item.to} to={item.to}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: '0.83rem', fontWeight: 500, color: '#374151', textDecoration: 'none' }}
                      className="dark:text-gray-300">
                      <item.icon size={14} style={{ color: '#a855f7' }} /> {item.label}
                    </Link>
                  ))}
                </>
              )}

              {isAuthenticated ? (
                <button type="button" onClick={handleLogout}
                  style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}>
                  <LogOut size={15} /> Sign Out
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Link to="/login" style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700, color: '#374151', textDecoration: 'none', border: '1.5px solid #e5e7eb' }}>Sign In</Link>
                  <Link to="/register" style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700, color: 'white', textDecoration: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)' }}>Register</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </>
  );
}

// ── Badge bubble ──────────────────────────────────────────────────────────────
function Badge({ count }) {
  return (
    <span style={{
      position: 'absolute', top: 2, right: 2,
      minWidth: 16, height: 16, borderRadius: 8,
      background: '#a855f7', color: 'white',
      fontSize: '0.6rem', fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 4px', lineHeight: 1,
      boxShadow: '0 0 0 2px white',
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}