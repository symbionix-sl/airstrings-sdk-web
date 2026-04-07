# Changelog

All notable changes to `@airstrings/web` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/symbionix-sl/airstrings-sdk-web/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/symbionix-sl/airstrings-sdk-web/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/symbionix-sl/airstrings-sdk-web/releases/tag/v0.1.0
