# Test files for the smoke test

| File | What | Made with |
|---|---|---|
| `survey.copc.laz` | The survey of the railway sample (`10-Survey.laz`) as COPC: 181 960 points in 255 octree nodes, point format 7 | `make_copc.py` (copclib) |
| `two-scans.e57` | Two scans of a 10 × 6 m room, at (100, 200, 10) and at (110, 200, 10) turned 90°, with intensity and colour | `make_e57.py` (pye57) |
| `spherical.e57` | One scan in spherical coordinates, the range as a 20-bit scaled integer, about 10 % of the points marked invalid | `make_e57_sph.py` (libE57Format through pye57) |

```
python -m venv .venv && .venv/bin/pip install copclib pye57 laspy lazrs numpy
.venv/bin/python make_copc.py ../../public/samples/double-track-railway/10-Survey.laz survey.copc.laz 5
.venv/bin/python make_e57.py two-scans.e57
.venv/bin/python make_e57_sph.py spherical.e57 20000
```
