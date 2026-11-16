// Section caps (#37): real cut faces drawn with the stencil buffer.
//
// For every opaque model mesh and every enabled section plane:
//   1. the mesh is drawn into the stencil buffer only, clipped by that plane alone and depth-tested
//      against the scene: back faces +1, then front faces −1 (both clamped at 0). Only faces between
//      the plane and the first visible surface count. Where the plane lies inside a solid of the
//      mesh, the solid's far side (a back face, not drawn in the scene, see below) is counted and
//      the stencil is 1. Solids behind the plane – trees, buildings – add nothing: their faces are
//      either the visible surface or behind it.
//   2. a large quad in the plane (clipped by the other planes) is drawn where the stencil is not 0,
//      in a darker tone of the mesh colour, optionally hatched in the plane's own axes, and the
//      stencil is cleared again.
// The cut faces lie exactly in the plane: they no longer z-fight with touching solids, and the
// hatch sticks to them while the camera moves. While caps are shown, the model materials discard
// their back faces (see installSectionFill in model.js), so only the caps show the inside.
// Both passes are pulled slightly towards the camera (polygon offset), so faces that coincide with
// the visible surface always count: the far side of a cut solid that touches another solid still
// counts (+1), and a surface of zero thickness – a front and a back face in the same place – adds
// +1 −1 = 0 instead of showing a cap.
//
// The helper meshes are children of the model meshes: they move, hide and disappear with them and
// share their geometry (and so the elements currently shown). Their materials do their own
// clipping in the shader, so the renderer's global clipping planes don't apply to them.
import * as THREE from 'three';

const CAP_ORDER = 1000; // after the model meshes (0 / 5), before overlays (OVERLAY_ORDER)
export const OVERLAY_ORDER = 1e7;
const MAX_PLANES = 6;

const CLIP_GLSL = `
uniform vec4 uPlanes[${MAX_PLANES}];
uniform int uPlaneCount;
varying vec3 vWorld;
bool clippedAway() {
  for (int i = 0; i < ${MAX_PLANES}; i++) {
    if (i >= uPlaneCount) break;
    if (dot(uPlanes[i].xyz, vWorld) + uPlanes[i].w < 0.0) return true;
  }
  return false;
}`;

