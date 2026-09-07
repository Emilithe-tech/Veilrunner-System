/** GPU underlay for the character-creation talent canvas.
 * DOM buttons stay semantic/interactive and SVG remains the authoritative,
 * crisp visible connection layer. WebGL supplies only the inexpensive glow.
 */
const renderers = new WeakMap();
// 4K-class ceiling: large enough to remain sharp on a 4K display while being
// small enough for shared-memory and integrated GPUs.
export const TREE_WEBGL_MAX_TEXTURE_SIZE = 3840;
export const TREE_WEBGL_MAX_RASTER_PIXELS = 8_000_000;

/**
 * Pick a backing store that is native-resolution after the world transform.
 * The cap protects large authored canvases from exceeding browser/GPU limits.
 */
export function treeWebGLRasterMetrics({ width, height, zoom = 1, devicePixelRatio = 1, maxTextureSize = TREE_WEBGL_MAX_TEXTURE_SIZE, maxPixels = TREE_WEBGL_MAX_RASTER_PIXELS } = {}) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const desiredScale = Math.max(.1, Number(zoom) || 1) * Math.max(1, Number(devicePixelRatio) || 1);
  const textureLimit = Math.min(TREE_WEBGL_MAX_TEXTURE_SIZE, Math.max(1, Number(maxTextureSize) || TREE_WEBGL_MAX_TEXTURE_SIZE));
  const pixelLimit = Math.max(1, Number(maxPixels) || TREE_WEBGL_MAX_RASTER_PIXELS);
  const capScale = Math.min(textureLimit / safeWidth, textureLimit / safeHeight, Math.sqrt(pixelLimit / (safeWidth * safeHeight)));
  const scale = Math.max(.01, Math.min(desiredScale, capScale));
  return {
    scale,
    desiredScale,
    capped: scale < desiredScale,
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale))
  };
}

/** Player trees must opt in before a GPU canvas is ever allocated. */
export function treeWebGLIsEnabled(world) {
  return world?.dataset?.treeWebgl === "enabled";
}

const VERTEX_SHADER = `attribute vec2 a_position; attribute vec4 a_color; uniform vec2 u_resolution; varying vec4 v_color; void main() { vec2 clip = (a_position / u_resolution) * 2.0 - 1.0; gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0); v_color = a_color; }`;
const FRAGMENT_SHADER = `precision mediump float; varying vec4 v_color; void main() { gl_FragColor = v_color; }`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) || "WebGL shader compilation failed.");
  return result;
}

function makeProgram(gl) {
  const result = gl.createProgram();
  gl.attachShader(result, shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(result, shader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result) || "WebGL program link failed.");
  return result;
}

function tint(value, alpha) {
  const match = String(value || "#94a3b8").trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  const short = match ? match[1] : "94a3b8";
  const hex = short.length === 3 ? [...short].map(part => part + part).join("") : short;
  return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, alpha];
}

function appendQuad(vertices, a, b, width, color) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < .01) return;
  const x = (b.y - a.y) / length * width / 2;
  const y = (a.x - b.x) / length * width / 2;
  const point = (px, py) => vertices.push(px, py, ...color);
  point(a.x + x, a.y + y); point(a.x - x, a.y - y); point(b.x + x, b.y + y);
  point(b.x + x, b.y + y); point(a.x - x, a.y - y); point(b.x - x, b.y - y);
}

