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

/** Remove every toast that is on screen (a language change must not leave one in the old language). */
export function clearToasts() {
    const c = document.getElementById('toast-container');
    if (c) c.replaceChildren();
}

/**
 * Open every closed `<details>` around `el` (the setup screen keeps its options in collapsed groups). A control
 * inside a closed one is not rendered, so it can be neither focused nor scrolled to until its group is open.
 */
function openGroupsAround(el) {
    if (typeof el.closest !== 'function') return;
    for (let group = el.closest('details'); group; group = group.parentElement && group.parentElement.closest('details')) {
        if (!group.open) group.open = true;
    }
}

// Targeted field validation: shows the toast AND pulses the exact
// offending input so the person immediately knows which field to fix.
// A field inside a collapsed group opens the group first, so the problem is on screen.
export function pulseInvalidField(el) {
    if (!el) return;
    openGroupsAround(el);
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
