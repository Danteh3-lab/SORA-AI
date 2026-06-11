import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "speaking";

interface Props {
  state: OrbState;
  onClick: () => void;
  mouseX: number;
  mouseY: number;
}

const PAL = {
  idle: {
    colors: ["#00e5ff", "#29b6f6", "#1e88e5", "#e8f4ff", "#4fc3f7"],
    core: "#00e5ff",
    glow: "rgba(0,229,255,",
    ring: "#29b6f6",
  },
  listening: {
    colors: ["#40c4ff", "#26c6da", "#0288d1", "#b3e5fc", "#80d8ff"],
    core: "#40c4ff",
    glow: "rgba(64,196,255,",
    ring: "#40c4ff",
  },
  speaking: {
    colors: ["#00e5ff", "#448aff", "#1565c0", "#82b1ff", "#00b0ff"],
    core: "#00e5ff",
    glow: "rgba(0,229,255,",
    ring: "#448aff",
  },
};

// Fibonacci sphere distribution
function fibSphere(n: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const phi = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = (2 * Math.PI * i) / phi;
    pts.push([r * Math.cos(theta), y, r * Math.sin(theta)]);
  }
  return pts;
}

function ry(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}
function rx(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

export function JARVISSphere({ state, onClick, mouseX, mouseY }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const mouseRef = useRef({ x: mouseX, y: mouseY });
  const animRef = useRef(0);

  stateRef.current = state;
  mouseRef.current = { x: mouseX, y: mouseY };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    let W = 0, H = 0, cx = 0, cy = 0, R = 0;
    function resize() {
      W = canvas!.offsetWidth;
      H = canvas!.offsetHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx.scale(dpr, dpr);
      cx = W / 2;
      cy = H / 2;
      R = Math.min(W, H) * 0.34;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // --- Particles ---
    const SURFACE_N = 1700;
    const INTERIOR_N = 380;
    const sfPts = fibSphere(SURFACE_N);

    interface Particle {
      nx: number; ny: number; nz: number;
      rad: number; // sphere radius fraction
      baseSize: number;
      brightness: number;
      colorIdx: number;
    }

    const particles: Particle[] = [];

    sfPts.forEach(([nx, ny, nz]) => {
      const jitter = 0.92 + Math.random() * 0.08;
      const colorWeights = [0.3, 0.3, 0.2, 0.1, 0.1];
      let cIdx = 0;
      const r = Math.random();
      let acc = 0;
      for (let k = 0; k < colorWeights.length; k++) { acc += colorWeights[k]; if (r < acc) { cIdx = k; break; } }
      particles.push({ nx, ny, nz, rad: jitter, baseSize: Math.random() * 1.1 + 0.3, brightness: Math.random() * 0.45 + 0.55, colorIdx: cIdx });
    });

    for (let i = 0; i < INTERIOR_N; i++) {
      const r = Math.cbrt(Math.random()) * 0.82;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      particles.push({
        nx: Math.sin(theta) * Math.cos(phi),
        ny: Math.cos(theta),
        nz: Math.sin(theta) * Math.sin(phi),
        rad: r,
        baseSize: Math.random() * 0.7 + 0.15,
        brightness: Math.random() * 0.25 + 0.05,
        colorIdx: Math.floor(Math.random() * 3),
      });
    }

    // Pre-allocate projected buffer
    interface Proj { x: number; y: number; z: number; size: number; alpha: number; colorIdx: number; halo: boolean; }
    const proj: Proj[] = Array.from({ length: particles.length }, () => ({
      x: 0, y: 0, z: 0, size: 0, alpha: 0, colorIdx: 0, halo: false,
    }));
    const sortIdx = Array.from({ length: particles.length }, (_, i) => i);

    // Neural impulses
    interface Impulse { ai: number; bi: number; t: number; speed: number; }
    const impulses: Impulse[] = [];
    // Pre-build connection list (surface only)
    const connPairs: [number, number][] = [];
    const step = Math.floor(SURFACE_N / 100);
    for (let i = 0; i < SURFACE_N; i += step) {
      const j = (i + Math.floor(SURFACE_N / 8) + Math.floor(Math.random() * 40)) % SURFACE_N;
      connPairs.push([i, j]);
    }

    // Atmospheric cloud
    const atmo = Array.from({ length: 140 }, () => {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      return {
        nx: Math.sin(theta) * Math.cos(phi),
        ny: Math.cos(theta),
        nz: Math.sin(theta) * Math.sin(phi),
        r: 1.12 + Math.random() * 0.55,
        driftSpeed: (Math.random() - 0.5) * 0.001,
        driftAngle: Math.random() * Math.PI * 2,
        size: Math.random() * 2.5 + 0.5,
        brightness: Math.random() * 0.06 + 0.02,
      };
    });

    // Orbital rings config
    const rings = [
      { inclination: 0.18, spin: 0, spinSpeed: 0.0028, radius: 1.22, label: "NEURAL NET", tickN: 32 },
      { inclination: 0.55, spin: 1.4, spinSpeed: -0.0045, radius: 1.34, label: "MEMORY", tickN: 28 },
      { inclination: 0.95, spin: 0.8, spinSpeed: 0.007, radius: 1.46, label: "KNOWLEDGE", tickN: 24 },
      { inclination: 1.25, spin: 2.2, spinSpeed: -0.005, radius: 1.58, label: "ACTIVE TASKS", tickN: 20 },
      { inclination: 0.38, spin: 3.8, spinSpeed: 0.0035, radius: 1.70, label: "", tickN: 16 },
    ];

    // Ripples for listening
    const ripples: { t: number }[] = [];

    // Plasma wisps (bezier)
    const wisps = Array.from({ length: 5 }, (_, i) => ({
      baseAngle: (i / 5) * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.004,
      length: 0.35 + Math.random() * 0.25,
    }));

    let rotAngle = 0;
    let tiltAngle = 0.25;
    let frame = 0;
    let lastImpulseFrame = 0;
    let lastRippleFrame = 0;

    function spawnImpulse(s: OrbState) {
      const maxImp = s === "idle" ? 6 : 14;
      if (impulses.length >= maxImp) return;
      const pair = connPairs[Math.floor(Math.random() * connPairs.length)];
      impulses.push({ ai: pair[0], bi: pair[1], t: 0, speed: Math.random() * 0.009 + 0.004 });
    }

    function draw() {
      frame++;
      const s = stateRef.current;
      const pal = PAL[s];
      const active = s !== "idle";
      const rotSpeed = s === "speaking" ? 0.007 : s === "listening" ? 0.004 : 0.0018;

      // Parallax nudge
      const mx = (mouseRef.current.x / W - 0.5) * 0.06;
      const my = (mouseRef.current.y / H - 0.5) * 0.04;

      ctx.clearRect(0, 0, W, H);

      // Volumetric fog
      const fogGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2);
      fogGrad.addColorStop(0, pal.glow + "0.14)");
      fogGrad.addColorStop(0.45, pal.glow + "0.05)");
      fogGrad.addColorStop(1, "transparent");
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, 0, W, H);

      rotAngle += rotSpeed;
      tiltAngle = 0.25 + Math.sin(frame * 0.0008) * 0.06 + my;
      const nudgeAngle = rotAngle + mx;

      // Project particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let [x, y, z] = ry(p.nx, p.ny, p.nz, nudgeAngle);
        [x, y, z] = rx(x, y, z, tiltAngle);
        const pr = p.rad * R;
        const depth = (z + 1) * 0.5; // 0=back 1=front
        proj[i].x = cx + x * pr;
        proj[i].y = cy + y * pr;
        proj[i].z = z;
        proj[i].size = p.baseSize * (0.28 + depth * 0.72) * (p.rad < 0.88 ? 0.55 : 1);
        proj[i].alpha = p.brightness * (0.1 + depth * 0.9) * (p.rad < 0.88 ? 0.4 : 1);
        proj[i].colorIdx = p.colorIdx;
        proj[i].halo = depth > 0.72 && p.rad > 0.9;
      }

      // Sort by z
      sortIdx.sort((a, b) => proj[a].z - proj[b].z);

      // Atmospheric cloud
      for (const a of atmo) {
        a.driftAngle += a.driftSpeed;
        let [x, y, z] = ry(a.nx, a.ny, a.nz, nudgeAngle + a.driftAngle);
        [x, y, z] = rx(x, y, z, tiltAngle);
        const depth = (z + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(cx + x * a.r * R, cy + y * a.r * R, a.size, 0, Math.PI * 2);
        ctx.fillStyle = pal.colors[1];
        ctx.globalAlpha = a.brightness * depth * (active ? 1.6 : 1);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Plasma wisps
      for (const w of wisps) {
        const t = frame * 0.01 + w.phase;
        const angle1 = w.baseAngle + Math.sin(t * w.speed * 60) * 0.3;
        const angle2 = angle1 + w.length * Math.PI;
        const r1 = R * (0.9 + Math.sin(t * 1.3) * 0.1);
        const r2 = R * (1.1 + Math.cos(t * 0.9) * 0.12);
        const x1 = cx + Math.cos(angle1) * r1;
        const y1 = cy + Math.sin(angle1) * r1 * 0.6;
        const x2 = cx + Math.cos(angle2) * r2;
        const y2 = cy + Math.sin(angle2) * r2 * 0.6;
        const cpx = cx + Math.cos(angle1 + w.length * 1.5) * R * 1.3;
        const cpy = cy + Math.sin(angle1 + w.length * 1.5) * R * 0.9;

        const wg = ctx.createLinearGradient(x1, y1, x2, y2);
        wg.addColorStop(0, "transparent");
        wg.addColorStop(0.5, pal.colors[0]);
        wg.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cpx, cpy, x2, y2);
        ctx.strokeStyle = wg;
        ctx.lineWidth = 0.6;
        ctx.globalAlpha = active ? 0.18 : 0.09;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Sphere particles (depth sorted)
      for (const idx of sortIdx) {
        const p = proj[idx];
        const col = pal.colors[Math.min(p.colorIdx, pal.colors.length - 1)];

        if (p.halo) {
          const hR = p.size * 4;
          const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, hR);
          hg.addColorStop(0, col + "55");
          hg.addColorStop(1, "transparent");
          ctx.fillStyle = hg;
          ctx.globalAlpha = p.alpha * 0.55;
          ctx.beginPath();
          ctx.arc(p.x, p.y, hR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.25, p.size), 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = Math.min(1, p.alpha);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Neural impulses
      const impInterval = active ? 18 : 45;
      if (frame - lastImpulseFrame > impInterval) {
        spawnImpulse(s);
        lastImpulseFrame = frame;
      }

      for (let i = impulses.length - 1; i >= 0; i--) {
        const imp = impulses[i];
        imp.t += imp.speed * (active ? 1.9 : 1);
        if (imp.t >= 1) { impulses.splice(i, 1); continue; }

        const pa = particles[imp.ai], pb = particles[imp.bi];
        let [ax, ay] = ry(pa.nx, pa.ny, pa.nz, nudgeAngle);
        [ax, ay] = [cx + ax * pa.rad * R, cy + ay * pa.rad * R];
        let [bx, by] = ry(pb.nx, pb.ny, pb.nz, nudgeAngle);
        [bx, by] = [cx + bx * pb.rad * R, cy + by * pb.rad * R];

        const ix = ax + (bx - ax) * imp.t;
        const iy = ay + (by - ay) * imp.t;

        // Trail
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ix, iy);
        ctx.strokeStyle = pal.core;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.12 * (1 - imp.t);
        ctx.stroke();

        // Dot with glow
        const dg = ctx.createRadialGradient(ix, iy, 0, ix, iy, 5);
        dg.addColorStop(0, "#ffffff");
        dg.addColorStop(0.25, pal.core);
        dg.addColorStop(1, "transparent");
        ctx.fillStyle = dg;
        ctx.globalAlpha = (1 - imp.t * 0.6) * 0.95;
        ctx.beginPath();
        ctx.arc(ix, iy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Orbital rings
      for (const ring of rings) {
        ring.spin += ring.spinSpeed * (s === "speaking" ? 1.65 : s === "listening" ? 1.2 : 1);
        const rR = ring.radius * R;
        const bY = Math.abs(rR * Math.cos(ring.inclination));

        ctx.save();
        ctx.translate(cx, cy);
        ctx.font = `${Math.max(7, R * 0.044)}px "DM Mono", monospace`;

        // Main ring ellipse
        ctx.beginPath();
        ctx.ellipse(0, 0, rR, bY, 0, 0, Math.PI * 2);
        ctx.strokeStyle = pal.ring;
        ctx.lineWidth = 0.7;
        ctx.globalAlpha = 0.45;
        ctx.stroke();

        // Glowing arc segment (top 40%)
        ctx.beginPath();
        const arcS = ring.spin;
        ctx.ellipse(0, 0, rR, bY, 0, arcS, arcS + Math.PI * 0.75);
        ctx.strokeStyle = pal.core;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.55;
        ctx.stroke();

        // Tick marks
        for (let t = 0; t < ring.tickN; t++) {
          const a = (t / ring.tickN) * Math.PI * 2 + ring.spin;
          const isMajor = t % Math.floor(ring.tickN / 6) === 0;
          const tx1 = Math.cos(a) * rR;
          const ty1 = Math.sin(a) * bY;
          const tx2 = Math.cos(a) * rR * (isMajor ? 0.94 : 0.97);
          const ty2 = Math.sin(a) * bY * (isMajor ? 0.94 : 0.97);
          ctx.beginPath();
          ctx.moveTo(tx1, ty1);
          ctx.lineTo(tx2, ty2);
          ctx.strokeStyle = pal.colors[0];
          ctx.lineWidth = isMajor ? 1.1 : 0.4;
          ctx.globalAlpha = isMajor ? 0.7 : 0.3;
          ctx.stroke();
        }

        // Label
        if (ring.label) {
          const la = ring.spin + 0.25;
          const lx = Math.cos(la) * rR * 1.07;
          const ly = Math.sin(la) * bY * 1.07;
          ctx.fillStyle = pal.colors[0];
          ctx.globalAlpha = 0.65;
          ctx.fillText(ring.label, lx, ly);
        }

        // Dot at lead edge of arc
        const dotA = ring.spin + Math.PI * 0.75;
        const dotX = Math.cos(dotA) * rR;
        const dotY = Math.sin(dotA) * bY;
        const dg2 = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 4);
        dg2.addColorStop(0, "#ffffff");
        dg2.addColorStop(0.4, pal.core);
        dg2.addColorStop(1, "transparent");
        ctx.fillStyle = dg2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Holographic waveform ring (listening)
      if (s === "listening") {
        const waveR = R * 1.08;
        const barCount = 64;
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2;
          const amplitude = R * 0.06 * (0.4 + 0.6 * Math.abs(Math.sin(frame * 0.08 + i * 0.4)));
          const x1 = cx + Math.cos(angle) * waveR;
          const y1 = cy + Math.sin(angle) * waveR;
          const x2 = cx + Math.cos(angle) * (waveR + amplitude);
          const y2 = cy + Math.sin(angle) * (waveR + amplitude);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = pal.core;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(frame * 0.12 + i * 0.3);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Speaking: particle stream rings
      if (s === "speaking") {
        const streamR = R * 1.05;
        const streamCount = 3;
        for (let s = 0; s < streamCount; s++) {
          const offset = (s / streamCount) * Math.PI * 2;
          const angle = rotAngle * 3.5 + offset;
          const sx = cx + Math.cos(angle) * streamR;
          const sy = cy + Math.sin(angle) * streamR * 0.7;
          const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 8);
          sg.addColorStop(0, "#ffffff");
          sg.addColorStop(0.3, pal.core);
          sg.addColorStop(1, "transparent");
          ctx.fillStyle = sg;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(sx, sy, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Ripple waves (listening)
      if (s === "listening") {
        if (frame - lastRippleFrame > 55) {
          ripples.push({ t: 0 });
          lastRippleFrame = frame;
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
          ripples[i].t += 0.012;
          if (ripples[i].t > 1) { ripples.splice(i, 1); continue; }
          const rr = R * (1.05 + ripples[i].t * 0.9);
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.strokeStyle = pal.core;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = (1 - ripples[i].t) * 0.45;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Core glow (always)
      const coreRad = active ? R * 0.13 : R * 0.09;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRad * 5);
      cg.addColorStop(0, "#ffffff");
      cg.addColorStop(0.15, pal.core);
      cg.addColorStop(0.4, pal.glow + "0.4)");
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg;
      ctx.globalAlpha = active ? 0.9 : 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRad * 5, 0, Math.PI * 2);
      ctx.fill();
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
      onClick={onClick}
      className="w-full h-full"
      style={{ cursor: "pointer" }}
    />
  );
}
