import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Motion } from "@/components/site/Motion";
import { MOTION_BOOT } from "@/lib/motionBoot";
import { WalletModalProvider } from "@/components/wallet/WalletButton";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { BRAND } from "@/config/brand";
import { HOME_DESCRIPTION, HOME_TITLE, siteLd } from "@/lib/seo";

// Self-hosted (src/fonts): Inter and Manrope under the SIL Open Font License, Roboto Mono under the SIL OFL as well.
const ui = localFont({ src: [{ path: "../fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" }], variable: "--font-ui", display: "swap" });
const display = localFont({ src: [{ path: "../fonts/manrope-latin-wght-normal.woff2", weight: "200 800", style: "normal" }], variable: "--font-display", display: "swap" });
const code = localFont({ src: [{ path: "../fonts/roboto-mono-latin-wght-normal.woff2", weight: "100 700", style: "normal" }], variable: "--font-code", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: HOME_TITLE, template: `%s | ${BRAND.name}` },
  description: HOME_DESCRIPTION,
  applicationName: BRAND.name,
};

export const viewport: Viewport = { themeColor: "#111111", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        {/* Motion gate before first paint (only without reduced motion); see components/site/Motion.tsx */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <JsonLd data={siteLd} />
        <WalletProvider>
          <WalletModalProvider>
            <SiteHeader />
            <main id="main">{children}</main>
            <SiteFooter />
            <Motion />
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
