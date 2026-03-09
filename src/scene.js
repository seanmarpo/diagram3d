/**
 * scene.js
 *
 * Manages the Three.js 3-D scene: camera, renderer, lights, per-node meshes,
 * edge lines, arrowheads, CSS2D labels, orbit controls, and raycasting tooltip.
 *
 * Public API:
 *   const scene = new SceneRenderer(canvasEl, labelLayerEl, tooltipEl);
 *   scene.setGraph({ nodes, edges });          // build / rebuild meshes
 *   scene.updateNodePositions(nodes, edges);   // called every layout tick
 *   scene.setShowLabels(bool);
 *   scene.setShowArrows(bool);
 *   scene.setNodeSize(number);
 *   scene.setGlowIntensity(number 0-100);
 *   scene.dispose();
 *
 * Fixes / additions vs v1:
 *   - Label toggle: CSS2DObject.visible is set instead of div.style.display
 *     (CSS2DRenderer ignores display:none; the visible flag is the correct API)
 *   - Brighter edges: colours lifted to vivid cyan/indigo, opacity raised to 1.0
 *   - Pulse dots: one additive-blended sprite per edge travels from source to
 *     target on a looping timer; speed and colour derive from edge type
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

// ── Colour palette ────────────────────────────────────────────────────────

const PALETTE = {
  rect: 0x38bdf8, // sky blue
  rounded: 0x34d399, // emerald
  circle: 0xa78bfa, // violet
  diamond: 0xfbbf24, // amber
  cylinder: 0xf472b6, // pink
  subroutine: 0x60a5fa, // blue
  asymmetric: 0xfb923c, // orange
};

const DEFAULT_NODE_COLOR = 0x38bdf8;

// Edge colours — vivid so they read against the near-black background
const EDGE_COLOR = 0x38bdf8; // bright cyan  (solid)
const EDGE_COLOR_DASHED = 0x818cf8; // indigo       (dashed)
const EDGE_COLOR_THICK = 0xf472b6; // pink         (thick/==)

// Pulse dot colours (slightly warmer than the edge)
const PULSE_COLOR = 0xffffff; // white core — blends with edge tint

const BG_COLOR = 0x070d1a;

// ── Helper: edge line material ────────────────────────────────────────────

function edgeMaterial(edge) {
  if (edge.dashed) {
    return new THREE.LineDashedMaterial({
      color: EDGE_COLOR_DASHED,
      dashSize: 6,
      gapSize: 4,
      linewidth: 1,
      transparent: true,
      opacity: 0.85,
    });
  }
  if (edge.thick) {
    return new THREE.LineBasicMaterial({
      color: EDGE_COLOR_THICK,
      linewidth: 1,
      transparent: true,
      opacity: 1.0,
    });
  }
  return new THREE.LineBasicMaterial({
    color: EDGE_COLOR,
    linewidth: 1,
    transparent: true,
    opacity: 0.9,
  });
}

// ── Helper: arrowhead cone ────────────────────────────────────────────────

function makeArrowhead(color) {
  const geo = new THREE.ConeGeometry(2.0, 6, 6);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1.0,
  });
  return new THREE.Mesh(geo, mat);
}

// ── Helper: node geometry by shape ───────────────────────────────────────

function nodeGeometry(shape, size) {
  switch (shape) {
    case "circle":
      return new THREE.SphereGeometry(size, 16, 12);
    case "diamond":
      return new THREE.OctahedronGeometry(size * 1.1);
    case "cylinder":
      return new THREE.CylinderGeometry(size * 0.9, size * 0.9, size * 0.6, 16);
    case "rounded":
      return new THREE.SphereGeometry(size * 0.85, 14, 10);
    case "subroutine":
      return new THREE.BoxGeometry(size * 2.2, size * 1.4, size * 0.6);
    case "asymmetric":
      return new THREE.TetrahedronGeometry(size * 1.1);
    case "rect":
    default:
      return new THREE.BoxGeometry(size * 2, size * 1.3, size * 0.55);
  }
}

// ── Helper: glow sprite ───────────────────────────────────────────────────

function makeGlowSprite(color, size, intensity) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const a = (intensity / 100).toFixed(2);
  grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
  grad.addColorStop(
    0.4,
    `rgba(${r},${g},${b},${((intensity / 100) * 0.3).toFixed(2)})`,
  );
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const s = size * 5;
  sprite.scale.set(s, s, 1);
  return sprite;
}

// ── Helper: pulse dot sprite ─────────────────────────────────────────────
//
// A small bright circle with a soft halo, rendered additively so it glows
// against the dark background.

function makePulseSprite(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.8)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.25)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const tex = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

// One shared material per pulse colour (reused across all dots of that colour)
const _pulseMats = new Map();
function getPulseMat(color) {
  if (!_pulseMats.has(color)) _pulseMats.set(color, makePulseSprite(color));
  return _pulseMats.get(color);
}

// ── SceneRenderer ─────────────────────────────────────────────────────────

export class SceneRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement}       labelLayer   Container for CSS2DRenderer
   * @param {HTMLElement}       tooltipEl    Floating tooltip div
   */
  constructor(canvas, labelLayer, tooltipEl) {
    this._canvas = canvas;
    this._labelLayer = labelLayer;
    this._tooltipEl = tooltipEl;

    // Options
    this._nodeSize = 7;
    this._showLabels = true;
    this._showArrows = true;
    this._glowIntensity = 40;

    // Scene objects
    this._nodeMeshes = new Map(); // id → { mesh, glow, labelObj, node, color }
    this._edgeLines = []; // [{ line, arrow, pulseDot, pulseT, pulseSpeed, edgeDef }]
    this._hoveredId = null;

    // Clock for pulse animation
    this._clock = new THREE.Clock();

    // Reusable vectors
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._quat = new THREE.Quaternion();

    this._init();
  }

  // ── Initialisation ─────────────────────────────────────────────────────

  _init() {
    const w = this._canvas.parentElement.clientWidth;
    const h = this._canvas.parentElement.clientHeight;

    // Scene & fog
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(BG_COLOR);
    this._scene.fog = new THREE.FogExp2(BG_COLOR, 0.0022);

    // Camera
    this._camera = new THREE.PerspectiveCamera(55, w / h, 0.5, 4000);
    this._camera.position.set(0, 0, 380);

    // WebGL renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: false,
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(w, h);

    // CSS2D renderer (labels)
    this._css2d = new CSS2DRenderer({ element: this._labelLayer });
    this._css2d.setSize(w, h);

    // Orbit controls
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.07;
    this._controls.rotateSpeed = 0.6;
    this._controls.zoomSpeed = 1.0;
    this._controls.minDistance = 20;
    this._controls.maxDistance = 3000;

    // Lights
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0x9edbff, 1.0);
    dir.position.set(1, 2, 3);
    this._scene.add(dir);
    const pt = new THREE.PointLight(0x818cf8, 60, 800);
    pt.position.set(-100, 100, 100);
    this._scene.add(pt);

    // Raycasting
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2(-9999, -9999);
    this._raycasterTargets = [];

    this._canvas.addEventListener("mousemove", this._onMouseMove.bind(this), {
      passive: true,
    });
    this._canvas.addEventListener("mouseleave", this._onMouseLeave.bind(this));

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this._canvas.parentElement);

    // Render loop
    this._rafHandle = requestAnimationFrame(this._renderLoop.bind(this));
  }

  // ── Graph building ─────────────────────────────────────────────────────

  setGraph({ nodes, edges }) {
    this._clearGraph();

    for (const node of nodes) this._addNode(node);
    for (const edge of edges) this._addEdge(edge);

    this._raycasterTargets = [];
    for (const [, obj] of this._nodeMeshes)
      this._raycasterTargets.push(obj.mesh);
  }

  updateNodePositions(nodes, edges) {
    for (const node of nodes) {
      const obj = this._nodeMeshes.get(node.id);
      if (!obj) continue;
      obj.mesh.position.set(node.x, node.y, node.z);
      if (obj.glow) obj.glow.position.set(node.x, node.y, node.z);
      if (obj.labelObj) obj.labelObj.position.set(node.x, node.y, node.z);
    }
    this._updateEdgeGeometry(nodes, edges);
  }

  // ── Node helpers ───────────────────────────────────────────────────────

  _addNode(node) {
    const color = PALETTE[node.shape] ?? DEFAULT_NODE_COLOR;
    const geo = nodeGeometry(node.shape, this._nodeSize);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.25,
      roughness: 0.45,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.nodeId = node.id;
    this._scene.add(mesh);

    const glow = makeGlowSprite(color, this._nodeSize, this._glowIntensity);
    this._scene.add(glow);

    // CSS2D label
    const div = document.createElement("div");
    div.className = "node-label";
    div.textContent = node.label;
    const labelObj = new CSS2DObject(div);
    // FIX: use the Three.js Object3D visible flag — CSS2DRenderer respects this;
    // setting div.style.display is ignored by the renderer's projection loop.
    labelObj.visible = this._showLabels;
    this._scene.add(labelObj);

    this._nodeMeshes.set(node.id, { mesh, glow, labelObj, node, color });
  }

  _removeNode(id) {
    const obj = this._nodeMeshes.get(id);
    if (!obj) return;
    this._scene.remove(obj.mesh);
    this._scene.remove(obj.glow);
    this._scene.remove(obj.labelObj);
    obj.mesh.geometry.dispose();
    obj.mesh.material.dispose();
    obj.glow.material.map?.dispose();
    obj.glow.material.dispose();
    this._nodeMeshes.delete(id);
  }

  // ── Edge helpers ───────────────────────────────────────────────────────

  _addEdge(edge) {
    // Line geometry (2-point; positions mutated each tick)
    const positions = new Float32Array(6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = edgeMaterial(edge);
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    if (edge.dashed) line.computeLineDistances();
    this._scene.add(line);

    // Arrowhead
    let arrow = null;
    if (edge.arrow && this._showArrows) {
      const color = edge.thick
        ? EDGE_COLOR_THICK
        : edge.dashed
          ? EDGE_COLOR_DASHED
          : EDGE_COLOR;
      arrow = makeArrowhead(color);
      this._scene.add(arrow);
    }

    // Pulse dot — one per edge, loops from source to target
    const pulseColor = edge.thick
      ? EDGE_COLOR_THICK
      : edge.dashed
        ? EDGE_COLOR_DASHED
        : EDGE_COLOR;

    const pulseDot = new THREE.Sprite(getPulseMat(pulseColor));
    const dotSize = this._nodeSize * 1.4;
    pulseDot.scale.set(dotSize, dotSize, 1);
    pulseDot.frustumCulled = false;
    this._scene.add(pulseDot);

    // Each edge gets a random starting phase so dots aren't all synchronised
    const pulseT = Math.random();
    // Dashed = slower (more deliberate), thick = faster (high-traffic feel)
    const pulseSpeed = edge.thick ? 0.55 : edge.dashed ? 0.28 : 0.42;

    this._edgeLines.push({
      line,
      arrow,
      pulseDot,
      pulseT,
      pulseSpeed,
      edgeDef: edge,
    });
  }

  _clearEdges() {
    for (const { line, arrow, pulseDot } of this._edgeLines) {
      this._scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
      if (arrow) {
        this._scene.remove(arrow);
        arrow.geometry.dispose();
        arrow.material.dispose();
      }
      if (pulseDot) {
        this._scene.remove(pulseDot);
        // material is shared — don't dispose it here
      }
    }
    this._edgeLines = [];
  }

  _clearGraph() {
    for (const [id] of this._nodeMeshes) this._removeNode(id);
    this._nodeMeshes.clear();
    this._clearEdges();
  }

  // ── Edge geometry + pulse update ──────────────────────────────────────

  _updateEdgeGeometry(nodes, edges) {
    const pos = new Map();
    for (const n of nodes) pos.set(n.id, n);

    for (const edgeObj of this._edgeLines) {
      const { line, arrow, edgeDef } = edgeObj;

      const src = pos.get(edgeDef.from);
      const tgt = pos.get(edgeDef.to);
      if (!src || !tgt) continue;

      // ── Update line positions ─────────────────────────────────
      const attr = line.geometry.getAttribute("position");
      attr.setXYZ(0, src.x, src.y, src.z);
      attr.setXYZ(1, tgt.x, tgt.y, tgt.z);
      attr.needsUpdate = true;
      if (edgeDef.dashed) line.computeLineDistances();

      // ── Orient arrowhead ──────────────────────────────────────
      if (arrow) {
        this._v0.set(src.x, src.y, src.z);
        this._v1.set(tgt.x, tgt.y, tgt.z);
        this._dir.subVectors(this._v1, this._v0).normalize();

        const offset = this._nodeSize * 1.6;
        arrow.position.set(
          tgt.x - this._dir.x * offset,
          tgt.y - this._dir.y * offset,
          tgt.z - this._dir.z * offset,
        );
        this._quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._dir);
        arrow.quaternion.copy(this._quat);
      }

      // Cache the latest world positions so _tickPulse can read them every
      // frame even after the layout simulation has cooled and stopped calling
      // updateNodePositions.
      edgeObj.srcPos = { x: src.x, y: src.y, z: src.z };
      edgeObj.tgtPos = { x: tgt.x, y: tgt.y, z: tgt.z };
    }
  }

  // ── Pulse animation (runs every render frame, independent of layout) ──

  _tickPulse() {
    const dt = this._clock.getDelta();

    for (const edgeObj of this._edgeLines) {
      const { pulseDot, srcPos, tgtPos } = edgeObj;
      if (!pulseDot || !srcPos || !tgtPos) continue;

      // Advance t, wrapping [0, 1) so the loop is continuous forever
      edgeObj.pulseT = (edgeObj.pulseT + edgeObj.pulseSpeed * dt) % 1;
      const t = edgeObj.pulseT;

      // Interpolate along the edge, pulling slightly away from both ends so
      // the dot doesn't clip into the node mesh
      const margin = 0.08;
      const tt = margin + t * (1 - 2 * margin);

      pulseDot.position.set(
        srcPos.x + (tgtPos.x - srcPos.x) * tt,
        srcPos.y + (tgtPos.y - srcPos.y) * tt,
        srcPos.z + (tgtPos.z - srcPos.z) * tt,
      );

      // Fade in at the source end, fade out at the target end
      const fadeIn = Math.min(t * 6, 1);
      const fadeOut = Math.min((1 - t) * 6, 1);
      pulseDot.material.opacity = fadeIn * fadeOut;
    }
  }

  // ── Settings ───────────────────────────────────────────────────────────

  setShowLabels(show) {
    this._showLabels = show;
    for (const [, obj] of this._nodeMeshes) {
      // FIX: set Object3D.visible — this is what CSS2DRenderer checks.
      // div.style.display has no effect on whether the renderer projects the object.
      if (obj.labelObj) obj.labelObj.visible = show;
    }
  }

  setShowArrows(show) {
    this._showArrows = show;
    for (const { arrow } of this._edgeLines) {
      if (arrow) arrow.visible = show;
    }
  }

  setNodeSize(size) {
    this._nodeSize = size;
    for (const [, obj] of this._nodeMeshes) {
      obj.mesh.geometry.dispose();
      obj.mesh.geometry = nodeGeometry(obj.node.shape, size);
      if (obj.glow) {
        const s = size * 5;
        obj.glow.scale.set(s, s, 1);
      }
    }
    // Rescale pulse dots
    for (const { pulseDot } of this._edgeLines) {
      if (pulseDot) {
        const s = size * 1.4;
        pulseDot.scale.set(s, s, 1);
      }
    }
  }

  setGlowIntensity(intensity) {
    this._glowIntensity = intensity;
    for (const [, obj] of this._nodeMeshes) {
      if (!obj.glow) continue;
      this._scene.remove(obj.glow);
      obj.glow.material.map?.dispose();
      obj.glow.material.dispose();
      const newGlow = makeGlowSprite(obj.color, this._nodeSize, intensity);
      newGlow.position.copy(obj.mesh.position);
      this._scene.add(newGlow);
      obj.glow = newGlow;
    }
  }

  // ── Raycasting / tooltip ───────────────────────────────────────────────

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._lastClientX = e.clientX;
    this._lastClientY = e.clientY;
  }

  _onMouseLeave() {
    this._mouse.set(-9999, -9999);
    this._hideTooltip();
  }

  _doRaycast() {
    if (this._raycasterTargets.length === 0) return;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const hits = this._raycaster.intersectObjects(
      this._raycasterTargets,
      false,
    );

    if (hits.length > 0) {
      const id = hits[0].object.userData.nodeId;
      if (id !== this._hoveredId) {
        if (this._hoveredId !== null)
          this._highlightNode(this._hoveredId, false);
        this._hoveredId = id;
        const obj = this._nodeMeshes.get(id);
        if (obj) {
          this._showTooltip(obj.node);
          this._highlightNode(id, true);
        }
      }
    } else {
      if (this._hoveredId !== null) {
        this._highlightNode(this._hoveredId, false);
        this._hoveredId = null;
      }
      this._hideTooltip();
    }
  }

  _highlightNode(id, on) {
    const obj = this._nodeMeshes.get(id);
    if (!obj) return;
    obj.mesh.material.emissiveIntensity = on ? 0.8 : 0.25;
    if (obj.glow) obj.glow.material.opacity = on ? 1.0 : 0.6;
  }

  _showTooltip(node) {
    const el = this._tooltipEl;
    el.innerHTML =
      `<div class="tt-id">${node.label}</div>` +
      `<div class="tt-shape">${node.shape} · id: ${node.id}</div>`;
    el.classList.add("visible");
    const rect = this._canvas.getBoundingClientRect();
    el.style.left = `${(this._lastClientX ?? 0) + 14 - rect.left}px`;
    el.style.top = `${(this._lastClientY ?? 0) + 14 - rect.top}px`;
  }

  _hideTooltip() {
    this._tooltipEl.classList.remove("visible");
  }

  // ── Resize ─────────────────────────────────────────────────────────────

  _onResize() {
    const parent = this._canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._css2d.setSize(w, h);
  }

  // ── Render loop ────────────────────────────────────────────────────────

  _renderLoop() {
    this._rafHandle = requestAnimationFrame(this._renderLoop.bind(this));
    this._controls.update();
    this._doRaycast();
    this._tickPulse();
    this._renderer.render(this._scene, this._camera);
    this._css2d.render(this._scene, this._camera);
  }

  // ── Disposal ───────────────────────────────────────────────────────────

  dispose() {
    cancelAnimationFrame(this._rafHandle);
    this._resizeObserver.disconnect();
    this._canvas.removeEventListener("mousemove", this._onMouseMove);
    this._canvas.removeEventListener("mouseleave", this._onMouseLeave);
    this._clearGraph();
    this._controls.dispose();
    this._renderer.dispose();
  }
}
