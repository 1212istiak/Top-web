import { useEffect, useRef } from "react";

// Interactive sparkle field:
// - particles drift and twinkle as before
// - the cursor gently pushes nearby particles away (repulsion radius ~140px)
// - faint "constellation" lines connect particles that drift close together
// - lines/repulsion are skipped on low-end devices to protect frame rate
export function SparkleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Scale for high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Particle logic
    const isLowEnd = (navigator.hardwareConcurrency || 4) < 4;
    const particleCount = isLowEnd ? 20 : 50;

    const particles = Array.from({ length: particleCount }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.2,
      speedY: (Math.random() - 0.5) * 0.2,
      opacity: Math.random() * 0.5 + 0.1,
      fadeSpeed: (Math.random() - 0.5) * 0.01,
    }));

    // Cursor tracking (canvas is pointer-events-none, so listen on window)
    const mouse = { x: -9999, y: -9999 };
    const REPEL_RADIUS = 140;
    const LINK_DISTANCE = 110;

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const handleMouseLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    let isVisible = !document.hidden;

    const render = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Draw background - deep dark or white depending on theme
      // Since canvas is opaque, we need to read the current body background color
      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? '#020408' : '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Update + draw particles
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.opacity += p.fadeSpeed;

        if (p.opacity <= 0.1 || p.opacity >= 0.8) p.fadeSpeed *= -1;

        // Cursor repulsion: push particles away, fading with distance
        if (!isLowEnd) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < REPEL_RADIUS * REPEL_RADIUS && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const force = (1 - d / REPEL_RADIUS) * 1.2;
            p.x += (dx / d) * force;
            p.y += (dy / d) * force;
          }
        }

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

        // Stars are light in dark mode, dark in light mode
        const color = isDark ? `rgba(255, 255, 255, ${p.opacity})` : `rgba(0, 0, 0, ${p.opacity * 0.5})`;
        ctx.fillStyle = color;
        ctx.fill();
      });

      // Constellation lines between nearby particles
      if (!isLowEnd) {
        for (let i = 0; i < particles.length; i++) {
          const a = particles[i];
          for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < LINK_DISTANCE * LINK_DISTANCE) {
              const strength = 1 - Math.sqrt(d2) / LINK_DISTANCE;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.strokeStyle = isDark
                ? `rgba(148, 233, 255, ${strength * 0.18})`
                : `rgba(8, 145, 178, ${strength * 0.12})`;
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10 pointer-events-none"
      style={{ willChange: 'transform' }}
    />
  );
}
