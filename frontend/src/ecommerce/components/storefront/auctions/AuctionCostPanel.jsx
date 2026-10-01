import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import auctionsAPI from '../../../../_shared/api/auctions';
import { useAuthStore } from '../../../../_shared/store/index';
import PolicyConsentCheckbox from '../../../../_shared/components/legal/shared/PolicyConsentCheckbox';

/**
 * What winning would actually cost, and what is needed before bidding.
 *   Winning bid · VAT · each charge · amount payable
 * The figures come from the server (the same rules that build the order), for the bid shown now.
 * `money` formats an amount in the auction's currency.
 */
export default function AuctionCostPanel({ auctionId, bid, money, ended, onRegistrationChange }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [quote, setQuote] = useState(null);
  const [reg, setReg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [acceptances, setAcceptances] = useState([]);

  useEffect(() => {
    if (!auctionId || !(bid > 0)) return undefined;
    let live = true;
    const t = setTimeout(() => {
      auctionsAPI.getQuote(auctionId, bid).then((q) => { if (live) setQuote(q); }).catch(() => { if (live) setQuote(null); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [auctionId, bid]);

  const loadRegistration = () => {
    if (!isAuthenticated) return;
    auctionsAPI.getRegistration(auctionId).then((r) => { setReg(r); onRegistrationChange?.(r); }).catch(() => {});
  };
  useEffect(loadRegistration, [auctionId, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const register = async () => {
    if (!isAuthenticated) { navigate(`/login?redirect=/auctions/${auctionId}`); return; }
    if (reg?.terms?.required && !reg.terms.accepted && !agreed) { toast.error('Please agree to the auction terms first.'); return; }
    setBusy(true);
    try {
      const res = await auctionsAPI.register(auctionId, acceptances);
      toast.success(res.message ?? 'Registered');
      loadRegistration();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not register'); }
    finally { setBusy(false); }
  };

  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.85rem', color: '#4b5563', padding: '3px 0' };
  const small = { fontSize: '0.72rem', color: '#9ca3af' };
  const chargesTax = quote ? quote.lines.reduce((s, l) => s + Number(l.tax), 0) : 0;
  const upfront = quote?.upfront ?? [];
  const status = reg?.registration?.status;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reg?.required && !ended && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '14px 18px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 800, color: '#92400e' }}>Register to bid</p>
          <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#78350f' }}>
            This auction asks for {upfront.map((u) => `${u.name.toLowerCase()} ${money(u.gross)}${u.refundable ? ' (refundable)' : ''}`).join(' and ')} before you can bid.
            {upfront.some((u) => u.refundable) && ' A deposit is released to your account when the auction closes.'}
          </p>
          {!status && reg.terms?.required && !reg.terms.accepted && (
            <div style={{ margin: '0 0 10px' }}>
              <PolicyConsentCheckbox policyKeys={[reg.terms.policy_key]} actionContext="auction_bidding" onChange={(checked, a) => { setAgreed(checked); setAcceptances(a); }} />
            </div>
          )}
          {!status && (
            <button type="button" onClick={register} disabled={busy || (reg.terms?.required && !reg.terms.accepted && !agreed)}
              style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#d97706', color: 'white', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              {busy ? 'Registering…' : 'Register now'}
            </button>
          )}
          {status === 'awaiting_payment' && (
            <button type="button" onClick={() => navigate(`/orders/${reg.registration.order_id}`)}
              style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#d97706', color: 'white', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              Pay registration ({money(Number(reg.registration.entry_amount) + Number(reg.registration.deposit_amount))}+) in My orders
            </button>
          )}
          {status === 'registered' && <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#15803d' }}>✓ You&apos;re registered — you can bid.</p>}
        </div>
      )}

      {quote && (
        <div style={{ background: 'white', border: '1px solid #f3f4f6', borderRadius: 14, padding: '14px 18px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            If you win at {money(quote.bid.net)}
          </p>
          <div style={row}><span>Winning bid</span><span>{money(quote.bid.net)}</span></div>
          {quote.bid.tax > 0 && <div style={row}><span>{quote.bid.label ?? 'VAT'}</span><span>{money(quote.bid.tax)}</span></div>}
          {quote.lines.map((l) => (
            <div key={l.charge_id} style={row}>
              <span>{l.name}</span><span>{money(l.net)}</span>
            </div>
          ))}
          {chargesTax > 0 && <div style={row}><span>VAT on charges</span><span>{money(chargesTax)}</span></div>}
          <div style={{ ...row, marginTop: 6, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontWeight: 800, color: '#111827', fontSize: '0.95rem' }}>
            <span>Amount payable</span><span>{money(quote.totals.payable)}</span>
          </div>
          {upfront.length > 0 && (
            <p style={{ ...small, margin: '8px 0 0' }}>
              Paid before bidding and not included above: {upfront.map((u) => `${u.name} ${money(u.gross)}`).join(', ')}.
            </p>
          )}
          {quote.accruing.length > 0 && (
            <p style={{ ...small, margin: '4px 0 0' }}>
              Later, if not collected on time: {quote.accruing.map((u) => (u.basis === 'per_day' ? `${u.name} ${money(u.rate)}/day${u.free_days ? ` after ${u.free_days} free days` : ''}` : `${u.name} ${money(u.gross)}`)).join(', ')}.
            </p>
          )}
          <p style={{ ...small, margin: '4px 0 0' }}>The bid you place excludes VAT and these charges; they are added when you win.</p>
        </div>
      )}
    </div>
  );
}
