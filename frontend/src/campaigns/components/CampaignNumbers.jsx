import { useEffect, useState } from 'react';
import campaignsAPI from '../../_shared/api/campaigns';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { card, colors } from '../../_shared/theme/tokens';

const n = (v) => Number(v ?? 0).toLocaleString();
const money = (v, code) => `${code ?? ''} ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Tile({ label, value, note, strong }) {
  return (
    <div style={{ ...card, padding: '12px 14px', borderColor: strong ? 'var(--color-primary-500)' : undefined }}>
      <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: strong ? colors.primary : colors.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note && <div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{note}</div>}
    </div>
  );
}

/** How a campaign is doing: who looked, what they clicked, and what sold from its featured items inside its dates. */
export default function CampaignNumbers({ id }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { campaignsAPI.numbers(id).then(setD).catch((e) => setErr(errMsg(e, 'Could not load the numbers'))); }, [id]);
  if (err) return <p role="alert" style={{ color: colors.dangerText, fontSize: '0.84rem' }}>{err}</p>;
  if (!d) return <p style={{ color: colors.textFaint, fontSize: '0.84rem' }}>Loading…</p>;
  const { visits: v, sales: s } = d;
  const max = Math.max(1, ...v.daily.map((x) => x.views));
  const rate = v.visitors > 0 && s ? `${((s.orders / v.visitors) * 100).toFixed(1)}% of visitors` : null;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <Tile label="Views" value={n(v.views)} note={`${n(v.visitors)} different visitors`} strong={d.goal === 'reach'} />
        <Tile label="Clicks" value={n(v.clicks)} note="buttons and links" />
        <Tile label="Item clicks" value={n(v.item_clicks)} note="featured items opened" />
        {s ? <Tile label="Sales" value={money(s.total, s.currency)} note={`${n(s.orders)} orders · ${n(s.units)} units${rate ? ` · ${rate}` : ''}`} strong={d.goal === 'sales'} /> : <Tile label="Sales" value="—" note="Counted once it has started" />}
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 8 }}>Views, last 30 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }} role="img" aria-label="Views per day for the last 30 days">
          {v.daily.map((x) => <div key={x.date} title={`${day(x.date)}: ${x.views}`} style={{ flex: 1, height: `${Math.max(2, (x.views / max) * 100)}%`, borderRadius: 3, background: x.views ? 'var(--color-primary-500)' : 'var(--line)' }} />)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: colors.textFaint, marginTop: 4 }}><span>{day(v.daily[0].date)}</span><span>{day(v.daily[v.daily.length - 1].date)}</span></div>
      </div>

      {s && s.items.length > 0 && (
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 8 }}>Sales by item · {day(s.window.from)} to {day(s.window.to)}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <tbody>{s.items.map((i) => (
              <tr key={`${i.type}:${i.id}`} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 0' }}>{i.name ?? `${i.type} #${i.id}`} <span style={{ fontSize: '0.66rem', color: colors.textFaint, textTransform: 'uppercase' }}>{i.type}</span></td>
                <td style={{ textAlign: 'right', color: colors.textMuted }}>{n(i.units)} sold</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(i.amount, s.currency)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint, lineHeight: 1.5 }}>
        Views count once per visitor per day, and staff are not counted. Sales are the invoices and cash sales of the featured items dated inside the campaign, less credit notes, in your base currency. Auctions are not counted here.
      </p>
    </div>
  );
}
