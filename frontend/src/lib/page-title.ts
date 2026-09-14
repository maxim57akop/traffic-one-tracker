"use client";

import { useEffect } from "react";

const BRAND_TITLE = "TrafficOne";

export function formatPageTitle(page?: string) {
  const normalized = page?.trim();
  return normalized ? `${normalized} - ${BRAND_TITLE}` : BRAND_TITLE;
}

export function usePageTitle(page?: string) {
  useEffect(() => {
    const title = formatPageTitle(page);
    let cancelled = false;

    const applyTitle = () => {
      if (!cancelled && document.title !== title) {
        document.title = title;
      }
    };

    applyTitle();

    const frame = window.requestAnimationFrame(applyTitle);
    const timers = [0, 50, 250, 750].map((delay) => window.setTimeout(applyTitle, delay));
    const observer = new MutationObserver(applyTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
    };
  }, [page]);
}
