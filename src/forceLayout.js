/**
 * forceLayout.js
 *
 * A self-contained 3-D force-directed graph layout engine using Verlet
 * integration (no external physics library needed).
 *
 * Forces applied each tick:
 *   1. Repulsion   – Barnes-Hut-inspired O(n log n) approximation via a
 *                   simple octree (falls back to O(n²) for small graphs).
 *   2. Attraction  – Spring force along each edge (Hooke's law).
 *   3. Centering   – Gentle pull toward the origin so the graph doesn't drift.
 *   4. Damping     – Velocity decay each tick.
 *
 * Usage:
 *   const layout = new ForceLayout({ nodes, edges });
 *   layout.onTick(({ nodes }) => updateScene(nodes));
 *   layout.start();
 *   // later…
 *   layout.stop();
 *   layout.updateConfig({ repulsion: 200 });
 */

// ── Tiny 3-D vector helpers ───────────────────────────────────────────────

function len(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z);
}

function len2(x, y, z) {
  return x * x + y * y + z * z;
}

// ── Octree for Barnes-Hut repulsion approximation ─────────────────────────

/**
 * A minimal octree node.  Each cell stores either a single body (leaf) or
 * a centre-of-mass summary of all bodies within its bounds (internal).
 */
class OctreeNode {
  constructor(cx, cy, cz, halfSize) {
    this.cx       = cx;
    this.cy       = cy;
    this.cz       = cz;
    this.halfSize = halfSize;

    // Centre-of-mass aggregation
    this.mass  = 0;
    this.cmx   = 0;
    this.cmy   = 0;
    this.cmz   = 0;

    this.body     = null;   // set when this is a leaf with exactly one body
    this.children = null;   // 8-element array when subdivided
  }

  /** Insert a body { x, y, z, mass? } into this node. */
  insert(body) {
    const bm = body.mass || 1;

    if (this.body === null && this.children === null) {
      // Empty leaf → place body here
      this.body  = body;
      this.mass  = bm;
      this.cmx   = body.x;
      this.cmy   = body.y;
      this.cmz   = body.z;
      return;
    }

    if (this.children === null) {
      // Occupied leaf → subdivide
      this._subdivide();
      this._insertIntoChild(this.body);
      this.body = null;
    }

    // Update centre of mass
    const totalMass = this.mass + bm;
    this.cmx = (this.cmx * this.mass + body.x * bm) / totalMass;
    this.cmy = (this.cmy * this.mass + body.y * bm) / totalMass;
    this.cmz = (this.cmz * this.mass + body.z * bm) / totalMass;
    this.mass = totalMass;

    this._insertIntoChild(body);
  }

  _subdivide() {
    const h = this.halfSize * 0.5;
    this.children = [];
    for (let i = 0; i < 8; i++) {
      const dx = (i & 1) ? h : -h;
      const dy = (i & 2) ? h : -h;
      const dz = (i & 4) ? h : -h;
      this.children.push(new OctreeNode(this.cx + dx, this.cy + dy, this.cz + dz, h));
    }
  }

  _childIndex(x, y, z) {
    return (
      ((x >= this.cx) ? 1 : 0) |
      ((y >= this.cy) ? 2 : 0) |
      ((z >= this.cz) ? 4 : 0)
    );
  }

  _insertIntoChild(body) {
    this.children[this._childIndex(body.x, body.y, body.z)].insert(body);
  }

  /**
   * Accumulate repulsive force from this subtree onto body { x, y, z }.
   * theta — Barnes-Hut opening angle threshold (0.5–1.0 typical).
   */
  calcForce(body, repulsion, theta, out) {
    if (this.mass === 0) return;

    const dx = this.cmx - body.x;
    const dy = this.cmy - body.y;
    const dz = this.cmz - body.z;
    const d2 = len2(dx, dy, dz);
    if (d2 < 1e-6) return;  // coincident — skip

    const d    = Math.sqrt(d2);
    const size = this.halfSize * 2;

    if (this.children === null || (size / d < theta)) {
      // Treat this node as a single body
      const f = (repulsion * this.mass) / (d2 + 1);   // +1 prevents infinity
      out.x -= f * (dx / d);
      out.y -= f * (dy / d);
      out.z -= f * (dz / d);
    } else {
      // Recurse into children
      for (const child of this.children) {
        child.calcForce(body, repulsion, theta, out);
      }
    }
  }
}

