"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/config/nav";
import { Wordmark } from "@/components/site/Mark";
import { CloseIcon } from "@/components/site/Icons";
import { NavWallet } from "@/components/wallet/WalletButton";
import { CaBox } from "@/components/site/CaCopy";
import { useFocusTrap } from "@/components/site/useFocusTrap";
import { storageKey } from "@/config/storage";
import { afterMount } from "@/lib/useNow";

/* As the UI reference: a thin announcement bar (live dot, bold label, orange link, close), then an 80 px sticky header with the
 * wordmark, links and the orange call to action (here: the wallet's Connect button). */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [ann, setAnn] = useState(true);
  useEffect(() => {
    const first = afterMount(() => {
      try {
        if (localStorage.getItem(storageKey("ann")) === "0") setAnn(false);
      } catch {
        // storage blocked: keep the bar
      }
    });
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      first();
      window.removeEventListener("scroll", on);
    };
  }, []);
  const closeAnn = () => {
    setAnn(false);
    try {
      localStorage.setItem(storageKey("ann"), "0");
    } catch {
      // ignore
    }
  };
  return (
    <>
      {ann ? (
        <div className="ann" data-testid="ann">
          <div className="row">
            <span className="pulse-dot hidden sm:inline-block" aria-hidden="true" />
            <span>
              <b>Paper only.</b> <span className="hidden sm:inline">Backtest on Chainlink history, then paper-trade live prices with a decision log. </span>
              <Link href="/studio">Open the studio →</Link>
            </span>
            <button type="button" className="x" aria-label="Hide this bar" onClick={closeAnn}>
              ×
            </button>
          </div>
        </div>
      ) : null}
      <header className={`hd ${scrolled ? "scrolled" : ""}`}>
        <div className="wrap bar">
          <Link href="/" aria-label="Rutiq home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="hidden flex-1 items-center justify-end lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path === n.href || path.startsWith(`${n.href}/`) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2 lg:ml-4">
            <NavWallet label="Connect" />
            <button type="button" className="menu-btn lg:hidden" aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)} data-testid="menu-open">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      {open ? <MobileMenu onClose={() => setOpen(false)} path={path} /> : null}
    </>
  );
}

function MobileMenu({ onClose, path }: { onClose: () => void; path: string }) {
  const trap = useRef<HTMLDivElement>(null);
  useFocusTrap(trap, true, onClose);
  // Portal to <body>: the header's backdrop-filter would otherwise clip a fixed overlay to its own box.
  return createPortal(
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-ink text-cream" role="dialog" aria-modal="true" aria-label="Menu" ref={trap} data-testid="menu">
      <div className="wrap flex h-[64px] items-center justify-between">
        <Wordmark />
        <button type="button" className="menu-btn" aria-label="Close the menu" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      <nav className="wrap mt-4 grid" aria-label="Main">
        {[{ href: "/", label: "Home" }, ...NAV].map((n) => (
          <Link key={n.href} href={n.href} onClick={onClose} className={`border-b border-line py-4 font-serif text-[26px] font-semibold leading-[30px] tracking-[-0.02em] ${path === n.href ? "text-white" : "text-white/70"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="wrap mt-8 grid gap-3 pb-10">
        <Link href="/studio" className="btn btn-orange w-full" onClick={onClose}>
          Open the studio
        </Link>
        <CaBox testid="menu-ca" />
      </div>
    </div>,
    document.body,
  );
}
