/**
 * Toasts and invalid-field feedback.
 */

export function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    while (c.children.length >= 3) {
        c.firstElementChild.remove();
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.remove(); }, 3500);
}

// Targeted field validation: shows the toast AND pulses the exact
// offending input so the person immediately knows which field to fix.
export function pulseInvalidField(el) {
    if (!el) return;
    el.setAttribute('aria-invalid', 'true');
    el.classList.remove('field-error-pulse');
    void el.offsetWidth; // restart the animation if it's already mid-pulse
    el.classList.add('field-error-pulse');
    try { el.focus({ preventScroll: false }); } catch(e) { el.focus(); }
    if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    clearTimeout(el._pulseTimeout);
    el._pulseTimeout = setTimeout(() => {
        el.classList.remove('field-error-pulse');
        el.removeAttribute('aria-invalid');
    }, 1300);
}

export function flagFieldError(fieldId, msg) {
    showToast(msg);
    pulseInvalidField(document.getElementById(fieldId));
}