/** Build one continuous, miter-joined ribbon instead of separate rectangles. */
function appendPolyline(vertices, points, width, color) {
  if (points.length < 2) return;
  const half = width / 2;
  const sides = points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: -dy / length, y: dx / length };
  });
  const corners = points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return { x: sides[index].x * half, y: sides[index].y * half };
    const before = sides[index - 1];
    const after = sides[index];
    const sum = { x: before.x + after.x, y: before.y + after.y };
    const length = Math.hypot(sum.x, sum.y) || 1;
    const direction = { x: sum.x / length, y: sum.y / length };
    const scale = Math.min(half * 3, half / Math.max(.35, direction.x * after.x + direction.y * after.y));
    return { x: direction.x * scale, y: direction.y * scale };
  });
  const point = (x, y) => vertices.push(x, y, ...color);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const leftA = { x: a.x + corners[index - 1].x, y: a.y + corners[index - 1].y };
    const rightA = { x: a.x - corners[index - 1].x, y: a.y - corners[index - 1].y };
    const leftB = { x: b.x + corners[index].x, y: b.y + corners[index].y };
    const rightB = { x: b.x - corners[index].x, y: b.y - corners[index].y };
    point(leftA.x, leftA.y); point(rightA.x, rightA.y); point(leftB.x, leftB.y);
    point(leftB.x, leftB.y); point(rightA.x, rightA.y); point(rightB.x, rightB.y);
  }
}

/**
 * A grouped SVG draw record can contain several disconnected `M …` routes.
 * SVG treats those as separate strokes, whereas getPointAtLength() measures
 * them as one path and would make a GPU segment bridge each discontinuity.
 */
function subpaths(path) {
  const commands = String(path.getAttribute("d") || "").match(/[Mm][^Mm]*/g) || [];
  if (commands.length < 2) return [path];
  const svg = path.ownerSVGElement;
  if (!svg) return [path];
  return commands.map(command => {
    const segment = document.createElementNS("http://www.w3.org/2000/svg", "path");
    segment.setAttribute("d", command);
    segment.setAttribute("visibility", "hidden");
    svg.append(segment);
    return segment;
  });
}

