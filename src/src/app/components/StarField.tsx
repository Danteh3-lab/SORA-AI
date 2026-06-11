import { useEffect, useRef } from "react";

interface StarFieldProps {
  mouseX: number;
  mouseY: number;
}

export function StarField({ mouseX, mouseY }: StarFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: mouseX, y: mouseY });
  const animRef = useRef(0);

  mouseRef.current = { x: mouseX, y: mouseY };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0;

    function resize() {
      W = canvas!.offsetWidth;
      H = canvas!.offsetHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Stars
    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 0.9 + 0.1,
      brightness: Math.random() * 0.4 + 0.05,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      depth: Math.random() * 0.8 + 0.2, // parallax layer
    }));

    // Network nodes (dim, scattered)
    const nodes = Array.from({ length: 280 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.008 + 0.002,
    }));

    // Precompute connections between nearby nodes
    const connections: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.12 && connections.length < 180) {
          connections.push([i, j]);
        }
      }
    }

    let t = 0;

    function draw() {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      const mx = mouseRef.current.x / W - 0.5;
      const my = mouseRef.current.y / H - 0.5;

      // Stars
      for (const s of stars) {
        const px = ((s.x + mx * s.depth * 0.03 + 1) % 1) * W;
        const py = ((s.y + my * s.depth * 0.02 + 1) % 1) * H;
        const twinkle = 0.6 + 0.4 * Math.sin(t * s.twinkleSpeed * 60 + s.twinklePhase);
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "#e8f4ff";
        ctx.globalAlpha = s.brightness * twinkle;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Network nodes + connections
      for (const [ai, bi] of connections) {
        const a = nodes[ai], b = nodes[bi];
        const ax = (a.x + mx * 0.015 + 1) % 1 * W;
        const ay = (a.y + my * 0.01 + 1) % 1 * H;
        const bx = (b.x + mx * 0.015 + 1) % 1 * W;
        const by = (b.y + my * 0.01 + 1) % 1 * H;
        const alpha = 0.04 + 0.03 * Math.sin(t * 0.5 + a.phase);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = "#29b6f6";
        ctx.lineWidth = 0.4;
        ctx.globalAlpha = alpha;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const n of nodes) {
        const px = (n.x + mx * 0.015 + 1) % 1 * W;
        const py = (n.y + my * 0.01 + 1) % 1 * H;
        const alpha = 0.08 + 0.06 * Math.sin(t * n.speed * 60 + n.phase);
        ctx.beginPath();
        ctx.arc(px, py, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "#1565c0";
        ctx.globalAlpha = alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
