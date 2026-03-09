/**
 * main.js
 *
 * Entry point.  Wires together:
 *   - UI (sidebar controls, textarea, buttons)
 *   - parseMermaid  (src/parser.js)
 *   - ForceLayout   (src/forceLayout.js)
 *   - SceneRenderer (src/scene.js)
 */

import { parseMermaid, validateMermaid } from "./parser.js";
import { ForceLayout } from "./forceLayout.js";
import { SceneRenderer } from "./scene.js";
import { nextExample } from "./examples.js";

// ── DOM refs ───────────────────────────────────────────────────────────────

const textarea = document.getElementById("diagram-input");
const btnRender = document.getElementById("btn-render");
const btnExample = document.getElementById("btn-example");
const parseError = document.getElementById("parse-error");
const emptyState = document.getElementById("empty-state");
const canvas = document.getElementById("three-canvas");
const labelLayer = document.getElementById("label-layer");
const tooltipEl = document.getElementById("tooltip");
const hudNodes = document.getElementById("hud-nodes");
const hudEdges = document.getElementById("hud-edges");

// Controls
const ctrlStrength = document.getElementById("ctrl-strength");
const ctrlLinkDist = document.getElementById("ctrl-link-dist");
const ctrlNodeSize = document.getElementById("ctrl-node-size");
const ctrlBloom = document.getElementById("ctrl-bloom");
const ctrlLabels = document.getElementById("ctrl-labels");
const ctrlArrows = document.getElementById("ctrl-arrows");

const valStrength = document.getElementById("val-strength");
const valLinkDist = document.getElementById("val-link-dist");
const valNodeSize = document.getElementById("val-node-size");
const valBloom = document.getElementById("val-bloom");

// ── Singleton instances ────────────────────────────────────────────────────

const scene = new SceneRenderer(canvas, labelLayer, tooltipEl);
const layout = new ForceLayout();

// ── State ──────────────────────────────────────────────────────────────────

let rendered = false;

// ── Helpers ────────────────────────────────────────────────────────────────

function showError(msg) {
  parseError.textContent = msg;
  parseError.hidden = false;
}

function clearError() {
  parseError.textContent = "";
  parseError.hidden = true;
}

function updateHUD(nodeCount, edgeCount) {
  hudNodes.textContent = `${nodeCount} node${nodeCount !== 1 ? "s" : ""}`;
  hudEdges.textContent = `${edgeCount} edge${edgeCount !== 1 ? "s" : ""}`;
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderDiagram() {
  const src = textarea.value.trim();

  // Validate
  const validation = validateMermaid(src);
  if (!validation.ok) {
    showError(validation.message);
    return;
  }
  clearError();

  // Parse
  let graph;
  try {
    graph = parseMermaid(src);
  } catch (err) {
    showError(`Parse error: ${err.message}`);
    return;
  }

  if (graph.nodes.length === 0) {
    showError("No nodes found.  Check your diagram syntax.");
    return;
  }

  // Hand graph to Three.js scene (builds meshes)
  scene.setGraph(graph);

  // Hand graph to force layout (starts simulation)
  layout.setGraph(graph.nodes, graph.edges);

  layout.onTick(({ nodes, edges }) => {
    scene.updateNodePositions(nodes, edges);
  });

  layout.start();

  // Update HUD
  updateHUD(graph.nodes.length, graph.edges.length);

  // Hide empty state
  emptyState.classList.add("hidden");
  rendered = true;
}

// ── Controls ───────────────────────────────────────────────────────────────

// Range sliders — live update values and propagate to layout / scene

ctrlStrength.addEventListener("input", () => {
  const v = Number(ctrlStrength.value);
  valStrength.textContent = v;
  layout.updateConfig({ repulsion: v });
});

ctrlLinkDist.addEventListener("input", () => {
  const v = Number(ctrlLinkDist.value);
  valLinkDist.textContent = v;
  layout.updateConfig({ linkDistance: v });
});

ctrlNodeSize.addEventListener("input", () => {
  const v = Number(ctrlNodeSize.value);
  valNodeSize.textContent = v;
  scene.setNodeSize(v);
});

ctrlBloom.addEventListener("input", () => {
  const v = Number(ctrlBloom.value);
  valBloom.textContent = v;
  scene.setGlowIntensity(v);
});

// Toggle switches

function setupToggle(btn, onChange) {
  btn.addEventListener("click", () => {
    const isActive = btn.classList.toggle("active");
    btn.setAttribute("aria-checked", String(isActive));
    onChange(isActive);
  });
}

setupToggle(ctrlLabels, (on) => scene.setShowLabels(on));
setupToggle(ctrlArrows, (on) => scene.setShowArrows(on));

// ── Buttons ────────────────────────────────────────────────────────────────

btnRender.addEventListener("click", renderDiagram);

btnExample.addEventListener("click", () => {
  const ex = nextExample();
  textarea.value = ex.src;
  clearError();
  renderDiagram();
});

// Allow Ctrl/Cmd + Enter to render from the textarea
textarea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    renderDiagram();
  }
});

// ── Auto-load first example on startup ────────────────────────────────────

{
  const ex = nextExample();
  textarea.value = ex.src;
}
