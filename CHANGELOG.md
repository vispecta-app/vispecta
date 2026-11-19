# Changelog

Changes per release, with the GitHub issue each one belongs to. Releases and their full notes:
https://github.com/vispecta-app/vispecta/releases

## Unreleased

### Added
- **Contours on terrain** ([#92](https://github.com/vispecta-app/vispecta/issues/92)): choose *Auto* or an
  interval (0.25 – 5 m) on the terrain's card. Every 5th contour is thicker. Contours show in 3D and in plan
  drawings, with the height on the thick ones (PDF, SVG, DXF layer `CONTOURS`), and are saved in the project.
- **Cut and fill** ([#92](https://github.com/vispecta-app/vispecta/issues/92)): the terrain against the top of
  chosen models (by default the embankment), on a grid along an alignment. The result is a table per station range, a CSV
  and a difference map in 3D (red: cut, blue: fill).
- **Height models as GeoTIFF** ([#92](https://github.com/vispecta-app/vispecta/issues/92)), e.g. DHM/Terræn: drop
  a `.tif` and it opens as a terrain, cut to the models and placed in map coordinates.
- **LandXML export of a terrain** ([#92](https://github.com/vispecta-app/vispecta/issues/92)): *Download LandXML*
  on its card.
- **Ground filter for point clouds without classes** ([#92](https://github.com/vispecta-app/vispecta/issues/92)): a
  morphological filter removes trees, buildings and vehicles before triangulation. It is the default when
  the cloud has no ground class.

### Changed
- **The view cube is in the top left corner**, instead of the X/Y/Z axis cross, which is gone (the
  cube and its compass ring show the directions). The top right corner of the 3D view is free.
  ([#95](https://github.com/vispecta-app/vispecta/issues/95))
- **The Chesapeake Bay Bridge-Tunnel sample is hidden** on the start screen; the railway sample and
  the sample scene stay. ([#95](https://github.com/vispecta-app/vispecta/issues/95))
- **Export 2D drawing is a wide dialog in two columns:** the drawing on the left, the annotation on
  the right, the export button always at the bottom; stacked on narrow screens.
  ([#96](https://github.com/vispecta-app/vispecta/issues/96))

### Added
- **Checks on every pull request.** ESLint (undefined names, unused variables), the build and a smoke
  test in headless Chromium: sample scene, a station section with the section window and an SVG
  export, a point cloud, all tabs, bad files, and the railway sample. Any page or console error
  fails it. `npm run test` runs the same locally.
  ([#57](https://github.com/vispecta-app/vispecta/issues/57))

### Fixed
- **Fold arrows in the model browser are larger** (a 26 px button with a hover state), and a terrain's height
  colour list no longer runs out of its card; the height range sits under it.

## v0.0.4 – 18.11.2026

### Changed
- **Terrain opens in a calm green.** Height colours are now a choice on the terrain's card:
  off (terrain green), blue – red, or green – brown – white. The choice is saved in projects, and
  terrains made in Vispecta are written in green too.
  ([#90](https://github.com/vispecta-app/vispecta/issues/90))
- **Dialogs close with ✕ in the top right corner** (or Esc) – no more Cancel / Close buttons.
- **A new cross section at a station opens the section window in the app**, next to the 3D view.
  Plan, X/Y and face sections just cut the model. The setting *Sections in a window of their own*
  is gone (it opened every new section as a separate browser window); ⧉ in the section window
  still pops it out.
- **Offset lines and corridor:** separate fields for *Left* and *Right* of the alignment (more
  than one distance per side with `;`), a wider dialog, and the stations fit their fields.
- **Faster sections: cut faces are computed once, not drawn in every frame.** The coloured cut
  faces (stencil caps) drew every model mesh two more times per plane in every frame, which made
  large models slow with a section. They are replaced by hatched faces in a light, neutral tone
  with the yellow outline, computed together with the outline when a plane stops moving.
  *Colour cut faces* is gone; *Hatch cut faces* turns the faces on and off.
- **Edit** is no longer in the toolbar; it stays in the properties panel (and the `E` key).

### Fixed
- **Stations just below a full km showed as `12+1000.000`.** They are rounded first, so they show as `13+000.000`.
- **Break points could be placed on a line under the outline** (e.g. on the terrain under an
  embankment) where a short segment lay above two crossing lines.
- **Cross sections in curves sat up to 11 cm off the axis.** web-ifc tessellates circular arcs
  with chords of tens of metres; the horizontal alignment is now computed from its design
  parameters (lines, arcs, clothoids) to within about 1 mm.
  ([#79](https://github.com/vispecta-app/vispecta/issues/79))
- **DXF texts with ‰, æ, ø, å or · showed `?`.** They are written as `\U+XXXX`, which CAD
  programs read.
- **Saved drawing options stopped loading at the first number field.** All options load again,
  also at start, so the section window shows the points as set up before.
- **The section box could not be seen.** It is now drawn as a wireframe, also where it doesn't
  cut anything yet.

### Added
- **Several alignments in a model: on/off and alias per alignment.** The model's card lists its
  alignments with their stationing; each can be switched on or off, renamed with an alias and zoomed
  to. The alias is shown wherever an alignment is chosen; hidden ones are marked there. Parallel
  alignments put their station labels on their outer sides. Saved in projects, undo covers it.
  ([#89](https://github.com/vispecta-app/vispecta/issues/89))
- **New sample: a double-track railway after Banedanmark norms.** *Double-track railway with a
  bridge* on the start screen opens a fictitious 1 km line (12+000–13+000) for 180 km/h, one IFC 4.3
  file per discipline in three groups:
  - alignment;
  - track: 60E1, S99 sleepers, welds and km marks;
  - earthworks with transition wedges and topsoil, and drainage with ditches, wells and outlets;
  - a 20 m bridge with stairs and handrails, the overhead contact line (Sicat SX) and cables;
  - terrain and landscape.

  It comes with a survey point cloud (LAZ in UTM coordinates), about 5 MB to download, and is made
  with `scripts/samples/make_double_track_railway.py`. Samples can now include point clouds. A model
  counts as a terrain (coloured by height) only when all its geographic elements are of the type
  TERRAIN, so trees keep their colours.
- **Terrain (TIN) from point clouds and LandXML.** *Terrain (TIN)…* on a point cloud's card builds
  a terrain surface from the ground points (class 2), or from the lowest point per grid cell when
  the file has no classes (a simple ground filter). The points are thinned on a grid in plan
  (default 1 m), triangulated, and triangles with longer edges than a limit are dropped, so there
  are holes where there is no data. A LandXML surface (`.xml`, TIN with points and faces) opens as
  a terrain too, in map coordinates or in those of the models. The terrain is an IFC model of its
  own (IfcGeographicElement TERRAIN with an IfcTriangulatedFaceSet, and the models'
  IfcMapConversion): coloured by height, a terrain line in sections, drawings (DXF layer
  `IFCGEOGRAPHICELEMENT`) and longitudinal profiles, saved in projects and downloaded with
  *Download IFC*. Built in a worker: 440 000 points in about 4 s.
  ([#45](https://github.com/vispecta-app/vispecta/issues/45))
- **View cube** in the top right corner of the 3D view, as in CAD programs. Click a face, edge or
  corner to look from there (the camera turns around the same point at the same distance), drag
  the cube to orbit, ↶ ↷ turn the view 90° about the vertical, ⌂ goes back to the 3D view of
  everything. The compass ring shows north (IFC +Y); its letters look from that side. Works with
  the orthographic camera and in the dark theme; *View → View cube* turns it off (remembered).
  ([#84](https://github.com/vispecta-app/vispecta/issues/84))
- **Drawing presets and a sheet view in the section window** (#51). The drawing dialog has
  presets at the top: two built-in ones (*Rail cross section A3 1:100* and *Overview*) and your
  own, saved with all drawing, annotation and label settings, the excluded classes and the
  section width. They are kept in the browser and in the project, and can be exported and
  imported as `*.vispecta-preset.json` to share with colleagues. 📄 in the section window shows
  the section as the sheet it will be exported as (paper, scale, title block, annotation,
  hatching) – it follows the stations and every change in the drawing dialog. Zoom with the
  wheel, pan by dragging, double-click to fit.
- **Cross-section drawings: layout, styles and hatching.** Hatched cut faces in PDF, SVG and DXF
  (DXF: a layer `<CLASS>_HATCH` per class); line weight thin / normal / thick; the band under or
  over the section; text size 80–150 %; labels that would overlap are spread out with kinked
  leaders instead of being left out; a dimension chain between the annotated points (or overall);
  DXF layers ANNOTATION_BAND, ANNOTATION_POINTS, ANNOTATION_SLOPES and DIMENSIONS with their own
  colours, and the DXF annotation sized for the same scale as the PDF.
  ([#50](https://github.com/vispecta-app/vispecta/issues/50))
- **Undo and redo.** Ctrl+Z (Cmd+Z) and ↶ in the toolbar undo the last change – hiding,
  isolating, colours, models switched off, sections added, moved or removed, measurements, drawn
  lines, the corridor; Ctrl+Y / Ctrl+Shift+Z and ↷ redo it. A message says what was undone. The
  camera is not part of it, and opening or removing a model starts the history again.
  ([#67](https://github.com/vispecta-app/vispecta/issues/67))
- **Label content and number format of the annotation.** Under *Label content and number
  format* in the drawing dialog: rows offset / height / distance to the next point; zero of the
  offsets (alignment axis, left edge or a chosen offset, e.g. the track centre) and of the heights
  (absolute, the alignment's height or a chosen level, e.g. top of rail); per value decimals, m or
  mm, text before/after (e.g. `K=`) and + for positive offsets; decimal sign; slopes in %, ‰, 1:n
  or auto, and not below a threshold. The section window shows the same texts.
  ([#49](https://github.com/vispecta-app/vispecta/issues/49))
- **Choose the annotated points of a cross section.** In the section window (⌖), click a point to
  remove it, or click an outline to add one (on a corner when one is near, else on the edge); ↺
  puts the computed points back. The choice is kept per station – also on that page of a series –
  and in the project. In the drawing dialog: *Outline* top / bottom / all, *Min. bend* (°) and
  *Min. distance* (m). ([#48](https://github.com/vispecta-app/vispecta/issues/48))
- **Drawn lines in the model browser:** show/hide, rename, zoom to, edit the points and remove a
  line you have drawn. Editing: drag a point (snaps to the model), **+** adds one, right-click
  removes one, ✓ keeps / ✕ undoes. Cross sections and the corridor on the line follow.
  ([#74](https://github.com/vispecta-app/vispecta/issues/74))
- **Outline along the cut faces in 3D.** Every face a section plane, section box or station
  section cuts gets a thick line along its edge – yellow by default, or black, the object colour
  or off (*Outline* in the Sections panel). It is computed when a plane stops moving, so orbiting
  stays as fast as before. ([#68](https://github.com/vispecta-app/vispecta/issues/68))
- **Turn off the 3D cut of a station section, keep the section.** ✂ in the Sections panel and in
  the section window: the whole model is shown again, while the section window, the drawings and
  the section marks A–A keep working. Saved views remember it.
  ([#39](https://github.com/vispecta-app/vispecta/issues/39))
- **Width of cross sections.** *Width* left | right of the alignment in the Sections panel limits
  station sections in the section window, drawings and series; the cut faces are cut cleanly at
  the limit, and the plane and the marks A–A in 3D show the width.
  ([#66](https://github.com/vispecta-app/vispecta/issues/66))
- **Zoom in the section window** with − / + buttons and keys, pinch on touch screens and
  double-click to fit; the zoom is kept while stepping through the stations.
  ([#65](https://github.com/vispecta-app/vispecta/issues/65))
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
