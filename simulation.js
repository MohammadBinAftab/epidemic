/**
 * EpiSim — Epidemic Spread Simulation Engine
 * SEIR Model on Network Graphs
 * Supports: Scale-Free (Barabasi-Albert), Erdös-Rényi, Watts-Strogatz Small World, Grid
 */

'use strict';

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

const STATES = { SUSCEPTIBLE: 'S', EXPOSED: 'E', INFECTIOUS: 'I', RECOVERED: 'R', DECEASED: 'D', VACCINATED: 'V' };
const STATE_COLORS = {
  S: '#4fc3f7', E: '#ffd54f', I: '#ff4d6d', R: '#69db7c', D: '#868e96', V: '#b197fc'
};
const STATE_GLOW = {
  S: 'rgba(79,195,247,0.5)', E: 'rgba(255,213,79,0.5)', I: 'rgba(255,77,109,0.8)',
  R: 'rgba(105,219,124,0.4)', D: 'rgba(134,142,150,0.2)', V: 'rgba(177,151,252,0.5)'
};

let sim = null;
let animationId = null;
let isRunning = false;
let topology = 'scalefree';

/* ============================================================
   GRAPH GENERATION
   ============================================================ */

class Graph {
  constructor(n) {
    this.n = n;
    this.nodes = Array.from({ length: n }, (_, i) => ({
      id: i, x: 0, y: 0, vx: 0, vy: 0,
      state: STATES.SUSCEPTIBLE,
      daysInState: 0,
      stateAge: 0,
      vaccinated: false
    }));
    this.edges = [];
    this.adj = Array.from({ length: n }, () => []);
  }

  addEdge(u, v) {
    if (u === v) return;
    if (this.adj[u].includes(v)) return;
    this.adj[u].push(v);
    this.adj[v].push(u);
    this.edges.push([u, v]);
  }

  degree(u) { return this.adj[u].length; }

  /** Barabasi-Albert preferential attachment */
  static scaleFree(n, m = 3) {
    const g = new Graph(n);
    // seed with small clique
    const seed = Math.min(m + 1, n);
    for (let i = 0; i < seed; i++)
      for (let j = i + 1; j < seed; j++)
        g.addEdge(i, j);

    for (let newNode = seed; newNode < n; newNode++) {
      const totalDeg = g.edges.length * 2 + seed;
      const targets = new Set();
      let tries = 0;
      while (targets.size < Math.min(m, newNode) && tries < 1000) {
        tries++;
        const r = Math.random() * (totalDeg + newNode);
        let cumul = 0;
        for (let j = 0; j < newNode; j++) {
          cumul += g.degree(j) + 1;
          if (r <= cumul) { targets.add(j); break; }
        }
      }
      targets.forEach(t => g.addEdge(newNode, t));
    }
    return g;
  }

  /** Erdos-Renyi random graph */
  static random(n, p) {
    const g = new Graph(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.random() < p) g.addEdge(i, j);
    return g;
  }

  /** Watts-Strogatz Small World */
  static smallWorld(n, k, beta) {
    const g = new Graph(n);
    const half = Math.floor(k / 2);
    // Ring lattice
    for (let i = 0; i < n; i++)
      for (let d = 1; d <= half; d++)
        g.addEdge(i, (i + d) % n);
    // Rewire
    for (let i = 0; i < n; i++) {
      for (let d = 1; d <= half; d++) {
        if (Math.random() < beta) {
          const j = (i + d) % n;
          // Remove old edge
          const idxAdj = g.adj[i].indexOf(j);
          if (idxAdj > -1) {
            g.adj[i].splice(idxAdj, 1);
            const jAdj = g.adj[j].indexOf(i);
            if (jAdj > -1) g.adj[j].splice(jAdj, 1);
            const eIdx = g.edges.findIndex(e => (e[0] === i && e[1] === j) || (e[0] === j && e[1] === i));
            if (eIdx > -1) g.edges.splice(eIdx, 1);
          }
          // Add new random edge
          let newJ;
          let t2 = 0;
          do { newJ = Math.floor(Math.random() * n); t2++; }
          while ((newJ === i || g.adj[i].includes(newJ)) && t2 < 200);
          if (t2 < 200) g.addEdge(i, newJ);
        }
      }
    }
    return g;
  }

