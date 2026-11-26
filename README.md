<p align="center">
  <a href="https://vispecta.com"><img src="docs/images/vispecta-banner.png" alt="Vispecta – IFC viewer for infrastructure projects" width="820"></a>
</p>

<p align="center">
  <a href="https://vispecta.com"><b>Open Vispecta</b></a> · <a href="https://vispecta.com/about/">About</a> · Beta · <a href="LICENSE">AGPL-3.0</a> · <a href="CONTRIBUTING.md">Contributing</a>
</p>

# Vispecta

An IFC viewer and editor that runs entirely in the browser. Files are processed locally (WebAssembly) and are never uploaded.

The interface is in **English**, **Danish**, **German**, **Swedish**, **Norwegian (bokmål)**, **Dutch**, **French**, **Spanish** and **Hindi** (language picker in the top right corner; the choice is remembered). There is a light and a dark theme (moon/sun button).

Vispecta is an open-source project by Rasmus Roien Molbaek (AGPL-3.0 licence). It grows out of the challenges I met in my work as an engineer in railway projects: alignments and stationing, cross sections and longitudinal profiles, combining the models of several disciplines, and quick checks of metadata.

## Features
The toolbar groups the functions: **View**, **Section**, **Visibility**, **Alignment** (stationing, cross sections, longitudinal profiles, drive along, draw a line), **Annotate**, **Measure** and **Tools** (quick quality check, merge, save part as IFC, compare, IDS check, quantity takeoff, Python). On small screens the side panels are drawers over the 3D view.

