(() => {
  const WORKER_URL = "https://sneaky-clean-booking.drew-martin331.workers.dev";
  const form = document.querySelector("[data-popup-form]");
  if (!form) return;

  const kind = form.dataset.popupForm;
  const status = form.querySelector("[data-form-status]");
  const success = document.querySelector("[data-form-success]");
  const submit = form.querySelector('button[type="submit"]');

  function track(eventName, params = {}) {
    if (typeof window.gtag === "function") window.gtag("event", eventName, params);
  }

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = `popup-form__status ${type}`.trim();
  }

  function formPayload() {
    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());
    payload.smsConsent = data.get("smsConsent") === "on";
    payload.sitePermission = data.get("sitePermission") === "on";
    payload.upgrades = data.getAll("upgrades");
    return payload;
  }

  const community = new URLSearchParams(window.location.search).get("community");
  if (community && form.elements.community) form.elements.community.value = community.slice(0, 200);

  form.querySelectorAll('input[name="upgrades"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const choices = [...form.querySelectorAll('input[name="upgrades"]')];
      if (checkbox.value === "None" && checkbox.checked) {
        choices.filter((choice) => choice !== checkbox).forEach((choice) => { choice.checked = false; });
      } else if (checkbox.checked) {
        const none = choices.find((choice) => choice.value === "None");
        if (none) none.checked = false;
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const payload = formPayload();
    if (kind === "resident" && !payload.upgrades.length) {
      setStatus("Choose an upgrade preference, including None.", "error");
      return;
    }

    submit.disabled = true;
    setStatus("Submitting your request...");

    try {
      const response = await fetch(`${WORKER_URL}/popup/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We could not submit the request.");

      form.hidden = true;
      success.hidden = false;
      success.focus();
      track(kind === "resident" ? "popup_resident_interest_submitted" : "popup_manager_inquiry_submitted", {
        community: payload.community,
      });
    } catch (error) {
      setStatus(`${error.message} Please call 615-481-0464 if the problem continues.`, "error");
      submit.disabled = false;
    }
  });
})();
