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

type DustState = "idle" | "converging";

interface Dust {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetT: number; // point on the curve (angle) this particle is assigned to
  state: DustState;
  timer: number; // 0..1 progress of the converge animation
  size: number;
  baseAlpha: number;
  flicker: number;
}

type Phase = "drawing" | "holding" | "fading";

const DRAW_SECONDS = 3.2;
const HOLD_SECONDS = 0.5;
const FADE_SECONDS = 0.5;
const CONVERGE_SECONDS = 0.45;
const DUST_COUNT = 90;

// Ambient dust particles scattered around the tile fly inward and merge into
// a heart-shaped outline as it traces itself, thinning the surrounding cloud
// as they're absorbed. The completed portion of the line stays solidly lit.
// Loops: draws, holds, fades out, and refills with a fresh cloud.
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
    let dust: Dust[] = [];

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

    function spawnDust(): Dust[] {
      const arr: Dust[] = [];
      for (let i = 0; i < DUST_COUNT; i++) {
        // Scatter roughly around the heart's bounding area, a bit wider than
        // the shape itself, biased toward the center rather than edge-to-edge.
        const angle = Math.random() * Math.PI * 2;
        const radius = (0.25 + Math.random() * 0.75) * Math.min(width, height) * 0.55;
        const x = width / 2 + Math.cos(angle) * radius;
        const y = height / 2 + Math.sin(angle) * radius * 0.9;
        arr.push({
          x,
          y,
          startX: x,
          startY: y,
          targetT: Math.random() * Math.PI * 2,
          state: "idle",
          timer: 0,
          size: 0.5 + Math.random() * 1.3,
          baseAlpha: 0.25 + Math.random() * 0.45,
          flicker: Math.random() * Math.PI * 2,
        });
      }
      return arr;
    }
    dust = spawnDust();

    function resetCycle() {
      progress = 0;
      dust = spawnDust();
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
          resetCycle();
        }
      }

      const alpha = phase === "fading" ? Math.max(0, fadeAlpha) : 1;
      if (alpha <= 0) {
        raf = requestAnimationFrame(frame);
        return;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      const sweepAngle = progress * Math.PI * 2;

      // Activate dust whose assigned point the sweep has just reached
      for (const d of dust) {
        if (d.state === "idle" && d.targetT <= sweepAngle) {
          d.state = "converging";
          d.timer = 0;
        }
      }

      // The lit portion of the heart: a solid glowing gradient stroke
      const steps = Math.max(2, Math.round(240 * Math.max(0.0001, progress)));
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#0891b2");
      gradient.addColorStop(1, "#a5f3fc");

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = Math.min((i / 240) * Math.PI * 2, sweepAngle);
        const p = project(t);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(34, 211, 238, 0.95)";
      ctx.shadowBlur = 13;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw dust: idle particles twinkle in place, converging ones fly
      // toward their assigned point on the curve and fade as they arrive
      for (const d of dust) {
        if (d.state === "idle") {
          const flick = 0.75 + 0.25 * Math.sin(d.flicker + now * 0.003);
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(103, 232, 249, ${d.baseAlpha * flick})`;
          ctx.shadowColor = "rgba(34, 211, 238, 0.6)";
          ctx.shadowBlur = 3;
          ctx.fill();
        } else {
          d.timer += dt / CONVERGE_SECONDS;
          const tt = Math.min(1, d.timer);
          const ease = 1 - Math.pow(1 - tt, 3); // ease-out
          const target = project(d.targetT);
          d.x = d.startX + (target.x - d.startX) * ease;
          d.y = d.startY + (target.y - d.startY) * ease;

          const fadeOut = 1 - ease;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.size + 1.2 * ease, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(165, 243, 252, ${0.35 + 0.65 * fadeOut})`;
          ctx.shadowColor = "rgba(34, 211, 238, 0.95)";
          ctx.shadowBlur = 7;
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      // Drop fully-converged particles from the pool (they're absorbed into
      // the solid line now)
      dust = dust.filter(d => !(d.state === "converging" && d.timer >= 1));

      // Bright hot point at the current tip
      if (progress < 1) {
        const tip = project(sweepAngle);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#67e8f9";
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

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
