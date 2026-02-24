// Icon helper — wraps Lucide's createIcons and provides inline SVG generation
// Lucide is loaded globally from CDN

/**
 * Create an inline SVG icon element
 * @param {string} name - Lucide icon name (e.g. 'package', 'truck', 'map-pin')
 * @param {number} size - Icon size in pixels (default 18)
 * @param {string} cls - Optional additional CSS class
 * @returns {string} SVG HTML string
 */
export function icon(name, size = 18, cls = '') {
    return `<i data-lucide="${name}" class="${cls}" style="width:${size}px;height:${size}px;"></i>`;
}

/**
 * Call after injecting HTML containing data-lucide icons
 * Replaces <i data-lucide="..."> with actual SVGs
 */
export function renderIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}
