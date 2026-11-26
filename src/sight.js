// Sight of a signal or sign along a track (#136): from the driver's eye, every few metres on the
// approach, rays to points of the target. Where something of the models is in the way (a mast, a
// bridge pier, a cutting, a tree), the target is hidden there; the first element hit is the blocker.
// The sighting distance is how far before the target it is seen without a break.
//
// The eye: on the alignment (top of rail), at a height above it and an offset across (left +, as in
// IFC), looking in the direction of travel. Hidden elements and models do not block (hide vegetation
// to see what cutting it back would give); the classes left out never do.
import * as THREE from 'three';
import { pointAt, heightAt, project } from './alignment.js';

export const SIGHT_EXCLUDE = 'IfcSpace, IfcOpeningElement, IfcVirtualElement, IfcAnnotation, IfcAlignment, IfcReferent, IfcGrid';

/** Points of the target to look at: the middle of its box and four around it (world coordinates). */
export function targetPoints(box) {
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).multiplyScalar(0.3);
  return [c, c.clone().add(new THREE.Vector3(0, s.y, 0)), c.clone().add(new THREE.Vector3(0, -s.y, 0)), c.clone().add(new THREE.Vector3(s.x, 0, s.z)), c.clone().add(new THREE.Vector3(-s.x, 0, -s.z))];
}

/**
 * opts: {targets: [{model, id}], eye (m above the profile), offset (m, left +), direction (+1: increasing
 *        stations, -1: decreasing), range (m before the target), near (m: closest point looked from),
 *        step (m), required (m), exclude (Set of upper case class names), onProgress}
 * Returns {sTarget, station, samples: [{s, station, dist, seen (0..1), blocker: {model, id} | null}],
 *          sighting (m), ok, blockers: [{model, id, from, to, n}]}.
 */
export async function sightCheck(viewer, al, opts) {
  const { targets, eye = 2.2, offset = 0, direction = 1, range = 500, near = 10, step = 5, required = 0, exclude = new Set(), onProgress = () => {} } = opts;
  const box = new THREE.Box3();
  for (const t of targets) box.union(t.model.getBox([t.id]));
  if (box.isEmpty()) throw new Error('the target has no geometry');
  const pts = targetPoints(box);
  const ci = viewer.toIfc(box.getCenter(new THREE.Vector3()));
  const pr = project(al, { x: ci.x, y: ci.y, z: ci.z });
  const sT = pr.s;
  const isTarget = new Set(targets.map((t) => `${t.model.uid}:${t.id}`));
  // what can block: visible models, their pick meshes
  const objs = [];
  for (const m of viewer.models) if (m.visible) objs.push(...m.pickTargets());
  const rc = new THREE.Raycaster();
  const planes = viewer.cuttingPlanes?.().map((p) => p.plane) || [];
  const samples = [];
  const n = Math.floor((range - near) / step) + 1;
  for (let k = 0; k < n; k++) {
    const d = near + k * step;
    const s = sT - direction * d;
    if (s < 0 || s > al.length) continue;
    const p = pointAt(al, s), z = heightAt(al, s) ?? 0;
    const left = [-p.dy, p.dx];
    const E = viewer.fromIfc(p.x + left[0] * offset, p.y + left[1] * offset, z + eye);
    let seen = 0, blocker = null;
    for (const q of pts) {
      const dir = q.clone().sub(E), L = dir.length();
      rc.set(E, dir.normalize());
      rc.far = L - 0.05;
      let hit = null;
      for (const h of rc.intersectObjects(objs, false)) {
        if (planes.some((pl) => pl.distanceToPoint(h.point) < -1e-6)) continue; // cut away by a section
        const { model } = h.object.userData;
        const id = model.idFromHit(h.object, h.faceIndex);
        if (model.hidden.has(id) || isTarget.has(`${model.uid}:${id}`)) continue;
        if (exclude.has(String(model.typeName(id) || '').toUpperCase())) continue;
        hit = { model, id };
        break;
      }
      if (hit) blocker ||= hit; else seen++;
    }
    samples.push({ s, station: al.station0 + s, dist: d, seen: seen / pts.length, blocker, eye: E });
    if (k % 10 === 0) { onProgress(k / n); await new Promise((r) => setTimeout(r, 0)); }
  }
  // sighting distance: seen (any part of the target) from the nearest point outwards without a break
  let sighting = 0;
  for (const x of samples) { if (x.seen > 0) sighting = x.dist; else break; }
  // blockers, with the distances where each hides the target
  const bl = new Map();
  for (const x of samples) {
    if (!x.blocker) continue;
    const key = `${x.blocker.model.uid}:${x.blocker.id}`;
    const b = bl.get(key) || { model: x.blocker.model, id: x.blocker.id, from: x.dist, to: x.dist, n: 0, full: 0 };
    b.from = Math.min(b.from, x.dist); b.to = Math.max(b.to, x.dist); b.n++; if (x.seen === 0) b.full++;
    bl.set(key, b);
  }
  return {
    sTarget: sT, station: al.station0 + sT, offsetTarget: pr.offset, samples, sighting, required,
    ok: required > 0 ? sighting >= required - 1e-9 : null, blockers: [...bl.values()].sort((a, b) => a.from - b.from),
  };
}
