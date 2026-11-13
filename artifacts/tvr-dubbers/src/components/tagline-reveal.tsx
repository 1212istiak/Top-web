import { useEffect, useRef, useState } from "react";

const LINES = ["We believe in quality.", "For the fans, by the fans."];

// Each word fades from a muted tone to full colour as it crosses a trigger
// line near the lower part of the screen. Only opacity is animated, so it
// stays cheap on low end phones.
export function TaglineReveal() {
  const words = LINES.flatMap((line, lineIndex) =>
    line.split(" ").map((word) => ({ word, lineIndex })),
  );

  const [active, setActive] = useState<boolean[]>(() => words.map(() => false));
  const [reduceMotion, setReduceMotion] = useState(false);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const onChange = () => setReduceMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      setActive(words.map(() => true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = Number((entry.target as HTMLElement).dataset.index);
          setActive((prev) => {
            if (prev[index]) return prev;
            const next = [...prev];
            next[index] = true;
            return next;
          });
          observer.unobserve(entry.target); // reveal once, never replay
        });
      },
      // Trigger line sits 35% up from the bottom of the screen.
      { rootMargin: "0px 0px -35% 0px", threshold: 0 },
    );

    wordRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  let wordIndex = 0;

  return (
    <section aria-label="Our promise" className="mt-20 max-w-[680px]">
      <p className="text-3xl sm:text-5xl md:text-6xl font-display font-semibold leading-tight text-foreground">
        {LINES.map((line) => (
          <span key={line} className="block">
            {line.split(" ").map((word, i, arr) => {
              const index = wordIndex++;
              return (
                <span key={index}>
                  <span
                    ref={(el) => {
                      wordRefs.current[index] = el;
                    }}
                    data-index={index}
                    className="inline-block"
                    style={{
                      opacity: active[index] ? 1 : 0.3,
                      transition: reduceMotion
                        ? "none"
                        : `opacity 700ms cubic-bezier(0.22, 1, 0.36, 1) ${Math.min(index * 60, 400)}ms`,
                    }}
                  >
                    {word}
                  </span>
                  {i < arr.length - 1 ? " " : null}
                </span>
              );
            })}
          </span>
        ))}
      </p>
    </section>
  );
}
