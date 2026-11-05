import { constants, copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, utimesSync } from 'node:fs'
import { join, resolve } from 'node:path'

const retainedName = /^[a-zA-Z0-9][a-zA-Z0-9._-]*-[a-zA-Z0-9_-]{8,}\.(?:js|css|svg|woff2|png)$/

export function retainedReactAsset(relative) {
  return relative.startsWith('assets/') && retainedName.test(relative.slice('assets/'.length))
}

export function retainReactAssets(archiveRoot, { frontendRoot = resolve('dist/frontend'), now = Date.now() } = {}) {
  mkdirSync(archiveRoot, { recursive: true, mode: 0o700 })
  const sourceRoot = join(frontendRoot, 'assets')
  const current = new Set()
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !retainedName.test(entry.name)) continue
    current.add(entry.name)
    const source = join(sourceRoot, entry.name), target = join(archiveRoot, entry.name)
    try { copyFileSync(source, target, constants.COPYFILE_EXCL) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (!readFileSync(source).equals(readFileSync(target))) throw Error('Conflicting immutable UI asset: ' + entry.name)
    }
    utimesSync(target, now / 1000, now / 1000)
  }
  const cutoff = now - 30 * 24 * 60 * 60 * 1000
  for (const entry of readdirSync(archiveRoot, { withFileTypes: true })) {
    if (entry.isFile() && retainedName.test(entry.name) && !current.has(entry.name)) {
      const target = join(archiveRoot, entry.name)
      if (statSync(target).mtimeMs < cutoff) unlinkSync(target)
    }
  }
  return current.size
}