  /** 2D Grid */
  static grid(n) {
    const side = Math.ceil(Math.sqrt(n));
    const g = new Graph(side * side);
    g.n = side * side;
    g.nodes = Array.from({ length: g.n }, (_, i) => ({
      id: i, x: 0, y: 0, vx: 0, vy: 0,
      state: STATES.SUSCEPTIBLE, daysInState: 0, stateAge: 0, vaccinated: false
    }));
    for (let r = 0; r < side; r++) {
      for (let c = 0; c < side; c++) {
        const idx = r * side + c;
        if (c + 1 < side) g.addEdge(idx, idx + 1);
        if (r + 1 < side) g.addEdge(idx, idx + side);
      }
    }
    return g;
  }
}

/* ============================================================
   LAYOUT: FORCE-DIRECTED (Fruchterman-Reingold lite)
   ============================================================ */

function layoutForce(graph, width, height, iterations = 80) {
  const n = graph.nodes.length;
  const area = width * height;
  const k = Math.sqrt(area / n) * 0.9;
  const padding = 40;
  const W = width - padding * 2;
  const H = height - padding * 2;

  // Init random positions
  graph.nodes.forEach(node => {
    node.x = padding + Math.random() * W;
    node.y = padding + Math.random() * H;
    node.vx = 0;
    node.vy = 0;
  });

  for (let iter = 0; iter < iterations; iter++) {
    const temp = k * (1 - iter / iterations);
    const disp = Array.from({ length: n }, () => ({ x: 0, y: 0 }));

    // Repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = graph.nodes[i].x - graph.nodes[j].x;
        const dy = graph.nodes[i].y - graph.nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[i].x += fx; disp[i].y += fy;
        disp[j].x -= fx; disp[j].y -= fy;
      }
    }

    // Attraction
    graph.edges.forEach(([u, v]) => {
      const dx = graph.nodes[u].x - graph.nodes[v].x;
      const dy = graph.nodes[u].y - graph.nodes[v].y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[u].x -= fx; disp[u].y -= fy;
      disp[v].x += fx; disp[v].y += fy;
    });

    // Apply
    graph.nodes.forEach((node, i) => {
      const d = Math.sqrt(disp[i].x * disp[i].x + disp[i].y * disp[i].y) + 0.01;
      const move = Math.min(d, temp);
      node.x = Math.max(padding, Math.min(width - padding, node.x + (disp[i].x / d) * move));
      node.y = Math.max(padding, Math.min(height - padding, node.y + (disp[i].y / d) * move));
    });
  }
}

function layoutGrid(graph, width, height, side) {
  const padding = 40;
  const W = width - padding * 2;
  const H = height - padding * 2;
  const cellW = W / (side - 1 || 1);
  const cellH = H / (side - 1 || 1);
  graph.nodes.forEach((node, i) => {
    const r = Math.floor(i / side);
    const c = i % side;
    node.x = padding + c * cellW;
    node.y = padding + r * cellH;
  });
}

/* ============================================================
   SIMULATION ENGINE
   ============================================================ */

class Simulation {
  constructor(params) {
    this.params = { ...params };
    this.day = 0;
    this.histories = { S: [], E: [], I: [], R: [], D: [] };
    this.peakI = 0;
    this.peakDay = 0;
    this.totalEverInfected = 0;
    this.firstInfectedDay = -1;
    this.doublingRef = { count: 0, day: 0 };
    this.events = [];
    this.graph = null;
    this.interventionEffects = { betaMult: 1.0, kMult: 1.0 };
    this._buildGraph();
    this._applyVaccination();
    this._seedInfection(1);
  }

  _buildGraph() {
    const { population, k, networkType, canvas } = this.params;
    const n = population;
    let g;

    if (networkType === 'scalefree') {
      const m = Math.max(2, Math.floor(k / 2));
      g = Graph.scaleFree(n, m);
    } else if (networkType === 'random') {
      const p = k / (n - 1);
      g = Graph.random(n, p);
    } else if (networkType === 'smallworld') {
      g = Graph.smallWorld(n, Math.max(4, k), 0.15);
    } else {
      g = Graph.grid(n);
    }

    // Layout
    const W = canvas.width;
    const H = canvas.height;
    if (networkType === 'grid') {
      const side = Math.ceil(Math.sqrt(n));
      layoutGrid(g, W, H, side);
    } else {
      layoutForce(g, W, H, n < 150 ? 100 : 60);
    }

    this.graph = g;
  }

