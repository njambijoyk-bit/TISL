// What is half-typed on a voucher form is kept in the browser. A template, or a draft a repeating template left, is put there and the form opened, so the form finds it as if it had just been typed.

/** The general voucher form keeps one draft per voucher type. */
export const putVoucherDraft = (typeId, state) => { try { window.localStorage.setItem(`voucher-draft:${typeId}`, JSON.stringify(state)); } catch { /* not kept: the form opens empty */ } };

/** The Purchases page keeps its draft for the session. */
export const putPurchaseDraft = (state) => { try { window.sessionStorage.setItem('purchase-draft:purchase:new', JSON.stringify(state)); } catch { /* not kept: the form opens empty */ } };

/** What a template saves of a form: everything but what belongs to this one voucher (its date, number, series and due dates). */
export function templateStateOf({ h, lines, entries, tenders, acct }) {
  const { date, voucher_number, series_id, due_date, valid_until, currency_id, ...rest } = h ?? {}; // eslint-disable-line no-unused-vars
  return { h: rest, lines: lines ?? [], entries: entries ?? [], tenders: tenders ?? [], acct: Boolean(acct) };
}

/** Open a template (or a draft's saved state) on its form. nav is react-router's navigate. */
export function openOnForm(item, nav) {
  const state = item.form_state ?? {};
  if (item.form === 'purchase') {
    putPurchaseDraft(state);
    nav('/admin/purchases/new');
  } else {
    putVoucherDraft(item.voucher_type_id, state);
    nav(`/admin/books/vouchers/new?type=${item.voucher_type_id}`);
  }
}
