// Remembers which campaign a visitor last opened a featured item from, for 7 days, so a purchase they make in that time can be credited to it.
const KEY = 'tisl_campaign_click';
const DAYS = 7;

/** Called when a visitor clicks a featured item on a campaign page. */
export function rememberCampaignClick(slug) {
  try { localStorage.setItem(KEY, JSON.stringify({ campaign: slug, at: new Date().toISOString() })); } catch { /* storage blocked: no attribution, nothing breaks */ }
}

/** What to send with an order: the remembered click if it is still inside the 7 days, else nothing (an old one is forgotten). */
export function campaignClaim() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v?.campaign || !v.at) return undefined;
    if (Date.now() - new Date(v.at).getTime() > DAYS * 86400000) { localStorage.removeItem(KEY); return undefined; }

    return v;
  } catch { return undefined; }
}
