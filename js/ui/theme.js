/**
 * Theme selection and <meta name=theme-color> sync.
 */

import { THEME_COLORS } from '../core/config.js';

/** Apply the saved theme on load. */
export function initTheme() {
    let savedTheme = 'default';

    try {
        savedTheme = localStorage.getItem('spy_selected_theme') || 'default';
    } catch(e){}

    document.body.setAttribute('data-theme', savedTheme);

    document.getElementById('theme-selector').value = savedTheme;

    updateThemeMeta(savedTheme);
}

export function updateThemeMeta(theme) {
    const meta = document.getElementById('meta-theme-color');
    if (meta && THEME_COLORS[theme]) {
        meta.setAttribute('content', THEME_COLORS[theme]);
    }
}