  _applyVaccination() {
    if (!this.params.vaccination) return;
    const vaccFrac = 0.30;
    const vaccCount = Math.floor(this.graph.n * vaccFrac);
    const shuffled = [...this.graph.nodes].sort(() => Math.random() - 0.5);
    for (let i = 0; i < vaccCount; i++) {
      shuffled[i].state = STATES.VACCINATED;
      shuffled[i].vaccinated = true;
    }
  }

  _seedInfection(count) {
    const susceptible = this.graph.nodes.filter(n => n.state === STATES.SUSCEPTIBLE);
    const seeds = susceptible.sort(() => Math.random() - 0.5).slice(0, count);
    seeds.forEach(n => {
      n.state = STATES.INFECTIOUS;
      this.totalEverInfected++;
    });
    if (this.firstInfectedDay < 0) this.firstInfectedDay = this.day;
  }

  /** Update intervention multipliers from params */
  updateInterventions() {
    const { mask, lockdown, tracing } = this.params;
    let betaMult = 1.0;
    let kMult = 1.0;
    if (mask) betaMult *= 0.55;
    if (lockdown) { betaMult *= 0.4; kMult *= 0.5; }
    if (tracing) betaMult *= 0.7;
    this.interventionEffects = { betaMult, kMult };
  }

  /** Single discrete-time step (one "day") */
  step() {
    this.day++;
    const { beta: rawBeta, sigma, gamma, mu } = this.params;
    this.updateInterventions();
    const beta = rawBeta * this.interventionEffects.betaMult;
    const kMult = this.interventionEffects.kMult;

    const newStates = this.graph.nodes.map(node => ({ ...node }));

    this.graph.nodes.forEach((node, i) => {
      newStates[i].stateAge++;

      if (node.state === STATES.SUSCEPTIBLE) {
        // Count infectious neighbours
        const neighbours = this.graph.adj[node.id];
        const activeNeighbours = Math.round(neighbours.length * kMult);
        const sample = neighbours.slice(0, activeNeighbours);
        let infectedNeighbours = sample.filter(n => this.graph.nodes[n].state === STATES.INFECTIOUS).length;

        // P(infection) = 1 - (1 - beta)^infectedNeighbours
        const pInfect = 1 - Math.pow(1 - beta, infectedNeighbours);
        if (Math.random() < pInfect) {
          newStates[i].state = STATES.EXPOSED;
          newStates[i].stateAge = 0;
          this.totalEverInfected++;
        }
      } else if (node.state === STATES.EXPOSED) {
        if (Math.random() < sigma) {
          newStates[i].state = STATES.INFECTIOUS;
          newStates[i].stateAge = 0;
        }
      } else if (node.state === STATES.INFECTIOUS) {
        if (Math.random() < mu) {
          newStates[i].state = STATES.DECEASED;
          newStates[i].stateAge = 0;
        } else if (Math.random() < gamma) {
          newStates[i].state = STATES.RECOVERED;
          newStates[i].stateAge = 0;
        }
      }
    });

    this.graph.nodes = newStates;

    // Record history
    const counts = this.getCounts();
    this.histories.S.push(counts.S);
    this.histories.E.push(counts.E);
    this.histories.I.push(counts.I);
    this.histories.R.push(counts.R);
    this.histories.D.push(counts.D);

    // Peak tracking
    if (counts.I > this.peakI) {
      this.peakI = counts.I;
      this.peakDay = this.day;
    }

    // Events
    this._checkEvents(counts);
  }