// same transform as the model materials (modelViewMatrix), so depths compare exactly
const VERT = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function stencilMaterial(side) {
  const back = side === THREE.BackSide;
  return new THREE.ShaderMaterial({
    uniforms: { uPlanes: { value: Array.from({ length: MAX_PLANES }, () => new THREE.Vector4()) }, uPlaneCount: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `${CLIP_GLSL}\nvoid main() { if (clippedAway()) discard; gl_FragColor = vec4(0.0); }`,
    side,
    colorWrite: false,
    depthWrite: false,
    depthTest: true,
    depthFunc: THREE.LessEqualDepth,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: back ? THREE.IncrementStencilOp : THREE.DecrementStencilOp,
  });
}

function capMaterial(hatch) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPlanes: { value: Array.from({ length: MAX_PLANES }, () => new THREE.Vector4()) },
      uPlaneCount: { value: 0 },
      uColor: { value: new THREE.Color() },
      uNormal: { value: new THREE.Vector3(0, 0, 1) },
      uHatch: hatch.on,
      uHatchSize: hatch.size,
    },
    vertexShader: VERT,
    fragmentShader: `${CLIP_GLSL}
uniform vec3 uColor;
uniform vec3 uNormal;
uniform float uHatch;
uniform vec2 uHatchSize;
void main() {
  if (clippedAway()) discard;
  vec3 col = uColor * 0.72;
  if (uHatch > 0.5) {
    vec3 a = abs(uNormal.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 u = normalize(cross(a, uNormal));
    vec3 v = cross(uNormal, u);
    float k = dot(vWorld, u) + dot(vWorld, v);    // diagonal lines in the plane
    float perPx = max(length(vec2(dFdx(k), dFdy(k))), 1e-9);
    float lod = exp2(ceil(log2(uHatchSize.x * perPx)));
    if (fract(k / lod) < uHatchSize.y * perPx / lod) col = uColor * 0.34;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

const noRaycast = () => {};
const QUAD = new THREE.PlaneGeometry(1, 1);

export class SectionCaps {
  /**
   * @param viewer  the Viewer (models, planes, renderer, sceneRadius)
   * @param hatch   shared uniforms { on: {value}, size: {value: Vector2} }
   */
  constructor(viewer, hatch) {
    this.viewer = viewer;
    this.hatch = hatch;
    this.on = false;
    this.attached = new Set(); // model meshes that carry cap helpers
  }

  /** Called before every render: keeps the helpers in step with meshes, planes and colours. */
  update() {
    const v = this.viewer;
    const planes = this.on ? v.cuttingPlanes().slice(0, MAX_PLANES) : [];
    const seen = new Set();
    if (planes.length) {
      const R = Math.max(v.sceneRadius * 4, 50);
      const center = v.sceneBox({ visibleOnly: false }).getCenter(new THREE.Vector3());
      // one quad transform per plane, shared by all caps of that plane (same depth everywhere)
      const quads = planes.map((p) => {
        const n = p.plane.normal;
        const at = p.plane.projectPoint(center, new THREE.Vector3());
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        return new THREE.Matrix4().compose(at, q, new THREE.Vector3(R, R, 1));
      });
      let slot = 0;
      for (const model of v.models) {
        for (const mesh of model.group.children) {
          if (!mesh.isMesh || !mesh.material?.userData?.sectionFill) continue;
          if (mesh.material.transparent || !mesh.visible) { this.#detach(mesh); continue; }
          seen.add(mesh);
          this.#sync(mesh, planes, quads, slot);
          slot += planes.length;
        }
      }
    }
    for (const mesh of this.attached) if (!seen.has(mesh)) this.#detach(mesh);
  }

  #sync(mesh, planes, quads, slot) {
    let c = mesh.userData.caps;
    if (!c) {
      c = mesh.userData.caps = { group: new THREE.Group(), sets: [] };
      c.group.name = 'section caps';
      mesh.add(c.group);
      this.attached.add(mesh);
    }
    while (c.sets.length < planes.length) {
      const back = new THREE.Mesh(mesh.geometry, stencilMaterial(THREE.BackSide));
      const front = new THREE.Mesh(mesh.geometry, stencilMaterial(THREE.FrontSide));
      const cap = new THREE.Mesh(QUAD, capMaterial(this.hatch));
      cap.matrixAutoUpdate = false;
      cap.onAfterRender = (renderer) => renderer.clearStencil();
      for (const o of [back, front, cap]) { o.raycast = noRaycast; o.frustumCulled = false; c.group.add(o); }
      c.sets.push({ back, front, cap });
    }
    while (c.sets.length > planes.length) {
      const s = c.sets.pop();
      for (const o of [s.back, s.front, s.cap]) { c.group.remove(o); o.material.dispose(); }
    }
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const color = mesh.material.color;
    planes.forEach((p, j) => {
      const s = c.sets[j];
      if (s.back.geometry !== mesh.geometry) { s.back.geometry = mesh.geometry; s.front.geometry = mesh.geometry; }
      const order = CAP_ORDER + (slot + j) * 3;
      s.back.renderOrder = order; s.front.renderOrder = order + 1; s.cap.renderOrder = order + 2;
      // stencil passes: clipped by this plane only; cap: clipped by the others
      setPlanes(s.back.material, [p]);
      setPlanes(s.front.material, [p]);
      setPlanes(s.cap.material, planes.filter((x) => x !== p));
      s.cap.material.uniforms.uColor.value.copy(color);
      s.cap.material.uniforms.uNormal.value.copy(p.plane.normal);
      // the quad in the plane, in the mesh's own coordinates (it is a child of the mesh)
      s.cap.matrix.multiplyMatrices(inv, quads[j]);
      s.cap.matrixWorldNeedsUpdate = true;
    });
  }

  #detach(mesh) {
    const c = mesh.userData.caps;
    if (!c) return;
    mesh.remove(c.group);
    for (const s of c.sets) for (const o of [s.back, s.front, s.cap]) o.material.dispose();
    delete mesh.userData.caps;
    this.attached.delete(mesh);
  }

  /** Removes all helpers (e.g. when caps are switched off). */
  clear() { for (const mesh of [...this.attached]) this.#detach(mesh); }
}

function setPlanes(material, list) {
  const u = material.uniforms;
  list.forEach((p, i) => u.uPlanes.value[i].set(p.plane.normal.x, p.plane.normal.y, p.plane.normal.z, p.plane.constant));
  u.uPlaneCount.value = list.length;
}
