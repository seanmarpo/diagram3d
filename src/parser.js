/**
 * parser.js
 *
 * Parses a subset of Mermaid flowchart / graph syntax and returns a normalised
 * { nodes: Node[], edges: Edge[] } graph descriptor.
 *
 * Supported:
 *   graph / flowchart  (TD | LR | BT | RL | TB)
 *   Node shapes:
 *     id               – default (rectangle)
 *     id[label]        – rectangle
 *     id(label)        – rounded rectangle
 *     id((label))      – circle
 *     id{label}        – diamond
 *     id>label]        – asymmetric
 *     id[(label)]      – cylinder / database
 *   Edges:
 *     -->   solid arrow
 *     ---   solid no-arrow
 *     -.->  dashed arrow
 *     -.-   dashed no-arrow
 *     ==>   thick arrow
 *   Edge labels:
 *     A -->|label| B
 *     A -- label --> B
 *   Subgraphs: parsed (nodes extracted) but not rendered as clusters
 *   Comments (%%) stripped
 */

// ── Node shape tokens ──────────────────────────────────────────────────────

const SHAPE_PATTERNS = [
  // [(label)]  cylinder / database  (must come before single bracket)
  { re: /^\[\((.+?)\)\]$/, shape: "cylinder" },
  // [[label]]  subroutine
  { re: /^\[\[(.+?)\]\]$/, shape: "subroutine" },
  // ((label))  circle
  { re: /^\(\((.+?)\)\)$/, shape: "circle" },
  // [label]    rectangle
  { re: /^\[(.+?)\]$/, shape: "rect" },
  // (label)    rounded
  { re: /^\((.+?)\)$/, shape: "rounded" },
  // {label}    diamond
  { re: /^\{(.+?)\}$/, shape: "diamond" },
  // >label]    asymmetric
  { re: /^>(.+?)\]$/, shape: "asymmetric" },
];

/**
 * Given the suffix after an id token like `[My label]` or `((circle))`,
 * return { label, shape }.  Returns null when there is no shape suffix.
 */
/**
 * Strip Mermaid icon directives from a label string.
 * e.g. "fa:fa-car Car" → "Car",  "fab:fa-github" → "fab:fa-github" (no trailing text, keep as-is)
 */
function stripIconDirective(label) {
  // Pattern: one or more "xx:xx-xx" icon tokens at the start, followed by optional label text
  const m = label.match(/^(?:fa[a-z]*:fa-[\w-]+\s*)+(.*)$/);
  if (m) {
    const rest = m[1].trim();
    // If there's remaining text after the icon directive(s), use that as the label
    if (rest) return rest;
    // Otherwise the whole thing is an icon reference with no label — keep original
    return label;
  }
  return label;
}

function parseShape(suffix) {
  for (const { re, shape } of SHAPE_PATTERNS) {
    const m = suffix.match(re);
    if (m) return { label: stripIconDirective(m[1].trim()), shape };
  }
  return null;
}

// ── Edge pattern ───────────────────────────────────────────────────────────

/**
 * Matches the connector portion between two node tokens, e.g.
 *   -->  |label|
 *   -- text -->
 *   -.->
 *   ===
 * Returns { connector, label } or null.
 */
const EDGE_RE =
  /^(--+>|---+|-\.->|-\.-|==+>|==+|<--+|<-\.-)\s*(?:\|([^|]*)\|)?$/;

// Pre-compiled: "-- some label -->" or "-- label ---"
const INLINE_LABEL_EDGE_RE =
  /^(--+)\s+(.+?)\s+(--+>|---+|-\.->|-\.-|==+>|==+)$/;

function classifyEdge(raw) {
  raw = raw.trim();

  // inline label:  -- My label -->
  const il = raw.match(INLINE_LABEL_EDGE_RE);
  if (il) {
    return {
      label: il[2].trim(),
      dashed: raw.includes("-.") || false,
      thick: raw.startsWith("=="),
      arrow: il[3].includes(">"),
    };
  }

  const m = raw.match(EDGE_RE);
  if (!m) return null;
  return {
    label: m[2] ? m[2].trim() : "",
    dashed: raw.includes("-."),
    thick: raw.startsWith("=="),
    arrow: raw.includes(">") || raw.startsWith("<"),
  };
}

// ── Tokeniser ──────────────────────────────────────────────────────────────

/**
 * Very small hand-rolled tokeniser that splits a single connection line
 * (after comments and the graph header are stripped) into segments.
 *
 * e.g.  "A[My node] -->|yes| B{Choice} --> C"
 *  →  [ "A[My node]", "-->|yes|", "B{Choice}", "-->", "C" ]
 */
