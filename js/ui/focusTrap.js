/**
 * Keyboard focus trap for modal dialogs.
 */

export function trapFocus(modalEl) {
    const focusables = modalEl.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    modalEl.onkeydown = (e) => {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    };
    // preventScroll: focusing the first focusable element (which, in a
    // modal with no inputs, may be the Close button at the very bottom)
    // must not drag a long scrollable list down with it.
    first.focus({ preventScroll: true });
}
