# Mermaid 3D – Agent Progress Log


## Project Goal

A static web application that accepts a Mermaid flowchart/graph diagram as input and renders it as an interactive 3D force-directed graph, inspired by:

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
- Wires UI → parser → layout → scene in ~180 LOC
- Ctrl/Cmd+Enter renders from the textarea
- All four range sliders live-update layout or scene without re-parsing
- Toggle switches for labels and arrows

### 8. UI / CSS (`src/style.css`, `index.html`) ✅
- Full dark theme with CSS custom properties
- Sidebar (320 px): textarea, Render button, Load example, four sliders, two toggles
- Main canvas area with empty-state overlay, CSS2D label layer, tooltip, HUD pill
- Responsive: `ResizeObserver` handles window resizes

### 9. Build configuration (`vite.config.js`) ✅
- Manual chunk split: `three` vendor chunk (~511 kB gzip 129 kB) separate from app code (~44 kB gzip 13 kB)
- `chunkSizeWarningLimit` raised to 600 kB (three.js is inherently large)
- `npm run build` produces a fully self-contained `dist/` folder with no external CDN calls

---

## File Structure

```
mermaid3d/
├── public/
│   └── favicon.svg          # Custom SVG favicon matching app logo
├── src/
│   ├── examples.js          # Five built-in example diagrams (round-robin)
│   ├── forceLayout.js       # 3D Verlet force layout with Barnes-Hut octree
│   ├── main.js              # Entry point: UI wiring
│   ├── parser.js            # Mermaid flowchart/graph parser
│   ├── scene.js             # Three.js scene, renderer, controls, raycasting
│   └── style.css            # Dark-theme CSS (custom properties, no framework)
├── index.html               # App shell (sidebar + canvas container)
├── vite.config.js           # Chunk splitting, size limit
└── package.json             # Dependencies: three (runtime), vite (dev)
```

---

## Supported Mermaid Syntax

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

- Only `flowchart` / `graph` diagram types supported (sequence, ER, Gantt, class diagrams not yet parsed)
- Subgraphs are parsed for nodes/edges but not rendered as visual cluster boxes
- No drag-to-reposition nodes (pinNode infrastructure exists in forceLayout.js)
- No edge-label rendering in 3D (parsed and stored, display deferred)
- No export (PNG / STL / JSON) yet
- Three.js `LineBasicMaterial.linewidth > 1` is ignored on most WebGL implementations (WebGL limitation); thick edges use colour differentiation instead