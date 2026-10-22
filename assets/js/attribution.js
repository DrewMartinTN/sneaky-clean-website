// Capture only campaign labels and public page paths; never contact fields, queries, or private fragments.
(function () {
  const key = 'sc-attribution-v1', ttl = 90 * 86400000;
  const clean = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._ -]{0,99}$/i.test(value) ? value.trim().toLowerCase() : '';
  const publicPath = value => /^\/(?:[a-z][a-z-]*\/?)?$/.test(value || '') ? value : '/';
  const host = value => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
  const own = h => /^(www\.)?sneakycleantn\.com$/.test(h) || h === location.hostname || h.endsWith('.workers.dev');
  const query = new URLSearchParams(location.search || ''), referrer = host(document.referrer || '');
  const utm = Object.fromEntries(['source','medium','campaign','content','term'].map(k => [k, clean(query.get('utm_' + k))]));
  let source = utm.source, medium = utm.medium, confidence = source ? 'tagged_link' : 'unknown';
  if (!source && referrer && !own(referrer)) {
    source = /(^|\.)google\./.test(referrer) ? 'google' : /(^|\.)bing\.com$/.test(referrer) ? 'bing' : /(^|\.)(instagram\.com|l\.instagram\.com)$/.test(referrer) ? 'instagram' : /(^|\.)facebook\.com$/.test(referrer) ? 'facebook' : /(^|\.)yelp\.com$/.test(referrer) ? 'yelp' : referrer;
    medium = ['google','bing'].includes(source) ? 'organic' : 'referral'; confidence = 'referrer';
  }
  const touch = {source: source || 'unknown', medium: medium || (source ? 'unspecified' : 'unknown'), campaign: utm.campaign, content: utm.content, term: utm.term, referrer: referrer && !own(referrer) ? referrer : '', landingPath: publicPath(location.pathname), confidence, capturedAt: new Date().toISOString()};
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  if (!saved || !saved.first || !saved.last || !Number.isFinite(Date.parse(saved.first.capturedAt)) || Date.now() - Date.parse(saved.first.capturedAt) > ttl) saved = {first:touch,last:touch};
  // Internal navigation and return visits preserve the latest attributable visit.
  if (touch.source !== 'unknown') saved.last = touch;
  try { localStorage.setItem(key, JSON.stringify(saved)); } catch {}
  window.SneakyCleanAttribution = {
    capture(bookingPath, reportedSource = '') {
      return JSON.parse(JSON.stringify({first:saved.first,last:saved.last,bookingPath,reportedSource:clean(reportedSource)}));
    }
  };
})();
