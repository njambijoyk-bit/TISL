import { Save, Globe, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SettingsLayout from '../../../components/layout/SettingsLayout';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import Textarea from '../../../components/common/TextArea';
import toast from 'react-hot-toast';

// ── Reusable section label (Apple "APPS WE LOVE" style) ──────────────────────
const SectionLabel = ({ children }) => (
  <p className="text-[11px] font-semibold tracking-widest uppercase text-primary-600 dark:text-primary-400 mb-3">
    {children}
  </p>
);

// ── Clean field row used inside setting sections ──────────────────────────────
const SettingRow = ({ label, hint, children }) => (
  <div className="flex items-start justify-between gap-6 py-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <div className="min-w-0 flex-1">
      <p className="text-[15px] font-medium text-gray-900 dark:text-gray-100">{label}</p>
      {hint && <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
    </div>
    <div className="flex-shrink-0 w-64">{children}</div>
  </div>
);

export default function GeneralSettings() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    storeName: 'TISL Store',
    storeEmail: 'info@tislstore.com',
    storePhone: '+254 712 345 678',
    storeAddress: 'Nairobi, Kenya',
    taxRate: '16',
    shippingFee: '500',
    freeShippingThreshold: '5000',
    storeDescription: 'Your trusted partner for quality products and services',
  });

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast.success('Settings saved');
  };

  const set = (field) => (e) =>
    setSettings((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <SettingsLayout>
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">

      <div className="flex flex-1">

        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-8 py-10">

            {/* Back link */}
            <button
              onClick={() => navigate('/admin/settings')}
              className="flex items-center gap-1.5 text-[13px] text-primary-600 dark:text-primary-400 hover:underline mb-6"
            >
              <ArrowLeft size={14} /> Settings
            </button>

            {/* Page title — Apple Work style: big, bold, left */}
            <div className="flex items-end justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] bg-blue-500 flex items-center justify-center shadow-sm">
                  <Globe size={20} className="text-white" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                  General
                </h1>
              </div>
              <Button onClick={handleSave} icon={<Save size={16} />} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>

            {/* ── STORE INFORMATION ──────────────────────────────── */}
            <div className="mb-10">
              <SectionLabel>Store Information</SectionLabel>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-6">
                <SettingRow label="Store Name" hint="Displayed in receipts and emails">
                  <input
                    value={settings.storeName}
                    onChange={set('storeName')}
                    className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </SettingRow>
                <SettingRow label="Store Email" hint="Used for transactional emails">
                  <input
                    type="email"
                    value={settings.storeEmail}
                    onChange={set('storeEmail')}
                    className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </SettingRow>
                <SettingRow label="Phone Number">
                  <input
                    value={settings.storePhone}
                    onChange={set('storePhone')}
                    className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </SettingRow>
                <SettingRow label="Address" hint="Physical store location">
                  <textarea
                    value={settings.storeAddress}
                    onChange={set('storeAddress')}
                    rows={2}
                    className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </SettingRow>
                <SettingRow label="Description" hint="Shown on the storefront">
                  <textarea
                    value={settings.storeDescription}
                    onChange={set('storeDescription')}
                    rows={3}
                    className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </SettingRow>
              </div>
            </div>

            {/* ── TAX & SHIPPING ─────────────────────────────────── */}
            <div className="mb-10">
              <SectionLabel>Tax & Shipping</SectionLabel>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-6">
                <SettingRow label="Tax Rate" hint="Applied to all taxable orders">
                  <div className="relative">
                    <input
                      type="number"
                      value={settings.taxRate}
                      onChange={set('taxRate')}
                      className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pr-8 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">%</span>
                  </div>
                </SettingRow>
                <SettingRow label="Default Shipping Fee" hint="Charged when below free threshold">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">KES</span>
                    <input
                      type="number"
                      value={settings.shippingFee}
                      onChange={set('shippingFee')}
                      className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pl-11 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Free Shipping Threshold" hint="Orders above this get free shipping">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">KES</span>
                    <input
                      type="number"
                      value={settings.freeShippingThreshold}
                      onChange={set('freeShippingThreshold')}
                      className="w-full text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pl-11 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </SettingRow>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
    </SettingsLayout>
  );
}