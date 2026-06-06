(function () {
  const GOOGLE_ADS_CONVERSION_ID = "";
  const GOOGLE_ADS_CALL_LABEL = "";
  const GOOGLE_ADS_BOOKING_LABEL = "";

  function track(eventName, params) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", eventName, params || {});
  }

  function trackAdsConversion(label) {
    if (!GOOGLE_ADS_CONVERSION_ID || !label || typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", {
      send_to: `${GOOGLE_ADS_CONVERSION_ID}/${label}`,
    });
  }

  document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
    link.addEventListener("click", () => {
      track("click_call_now", {
        link_text: link.textContent.trim(),
        phone_number: "+16154810464",
      });
      trackAdsConversion(GOOGLE_ADS_CALL_LABEL);
    });
  });

  document.querySelectorAll('a[href^="#sc-book"]').forEach((link) => {
    link.addEventListener("click", () => {
      track("click_booking_cta", {
        link_text: link.textContent.trim(),
        booking_hash: link.getAttribute("href"),
      });
    });
  });

  window.addEventListener("sneakyclean:booking-submitted", () => {
    track("booking_request_submitted");
    trackAdsConversion(GOOGLE_ADS_BOOKING_LABEL);
  });
})();
