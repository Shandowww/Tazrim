export type DraftKind = 'monthly' | 'cash' | 'card' | 'detail' | 'item' | 'scenario' | 'savings' | 'security'
export interface DraftEntry { kind: DraftKind; dirty: boolean; busy: boolean; discard: () => void; save?: () => Promise<boolean> }
/** In-memory lifecycle only. It never persists financial records or saves implicitly. */
export class DraftRegistry {
  private entries = new Map<string, DraftEntry>()
  private listeners = new Set<() => void>()
  private running = false
  private snapshot = { dirty: false, busy: false, canSave: false, count: 0 }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  set(id: string, entry: DraftEntry) { this.entries.set(id, entry); this.update() }
  remove(id: string) { this.entries.delete(id); this.update() }
  private update() {
    const entries = [...this.entries.values()], dirty = entries.filter(e => e.dirty)
    const next = { dirty: dirty.length > 0, busy: this.running || entries.some(e => e.busy), canSave: dirty.length > 0 && dirty.every(e => !!e.save), count: dirty.length }
    if (JSON.stringify(next) !== JSON.stringify(this.snapshot)) { this.snapshot = next; this.listeners.forEach(listener => listener()) }
  }
  discardAll() {
    if (this.getSnapshot().busy) return false
    for (const [id, entry] of [...this.entries]) if (entry.dirty) { entry.discard(); if (this.entries.has(id)) this.entries.set(id, { ...entry, dirty: false }) }
    this.update(); return true
  }
  async saveAll() {
    if (this.getSnapshot().busy || !this.getSnapshot().canSave) return false
    this.running = true; this.update()
    try {
      for (const [id, entry] of [...this.entries]) if (entry.dirty) {
        if (!entry.save || !await entry.save()) return false
        const current = this.entries.get(id)
        if (current) this.entries.set(id, { ...current, dirty: false, busy: false })
      }
      return true
    } finally { this.running = false; this.update() }
  }
}
