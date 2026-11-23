/*
 * Rutiq's mark (own design, placeholder until the owner's logo arrives): an orange tile with a white rule path — flat, a step up,
 * a node where the rule fires. The same drawing is rendered to public/brand/*.webp and the icons by referensi/tools/make-assets.mjs.
 */
export function MarkGlyph({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="block shrink-0">
      <defs>
        <linearGradient id="rq-mark-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a4c" />
          <stop offset="0.6" stopColor="#ff6a13" />
          <stop offset="1" stopColor="#f45a00" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#rq-mark-g)" />
      <path d="M13 44h12l8-14h8l10-14" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="51" cy="16" r="5.5" fill="#fff" />
    </svg>
  );
}

/** Wordmark: the mark + the name in lower case, like the reference's logotype. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <MarkGlyph size={Math.round(size * 1.5)} />
      <span className="font-serif leading-none font-semibold tracking-[-0.02em] text-white" style={{ fontSize: size }}>
        rutiq
      </span>
    </span>
  );
}
