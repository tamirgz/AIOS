"use client";

import { useEffect, useRef } from "react";

/** Drifting particle motes over the CSS aurora/grid/grain layers. */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;

    const COLORS = ["0, 229, 199", "125, 211, 252", "255, 180, 84"];
    type Mote = {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      color: string;
      phase: number;
      speed: number;
    };
    let motes: Mote[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.floor((width * height) / 22000));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.6 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.04 - Math.random() * 0.1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.8,
      }));
    };

    let t = 0;
    const tick = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);
      for (const m of motes) {
        m.x += m.vx;
        m.y += m.vy;
        if (m.y < -4) {
          m.y = height + 4;
          m.x = Math.random() * width;
        }
        if (m.x < -4) m.x = width + 4;
        if (m.x > width + 4) m.x = -4;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * m.speed + m.phase));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${m.color}, ${0.28 * twinkle})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-1"
    />
  );
}

export function AnimatedBg() {
  return (
    <>
      <div aria-hidden className="bg-aurora" />
      <div aria-hidden className="bg-grid" />
      <div aria-hidden className="bg-grain" />
      <ParticleField />
    </>
  );
}
