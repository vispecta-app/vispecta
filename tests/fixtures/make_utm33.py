# Test files for coordinate systems (#107): parts of the railway sample (ETRS89 / UTM 32N) moved into
# ETRS89 / UTM 33N. Vispecta should convert them back on top of the originals.
#   alignment-utm33.ifc: 01-Alignment.ifc with its IfcMapConversion in UTM 33N (the origin converted
#                        exactly, rotation and scale from the local convergence and scale factor)
#   survey-utm33.las:    every 8th point of 10-Survey.laz converted point by point, with a WKT record
import re, sys, numpy as np, laspy
from pyproj import Transformer
src = sys.argv[1]  # public/samples/double-track-railway
t = Transformer.from_crs(25832, 25833, always_xy=True)
txt = open(f'{src}/01-Alignment.ifc', encoding='utf-8').read()
m = re.search(r'IFCMAPCONVERSION\((#\d+),(#\d+),([-\d.E+]+),([-\d.E+]+),([-\d.E+]+),([-\d.E+]+),([-\d.E+]+),([^)]*)\)', txt)
E, N = float(m.group(3)), float(m.group(4))
a, b = float(m.group(6)), float(m.group(7))
e2, n2 = t.transform(E, N)
# the local rotation and scale: two points 100 m apart along the IFC x axis
ex, nx = t.transform(E + 100 * a, N + 100 * b)
dx, dy = ex - e2, nx - n2
k = (dx * dx + dy * dy) ** 0.5 / 100
na, nb = dx / (k * 100), dy / (k * 100)
# the local IFC coordinates are moved as well (by D), so that the file only lands right through its
# map conversion: the root placements move by D and the conversion takes it back
D = (-500.0, 300.0)
for rp in re.findall(r'IFCLOCALPLACEMENT\(\$,(#\d+)\)', txt):
    ap = re.search(re.escape(rp) + r'=IFCAXIS2PLACEMENT3D\((#\d+),', txt).group(1)
    pt = re.search(re.escape(ap) + r'=IFCCARTESIANPOINT\(\(([-\d.E+]+),([-\d.E+]+),([-\d.E+]+)\)\)', txt)
    x, y, z = (float(v) for v in pt.groups())
    txt = txt.replace(pt.group(0), f'{ap}=IFCCARTESIANPOINT(({x + D[0]:.4f},{y + D[1]:.4f},{z}))')
e2 -= k * (na * D[0] - nb * D[1])
n2 -= k * (nb * D[0] + na * D[1])
conv = f'IFCMAPCONVERSION({m.group(1)},{m.group(2)},{e2:.4f},{n2:.4f},{m.group(5)},{na:.12f},{nb:.12f},{k:.12f})'
txt = txt.replace(m.group(0), conv)
txt = re.sub(r"IFCPROJECTEDCRS\('EPSG:25832','ETRS89 / UTM zone 32N'", "IFCPROJECTEDCRS('EPSG:25833','ETRS89 / UTM zone 33N'", txt)
txt = txt.replace("'01-Alignment'", "'01-Alignment-UTM33'")
open('alignment-utm33.ifc', 'w', encoding='utf-8').write(txt)
print(conv)
f = laspy.read(f'{src}/10-Survey.laz')
sel = slice(None, None, 8)
x, y = t.transform(np.asarray(f.x)[sel], np.asarray(f.y)[sel])
h = laspy.LasHeader(point_format=6, version='1.4')
h.scales = [0.001, 0.001, 0.001]
h.offsets = [round(float(np.min(x)), -3), round(float(np.min(y)), -3), 0]
from pyproj import CRS
h.add_crs(CRS.from_epsg(25833))
o = laspy.LasData(h)
o.x, o.y, o.z = x, y, np.asarray(f.z)[sel]
o.classification = np.asarray(f.classification)[sel]
o.intensity = np.asarray(f.intensity)[sel]
o.write('survey-utm33.las')
print(len(x), 'points', x[0], y[0])
