# @airstrings/web

[![npm](https://img.shields.io/npm/v/@airstrings/web.svg)](https://www.npmjs.com/package/@airstrings/web)
[![license](https://img.shields.io/npm/l/@airstrings/web.svg)](./LICENSE)

The official **AirStrings Web SDK** — a tiny, framework-agnostic TypeScript library that fetches, verifies, caches, and serves Ed25519-signed localized string bundles from the [AirStrings](https://airstrings.com) CDN.

- **Signed bundles.** Every bundle is verified with Ed25519 before strings are exposed. Tampered or unsigned content is rejected, never served.
- **Cache-first.** Bundles are cached in IndexedDB (browser) or memory (Node.js / SSR). Cached bundles are re-verified on every load.
- **Anti-downgrade.** A higher-revision bundle is never replaced by a lower one.
- **ICU MessageFormat.** Plurals, selects, number/date formatting via [`intl-messageformat`](https://www.npmjs.com/package/intl-messageformat).
- **Tree-shakeable ESM + CJS.** TypeScript declarations included. No DOM dependencies — works in Node 18+ and modern browsers.
- **Zero ceremony.** One class, one config, one method to format a string.

---

## Install

```bash
npm install @airstrings/web
# or
pnpm add @airstrings/web
# or
yarn add @airstrings/web
```

**Requirements:** Node.js 18+ (uses global `fetch`) or any modern browser supporting ES2020.

---

## Quick start

### Node.js (server-side, e.g. Fastify)

```ts
import { AirStrings } from '@airstrings/web'

const airstrings = new AirStrings({
  organizationId: 'org_xxx',
  projectId: 'proj_xxx',
  environmentId: 'env_xxx',
  publicKeys: ['BASE64URL_ED25519_PUBLIC_KEY'],
  locale: 'en',
})

// Wait for the first bundle to load
await airstrings.refresh()

console.log(airstrings.t('greeting'))
// → "Hello!"

console.log(airstrings.format('items.count', { count: 3 }))
// → "3 items"
```

In Node, `AirStrings` automatically falls back to an in-memory cache (no `IndexedDB` available). The cache lives for the lifetime of the process — fine for long-running servers, gone on restart.

### Browser

```ts
import { AirStrings } from '@airstrings/web'

const airstrings = new AirStrings({
  organizationId: 'org_xxx',
  projectId: 'proj_xxx',
  environmentId: 'env_xxx',
  publicKeys: ['BASE64URL_ED25519_PUBLIC_KEY'],
  locale: navigator.language,
})

airstrings.on('strings:updated', ({ locale, revision }) => {
  console.log(`Loaded ${locale} (revision ${revision})`)
  document.getElementById('greeting')!.textContent = airstrings.t('greeting')
})
```

In the browser, bundles are cached in IndexedDB and the SDK automatically refreshes them when the document becomes visible.

---

## API

### `new AirStrings(config)`

| Field            | Type                       | Required | Description |
|------------------|----------------------------|----------|-------------|
| `organizationId` | `string`                   | yes      | Your AirStrings organization id. |
| `projectId`      | `string`                   | yes      | Project id. |
| `environmentId`  | `string`                   | yes      | Environment id (e.g. production, staging). |
| `publicKeys`     | `readonly string[]`        | yes      | One or more base64url-encoded Ed25519 public keys. Multiple keys supported for rotation. |
| `locale`         | `string`                   | yes      | Initial BCP-47 locale (e.g. `"en"`, `"fr-CA"`). |
| `apiBaseURL`     | `string`                   | no       | Override the API base URL (defaults to `https://api.airstrings.com`). |
| `logger`         | `(level, msg, ctx) => void`| no       | Optional logger. Default: no-op. |
| `store`          | `BundleStore`              | no       | Inject a custom cache backend. |

### Methods

- **`t(key: string): string`** — Returns the raw localized string for `key`, or `key` itself as fallback.
- **`format(key: string, args?: Record<string, unknown>): string`** — Formats an ICU MessageFormat string. For plain `text` strings, returns the value as-is. Never throws — falls back to the raw pattern on formatting errors, or to the key name if missing.
- **`refresh(): Promise<void>`** — Forces a bundle refresh from the CDN. Honors ETag/304.
- **`setLocale(bcp47: string): Promise<void>`** — Switches to a new locale. Loads from cache immediately if available, then refreshes.
- **`destroy(): void`** — Removes browser visibility listeners. Call on unmount in long-lived UIs.
- **`on(event, handler): () => void`** — Subscribe to events. Returns an unsubscribe function.

### Properties

- **`strings: Readonly<Record<string, string>>`** — Frozen snapshot of the loaded strings.
- **`locale: string`** — Currently active locale.
- **`revision: number`** — Revision number of the loaded bundle.
- **`isReady: boolean`** — `true` once a bundle has loaded (from cache or network).

### Events

```ts
type AirStringsEvents = {
  'strings:updated': { locale: string; revision: number }
  'strings:error':   { error: AirStringsError }
}
```

---

## Security model

- Bundles are signed with Ed25519 over a deterministic canonical JSON representation that covers `format_version`, `project_id`, `locale`, `revision`, `created_at`, and `strings`. This prevents tampering, locale swapping, and bundle substitution.
- Cached bundles are **re-verified on every load** (defense in depth).
- Unknown `key_id` or `format_version` ⇒ bundle rejected.
- Signature failures never throw from the public API — the SDK keeps the previous good bundle and emits `strings:error`.
- Public keys are provided by you at init. The SDK never logs them.

See the bundle format contract in the AirStrings docs for the full specification.

---

## Framework integration

The SDK exposes data and events, not UI bindings. Integration with React, Vue, or Svelte is a few lines:

**React (`useSyncExternalStore`):**

```ts
const useStrings = (a: AirStrings) =>
  useSyncExternalStore(
    cb => a.on('strings:updated', cb),
    () => a.strings,
    () => a.strings,
  )
```

**Vue:**

```ts
const strings = shallowRef(airstrings.strings)
airstrings.on('strings:updated', () => { strings.value = airstrings.strings })
```

---

## License

MIT © [Symbionix](https://symbionix.io)

## Links

- **Repository:** https://github.com/symbionix-sl/airstrings-sdk-web
- **Issues:** https://github.com/symbionix-sl/airstrings-sdk-web/issues
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md)