**Undo / redo:** Ctrl+Z (Cmd+Z on Mac) or ↶ in the toolbar undoes the last change, Ctrl+Y / Ctrl+Shift+Z or ↷ redoes it (#67). It covers hidden and isolated elements, colours and transparency, models and groups switched on or off, section planes (added, moved, removed, 3D cut on/off), measurements, drawn lines and the corridor – up to 50 steps. The camera is not part of it (saved views cover that), and in a text field Ctrl+Z stays the field's own. Opening or removing a model starts the history again.


### Review
- **Open files** (IFC2x3, IFC4, IFC4x3): drag and drop them anywhere in the window at any time, or click the drop area on the start screen / *Open IFC*. Dropped files are recognised by type: `.ifc` models are added to the view, `.bcf`/`.bcfzip` go to *Issues*, `.ids` opens the IDS check, and `.vispecta.json` opens a workspace.
- **Try it without your own files:** the start screen offers samples, served by the site itself:
  - *Bridge, road, rail and a house* – buildingSMART's IFC 4.3 sample scene (ten models in two groups), plus alignments along its track and its road (6 MB);
  - *Chesapeake Bay Bridge-Tunnel* – a synthetic 31 km bridge–tunnel corridor with two alignments and 17,553 elements, from buildingSMART's community samples (26 MB, about 5 MB to download). It opens at Island #1. Its button is hidden for now (#95); the sample is still served and can be shown again in `index.html`.
  - *Double-track railway with a bridge* – Vispecta's own fictitious 1 km line (12+000–13+000) for 180 km/h after Banedanmark norms (BN1-6-7, BN1-11, BN1-13, BN1-59, BN1-160, KI-Sicat): one IFC 4.3 file per discipline – alignment, track (60E1, S99 sleepers, welds, km marks), earthworks, drainage, a 20 m bridge, overhead contact line, cables, terrain and landscape – grouped in three, and a survey point cloud in UTM coordinates (about 5 MB to download). It opens at the bridge. The generator is `scripts/samples/make_double_track_railway.py`, and the norms and assumptions are listed in `public/samples/double-track-railway/README.md`.
- **Federation:** several models are shown in one view. The first model defines the coordinate system and the following models are placed relative to it using their own coordinates.
- **Groups and aliases:** in the Models tab, *+ New group* makes a named group. Drag model cards onto a group, or choose the group on the card. A group is switched on and off as a whole, and a model is shown when both its own switch and its group's are on. A model can get an alias (✎ or double click); the file name stays visible under it, and the alias is used in the structure tree, menus and dialogs. Cards fold to one line. Projects remember groups, aliases and switches.
- **Wrong length units:** some exporters state a unit that does not match the coordinates, e.g. *millimetre* while the coordinates are metres. Such a model would be 1000× too small and far away from the others. Vispecta detects the clear cases (a model of a few metres at projected coordinates, or two models that only fit together with the correction), corrects the scale and tells you.
- **Sections:** horizontal plan section, vertical sections (X/Y), a section parallel to a clicked face, and a section box around the selection. Every plane can be moved with a slider, stepped with ‹ › by a chosen step length (e.g. 0.5 m), placed at a typed position (↑/↓ in the field steps too), flipped, disabled or removed. Cut faces are flat faces exactly in the section plane, in a light neutral tone with diagonal hatching fixed in the plane – like a section on a drawing – and *Outline* draws a thick line along the edge of every cut face: yellow (default), black, the object colour or off, so touching cut faces are easy to tell apart (#68). Both are computed once when a plane stops moving (per element, holes included), not in every frame, so the cut doesn't slow down orbiting; while a plane is dragged the inside of the cut solids shows. Faces need closed solids, as IFC solids are; open geometry gets only the outline. *Hatch cut faces* in the section panel turns the faces off (remembered).
- **Colours:** colour and opacity per model. *Colour by model* gives every model its own colour; click the colour square on a model card to choose another one. *Original colours* restores the colours from the IFC file and removes colours given to single elements (IDS results, filters, smart views). *View → Reset view* (Shift+R) goes back to a clean view in one go; *Reset all* also removes section planes and measurements. Projects remember the model colours.
- **Colour style** (*View* menu): shows the original colours as *Original*, *Muted*, *Colour-blind friendly*, *Light grey* (nearly white, the shape first) or *Vivid*. The choice is remembered. *Colour-blind friendly* uses the Okabe–Ito palette, whose colours stay apart with the common kinds of colour blindness: every file colour snaps to the Okabe–Ito colour of its hue (greys stay grey), *Colour by model* uses Okabe–Ito colours, and compare and IDS results use blue / vermilion / yellow instead of green / red.
- **Toolbar menus:** *View*, *Section* and *Visibility* open menus where every tool has a short description.
- **View cube** (#84, #95): in the top-right corner (it replaces the X/Y/Z axis cross). Click a face, edge or corner to look from there (Top, Front = from the south, Right = from the east …), drag it to orbit, ↶ ↷ turn the view 90° about the vertical and ⌂ shows everything in 3D. The compass ring under it shows north (IFC +Y). *View → View cube* turns it off.
- **Side panels** can be hidden (‹ / › buttons) to give the 3D view more room.
- **Metadata:** click an element to see attributes, its location in the spatial structure, property sets, quantities (with units), type and type properties, materials and layers, and classifications. The panel can be filtered.
- **Calculated quantities:** for every element the volume, surface area, plan area (top faces), length, width and height are calculated from the 3D geometry, next to the quantities stored in the IFC file. With several elements selected, the totals are shown. The values are also included in the CSV export.
- **Structure and classes:** a tree from project to element and a list of IFC classes, searchable by name, class, GUID or tag. Select several rows with Ctrl+click (toggle) and Shift+click (range), then hide, show or isolate them all at once with the bar above the list, or with the eye on any selected row. The same bar has a **transparency** slider for the selected elements (*Solid* makes them solid again).
- Hide, isolate, show all, show/hide spaces, CSV export of all properties, screenshots.
- **Right-click menu** (right click without dragging; dragging with the right button still rotates): on an element it offers hide / show only / transparent / zoom / copy GlobalId, and hide / show only / select for its **IFC class**, its **layer** (`IfcPresentationLayerAssignment`, the CAD layers of the exporting program), its **storey** and its **model**. On empty space it lists all layers with on/off checkboxes. Rows in *Structure* and *Classes* have a right-click menu too. Layers are also available in *Filters* (colour or find by layer).
- **Large models (300 MB+):** the geometry is built in a worker (#58), so the page stays responsive while it loads. A model longer than 400 m is split in plan into cells, so only what is in view is drawn (#60). Afterwards the page opens the file once more itself, for properties, structure and editing. The two copies are not in memory at the same time: the worker ends first. Geometry is streamed in batches with progress, only small repeated geometries are cached, normals are stored compactly, the IFC file is not kept in memory a second time (it is read again from disk when needed), web-ifc may use up to 3.5 GB, and picking/snapping uses a BVH (three-mesh-bvh), so clicking and measuring stay fast on models with tens of thousands of elements.
- **Orthographic camera** (O): parallel projection without perspective, also stored in BCF viewpoints (`OrthogonalCamera`).
- **Storeys:** the *Storeys* menu (shown when the visible models have storeys) lists the storeys per model, highest first, with the elevation. Click one to show it alone, optionally with a plan cut 1.2 m above the floor. ▲ ▼ or Page Up / Page Down step through the storeys, and the menu button shows the storey that is shown.
- **X-ray** (X): everything becomes see-through except the selected elements.
- **Walk mode** (W): first-person view. W/A/S/D or the arrow keys move horizontally, drag to look around, Q/E down/up, Shift is faster, the wheel sets the speed, Esc leaves walk mode.

### Projects (remembered locally)

- Vispecta remembers what you worked on, **only in this browser on this computer** (IndexedDB) – nothing is uploaded. A project is created automatically when you open a model and saved automatically: the IFC files (including metadata edits), the saved views, the issues and the last view (camera, sections, visibility, colours, transparency, X-ray).
- The start screen shows the **recent projects**; click one to continue where you stopped. The *Models* tab shows the current project (rename it there); *Projects* lists all projects with their size, and can start a new project, delete projects, remove the prepared geometry to free space, or turn the saving off.
- **Large models open faster the second time:** the prepared geometry and the spatial structure are stored with the file (in a test 93 MB / 240,000 elements: 15.5 s the first time, 5.2 s from the project). Files are recognised by a fingerprint of their content, so a changed file is prepared again.
- The browser may remove the data when the disk is almost full; Vispecta asks it to keep the data (persistent storage). Clearing the browser's site data removes the projects.

### Issue report
**Issues → Report** (#134) saves the issues shown (the filter) as a report for people – a meeting, a letter, the file: a zip with `report.md` (Markdown, the snapshots in `images/`) and `report.html` (the same in one file, to read in a browser or print as PDF). Per issue: type, status, priority, assigned to, due date, who made and changed it, labels, description, where it is (station and offset on the nearest alignment, from the issue's elements or annotations), the elements (class, name, model, GlobalId), the texts of the annotations, the snapshots and the comments. The report is not read back – BCF is for that.

### Saved views and workspace

- **Views tab:** save the current view under a name (camera, sections, visibility, colours, transparency, selection, X-ray) with a thumbnail, and click it to return. Views refer to elements by GlobalId, so they also work on a newer version of the model. They are kept in the browser.
- **Workspace file** (`.vispecta.json`; files from before the rename, `.onlineifc.json`, still open): saves the views, the issues and the current view in one small file to share or to continue later. The IFC files are not included; open them together with the workspace file (or afterwards).

### Quantity takeoff

- **Quantity takeoff** (Q, or the button in the *Models* tab): a table with the count and the summed volume, surface area, plan area and length per group, grouped by one or two properties (class, storey, type, name, any property …). Add any numeric property, e.g. from a `Qto_` set, as an extra column. Works on all visible elements or on the selection; click a row to select its elements; export to CSV.

### Filters (colour and find by properties)
The **Filters** tab indexes the attributes, storey, type, material, property sets, quantities and calculated quantities of all elements. The index is built in small slices so the page stays responsive. Calculated quantities are worked out only when a filter or colour uses them. For a file stored with a project, the index is kept in the browser and is ready at once the next time (#61).
- **Colour by property:** choose any property and get a legend with a colour per value (numeric values are grouped in ranges). Click a value to select its elements, hide/show values, change colours, and optionally make elements without a value transparent.
- **Find elements:** rules such as *Class = IfcWall* and *Pset_WallCommon.FireRating has no value* (=, ≠, contains, >, <, has / has no value; all or any rule) to select, isolate, hide or colour the matching elements.

### Compare versions
**Compare** matches the elements of two loaded versions by GlobalId and shows what was **added** (green), **removed** (red) and **changed** (orange: attributes, property values, volume/area or position), with unchanged elements in transparent grey. The panel lists every change; click an element to zoom to it. The report can be exported as CSV.

### Quick quality check
*Tools → Quick quality check* (#138) checks what often goes wrong in deliveries and that an IDS file does not ask about: GlobalIds (missing, malformed, twice in a model, the same element in two files), elements twice (same class and geometry in the same place), elements outside the spatial structure, without a name, with almost no geometry or far from the rest of their model (a wrong placement), structure entries without geometry, proxies, models that are not georeferenced and length units other than the metre. Each check lists its elements (select, zoom), and can become a BCF issue; all as CSV.

### IDS check
**IDS** checks models against an `.ids` file (buildingSMART Information Delivery Specification) with IfcOpenShell's **ifctester**, running in the browser. Results are listed per specification with the requirements and the failing elements and their reasons. Failing elements can be selected, results coloured pass/fail, and everything exported as CSV. ifctester is installed the first time (a few seconds).

**Example IDS files** (in the IDS dialog, or in [`public/examples/ids`](public/examples/ids)) show what a check can do. They can be run directly or downloaded to look inside:

| File | Checks | Try it on |
|---|---|---|
| `01-basic-information.ids` | building elements have a name and lie on a storey; no `IfcBuildingElementProxy` (a *prohibited* specification) | IFC4 building models |
| `02-wall-and-slab-properties.ids` | `Pset_WallCommon` (IsExternal, LoadBearing, FireRating, ThermalTransmittance), `Pset_SlabCommon.LoadBearing`, and a value check: wall width 0.10–1.00 m | IFC4 building models |
| `03-materials-and-classification.ids` | structural parts have a material; building elements have a classification (any system) | IFC4 building models |
| `04-rail-infrastructure.ids` | at least one named `IfcAlignment` (a *required* specification), named referents (stations), signals named and contained in the railway, no proxies | IFC4X3 rail models |

On the FZK house, examples 1–3 give a mix of passes and failures (e.g. the U-value and wall width pass, the fire rating and classification fail).

### Issues (BCF)
The **Issues** tab creates issues from the current view. The camera, section planes, visibility, selection and colours are saved as a BCF viewpoint with a snapshot. Issues have type, status, priority, assignee and comments (optionally with their own view), and clicking an issue restores its view. **Export** writes a `.bcfzip` in BCF 2.1 (default, the most widely supported) or 3.0, validated against the buildingSMART schemas. **Import** reads BCF 2.0, 2.1 and 3.0 files from other tools (BIMcollab, Solibri, Revit, Trimble Connect …).

### 2D drawings
**Section → Export section as drawing** (or **2D** next to a section plane) turns a section into a drawing:
- **PDF/SVG:** true scale on A4–A0 (or fitted), a title block that wraps/shortens long model names so nothing overlaps the scale bar, cut outlines with filled cut areas coloured per IFC class, with the model colours as shown in the viewer (including colours you chose, e.g. from a filter), with the original IFC colours, or in black and white, title block, scale bar, and optionally the view behind the cut as a background.
- **DXF (R12):** one layer per IFC class, coordinates in metres. Plan sections use the real IFC X/Y coordinates, so they line up with other drawings.

### Alignments and stationing (IFC4x3)
Models with `IfcAlignment` show the alignment in 3D with station marks (**Alignment → Show alignments**). The vertical profile is computed from the alignment's vertical segments and the start station from `IfcReferent` / `Pset_Stationing`. Spot measurements show **station**, **lateral offset** (left positive, as in IFC) and the **height above the vertical profile**, and distances show the station range. Stations are written as `km+m` (`1+234.567`) or in metres. Under **Alignment → Stationing** the station marks can be automatic, every 1–1000 m, any other interval, or off (only the line).

**Several alignments in a model** (#89): the model's card lists its alignments with their stationing. Each can be switched on or off (a hidden one draws no axis and no stations, and is marked *hidden* where an alignment is chosen), given an alias (✎ or double-click), and zoomed to. The alias is used everywhere – cross sections, profiles, corridor, driving, section window. With parallel alignments (two tracks) each puts its station labels on its outer side, so they don't collide. Projects and undo remember it.

**Alignment → Cross section at station** (also in the Section menu) adds a section plane perpendicular to the alignment. Type the station (`1+234.5`, `1+234,5` or `1234.5`) in the plane's field, or step along the alignment with ‹ › and the step length; the plane turns with the curves. With several alignments, choose which one the plane follows. The 2D drawing of a station section uses the offset from the alignment as its x axis (right positive, looking towards higher stations) and shows the axis as a dash-dot line with the station (also in DXF, layer `ALIGNMENT_AXIS`). Saved views and BCF viewpoints bring the station plane back.

**Break points (offset / height):** in the drawing dialog of a vertical section, *Annotate break points* labels the break points of the top outline of the ticked classes. A bend counts from 10°, and short facets of round shapes are skipped. The labels can be a band under the section (rows *Offset* and *Height*, with leaders), texts at the points, or both. Slopes between the points (`2.5 %` or `1:1.5`) can be turned on. Offsets are measured from the alignment axis (right +), or from the left edge of the drawing for other sections. Faces that are vertical get both heights. The annotation is in PDF, SVG and DXF (layer `ANNOTATION_POINTS`), on every page of a series, and live in the section window (⌖). Which points (#48): *Outline* top (default), bottom or all outlines, *Min. bend* (default 10°) and *Min. distance* along the section. In the section window with ⌖ on, click a point to remove it and click an outline to add one – it snaps to a corner, or to the edge; ↺ puts the computed points back. The choice is kept per station (so the same station in a series gets it too) and saved in the project. *Label content and number format* (#49) sets what is written: the rows offset, height and distance to the next point; the zero of the offsets (alignment axis, left edge, or an offset from the axis such as the track centre) and of the heights (absolute level, the alignment's height at the station, or a chosen level such as top of rail); per value the decimals, m or mm, text before and after (e.g. `K=19,725`) and + for positive offsets; the decimal sign; and slopes in %, ‰, 1:n or auto (% below 10 %, else 1:n), hidden below a threshold. The section window shows the same texts. Layout (#50): *Hatch cut faces* (in PDF, SVG and DXF, a DXF layer `<CLASS>_HATCH` per class), *Line weight*, the band under or over the section, *Text size*, and a *Dimension chain* between the annotated points or overall. Labels that would overlap are spread out with kinked leaders. In the DXF, the annotation is on the layers `ANNOTATION_BAND`, `ANNOTATION_POINTS`, `ANNOTATION_SLOPES` and `DIMENSIONS`, each with its own colour, so each can be switched off in a CAD program; it is sized for the same scale as the PDF.

Cross sections get letters (A–A, B–B …). In 3D and on plan drawings each one is shown as a classic **section mark**: a dash-dot line across the alignment with arrows in the viewing direction and the letter at both ends. Plan drawings also show the alignment axis with station ticks inside the drawing, and a cross section at a station does not cut the plan. In the 2D drawing dialog of a station plane, **Series** writes one PDF page per station (from, to, every x m). All pages use the same scale and extent, with the axis at the same place.

**Section window:** the ▣ button of a section plane opens a window with the live 2D cut of that plane, next to the 3D view. There you step through the sections with ‹ ›, the arrow keys or a typed station, and set the step length. The model shows the section mark of the current cut at the same time. The window has a grid (offset from the axis and height), zoom (wheel, − / + buttons and keys, pinch on touch screens), pan (drag), *Fit* (`F` or double-click), and shows the coordinates under the cursor; the zoom is kept while stepping (#65). *Width* in the Sections panel limits cross sections at a station to a distance left | right of the alignment – in the window, drawings and series, with the cut faces cut cleanly at the limit (#66). ✂ turns off the 3D cut of a station section: the whole model is shown, while the window, the drawings and the section marks A–A stay (#39). ⧉ pops it out into a browser window of its own, e.g. on a second screen, and closing that window puts it back. A new cross section at a station opens this window straight away; plan, X/Y and face sections just cut the model. A key plan in the corner (▦) shows the visible models, the alignments and the cut line with its view direction, and the plane of the window is drawn in the accent colour in the 3D view. Cut faces are hatched here too. 📄 shows the **sheet** instead – the section exactly as it will be exported (paper, scale, title block, annotation, hatching), following the stations and every change in the drawing dialog; wheel zooms, drag pans, double-click fits (#51).

**Drawing presets** (#51): at the top of the drawing dialog, choose a preset – *Rail cross section A3 1:100*, *Overview*, or your own. *Save* stores all drawing, annotation and label settings, the excluded classes and the section width under a name, in the browser and in the project. *Export* / *Import* move presets between computers and colleagues as `*.vispecta-preset.json`.

### Offset lines and corridors
*Alignment → Offset lines and corridor* draws lines at fixed offsets from an alignment or a drawn line (e.g. −5 and +5 m; perpendicular in plan, right positive as in the section window), limited to a station range (#26). They show in 3D, and as dashed vertical lines in station sections, the section window and exported drawings (DXF layer `OFFSET_LINES`). *Find elements* lists the elements inside the band between the outermost offsets or crossing it – by their geometry, not their insertion point – per class, and can colour (inside violet, crossing orange), select or isolate them, or export the list as CSV with station and offset. The corridor is saved in the project.

### Structure gauge (BN1-166-1)
*Alignment → Structure gauge check* (#127) puts a clearance profile on an alignment – at top of rail, turned with the cant – and lists the elements that reach into it, from station to station. The profiles of the Danish standard BN1-166-1 (03/02/2025) are built in: D, D-GC, SD, R (shunting widening on one or both sides), A (also P1/F1), SA and UT, with the profiles over the upper part (EA, EBa1–3, SB, SB with conductor rail, +50 mm in tunnels over 100 m). The allowances of the norm are added along the track:
- **Curve widening** e (§12): 3750/R for 250 ≤ R < 300 m, 60000/R − 225 for 150 ≤ R < 250 m, on both sides – in the whole height for D, D-GC, SD and R; for A and SA below 760 mm, and above 3300 mm when R < 180 m (A also for P1/F1). It runs in at the start of the curve (R > 250 m), linearly from 12 to 2 m before it (R ≤ 250 m), and along transition curves.
- **Vertical curves** (§13): Δh = 50000/Rv for Rv < 10000 m – the low parts are lowered, the parts between 3300 mm and the top raised, run in over 25 m.
- **Maintenance allowance** for design (§10.4/10.5): ballasted track 100 mm up / 50 mm sideways, slab track 50 / 25 mm.
- **Cant** from `IfcAlignmentCant`, or typed in when the alignment has none.

Under R = 150 m and Rv = 500 m the norm requires a dispensation; the check says so. **Own profiles:** points b h in mm (the right half for a symmetric profile), an extra width per side and an extra height, and optionally the norm's curve and vertical allowances – saved in the browser and exported / imported as JSON. Models of the overhead line are not checked against the profile over the upper part. The result lists class, name, station, side and how far the element reaches in; a row goes to the element and its station section, and the list can colour, select or isolate the elements, be exported as CSV, or become BCF issues. The profile is drawn in 3D, in station sections and in drawings (DXF layer `STRUCTURE_GAUGE`), and saved in the project. *Open as IFC model* makes the gauge along the track an IFC model (IFC4X3, one `IfcBuildingElementProxy` per 100 m with the property set `Vispecta_StructureGauge`, in the coordinates and map conversion of the models) and opens it next to the others – *Download IFC* saves it, e.g. for a clash check in another program. The models to check are listed with a box for the overhead line; the classes left out are a list of the classes in those models (ticked: left out). It is a check aid, not an approval.

**National rules** (⚙ → National rules): the profiles of BN1-166-1 are offered with *Denmark* (the default when the app or the browser is Danish) or *All countries*; with *None* only your own profiles.

### Sight of signals and signs
*Alignment → Sight check (signal)* (#136): select a signal or sign, choose the track and the direction of travel. From the driver's eye (height above top of rail and offset across, editable), every few metres on the approach, rays go to five points of the target; where something of the models is in the way, the target is hidden there. The result is the distance from which the target is seen without a break (against a required sighting distance), a strip of where it is seen (green), partly seen (orange) or hidden (red), the elements that hide it with the distances and stations where they do, sight lines in 3D, CSV and a BCF issue with the camera at the driver's eye where the target is lost. Hidden elements do not block (hide vegetation to see what cutting it back would give); some classes never do. The train, the light's beam and the curvature of the earth are not modelled.

### Track parameters and report
*Alignment → Track parameters* (#137) labels the alignments in 3D where the horizontal elements (straight, arc with its radius, transition), the vertical ones (gradient, rounding radius) and the cant change. *Alignment → Track report* lists the horizontal and vertical elements and the cant of an alignment, and stations every few metres with map coordinates (E, N, when the models are georeferenced), height, radius with its direction, gradient and cant – as **Excel** (.xlsx, a sheet per table), **CSV** (the language's decimal sign) and **PDF** (A4 landscape).

### Point clouds
Surveys and laser scans can be loaded next to the IFC models (#27) – drop the file like an IFC file:

- **Formats:** LAS and LAZ (LAZ is decompressed with [laz-perf](https://github.com/hobuinc/laz-perf), served by the site), COPC, E57, XYZ / CSV / TXT / PTS, and PLY (ASCII and binary).
- **Very large clouds as COPC** (cloud-optimised LAZ, #52): the file is never read whole. Vispecta reads its octree and loads the parts the view needs, more detail close up and less far away, always within the point budget. Parts that are no longer needed are dropped again, so clouds of billions of points can be viewed. Sections and the section window load the points along the plane at full density, and so does a longitudinal profile along its path. *Terrain (TIN)…* takes an even sample of the whole cloud. The card shows how much is loaded. COPC files are made from LAS/LAZ with [PDAL](https://pdal.io) (`pdal translate in.laz out.copc.laz --writers.copc`) or [untwine](https://github.com/hobuinc/untwine) (`untwine -i in.laz -o out.copc.laz`).
- **E57** from terrestrial scanners (#52): all scan positions are read and put together with their poses (rotation and translation). Cartesian or spherical coordinates, intensity and colour are supported, and points marked invalid are skipped. Images in the file are ignored.
- **Thinned while reading** in a worker: an even voxel grid down to a point budget (about 5 million points on a computer, 1.5–3 million on phones and small devices), so the view stays fluid. The card shows how many points of the file are kept.
- **Placement:** the points are taken as IFC coordinates, or as map coordinates through the models' `IfcMapConversion` (e.g. UTM or DKS) – whichever lands nearer the models. Without models, the first cloud defines the coordinate system. A warning appears when a cloud lies more than 1 km from the models.
- **Display:** colour by RGB, classification (ASPRS colours), intensity, elevation or one colour; show/hide by classification (e.g. only ground and rail); point size.
- **Light to navigate:** while the camera moves, only an even sample of the points is drawn (about 1.2 million on a computer, fewer on phones); all are drawn again when it stops. *Points shown* on the card draws 50, 25 or 10 % of the points for weaker graphics cards.
- **In sections and drawings:** section planes clip the cloud, and the points within ±0.1 m of the plane (adjustable on the card) are shown as dots in the section window and in PDF/SVG/DXF drawings (DXF layer `POINTCLOUD`) – so the existing terrain or track can be compared with the design at every station.
- **In longitudinal profiles:** the points within the same distance of the path, unrolled by station.
- **Measuring** snaps to points.
- **Depth shading (EDL)** on the card: eye-dome lighting darkens points by depth compared with their neighbours, so edges and shapes show in dense clouds that have no colours (#52). The setting is remembered in this browser.
- **In projects** (#52): a cloud up to 300 MB is stored in the browser with the project, like the IFC files. A larger one is kept as a reference: a file dropped in Chrome or Edge is opened again from where it is (the browser asks for permission), otherwise the project asks you to open the file again. The settings are saved too (name, colours, size, classes, section slab). A **workspace** file holds the clouds' names and settings, and they are applied when the files are opened.

### DWG and DXF drawings
DWG (R14 to 2018 and later) and DXF files are opened like IFC files (#135) and shown as a 2D base: the model space as lines per layer, with the layers' colours, and the texts. Arcs, circles, ellipses, polyline bulges, splines (through their fit points) and blocks (also of dimensions) are drawn; hatches, images and 3D solids are not. The drawing is placed in the models' coordinates – read as map coordinates (through the models' IfcMapConversion) or as the models' own, whichever lands nearer the models. A flat drawing lies at a height of its own (under the models unless set) and can be drawn on top of them. The card in the model browser switches layers on and off, sets the unit (from the file's INSUNITS) and the height. DWG is read with [LibreDWG](https://www.gnu.org/software/libredwg/) (GPL-3.0) compiled to WebAssembly in a worker; its 8 MB (2 MB compressed) are only fetched when a drawing is opened. DGN (MicroStation V8) is not read: save it as DWG in MicroStation.

### Terrain (TIN)
*Terrain (TIN)…* on a point cloud's card builds a terrain surface (#45):

- **Ground points:** class 2 (ground) when the file has it – Danmarks Højdemodel and most surveys do – or else a **ground filter** (#92): a progressive morphological filter on the lowest point per grid cell, which opens the surface with growing windows up to about 20 m and drops cells that stand above it (trees, buildings, vehicles), while slopes and ditches stay. *Lowest point per cell* is still there as the simple filter. Noise (classes 7 and 18) and classes switched off on the card are left out.
- **Grid:** the points are thinned on a grid in plan (default 1 m). The dialog shows about how many terrain points that gives.
- **Triangulation** in plan with [Delaunator](https://github.com/mapbox/delaunator) (ISC), in a worker. Triangles with an edge longer than *Max. triangle edge* (default 10 m) are dropped, so there are holes where there is no data (under bridges, water); 0 keeps them all.
- **An IFC model of its own:** an `IfcGeographicElement` (TERRAIN) with an `IfcTriangulatedFaceSet`, with the `IfcMapConversion` of the models and a property set `Vispecta_Terrain` (source, grid, points, triangles, min./max. elevation). It is shown and switched like any model, in a calm terrain green, or coloured by height with *Height colours* on its card (blue – red or green – brown – white, #90), and a terrain line in sections, the section window, drawings (DXF layer `IFCGEOGRAPHICELEMENT`) and longitudinal profiles – an open surface has no cut face. *Download IFC* saves it, e.g. for Civil 3D, Revit or Trimble Connect.
- **LandXML:** drop a LandXML file (`.xml`) with a TIN surface (points and faces; faces marked invisible are holes). The points are read as map coordinates through the models' `IfcMapConversion`, or as IFC coordinates – whichever lands nearer the models. A surface with points only is triangulated.
- **Height models as GeoTIFF** (#92): drop a `.tif` with heights, e.g. a tile of *DHM/Terræn* (0.4 m) from Dataforsyningen, read with [geotiff.js](https://github.com/geotiffjs/geotiff.js) (MIT). It is cut to the models with 50 m around them when it covers them, resampled to at most 1.5 million cells, placed through the models' `IfcMapConversion` (the raster is in map coordinates, e.g. ETRS89 / UTM 32N and DVR90), and opened as a terrain: two triangles per cell, none where the raster has no data.
- **LandXML export** (#92): *Download LandXML* on a terrain's card saves it as a LandXML 1.2 TIN surface, in map coordinates (N E H) when the models are georeferenced, for Civil 3D, Novapoint, Trimble and others.
- **Terrain IFC files** from other programs (a model with only `IfcGeographicElement` of the type TERRAIN) open in the same green and get the same height colours.
- **Contours** (#92): *Contours* on a terrain's card draws contour lines – *Auto* (about 15–40 lines) or every 0.25, 0.5, 1, 2 or 5 m; every 5th is thicker. They show in 3D, are drawn in plan drawings with the height on the thick ones (PDF, SVG, and the DXF layer `CONTOURS`), and are kept in the project.
- **Cut and fill** (#92): *Cut and fill …* on a terrain's card compares the terrain with a design surface – the top of the models you choose (by default the models with an `IfcEarthworksFill`, e.g. the embankment). Both are sampled on a grid along an alignment (e.g. 0.5 m, 25 m to each side, corrected for the curvature) and summed per station range: a table with cut, fill, net and running totals, a CSV, and a difference map in 3D (red: cut, blue: fill). Volumes count only where both surfaces lie.

### Longitudinal profile
**Alignment → Longitudinal profile** unrolls the model along an alignment or along a **line you draw**. Choose *Draw a new line*, click points in the view (on elements, or at the height of the last point), then press Enter or double click. Backspace removes the last point and Esc cancels. The visible elements are cut with the vertical surface that follows the path, so the drawing has the station along and the height up. You set the range (from–to station) and the height exaggeration (1–50×). The red line is the vertical profile of the alignment, or the heights of the clicked points of a drawn line. Station and height grid lines are chosen for the paper scale, and the profile heights are written under the stations. The profile is previewed in the dialog and exported as PDF, SVG or DXF (DXF heights are exaggerated like the drawing). Drawn lines also work for cross sections at a station and for driving, and projects remember them.

**Drawn lines** are listed under *Drawn lines* in the Models tab (#74): show or hide them, rename (✎ or double-click), zoom to them (⤢), edit their points (◇) or remove them (✕). While editing, drag a point – it snaps to the model surface, or keeps its height where there is none – click **+** on a segment to add a point, right-click or double-click a point to remove it, and press ✓ / Enter to keep the change or ✕ / Esc to undo it. Cross sections and the corridor on the line follow the change; removing a line also removes the cross sections on it and its corridor, after a warning. Drawn lines are saved in the project, hidden or not.

### Go to station / drive along
**Alignment → Go to station / drive along** puts the camera at eye height on an alignment (or a drawn line), looking ahead. Type a station and press Enter (↑/↓ step), or press ▶ to drive at 5–200 km/h. The camera follows the curves and the vertical profile, and ⇄ changes the direction. Dragging the view or pressing Esc pauses.

### Stationing format
*Alignment → Station format* sets how stations are written everywhere – labels, fields, the section window, profiles, series and drawings (#29): `12+345.678` (km + m, default), `123+45.68` (stations of 100 m), `12.346` (km with decimals), `km 12,346` or `12345.678 m`. Typing accepts every format (`12+345`, `km 12,345`, `12345 m`; a bare number counts as km when a km format is chosen). The choice is remembered and saved in the project.

### Models far apart
After loading, Vispecta warns when a model lies more than 1000 m (adjustable under the model list) from the others – by the gap between their boxes, in map coordinates when the models have an `IfcMapConversion` (#28). The message names the model and the distance and the likely cause (another map coordinate system, a map conversion in only one model, map vs. local coordinates, or another base point), and the model card shows ⚠.

### Coordinate systems
Models, point clouds and terrain do not always come in the same map coordinate system: a model in UTM 32N and a DHM tile in UTM 33N, a survey in Kp2000 Jylland, a German model in DB_REF. Vispecta converts them into one project system on the fly (#107):

- **The project's system** is chosen at the top of the model browser. By default it is the system of the first model (its `IfcProjectedCRS`) or cloud, and it is saved in the project.
- **Each file's system** is read where the file names it: `IfcProjectedCRS` in IFC, the WKT or GeoTIFF keys in LAS/LAZ/COPC, the coordinate metadata in E57, the GeoTIFF keys of a height model, and `CoordinateSystem` in LandXML. Otherwise, choose it on the card. A model without an `IfcMapConversion` is then taken to be in map coordinates of that system.
- **Conversion:** point clouds, GeoTIFF and LandXML are converted point by point. An IFC model gets a similarity transform fitted over its extent. Where that would be off by more than half a millimetre (between UTM zones about 1 mm per km, growing with the square of the length), its vertices and alignments are converted point by point too. The card says how. Stationing stays as designed.
- **Built in:**
  - Denmark: ETRS89 / UTM 32N and 33N, DKTM1–4, and Kp2000 Jylland, Sjælland and Bornholm (also WGS 84 / UTM).
  - Germany: DHDN / Gauss-Krüger zones 2–5, and DB_REF zones 2–5. DHDN uses the Germany-wide 7 parameters, about 1–3 m, without BeTA2007. DB_REF uses 7 parameters, about a decimetre. Neither is for setting out.
  - *Other EPSG code…* looks up any projected system once at epsg.io, or takes a pasted proj4 definition, and keeps it in this browser and the project.
- **Heights are not converted** (no geoid or height grid yet). System 34 is not supported.
- Conversion uses [proj4js](https://github.com/proj4js/proj4js) (MIT), locally.

### Measure
**Measure** (toolbar or `M`) opens the measuring panel with seven tools:
- **Distance:** point to point. *Lock X/Y* keeps the second point on the vertical line through the first point, so only the height (Z) is measured. Shows the distance, the horizontal distance, the height difference (ΔZ), ΔX/ΔY and the slope. Dashed lines show the horizontal and vertical components.
- **Length:** a polyline through several points with the length of each segment and the total. Finish with double-click or Enter; Backspace removes the last point.
- **Objects** (#128): click two elements – the shortest distance between their geometry (solid line; 0 when they touch or overlap) and the distance between their centres (dashed).
- **Angle** (#139): click a point, the corner and a point – the angle in 3D and in plan.
- **Area** (#139): click the corners, finish with a double click or Enter – the area of the polygon, in plan, and its perimeter.
- **Element** (#139): click an element – its volume (from its closed surface; marked ≈ when the surface is not closed), surface area and size in X, Y and Z.
- **Spot:** coordinates and elevation of a point. Choose which coordinates (X, Y, Z) the label in the 3D view shows. It shows project X/Y/Z (metres, Z up) and the height above the element's storey. If the model is georeferenced with `IfcMapConversion`, it also shows easting/northing/height in the map coordinate system. Otherwise it shows Z plus the site reference elevation (`IfcSite.RefElevation`) when one is set.

Points snap to corners, edge midpoints, edges and – from the last point of a distance or length – perpendicular onto an edge (the foot of the perpendicular, marked ∟) (shown by the marker shape); snapping can be turned off. Values are shown in m or mm, every measurement can be zoomed to or removed, and *Copy all* copies the values to the clipboard. Points cut away by section planes cannot be picked. With several models, coordinates refer to the first model's coordinate system.

### Edit metadata
Turn on **Edit** (in the properties panel, or the `E` key):
- Edit string attributes (`Name`, `Description`, `ObjectType`, `Tag`, `LongName` …) directly in the properties panel.
- Change, add and remove single-value properties in property sets. Values keep their IFC type (label, length, boolean …). New properties can be text, number, integer or yes/no.
- **Batch editing:** select several elements (for example a whole class) and set a property on all of them. Existing values are overwritten, missing properties are added, and elements without the property set get a new one.
- Shared property sets and type property sets are marked, so you can see when a change affects more elements.
- Every model card shows the list of changes. **Download IFC** saves the edited file (`*_edited.ifc`).

### Annotations
**Annotate** (✎ in the toolbar, or `N`, #130) puts notes and arrows in the 3D view: *Note* – click a point and type the text in the panel; *Arrow* – click where it starts (its text sits there) and where it points. Markup shapes (#133) are dragged out on the screen: *Revision cloud* (with a text box for the remark), *Rectangle*, *Ellipse* and *Freehand*. They lie in a plane square to the view, at the depth of the model where the drag began – so they mark what is seen from that view, which a saved view or BCF issue brings back. While drawing a shape the left mouse button draws; rotate with the right one. Three line widths (thin, medium, thick). Six colours (the dot in the list changes an annotation's colour). While the panel is open, drag a note, its label or an arrow's end to move it (onto the model under the mouse), or a shape by its outline or text (in its plane); click it to edit its text. Every annotation can be zoomed to or removed. They are drawn in the 3D view itself, so they are part of screenshots and of the snapshots of BCF issues, and they keep their size on screen. Projects and saved views keep them (a saved view puts its own back); In BCF files (#134) the arrows and the outlines of shapes are written as viewpoint lines, so other programs show them too, and the texts of the annotations are added as a comment of the issue; Vispecta also puts the annotations as they are in an extra file per viewpoint (`viewpoint-<guid>.vispecta.json`, passed over by other programs), so a BCF file opened in Vispecta again brings back the notes, clouds and texts exactly. Lines from other programs come back as arrows (a single line) or freehand lines (lines joined end to start).

### Save part as IFC
**Tools → Save part as IFC** (#129) writes a new IFC file per model with only the selected or the visible elements – with their parts (assemblies), openings, the spatial structure above them up to the project, and their placements, geometry, property sets, types, materials, classifications, styles and layers. Relations keep only the elements that are written. Entity numbers and GlobalIds are kept, so BCF issues and IDS results still point at the same elements. It works on the file text in a stream (like merging), also for large files; the original file is not changed.

### Merge models
**Tools → Merge models** combines two or more loaded models into a single IFC file (the same result as `ifcpatch` *MergeProjects*). The first model keeps its header, project, units and coordinate system; the projects of the others are replaced by it. Sites, buildings, storeys and other spatial elements with the same GlobalId in several models are combined into one, and their repeated relations are dropped. The merge works directly on the STEP text, streamed in chunks, so it is fast and needs little more memory than the files themselves (about 370 MB in 30 s in a test). The result opens in the viewer and can be downloaded. The models must use the same IFC schema. The merged file takes the length unit of the first model: a model whose unit was corrected is therefore not put first, and models in really different units trigger a warning. Tick *Replace the source models* for very large models: the sources are removed before the merged model is loaded, which saves memory.

In Python scripts, `app.merge(files)` / `merge_models(files)` merges with IfcOpenShell. Files leave Python by being written straight to the in-memory file system (not as one big string), but IfcOpenShell needs roughly 7× the file size in memory and the browser limits Python to 4 GB, so use the *Merge* button for large models.

### Python with IfcOpenShell
**Python** opens a code editor with a console. Scripts run with [Pyodide](https://pyodide.org) and [IfcOpenShell](https://ifcopenshell.org) 0.8.5 in a Web Worker in the browser. The first start downloads about 30 MB; after that the browser caches it.

These names are available in scripts:

| Name | Contents |
| --- | --- |
| `model` | the active model (`ifcopenshell.file`), i.e. the one you last clicked in |
| `models` | all loaded models: `{"file name": ifcopenshell.file}` |
| `selection` | the selected elements as IfcOpenShell entities |
| `app.update(model)` | reload a model in the viewer with the changes made in Python |
| `app.add_model(f, "name.ifc")` | open a new `ifcopenshell.file` in the viewer |
| `app.download(f_or_text, "name")` | download an IFC file or any text (CSV, JSON …) |
| `app.select(elements)` | select elements in the viewer |
| `app.merge(files)` | merge files into a new `ifcopenshell.file` |

Run with **Ctrl+Enter**. The script is saved in the browser. The *Examples* menu has ready-made scripts: count elements per class, set a property set on the selection, find walls missing FireRating, rename storeys, export all properties to CSV, remove a class, and merge all models. `ifcopenshell.api`, `ifcopenshell.util.*`, numpy and shapely are available. Other Pyodide packages, such as pandas, are loaded automatically when you import them.

## Accessibility
Vispecta aims at WCAG 2.2 AA (#62).

- **Keyboard:** the toolbar menus open with Enter, Space or ↓. ↑ ↓ Home End move between the items, and Esc closes the menu and goes back to its button. The tabs of the left panel are a tab list, so ← → Home End switch between them.
- **Screen readers:** menus, tabs, the 3D view (with its keyboard shortcuts in its label) and every symbol-only button and field have names and states.
- **Contrast and size:** text and buttons meet 4.5:1, and click targets are at least 24 × 24 px.
- **Phones:** a fade at the edge of the toolbar shows that it scrolls sideways.
- **Checked automatically:** the smoke test runs axe-core on the loaded app and fails on any serious violation.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Move (pan) / select | Left mouse drag / click |
| Rotate | Hold the scroll wheel (middle button), right mouse, or Shift + left |
| Zoom | Scroll – zooms towards the point under the cursor, all the way in |
| Center on point | Double-click |
| Add to / remove from selection | Ctrl + click (Shift + click in lists: range) |
| Zoom to selection | F |
| Hide / isolate / show all | H / I / Shift+H |
| Reset view (colours, visibility, X-ray, selection, zoom to all) | Shift+R |
| Edit mode | E |
| Measure on/off | M |
| Annotate on/off | N |
| Orthographic / perspective camera | O |
| X-ray | X |
| Walk mode (Esc exits) | W |
| Next / previous storey | Page Up / Page Down |
| Quantity takeoff | Q |
| Finish / undo last point while measuring | Enter / Backspace |
| Run Python script | Ctrl+Enter |
| Clear selection | Esc |

## Development
Notes on performance:
- The 3D view is drawn on demand: while the camera moves, shortly after any input or `viewer.invalidate()`, and otherwise twice a second. An idle view costs almost no GPU time.
- The build puts web-ifc and three.js in files of their own, so an update of the app only re-downloads the small application file. The code editor is loaded when the Python panel is first opened.
- Visual identity: the mark is a cross section (a profile, which is also a V) with the point that looks at it. Colours ("Petrol"): petrol `#0C2A30`, turquoise `#0E8C84` (dark mode `#2CC8BC`, with dark text on it), orange `#F08A24` for alignments and red `#C8372D` for sections. Type: Space Grotesk for headings, Inter for the interface, JetBrains Mono for stations and measured values, bundled with the app via Fontsource (no requests to font services). The icons in `public/icons` are made from `icon.svg` / `maskable.svg`.
- `src/style.css` is organised as tokens, base controls (`.btn`, fields, `.float` panels) and feature sections; new UI should use those instead of local styles.


```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # static build in dist/
npm run preview  # preview the build
npm run lint     # ESLint: undefined names and unused variables
npm run test     # lint, build and the smoke test (needs `npx playwright install chromium` once)
```

**Checks on pull requests (#57):** `.github/workflows/ci.yml` runs the lint, the build and a smoke test (`tests/smoke.mjs`) in headless Chromium with software GL on every pull request and push to `main`. The smoke test serves `dist/` like GitHub Pages and:
- opens the sample scene (11 models, both alignments), adds a cross section on *Track*, checks the section window and exports an SVG drawing;
- loads a point cloud and opens every tab;
- loads an empty file, a text file and a cut-off IFC, and expects the right messages;
- opens the railway sample (9 models and a LAZ survey in map coordinates).

It fails on any page or console error. It takes about half a minute.

Built with [three.js](https://threejs.org), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (viewing and metadata editing), [Pyodide](https://pyodide.org) + [IfcOpenShell](https://ifcopenshell.org) (Python and IDS), [fflate](https://github.com/101arrowz/fflate), [Delaunator](https://github.com/mapbox/delaunator) (terrain) and [CodeMirror](https://codemirror.net). It is a static site with no backend.

| File | Purpose |
| --- | --- |
| `src/main.js` | user interface: start-up, files, toolbar and menus, selection, tree, properties, projects, measuring, merge, Python, status, undo |
| `src/app/core.js` | the core every part of the UI imports: DOM helpers, the viewer, the selection state, toasts, loading bar, downloads |
| `src/app/browser.js` | the model browser: model cards, groups, names |
| `src/app/sections.js` | section planes, cross sections at a station, the section window |
| `src/app/lines.js`, `src/app/profile.js` | drawn lines; longitudinal profile, section series, drive along |
| `src/app/drawing.js` | the drawing dialog, annotated points, drawing presets |
| `src/app/corridor.js`, `src/app/terrain.js` | offset lines and corridors; terrain, contours, cut and fill |
| `src/app/clouds.js`, `src/app/crs.js` | point clouds and COPC streaming in the UI; coordinate systems |
| `src/app/checks.js` | IDS check and comparison of versions |
| `src/viewer.js` | three.js scene, picking, sections |
| `src/measure.js` | measuring tools and snapping |
| `src/filters.js` | colour by property and rule-based filters |
| `src/compare.js` | comparison of two model versions |
| `src/ids.js` | IDS checking (ifctester in the Python worker) |
| `src/bcf.js`, `src/issues.js` | BCF read/write and the Issues tab |
| `src/drawing.js` | 2D drawings from section planes (PDF, SVG, DXF) |
| `src/alignment.js` | IFC4x3 alignments and stationing |
| `src/terrain-worker.js` | terrain (TIN) from point clouds and LandXML, written as IFC |
| `src/pointcloud.js`, `src/pointcloud-worker.js` | point clouds: reading (LAS/LAZ/PLY/XYZ), thinning and display |
| `src/copc.js`, `src/copc-worker.js` | COPC streaming: the octree nodes the view, sections and profiles need |
| `src/e57.js` | E57 reader (paged file, bit-packed fields, scan poses) |
| `src/crs.js`, `src/lascrs.js` | coordinate systems: definitions, detection, conversion and fitting (proj4js) |
| `src/viewcube.js` | view cube in the corner of the 3D view |
| `src/secview.js` | section window: live 2D cut of a plane, stepping, zoom, pop-out window |
| `src/lineedit.js` | editing the points of a drawn line |
| `src/history.js` | undo / redo from snapshots of the state |
| `src/cutlines.js` | outline along the cut faces in 3D |
| `src/ifc.js`, `src/model.js` | loading IFC, metadata and metadata editing (web-ifc) |
| `src/python.js`, `src/python-worker.js` | Pyodide/IfcOpenShell worker and merge logic |
| `src/scripting.js`, `src/examples.js` | Python panel and example scripts |
| `src/i18n.js`, `src/i18n/*.js` | translations: English in `i18n.js`; da/de/sv/nb/nl/fr/es/hi each in `src/i18n/<code>.js`, loaded only when chosen |
| `src/config.js` | where the Python runtime is loaded from |
| `scripts/fetch-python.mjs`, `scripts/python-wheels.json` | collects the Python runtime into `public/py` at build time (pinned, sha256-checked) |

### Python runtime sources

The built site serves the Python runtime itself, so the Python panel and the IDS check contact no other server. `npm run build` first runs `scripts/fetch-python.mjs`, which collects into `public/py` (not committed):

- Pyodide's core files from the pinned npm package `pyodide`;
- the Pyodide packages IfcOpenShell needs (numpy, shapely, micropip …) from the Pyodide distribution, checked against the sha256 in `pyodide-lock.json`;
- IfcOpenShell, its pure-Python dependencies and ifctester, pinned with their sha256 in `scripts/python-wheels.json`.

That is about 58 MB, loaded only when Python or IDS is first used. Packages that are not hosted (e.g. pandas) stay on jsDelivr and are only fetched when a script of your own imports them.

`npm run build:app` builds without collecting the runtime; then (and in `npm run dev` before `npm run fetch-python`) Pyodide comes from jsDelivr, IfcOpenShell from `ifcopenshell.github.io` and the rest from PyPI. To use another mirror, set an override in the browser:

```js
localStorage.setItem('onlineifc.python', JSON.stringify({
  pyodideBase: 'https://example.com/pyodide/',
  wheels: ['https://example.com/wheels/lark-1.3.1-py3-none-any.whl',
           'https://example.com/wheels/isodate-0.7.2-py3-none-any.whl',
           'https://example.com/wheels/ifcopenshell-0.8.5-cp313-cp313-pyodide_2025_0_wasm32.whl'],
}));
```

## Deployment

`.github/workflows/deploy.yml` builds the site and deploys it to GitHub Pages on every push to `main`.
Enable Pages once: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The `dist/` folder can also be put on any other static host (Netlify, Azure Static Web Apps, S3 …).

### Installable app (PWA)

The built site has a web app manifest and a service worker (`public/sw.js`). In Chrome or Edge, use *Install* in the address bar to get Vispecta as an app with its own window. After the first visit it works offline, and the installed app can open `.ifc` files directly (*Open with* in the file explorer). The service worker caches the app itself. The sample models and the Python runtime are cached separately, only once they have been used, and that cache is kept under 250 MB: the files used longest ago are dropped first (#64). IFC files never leave the computer. It is only registered in the built app (`npm run build`), not in the dev server.

## Privacy

Vispecta is a static website without a backend, cookies, analytics or tracking.

- **Your files are never uploaded.** IFC, BCF, IDS and point cloud files are read and processed in your browser (WebAssembly). Projects and settings are saved only in this browser (IndexedDB, localStorage).
- **What the site loads:** everything – the app, fonts, web-ifc, laz-perf and the Python runtime (Pyodide, IfcOpenShell, ifctester) – comes from vispecta.com itself (hosted on GitHub Pages, which, like any web host, sees the visitor's IP address).
- **Other servers are contacted only when you ask for it:**
  - *Check for updates* in the About dialog asks the GitHub API for the latest release;
  - *Other EPSG code…* under coordinate systems asks epsg.io for the definition of that code (only the code is sent);
  - a Python script of your own that imports a package which is not hosted (e.g. pandas) fetches it from jsDelivr, and `micropip.install` in your script fetches from PyPI.

  - *Other EPSG code…* under coordinate systems asks epsg.io for the definition of that code.

  No model data is sent in any of these cases.
- **Enforced by the browser:** the pages carry a Content Security Policy (#64). The page may load only from vispecta.com itself (scripts, styles, fonts, images, WebAssembly), and the only other servers it may contact are the GitHub API (update check) and epsg.io. There are no inline scripts. The Python and point-cloud workers are not covered by the tag: GitHub Pages cannot send the header that would cover them.

## Status

Vispecta is in **beta**: not every feature has been tested thoroughly, so expect bugs. Reports are very welcome.

## Contributing

Ideas, bug reports and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[GNU AGPL-3.0](LICENSE) © 2026 Rasmus Roien Molbaek

In short (the licence text is what counts):

- **Use it freely**, also at work and in commercial projects – for viewing, checking and drawing your models.
- **Change it and share it**, as long as your version is also under the AGPL-3.0 with its full source code.
- If you **run a changed version as a service** for others (e.g. on a website), its users must be able to get the source code too.
- So nobody can take Vispecta, close it and sell it as their own product.

The sample models in `public/samples/simple-scene` are the IFC 4.3 "Simple-Scene" from [buildingSMART's sample test files](https://github.com/buildingSMART/Sample-Test-Files), © buildingSMART International Ltd., licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The fictitious railway in `public/samples/double-track-railway` is made by Vispecta and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The Chesapeake Bay Bridge-Tunnel model in `public/samples/chesapeake` is from [buildingSMART's community sample files](https://github.com/buildingsmart-community/Community-Sample-Test-Files), © 2026 buildingSMART Community Projects, licensed under the MIT licence; its geometry is based on OpenStreetMap data (© OpenStreetMap contributors, ODbL). It is a synthetic test model, not endorsed by the Chesapeake Bay Bridge and Tunnel District.

DWG and DXF files are read with [LibreDWG](https://www.gnu.org/software/libredwg/) (© Free Software Foundation, GPL-3.0-or-later), through [@mlightcad/libredwg-web](https://github.com/mlightcad/libredwg-web) (GPL-3.0); the GPL-3.0 can be combined with the AGPL-3.0 (section 13). The test drawing `tests/fixtures/example_2000.dwg` is from LibreDWG's test data.
