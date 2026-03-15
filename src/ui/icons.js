/**
 * src/ui/icons.js
 *
 * Shared helper for rendering lucide icons as inline SVGs.
 */

/**
 * Serialise a lucide icon descriptor into an inline SVG string.
 *
 * @param {Array}  icon
 * @param {number} [size=16]
 * @returns {string}
 */
export function iconSvg(icon, size = 16) {
  const children = icon
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrStr}/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${size}" viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${children}</svg>`;
}
