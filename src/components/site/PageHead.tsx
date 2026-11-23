/* Title band for app pages: the reference's split head (h2 left, copy + actions right) under its orange arc glow. */
export function PageHead({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="page-head">
      <div className="arc" aria-hidden="true" />
      <div className="wrap split pt-28 pb-12 md:pt-36 md:pb-16">
        <div className="hero-in">
          <p className="eyebrow">{`// ${eyebrow}`}</p>
          <h1 className="h2 mt-4 max-w-[640px]">{title}</h1>
        </div>
        {children || actions ? (
          <div className="hero-in">
            {children ? <div className="copy max-w-[520px]">{children}</div> : null}
            {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: "Prototype" | "Concept" }) {
  return <span className={`badge ${status === "Prototype" ? "badge-proto" : "badge-concept"}`}>{status}</span>;
}
export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return <span className="badge badge-sample">{label}</span>;
}
export function LiveBadge({ label = "Live from chain" }: { label?: string }) {
  return <span className="badge badge-live">{label}</span>;
}
