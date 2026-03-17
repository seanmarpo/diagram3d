/**
 * shareUrl.js
 *
 * Encodes the current diagram source + UI settings into a URL hash so the
 * full state can be restored by visiting the link.
 *
 * Format: window.location.hash = '#' + base64url(JSON.stringify(state))
 *
 * No server required – everything lives in the fragment, which is never sent
 * to the server and survives static hosting on GitHub Pages / Netlify / etc.
 *
 * State schema (v1):
 * {
 *   v: 1,                  // schema version for forward-compat
 *   src: string,           // raw diagram text
 *   strength: number,      // repulsion slider  (10–500)
 *   linkDist: number,      // link distance     (20–300)
 *   nodeSize: number,      // node size         (2–20)
 *   bloom: number,         // glow intensity    (0–100)
 *   labels: boolean,       // show labels toggle
 *   arrows: boolean,       // show arrows toggle
 * }
 */

// ── Encoding helpers ──────────────────────────────────────────────────────────

/**
 * Convert a UTF-8 string → base64url (URL-safe, no padding).
 * Uses the native TextEncoder + btoa path which is available in all modern
 * browsers without any external dependency.
 *
 * @param {string} str
 * @returns {string}
 */
function toBase64Url(str) {
  // Encode to UTF-8 bytes, then to a binary string for btoa
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Convert a base64url string → UTF-8 string.
 *
 * @param {string} b64url
 * @returns {string}
 */
function fromBase64Url(b64url) {
  // Re-pad and convert back to standard base64
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padding);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encode the given state object into a URL hash string and push it into the
 * browser history without triggering a page reload.
 *
 * @param {{
 *   src: string,
 *   strength: number,
 *   linkDist: number,
 *   nodeSize: number,
 *   bloom: number,
 *   labels: boolean,
 *   arrows: boolean,
 * }} state
 * @returns {string} The full shareable URL (window.location.href with new hash)
 */
export function encodeStateToUrl(state) {
  const payload = {
    v: 1,
    src: state.src,
    strength: state.strength,
    linkDist: state.linkDist,
    nodeSize: state.nodeSize,
    bloom: state.bloom,
    labels: state.labels,
    arrows: state.arrows,
  };

  const hash = toBase64Url(JSON.stringify(payload));
  const url = `${window.location.pathname}${window.location.search}#${hash}`;
  window.history.replaceState(null, "", url);
  return window.location.href;
}

/**
 * Attempt to decode the current URL hash into a state object.
 *
 * Returns `null` when:
 *   - the hash is absent or empty
 *   - the hash cannot be decoded / parsed
 *   - the decoded payload has an unrecognised schema version
 *
 * @returns {{
 *   src: string,
 *   strength: number,
 *   linkDist: number,
 *   nodeSize: number,
 *   bloom: number,
 *   labels: boolean,
 *   arrows: boolean,
 * } | null}
 */
export function decodeStateFromUrl() {
  const raw = window.location.hash.slice(1); // strip leading '#'
  if (!raw) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(raw));
  } catch {
    return null;
  }

  // Version guard – only v1 is understood right now
  if (!payload || payload.v !== 1) return null;

  // Validate required fields with sensible fallbacks so a partially-corrupt
  // hash still yields something usable rather than crashing.
  return {
    src: typeof payload.src === "string" ? payload.src : "",
    strength:
      typeof payload.strength === "number" ? payload.strength : 120,
    linkDist:
      typeof payload.linkDist === "number" ? payload.linkDist : 100,
    nodeSize:
      typeof payload.nodeSize === "number" ? payload.nodeSize : 7,
    bloom: typeof payload.bloom === "number" ? payload.bloom : 40,
    labels: typeof payload.labels === "boolean" ? payload.labels : true,
    arrows: typeof payload.arrows === "boolean" ? payload.arrows : true,
  };
}

/**
 * Copy the given text to the clipboard.
 * Returns a Promise that resolves to `true` on success, `false` on failure.
 *
 * Falls back to the legacy `execCommand` path for environments where the
 * Clipboard API is unavailable (e.g. non-HTTPS iframes).
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }

  // Legacy fallback
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