  _checkEvents(counts) {
    const n = this.graph.n;
    const total = this.totalEverInfected;
    const pct = (total / n * 100).toFixed(0);

    if (this.day === 1) this.logEvent('Simulation started. Patient zero infected.', 'info');
    if (counts.I === 0 && this.day > 1) {
      if (counts.E === 0) this.logEvent(`Epidemic ended on day ${this.day}. ${pct}% of population infected.`, 'success');
    }
    if (counts.I > n * 0.1 && !this._logged10) { this._logged10 = true; this.logEvent('⚠️ 10% of population infected (epidemic threshold).', 'warning'); }
    if (counts.I > n * 0.25 && !this._logged25) { this._logged25 = true; this.logEvent('🔴 25% simultaneous infection — healthcare overwhelmed.', 'danger'); }
    if (counts.I === this.peakI && this.day === this.peakDay && this.day > 5) {
      this.logEvent(`📈 Peak infection reached on day ${this.day} (${counts.I} cases).`, 'danger');
    }
    if (counts.R > n * 0.5 && !this._loggedHerd) {
      this._loggedHerd = true;
      this.logEvent('🛡️ Herd immunity threshold approaching (50% recovered).', 'success');
    }
  }

  logEvent(text, type = 'info') {
    this.events.unshift({ day: this.day, text, type });
    if (this.events.length > 30) this.events.pop();
  }

  getCounts() {
    const counts = { S: 0, E: 0, I: 0, R: 0, D: 0, V: 0 };
    this.graph.nodes.forEach(n => {
      if (n.state === STATES.VACCINATED) counts.V++;
      else counts[n.state]++;
    });
    return counts;
  }

  computeR0() {
    const { beta: rawBeta, gamma } = this.params;
    this.updateInterventions();
    const beta = rawBeta * this.interventionEffects.betaMult;
    // Mean degree approximation: R0 ≈ beta * <k> / gamma
    const avgDeg = this.graph.edges.length * 2 / this.graph.nodes.length;
    return (beta * avgDeg * this.interventionEffects.kMult) / gamma;
  }

  isOver() {
    const c = this.getCounts();
    return c.I === 0 && c.E === 0 && this.day > 1;
  }

  /** Infect a random susceptible node */
  infectRandom() {
    const sus = this.graph.nodes.filter(n => n.state === STATES.SUSCEPTIBLE);
    if (sus.length === 0) return;
    const target = sus[Math.floor(Math.random() * sus.length)];
    target.state = STATES.INFECTIOUS;
    this.totalEverInfected++;
    this.logEvent(`Manual infection at node ${target.id}`, 'warning');
  }
}

/* ============================================================
   RENDERER
   ============================================================ */

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;
    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.scale(this.dpr, this.dpr);
  }

  draw(graph) {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);

    // Background gradient
    const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height));
    bg.addColorStop(0, 'rgba(13,21,36,1)');
    bg.addColorStop(1, 'rgba(6,10,20,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (!graph) return;

    const n = graph.nodes.length;
    const baseRadius = n > 300 ? 3 : n > 150 ? 4 : n > 80 ? 5 : 7;

    // Draw edges
    ctx.lineWidth = 0.5;
    graph.edges.forEach(([u, v]) => {
      const nu = graph.nodes[u];
      const nv = graph.nodes[v];
      const uInfected = nu.state === STATES.INFECTIOUS || nv.state === STATES.INFECTIOUS;
      const uExposed = nu.state === STATES.EXPOSED || nv.state === STATES.EXPOSED;
      if (uInfected) {
        ctx.strokeStyle = 'rgba(255,77,109,0.15)';
      } else if (uExposed) {
        ctx.strokeStyle = 'rgba(255,213,79,0.1)';
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      }
      ctx.beginPath();
      ctx.moveTo(nu.x, nu.y);
      ctx.lineTo(nv.x, nv.y);
      ctx.stroke();
    });

    // Draw nodes
    graph.nodes.forEach(node => {
      const r = baseRadius + (graph.adj[node.id]?.length || 0) * 0.18;
      const clampedR = Math.min(r, baseRadius * 2.5);
      const color = STATE_COLORS[node.state] || '#4fc3f7';
      const glow = STATE_GLOW[node.state];

      // Glow
      if (node.state === STATES.INFECTIOUS) {
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300 + node.id);
        const glowR = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, clampedR * 4);
        glowR.addColorStop(0, `rgba(255,77,109,${0.35 * pulse})`);
        glowR.addColorStop(1, 'rgba(255,77,109,0)');
        ctx.fillStyle = glowR;
        ctx.beginPath();
        ctx.arc(node.x, node.y, clampedR * 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (node.state === STATES.EXPOSED) {
        const glowR = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, clampedR * 3);
        glowR.addColorStop(0, 'rgba(255,213,79,0.2)');
        glowR.addColorStop(1, 'rgba(255,213,79,0)');
        ctx.fillStyle = glowR;
        ctx.beginPath();
        ctx.arc(node.x, node.y, clampedR * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, clampedR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Ring for vaccinated
      if (node.vaccinated || node.state === STATES.VACCINATED) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, clampedR + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#b197fc';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 0.5;
      }
    });
  }
}

