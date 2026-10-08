# Contributing

## Local Setup

```bash
npm ci
npm test
```

Node.js 24 or newer is required. The source is TypeScript, and tests run it
directly through Node's type stripping, so there is no build step before
`npm test`. Browser-free tests do not require Playwright or Chromium.

The compiler runs with `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`
and `noUnusedParameters`. Index into arrays with destructuring, `.at()`,
`entries()` or `required()` from `src/lib/guards.ts`, not with `!`, `as` or
`any`. Prefer the platform to hand-written helpers: `util.parseArgs`,
`import.meta.dirname`, `Map.groupBy`, `toSorted`, `Array.fromAsync`.

Tests share `test/support.ts`: `scratch()` is a temp directory removed when the
test ends (`await using dir = await scratch('name')`), `setEnv()` restores an
environment variable, and `browserOrSkip()` launches Chromium or skips the test.

## Source and Build Layout

| Path | Holds |
|---|---|
| `src/` | TypeScript source; `src/index.ts` is the library entry and `src/cli.ts` the CLI |
| `test/` | Tests, written in TypeScript |
| `scripts/` | Build helpers |
| `dist/` | Compiled JavaScript and `.d.ts` files, built by `npm run build` and ignored by git |

Node does not strip types from files under `node_modules`, so the published
package ships `dist/` (compiled by `tsc`), not the `.ts` source. Relative
imports in `src/` end in `.ts`; the build rewrites them to `.js`.

| Command | Does |
|---|---|
| `npm run typecheck` | Type-check `src/`, `test/` and `scripts/` with strict settings |
| `npm run build` | Clean `dist/`, compile `src/` into it, and point the declarations at `.js` (no POSIX shell needed) |
| `npm test` | Run every test (the example snapshot needs Chromium) |
| `npm run test:core` | Run the browser-free tests |
| `npm run check` | Typecheck, build, test, and `npm pack --dry-run` |

## Before Opening a Pull Request

```bash
npm run check
npm audit --omit=dev
```

Confirm that:

- new behavior has focused tests
- the Severino Labs example still regenerates identically
- `npm pack --dry-run` contains only intended package files (`dist/`, `assets/`, `examples/`)
- README and changelog updates describe user-facing changes
- GitHub Actions remain pinned to commit SHAs

## Regenerating the Example

```bash
node src/cli.ts build \
  --config examples/severino-labs/brand.json \
  --out examples/severino-labs/generated
```

Commit generated changes only when they are expected.

## Release

Releases use npm Trusted Publishing from `.github/workflows/release.yml`.

```bash
npm version patch
git push --follow-tags
```

Use `minor` for backward-compatible features and `major` for breaking changes.
Do not add an npm token to the repository or GitHub Actions.
