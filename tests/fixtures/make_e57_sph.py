# A spherical, scaled-integer E57 (several packets, invalid points) written with libE57Format through pye57.
import sys, numpy as np
from pye57 import libe57
from pye57.libe57 import (ImageFile, StructureNode, VectorNode, CompressedVectorNode, ScaledIntegerNode, IntegerNode, FloatNode, StringNode, SourceDestBuffer)
dst = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 200000
rng = np.random.default_rng(2)
rangev = rng.uniform(2, 40, n)
az = rng.uniform(-np.pi, np.pi, n)
el = rng.uniform(-0.5, 0.5, n)
inten = rng.integers(0, 4096, n).astype(np.int64)
inv = (rng.random(n) < 0.1).astype(np.int64) * 2
f = ImageFile(dst, 'w')
root = f.root()
root.set('formatName', StringNode(f, 'ASTM E57 3D Imaging Data File'))
root.set('guid', StringNode(f, '{test}'))
d3 = VectorNode(f, True)
root.set('data3D', d3)
scan = StructureNode(f)
scan.set('guid', StringNode(f, '{scan}'))
scan.set('name', StringNode(f, 'Spherical'))
pose = StructureNode(f)
rot = StructureNode(f); rot.set('w', FloatNode(f, 1.0)); rot.set('x', FloatNode(f, 0.0)); rot.set('y', FloatNode(f, 0.0)); rot.set('z', FloatNode(f, 0.0))
tr = StructureNode(f); tr.set('x', FloatNode(f, 500.0)); tr.set('y', FloatNode(f, 600.0)); tr.set('z', FloatNode(f, 5.0))
pose.set('rotation', rot); pose.set('translation', tr)
scan.set('pose', pose)
proto = StructureNode(f)
proto.set('sphericalRange', ScaledIntegerNode(f, 0, 0, 1000000, 0.0001, 0.0))
proto.set('sphericalAzimuth', FloatNode(f, 0.0, libe57.FloatPrecision.E57_DOUBLE, -4.0, 4.0))
proto.set('sphericalElevation', FloatNode(f, 0.0, libe57.FloatPrecision.E57_SINGLE, -2.0, 2.0))
proto.set('intensity', IntegerNode(f, 0, 0, 4095))
proto.set('sphericalInvalidState', IntegerNode(f, 0, 0, 2))
codecs = VectorNode(f, True)
pts = CompressedVectorNode(f, proto, codecs)
scan.set('points', pts)
d3.append(scan)
raw = np.round(rangev / 0.0001).astype(np.int64)
rangeq = raw * 0.0001
bufs = libe57.VectorSourceDestBuffer()
arrs = {'sphericalRange': rangeq.astype(np.float64), 'sphericalAzimuth': az.astype(np.float64), 'sphericalElevation': el.astype(np.float32).astype(np.float64), 'intensity': inten.astype(np.uint16), 'sphericalInvalidState': inv.astype(np.uint16)}
for k, a in arrs.items():
    a = np.ascontiguousarray(a)
    bufs.append(SourceDestBuffer(f, k, a, n, True, True))
w = pts.writer(bufs)
w.write(n)
w.close()
f.close()
el32 = arrs['sphericalElevation']
X = rangeq * np.cos(el32) * np.cos(az) + 500; Y = rangeq * np.cos(el32) * np.sin(az) + 600; Z = rangeq * np.sin(el32) + 5
ok = inv == 0
print('valid', ok.sum(), 'first valid', X[ok][0], Y[ok][0], Z[ok][0], 'meanX', X[ok].mean())
np.save(dst + '.npy', np.stack([X, Y, Z, inv], 1))
