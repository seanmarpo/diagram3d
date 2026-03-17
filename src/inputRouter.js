/**
 * inputRouter.js
 *
 * Auto-detects whether input is a Mermaid flowchart or an Excalidraw JSON
 * diagram and routes it to the appropriate parser.
 *
 * Both parsers return the same normalised shape:
 *   { nodes: NodeDef[], edges: EdgeDef[], direction: string }
 *
 * NodeDef  { id, label, shape }
 * EdgeDef  { from, to, label, dashed, thick, arrow }
 */

import { parseMermaid, validateMermaid } from './parser.js';
import { parseExcalidraw, validateExcalidraw } from './excalidrawParser.js';

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Sniff the raw input string and return which format it looks like.
 * @param {string} src
 * @returns {'mermaid' | 'excalidraw' | 'unknown'}
 */
export function detectFormat(src) {
  const trimmed = (src || '').trim();

  if (!trimmed) return 'unknown';

  // Excalidraw files are JSON objects whose first key is "type": "excalidraw"
  // or at minimum start with { or [ (no Mermaid diagram begins with a brace).
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'excalidraw';

  // Mermaid flowchart / graph header
  if (/^(?:flowchart|graph)\b/i.test(trimmed)) return 'mermaid';

  return 'unknown';
}

// ── Unified validator ──────────────────────────────────────────────────────

/**
 * Validate input regardless of format.
 * Returns { ok: true, format } or { ok: false, message }.
 *
 * @param {string} src
 * @returns {{ ok: boolean, format?: string, message?: string }}
 */
export function validateAny(src) {
  const format = detectFormat(src);

  if (format === 'unknown') {
    if (!src || !src.trim()) {
      return { ok: false, message: 'Diagram source is empty.' };
    }
    return {
      ok: false,
      message:
        'Unrecognised diagram format.\n' +
        'Paste a Mermaid flowchart (starting with `flowchart TD` or `graph LR`) ' +
        'or an Excalidraw JSON file.',
    };
  }

  if (format === 'mermaid') {
    const result = validateMermaid(src);
    return result.ok ? { ok: true, format } : result;
  }

  if (format === 'excalidraw') {
    const result = validateExcalidraw(src);
    return result.ok ? { ok: true, format } : result;
  }

  // Unreachable, but satisfies linters
  return { ok: false, message: 'Unrecognised format.' };
}

// ── Unified parser ─────────────────────────────────────────────────────────

/**
 * Parse input of any supported format into a normalised graph descriptor.
 *
 * @param {string} src
 * @returns {{ nodes: NodeDef[], edges: EdgeDef[], direction: string, format: string }}
 * @throws {Error} if the format is unrecognised or parsing fails
 */
export function parseAny(src) {
  const format = detectFormat(src);

  if (format === 'mermaid') {
    const graph = parseMermaid(src);
    return { ...graph, format };
  }

  if (format === 'excalidraw') {
    const graph = parseExcalidraw(src);
    return { ...graph, format };
  }

  throw new Error(
    'Unrecognised diagram format. ' +
    'Expected a Mermaid flowchart or an Excalidraw JSON file.'
  );
}
