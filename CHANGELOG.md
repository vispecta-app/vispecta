# Changelog

Changes per release, with the GitHub issue each one belongs to. Releases and their full notes:
https://github.com/vispecta-app/vispecta/releases

## Unreleased

### Added
- **Point clouds load faster and are lighter to navigate:** fewer points are drawn while the camera
  moves, and *Points shown* (100/50/25/10 %) on the card. ([#27](https://github.com/vispecta-app/vispecta/issues/27))
- **Stationing format.** Five formats – `12+345.678`, `123+45.68` (100 m stations), `12.346`,
  `km 12,346`, `12345.678 m` – one setting for the whole app, remembered and saved in projects;
  typing accepts every format. ([#29](https://github.com/vispecta-app/vispecta/issues/29))
- **Warning when models lie far apart** (default > 1000 m, adjustable), compared in map
  coordinates when georeferenced, with the likely cause and ⚠ on the model card.
  ([#28](https://github.com/vispecta-app/vispecta/issues/28))
- **Offset lines and corridors** along alignments and drawn lines: lines in 3D and in station
  sections/drawings, and the elements inside or crossing the band – colour, select, isolate,
  CSV. ([#26](https://github.com/vispecta-app/vispecta/issues/26))
- **Point clouds (steps 1–2).** Load LAS, LAZ, XYZ/CSV/TXT/PTS and PLY next to the IFC models,
  thinned in a worker to a point budget and placed by the models' coordinates or map coordinates
  (IfcMapConversion). Colour by RGB, classification, intensity or elevation, filter by class,
  point size. Section planes clip the cloud; the points near a plane show as dots in the section
  window and in PDF/SVG/DXF drawings, and along the path in longitudinal profiles; measuring
  snaps to points. ([#27](https://github.com/vispecta-app/vispecta/issues/27))
- **A second sample: Chesapeake Bay Bridge-Tunnel.** The start screen now offers two samples.
  The new one is a synthetic 31 km bridge–tunnel corridor from buildingSMART's community samples
  (MIT; geometry from OpenStreetMap, ODbL) with two alignments and 17,553 elements – 26 MB,
  about 5 MB to download. It opens at Island #1 (station 6+083).
  ([#41](https://github.com/vispecta-app/vispecta/issues/41))

## v0.0.3

### Fixed
- **Section window left an empty `about:blank` window behind** when it was docked back from its
  own browser window. Docking now closes the popup window; the popup also closes when the main
  page goes away. ([#38](https://github.com/vispecta-app/vispecta/issues/38))
- **IDS colours could not be cleared from the main view.** *Original colours* in the model
  browser now also removes colours given to single elements – IDS results, filters, smart views
  and BCF viewpoints – and ends a comparison. ([#40](https://github.com/vispecta-app/vispecta/issues/40))
- **Cut faces flickered while navigating.** They were the back faces of the cut solids, drawn at
  their own depth with a hatch in screen space: the hatch crawled over them, and where a cut solid
  touched another one the two z-fought. Cut faces are now real caps, drawn with the stencil buffer
  exactly in the section plane (`src/caps.js`), in a darker tone of the element colour, with the
  hatch fixed in the plane's own axes – also with several planes and in orthographic view.
  ([#37](https://github.com/vispecta-app/vispecta/issues/37))

### Added
- **Reset view** in the *View* menu (Shift+R): original colours, no element transparency,
  everything shown, no X-ray, storey or selection, zoom to all. Models, groups, issues and IDS
  results stay. **Reset all** also removes section planes and measurements.
  ([#40](https://github.com/vispecta-app/vispecta/issues/40))
- Sample models on the start screen with two alignments, *Track* and *Road*
  ([#35](https://github.com/vispecta-app/vispecta/pull/35),
  [#36](https://github.com/vispecta-app/vispecta/pull/36)).

## v0.0.2

See the [release notes](https://github.com/vispecta-app/vispecta/releases).
