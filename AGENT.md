# Diagram 3D – Agent Progress Log


## Project Goal

A static web application that accepts a Mermaid flowchart/graph diagram or an Excalidraw JSON file as input and renders it as an interactive 3D force-directed graph, inspired by:

- **gh-skyline** – 3D city-skyline-style data visualisation
- **socket.dev dependency graph** – interactive floating node/edge graph in 3D space

---

## Stack Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Bundler / dev server | **Vite 7 (vanilla template)** | Zero framework overhead, fast HMR, static-site-first output |
| 3D rendering | **Three.js 0.183** | Industry standard, ships OrbitControls + CSS2DRenderer out of the box |
| Layout engine | **Custom Verlet force layout** | No external physics library needed; Barnes-Hut octree keeps O(n log n) repulsion |
| Mermaid parsing | **Hand-rolled parser** | `@mermaid-js/parser` does not support `flowchart`/`graph` diagram types; custom parser is ~370 LOC and covers all common syntax |
| Excalidraw parsing | **Hand-rolled parser** | Reads v2 Excalidraw JSON; maps shape/arrow elements to the same `NodeDef`/`EdgeDef` interface as the Mermaid parser |
| Input routing | **`inputRouter.js`** | Auto-detects format from the raw input string; exposes `parseAny()` and `validateAny()` so `main.js` is format-agnostic |
| Labels | **CSS2DRenderer** (Three.js) | HTML labels overlay the WebGL canvas; crisp at all zoom levels, zero texture-baking cost |
| Styling | **Vanilla CSS custom properties** | No framework, dark theme, sub-20 kB uncompressed |

---

## Accomplishments

### 1. Vite project scaffolded ✅
- Ran `npm create vite@latest . -- --template vanilla`
- Installed `three` as the sole runtime dependency
- Removed all Vite boilerplate (`counter.js`, `javascript.svg`, `vite.svg`)

### 2. `@mermaid-js/parser` evaluated and dropped ✅
- Tested the package at the Node REPL; it throws `Unknown diagram type` for both `flowchart` and `graph`
- Decision: write a custom parser (`src/parser.js`)

### 3. Mermaid flowchart parser (`src/parser.js`) ✅
- Supports `flowchart` and `graph` diagram headers with all four directions (TD/LR/BT/RL)
- Node shapes: `rect`, `rounded`, `circle`, `diamond`, `cylinder`, `subroutine`, `asymmetric`
- Edge types: solid arrow `-->`, solid line `---`, dashed arrow `-.->`, dashed line `-.-`, thick arrow `==>`
- Edge labels: pipe syntax `-->|label|` and inline `-- label -->`
- `&` parallel declarations: `A & B --> C`
- `subgraph`/`end` blocks parsed (nodes extracted, cluster rendering deferred)
- Directive lines (`style`, `classDef`, `class`, `linkStyle`, `click`) silently skipped
- `%%` comments stripped
- `validateMermaid()` pre-checks diagram type before full parse

### 3b. Excalidraw parser (`src/excalidrawParser.js`) ✅
- Accepts both the standard `{ type: "excalidraw", elements: [...] }` wrapper and a bare elements array
- Supported element types: `rectangle` → `rect`, `ellipse` → `circle`, `diamond` → `diamond`, `text` → `rect`
- Arrow/line elements with both `startBinding` and `endBinding` become edges; dangling connectors are silently skipped
- Label resolution uses the modern inline `label.text` field on each element; bound child text elements (older format) are deferred to a future pass
- Edge style mapping: `strokeStyle: "dashed"` / `"dotted"` → dashed; `strokeWidth >= 4` → thick; `type: "arrow"` → directional
- `validateExcalidraw()` pre-checks JSON structure and `type` field before full parse
- Deleted elements (`isDeleted: true`) are ignored
- Text elements that appear in another element's `boundElements` list (type `"text"`) are skipped as standalone nodes

### 3c. Input router (`src/inputRouter.js`) ✅
- `detectFormat(src)` sniffs the raw string: JSON starting with `{` or `[` → `'excalidraw'`; `flowchart`/`graph` header → `'mermaid'`; otherwise `'unknown'`
- `validateAny(src)` delegates to the correct validator and returns `{ ok, format }` on success
- `parseAny(src)` delegates to the correct parser and attaches `format` to the returned graph object
- `main.js` imports only `parseAny` / `validateAny` — zero format-specific logic in the entry point

