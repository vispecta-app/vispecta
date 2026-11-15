# Changelog

Changes per release, with the GitHub issue each one belongs to. Releases and their full notes:
https://github.com/vispecta-app/vispecta/releases

## v0.0.3 (unreleased)

### Fixed
- **Section window left an empty `about:blank` window behind** when it was docked back from its
  own browser window. Docking now closes the popup window; the popup also closes when the main
  page goes away. ([#38](https://github.com/vispecta-app/vispecta/issues/38))
- **IDS colours could not be cleared from the main view.** *Original colours* in the model
  browser now also removes colours given to single elements – IDS results, filters, smart views
  and BCF viewpoints – and ends a comparison. ([#40](https://github.com/vispecta-app/vispecta/issues/40))
- **Hatching of cut faces crawled over the faces while navigating.** It was drawn in screen
  space; it is now computed in the section plane itself and sticks to the cut face, in
  perspective and orthographic view and with several planes.
  ([#37](https://github.com/vispecta-app/vispecta/issues/37), part 1 – z-fighting where cut
  solids touch other solids is still open, see the issue)

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
