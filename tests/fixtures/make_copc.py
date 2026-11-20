# Writes a COPC file from a LAS/LAZ file with copclib (a test fixture for #52).
import sys, numpy as np, laspy, copclib as c
src, dst = sys.argv[1], sys.argv[2]
f = laspy.read(src)
X, Y, Z = np.asarray(f.x), np.asarray(f.y), np.asarray(f.z)
n = len(X)
mn = np.array([X.min(), Y.min(), Z.min()]); mx = np.array([X.max(), Y.max(), Z.max()])
half = (mx - mn).max() / 2 * 1.0001
ctr = (mn + mx) / 2
cube0 = ctr - half
scale = 0.001; off = np.round(ctr)
rec = np.zeros(n, dtype=[('X','<i4'),('Y','<i4'),('Z','<i4'),('i','<u2'),('ret','u1'),('fl','u1'),('cls','u1'),('ud','u1'),('sa','<i2'),('ps','<u2'),('t','<f8'),('r','<u2'),('g','<u2'),('b','<u2')])
rec['X'] = np.round((X - off[0]) / scale); rec['Y'] = np.round((Y - off[1]) / scale); rec['Z'] = np.round((Z - off[2]) / scale)
rec['i'] = f.intensity; rec['ret'] = 0x11; rec['cls'] = f.classification; rec['t'] = np.arange(n)
rec['r'] = f.red; rec['g'] = f.green; rec['b'] = f.blue
cfg = c.CopcConfigWriter(7, c.Vector3(scale, scale, scale), c.Vector3(*off))
h = cfg.las_header
h.min = c.Vector3(*mn); h.max = c.Vector3(*mx)
info = cfg.copc_info
info.center_x, info.center_y, info.center_z = map(float, ctr); info.halfsize = float(half)
RES = 64
info.spacing = float(2 * half / RES)
w = c.FileWriter(dst, cfg)
left = np.arange(n)
maxd = int(sys.argv[3]) if len(sys.argv) > 3 else 5
nodes = 0
for d in range(maxd + 1):
    size = 2 * half / 2 ** d
    k = np.floor((np.stack([X[left], Y[left], Z[left]], 1) - cube0) / size).astype(np.int64)
    k = np.clip(k, 0, 2 ** d - 1)
    if d < maxd:
        cell = size / RES
        sub = np.floor((np.stack([X[left], Y[left], Z[left]], 1) - cube0) / cell).astype(np.int64)
        key = sub[:, 0] * (1 << 42) + sub[:, 1] * (1 << 21) + sub[:, 2]
        _, first = np.unique(key, return_index=True)
        take = np.zeros(len(left), bool); take[first] = True
    else:
        take = np.ones(len(left), bool)
    sel, ks = left[take], k[take]
    nk = ks[:, 0] * (1 << 42) + ks[:, 1] * (1 << 21) + ks[:, 2]
    for u in np.unique(nk):
        m = nk == u
        kx, ky, kz = ks[m][0]
        data = rec[sel[m]].tobytes()
        w.AddNode(c.VoxelKey(d, int(kx), int(ky), int(kz)), c.VectorChar(np.frombuffer(data, dtype=np.int8)))
        nodes += 1
    left = left[~take]
    if not len(left): break

w.Close()
print('nodes', nodes, 'points', n)
