# Changelog

All notable changes to this project are documented here.

## Unreleased

- The CLI parses flags with `node:util` `parseArgs`. `--flag=value` is accepted,
  `--no-circle-preview` is the negated form of `--circle-preview`, and an
  unrecognized flag exits 1 with `Unknown flag --name.`. Other flags, messages
  and exit codes are unchanged.
- The compiler runs with `noUncheckedIndexedAccess`, `noUnusedLocals` and
  `noUnusedParameters`, without assertions or casts. The build targets ES2025 and
  does not load the DOM library; the page callbacks declare the part of
  `document` they read.
- The glyph extractor, OpenType.js and the WOFF2 decoder load when a glyph cache
  has to be written; builds that read the bundled caches do not load them.
- Internals use platform features: `import.meta.dirname`, `Map.groupBy`,
  `toSorted`, `Array.fromAsync`, error `cause` and `fs.globSync`. The build
  cleans `dist/` with a Node script, so `npm run build` runs on any platform.
  `package.json` declares `sideEffects: false` and omits `publishConfig`.
- Tests use `await using` temp directories, `t.mock` and `t.after`, and a
  compile-time check keeps the hand-written `Browser` interface compatible with
  Playwright's.
- The source is TypeScript under strict settings. The package now ships compiled
  JavaScript and type declarations in `dist/`, and the `bin` entry is
  `dist/cli.js`. CLI behavior, flags, the config schema, the library exports and
  the generated output are unchanged; the example kit regenerates byte for byte.
  Option and result types are exported from the package root.
- Config files are validated up front: every problem is reported together by
  field path, a missing `brand.json` names the path it looked for, a surface may
  not reuse the primary `identity.slug`, and omitted card text fields render
  empty instead of the word `undefined`.
- `--only` (and `only:`) with an unknown stage now fails with the valid stages
  instead of building nothing. A valued flag given without a value
  (`--out`, `--only`, ...) and a non-numeric `--scale`, `--size` or `--fit` fail
  with a clear message. `--no-circle-preview` is a switch and no longer consumes
  the argument after it.
- A glyph cache rewritten while a process is running (a second build with
  another weight of the same font) is reloaded instead of rendering from the
  outlines read first.
- `buildBrand` and `buildKit` restore `BRAND_FONT`, `BRAND_GLYPHS` and
  `BRAND_WORDMARK_GLYPHS` when they finish instead of leaving them set.
- A `star` layout with a link that ends at a group no longer throws, and a group
  entry skipped as a duplicate no longer shifts the member lists of the groups
  after it.
- A wordmark with no visible characters fails with a message instead of writing
  an SVG full of `NaN`.
- Figure specs: `rows` (flow), `nodes` (diamond), `colors` and `size` are checked
  entry by entry, so a malformed one raises `FigureSpecError` instead of a
  `TypeError`; a `size` pair must be numbers, not numeric strings.
- Library: `makePictogram` is typed by whether `variants` is given;
  `isPictogramFiles` is exported to tell the two result shapes apart.

- A figure no longer fails when ELK cannot compute its row-wrapped layout (it
  threw `java.util.NoSuchElementException` on some grouped, labelled graphs).
  The unwrapped layout already in hand is used instead.

## 0.8.1 - 2026-10-03

- Links run straight into their end: the few-pixel step ELK left before an
  arrow, most visible where a link entered a group, is snapped out.

## 0.8.0 - 2026-10-02

- Rebuild the `topology` figure (alias `diagram`) as a graph engine: a `.fig`
  text format, ELK automatic layout with orthogonal routing, measured labels
  kept off lines, nested groups, box nodes, a title header, dark-theme-aware
  colors, and a fit that never clips. Long figures wrap into rows before text
  is shrunk. Thirteen new glyphs.
- Links can end at a group: name the group's label in `.fig` (its id in JSON) and
  the line stops at the group's border. Group labels slide clear of crossing
  lines, and unrelated links that nearly meet on one track are pulled apart.
- Validate every figure spec, with suggestions, and report every `.fig`
  problem at once with line numbers. Print warnings for overlaps, small text,
  empty groups and self-links; `--strict` fails on any warning and writes
  nothing.
- Breaking: `TEMPLATES.topology` is no longer a render function, `figureSize`
  returns `null` for content-sized graphs, unknown spec keys throw, a spec
  with links but no layout gets `auto` layout, and `style: dashed` draws real
  dashes (`dotted` keeps the old look). See "Upgrading from 0.7" in the README.

## 0.7.0 - 2026-08-09

- Add `renderMarkSet`, the shared in-memory mark contract now used by both
  built-in generators and available to consumers with custom asset layouts.
- Upgrade Sharp to the patched 0.35 line so consumers no longer need to
  override branding-engine's image runtime to remediate inherited libvips
  vulnerabilities. Align the documented and tested runtime floor with Sharp
  and Playwright by requiring Node 20.9 or newer.
- Declare Playwright as an optional peer instead of an optional runtime
  dependency. Browser-backed sheets and cards still provide an actionable
  install error, while mark-only consumers no longer download browser tooling.

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