### 4. Force-directed 3D layout engine (`src/forceLayout.js`) ✅
- Verlet integration (velocity + position update each tick)
- **Barnes-Hut octree** for O(n log n) repulsion approximation
- Forces: repulsion, spring attraction (Hooke's law), centering, velocity damping
- Configurable: `repulsion`, `linkDistance`, `linkStrength`, `centerStrength`, `damping`, `alphaDecay`
- `reheat()` / `updateConfig()` API for live slider updates
- `pinNode()` for drag-to-fix (future use)
- `onTick()` / `onEnd()` callbacks decouple layout from rendering
- Runs on `requestAnimationFrame`; stops automatically when alpha < alphaMin

### 5. Three.js scene renderer (`src/scene.js`) ✅
- **WebGLRenderer** with antialiasing, pixel-ratio cap at 2×
- **CSS2DRenderer** for crisp HTML node labels overlaid on the canvas
- **OrbitControls** (left-drag orbit, scroll zoom, right-drag pan) with damping
- Per-shape geometry: sphere (circle), octahedron (diamond), cylinder, box (rect/subroutine), tetrahedron (asymmetric), rounded sphere
- Per-shape colour palette (sky-blue, emerald, violet, amber, pink, orange)
- Additive-blending glow sprite per node (canvas-rendered radial gradient)
- Edge lines with `LineBasicMaterial` / `LineDashedMaterial`; positions updated each tick without geometry rebuilds (BufferAttribute mutation)
- Arrowhead cones oriented along the edge direction via `Quaternion.setFromUnitVectors`
- `ResizeObserver` keeps camera + renderers in sync with the container
- Raycaster hover: node highlight + floating CSS tooltip
- `setShowLabels`, `setShowArrows`, `setNodeSize`, `setGlowIntensity` live-update without graph rebuild

### 10. Bug fixes & visual improvements (`src/scene.js`) ✅

#### Label toggle fix
- **Root cause**: `setShowLabels` was setting `div.style.display = 'none'` on the underlying HTML element. `CSS2DRenderer` iterates the Three.js scene graph and projects every `CSS2DObject` regardless of DOM `display` state — it only checks `Object3D.visible`.
- **Fix**: replaced `div.style.display` with `labelObj.visible = show`. The same flag is now also set at creation time so the initial state is always respected.

#### Brighter, more visible edges
- Solid edge colour lifted from `0x475569` (dark slate, barely visible) → `0x38bdf8` (bright cyan)
- Dashed edge colour lifted from `0x334155` → `0x818cf8` (indigo)
- Thick edge colour kept at `0xf472b6` (pink) — already vivid
- Solid edge opacity raised from `0.6` → `0.9`; dashed from `0.7` → `0.85`; thick from `0.85` → `1.0`
- Arrowhead opacity raised to `1.0` and cone size slightly increased

#### Animated pulse dots
- One `THREE.Sprite` per edge travels from source node to target node on a continuous loop
- Sprites use **additive blending** so they glow brightly against the dark background
- Each dot's colour matches its edge type (cyan / indigo / pink)
- Shared `SpriteMaterial` instances per colour via `getPulseMat()` cache — no redundant canvas/texture allocations
- Per-edge random start phase (`pulseT`) prevents all dots from moving in lockstep
- Per-edge speed: dashed = 0.28 units/s (deliberate), solid = 0.42, thick = 0.55 (high-traffic feel)
- Margin offsets (8 % from each end) prevent the dot from clipping into node meshes
- Smooth fade-in / fade-out at each end via `opacity = min(t×6, 1) × min((1−t)×6, 1)`
- `THREE.Clock.getDelta()` drives time so speed is frame-rate independent
- Dot size scales with `setNodeSize()` to stay proportional
- `_clearEdges()` removes dots from the scene without disposing the shared material

### 6. Example diagrams (`src/examples.js`) ✅
- Five real-world diagrams: Web Architecture, CI/CD Pipeline, Auth Flow, Microservices, Data Pipeline
- Round-robin `nextExample()` cycles through them on each "Load example" click

### 7. Main entry point (`src/main.js`) ✅
- Wires UI → `parseAny` / `validateAny` (via `inputRouter.js`) → layout → scene
- Ctrl/Cmd+Enter renders from the textarea
- All four range sliders live-update layout or scene without re-parsing
- Toggle switches for labels and arrows
- Format badge in the sidebar updates to "Mermaid" or "Excalidraw" after each successful render

### 8. UI / CSS (`src/style.css`, `index.html`) ✅
- Full dark theme with CSS custom properties
- Sidebar (320 px): textarea, Render button, Load example, four sliders, two toggles
- Main canvas area with empty-state overlay, CSS2D label layer, tooltip, HUD pill
- Responsive: `ResizeObserver` handles window resizes
- App title updated to **Diagram 3D**; input badge reads "Mermaid / Excalidraw"; placeholder shows both formats; empty-state prompt updated

### 11. Shareable URL (`src/shareUrl.js`) ✅
- **"Share link" button** added to the sidebar (below the Render / Load example row)
- Clicking it encodes the full current state into the URL hash and copies the resulting URL to the clipboard
- Visual feedback: button turns green and shows "Copied!" for 2.5 s; falls back to "Link ready" if clipboard access is unavailable (non-HTTPS iframe, etc.)
- State schema **v1** encodes: diagram source text, force strength, link distance, node size, glow intensity, labels toggle, arrows toggle
- Encoding: `JSON.stringify(payload)` → UTF-8 bytes → standard base64url (URL-safe, no `=` padding) stored in `window.location.hash`
- No server round-trip; the fragment (`#…`) is never sent to the server – works on all static hosts (GitHub Pages, Netlify, etc.)
- `encodeStateToUrl(state)` – serialises state, calls `history.replaceState` to update the address bar without a page reload, returns the full URL
- `decodeStateFromUrl()` – reads `window.location.hash`, base64url-decodes, JSON-parses, validates version field; returns `null` on any error so a corrupt hash never crashes the app
- `copyToClipboard(text)` – tries the modern `navigator.clipboard` API first; falls back to the legacy `document.execCommand('copy')` path
- On startup, `main.js` calls `decodeStateFromUrl()` before the normal first-example pre-fill; if a valid shared state is found, `applyState()` restores all controls and `renderDiagram()` fires automatically
- `collectState()` reads all live control values; `applyState(state)` writes them back and propagates each value to the layout / scene immediately

### 9. Build configuration (`vite.config.js`) ✅
- Manual chunk split: `three` vendor chunk (~511 kB gzip 129 kB) separate from app code (~44 kB gzip 13 kB)
- `chunkSizeWarningLimit` raised to 600 kB (three.js is inherently large)
- `npm run build` produces a fully self-contained `dist/` folder with no external CDN calls

---

## File Structure

```
mermaid3d/
├── public/
│   └── favicon.svg              # Custom SVG favicon matching app logo
├── src/
│   ├── examples.js              # Built-in example diagrams (Mermaid + Excalidraw, round-robin)
│   ├── shareUrl.js              # Encode/decode state ↔ URL hash; clipboard helper
│   ├── excalidrawParser.js      # Excalidraw v2 JSON → { nodes, edges }
│   ├── forceLayout.js           # 3D Verlet force layout with Barnes-Hut octree
│   ├── inputRouter.js           # Format detection + unified parseAny / validateAny
│   ├── main.js                  # Entry point: UI wiring
│   ├── parser.js                # Mermaid flowchart/graph parser
│   ├── scene.js                 # Three.js scene, renderer, controls, raycasting
│   └── style.css                # Dark-theme CSS (custom properties, no framework)
├── index.html                   # App shell (sidebar + canvas container)
├── vite.config.js               # Chunk splitting, size limit
└── package.json                 # name: "diagram3d"; deps: three (runtime), vite (dev)
```

---

## Supported Input Formats

### Mermaid flowchart / graph

```
flowchart TD          ← or: graph TD | LR | BT | RL
  A[Rectangle]
  B(Rounded)
  C((Circle))
  D{Diamond}
  E[(Cylinder)]
  F[[Subroutine]]
  G>Asymmetric]

  A --> B             ← solid arrow
  B --- C             ← solid no-arrow
  C -.-> D            ← dashed arrow
  D -.- E             ← dashed no-arrow
  E ==> F             ← thick arrow
  A -->|label| B      ← pipe label
  A -- label --> B    ← inline label
  A & B --> C         ← parallel sources

  subgraph cluster
    X --> Y
  end
```

### Excalidraw JSON (v2, modern inline-label format)

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    { "id": "a1", "type": "rectangle", "label": { "text": "Browser" }, ... },
    { "id": "a2", "type": "ellipse",   "label": { "text": "Server"  }, ... },
    { "id": "a3", "type": "diamond",   "label": { "text": "Cache?"  }, ... },
    {
      "id": "e1",
      "type": "arrow",
      "startBinding": { "elementId": "a1" },
      "endBinding":   { "elementId": "a2" },
      "label": { "text": "HTTP" },
      "strokeStyle": "solid"
    }
  ]
}
```

Paste the full contents of an `.excalidraw` file directly into the textarea.

Supported element types: `rectangle`, `ellipse`, `diamond`, `text`, `arrow`, `line`.
Skipped: `freedraw`, `frame`, `image`, `embeddable`, dangling arrows (one endpoint only).

---

## Running Locally

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # production static files → dist/
npm run preview  # preview the production build
```

---

## Known Limitations / Future Work

### Mermaid
- Only `flowchart` / `graph` diagram types supported (sequence, ER, Gantt, class diagrams not yet parsed)
- Subgraphs are parsed for nodes/edges but not rendered as visual cluster boxes

### Excalidraw
- Only the modern inline `label.text` format is supported; older bound child text elements are not yet resolved
- `freedraw`, `frame`, `image`, and `embeddable` element types are silently skipped
- Group membership is not represented in the 3D layout

### General
- No drag-to-reposition nodes (pinNode infrastructure exists in forceLayout.js)
- No edge-label rendering in 3D (parsed and stored, display deferred)
- No export (PNG / STL / JSON) yet
- Three.js `LineBasicMaterial.linewidth > 1` is ignored on most WebGL implementations (WebGL limitation); thick edges use colour differentiation instead
- Shared URLs do not capture camera orientation (force layout is non-deterministic; the graph re-simulates and settles on each visit)