import { useEffect, useRef, useState } from "react";

export function CursorEffects() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  
  // State for positions
  const mousePos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const ringPos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  
  // Animation frame reference
  const requestRef = useRef<number | undefined>(undefined);
  
  // Mobile tap effects
  const [taps, setTaps] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    // Only run on non-touch devices for the continuous cursor
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    
    if (!isTouch) {
      const onMouseMove = (e: MouseEvent) => {
        mousePos.current = { x: e.clientX, y: e.clientY };
      };
      
      window.addEventListener("mousemove", onMouseMove);
      
      const animate = () => {
        // Dot follows exactly
        if (dotRef.current) {
          dotRef.current.style.transform = `translate(${mousePos.current.x}px, ${mousePos.current.y}px) translate(-50%, -50%)`;
        }
        
        // Ring follows with easing
        ringPos.current.x += (mousePos.current.x - ringPos.current.x) * 0.15;
        ringPos.current.y += (mousePos.current.y - ringPos.current.y) * 0.15;
        
        if (ringRef.current) {
          ringRef.current.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px) translate(-50%, -50%)`;
        }
        
        requestRef.current = requestAnimationFrame(animate);
      };
      
      requestRef.current = requestAnimationFrame(animate);
      
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
    } else {
      // Mobile tap effect
      const onTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0];
        const newTap = { id: Date.now(), x: touch.clientX, y: touch.clientY };
        setTaps((prev) => [...prev, newTap]);
        setTimeout(() => {
          setTaps((prev) => prev.filter((t) => t.id !== newTap.id));
        }, 1000);
      };
      
      window.addEventListener("touchstart", onTouchStart);
      return () => {
        window.removeEventListener("touchstart", onTouchStart);
      };
    }
  }, []);

  return (
    <>
      <div 
        ref={dotRef} 
        className="fixed top-0 left-0 w-2 h-2 bg-cyan-400 rounded-full pointer-events-none z-[9999] shadow-[0_0_8px_2px_rgba(34,211,238,0.8)] hidden md:block will-change-transform" 
      />
      <div 
        ref={ringRef} 
        className="fixed top-0 left-0 w-8 h-8 border border-cyan-400/50 rounded-full pointer-events-none z-[9998] transition-transform duration-75 hidden md:block will-change-transform" 
      />
      
      {/* Mobile Taps */}
      {taps.map((tap) => (
        <div
          key={tap.id}
          className="fixed w-4 h-4 bg-cyan-400 rounded-full pointer-events-none z-[9999] shadow-[0_0_12px_4px_rgba(34,211,238,0.8)] animate-out fade-out slide-out-to-top-8 duration-1000"
          style={{ top: tap.y - 8, left: tap.x - 8 }}
        />
      ))}
    </>
  );
}

