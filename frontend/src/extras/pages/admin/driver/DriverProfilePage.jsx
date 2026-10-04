import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, Mail, Phone, ShieldCheck, Key, LogOut, FileText, Star, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import { useAuthStore } from '../../../../_shared/store/index';
import { authAPI } from '../../../../_shared/api/index';
import { useDeliveryAudio } from '../delivery/useDeliveryAudio';
import { D, DeliveryPageShell, DeliveryPageHeader, DeliveryCard, DeliveryBtn } from '../delivery/DeliveryShared';

const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 4 };
const value = { margin: 0, padding: '9px 12px', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', background: 'var(--surface-input)', border: '1px solid var(--line)' };
const field = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, fontSize: '0.875rem', color: 'var(--text-primary)', background: 'var(--surface-input)', border: '1.5px solid var(--line)', outline: 'none', fontFamily: 'inherit' };

/**
 * The driver's own profile. Drivers only use /driver/*, so they cannot open the staff profile; this one shows who they are,
 * lets them change their photo and password, and links to the three things they work with.
 */
export default function DriverProfilePage() {
  const audio = useDeliveryAudio();
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuthStore();
  const fileRef = useRef(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [pwd, setPwd] = useState({ current_password: '', new_password: '', new_password_confirmation: '' });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState({});

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImgBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const res = await authAPI.uploadProfilePicture(body);
      updateUser({ ...user, profile_picture_url: res.profile_picture_url });
      toast.success('Profile picture updated');
    } catch { toast.error('Image upload failed'); } finally { setImgBusy(false); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setErrs({});
    if (pwd.new_password !== pwd.new_password_confirmation) { setErrs({ new_password_confirmation: ['Passwords do not match.'] }); return; }
    setSaving(true);
    try {
      await authAPI.changePassword(pwd);
      toast.success('Password changed');
      setPwd({ current_password: '', new_password: '', new_password_confirmation: '' });
    } catch (x) {
      const e2 = x.response?.data?.errors;
      if (e2) setErrs(e2); else toast.error(x.response?.data?.message || 'Could not change the password');
    } finally { setSaving(false); }
  };

  const photo = user?.profile_picture_url && !user.profile_picture_url.includes('ui-avatars.com') ? user.profile_picture_url : null;
  const initials = (user?.name ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <GeneralLayout>
      <DeliveryPageShell audio={audio}>
        <DeliveryPageHeader title="My Profile" sub="Your details and sign-in" actions={<DeliveryBtn variant="ghost" size="sm" onClick={() => { logout(); navigate('/login'); }}><LogOut size={13} /> Sign out</DeliveryBtn>} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, alignItems: 'start' }}>
          <DeliveryCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {photo
                  ? <img src={photo} alt={user.name} style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: 72, height: 72, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>{initials}</div>}
                <button type="button" onClick={() => fileRef.current?.click()} disabled={imgBusy} aria-label="Change photo"
                  style={{ position: 'absolute', right: -6, bottom: -6, width: 28, height: 28, borderRadius: '50%', border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'var(--color-primary-500)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imgBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={13} />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: D.text }}>{user?.name}</div>
                <div style={{ fontSize: '0.78rem', color: D.textMid, display: 'flex', alignItems: 'center', gap: 5 }}><ShieldCheck size={13} /> Driver</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><span style={label}>Full name</span><p style={value}>{user?.name || '—'}</p></div>
              <div><span style={label}><Mail size={10} /> Email</span><p style={value}>{user?.email || '—'}</p></div>
              <div><span style={label}><Phone size={10} /> Phone</span><p style={value}>{user?.phone || 'Not set'}</p></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <DeliveryBtn variant="ghost" size="sm" onClick={() => navigate('/driver/manifests')}><FileText size={13} /> My manifests</DeliveryBtn>
              <DeliveryBtn variant="ghost" size="sm" onClick={() => navigate('/driver/ratings')}><Star size={13} /> My ratings</DeliveryBtn>
              <DeliveryBtn variant="ghost" size="sm" onClick={() => navigate('/driver/incidents')}><AlertTriangle size={13} /> My incidents</DeliveryBtn>
            </div>
          </DeliveryCard>

          <DeliveryCard>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: D.text, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><Key size={15} /> Change password</div>
            <form onSubmit={savePassword} style={{ display: 'grid', gap: 12 }}>
              {[['current_password', 'Current password'], ['new_password', 'New password'], ['new_password_confirmation', 'Confirm new password']].map(([k, l]) => (
                <div key={k}>
                  <span style={label}>{l}</span>
                  <div style={{ position: 'relative' }}>
                    <input type={show ? 'text' : 'password'} value={pwd[k]} onChange={(e) => setPwd((p) => ({ ...p, [k]: e.target.value }))} required autoComplete={k === 'current_password' ? 'current-password' : 'new-password'} style={{ ...field, paddingRight: 38 }} />
                    {k === 'current_password' && (
                      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide passwords' : 'Show passwords'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                  </div>
                  {errs[k] && <p role="alert" style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#ef4444' }}>{errs[k][0]}</p>}
                </div>
              ))}
              <DeliveryBtn onClick={() => {}} disabled={saving} style={{ justifyContent: 'center' }}>{saving ? 'Saving…' : 'Update password'}</DeliveryBtn>
            </form>
          </DeliveryCard>
        </div>
      </DeliveryPageShell>
    </GeneralLayout>
  );
}
