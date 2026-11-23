"use client";

import { useEffect, useState } from "react";

/** Unix seconds, refreshed every `ms` (render stays pure: the clock is read in the initializer and in the timer). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Runs `fn` right after mount, outside the effect body (browser-only state such as localStorage). */
export function afterMount(fn: () => void) {
  const t = setTimeout(fn, 0);
  return () => clearTimeout(t);
}
