// The about page's hero: the double-track railway sample in 3D, a cross section sliding along track 1
// over the bridge, and that section drawn live on a card beside it – what Vispecta does, shown with
// Vispecta's own sample. Built by Vite as about/hero.js; about.js loads it after the page, only where
// it can run (WebGL 2, DecompressionStream, no reduced motion, no data saver). Otherwise, and until
// it is ready, the poster image stays.
//
// The scene is baked from the sample by scripts/bake-about-hero.mjs: positions in centimetres, the
// triangles grouped by colour and listed per metre of track, so a section only cuts the few
// triangles that cross its plane.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const TEXT = {
  en: { live: 'Live 3D', drag: ' · drag to turn', pause: 'Pause the animation', play: 'Play the animation', section: 'Cross section' },
  da: { live: 'Live 3D', drag: ' · træk for at dreje', pause: 'Sæt animationen på pause', play: 'Afspil animationen', section: 'Tværsnit' },
  de: { live: 'Live-3D', drag: ' · ziehen zum Drehen', pause: 'Animation anhalten', play: 'Animation abspielen', section: 'Querschnitt' },
  sv: { live: 'Live 3D', drag: ' · dra för att vrida', pause: 'Pausa animationen', play: 'Spela animationen', section: 'Tvärsektion' },
  nb: { live: 'Live 3D', drag: ' · dra for å dreie', pause: 'Sett animasjonen på pause', play: 'Spill av animasjonen', section: 'Tverrprofil' },
  nl: { live: 'Live 3D', drag: ' · sleep om te draaien', pause: 'Animatie pauzeren', play: 'Animatie afspelen', section: 'Dwarsdoorsnede' },
  fr: { live: '3D en direct', drag: ' · faites glisser pour tourner', pause: 'Mettre l’animation en pause', play: 'Lancer l’animation', section: 'Profil en travers' },
  es: { live: '3D en directo', drag: ' · arrastra para girar', pause: 'Pausar la animación', play: 'Reproducir la animación', section: 'Sección transversal' },
};
const text = () => TEXT[document.documentElement.lang] || TEXT.en;

const CUT = 0xffd23f; // the cut outline, as in the app
const PLANE = 0x2cc8bc;
const INK = 0x0c2a30;
const AXIS = '#c8372d';
const SPEED_PASS = 48; // seconds for one pass over the stretch
const POSTER_STATION = 12205; // on the bridge: the poster shows this view, and the animation starts there
const VIEW = { x: 15, below: 7.5, above: 7.5 }; // the section card: ±15 m, 7.5 m below and above rail level

