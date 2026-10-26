/** Static glass layer for account previews; wallet baking arrives with the wallet port. */
export function GlassSurface({ baked: _baked, glassId: _glassId }: { baked?: boolean; glassId?: string }) {
  return <span aria-hidden className="glass" data-renderer="static" />
}
