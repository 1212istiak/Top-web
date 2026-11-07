import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** kept for call-site compatibility; there is no scroll animation anymore */
  delay?: number;
  id?: string;
}

// Plain section wrapper. It used to fade/blur/slide content in on scroll; that
// was removed so scrolling stays a smooth glide with nothing animating in.
export function Reveal({ children, className = "", id }: RevealProps) {
  return (
    <div id={id} className={className}>
      {children}
    </div>
  );
}
