export type DraftKind = 'monthly' | 'cash' | 'card' | 'detail' | 'item' | 'scenario' | 'savings' | 'security'
export interface LocalDraftProtection { durable:()=>boolean; flush:()=>Promise<boolean>; status:string; discard?:()=>Promise<boolean>; export?:()=>unknown; restored?:boolean }
export interface DraftEntry { local?:LocalDraftProtection; mutationPending?:boolean; kind: DraftKind; dirty: boolean; busy: boolean; saveError?: string; discard: () => void; save?: () => Promise<boolean> }
/** In-memory lifecycle only. It never persists financial records or saves implicitly. */
export class DraftRegistry {
  private entries = new Map<string, DraftEntry>()
  private listeners = new Set<() => void>()
  private running = false
  private snapshot = { durable: true, localStatuses: [] as string[], dirty: false, busy: false, canSave: false, count: 0, errors: [] as string[] }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  set(id: string, entry: DraftEntry) { this.entries.set(id, entry); this.update() }
  remove(id: string) { this.entries.delete(id); this.update() }
  private update() {
    const entries = [...this.entries.values()], dirty = entries.filter(e => e.dirty)
    const next = { durable: !entries.some(e=>e.busy||e.mutationPending)&&dirty.every(e=>e.local?.durable()===true), localStatuses: [...new Set(entries.map(e=>e.local?.status).filter((v):v is string=>!!v))], dirty: dirty.length > 0, busy: this.running || entries.some(e => e.busy), canSave: dirty.length > 0 && dirty.every(e => !!e.save), count: dirty.length, errors: [...new Set(dirty.map(e=>e.saveError?.trim()).filter((v):v is string=>!!v))] }
    if (JSON.stringify(next) !== JSON.stringify(this.snapshot)) { this.snapshot = next; this.listeners.forEach(listener => listener()) }
  }
  exportLocal = () => ({format:'budgit-form-drafts',version:1,drafts:[...this.entries.values()].filter(e=>e.dirty&&e.local?.export).map(e=>e.local!.export!())})
  isDurable = () => !this.running && [...this.entries.values()].every(e=>!e.busy&&!e.mutationPending&&(!e.dirty||e.local?.durable()===true))
  async flushAll() {
    if (this.running || [...this.entries.values()].some(e=>e.busy||e.mutationPending)) return false
    const dirty=[...this.entries.values()].filter(e=>e.dirty)
    if (dirty.some(e=>!e.local)) return false
    this.running=true;this.update()
    try { for (const entry of dirty) if (!await entry.local!.flush()) return false
      return [...this.entries.values()].every(e=>!e.busy&&!e.mutationPending&&(!e.dirty||e.local?.durable()===true))
    } finally {this.running=false;this.update()}
  }
  async discardAllAsync() {
    if(this.getSnapshot().busy)return false
    for(const [id,entry] of [...this.entries])if(entry.dirty){
      if(entry.local?.discard){if(!await entry.local.discard())return false}else entry.discard()
      if(this.entries.get(id)===entry)this.entries.set(id,{...entry,dirty:false})
    }
    this.update();return true
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
        if (current === entry) this.entries.set(id, { ...current, dirty: false, busy: false })
      }
      return ![...this.entries.values()].some(e=>e.dirty)
    } finally { this.running = false; this.update() }
  }
}
