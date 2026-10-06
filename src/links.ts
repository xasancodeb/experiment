// Link checks. A link can only become a paid link if the store is a partner
// whose affiliate terms allow a platform to share commission with members.
//
// Amazon is deliberately NOT a partner: its Associates agreement forbids
// giving anyone money or rewards for using affiliate links.

/** Demo partner list. In production this comes from approved network programs. */
export const PARTNER_MERCHANTS: Record<string, string> = {
  "sephora.com": "Sephora",
  "ulta.com": "Ulta Beauty",
  "target.com": "Target",
  "nordstrom.com": "Nordstrom",
  "rei.com": "REI",
  "bestbuy.com": "Best Buy",
  "etsy.com": "Etsy",
  "bookshop.org": "Bookshop.org",
  "uniqlo.com": "Uniqlo",
  "wayfair.com": "Wayfair",
};

/** Shorteners hide where a link really goes, so they are never allowed. */
const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly", "cutt.ly", "is.gd",
  "shorturl.at", "tiny.cc", "rb.gy", "s.id", "lnkd.in", "buff.ly",
]);

export interface LinkCheck {
  ok: boolean;
  problem?: string;
  url?: string;
  host?: string;
  merchant?: string;
  partner: boolean;
}

export function checkLink(raw: string): LinkCheck {
  const value = raw.trim();
  if (!value) return { ok: true, partner: false };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, partner: false, problem: "That link doesn't look right. Paste the full address starting with https://" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, partner: false, problem: "Links must start with https:// so they're secure." };
  }
  if (url.username || url.password) {
    return { ok: false, partner: false, problem: "That link contains login details. Please remove them." };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (SHORTENERS.has(host)) {
    return { ok: false, partner: false, problem: "Short links hide where they go. Please paste the store's full link." };
  }
  if (!host.includes(".") || /^\d+(\.\d+){3}$/.test(host)) {
    return { ok: false, partner: false, problem: "Please link to a real store website." };
  }
  // Remove other people's tracking codes so nobody can hijack a recommendation.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref|tag|aff|affiliate|irclickid|clickid|ranmid|ranEAID|ranSiteID)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  const partnerKey = Object.keys(PARTNER_MERCHANTS).find((d) => host === d || host.endsWith(`.${d}`));
  return {
    ok: true,
    url: url.toString(),
    host,
    merchant: partnerKey ? PARTNER_MERCHANTS[partnerKey] : host,
    partner: Boolean(partnerKey),
  };
}
