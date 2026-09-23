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

  window.addEventListener("sneakyclean:booking-submitted", () => {
    track("booking_request_submitted");
    trackAdsConversion(GOOGLE_ADS_BOOKING_LABEL);
  });
})();
