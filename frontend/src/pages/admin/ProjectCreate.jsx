import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import useProjectStore from '../../store/projectStore';
import currencyAPI from '../../api/currency';
import customersAPI from '../../api/customers';
import api from '../../api/axios';

const STATUS_OPTIONS   = ['planning', 'active', 'on_hold'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const label = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ProjectCreate = () => {
  const navigate = useNavigate();
  const { createProject, loading } = useProjectStore();

  const [currencies, setCurrencies]             = useState([]);
  const [customers, setCustomers]               = useState([]);
  const [admins, setAdmins]                     = useState([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const [form, setForm] = useState({
    title:                    '',
    description:              '',
    customer_id:              '',
    owner_admin_id:           '',
    status:                   'planning',
    priority:                 'medium',
    base_currency:            '',
    delivery_location:        '',
    default_shipping_address: '',
    default_billing_address:  '',
    billing_same_as_shipping: true,
    start_date:               '',
    target_end_date:          '',
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  useEffect(() => {
    const loadDropdowns = async () => {
      setLoadingDropdowns(true);

      const [currencyRes, baseCurrencyRes, customersRes, adminsRes] = await Promise.allSettled([
        currencyAPI.getCurrencies(),
        currencyAPI.getBaseCurrency(),
        customersAPI.getAllCustomers({ per_page: 200 }),
        api.get('/admin/users', { params: { per_page: 100 } }),
      ]);

      // Currencies
      if (currencyRes.status === 'fulfilled') {
        const active = (currencyRes.value.data || currencyRes.value || []).filter((c) => c.is_active);
        setCurrencies(active);
        const baseCode =
          baseCurrencyRes.status === 'fulfilled'
            ? (baseCurrencyRes.value.data?.code || baseCurrencyRes.value?.code || '')
            : '';
        set('base_currency', baseCode || active[0]?.code || 'KES');
      } else {
        setCurrencies([{ code: 'KES', name: 'Kenyan Shilling' }]);
        set('base_currency', 'KES');
      }

      // Customers
      if (customersRes.status === 'fulfilled') {
        const list = customersRes.value.data || customersRes.value || [];
        setCustomers(Array.isArray(list) ? list : []);
      }

      // Admins — same pattern as AssignModal
      if (adminsRes.status === 'fulfilled') {
        const list = adminsRes.value.data?.data || adminsRes.value.data || [];
        setAdmins(Array.isArray(list) ? list : []);
      }

      setLoadingDropdowns(false);
    };

    loadDropdowns();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required.');
    if (!form.customer_id)  return toast.error('Please select a customer.');

    const payload = { ...form };
    payload.customer_id = Number(payload.customer_id);
    if (payload.owner_admin_id) payload.owner_admin_id = Number(payload.owner_admin_id);
    else delete payload.owner_admin_id;
    if (!payload.start_date)               delete payload.start_date;
    if (!payload.target_end_date)          delete payload.target_end_date;
    if (!payload.delivery_location)        delete payload.delivery_location;
    if (!payload.default_shipping_address) delete payload.default_shipping_address;
    if (!payload.default_billing_address)  delete payload.default_billing_address;

    const res = await createProject(payload);
    if (res.success) {
      toast.success('Project created successfully.');
      navigate(`/admin/projects/${res.data.id}`);
    } else {
      toast.error(res.error || 'Failed to create project.');
    }
  };

  const inputCls = `w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
    bg-white dark:bg-gray-900 text-gray-900 dark:text-white
    focus:outline-none focus:ring-2 focus:ring-primary-500`;

  const Skeleton = () => (
    <div className="h-9 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
  );

  const getAdminName = (u) =>
    u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unnamed';

  const formatCustomerName = (c) => {
    let name = '';

    if (c.first_name && c.last_name) {
      name = `${c.first_name.charAt(0)}.${c.last_name}`;
    } else if (c.first_name) {
      name = c.first_name;
    } else if (c.last_name) {
      name = c.last_name;
    }

    const company = c.company_name ? ` - ${c.company_name}` : '';
    const email = c.email ? ` (${c.email})` : '';

    return `${name || ''}${company}${email}`.trim() || '—';
  };

  return (
    <AdminLayout>
      <PageHeader
        title="New Project"
        subtitle="Create a new project for a customer"
        backLink="/admin/projects/list"
        backLabel="Back to Projects"
      />

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">

        {/* ── Basic Info ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Basic Information</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Title *
            </label>
            <input
              type="text" required value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Office Fitout — Westlands Branch"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              rows={3} value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Brief overview of this project..."
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={inputCls}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{label(p)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Customer & Owner ────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Customer & Ownership</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Customer *
            </label>
            {loadingDropdowns ? <Skeleton /> : (
              <>
                <select
                  required
                  value={form.customer_id}
                  onChange={(e) => set('customer_id', e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select a customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatCustomerName(c)}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">No customers found.</p>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Owner (Staff) <span className="text-gray-400 font-normal">— optional</span>
            </label>
            {loadingDropdowns ? <Skeleton /> : (
              <>
                <select
                  value={form.owner_admin_id}
                  onChange={(e) => set('owner_admin_id', e.target.value)}
                  className={inputCls}
                >
                  <option value="">Unassigned</option>
                  {admins.map((u) => (
                    <option key={u.id} value={u.id}>
                      {getAdminName(u)}{u.email ? ` (${u.email})` : ''}
                    </option>
                  ))}
                </select>
                {admins.length === 0 && (
                  <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-1">
                    No staff users found — project will be unassigned.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Timeline & Currency ──────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Timeline & Currency</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target End Date</label>
              <input type="date" value={form.target_end_date} onChange={(e) => set('target_end_date', e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Base Currency</label>
              {loadingDropdowns ? <Skeleton /> : (
                <select value={form.base_currency} onChange={(e) => set('base_currency', e.target.value)}
                  className={inputCls}>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* ── Addresses ───────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Delivery & Addresses</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Location</label>
            <input type="text" value={form.delivery_location}
              onChange={(e) => set('delivery_location', e.target.value)}
              placeholder="e.g. Westlands, Nairobi"
              className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shipping Address</label>
            <textarea rows={2} value={form.default_shipping_address}
              onChange={(e) => set('default_shipping_address', e.target.value)}
              className={`${inputCls} resize-none`} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.billing_same_as_shipping}
              onChange={(e) => set('billing_same_as_shipping', e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Billing address same as shipping</span>
          </label>

          {!form.billing_same_as_shipping && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Billing Address</label>
              <textarea rows={2} value={form.default_billing_address}
                onChange={(e) => set('default_billing_address', e.target.value)}
                className={`${inputCls} resize-none`} />
            </div>
          )}
        </div>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pb-8">
          <button
            type="button"
            onClick={() => navigate('/admin/projects/list')}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700
              dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading.submitting || loadingDropdowns}
            className="px-6 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700
              disabled:opacity-60 transition-colors"
          >
            {loading.submitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>

      </form>
    </AdminLayout>
  );
};

export default ProjectCreate;