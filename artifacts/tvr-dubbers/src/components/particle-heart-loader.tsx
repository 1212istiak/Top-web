import { useEffect, useRef } from "react";

// Parametric heart curve (classic "16sin^3(t)" heart):
//   x(t) = 16 sin^3(t)
//   y(t) = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
// t in [0, 2*PI] traces the full outline once.
function heartPoint(t: number) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y =
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x, y };
}

interface Spark {
  x: number;
  y: number;
  life: number;
}

// A glowing particle "draws" itself around a heart-shaped outline on loop,
// leaving a fading trail of neon sparks behind it. Used in place of a plain
// pulsing skeleton while content is still loading.
export function ParticleHeartLoader({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let progress = Math.random(); // stagger multiple tiles so they don't all sync up
    const sparks: Spark[] = [];
    const SPEED = 0.0035;
    const SPARKS_PER_FRAME = 3;

    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, width * dpr);
      canvas.height = Math.max(1, height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    function project(t: number) {
      const { x, y } = heartPoint(t);
      const scale = Math.min(width, height) / 42;
      return {
        x: width / 2 + x * scale,
        y: height / 2 - y * scale * 0.92,
      };
    }

    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      progress = (progress + SPEED) % 1;
      const t = progress * Math.PI * 2;

      // Faint full outline as a guide
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const tt = (i / 160) * Math.PI * 2;
        const p = project(tt);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(34, 211, 238, 0.10)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Emit new sparks near the current head position
      for (let i = 0; i < SPARKS_PER_FRAME; i++) {
        const jitterT = t - Math.random() * 0.04;
        const p = project(jitterT);
        sparks.push({
          x: p.x + (Math.random() - 0.5) * 3,
          y: p.y + (Math.random() - 0.5) * 3,
          life: 1,
        });
      }

      // Draw + fade existing sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= 0.02;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, 0.6 + 1.6 * s.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(103, 232, 249, ${s.life})`;
        ctx.shadowColor = "rgba(34, 211, 238, 0.9)";
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Bright glowing head particle
      const head = project(t);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