function tokeniseLine(line) {
  const tokens = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    // skip leading whitespace
    while (i < n && /\s/.test(line[i])) i++;
    if (i >= n) break;

    // ── Edge connector ─────────────────────────────────────────────
    // starts with  -  =  <
    if ("-=<".includes(line[i])) {
      let j = i;
      // consume connector chars: - = > .
      // Stop at | only after we've consumed the base arrow; then consume
      // the pipe label atomically: -->|label|
      while (j < n && "-=>. \t".includes(line[j])) {
        // stop consuming whitespace if we hit a word char (inline label)
        if (/\s/.test(line[j])) {
          // peek ahead: is the next non-space sequence followed by another connector?
          const rest = line.slice(j).trimStart();
          // inline label pattern: "-- text -->"
          if (/^[-=]/.test(rest)) break; // next token is another connector
          if (/^[^-=>|.\s]/.test(rest)) {
            // we're inside "-- label -->" — consume up to the next connector
            const labelEnd = rest.search(/(?:--+|==+|<-)/);
            if (labelEnd !== -1) {
              j += line.slice(j).indexOf(rest) + labelEnd;
              // now consume the trailing connector
              while (j < n && "-=>. \t".includes(line[j])) j++;
              break;
            }
          }
        }
        j++;
      }
      // If the connector is immediately followed by a pipe label -->|text|,
      // consume the entire |...| span so it stays part of this token.
      if (j < n && line[j] === "|") {
        j++; // consume opening |
        while (j < n && line[j] !== "|") j++;
        if (j < n) j++; // consume closing |
      }
      tokens.push(line.slice(i, j).trim());
      i = j;
      continue;
    }

    // ── Node token ─────────────────────────────────────────────────
    // id is word chars  + optional shape suffix  [..] (..) {..} ((..)) [(..)]
    let j = i;

    // consume id (word chars, hyphens, colons allowed — covers fa:fa-icon syntax)
    while (j < n && /[\w\-:]/.test(line[j])) j++;

    if (j === i) {
      // unrecognised char, skip
      i++;
      continue;
    }

    // optionally consume shape suffix (may be nested)
    if (j < n && "([{>".includes(line[j])) {
      const open = line[j];
      const closeMap = { "(": ")", "[": "]", "{": "}", ">": "]" };
      const close = closeMap[open];
      let depth = 0;
      while (j < n) {
        if (line[j] === open) depth++;
        else if (line[j] === close) {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
        j++;
      }
      // handle ((...)) and [(...)]
      if (j < n && line[j] === open) {
        while (j < n) {
          if (line[j] === open) depth++;
          else if (line[j] === close) {
            depth--;
            if (depth === 0) {
              j++;
              break;
            }
          }
          j++;
        }
      }
    }

    // If the id contained a colon (e.g. a bare "fa:fa-car" token with no
    // shape suffix), strip from the colon onward so the id stays clean.
    // Only do this when the colon appears BEFORE any shape-suffix bracket —
    // if the colon is inside "[fa:fa-car Car]" the suffix consumer already
    // captured it and stripIconDirective() will clean the label later.
    const raw = line.slice(i, j);
    const colonIdx = raw.search(/:/);
    const bracketIdx = raw.search(/[(\[{>]/);
    const colonIsInId =
      colonIdx !== -1 && (bracketIdx === -1 || colonIdx < bracketIdx);
    if (colonIsInId) {
      tokens.push(raw.slice(0, colonIdx) || raw);
    } else {
      tokens.push(raw);
    }
    i = j;
  }

  return tokens.filter(Boolean);
}

// ── ID extractor ───────────────────────────────────────────────────────────

/**
 * From a node token like  "A[My label]"  extract id="A", shapeSuffix="[My label]"
 * Also handles bare  "A"  (no shape).
 */
function parseNodeToken(token) {
  // id is leading word chars
  const idMatch = token.match(/^([\w\-]+)(.*)?$/s);
  if (!idMatch) return null;

  const id = idMatch[1];
  const suffix = (idMatch[2] || "").trim();

  if (!suffix) {
    return { id, label: id, shape: "rect" };
  }

  const shapeInfo = parseShape(suffix);
  if (shapeInfo) {
    return { id, label: shapeInfo.label, shape: shapeInfo.shape };
  }

  // fallback: treat whole suffix as label
  return {
    id,
    label: suffix.replace(/^[\[({>]|[\])}]$/g, "").trim() || id,
    shape: "rect",
  };
}

// ── Main parse function ────────────────────────────────────────────────────

/**
 * @param {string} src  Raw mermaid diagram source.
 * @returns {{ nodes: NodeDef[], edges: EdgeDef[], direction: string }}
 *
 * NodeDef  { id, label, shape }
 * EdgeDef  { from, to, label, dashed, thick, arrow }
 */
export function parseMermaid(src) {
  /** @type {Map<string, {id:string, label:string, shape:string}>} */
  const nodeMap = new Map();
  /** @type {EdgeDef[]} */
  const edges = [];

  let direction = "TD";

  const ensureNode = (id, label, shape) => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, label: label || id, shape: shape || "rect" });
    } else if (label && label !== id) {
      // update label/shape if we get richer info later
      const n = nodeMap.get(id);
      if (n.label === n.id) n.label = label;
      if (shape && n.shape === "rect") n.shape = shape;
    }
  };

  // ── Pre-process: strip comments, normalise line endings ──────────
  const lines = src
    .replace(/%%[^\n]*/g, "") // strip %% comments
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let inSubgraph = false;

  for (const raw of lines) {
    const line = raw.trim();

    // ── Header ───────────────────────────────────────────────────
    const headerMatch = line.match(
      /^(?:flowchart|graph)\s+(TD|LR|BT|RL|TB|LR)\b/i,
    );
    if (headerMatch) {
      direction = headerMatch[1].toUpperCase();
      continue;
    }

    // ── Subgraph ─────────────────────────────────────────────────
    if (/^subgraph\b/i.test(line)) {
      inSubgraph = true;
      continue;
    }
    if (/^end\b/i.test(line)) {
      inSubgraph = false;
      continue;
    }

    // ── Style / classDef / class / linkStyle directives (skip) ───
    if (/^(?:style|classDef|class|linkStyle|click)\b/i.test(line)) continue;

    // ── Connection line ───────────────────────────────────────────
    // Must contain at least one connector pattern
    if (!/--|==|<-|-\./.test(line)) {
      // Standalone node declaration  e.g.  A[My node]
      const solo = parseNodeToken(line);
      if (solo) ensureNode(solo.id, solo.label, solo.shape);
      continue;
    }

    // Split on & for parallel declarations:  A & B --> C
    // We handle them by expanding into individual pairs
    const expandAmpersand = (segment) => {
      return segment
        .split("&")
        .map((s) => s.trim())
        .filter(Boolean);
    };

    // Tokenise
    const tokens = tokeniseLine(line);
    if (tokens.length < 3) continue; // need at least: node edge node

    // Walk tokens: node (edge node)+
    let srcNodes = [];
    let i = 0;

    // First node(s)
    const firstIds = expandAmpersand(tokens[i]);
    for (const t of firstIds) {
      const p = parseNodeToken(t);
      if (p) {
        ensureNode(p.id, p.label, p.shape);
        srcNodes.push(p.id);
      }
    }
    i++;

    while (i < tokens.length - 1) {
      const edgeToken = tokens[i];
      const tgtToken = tokens[i + 1];
      i += 2;

      const edgeInfo = classifyEdge(edgeToken);
      if (!edgeInfo) continue;

      const tgtIds = expandAmpersand(tgtToken);
      const dstNodes = [];
      for (const t of tgtIds) {
        const p = parseNodeToken(t);
        if (p) {
          ensureNode(p.id, p.label, p.shape);
          dstNodes.push(p.id);
        }
      }

      for (const from of srcNodes) {
        for (const to of dstNodes) {
          edges.push({
            from,
            to,
            label: edgeInfo.label,
            dashed: edgeInfo.dashed,
            thick: edgeInfo.thick,
            arrow: edgeInfo.arrow !== false,
          });
        }
      }

      srcNodes = dstNodes;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    direction,
  };
}

// ── Validator ──────────────────────────────────────────────────────────────

/**
 * Lightweight pre-check before handing source to parseMermaid.
 * Returns { ok: true } or { ok: false, message: string }.
 */
export function validateMermaid(src) {
  if (!src || !src.trim()) {
    return { ok: false, message: "Diagram source is empty." };
  }

  const firstLine = src.trim().split("\n")[0].trim();
  if (!/^(?:flowchart|graph)\b/i.test(firstLine)) {
    return {
      ok: false,
      message:
        "Only flowchart / graph diagrams are supported.\n" +
        "Start your diagram with  `flowchart TD`  or  `graph LR`.",
    };
  }

  return { ok: true };
}
