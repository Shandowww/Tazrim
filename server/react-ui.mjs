import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { retainedReactAsset } from './react-asset-archive.mjs'

const root = resolve('dist/frontend')
const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json; charset=utf-8' }
const mime = path => types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream'

/** Called only after createApp has verified the signed-in user and allowlist. */
export function reactUiResponse(request, { assetArchiveRoot, frontendRoot = root } = {}) {
  const path = new URL(request.url).pathname
  if (!(path === '/next' || path.startsWith('/next/') || path.startsWith('/ui-assets/'))) return null
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } })
  const asset = path.startsWith('/ui-assets/')
  const relative = asset ? path.slice('/ui-assets/'.length) : 'index.html'
  if (!relative || relative.length > 256 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(relative) || relative.split('/').some(segment => segment === '.' || segment === '..' || !segment)) {
    return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const file = resolve(frontendRoot, relative)
  if (!file.startsWith(frontendRoot + sep)) return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  try {
    let bytes
    try { bytes = readFileSync(file) }
    catch (error) {
      if (error.code !== 'ENOENT' || !assetArchiveRoot || !asset || !retainedReactAsset(relative)) throw error
      bytes = readFileSync(resolve(assetArchiveRoot, relative.slice('assets/'.length)))
    }
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: {
        'Content-Type': mime(relative),
        'Cache-Control': asset && /\/assets\/.+[-][a-zA-Z0-9_-]{8,}\./.test('/' + relative) ? 'private, max-age=31536000, immutable' : 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    throw error
  }
}
