/**
 * main.js
 *
 * Entry point.  Wires together:
 *   - UI (sidebar controls, textarea, buttons)
 *   - parseAny / validateAny  (src/inputRouter.js)
 *   - ForceLayout             (src/forceLayout.js)
 *   - SceneRenderer           (src/scene.js)
 */

import { parseAny, validateAny } from "./inputRouter.js";
import { ForceLayout } from "./forceLayout.js";
import { SceneRenderer } from "./scene.js";
import { nextExample } from "./examples.js";
import {
  encodeStateToUrl,
  decodeStateFromUrl,
  copyToClipboard,
} from "./shareUrl.js";

// ── DOM refs ───────────────────────────────────────────────────────────────

const textarea = document.getElementById("diagram-input");
const btnRender = document.getElementById("btn-render");
const btnExample = document.getElementById("btn-example");
const btnShare = document.getElementById("btn-share");
const shareFeedback = document.getElementById("share-feedback");
const parseError = document.getElementById("parse-error");
const emptyState = document.getElementById("empty-state");
const canvas = document.getElementById("three-canvas");
const labelLayer = document.getElementById("label-layer");
const tooltipEl = document.getElementById("tooltip");
const hudNodes = document.getElementById("hud-nodes");
const hudEdges = document.getElementById("hud-edges");
const hudFormat = document.getElementById("hud-format");

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
let shareFeedbackTimer = null;

// ── Helpers ────────────────────────────────────────────────────────────────

// ── Share helpers ──────────────────────────────────────────────────────────

/**
 * Encode the current UI state into the URL hash so the address bar always
 * reflects what's on screen.  Called after every control change.
 */
function updateShareUrl() {
  encodeStateToUrl(collectState());
}

/**
 * Collect the current UI state into a plain object for serialisation.
 */
function collectState() {
  return {
    src: textarea.value,
    strength: Number(ctrlStrength.value),
    linkDist: Number(ctrlLinkDist.value),
    nodeSize: Number(ctrlNodeSize.value),
    bloom: Number(ctrlBloom.value),
    labels: ctrlLabels.classList.contains("active"),
    arrows: ctrlArrows.classList.contains("active"),
  };
}

/**
 * Apply a previously-serialised state object back to all UI controls and
 * propagate the values to the layout / scene without re-rendering.
 * Call renderDiagram() separately when you also want to render.
 *
 * @param {{ src, strength, linkDist, nodeSize, bloom, labels, arrows }} state
 */
function applyState(state) {
  textarea.value = state.src;

  ctrlStrength.value = state.strength;
  valStrength.textContent = state.strength;
  layout.updateConfig({ repulsion: state.strength });

  ctrlLinkDist.value = state.linkDist;
  valLinkDist.textContent = state.linkDist;
  layout.updateConfig({ linkDistance: state.linkDist });

  ctrlNodeSize.value = state.nodeSize;
  valNodeSize.textContent = state.nodeSize;
  scene.setNodeSize(state.nodeSize);

  ctrlBloom.value = state.bloom;
  valBloom.textContent = state.bloom;
  scene.setGlowIntensity(state.bloom);

  // Labels toggle
  const labelsOn = state.labels;
  ctrlLabels.classList.toggle("active", labelsOn);
  ctrlLabels.setAttribute("aria-checked", String(labelsOn));
  scene.setShowLabels(labelsOn);

  // Arrows toggle
  const arrowsOn = state.arrows;
  ctrlArrows.classList.toggle("active", arrowsOn);
  ctrlArrows.setAttribute("aria-checked", String(arrowsOn));
  scene.setShowArrows(arrowsOn);
}

function showError(msg) {
  parseError.textContent = msg;
  parseError.hidden = false;
}

function clearError() {
  parseError.textContent = "";
  parseError.hidden = true;
}

function updateHUD(nodeCount, edgeCount, format) {
  hudNodes.textContent = `${nodeCount} node${nodeCount !== 1 ? "s" : ""}`;
  hudEdges.textContent = `${edgeCount} edge${edgeCount !== 1 ? "s" : ""}`;
  if (hudFormat) {
    hudFormat.textContent = format === "excalidraw" ? "Excalidraw" : "Mermaid";
    hudFormat.dataset.format = format;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderDiagram() {
  const src = textarea.value.trim();

  // Validate
  const validation = validateAny(src);
  if (!validation.ok) {
    showError(validation.message);
    return;
  }
  clearError();

  // Parse
  let graph;
  try {
    graph = parseAny(src);
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
  updateHUD(graph.nodes.length, graph.edges.length, graph.format);

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
  updateShareUrl();
});

ctrlLinkDist.addEventListener("input", () => {
  const v = Number(ctrlLinkDist.value);
  valLinkDist.textContent = v;
  layout.updateConfig({ linkDistance: v });
  updateShareUrl();
});

ctrlNodeSize.addEventListener("input", () => {
  const v = Number(ctrlNodeSize.value);
  valNodeSize.textContent = v;
  scene.setNodeSize(v);
  updateShareUrl();
});

ctrlBloom.addEventListener("input", () => {
  const v = Number(ctrlBloom.value);
  valBloom.textContent = v;
  scene.setGlowIntensity(v);
  updateShareUrl();
});

// Toggle switches

function setupToggle(btn, onChange) {
  btn.addEventListener("click", () => {
    const isActive = btn.classList.toggle("active");
    btn.setAttribute("aria-checked", String(isActive));
    onChange(isActive);
    updateShareUrl();
  });
}

setupToggle(ctrlLabels, (on) => scene.setShowLabels(on));
setupToggle(ctrlArrows, (on) => scene.setShowArrows(on));

// ── Buttons ────────────────────────────────────────────────────────────────

btnRender.addEventListener("click", renderDiagram);

btnShare.addEventListener("click", async () => {
  const url = encodeStateToUrl(collectState());
  const ok = await copyToClipboard(url);

  // Visual feedback on the button itself
  btnShare.classList.add("copied");
  clearTimeout(shareFeedbackTimer);

  shareFeedback.textContent = ok ? "Copied!" : "Link ready";
  shareFeedback.hidden = false;

  shareFeedbackTimer = setTimeout(() => {
    btnShare.classList.remove("copied");
    shareFeedback.hidden = true;
    shareFeedback.textContent = "";
  }, 2500);
});

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

// Keep the URL hash in sync as the user types
textarea.addEventListener("input", updateShareUrl);

// ── Startup: restore from URL hash or load first example ──────────────────

{
  const restored = decodeStateFromUrl();
  if (restored && restored.src.trim()) {
    // A shared link was opened – restore settings and auto-render
    applyState(restored);
    renderDiagram();
  } else {
    // Normal cold start – pre-fill the textarea with the first example
    // (do not auto-render; let the user hit Render 3D themselves, except
    //  we match the previous behaviour and pre-fill only)
    const ex = nextExample();
    textarea.value = ex.src;
  }
}