/* ============================================================
   CHART RENDERER
   ============================================================ */

class ChartRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  draw(histories, total) {
    const rect = this.canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, W * this.dpr, H * this.dpr);

    if (!histories || histories.S.length === 0) return;

    const pad = { top: 10, right: 10, bottom: 20, left: 36 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      // Y label
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = `${9 * this.dpr / this.dpr}px Inter`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round((1 - i / 4) * total), pad.left - 4, y + 3);
    }

    const len = histories.S.length;

    const drawLine = (data, color, filled = false) => {
      if (data.length < 2) return;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = pad.left + (i / (len - 1 || 1)) * chartW;
        const y = pad.top + chartH - (data[i] / total) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (filled) {
        const lastX = pad.left + chartW;
        const lastY = pad.top + chartH - (data[data.length - 1] / total) * chartH;
        ctx.lineTo(lastX, pad.top + chartH);
        ctx.lineTo(pad.left, pad.top + chartH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
        grad.addColorStop(0, color.replace('1)', '0.25)'));
        grad.addColorStop(1, color.replace('1)', '0)'));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = pad.left + (i / (len - 1 || 1)) * chartW;
          const y = pad.top + chartH - (data[i] / total) * chartH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    drawLine(histories.S, 'rgba(79,195,247,1)', true);
    drawLine(histories.R, 'rgba(105,219,124,1)', true);
    drawLine(histories.E, 'rgba(255,213,79,1)');
    drawLine(histories.I, 'rgba(255,77,109,1)', true);
    drawLine(histories.D, 'rgba(134,142,150,1)');

    // X axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center';
    ctx.font = `${9}px Inter`;
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const dayIdx = Math.floor((i / xTicks) * (len - 1));
      const x = pad.left + (dayIdx / (len - 1 || 1)) * chartW;
      ctx.fillText(dayIdx, x, pad.top + chartH + 14);
    }
  }
}

/* ============================================================
   UI CONTROLLER
   ============================================================ */

