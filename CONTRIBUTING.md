# Contributing

## Local Setup

```bash
npm ci
npm test
```

Node.js 18 or newer is supported. Browser-free tests do not require Playwright
or Chromium.

## Before Opening a Pull Request

```bash
npm run check
npm audit --omit=dev
```

Confirm that:

- new behavior has focused tests
- the Severino Labs example still regenerates identically
- `npm pack --dry-run` contains only intended package files
- README and changelog updates describe user-facing changes
- GitHub Actions remain pinned to commit SHAs

## Regenerating the Example

```bash
node bin/cli.mjs build \
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
