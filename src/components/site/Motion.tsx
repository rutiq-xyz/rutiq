"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * Site-wide motion driver. Everything it animates is visible by default: the hidden start states in globals.css only apply under
 * html.motion, which the inline head script (MOTION_BOOT) sets before paint when the reader has not asked for reduced motion.
 *
 *  [data-reveal]          fades/slides in once it enters the viewport (adds .in)
 *  AUTO_REVEAL            app-page cards below the fold are tagged the same way, so pages need no wrapper elements
 *  [data-parallax="18"]   moves up to +-18 px against the scroll (CSS var --py, used with the `translate` property)
 *  [data-scrub] / [data-scale]  gets --p from 0 (top edge enters at the bottom) to 1 (bottom edge leaves at the top)
 *  [data-pointer]         gets --mx / --my in -1..1, eased towards the pointer (fine pointers only)
 */

const AUTO_REVEAL = ["main .panel", "main .card", "main .feat", "footer .ft-cols > *"].join(",");

export function Motion() {
  const path = usePathname();

  useEffect(() => {
    (window as unknown as { __rqMotion?: boolean }).__rqMotion = true;
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.remove("motion");
      return;
    }
    root.classList.add("motion");

    /* ---- reveal ---- */
    const io = new IntersectionObserver(
      (entries) => {
        let k = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          // auto-tagged siblings that enter together are staggered; the delay is cleared afterwards so hover transitions stay instant
          if (el.dataset.reveal === "auto") {
            el.style.transitionDelay = `${k++ * 90}ms`;
            el.addEventListener("transitionend", () => (el.style.transitionDelay = ""), { once: true });
          }
          el.classList.add("in");
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    const scan = () => {
      const vh = window.innerHeight;
      for (const el of document.querySelectorAll<HTMLElement>(AUTO_REVEAL)) {
        if (el.dataset.reveal !== undefined || el.dataset.noReveal !== undefined) continue;
        // only below the fold (never hide what is already on screen) and never inside something that already reveals
        if (el.getBoundingClientRect().top < vh * 0.92 || el.parentElement?.closest("[data-reveal]")) {
          el.dataset.noReveal = "";
          continue;
        }
        el.dataset.reveal = "auto";
      }
      for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]:not(.in):not([data-rv])")) {
        el.dataset.rv = "";
        io.observe(el);
      }
      collect();
      frame();
    };

    /* ---- scroll-linked ---- */
    let parallax: HTMLElement[] = [];
    let scrub: HTMLElement[] = [];
    const collect = () => {
      parallax = [...document.querySelectorAll<HTMLElement>("[data-parallax]")];
      scrub = [...document.querySelectorAll<HTMLElement>("[data-scrub],[data-scale]")];
    };
    const frame = () => {
      const vh = window.innerHeight;
      for (const el of parallax) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
        el.style.setProperty("--py", `${(-p * Number(el.dataset.parallax || 16)).toFixed(1)}px`);
      }
      for (const el of scrub) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
        el.style.setProperty("--p", p.toFixed(3));
      }
    };
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        frame();
      });
    };

    /* ---- pointer ---- */
    let tx = 0,
      ty = 0,
      cx = 0,
      cy = 0,
      raf = 0;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const ease = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      for (const el of document.querySelectorAll<HTMLElement>("[data-pointer]")) {
        el.style.setProperty("--mx", cx.toFixed(3));
        el.style.setProperty("--my", cy.toFixed(3));
      }
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(ease) : 0;
    };
    const onPointer = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(ease);
    };

    let pending = 0;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        scan();
      }, 60);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    if (fine) window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      window.clearTimeout(pending);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [path]);

  return null;
}
