/* Fades a block up once it scrolls into view (driven by components/site/Motion.tsx). Without JavaScript or with reduced motion it is simply visible. */
export function Reveal({
  children,
  className = "",
  delay = 0,
  parallax,
  as: Tag = "div",
  testid,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** pixels the first child drifts against the scroll */
  parallax?: number;
  as?: "div" | "section" | "li" | "article";
  testid?: string;
}) {
  const Any = Tag as React.ElementType;
  return (
    <Any data-reveal="" data-parallax={parallax} data-testid={testid} className={className} style={delay ? ({ "--rd": `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </Any>
  );
}
