// View cube (#84): a navigation cube in the top right corner of the 3D view, as in CAD programs.
//
// The cube is HTML/CSS 3D (one div per face, preserve-3d), turned by the inverse of the camera's
// rotation every frame. Every face is a 3×3 grid: the middle is the face, the sides are the edges
// and the corners are the corners of the cube. A click turns the camera to look from that
// direction (keeping the target and the distance); hovering highlights the face, edge or corner on
// all faces that share it. Dragging the cube orbits the camera. Under the cube, a compass ring
// shows north (IFC +Y), and its letters look from that side.
//
// Directions are in viewer (three.js) coordinates: IFC X = x, IFC Y (north) = −z, IFC Z (up) = y.
import * as THREE from 'three';
import { t } from './i18n.js';

const SIZE = 64; // cube edge in px
const H = SIZE / 2;

// n: outward normal; u, v: the face's right and down directions seen from outside (world)
const FACES = [
  { key: 'front', n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  { key: 'back', n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
  { key: 'right', n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
  { key: 'left', n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
  { key: 'top', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { key: 'bottom', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
];
const COMPASS = [
  { key: 'n', d: [0, 0, -1], x: 0, y: -1 },
  { key: 'e', d: [1, 0, 0], x: 1, y: 0 },
  { key: 's', d: [0, 0, 1], x: 0, y: 1 },
  { key: 'w', d: [-1, 0, 0], x: -1, y: 0 },
];
const FLIP = new THREE.Matrix4().makeScale(1, -1, 1); // three.js (y up) <-> CSS (y down)

/** CSS matrix that places a face: its x along u, its y along v, at H along n (CSS has y down). */
function faceMatrix(f) {
  const c = (w) => [w[0], -w[1], w[2]];
  const [u, v, n] = [c(f.u), c(f.v), c(f.n)];
  return `matrix3d(${[...u, 0, ...v, 0, ...n, 0, n[0] * H, n[1] * H, n[2] * H, 1].join(',')})`;
}

export class ViewCube {
  /** viewer: the Viewer; onHome(): the home button. */
  constructor(viewer, { onHome } = {}) {
    this.viewer = viewer;
    this.onHome = onHome;
    this.el = document.createElement('div');
    this.el.className = 'viewcube';
    this.el.innerHTML = `
      <div class="vc-stage"><div class="vc-cube"></div></div>
      <button type="button" class="vc-btn vc-home">⌂</button>
      <button type="button" class="vc-btn vc-rot vc-ccw">↶</button>
      <button type="button" class="vc-btn vc-rot vc-cw">↷</button>`;
    this.cube = this.el.querySelector('.vc-cube');
    this.#build();
    viewer.container.appendChild(this.el);
    this.#bind();
    this.lastKey = '';
    viewer.renderHooks.push(() => this.update());
    this.update();
  }

  /** Labels after a language change. */
  relabel() {
    for (const f of this.cube.querySelectorAll('.vc-face')) f.querySelector('.vc-label').textContent = t(`vc.${f.dataset.face}`);
    for (const c of this.cube.querySelectorAll('.vc-dir')) c.textContent = t(`vc.${c.dataset.key}`);
    this.el.querySelector('.vc-home').title = t('vc.home');
    this.el.querySelector('.vc-ccw').title = t('vc.rotCcw');
    this.el.querySelector('.vc-cw').title = t('vc.rotCw');
    this.el.title = t('vc.title');
  }

  setVisible(on) { this.el.hidden = !on; if (on) { this.lastKey = ''; this.update(); } }

  #build() {
    const ring = document.createElement('div');
    ring.className = 'vc-ring';
    ring.style.transform = `matrix3d(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,${H + 10},0,1)`; // horizontal, north up, under the cube
    for (const c of COMPASS) {
      const b = document.createElement('div');
      b.className = 'vc-dir';
      b.dataset.key = c.key;
      b.dataset.d = c.d.join(',');
      b.style.left = `calc(50% + ${c.x * 47}px)`;
      b.style.top = `calc(50% + ${c.y * 47}px)`;
      ring.appendChild(b);
    }
    this.cube.appendChild(ring);
    for (const f of FACES) {
      const face = document.createElement('div');
      face.className = 'vc-face';
      face.dataset.face = f.key;
      face.style.transform = faceMatrix(f);
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const d = [0, 1, 2].map((k) => f.n[k] + i * f.u[k] + j * f.v[k]);
          const cell = document.createElement('div');
          cell.className = `vc-cell ${i || j ? (i && j ? 'vc-corner' : 'vc-edge') : 'vc-mid'}`;
          cell.dataset.d = d.join(',');
          face.appendChild(cell);
        }
      }
      const label = document.createElement('span');
      label.className = 'vc-label';
      face.appendChild(label);
      this.cube.appendChild(face);
    }
    this.relabel();
  }

  #bind() {
    let drag = null;
    const hover = (d) => {
      if (d === this.hoverD) return;
      this.hoverD = d;
      for (const c of this.cube.querySelectorAll('.hover')) c.classList.remove('hover');
      if (d) for (const c of this.cube.querySelectorAll(`[data-d="${d}"]`)) c.classList.add('hover');
    };
    const stage = this.el.querySelector('.vc-stage');
    stage.addEventListener('pointermove', (e) => { if (!drag) hover(e.target.closest('[data-d]')?.dataset.d || null); });
    stage.addEventListener('pointerleave', () => { if (!drag) hover(null); });
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, moved: false, d: e.target.closest('[data-d]')?.dataset.d };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      hover(null);
      this.#orbit(dx, dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    stage.addEventListener('pointerup', (e) => {
      const d = drag;
      drag = null;
      if (!d || d.moved || !d.d) return;
      this.lookFrom(d.d.split(',').map(Number));
      hover(e.target.closest?.('[data-d]')?.dataset.d || null);
    });
    stage.addEventListener('pointercancel', () => { drag = null; });
    stage.addEventListener('dblclick', (e) => e.stopPropagation());
    this.el.querySelector('.vc-home').addEventListener('click', () => this.onHome?.());
    this.el.querySelector('.vc-ccw').addEventListener('click', () => this.rotate(-1));
    this.el.querySelector('.vc-cw').addEventListener('click', () => this.rotate(1));
    // nothing on the cube reaches the 3D view (picking, pivot, context menu)
    for (const ev of ['pointerdown', 'click', 'contextmenu', 'wheel']) this.el.addEventListener(ev, (e) => e.stopPropagation());
  }

  /** Turns the camera to look from direction d (viewer coordinates) at the same target. */
  lookFrom(d) {
    const dir = new THREE.Vector3(...d).normalize();
    // straight up or down: tilt a hair towards south, so north is up on the screen
    if (Math.abs(dir.y) > 0.9999) dir.set(0, Math.sign(dir.y), 1e-3).normalize();
    this.#turnTo(dir);
  }

  /** Turns the view 90° about the vertical axis (sign +1 clockwise seen from above). */
  rotate(sign) {
    const v = this.viewer;
    const off = v.camera.position.clone().sub(v.controls.target);
    if (off.lengthSq() < 1e-12) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -sign * Math.PI / 2);
    const to = off.clone().applyQuaternion(q).normalize();
    this.#turnTo(to, q);
  }

  #turnTo(dir, rot = null) {
    const v = this.viewer;
    const target = v.controls.target.clone();
    const off = v.camera.position.clone().sub(target);
    const dist = off.length() || 1;
    const from = off.clone().normalize();
    const q = rot || new THREE.Quaternion().setFromUnitVectors(from, dir);
    const id = new THREE.Quaternion();
    const qq = new THREE.Quaternion();
    const start = performance.now();
    const dur = 450;
    const token = (this.anim = {});
    const step = (now) => {
      if (this.anim !== token) return;
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      qq.slerpQuaternions(id, q, e);
      const p = from.clone().applyQuaternion(qq);
      if (k === 1) p.copy(dir);
      v.camera.position.copy(target).addScaledVector(p, dist);
      v.camera.lookAt(target);
      v.invalidate(100);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  #orbit(dx, dy) {
    const v = this.viewer;
    const target = v.controls.target;
    const sph = new THREE.Spherical().setFromVector3(v.camera.position.clone().sub(target));
    sph.theta -= dx * 0.012;
    sph.phi = Math.min(Math.PI - 1e-3, Math.max(1e-3, sph.phi - dy * 0.012));
    v.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
    v.camera.lookAt(target);
    this.anim = null;
    v.invalidate(100);
  }

  /** Turns the cube with the camera. */
  update() {
    if (this.el.hidden) return;
    const q = this.viewer.camera.quaternion;
    const key = `${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)},${q.w.toFixed(5)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert());
    m.premultiply(FLIP).multiply(FLIP);
    this.cube.style.transform = `matrix3d(${m.elements.map((x) => (Math.abs(x) < 1e-10 ? 0 : x.toFixed(6))).join(',')})`;
  }
}
