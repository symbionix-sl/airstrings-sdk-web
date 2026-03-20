# AirStrings Web SDK

TypeScript library that fetches, verifies, caches, and exposes Ed25519-signed localized string bundles. Framework-agnostic, zero runtime dependencies, tree-shakeable ESM.

**Platform:** Browser (ES2020+) + Node.js 18+ | **Language:** TypeScript 5.x (strict mode) | **Dependencies:** `@noble/ed25519` (crypto only)

## Code Style

- **Indentation:** 2 spaces. No tabs.
- **Quotes:** Single quotes for strings, backticks only when interpolating.
- **Semicolons:** No semicolons (rely on ASI).
- **Trailing commas:** Always (ES2017+).
- **Naming:** camelCase for variables/functions, PascalCase for classes/types/interfaces, UPPER_SNAKE for constants.
- **Imports:** Named imports only. No default exports. No barrel files (`index.ts` re-exports are the sole exception at package root).
- **File naming:** kebab-case (e.g., `bundle-verifier.ts`, `canonical-json.ts`).

## Non-Negotiables

Inherited from the parent project — these override everything else:

1. **Bundles are always signed.** No unsigned delivery path. Verification failure = hard error. Never expose unverified strings.
2. **Signature verification order matters.** key_id lookup -> canonical JSON -> Ed25519 verify -> format_version check. Do not reorder.
3. **Re-verify on cache load.** Defense in depth — cached bundles are re-verified every time they're loaded from storage.
4. **Anti-downgrade.** Never replace a higher-revision bundle with a lower one for the same locale.
5. **Never throw from public API, never block.** Network errors are silent. Signature failures reject the bundle but keep cached data. No cache + no network = key names as fallback.
6. **No secrets in source.** Public keys are provided by the integrator at init. Never hardcode, log, or embed keys.
7. **Tests accompany every deliverable.** No merge without tests covering the new behavior.

## Architecture

```
src/
├── airstrings.ts               # Public API — the only exported class
├── airstrings-config.ts        # Init config (projectId, publicKeys, locale)
├── airstrings-error.ts         # Public error types
├── types.ts                    # Shared internal type definitions
├── models/
│   ├── string-bundle.ts        # Bundle envelope type (internal)
│   └── canonical-json.ts       # Deterministic serializer for signature verification
├── networking/
│   └── bundle-fetcher.ts       # fetch() wrapper with ETag/304 support
├── security/
│   ├── bundle-verifier.ts      # Ed25519 verification via @noble/ed25519
│   └── base64url.ts            # RFC 4648 §5 codec
├── storage/
│   ├── bundle-store.ts         # Storage interface + factory
│   ├── idb-store.ts            # IndexedDB implementation (browser)
│   └── memory-store.ts         # In-memory fallback (SSR / Node / test)
└── events/
    └── emitter.ts              # Minimal typed event emitter (internal)
```

### Layer Rules

| Layer | May depend on | Never depends on |
|-------|---------------|-------------------|
| `models/` | `types.ts` only | Networking, Storage, Security, Events |
| `security/` | Models, `@noble/ed25519` | Networking, Storage, Events |
| `networking/` | `types.ts` | Security, Storage, Models, Events |
| `storage/` | `types.ts` | Security, Networking, Models, Events |
| `events/` | Nothing | Everything else |
| `airstrings.ts` | All internal layers | Nothing depends on it |

`@noble/ed25519` is isolated to `security/bundle-verifier.ts`. No other file imports it.

### Data Flow

```
CDN -> BundleFetcher (Response + headers) -> JSON.parse (StringBundle) -> BundleVerifier -> BundleStore (save) -> AirStrings.strings (readonly record)
```

Every step is a distinct responsibility. Data flows in one direction. The `AirStrings` class orchestrates but delegates all work.

## Security Rules

These are hard constraints. Violating any of them is a security bug.

- **Canonical JSON must be byte-identical across platforms.** The serializer in `canonical-json.ts` is the source of truth. Keys sorted lexicographically at every level. No whitespace. Integers as integers. RFC 8259 string escaping only. Any change requires updating the contract in `docs/contracts/bundle-format.md` and testing against the backend's output.
- **Signature covers metadata.** format_version, project_id, locale, revision, created_at are all in the signed content. This prevents bundle substitution, locale swaps, and downgrade attacks.
- **Unknown key_id = reject entirely.** Do not fall back to trying other keys.
- **Unknown format_version = reject entirely.** Even if the signature is valid.
- **Base64url signatures must decode to exactly 64 bytes.** Reject anything else.
- **Cache is untrusted storage.** Always re-verify after loading from storage. If verification fails, delete the cache entry and fetch fresh.
- **No `eval`, no `Function()`, no `innerHTML`.** Bundle content is plain text. Never interpret string values as code or HTML.
- **No dynamic `import()` of user-provided paths.** All imports are static.
- **Subresource integrity.** Published npm package includes a lockfile hash. Consumers should use `npm audit` and lock deps.

