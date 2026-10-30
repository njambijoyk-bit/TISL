import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import { eventsPlatformAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import MediaPanel from '../../components/admin/MediaPanel';
import ProviderBookings from '../../components/admin/ProviderBookings';

const box = { padding: 16, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', display: 'grid', gap: 12 };
const input = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', background: 'transparent', color: 'inherit' };
const btn = { padding: '9px 16px', borderRadius: 999, border: 0, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const ghost = { ...btn, background: 'transparent', color: 'inherit', border: '1px solid var(--line)' };
const DOCS = [['national_id', 'ID'], ['business_registration', 'Business registration'], ['tax_pin', 'Tax PIN certificate'], ['licence', 'Licence'], ['other', 'Other']];
const UNITS = { vendor: [['fixed', 'a fixed price'], ['per_guest', 'per guest'], ['per_hour', 'per hour'], ['per_day', 'per day']], venue: [['per_day', 'per day'], ['per_hour', 'per hour'], ['fixed', 'a fixed price']] };
const blankOffer = (plural) => ({ id: null, name: '', description: '', price: '', price_unit: plural === 'vendors' ? 'fixed' : 'per_day', deposit_percent: '', capacity: '', min_guests: '', inclusions: '' });
const L = ({ label, children }) => <label style={{ display: 'grid', gap: 4, fontSize: '0.84rem', fontWeight: 600 }}>{label}{children}</label>;

/** A vendor or venue runs their own listing: profile, packages (vendor) or spaces (venue), proof for TISL's check, and pictures and videos. */
export default function ProviderPage() {
  const { plural, id } = useParams();
  const vendor = plural === 'vendors';
  const [p, setP] = useState(null);
  const [f, setF] = useState(null);
  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState('national_id');

  const load = useCallback(() => eventsPlatformAPI.provider(plural, id).then((d) => {
    setP(d);
    setF({ name: d.name, summary: d.summary ?? '', description: d.description ?? '', email: d.email ?? '', phone: d.phone ?? '', website: d.website ?? '', is_listed: d.is_listed, tax_pin: d.tax_pin ?? '', registration_no: d.registration_no ?? '',
      service_areas: (d.service_areas ?? []).join(', '), county: d.county ?? '', town: d.town ?? '', address: d.address ?? '', facilities: (d.facilities ?? []).join(', ') });
  }).catch((e) => toast.error(errMsg(e, 'Could not open it'))), [plural, id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } finally { setBusy(false); } };
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const saveProfile = (e) => {
    e.preventDefault();
    const { service_areas, facilities, ...rest } = f;
    run(() => eventsPlatformAPI.saveProvider(plural, id, { ...rest, email: f.email || null, ...(vendor ? { service_areas: list(service_areas) } : { facilities: list(facilities) }) }), 'Saved');
  };
  const saveOffer = (e) => {
    e.preventDefault();
    const o = offer;
    const body = { name: o.name, description: o.description || null, price: Number(o.price) || 0, price_unit: o.price_unit, deposit_percent: o.deposit_percent === '' ? null : Number(o.deposit_percent),
      ...(vendor ? { min_guests: o.min_guests === '' ? null : Number(o.min_guests), inclusions: list(o.inclusions) } : { capacity: o.capacity === '' ? null : Number(o.capacity) }) };
    run(async () => { await eventsPlatformAPI.saveOffer(plural, id, o.id, body); setOffer(null); }, 'Saved');
  };
  const sendProof = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) run(() => eventsPlatformAPI.addProof(plural, id, docType, file), 'Sent to TISL');
  };

  if (!p || !f) return <div className="min-h-screen"><Header /><main style={{ maxWidth: 760, margin: '0 auto', padding: 32 }}>Loading…</main><Footer /></div>;
  const proof = p.documents ?? [];

  return (
    <div className="min-h-screen">
      <Helmet><title>{p.name} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 64px', display: 'grid', gap: 16 }}>
        <Link to="/organise" style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>← Organise with TISL</Link>
        <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 900, color: 'var(--color-primary-500)' }}>{p.name}</h1>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          {p.status === 'verified' ? 'Verified: you are listed in the directory.' : p.status === 'pending' ? 'Waiting for TISL to verify you. Send your proof below to speed it up.' : `Not listed (${p.status}${p.status_note ? `: ${p.status_note}` : ''}).`}
          {' '}TISL keeps {p.commission_in_force}% of bookings made through it.
        </p>

        <form onSubmit={saveProfile} style={box}>
          <strong>Your profile</strong>
          <L label="Name"><input required maxLength={160} value={f.name} onChange={set('name')} style={input} /></L>
          <L label="One-line summary"><input maxLength={300} value={f.summary} onChange={set('summary')} style={input} /></L>
          <L label="About"><textarea rows={5} maxLength={5000} value={f.description} onChange={set('description')} style={input} /></L>
          <L label="Email"><input type="email" value={f.email} onChange={set('email')} style={input} /></L>
          <L label="Phone"><input value={f.phone} onChange={set('phone')} style={input} /></L>
          <L label="Website"><input value={f.website} onChange={set('website')} style={input} /></L>
          {vendor ? <L label="Places you serve (separate with commas)"><input value={f.service_areas} onChange={set('service_areas')} style={input} placeholder="Nairobi, Kiambu" /></L> : (
            <>
              <L label="County"><input value={f.county} onChange={set('county')} style={input} /></L>
              <L label="Town"><input value={f.town} onChange={set('town')} style={input} /></L>
              <L label="Address"><input value={f.address} onChange={set('address')} style={input} /></L>
              <L label="Facilities (separate with commas)"><input value={f.facilities} onChange={set('facilities')} style={input} placeholder="Parking, Generator, Wi-Fi" /></L>
            </>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_listed} onChange={(e) => setF((x) => ({ ...x, is_listed: e.target.checked }))} /> Show me in the directory</label>
          <div><button type="submit" disabled={busy} style={btn}>Save profile</button></div>
        </form>

        <section style={box}>
          <strong>{vendor ? 'Your packages' : 'Your spaces'}</strong>
          {p.offers.length === 0 && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{vendor ? 'Add what you sell, for example "Wedding lunch, 1,500 per guest".' : 'Add each hall or space, with its capacity and price.'}</p>}
          {p.offers.map((o) => (
            <div key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', opacity: o.is_active ? 1 : 0.55 }}>
              <span style={{ flex: 1, minWidth: 160 }}><strong>{o.name}</strong> <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>· {Number(o.price).toLocaleString()} {(UNITS[vendor ? 'vendor' : 'venue'].find(([k]) => k === o.price_unit) ?? [])[1]}{o.capacity ? ` · up to ${o.capacity}` : ''}</span></span>
              <button type="button" style={ghost} onClick={() => setOffer({ ...blankOffer(plural), ...o, price: o.price ?? '', deposit_percent: o.deposit_percent ?? '', capacity: o.capacity ?? '', min_guests: o.min_guests ?? '', inclusions: (o.inclusions ?? []).join(', '), description: o.description ?? '' })}>Edit</button>
              <button type="button" style={ghost} onClick={() => run(() => eventsPlatformAPI.removeOffer(plural, id, o.id), 'Removed')}>Remove</button>
            </div>
          ))}
          {offer ? (
            <form onSubmit={saveOffer} style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <L label="Name"><input required maxLength={160} value={offer.name} onChange={(e) => setOffer({ ...offer, name: e.target.value })} style={input} /></L>
              <L label="Price"><input type="number" min="0" required value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value })} style={input} /></L>
              <L label="Charged"><select value={offer.price_unit} onChange={(e) => setOffer({ ...offer, price_unit: e.target.value })} style={input}>{UNITS[vendor ? 'vendor' : 'venue'].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
              <L label="Deposit to confirm a booking (%)"><input type="number" min="0" max="100" value={offer.deposit_percent} onChange={(e) => setOffer({ ...offer, deposit_percent: e.target.value })} style={input} /></L>
              {vendor ? <>
                <L label="Fewest guests"><input type="number" min="0" value={offer.min_guests} onChange={(e) => setOffer({ ...offer, min_guests: e.target.value })} style={input} /></L>
                <L label="What is included (separate with commas)"><input value={offer.inclusions} onChange={(e) => setOffer({ ...offer, inclusions: e.target.value })} style={input} /></L>
              </> : <L label="Capacity"><input type="number" min="0" value={offer.capacity} onChange={(e) => setOffer({ ...offer, capacity: e.target.value })} style={input} /></L>}
              <L label="Details"><textarea rows={3} value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} style={input} /></L>
              <div style={{ display: 'flex', gap: 8 }}><button type="submit" disabled={busy} style={btn}>Save</button><button type="button" style={ghost} onClick={() => setOffer(null)}>Cancel</button></div>
            </form>
          ) : <div><button type="button" style={ghost} onClick={() => setOffer(blankOffer(plural))}>{vendor ? 'Add a package' : 'Add a space'}</button></div>}
        </section>

        <ProviderBookings plural={plural} id={id} />

        <section style={box}>
          <strong>Proof for TISL</strong>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>Send an ID, your business registration or tax PIN certificate. Only TISL staff can see them.</p>
          {proof.map((d) => <div key={d.id} style={{ fontSize: '0.84rem' }}>{(d.title || d.type).replace(/_/g, ' ')} · <em>{d.status}</em>{d.note ? ` — ${d.note}` : ''}</div>)}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ ...input, width: 'auto' }} aria-label="Kind of document">{DOCS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={sendProof} disabled={busy} aria-label="Choose a file" />
          </div>
        </section>

        <section style={{ display: 'grid', gap: 8 }}>
          <strong>Pictures and videos</strong>
          <MediaPanel type={vendor ? 'vendor' : 'venue'} id={Number(id)} />
        </section>
      </main>
      <Footer />
    </div>
  );
}
