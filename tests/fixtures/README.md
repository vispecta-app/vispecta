# Test files for the smoke test

| File | What | Made with |
|---|---|---|
| `survey.copc.laz` | The survey of the railway sample (`10-Survey.laz`) as COPC: 181 960 points in 255 octree nodes, point format 7 | `make_copc.py` (copclib) |
| `two-scans.e57` | Two scans of a 10 × 6 m room, at (100, 200, 10) and at (110, 200, 10) turned 90°, with intensity and colour | `make_e57.py` (pye57) |
| `alignment-utm33.ifc` | `01-Alignment.ifc` of the railway sample with its map conversion in ETRS89 / UTM 33N, and its local coordinates moved by 583 m | `make_utm33.py` (pyproj) |
| `survey-utm33.las` | Every 8th point of `10-Survey.laz`, converted into UTM 33N, with a WKT record | `make_utm33.py` (pyproj, laspy) |
| `spherical.e57` | One scan in spherical coordinates, the range as a 20-bit scaled integer, about 10 % of the points marked invalid | `make_e57_sph.py` (libE57Format through pye57) |
| `example_2000.dwg` | A DWG 2000 drawing with layers, blocks, arcs, polylines, texts and dimensions (LibreDWG's test data, GPL-3.0-or-later) | [LibreDWG](https://github.com/LibreDWG/libredwg/tree/master/test/test-data) |

```
python -m venv .venv && .venv/bin/pip install copclib pye57 laspy lazrs numpy pyproj
.venv/bin/python make_copc.py ../../public/samples/double-track-railway/10-Survey.laz survey.copc.laz 5
.venv/bin/python make_e57.py two-scans.e57
.venv/bin/python make_e57_sph.py spherical.e57 20000
.venv/bin/python make_utm33.py ../../public/samples/double-track-railway
```
