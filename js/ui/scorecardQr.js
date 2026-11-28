/**
 * Loads the QR code picture that the scorecard image carries in its footer.
 *
 * The picture is a file of the app (assets/qr/spyfall-qr.png, precached by the service worker like the other
 * files under assets/), so it is normally there even offline. It is still only an extra: if it cannot be loaded
 * (a missing file, a failed request, a slow network), loadScorecardQr() resolves to null and the scorecard is
 * saved without a code. It never rejects, so the image can always be saved.
 *
 * The path is relative to the page, not to this module, so it is the same in the source tree and in the bundled
 * build (which moves the code but leaves assets/ where it is).
 */

export const SCORECARD_QR_SRC = './assets/qr/spyfall-qr.png';
export const SCORECARD_QR_TIMEOUT_MS = 4000;

let loadedImage = null;
let pending = null;

const defaultCreateImage = () => (typeof Image === 'function' ? new Image() : null);

/**
 * Starts (or reuses) the load of the QR picture.
 *   returns null           where images cannot be loaded at all (no Image constructor): the caller has nothing
 *                          to wait for and draws at once, without a code
 *   returns a Promise      that resolves to the loaded image, or to null if it could not be loaded in time
 * A successful load is kept for the rest of the session; a failed one is not, so the next save tries again.
 * `createImage` and `timeoutMs` are parameters only so that tests can stand in for the browser.
 */
export function loadScorecardQr(createImage = defaultCreateImage, timeoutMs = SCORECARD_QR_TIMEOUT_MS) {
    if (loadedImage) return Promise.resolve(loadedImage);
    if (pending) return pending;
    const image = createImage();
    if (!image) return null;
    pending = new Promise((resolve) => {
        let timer = null;
        const finish = (ok) => {
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            pending = null;
            if (ok) loadedImage = image;
            resolve(ok ? image : null);
        };
        image.onload = () => finish(image.naturalWidth > 0);
        image.onerror = () => finish(false);
        timer = setTimeout(() => finish(false), timeoutMs);
        image.src = SCORECARD_QR_SRC;
    });
    return pending;
}

/** Forgets the kept picture and any load in progress (for tests). */
export function resetScorecardQr() {
    loadedImage = null;
    pending = null;
}
