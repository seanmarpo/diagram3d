/**
 * excalidrawParser.js
 *
 * Parses an Excalidraw JSON file (v2 format) and returns a normalised
 * { nodes: NodeDef[], edges: EdgeDef[] } graph descriptor — the same
 * interface produced by parser.js so the rest of the app is unchanged.
 *
 * Supported element types:
 *   rectangle  → shape: 'rect'
 *   ellipse    → shape: 'circle'
 *   diamond    → shape: 'diamond'
 *   text       → shape: 'rect'  (standalone text nodes only)
 *   arrow      → EdgeDef (requires both startBinding + endBinding)
 *   line       → EdgeDef (treated as a non-arrow edge)
 *
 * Unsupported / silently skipped:
 *   freedraw, frame, image, embeddable
 *   arrows / lines with only one binding (dangling)
 *   text elements that are bound to a shape as a label
 *
 * Label resolution:
 *   Uses the modern Excalidraw inline label format:
 *     - shape elements carry a top-level "label" object: { text: "..." }
 *     - arrow / line elements may also carry a "label" object
 *   Bound child text elements (older format) are NOT processed here.
 *
 * Edge style mapping:
 *   strokeStyle: "solid"            → solid arrow / line
 *   strokeStyle: "dashed" | "dotted"→ dashed arrow / line
 *   strokeWidth >= 4               → thick
 */

// ── Shape mapping ─────────────────────────────────────────────────────────

const SHAPE_MAP = {
  rectangle: 'rect',
  ellipse:   'circle',
  diamond:   'diamond',
  text:      'rect',
};

// Element types that represent graph nodes
const NODE_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'text']);

// Element types that represent graph edges
const EDGE_TYPES = new Set(['arrow', 'line']);

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract a display label from an element.
 * Modern format: element.label.text  (shapes + arrows)
 * Fallback: element.text             (text elements store their content here)
 */
function extractLabel(el) {
  if (el.label && typeof el.label.text === 'string' && el.label.text.trim()) {
    return el.label.text.trim();
  }
  if (typeof el.text === 'string' && el.text.trim()) {
    return el.text.trim();
  }
  return null;
}

/**
 * Determine whether an Excalidraw element is a bound label —
 * i.e. a text element whose id appears in another element's
 * boundElements list as type "text".  These should NOT become
 * standalone nodes.
 */
function buildBoundLabelIds(elements) {
  const ids = new Set();
  for (const el of elements) {
    if (!Array.isArray(el.boundElements)) continue;
    for (const binding of el.boundElements) {
      if (binding.type === 'text') {
        ids.add(binding.id);
      }
    }
  }
  return ids;
}

// ── Main parse function ───────────────────────────────────────────────────

/**
 * @param {string} src  Raw Excalidraw JSON source (file content).
 * @returns {{ nodes: NodeDef[], edges: EdgeDef[] }}
 *
 * NodeDef  { id, label, shape }
 * EdgeDef  { from, to, label, dashed, thick, arrow }
 */
export function parseExcalidraw(src) {
  let root;
  try {
    root = JSON.parse(src);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  // Accept both a top-level object { type, elements } and a bare array
  const elements = Array.isArray(root)
    ? root
    : Array.isArray(root.elements)
      ? root.elements
      : null;

  if (!elements) {
    throw new Error(
      'Could not find an "elements" array in the Excalidraw file.'
    );
  }

  // Pre-compute which text element ids are bound labels (not standalone nodes)
  const boundLabelIds = buildBoundLabelIds(elements);

  /** @type {NodeDef[]} */
  const nodes = [];
  /** @type {EdgeDef[]} */
  const edges = [];

  // Index elements by id for O(1) binding lookups
  const elementById = new Map();
  for (const el of elements) {
    if (el.id) elementById.set(el.id, el);
  }

  for (const el of elements) {
    // Skip deleted elements
    if (el.isDeleted) continue;

    // ── Node elements ─────────────────────────────────────────────
    if (NODE_TYPES.has(el.type)) {
      // Skip text elements that are bound labels on another shape
      if (el.type === 'text' && boundLabelIds.has(el.id)) continue;

      const shape = SHAPE_MAP[el.type] ?? 'rect';
      const label = extractLabel(el) ?? el.id;

      nodes.push({ id: el.id, label, shape });
      continue;
    }

    // ── Edge elements ─────────────────────────────────────────────
    if (EDGE_TYPES.has(el.type)) {
      const startId = el.startBinding?.elementId;
      const endId   = el.endBinding?.elementId;

      // Skip dangling arrows/lines (missing either endpoint)
      if (!startId || !endId) continue;

      // Skip if either bound element doesn't exist in the file
      if (!elementById.has(startId) || !elementById.has(endId)) continue;

      const dashed =
        el.strokeStyle === 'dashed' || el.strokeStyle === 'dotted';
      const thick  = typeof el.strokeWidth === 'number' && el.strokeWidth >= 4;
      // arrow elements are directional; line elements are not
      const arrow  = el.type === 'arrow';

      const label = extractLabel(el) ?? '';

      edges.push({ from: startId, to: endId, label, dashed, thick, arrow });
      continue;
    }

    // All other types (freedraw, frame, image, embeddable) — silently skip
  }

  return { nodes, edges };
}

// ── Validator ─────────────────────────────────────────────────────────────

/**
 * Lightweight pre-check before handing source to parseExcalidraw.
 * Returns { ok: true } or { ok: false, message: string }.
 */
export function validateExcalidraw(src) {
  if (!src || !src.trim()) {
    return { ok: false, message: 'Diagram source is empty.' };
  }

  const trimmed = src.trim();

  // Must start with { or [ to be JSON at all
  if (trimmed[0] !== '{' && trimmed[0] !== '[') {
    return {
      ok: false,
      message: 'Excalidraw diagrams must be valid JSON (starting with { or [).',
    };
  }

  let root;
  try {
    root = JSON.parse(trimmed);
  } catch {
    return { ok: false, message: 'Invalid JSON — could not parse Excalidraw file.' };
  }

  // Accept bare arrays (just elements) or the standard { type, elements } wrapper
  if (Array.isArray(root)) {
    return { ok: true };
  }

  if (root && typeof root === 'object') {
    // Warn if type field is present but wrong
    if (root.type && root.type !== 'excalidraw') {
      return {
        ok: false,
        message: `Expected Excalidraw JSON (type: "excalidraw"), got type: "${root.type}".`,
      };
    }

    if (!Array.isArray(root.elements)) {
      return {
        ok: false,
        message: 'Excalidraw JSON is missing an "elements" array.',
      };
    }

    return { ok: true };
  }

  return { ok: false, message: 'Unrecognised Excalidraw format.' };
}
