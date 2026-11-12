import { useEffect } from "react";

interface PageMeta {
  title: string;
  /** Adds <meta name="robots" content="noindex"> while the page is mounted. */
  noindex?: boolean;
}

/**
 * Sets the document title (and optionally noindex) for a client-side route,
 * then restores the previous values when the route unmounts.
 */
export function usePageMeta({ title, noindex = false }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let robots: HTMLMetaElement | null = null;
    let previousRobots: string | null = null;
    if (noindex) {
      robots = document.querySelector('meta[name="robots"]');
      if (robots) {
        previousRobots = robots.getAttribute("content");
        robots.setAttribute("content", "noindex, follow");
      }
    }

    return () => {
      document.title = previousTitle;
      if (robots && previousRobots !== null) {
        robots.setAttribute("content", previousRobots);
      }
    };
  }, [title, noindex]);
}
