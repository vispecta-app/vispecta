# Changelog

Changes per release, with the GitHub issue each one belongs to. Releases and their full notes:
https://github.com/vispecta-app/vispecta/releases

## Unreleased

### Changed
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
