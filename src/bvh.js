// The picking index of a bucket (a bounding volume hierarchy over its triangles, three-mesh-bvh).
// It is built in the IFC worker with the geometry (code review, package C), so the main thread
// does not stop for it (about 0.25 µs per triangle: seconds for a large model), and it is kept in
// the geometry cache with the geometry. Only when there is none (geometry built on the main thread,
// or positions moved by a coordinate conversion) is it built on the main thread, on first use.
//
// 'indirect': the tree has an index of its own, the geometry's index stays as it is (the buckets'
// index ranges per element depend on it).
import { BufferAttribute, BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export const BVH_OPTIONS = { indirect: true, targetLeafSize: 12 };

/** A BVH for positions + index, serialised: {roots: [ArrayBuffer], indirect: Uint16Array|Uint32Array}. */
export function buildBvhData(positions, index) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setIndex(new BufferAttribute(index, 1));
  const s = MeshBVH.serialize(new MeshBVH(g, BVH_OPTIONS), { cloneBuffers: false });
  return { roots: s.roots, indirect: s.indirectBuffer };
}

/** The BVH of a geometry: from data built earlier when there is any, else built now. */
export function bvhFor(geometry, data) {
  if (data?.roots?.length && data.indirect) {
    return MeshBVH.deserialize({ version: 1, roots: data.roots, indirectBuffer: data.indirect, index: null }, geometry, { setIndex: false, indirect: true });
  }
  return new MeshBVH(geometry, BVH_OPTIONS);
}
