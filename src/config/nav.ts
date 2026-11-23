export const NAV = [
  { href: "/studio", label: "Studio" },
  { href: "/paper", label: "Paper" },
  { href: "/log", label: "Decision log" },
  { href: "/data", label: "Price data" },
  { href: "/docs", label: "Docs" },
  { href: "/token", label: "Token" },
] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/studio", "/paper", "/log", "/data", "/docs", "/token"] as const;