class TreeWebGLRenderer {
  constructor(world) {
    this.world = world;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "vr-cc-tree-webgl";
    this.canvas.setAttribute("aria-hidden", "true");
    world.prepend(this.canvas);
    this.gl = this.canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!this.gl) throw new Error("WebGL is unavailable.");
    this.program = makeProgram(this.gl);
    this.buffer = this.gl.createBuffer();
    this.activeBuffer = this.gl.createBuffer();
    this.position = this.gl.getAttribLocation(this.program, "a_position");
    this.color = this.gl.getAttribLocation(this.program, "a_color");
    this.resolution = this.gl.getUniformLocation(this.program, "u_resolution");
    this.geometry = null;
  }

  #buildGeometry() {
    const { world } = this;
    const baseVertices = [];
    const activeVertices = [];
    // Use the compiler's consolidated physical fragments as the rendering
    // source. It has already resolved every overlap as active > available >
    // blocked; whole logical routes deliberately do not carry that local
    // priority information at shared trunks.
    const stateForPath = path => path.classList.contains("active") ? "active" : path.classList.contains("available") ? "available" : "blocked";
    const stateRank = path => stateForPath(path) === "active" ? 2 : stateForPath(path) === "available" ? 1 : 0;
    const paths = [...world.querySelectorAll(".vr-cc-tree-link:not(.crossing-casing)"), ...world.querySelectorAll(".vr-cc-tree-webgl-active-route")]
      .sort((a, b) => stateRank(a) - stateRank(b));
    for (const path of paths) {
      if (!path.getTotalLength || !path.getPointAtLength) continue;
      const state = stateForPath(path);
      const vertices = state === "active" ? activeVertices : baseVertices;
      const alpha = state === "active" ? 1 : state === "available" ? .62 : .3;
      const widthPx = Math.max(1, parseFloat(getComputedStyle(path).getPropertyValue("--line-width")) || parseFloat(getComputedStyle(path).strokeWidth) || 2);
      const color = state === "blocked" ? "#24212b" : path.getAttribute("stroke") || "#94a3b8";
      const dash = path.classList.contains("pattern-dashed") ? 12 : path.classList.contains("pattern-dotted") ? 2 : 0;
      const gap = path.classList.contains("pattern-dashed") ? 8 : path.classList.contains("pattern-dotted") ? 8 : 0;
      const segments = subpaths(path);
      for (const segment of segments) {
        const length = segment.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) continue;
        const steps = Math.max(1, Math.ceil(length / 4));
        const points = Array.from({ length: steps + 1 }, (_value, index) => segment.getPointAtLength(length * index / steps));
        if (!dash) {
          if (state === "active") appendPolyline(vertices, points, widthPx + 7, tint(color, .13));
          appendPolyline(vertices, points, widthPx, tint(color, alpha));
        } else {
          let previous = points[0];
          for (let index = 1; index <= steps; index += 1) {
            const next = points[index];
            const middle = length * (index - .5) / steps;
            if (middle % (dash + gap) < dash) {
              if (state === "active") appendQuad(vertices, previous, next, widthPx + 7, tint(color, .13));
              appendQuad(vertices, previous, next, widthPx, tint(color, alpha));
            }
            previous = next;
          }
        }
      }
      for (const segment of segments) if (segment !== path) segment.remove();
    }
    this.geometry = { base: new Float32Array(baseVertices), active: new Float32Array(activeVertices) };
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.geometry.base, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.activeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.geometry.active, gl.STATIC_DRAW);
  }

  render({ zoom = 1, geometry = true, settled = true } = {}) {
    const { world, canvas, gl } = this;
    const width = Math.max(1, Number(world.dataset.worldWidth) || world.clientWidth);
    const height = Math.max(1, Number(world.dataset.worldHeight) || world.clientHeight);
    const metrics = treeWebGLRasterMetrics({
      width,
      height,
      zoom,
      devicePixelRatio: globalThis.devicePixelRatio,
      maxTextureSize: Math.min(TREE_WEBGL_MAX_TEXTURE_SIZE, gl.getParameter(gl.MAX_TEXTURE_SIZE))
    });
    // During a wheel burst the previous frame remains visible. The settled
    // pass replaces it at native display resolution without rebuilding paths.
    const rasterWidth = settled || !canvas.width ? metrics.width : canvas.width;
    const rasterHeight = settled || !canvas.height ? metrics.height : canvas.height;
    if (canvas.width !== rasterWidth || canvas.height !== rasterHeight) { canvas.width = rasterWidth; canvas.height = rasterHeight; }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (geometry || !this.geometry) this.#buildGeometry();
    gl.viewport(0, 0, rasterWidth, rasterHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.geometry.base.length && !this.geometry.active.length) return;
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(this.position);
    gl.enableVertexAttribArray(this.color);
    gl.uniform2f(this.resolution, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // Paint purchased/ranked routes in a distinct final pass. This is
    // intentional rather than an array-order convention: no available or
    // blocked route can overwrite an active shared trunk after this draw.
    for (const [buffer, vertices] of [[this.buffer, this.geometry.base], [this.activeBuffer, this.geometry.active]]) {
      if (!vertices.length) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(this.color, 4, gl.FLOAT, false, 24, 8);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
    }
  }
}

/**
 * WebGL is an explicit opt-in experimental underlay. The SVG foreground is
 * already the complete, crisp renderer, so player trees do not allocate a
 * full-world GPU texture on integrated graphics.
 */
export function renderTreeWebGL(world, options = {}) {
  if (!world?.isConnected || !globalThis.WebGLRenderingContext || !treeWebGLIsEnabled(world)) return false;
  let renderer = renderers.get(world);
  try {
    renderer ??= new TreeWebGLRenderer(world);
    renderers.set(world, renderer);
    renderer.options = { ...renderer.options, ...options, geometry: renderer.options?.geometry || options.geometry !== false, settled: renderer.options?.settled || options.settled !== false };
    if (renderer.queued) return true;
    renderer.queued = true;
    requestAnimationFrame(() => {
      renderer.queued = false;
      const renderOptions = renderer.options;
      renderer.options = null;
      if (world.isConnected) renderer.render(renderOptions);
    });
    world.classList.add("webgl-ready");
    return true;
  } catch (error) {
    console.warn("Veilrunner | Talent-tree WebGL renderer unavailable; using SVG fallback.", error);
    renderer?.canvas?.remove();
    renderers.delete(world);
    return false;
  }
}
