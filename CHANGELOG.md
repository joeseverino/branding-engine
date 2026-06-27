# Changelog

All notable changes to this project are documented here.

## 0.3.0 - 2026-06-26

- Add the `figure` command: brand-themed graphics (covers, banners, OG/social
  cards, diagrams) from a small JSON spec, on the same headless-Chromium +
  bundled-Inter pipeline as social cards. Templates: `title`, `flow`, `diamond`,
  `nodes`, and `topology`.
- Add a `topology` figure template for network and lab diagrams: device-glyph
  nodes (`laptop`, `monitor`, `server`, `database`, `switch`, `router`, `cloud`,
  `phone`) in ringed circles, `star`/`row`/`ring`/`free` layouts (`star` is
  hub-and-spoke by compass `pos` with guaranteed-straight spokes; `free` places
  nodes by `at: [x, y]` fractions with an optional `scale`), links with `dashed` style,
  arrow direction, `color: "accent"` for an attack/overlay path, and
  `fromLabel`/`toLabel` endpoint labels, plus `anchor`/`attacker` accent fills.
  Keeps the topology look that `flow` flattens. Make connector arrowheads work at
  either end of a link.
- Default a figure's frame from its layout when `size` is omitted: radial
  `star`/`ring` topologies use the new 3:2 `topo` preset (larger on mobile, where
  width is the constraint); a `row` becomes a short, wide banner whose height is
  sized to the node count (a 2-node diagram no longer floats in a tall 16:9
  frame); everything else stays 16:9 `cover`. Exposed as `figureSize()`.
- Enlarge topology link and endpoint labels (the network chip and the
  `fromLabel`/`toLabel` octets) so they stay legible once a wide diagram is
  scaled down to mobile width.
- Remove the vestigial Python glyph-extraction script and its `requirements.txt`
  (the OpenType.js + WebAssembly path replaced them in 0.2.0); the npm tarball no
  longer ships any Python.

## 0.2.2 - 2026-06-06

- Correct the repository URL on the example social card
  (`github.com/joeseverino/branding-engine`).
- Add README status badges and an `AGENTS.md` guide so contributors' AI agents
  can work in the repo with the right context.

## 0.2.1 - 2026-06-06

- Refresh pinned checkout and CodeQL GitHub Actions.
- Reissue the `0.2.0` feature release after GitHub-hosted runners were
  interrupted during publishing.
- Make generated-raster integration checks portable across operating systems.

## 0.2.0 - 2026-06-06

- Accept and dynamically size one to three alphanumeric glyph characters.
- Normalize lowercase glyph input to uppercase and reject unsupported marks.
- Replace Python/fonttools glyph extraction with OpenType.js and WebAssembly.
- Add a complete Severino Labs example covering every generation stage.
- Document and test Astro and plain static-site installation workflows.
- Expand package documentation and repository security automation.

## 0.1.0 - 2026-06-06

- Initial public npm release.
- Generate marks, favicons, wordmarks, brand sheets, social cards, and web
  tokens.
- Publish from GitHub Actions through npm Trusted Publishing.