const ui = {
  canvas: null,
  chartCanvas: null,
  renderer: null,
  chartRenderer: null,
  lastFrame: 0,
  frameInterval: 1000 / 30,
  stepsPerFrame: 1,

  init() {
    this.canvas = document.getElementById('simCanvas');
    this.chartCanvas = document.getElementById('chartCanvas');
    this.renderer = new Renderer(this.canvas);
    this.chartRenderer = new ChartRenderer(this.chartCanvas);
    this.chartRenderer.resize();

    this.bindSliders();
    this.bindButtons();
    this.bindTopology();
    this.bindInterventions();
    this.bindCanvasHover();
    this.spawnParticles();
    this.updateR0Display();

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.chartRenderer.resize();
      if (sim) {
        this.renderer.draw(sim.graph);
        this.chartRenderer.draw(sim.histories, sim.graph.n);
      }
    });
  },

  getParams() {
    const p = {
      population: +document.getElementById('populationSlider').value,
      beta: +document.getElementById('betaSlider').value,
      sigma: +document.getElementById('sigmaSlider').value,
      gamma: +document.getElementById('gammaSlider').value,
      mu: +document.getElementById('muSlider').value,
      k: +document.getElementById('kSlider').value,
      speed: +document.getElementById('speedSlider').value,
      networkType: topology,
      mask: document.getElementById('maskToggle').checked,
      lockdown: document.getElementById('lockdownToggle').checked,
      vaccination: document.getElementById('vaccinationToggle').checked,
      tracing: document.getElementById('tracingToggle').checked,
      canvas: { width: this.renderer.width, height: this.renderer.height }
    };
    return p;
  },

  bindSliders() {
    const map = {
      populationSlider: ['popVal', v => v],
      betaSlider: ['betaVal', v => (+v).toFixed(2)],
      sigmaSlider: ['sigmaVal', v => (+v).toFixed(2)],
      gammaSlider: ['gammaVal', v => (+v).toFixed(2)],
      muSlider: ['muVal', v => (+v).toFixed(3)],
      kSlider: ['kVal', v => v],
      speedSlider: ['speedVal', v => (+v).toFixed(1) + '×'],
    };
    Object.entries(map).forEach(([id, [valId, fmt]]) => {
      const slider = document.getElementById(id);
      const valEl = document.getElementById(valId);
      slider.addEventListener('input', () => {
        valEl.textContent = fmt(slider.value);
        this.updateR0Display();
        if (id === 'speedSlider' && sim) {
          this.stepsPerFrame = Math.max(1, Math.floor(+slider.value));
        }
      });
    });
  },

  bindButtons() {
    document.getElementById('playPauseBtn').addEventListener('click', () => this.togglePlay());
    document.getElementById('resetBtn').addEventListener('click', () => this.reset());
    document.getElementById('infect1Btn').addEventListener('click', () => {
      if (sim) { sim.infectRandom(); this.renderFrame(true); }
    });
    document.getElementById('overlayStartBtn').addEventListener('click', () => this.startSim());
  },

  bindTopology() {
    document.querySelectorAll('.topo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.topo-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        topology = btn.dataset.topo;
        document.getElementById('networkBadge').textContent = {
          scalefree: 'Scale-Free Network',
          random: 'Random (ER) Network',
          smallworld: 'Small-World Network',
          grid: 'Grid Network'
        }[topology] || topology;
        this.updateR0Display();
      });
    });
  },

  bindInterventions() {
    ['maskToggle', 'lockdownToggle', 'vaccinationToggle', 'tracingToggle'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        this.updateR0Display();
        if (sim && id !== 'vaccinationToggle') {
          sim.params.mask = document.getElementById('maskToggle').checked;
          sim.params.lockdown = document.getElementById('lockdownToggle').checked;
          sim.params.tracing = document.getElementById('tracingToggle').checked;
          sim.logEvent(
            id === 'maskToggle' ? (document.getElementById('maskToggle').checked ? '😷 Mask mandate activated' : '😷 Mask mandate lifted') :
            id === 'lockdownToggle' ? (document.getElementById('lockdownToggle').checked ? '🏠 Lockdown initiated' : '🏠 Lockdown lifted') :
            (document.getElementById('tracingToggle').checked ? '🧪 Contact tracing started' : '🧪 Contact tracing stopped'),
            'info'
          );
        }
      });
    });
  },

  bindCanvasHover() {
    const tooltip = document.getElementById('nodeTooltip');
    this.canvas.addEventListener('mousemove', e => {
      if (!sim) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let closest = null;
      let closestDist = 20; // px threshold
      sim.graph.nodes.forEach(node => {
        const d = Math.hypot(node.x - mx, node.y - my);
        if (d < closestDist) { closest = node; closestDist = d; }
      });

      if (closest) {
        const stateNames = { S: 'Susceptible', E: 'Exposed', I: 'Infectious', R: 'Recovered', D: 'Deceased', V: 'Vaccinated' };
        tooltip.innerHTML = `
          <b>Node ${closest.id}</b><br/>
          State: <span style="color:${STATE_COLORS[closest.state]}">${stateNames[closest.state]}</span><br/>
          Connections: ${sim.graph.adj[closest.id].length}<br/>
          Days in state: ${closest.stateAge}
        `;
        tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
        tooltip.classList.add('visible');
      } else {
        tooltip.classList.remove('visible');
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });

    // Click to infect
    this.canvas.addEventListener('click', e => {
      if (!sim) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let closest = null;
      let closestDist = 20;
      sim.graph.nodes.forEach(node => {
        const d = Math.hypot(node.x - mx, node.y - my);
        if (d < closestDist && node.state === STATES.SUSCEPTIBLE) {
          closest = node; closestDist = d;
        }
      });
      if (closest) {
        closest.state = STATES.INFECTIOUS;
        sim.totalEverInfected++;
        sim.logEvent(`Manual infection: Node ${closest.id}`, 'warning');
        this.renderFrame(true);
      }
    });
  },

  spawnParticles() {
    const container = document.getElementById('bgParticles');
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
      p.style.animationDuration = `${8 + Math.random() * 12}s`;
      p.style.animationDelay = `${Math.random() * -15}s`;
      p.style.width = p.style.height = `${1 + Math.random() * 2}px`;
      container.appendChild(p);
    }
  },

  startSim() {
    document.getElementById('canvasOverlay').classList.add('hidden');
    this.reset();
    this.togglePlay();
  },

  reset() {
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    isRunning = false;
    this.updatePlayBtn(false);

    const params = this.getParams();
    sim = new Simulation(params);
    this.stepsPerFrame = Math.max(1, Math.floor(params.speed));

    this.updateStats();
    this.renderer.draw(sim.graph);
    this.chartRenderer.draw(sim.histories, sim.graph.n);
    this.updateR0Display();
    this.clearEventLog();
    document.getElementById('dayCounter').textContent = '0';
    document.getElementById('edgeCount').textContent = sim.graph.edges.length;
    document.getElementById('nodeCount').textContent = sim.graph.nodes.length;
    document.getElementById('phaseBadge').textContent = 'Initialized';
    document.getElementById('phaseBadge').className = 'phase-badge';
    document.getElementById('modelBadge').textContent = 'SEIR Model';
  },

  togglePlay() {
    if (!sim) this.reset();
    isRunning = !isRunning;
    this.updatePlayBtn(isRunning);
    if (isRunning) this.runLoop();
    else if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  },

  updatePlayBtn(running) {
    const btn = document.getElementById('playPauseBtn');
    const label = document.getElementById('playPauseLabel');
    const iconPlay = btn.querySelector('.icon-play');
    const iconPause = btn.querySelector('.icon-pause');
    if (running) {
      btn.classList.add('running');
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      label.textContent = 'Pause';
    } else {
      btn.classList.remove('running');
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      label.textContent = 'Simulate';
    }
  },

  runLoop(timestamp = 0) {
    if (!isRunning) return;

    const elapsed = timestamp - this.lastFrame;
    const speed = +document.getElementById('speedSlider').value;
    const targetInterval = 700 / speed; // ms per simulation step

    if (elapsed >= targetInterval) {
      this.lastFrame = timestamp;
      // Run multiple steps based on speed
      const steps = Math.ceil(speed);
      for (let s = 0; s < steps && isRunning; s++) {
        sim.step();
        if (sim.isOver()) {
          isRunning = false;
          this.updatePlayBtn(false);
          this.renderFrame(true);
          sim.logEvent(`✅ Epidemic over. Total infected: ${sim.totalEverInfected} (${(sim.totalEverInfected / sim.graph.n * 100).toFixed(1)}%)`, 'success');
          this.updateEventLog();
          return;
        }
      }
      this.renderFrame(false);
    }

    animationId = requestAnimationFrame(ts => this.runLoop(ts));
  },

  renderFrame(force = false) {
    if (!sim) return;
    this.renderer.draw(sim.graph);
    this.chartRenderer.draw(sim.histories, sim.graph.n);
    this.updateStats();
    this.updateEventLog();
    document.getElementById('dayCounter').textContent = sim.day;
  },

  updateStats() {
    if (!sim) return;
    const counts = sim.getCounts();
    const n = sim.graph.n;

    const pct = x => (x / n * 100).toFixed(1) + '%';

    document.getElementById('sCount').textContent = counts.S;
    document.getElementById('eCount').textContent = counts.E;
    document.getElementById('iCount').textContent = counts.I;
    document.getElementById('rCount').textContent = counts.R;
    document.getElementById('dCount').textContent = counts.D;

    document.getElementById('sPct').textContent = pct(counts.S);
    document.getElementById('ePct').textContent = pct(counts.E);
    document.getElementById('iPct').textContent = pct(counts.I);
    document.getElementById('rPct').textContent = pct(counts.R);
    document.getElementById('dPct').textContent = pct(counts.D);

    // Population bar
    document.getElementById('popBarS').style.width = pct(counts.S);
    document.getElementById('popBarE').style.width = pct(counts.E);
    document.getElementById('popBarI').style.width = pct(counts.I);
    document.getElementById('popBarR').style.width = pct(counts.R);
    document.getElementById('popBarD').style.width = pct(counts.D);

    // Metrics
    document.getElementById('peakInfected').textContent = sim.peakI;
    document.getElementById('peakDay').textContent = sim.peakDay > 0 ? `Day ${sim.peakDay}` : '—';
    document.getElementById('totalInfected').textContent = sim.totalEverInfected;
    document.getElementById('attackRate').textContent = (sim.totalEverInfected / n * 100).toFixed(1) + '%';
    const cfr = sim.totalEverInfected > 0 ? (counts.D / sim.totalEverInfected * 100).toFixed(1) + '%' : '0%';
    document.getElementById('cfr').textContent = cfr;

    // Doubling time estimate
    const len = sim.histories.I.length;
    let doubling = '—';
    if (len > 5 && sim.histories.I[len - 1] > 0 && sim.histories.I[len - 6] > 0) {
      const ratio = sim.histories.I[len - 1] / sim.histories.I[len - 6];
      if (ratio > 1) {
        const dt = 5 * Math.log(2) / Math.log(ratio);
        doubling = dt < 100 ? `${dt.toFixed(1)}d` : '—';
      }
    }
    document.getElementById('doublingTime').textContent = doubling;

    // R0
    this.updateR0Display();

    // Phase badge
    const badge = document.getElementById('phaseBadge');
    if (counts.I === 0 && counts.E === 0 && sim.day > 1) {
      badge.textContent = '✅ Epidemic Over';
      badge.className = 'phase-badge controlled';
    } else if (counts.I > n * 0.1) {
      badge.textContent = '🔴 Active Epidemic';
      badge.className = 'phase-badge epidemic';
    } else if (counts.I > 0 || counts.E > 0) {
      badge.textContent = '⚠️ Spreading';
      badge.className = 'phase-badge seeding';
    } else {
      badge.textContent = 'Idle';
      badge.className = 'phase-badge';
    }
  },

  updateR0Display() {
    let r0;
    if (sim) {
      r0 = sim.computeR0();
    } else {
      // Estimate from sliders
      const beta = +document.getElementById('betaSlider').value;
      const gamma = +document.getElementById('gammaSlider').value;
      const k = +document.getElementById('kSlider').value;
      let betaMult = 1;
      if (document.getElementById('maskToggle').checked) betaMult *= 0.55;
      if (document.getElementById('lockdownToggle').checked) betaMult *= 0.4;
      if (document.getElementById('tracingToggle').checked) betaMult *= 0.7;
      const kMult = document.getElementById('lockdownToggle').checked ? 0.5 : 1;
      r0 = (beta * betaMult * k * kMult) / gamma;
    }

    const r0El = document.getElementById('r0Display');
    const r0Bar = document.getElementById('r0Bar');
    const r0Status = document.getElementById('r0Status');

    r0El.textContent = r0.toFixed(2);
    const maxR0 = 10;
    const barPct = Math.min(r0 / maxR0 * 100, 100);
    r0Bar.style.width = barPct + '%';

    if (r0 > 1) {
      r0El.className = 'r0-value danger';
      r0Status.className = 'r0-status epidemic';
      r0Status.textContent = `Epidemic growth — ${r0.toFixed(1)} secondary cases per infected`;
    } else {
      r0El.className = 'r0-value safe';
      r0Status.className = 'r0-status controlled';
      r0Status.textContent = `Controlled — disease will fade out`;
    }
  },

  updateEventLog() {
    if (!sim || sim.events.length === 0) return;
    const log = document.getElementById('eventLog');
    log.innerHTML = sim.events.map(ev => `
      <div class="event-entry event-${ev.type}">
        <span class="event-day">D${ev.day}</span>
        <span class="event-text">${ev.text}</span>
      </div>
    `).join('');
  },

  clearEventLog() {
    document.getElementById('eventLog').innerHTML = '<div class="event-log-empty">Simulation initialized...</div>';
  }
};

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  ui.init();
});
