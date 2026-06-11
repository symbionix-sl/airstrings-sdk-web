# Changelog

All notable changes to `@airstrings/web` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-10

### Added
- Bundled fallback (seed): the SDK can serve published, signed bundles committed into the app repo, so cold starts with no network render real strings instead of key names (bundled-fallback contract v1).
- `seed` config option: pre-loaded bundle contents (parsed objects or raw JSON strings) supplied at build time — the browser path, no filesystem access.
- `seedDir` config option (Node only): seed directory override, or `false` to disable seeding entirely. When neither `seed` nor `seedDir` is given, Node builds probe `<cwd>/airstrings/bundles/` automatically.
- Every seed candidate runs the full verification pipeline (key_id lookup, Ed25519 signature, format_version), plus `project_id` and locale checks. Invalid seeds are rejected with `strings:error` and never cached.
- New error codes: `SEED_PROJECT_MISMATCH`, `SEED_LOCALE_MISMATCH`.
- Anti-downgrade extended to a three-way race between cache, seed, and network: highest verified revision wins; ties go to the cache; a winning seed is persisted through the normal cache-write path.

## [0.1.1] - 2026-04-07

### Changed
- CI: switched npm publishing to Trusted Publishing (OIDC) — no long-lived tokens.
- CI: bumped Node from 20 to 22 (current LTS).

## [0.1.0] - 2026-04-07

### Added
- Initial release of the AirStrings Web SDK.
- Fetches Ed25519-signed string bundles from the AirStrings CDN.
- Verifies signatures with `@noble/ed25519` against integrator-supplied public keys.
- Supports key rotation via multiple configured public keys (`key_id` lookup).
- Caches bundles in IndexedDB (browser) with automatic in-memory fallback (Node.js / SSR).
- Re-verifies cached bundles on load (defense in depth).
- Anti-downgrade protection: never replaces a higher-revision bundle with a lower one.
- ICU MessageFormat support via `intl-messageformat` (`format()` method).
- Visibility-based refresh in browsers (refreshes when document becomes visible).
- ETag-based conditional requests (`If-None-Match` / 304).
- Typed event emitter (`strings:updated`, `strings:error`).
- Dual ESM + CJS distribution with TypeScript declarations.
- Node.js 18+ and modern browsers (ES2020+).

[Unreleased]: https://github.com/symbionix-sl/airstrings-sdk-web/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/symbionix-sl/airstrings-sdk-web/compare/v0.1.2...v0.3.0
[0.1.1]: https://github.com/symbionix-sl/airstrings-sdk-web/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/symbionix-sl/airstrings-sdk-web/releases/tag/v0.1.0