## Build & Distribution

- **Bundler:** tsup (esbuild-based). Outputs ESM (`.mjs`) + CJS (`.cjs`) + type declarations (`.d.ts`).
- **Entry point:** `src/index.ts` — re-exports only the public API surface.
- **Target:** ES2020. No polyfills. Consumers bring their own if needed.
- **Tree-shaking:** ESM output is fully tree-shakeable. No side effects at module scope (declare `"sideEffects": false` in `package.json`).
- **Source maps:** Included in published package for debugging.
- **Package exports:** Use the `exports` field in `package.json` with `import`, `require`, and `types` conditions.
- **Build:** `npm run build` from `sdks/airstrings-sdk-web/`.
- **Test:** `npm test` from `sdks/airstrings-sdk-web/`.
- **Lint:** `npm run lint` — ESLint with strict TypeScript config.
- **Type check:** `npm run typecheck` — `tsc --noEmit`.

## Storage Strategy

IndexedDB is the primary cache backend (async, large capacity, doesn't block main thread). Fallback chain:

1. **IndexedDB** (`idb-store.ts`) — browser default. Database: `airstrings`, object store: `bundles`, key: `{projectId}:{locale}`.
2. **Memory** (`memory-store.ts`) — automatic fallback when IndexedDB is unavailable (SSR, Node.js, private browsing edge cases, tests).

Storage is accessed through a `BundleStore` interface. The factory in `bundle-store.ts` selects the implementation at init. Consumers can inject a custom store via config for testing or custom environments.

### Storage interface

```typescript
interface BundleStore {
  load(projectId: string, locale: string): Promise<StoredBundle | null>
  save(projectId: string, locale: string, bundle: StoredBundle): Promise<void>
  delete(projectId: string, locale: string): Promise<void>
}
```

`StoredBundle` contains the raw bundle JSON, the parsed bundle, and the ETag (if any).

## Testing Standards

### What to test

- **canonical-json:** Byte-exact output against the contract example in `docs/contracts/bundle-format.md`. Key sorting, no whitespace, integer format, string escaping, control character escaping, empty strings object, Unicode handling.
- **bundle-verifier:** Valid signature passes. Wrong key fails. Unknown key_id fails. Unsupported format_version fails. Invalid base64url fails. Tampered strings fail. Test with real `@noble/ed25519` keypairs — no mocking crypto.
- **bundle-store:** Save/load round-trip. Null etag. Per-locale isolation. Overwrite. Delete. Corrupted data degrades gracefully. Both IndexedDB and memory implementations.
- **base64url:** Encode/decode round-trip. URL-safe characters. Missing padding. 64-byte signatures produce exactly 86 chars.
- **bundle-fetcher:** 200 with body. 304 not modified. Network failure. Invalid JSON. ETag forwarding. Timeout.
- **airstrings:** String lookup fallback to key name. String lookup with loaded strings. Initial state. Locale switching. Event emission. Refresh lifecycle. Anti-downgrade logic.

### How to test

- **Runner:** Vitest (fast, native ESM, TypeScript-first).
- **Crypto in tests:** Generate real Ed25519 keypairs with `@noble/ed25519` and sign real canonical JSON. Never mock the crypto layer.
- **Network in tests:** Mock `fetch` via `vi.stubGlobal('fetch', ...)` or `msw` (Mock Service Worker) for integration tests. Never mock at the `BundleFetcher` class level for unit tests of the fetcher itself.
- **Storage in tests:** Use `memory-store.ts` for unit tests. Use `fake-indexeddb` for IndexedDB integration tests.
- **No test pollution:** Each test gets its own `AirStrings` instance. No shared mutable state between tests.
- **Coverage:** Vitest built-in coverage via `v8`. Target branches and edge cases, not line percentages.

## Event Model

No framework dependency. The SDK uses a minimal typed event emitter pattern:

```typescript
type AirStringsEvents = {
  'strings:updated': { locale: string; revision: number }
  'strings:error': { error: AirStringsError }
}
```

Consumers subscribe via `airstrings.on('strings:updated', handler)` and unsubscribe via the returned cleanup function. This integrates naturally with React (`useEffect` cleanup), Vue (`onUnmounted`), Svelte (`onDestroy`), and vanilla JS.

## Reactivity Integration

The SDK exposes data, not UI bindings. Framework integrations are out of scope for the core package. However, the event emitter + getter pattern makes integration trivial:

- **React:** `useSyncExternalStore` with `subscribe` = `on('strings:updated', ...)` and `getSnapshot` = `airstrings.strings`.
- **Vue:** `shallowRef` updated in `on('strings:updated', ...)` callback.
- **Svelte:** Writable store updated in `on('strings:updated', ...)` callback.

These wrappers are 5-10 lines each. Separate `@airstrings/react`, `@airstrings/vue` packages in v2 if demand warrants.

## Patterns to Follow

- **Public API surface is minimal.** Only `AirStrings`, `AirStringsConfig`, `AirStringsError`, and event types are exported. Everything else is internal.
- **Functions for stateless utilities.** `canonicalJson`, `base64url` are pure functions, not classes.
- **Classes for stateful services.** `BundleFetcher`, `BundleStore` implementations, `AirStrings`.
- **Immutable by default.** `readonly` on all properties that shouldn't mutate. `as const` for literal types. `Readonly<Record<...>>` for the strings dictionary.
- **No `any`.** Use `unknown` and narrow with type guards. The only acceptable `any` is in third-party type declarations you don't control.
- **No `class` for pure data.** Use `type` or `interface` for data shapes. Classes are for things with behavior and lifecycle.
- **No protocol abstractions for v1.** Concrete types everywhere, except `BundleStore` (needs interface for IndexedDB/memory swap). Protocol extraction happens when we need test doubles or multiple implementations.
- **Errors are structured.** `AirStringsError` uses a discriminated union with `code` field for programmatic handling. Human-readable `message` for logging.
- **Logging is opt-in.** No `console.log` in production code. Provide a `logger` option in config that accepts `(level, message, context) => void`. Default: no-op.
- **Consistency and predictability.** Follow established patterns exactly so that AI agents (and humans) don't make mistakes or invent things. When a pattern exists, replicate it; don't improvise.

## Patterns to Avoid

- **Don't add framework-specific code.** No React hooks, Vue composables, or Svelte stores in the core package.
- **Don't use `JSON.stringify` for canonical JSON.** `JSON.stringify` does not guarantee key ordering. The hand-rolled serializer in `canonical-json.ts` exists for a reason.
- **Don't add polyfills.** ES2020+ is the target. No `core-js`, no `regenerator-runtime`. Consumers polyfill if they need to support older browsers.
- **Don't use `localStorage`.** It's synchronous, blocks main thread, and has a 5MB limit. IndexedDB is the right choice.
- **Don't use `window` or `document` directly.** Guard with `typeof` checks for SSR/Node compatibility. Abstract behind the storage layer.
- **Don't retry on signature failure.** If verification fails, the bundle is rejected. Retrying the same CDN edge will return the same bytes.
- **Don't log secrets, keys, or signature bytes.** Log key_id (identifier), revision, locale — never raw key material or signature data.
- **Don't use barrel files for internal modules.** Only `src/index.ts` re-exports. Internal modules import directly from their source file.
- **Don't add `default` exports.** Named exports only — better tree-shaking, better refactoring, no ambiguity.
- **Don't mutate after construction.** `AirStrings.strings` returns a frozen snapshot. Locale changes create a new fetch cycle, not an in-place mutation.

## v1 Scope Boundaries

**In v1:** Fetch, verify, cache, serve strings. One locale active at a time. Visibility-based refresh (document focus). ETag-based conditional requests. Key rotation via multiple configured public keys. IndexedDB cache with memory fallback.

**Not in v1 (do not build):** Analytics/telemetry, Service Worker integration, push-triggered updates, multiple simultaneous locales, React/Vue/Svelte wrapper packages, SSR string injection, server-driven locale negotiation, Web Worker offloading, bundle prefetching for multiple locales.

## ICU MessageFormat Support

Strings in the bundle now have a `format` field: `"text"` (plain) or `"icu"` (ICU MessageFormat).

### Bundle format change

String values in the bundle envelope changed from plain strings to objects:

```json
{
  "strings": {
    "welcome": { "value": "Welcome!", "format": "text" },
    "items.count": { "value": "{count, plural, one {# item} other {# items}}", "format": "icu" }
  }
}
```

This affects `string-bundle.ts` (type definitions), `canonical-json.ts` (signature serialization), and the `AirStrings` strings record.

### API design

- `strings` record and key lookup: return the **raw value** (plain text or ICU pattern). This preserves backward compatibility.
- Add a new formatting method: `format(key: string, args: Record<string, unknown>): string` that:
  - For `"text"` format: returns the value as-is (ignores args)
  - For `"icu"` format: formats using `intl-messageformat` library and returns the formatted string
  - On formatting failure: returns the raw pattern string (never throws)

### Platform ICU runtime

Use the `intl-messageformat` package from FormatJS. This is the standard ICU MessageFormat implementation for JavaScript. It supports all ICU features: plurals, selects, number/date/time formatting. Add it as a dependency alongside `@noble/ed25519`.

### Canonical JSON update

Each string in the canonical JSON is now an object with `"format"` and `"value"` keys (sorted lexicographically):

```
"key":{"format":"text","value":"Hello"}
```

Update `canonical-json.ts` to serialize string entries as `{"format":..., "value":...}` objects instead of bare strings.
