/**
 * Text helpers: Persian/Latin digits, HTML escaping, word normalisation, duration formatting.
 */

export function toLatinDigits(v) {
    const faDigits = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩';
    const enDigits = '01234567890123456789';
    return String(v || '').replace(/[۰-۹٠-٩]/g, d => enDigits[faDigits.indexOf(d)]);
}

export function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

export function normalizeWord(t) {
    let s = toLatinDigits(t).trim().toLowerCase();
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, ' ');
    s = s.replace(/[ً-ٰٟ]/g, '');
    s = s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/إ|أ|آ/g, 'ا');
    s = s.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()؟?!،؛«»"']/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

// "۲ دقیقه و ۹ ثانیه" / "۴۵ ثانیه" — used for the total spy catch-time stat.
export function formatSecondsFa(totalSec) {
    const s = Math.max(0, Math.round(totalSec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m === 0) return `${toPersianDigits(r)} ثانیه`;
    return `${toPersianDigits(m)} دقیقه و ${toPersianDigits(r)} ثانیه`;
}

export function toPersianDigits(value) {
    const faDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return String(value).replace(/[0-9]/g, d => faDigits[d]);
}
