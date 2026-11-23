/*
 * Rutiq's mark: the owner's logo (four shards forming an "R"). public/brand/mark.webp is the white mark on a transparent canvas,
 * drawn here as a CSS mask so it follows currentColor; public/brand/mark-tile.webp is the orange tile. Both are built by
 * referensi/tools/apply-owner-assets.mjs from the owner's files.
 */
export function MarkGlyph({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 bg-current ${className}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: "url(/brand/mark.webp)",
        maskImage: "url(/brand/mark.webp)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/** The orange token tile (the owner's square logo). Plain <img>: small sizes stay sharp and never blank. */
export function MarkTile({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/mark-tile.webp" alt="" aria-hidden="true" width={size} height={size} className={`block shrink-0 ${className}`} style={{ borderRadius: Math.round(size * 0.22) }} />
  );
}

/** Wordmark: the mark + the name in lower case, like the reference's logotype. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-white">
      <MarkGlyph size={Math.round(size * 1.3)} />
      <span className="font-serif leading-none font-semibold tracking-[-0.02em] text-white" style={{ fontSize: size }}>
        rutiq
      </span>
    </span>
  );
}