/** The baked scene: {header, pos (Int16, cm), triGroup, binStart, binTri, track1, track2 (Float32 xyz per metre)}. */
async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hero data: ${res.status}`);
  const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const n = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const at = 4 + n;
  const arr = (Type, [off, len]) => new Type(buf, at + off, len / Type.BYTES_PER_ELEMENT);
  const a = header.arrays;
  return {
    header,
    pos: arr(Int16Array, a.pos), triGroup: arr(Uint8Array, a.triGroup), binStart: arr(Uint32Array, a.binStart), binTri: arr(Uint32Array, a.binTri),
    track1: arr(Float32Array, a.track1), track2: arr(Float32Array, a.track2),
  };
}

const fmtStation = (st) => `${Math.floor(st / 1000)}+${(st % 1000).toFixed(1).padStart(5, '0')}`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Hatched faces for the inside of cut solids (their back faces), like the app's cut faces. */
function capMaterial(color, plane) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.62), side: THREE.BackSide, clippingPlanes: [plane] });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  if (mod(gl_FragCoord.x + gl_FragCoord.y, 9.0) < 1.6) gl_FragColor.rgb *= 0.55;');
  };
  return m;
}

export async function startHero(fig, { data }) {
  const d = await load(new URL(data, document.baseURI));
  const H = d.header, S = H.scale;

  // ------------------------------------------------------------------ renderer and scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const live = fig.querySelector('.hero-live');
  fig.insertBefore(canvas, live);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(INK, 70, 190);
  scene.add(new THREE.HemisphereLight(0xe6f4f2, 0x40524a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-0.6, 1.4, 0.8);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(36, 1.5, 0.5, 600);

  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const groups = H.buckets.map((b) => ({ ...b, stroke: `#${new THREE.Color(b.color).multiplyScalar(0.68).getHexString()}` }));
  for (const b of groups) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos.subarray(b.first * 9, (b.first + b.count) * 9), 3));
    g.computeBoundingSphere();
    const transparent = b.opacity < 0.99;
    const front = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: b.color, flatShading: true, side: transparent ? THREE.DoubleSide : THREE.FrontSide, transparent, opacity: b.opacity, depthWrite: !transparent, clippingPlanes: [plane] }));
    front.scale.setScalar(S);
    scene.add(front);
    if (!transparent) {
      const caps = new THREE.Mesh(g, capMaterial(b.color, plane));
      caps.scale.setScalar(S);
      scene.add(caps);
    }
  }

  // the section plane: a translucent sheet with a bright edge
  const sheetW = 64, sheetH = 15, sheetLift = 2.5; // from 5 m below rail level to 10 m above
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(sheetW, sheetH), new THREE.MeshBasicMaterial({ color: PLANE, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-sheetW / 2, -sheetH / 2, 0), new THREE.Vector3(sheetW / 2, -sheetH / 2, 0), new THREE.Vector3(sheetW / 2, sheetH / 2, 0), new THREE.Vector3(-sheetW / 2, sheetH / 2, 0),
  ]), new THREE.LineBasicMaterial({ color: PLANE, transparent: true, opacity: 0.55, fog: false }));
  sheet.add(edge);
  sheet.renderOrder = 5;
  scene.add(sheet);

  // the cut outline
  const cutGeo = new LineSegmentsGeometry();
  const cutMat = new LineMaterial({ color: CUT, linewidth: 2.2, depthTest: false, transparent: true });
  const cutLines = new LineSegments2(cutGeo, cutMat);
  cutLines.renderOrder = 10;
  cutLines.frustumCulled = false;
  scene.add(cutLines);

  // ------------------------------------------------------------------ the tracks
  const nT = d.track1.length / 3;
  const trackAt = (tr, s, out = new THREE.Vector3()) => {
    const f = clamp(s - H.trackFrom, 0, nT - 1.0001), i = Math.floor(f), k = f - i;
    return out.set(tr[i * 3] + (tr[i * 3 + 3] - tr[i * 3]) * k, tr[i * 3 + 1] + (tr[i * 3 + 4] - tr[i * 3 + 1]) * k, tr[i * 3 + 2] + (tr[i * 3 + 5] - tr[i * 3 + 2]) * k);
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const P = new THREE.Vector3(), T = new THREE.Vector3(), L = new THREE.Vector3(), tmp = new THREE.Vector3();
  const frameAt = (s) => {
    trackAt(d.track1, s, P);
    trackAt(d.track1, s + 1, T).sub(trackAt(d.track1, s - 1, tmp));
    T.y = 0; T.normalize();
    L.crossVectors(UP, T).normalize(); // left of the direction of stationing
  };
  /** Track 2 where the plane cuts it: its offset from track 1 (left positive). */
  const track2Offset = () => {
    let best = Infinity, u = null;
    for (let i = 0; i < nT; i++) {
      tmp.set(d.track2[i * 3], d.track2[i * 3 + 1], d.track2[i * 3 + 2]).sub(P);
      const along = Math.abs(tmp.dot(T));
      if (along < best) { best = along; u = tmp.dot(L); }
    }
    return best < 1.5 ? u : null;
  };

  // ------------------------------------------------------------------ the cut
  const segs = new Float32Array(60000 * 6); // world xyz pairs
  const segGroup = new Uint8Array(60000);
  let nSeg = 0;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  function cut(s) {
    nSeg = 0;
    const bin = Math.floor(s - H.s0);
    if (bin < 0 || bin >= H.nBins) return;
    const pos = d.pos;
    for (let j = d.binStart[bin]; j < d.binStart[bin + 1] && nSeg < 60000; j++) {
      const g = d.binTri[j], o = g * 9;
      pa.set(pos[o] * S, pos[o + 1] * S, pos[o + 2] * S);
      pb.set(pos[o + 3] * S, pos[o + 4] * S, pos[o + 5] * S);
      pc.set(pos[o + 6] * S, pos[o + 7] * S, pos[o + 8] * S);
      const da = tmp.subVectors(pa, P).dot(T), db = tmp.subVectors(pb, P).dot(T), dc = tmp.subVectors(pc, P).dot(T);
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;
      let k = 0;
      const put = (v1, d1, v2, d2) => {
        if ((d1 > 0) === (d2 > 0) || k >= 2) return;
        const tt = d1 / (d1 - d2), q = nSeg * 6 + k * 3;
        segs[q] = v1.x + (v2.x - v1.x) * tt; segs[q + 1] = v1.y + (v2.y - v1.y) * tt; segs[q + 2] = v1.z + (v2.z - v1.z) * tt;
        k++;
      };
      put(pa, da, pb, db); put(pb, db, pc, dc); put(pc, dc, pa, da);
      if (k === 2) { segGroup[nSeg] = d.triGroup[g]; nSeg++; }
    }
  }

  // ------------------------------------------------------------------ the overlay (card, chips, pause)
  const card = live.querySelector('.sec-card canvas');
  const cardSt = live.querySelector('.sec-st');
  const chip = live.querySelector('.st-chip');
  const pauseBtn = live.querySelector('.hero-pause');
  const ctx2 = card.getContext('2d');
  const names = H.tracks.map((t) => t.name);

  function drawCard(st) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = card.clientWidth, Hh = card.clientHeight;
    if (!W || !Hh) return;
    if (card.width !== Math.round(W * dpr)) { card.width = Math.round(W * dpr); card.height = Math.round(Hh * dpr); }
    const c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, Hh);
    const k = Math.min(W / (2 * VIEW.x), Hh / (VIEW.below + VIEW.above));
    const X = (u) => W / 2 - u * k; // looking along the stationing: left on the left
    const Y = (v) => Hh - (v + VIEW.below) * k;
    // the band of levels: a light grid every 2 m
    c.strokeStyle = 'rgba(12, 42, 48, 0.07)'; c.lineWidth = 1;
    c.beginPath();
    for (let v = -6; v <= 6; v += 2) { c.moveTo(0, Y(v)); c.lineTo(W, Y(v)); }
    c.stroke();
    // the cut, by colour
    c.lineWidth = 1.3; c.lineCap = 'round';
    for (let gi = 0; gi < groups.length; gi++) {
      let any = false;
      c.beginPath();
      for (let i = 0; i < nSeg; i++) {
        if (segGroup[i] !== gi) continue;
        const q = i * 6;
        const u1 = (segs[q] - P.x) * L.x + (segs[q + 2] - P.z) * L.z, v1 = segs[q + 1] - P.y;
        const u2 = (segs[q + 3] - P.x) * L.x + (segs[q + 5] - P.z) * L.z, v2 = segs[q + 4] - P.y;
        c.moveTo(X(u1), Y(v1)); c.lineTo(X(u2), Y(v2)); any = true;
      }
      if (any) { c.strokeStyle = groups[gi].stroke; c.stroke(); }
    }
    // the track axes (dash-dot, as in the app's drawings)
    c.setLineDash([7, 3, 1.5, 3]); c.strokeStyle = AXIS; c.lineWidth = 1; c.fillStyle = AXIS;
    c.font = '600 10px Inter, system-ui, sans-serif';
    const axes = [[0, names[0]]];
    const u2 = track2Offset();
    if (u2 !== null) axes.push([u2, names[1]]);
    const xs = axes.map(([u]) => X(u)), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    for (const [u, name] of axes) {
      const x = X(u);
      c.beginPath(); c.moveTo(x, Y(-VIEW.below + 1.2)); c.lineTo(x, Y(VIEW.above - 1.6)); c.stroke();
      // the name beside its axis, on the outer side, so two close tracks do not overlap
      c.textAlign = axes.length > 1 ? (x <= mid ? 'right' : 'left') : 'center';
      c.fillText(name, x + (axes.length > 1 ? (x <= mid ? -4 : 4) : 0), Y(VIEW.above - 1.1));
    }
    c.setLineDash([]);
    cardSt.textContent = fmtStation(st);
  }

  // ------------------------------------------------------------------ camera, motion, input
  const A = H.s0 + 25, B = H.s1 - 15; // the stretch the section travels
  const view = { yaw: 0.38, pitch: 0.4, dist: 25, lift: -2.5, ahead: 0 };
  const yaw0 = view.yaw, pitch0 = view.pitch;
  let yaw = yaw0, pitch = pitch0, phase = 0, lastInput = -1e9, playing = true, visible = true, last = 0, raf = 0;
  const phaseAt = (st) => { const k = clamp((st - H.station0 - A) / (B - A), 0, 1); return Math.acos(1 - 2 * k) / Math.PI; };
  phase = phaseAt(POSTER_STATION); // the poster's view: the live one takes over without a jump
  const sAt = (ph) => { const tri = ph % 2 < 1 ? ph % 2 : 2 - (ph % 2); return A + (B - A) * (0.5 - 0.5 * Math.cos(Math.PI * tri)); };

  function place(s) {
    frameAt(s);
    plane.setFromNormalAndCoplanarPoint(T, P);
    sheet.position.copy(P).addScaledVector(UP, sheetLift);
    sheet.lookAt(tmp.copy(sheet.position).add(T));
    const target = tmp.copy(P).addScaledVector(UP, view.lift).addScaledVector(T, view.ahead);
    const r = view.dist;
    camera.position.copy(target)
      .addScaledVector(T, -Math.cos(yaw) * Math.cos(pitch) * r)
      .addScaledVector(L, Math.sin(yaw) * Math.cos(pitch) * r)
      .addScaledVector(UP, Math.sin(pitch) * r);
    camera.lookAt(target);
  }

  function frame(now = performance.now()) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (playing && now - lastInput > 1200) phase += dt / SPEED_PASS; // phase 0 → 1: one pass, 1 → 2: back
    if (now - lastInput > 2500) { yaw += (yaw0 - yaw) * Math.min(1, dt * 1.2); pitch += (pitch0 - pitch) * Math.min(1, dt * 1.2); }
    const s = sAt(phase);
    place(s);
    cut(s);
    cutGeo.setPositions(segs.subarray(0, nSeg * 6));
    renderer.render(scene, camera);
    const st = H.station0 + s;
    drawCard(st);
    // the station chip at the top of the plane
    const p = tmp.copy(P).addScaledVector(UP, sheetLift + sheetH / 2 + 0.6).project(camera);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    chip.style.transform = `translate(${clamp(((p.x + 1) / 2) * cw, 50, cw - 50)}px, ${clamp(((1 - p.y) / 2) * ch, 30, ch - 10)}px) translate(-50%, -100%)`;
    chip.textContent = fmtStation(st);
    if ((playing || now - lastInput < 4000) && visible) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && visible) { last = 0; raf = requestAnimationFrame(frame); } };

  function resize() {
    const w = fig.clientWidth, h = fig.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, w < 600 ? 1.5 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.1 ? 46 : 36; // a phone's taller frame sees a little more
    camera.updateProjectionMatrix();
    cutMat.resolution.set(w * dpr, h * dpr);
    wake();
  }
  new ResizeObserver(resize).observe(fig);
  new IntersectionObserver((en) => { visible = en.some((e) => e.isIntersecting); if (visible) wake(); }, { threshold: 0.05 }).observe(fig);

  // drag to turn: a mouse turns and tilts; a finger only turns (up and down still scroll the page)
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' }; canvas.setPointerCapture(e.pointerId); lastInput = performance.now(); fig.classList.add('dragging'); wake(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw = clamp(yaw - (e.clientX - drag.x) * 0.006, -1.5, 1.5);
    if (!drag.touch) pitch = clamp(pitch + (e.clientY - drag.y) * 0.004, 0.08, 1.2);
    drag.x = e.clientX; drag.y = e.clientY;
    lastInput = performance.now();
    wake();
  });
  const endDrag = () => { drag = null; fig.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  const labelPause = () => {
    const tx = text();
    pauseBtn.setAttribute('aria-label', playing ? tx.pause : tx.play);
    pauseBtn.title = pauseBtn.getAttribute('aria-label');
    pauseBtn.setAttribute('aria-pressed', String(!playing));
    pauseBtn.classList.toggle('paused', !playing);
    live.querySelector('.live-text').textContent = tx.live;
    live.querySelector('.live-drag').textContent = tx.drag;
    live.querySelector('.sec-title').textContent = tx.section;
  };
  pauseBtn.addEventListener('click', () => { playing = !playing; labelPause(); wake(); });
  new MutationObserver(labelPause).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  labelPause();

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fig.classList.remove('is-live'); cancelAnimationFrame(raf); raf = 0; visible = false; });

  resize();
  frame();
  live.hidden = false;
  requestAnimationFrame(() => fig.classList.add('is-live'));
  // for the tests and the poster (scripts/record-about-clips.cjs): stop, and go to a station
  const api = {
    pause: () => { playing = false; labelPause(); },
    station: (st) => { phase = phaseAt(st); last = 0; frame(); },
    /** The poster (public/about/img/hero-3d.webp): this view as an image, the background transparent. */
    snapshot: (type = 'image/webp', q = 0.9) => { last = 0; frame(); return canvas.toDataURL(type, q); },
    segments: () => nSeg,
    view: (v) => { Object.assign(view, v); yaw = view.yaw; pitch = view.pitch; last = 0; frame(); },
  };
  fig.hero = api;
  return api;
}
