import http from 'node:http'
import net from 'node:net'
import { AirStrings } from '../dist/index.mjs'

const env = process.env
const missing = ['ORG', 'PROJ', 'ENV', 'LOCALE', 'PUBLIC_KEY', 'FALLBACK_BASE']
  .map((name) => `AIRSTRINGS_E2E_${name}`)
  .filter((name) => !env[name])
if (missing.length) {
  console.log(`FAIL missing env: ${missing.join(', ')}`)
  process.exit(1)
}
const minElapsed = Number(env.AIRSTRINGS_E2E_MIN_ELAPSED ?? 4.5)
const maxElapsed = Number(env.AIRSTRINGS_E2E_MAX_ELAPSED ?? 15)

setTimeout(() => {
  console.log('FAIL watchdog: not finished within 40s')
  process.exit(1)
}, 40000)

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const sockets = new Set()
const hang = net.createServer((socket) => sockets.add(socket))
const cdnBase = env.AIRSTRINGS_E2E_CDN_BASE ?? `http://127.0.0.1:${await listen(hang)}`
const stub = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ cdn_base_url: cdnBase, fallback_base_url: env.AIRSTRINGS_E2E_FALLBACK_BASE }))
})
const apiBaseURL = `http://127.0.0.1:${await listen(stub)}`

const logs = []
const logger = (level, message) => {
  logs.push({ level, message })
  if (level === 'warn' || level === 'error') console.log(`[${level}] ${message}`)
}

const t0 = performance.now()
const sdk = new AirStrings({
  organizationId: env.AIRSTRINGS_E2E_ORG,
  projectId: env.AIRSTRINGS_E2E_PROJ,
  environmentId: env.AIRSTRINGS_E2E_ENV,
  locale: env.AIRSTRINGS_E2E_LOCALE,
  publicKeys: [env.AIRSTRINGS_E2E_PUBLIC_KEY],
  apiBaseURL,
  seedDir: false,
  logger,
})
await sdk.whenReady()
const elapsed = (performance.now() - t0) / 1000
const failedOver = logs.some((log) => log.level === 'warn' && log.message.includes('retrying on fallback'))

const mark = logs.length
const t1 = performance.now()
await sdk.refresh()
const refreshElapsed = (performance.now() - t1) / 1000
const upToDate = logs.slice(mark).some((log) => log.message.startsWith('Bundle up to date'))

const checks = {
  ready: sdk.isReady,
  revision: sdk.revision > 0,
  elapsed: elapsed >= minElapsed && elapsed <= maxElapsed,
  failover: failedOver,
  refreshFast: refreshElapsed < 2,
  notModified: upToDate,
}
const failed = Object.keys(checks).filter((name) => !checks[name])
console.log(`${failed.length ? `FAIL [${failed.join(', ')}]` : 'PASS'} ready=${sdk.isReady} revision=${sdk.revision} elapsed=${elapsed.toFixed(2)}s (bounds ${minElapsed}-${maxElapsed}) failover=${failedOver} refresh=${refreshElapsed.toFixed(2)}s notModified=${upToDate}`)

sockets.forEach((socket) => socket.destroy())
hang.close()
stub.close()
process.exit(failed.length ? 1 : 0)
