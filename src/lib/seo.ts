import type { Metadata } from "next";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";

export const HOME_TITLE = `${BRAND.name} | ${BRAND.slogan.replace(/\.$/, "")}`;
export const HOME_DESCRIPTION = `Write trading rules, backtest them on Chainlink price rounds anyone can re-read on ${BRAND.chainName}, then paper-trade live prices with a log that says why the agent acted or waited. Paper only, no wallet needed.`;

/**
 * Per-route metadata in one shape: a unique title, a description written for
 * the search result, a canonical URL on the production domain, and matching
 * Open Graph / X cards. The share image comes from the opengraph-image and
 * twitter-image files in src/app, which every route inherits.
 */
export function pageMeta({
  path,
  title,
  description,
  noindex = false,
  type = "website",
}: {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const url = `${BRAND.url}${path === "/" ? "" : path}`;
  // Child routes that set openGraph replace the inherited file-based image, so name it explicitly.
  const images = [{ url: `/opengraph-image.jpg?v=${OG_VERSION}`, width: 1200, height: 630, alt: OG_ALT }];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type, url, siteName: BRAND.name, title, description, locale: "en_US", images },
    twitter: { card: "summary_large_image", site: BRAND.xHandle, creator: BRAND.xHandle, title, description, images: [{ url: `/twitter-image.jpg?v=${OG_VERSION}`, alt: OG_ALT }] },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

/** sha256 (first 8 hex) of src/app/opengraph-image.jpg; bump when the image changes (referensi/tools/make-assets.mjs prints it). */
export const OG_VERSION = "7d3134a7";
export const OG_ALT = `${BRAND.name} wordmark and an orange rule path on a dark field. ${BRAND.slogan}`;

export type Crumb = { name: string; path: string };

export function breadcrumbLd(trail: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${BRAND.url}${c.path === "/" ? "" : c.path}`,
    })),
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export const siteLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BRAND.url}/#org`,
    name: BRAND.name,
    url: BRAND.url,
    logo: `${BRAND.url}/icon.png`,
    // Only real profiles: the GitHub link joins once the public repository exists.
    sameAs: [BRAND.x, ...(hasGithub ? [BRAND.github] : [])],
    description: BRAND.description,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BRAND.url}/#site`,
    name: BRAND.name,
    url: BRAND.url,
    inLanguage: "en",
    publisher: { "@id": `${BRAND.url}/#org` },
  },
];

export const appLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: BRAND.name,
  url: BRAND.url,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any (web browser)",
  description: `Paper-only studio for rule-based trading agents on ${CHAIN.name}: rule builder, backtests on Chainlink round history, paper trading with a decision log, and an on-chain log that re-checks decisions against the referenced rounds.`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@id": `${BRAND.url}/#org` },
};

/** Serialise JSON-LD for a script tag; "<" is escaped so a value can never close the tag. */
export function ldJson(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