// ── ForceLayout ───────────────────────────────────────────────────────────

export class ForceLayout {
  /**
   * @param {object} opts
   * @param {Array<{id:string}>}                      opts.nodes
   * @param {Array<{from:string, to:string}>}          opts.edges
   * @param {number}  [opts.repulsion=120]   Repulsion constant
   * @param {number}  [opts.linkDistance=100] Natural spring length
   * @param {number}  [opts.linkStrength=0.4] Spring stiffness  [0..1]
   * @param {number}  [opts.centerStrength=0.02] Pull toward origin
   * @param {number}  [opts.damping=0.88]    Velocity decay per tick
   * @param {number}  [opts.alpha=1]         Initial "temperature"
   * @param {number}  [opts.alphaDecay=0.02] Temperature decay per tick
   * @param {number}  [opts.alphaMin=0.001]  Stop threshold
   * @param {number}  [opts.theta=0.8]       Barnes-Hut theta
   * @param {number}  [opts.ticksPerFrame=1]
   */
  constructor(opts = {}) {
    this._tickerHandle = null;
    this._tickCallbacks = [];
    this._endCallbacks  = [];

    this.nodes = [];
    this.edges = [];

    // Config with defaults
    this.config = {
      repulsion:      opts.repulsion      ?? 120,
      linkDistance:   opts.linkDistance   ?? 100,
      linkStrength:   opts.linkStrength   ?? 0.4,
      centerStrength: opts.centerStrength ?? 0.02,
      damping:        opts.damping        ?? 0.88,
      alpha:          opts.alpha          ?? 1,
      alphaDecay:     opts.alphaDecay     ?? 0.02,
      alphaMin:       opts.alphaMin       ?? 0.001,
      theta:          opts.theta          ?? 0.8,
      ticksPerFrame:  opts.ticksPerFrame  ?? 2,
    };

    // Working alpha (reset each time start() is called)
    this._alpha = this.config.alpha;

    if (opts.nodes && opts.edges) {
      this.setGraph(opts.nodes, opts.edges);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Replace the graph.  Positions are randomised in a sphere of radius ~200.
   */
  setGraph(nodes, edges) {
    this.stop();

    // Build internal node objects with Verlet state
    this.nodes = nodes.map(n => {
      const θ = Math.random() * Math.PI * 2;
      const φ = Math.acos(2 * Math.random() - 1);
      const r = 80 + Math.random() * 120;
      return {
        id:    n.id,
        label: n.label,
        shape: n.shape,
        x:  r * Math.sin(φ) * Math.cos(θ),
        y:  r * Math.sin(φ) * Math.sin(θ),
        z:  r * Math.cos(φ),
        vx: 0, vy: 0, vz: 0,  // velocity
        fx: 0, fy: 0, fz: 0,  // accumulated force
        fixed: false,
      };
    });

    // Index nodes by id
    this._nodeIndex = new Map(this.nodes.map(n => [n.id, n]));

    // Build edge list referencing node objects
    this.edges = edges
      .map(e => ({
        source: this._nodeIndex.get(e.from),
        target: this._nodeIndex.get(e.to),
        label:  e.label,
        dashed: e.dashed,
        thick:  e.thick,
        arrow:  e.arrow,
      }))
      .filter(e => e.source && e.target);

    this._alpha = this.config.alpha;
  }

  /** Register a tick callback.  Called every animation frame with { nodes, edges, alpha }. */
  onTick(fn) {
    this._tickCallbacks.push(fn);
    return this;
  }

  /** Register an end callback.  Called when the simulation cools. */
  onEnd(fn) {
    this._endCallbacks.push(fn);
    return this;
  }

  start() {
    this.stop();
    this._alpha = this.config.alpha;
    this._loop();
    return this;
  }

  stop() {
    if (this._tickerHandle !== null) {
      cancelAnimationFrame(this._tickerHandle);
      this._tickerHandle = null;
    }
    return this;
  }

  /** Reheat the simulation (e.g. after a config change). */
  reheat(alpha = 0.3) {
    this._alpha = alpha;
    if (this._tickerHandle === null) this._loop();
    return this;
  }

  /**
   * Update config values and optionally reheat.
   * @param {object} patch
   * @param {boolean} [reheat=true]
   */
  updateConfig(patch, reheat = true) {
    Object.assign(this.config, patch);
    if (reheat) this.reheat();
    return this;
  }

  /**
   * Pin a node to a fixed position so the layout doesn't move it.
   * Pass null to unpin.
   */
  pinNode(id, x, y, z) {
    const n = this._nodeIndex?.get(id);
    if (!n) return;
    if (x == null) {
      n.fixed = false;
    } else {
      n.fixed = true;
      n.x = x; n.y = y; n.z = z;
      n.vx = n.vy = n.vz = 0;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────

  _loop() {
    const tick = () => {
      if (this._alpha < this.config.alphaMin) {
        this._tickerHandle = null;
        this._endCallbacks.forEach(fn => fn({ nodes: this.nodes, edges: this.edges }));
        return;
      }

      for (let t = 0; t < this.config.ticksPerFrame; t++) {
        this._tick();
      }

      this._tickCallbacks.forEach(fn =>
        fn({ nodes: this.nodes, edges: this.edges, alpha: this._alpha })
      );

      this._tickerHandle = requestAnimationFrame(tick);
    };

    this._tickerHandle = requestAnimationFrame(tick);
  }

  _tick() {
    const {
      repulsion, linkDistance, linkStrength,
      centerStrength, damping, alphaDecay,
    } = this.config;
    const alpha = this._alpha;
    const nodes = this.nodes;
    const edges = this.edges;
    const n     = nodes.length;
    if (n === 0) return;

    // ── 1. Reset forces ───────────────────────────────────────────
    for (const node of nodes) {
      node.fx = 0; node.fy = 0; node.fz = 0;
    }

    // ── 2. Repulsion via Octree ───────────────────────────────────
    if (n > 1) {
      // Build octree bounding box
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const nd of nodes) {
        if (nd.x < minX) minX = nd.x; if (nd.x > maxX) maxX = nd.x;
        if (nd.y < minY) minY = nd.y; if (nd.y > maxY) maxY = nd.y;
        if (nd.z < minZ) minZ = nd.z; if (nd.z > maxZ) maxZ = nd.z;
      }
      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const halfSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 1;

      const root = new OctreeNode(cx, cy, cz, halfSize);
      for (const nd of nodes) root.insert(nd);

      const forceOut = { x: 0, y: 0, z: 0 };
      for (const nd of nodes) {
        if (nd.fixed) continue;
        forceOut.x = 0; forceOut.y = 0; forceOut.z = 0;
        root.calcForce(nd, repulsion, this.config.theta, forceOut);
        nd.fx += forceOut.x * alpha;
        nd.fy += forceOut.y * alpha;
        nd.fz += forceOut.z * alpha;
      }
    }

    // ── 3. Spring attraction (edges) ──────────────────────────────
    for (const edge of edges) {
      const s = edge.source;
      const t = edge.target;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dz = t.z - s.z;
      const d  = len(dx, dy, dz) || 1;
      const displacement = d - linkDistance;
      const f = linkStrength * displacement * alpha / d;
      const fx = f * dx;
      const fy = f * dy;
      const fz = f * dz;

      if (!s.fixed) { s.fx += fx; s.fy += fy; s.fz += fz; }
      if (!t.fixed) { t.fx -= fx; t.fy -= fy; t.fz -= fz; }
    }

    // ── 4. Centering ──────────────────────────────────────────────
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const nd of nodes) { sumX += nd.x; sumY += nd.y; sumZ += nd.z; }
    const cx2 = sumX / n;
    const cy2 = sumY / n;
    const cz2 = sumZ / n;
    const cs  = centerStrength * alpha;
    for (const nd of nodes) {
      if (nd.fixed) continue;
      nd.fx -= cx2 * cs;
      nd.fy -= cy2 * cs;
      nd.fz -= cz2 * cs;
    }

    // ── 5. Integrate velocity + position ─────────────────────────
    for (const nd of nodes) {
      if (nd.fixed) continue;
      nd.vx = (nd.vx + nd.fx) * damping;
      nd.vy = (nd.vy + nd.fy) * damping;
      nd.vz = (nd.vz + nd.fz) * damping;
      nd.x += nd.vx;
      nd.y += nd.vy;
      nd.z += nd.vz;
    }

    // ── 6. Cool ───────────────────────────────────────────────────
    this._alpha *= (1 - alphaDecay);
  }
}
