// BEGIN shared attribution
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
// END shared attribution
(function () {
  const GOOGLE_ADS_CONVERSION_ID = "AW-17685937498";
  const GOOGLE_ADS_CALL_LABEL = "jQ_fCKq9voUdENr6p_FB"; // Website - Call click
  const GOOGLE_ADS_BOOKING_LABEL = "jaaTCKS9voUdENr6p_FB"; // Website - Booking request

  function track(eventName, params) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", eventName, params || {});
  }

  function trackAdsConversion(label, bookingId) {
    if (!GOOGLE_ADS_CONVERSION_ID || !label || typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", {
      send_to: `${GOOGLE_ADS_CONVERSION_ID}/${label}`,
      ...(bookingId ? {transaction_id:bookingId} : {}),
    });
  }

  document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
    link.addEventListener("click", () => {
      track("click_call_now", {
        link_text: link.textContent.trim(),
        phone_number: link.getAttribute("href").slice(4),
      });
      trackAdsConversion(GOOGLE_ADS_CALL_LABEL);
    });
  });

  function bookingActionFor(link) {
    const href = link.getAttribute("href") || "";
    const text = link.textContent.trim().toLowerCase();

    if (text.includes("quote") || text.includes("ask about") || href.includes("37OHZSEUAONVHAKJMBQ4YH6U")) {
      return "quote";
    }
    return "booking";
  }

  document.querySelectorAll('a[href^="sms:"]').forEach((link) => {
    link.addEventListener("click", () => {
      track("click_text_quote", {
        link_text: link.textContent.trim(),
        phone_number: "+17178709439",
      });
    });
  });

  document.querySelectorAll('a[href^="#sc-book"]').forEach((link) => {
    link.addEventListener("click", () => {
      const action = bookingActionFor(link);
      track(action === "quote" ? "click_quote_cta" : "click_booking_cta", {
        link_text: link.textContent.trim(),
        booking_hash: link.getAttribute("href"),
      });
    });
  });

  document.querySelectorAll('a[data-quote-form]').forEach((link) => {
    link.addEventListener("click", () => {
      track("click_quote_cta", {
        link_text: link.textContent.trim(),
        quote_path: "/estimate/",
      });
    });
  });

  let started = false;
  window.addEventListener('sneakyclean:booking-opened', () => {
    if (started) return; started = true;
    try { if (sessionStorage.getItem('sc-main-booking-start')) return; sessionStorage.setItem('sc-main-booking-start','1'); } catch {}
    track('booking_flow_started', {booking_path:'main_site'});
  });
  const measuredBookings = new Set();
  window.addEventListener("sneakyclean:booking-submitted", event => {
    const bookingId = event?.detail?.bookingId;
    if (typeof bookingId !== "string" || !/^[a-z0-9_-]{6,40}$/i.test(bookingId) || measuredBookings.has(bookingId)) return;
    measuredBookings.add(bookingId);
    try { const key = 'sc-booking-event-' + bookingId; if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch {}
    const params = { booking_id: bookingId, booking_path: 'main_site' };
    track("booking_request_submitted", params);
    track("appointment_booked", params);
    trackAdsConversion(GOOGLE_ADS_BOOKING_LABEL, bookingId);
  });
})();
