(() => {
  const form = document.querySelector('[data-fleet-form]');
  if (!form) return;

  const status = form.querySelector('[data-form-status]');
  const success = document.querySelector('[data-form-success]');
  const submit = form.querySelector('button[type="submit"]');
  let sending = false;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    // Reject whitespace-only answers without trimming line breaks inside the scope.
    for (const field of form.querySelectorAll('[required]')) field.value = field.value.trim();
    if (!form.reportValidity()) return;

    const fields = new FormData(form);
    if (fields.get('_honey')) return;
    const phone = String(fields.get('phone')).replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      setStatus('Please enter a complete phone number, including the area code.', true);
      form.elements.phone.focus();
      return;
    }

    sending = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setStatus('Sending your inquiry…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const payload = Object.fromEntries(fields.entries());
      payload._replyto = payload.email;
      const endpoint = new URL(form.action);
      endpoint.pathname = `/ajax${endpoint.pathname}`;
      const response = await fetch(endpoint.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json();
      // FormSubmit also returns HTTP 200 for activation and validation failures.
      if (!response.ok || ![true, 'true'].includes(result.success)) {
        throw new Error('Submission not accepted');
      }

      form.hidden = true;
      success.hidden = false;
      success.focus();
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'fleet_commercial_inquiry_submitted');
      }
    } catch {
      setStatus("We couldn't confirm your inquiry was sent. Your answers are still here. Please try again, email sneakycleantn@gmail.com or call (717) 870-9439.", true);
    } finally {
      clearTimeout(timeout);
      sending = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();
