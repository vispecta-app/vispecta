# Two terrestrial "scans" of a box room with poses, written with pye57 (libE57Format): a test fixture for #52.
import sys, numpy as np, pye57
rng = np.random.default_rng(1)
dst = sys.argv[1]
e = pye57.E57(dst, mode='w')
def scan(n, rot, tr):
    # points on a 10 x 6 m floor (z = 0) and a 3 m wall at y = 3, in the scan's own frame
    a = rng.uniform(-5, 5, n); b = rng.uniform(-3, 3, n)
    wall = rng.random(n) < 0.3
    x = a; y = np.where(wall, 3.0, b); z = np.where(wall, rng.uniform(0, 3, n), 0.0)
    return {'cartesianX': x, 'cartesianY': y, 'cartesianZ': z,
            'intensity': rng.uniform(0, 1, n),
            'colorRed': np.where(wall, 200, 90).astype(np.uint8), 'colorGreen': np.full(n, 120, np.uint8), 'colorBlue': np.where(wall, 60, 200).astype(np.uint8)}
# scan 1: at (100, 200, 10), no rotation; scan 2: at (110, 200, 10), turned 90° about z
e.write_scan_raw(scan(30000, None, None), name='Scan 1', rotation=np.array([1.0, 0, 0, 0]), translation=np.array([100.0, 200.0, 10.0]))
c = np.cos(np.pi / 4); s = np.sin(np.pi / 4)
e.write_scan_raw(scan(20000, None, None), name='Scan 2', rotation=np.array([c, 0, 0, s]), translation=np.array([110.0, 200.0, 10.0]))
e.close()
print('ok')
