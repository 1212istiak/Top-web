import { useEffect, useRef } from "react";

// Interactive sparkle field:
// - particles drift and twinkle as before
// - the cursor gently pushes nearby particles away (repulsion radius ~140px)
// - faint "constellation" lines connect particles that drift close together
// - lines/repulsion are skipped on low-end devices to protect frame rate
// - in light mode the stars are replaced by a pale sky with soft clouds that
//   drift behind the tiles at random speeds, heights and bobbing rhythms
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

    // Light mode: soft clouds. Each cloud is a one-off sprite (a cluster of
    // radial-gradient puffs over a faint blue-grey underside) drawn once to an
    // offscreen canvas, then drifted around every frame.
    const makeCloudSprite = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = Math.ceil(w * dpr);
      c.height = Math.ceil(h * dpr);
      const g = c.getContext("2d");
      if (!g) return c;
      g.scale(dpr, dpr);
      const puff = (x: number, y: number, r: number, rgb: string, a: number) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${rgb}, ${a})`);
        gr.addColorStop(0.6, `rgba(${rgb}, ${a * 0.65})`);
        gr.addColorStop(1, `rgba(${rgb}, 0)`);
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      const n = 6 + Math.floor(Math.random() * 4);
      const puffs = Array.from({ length: n }).map((_, i) => {
        const t = (i + 0.5) / n;
        const mid = 1 - Math.abs(t - 0.5) * 2; // taller in the middle
        const r = h * (0.24 + 0.2 * mid) * (0.85 + Math.random() * 0.3);
        return {
          x: w * (0.14 + 0.72 * t) + (Math.random() - 0.5) * w * 0.05,
          y: h * 0.58 - r * (0.25 + 0.45 * mid) + (Math.random() - 0.5) * h * 0.06,
          r,
        };
      });
      puffs.forEach((q) => puff(q.x, q.y + q.r * 0.3, q.r * 1.05, "150, 178, 214", 0.3));
      puffs.forEach((q) => puff(q.x, q.y, q.r, "255, 255, 255", 0.96));
      return c;
    };

    const CLOUD_W = 280;
    const CLOUD_H = 120;
    const cloudCount = isLowEnd ? 4 : 7;
    const clouds = Array.from({ length: cloudCount }).map(() => {
      const scale = 0.55 + Math.random() * 1.1;
      return {
        sprite: makeCloudSprite(CLOUD_W, CLOUD_H),
        scale,
        x: Math.random() * (width + CLOUD_W * 2) - CLOUD_W,
        baseY: Math.random() * height * 0.95 - CLOUD_H * 0.3,
        // px per second, mostly rightward with the odd cloud going the other way
        speed: (6 + Math.random() * 20) * (Math.random() < 0.2 ? -1 : 1),
        bobAmp: 4 + Math.random() * 16,
        bobFreq: 0.08 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.55 + Math.random() * 0.4,
      };
    });
    let lastT = performance.now();

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
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;

      if (!isDark) {
        // Pale sky + drifting clouds (no stars in light mode)
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#b3d5ff');
        sky.addColorStop(1, '#d9eaff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        clouds.forEach((c) => {
          const w = CLOUD_W * c.scale;
          const h = CLOUD_H * c.scale;
          c.x += c.speed * dt;
          c.phase += c.bobFreq * dt;
          if (c.speed > 0 && c.x > width + 40) c.x = -w - 40;
          if (c.speed < 0 && c.x < -w - 40) c.x = width + 40;
          const y = c.baseY + Math.sin(c.phase * Math.PI * 2) * c.bobAmp;
          ctx.globalAlpha = c.alpha;
          ctx.drawImage(c.sprite, c.x, y, w, h);
        });
        ctx.globalAlpha = 1;

        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.fillStyle = '#020408';
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
