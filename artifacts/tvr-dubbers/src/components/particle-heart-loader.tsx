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

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

type Phase = "drawing" | "holding" | "fading";

const DRAW_SECONDS = 2.6;
const HOLD_SECONDS = 0.5;
const FADE_SECONDS = 0.45;

// A glowing neon line "draws" a full heart outline (like a lit fuse tracing
// the shape), leaving the already-traced portion lit and solid while a burst
// of drifting embers sparks off the current tip. Once the heart is complete
// it holds briefly, fades out, then loops. Used in place of a plain pulsing
// skeleton while content is still loading.
export function ParticleHeartLoader({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let last = performance.now();

    let phase: Phase = "drawing";
    let progress = 0;
    let holdT = 0;
    let fadeAlpha = 1;
    const embers: Ember[] = [];

    // Stagger multiple tiles so they don't all sync up: start each instance
    // at a random point within the draw/hold/fade cycle.
    const TOTAL_SECONDS = DRAW_SECONDS + HOLD_SECONDS + FADE_SECONDS;
    const seed = Math.random() * TOTAL_SECONDS;
    if (seed < DRAW_SECONDS) {
      phase = "drawing";
      progress = seed / DRAW_SECONDS;
    } else if (seed < DRAW_SECONDS + HOLD_SECONDS) {
      phase = "holding";
      progress = 1;
      holdT = seed - DRAW_SECONDS;
    } else {
      phase = "fading";
      progress = 1;
      fadeAlpha = 1 - (seed - DRAW_SECONDS - HOLD_SECONDS) / FADE_SECONDS;
    }

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

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      if (phase === "drawing") {
        progress += dt / DRAW_SECONDS;
        if (progress >= 1) {
          progress = 1;
          phase = "holding";
          holdT = 0;
        }
      } else if (phase === "holding") {
        holdT += dt;
        if (holdT >= HOLD_SECONDS) {
          phase = "fading";
          fadeAlpha = 1;
        }
      } else if (phase === "fading") {
        fadeAlpha -= dt / FADE_SECONDS;
        if (fadeAlpha <= 0) {
          fadeAlpha = 0;
          phase = "drawing";
          progress = 0;
          embers.length = 0;
        }
      }

      const alpha = phase === "fading" ? Math.max(0, fadeAlpha) : 1;
      if (alpha <= 0) {
        raf = requestAnimationFrame(frame);
        return;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // The lit portion of the heart, drawn as a warm neon gradient tube
      const tEnd = Math.max(0.0001, progress) * Math.PI * 2;
      const steps = Math.max(2, Math.round(220 * Math.max(0.0001, progress)));

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#0891b2");
      gradient.addColorStop(1, "#a5f3fc");

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = (i / 220) * Math.PI * 2 <= tEnd ? (i / 220) * Math.PI * 2 : tEnd;
        const p = project(t);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(34, 211, 238, 0.95)";
      ctx.shadowBlur = 14;
      ctx.stroke();

      // Extra bright core near the very tip
      if (progress < 1) {
        const tip = project(tEnd);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#67e8f9";
        ctx.shadowBlur = 20;
        ctx.fill();

        // Spawn embers bursting off the tip
        for (let i = 0; i < 2; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 6 + Math.random() * 22;
          embers.push({
            x: tip.x,
            y: tip.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 6,
            life: 1,
            size: 0.6 + Math.random() * 1.6,
          });
        }
      }

      // Update + draw embers
      ctx.shadowBlur = 0;
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.life -= dt * 1.15;
        if (e.life <= 0) {
          embers.splice(i, 1);
          continue;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.94;
        e.vy = e.vy * 0.94 + 14 * dt;

        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * e.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165, 243, 252, ${e.life})`;
        ctx.shadowColor = "rgba(34, 211, 238, 0.9)";
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();

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
