import { useEffect, useRef, useState, useCallback } from 'react';

interface Particle {
  theta: number;
  phi: number;
  r: number;
  baseHue: number;
  brightness: number;
  dTheta: number;
  dPhi: number;
  phase: number;
}

const N = 1800;
const SPHERE_R = 195;
const FOV = 540;

export function GalaxyField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0.25, y: 0 });
  const talkAmtRef = useRef(0);
  const listenAmtRef = useRef(0);
  const tRef = useRef(0);

  const [isListening, setIsListening] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const isListeningRef = useRef(false);
  const isTalkingRef = useRef(false);

  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { isTalkingRef.current = isTalking; }, [isTalking]);

  const handleMicClick = useCallback(() => {
    if (isListeningRef.current) {
      setIsListening(false);
      setTimeout(() => {
        setIsTalking(true);
        setTimeout(() => setIsTalking(false), 4200 + Math.random() * 3200);
      }, 480);
    } else {
      setIsListening(true);
      setIsTalking(false);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // Fibonacci sphere — even angular distribution
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const particles: Particle[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const phi = Math.acos(Math.max(-1, Math.min(1, y)));
      const theta = (goldenAngle * i) % (Math.PI * 2);

      // ~72% on shell for crisp edge, ~28% interior for volumetric dust cloud feel
      const t = Math.random();
      const r = t > 0.28 ? 0.86 + Math.random() * 0.14 : Math.pow(Math.random(), 0.6) * 0.86;

      // Nebula hue bands: cyan → blue → violet → indigo flowing across the sphere
      // Vary by latitude (phi) and longitude (theta) for cloud-like pockets
      const latBand  = Math.sin(phi * 3.5) * 22;
      const longBand = Math.cos(theta * 2.1) * 16 + Math.sin(theta * 4.3) * 8;
      const baseHue  = 195 + latBand + longBand; // 150–250 range: cyan → violet

      particles.push({
        theta, phi, r,
        baseHue,
        brightness: 0.28 + Math.random() * 0.72,
        dTheta: (Math.random() - 0.5) * 0.00038,
        dPhi:   (Math.random() - 0.5) * 0.00020,
        phase:  Math.random() * Math.PI * 2,
      });
    }
    particlesRef.current = particles;

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth  - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener('mousemove', onMouse);

    const animate = () => {
      tRef.current += 0.016;
      const t = tRef.current;

      talkAmtRef.current  += ((isTalkingRef.current  ? 1 : 0) - talkAmtRef.current)  * 0.042;
      listenAmtRef.current += ((isListeningRef.current ? 1 : 0) - listenAmtRef.current) * 0.058;
      const ta = talkAmtRef.current;
      const la = listenAmtRef.current;

      // Smooth rotation toward mouse, plus slow auto-spin
      rotRef.current.x += (mouseRef.current.y * 0.5  - rotRef.current.x) * 0.022;
      rotRef.current.y += (mouseRef.current.x * 0.7  - rotRef.current.y) * 0.022;
      rotRef.current.y += 0.0014;

      const cx = canvas.width  / 2;
      const cy = canvas.height / 2;
      const rx = rotRef.current.x;
      const ry = rotRef.current.y;

      // --- background ---
      ctx.fillStyle = '#04060f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Faint deep ambient glow beneath the sphere
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, SPHERE_R * 1.55);
      ambient.addColorStop(0,   `rgba(10, 20, 60, ${0.55 + ta * 0.25})`);
      ambient.addColorStop(0.55,`rgba(5, 10, 35, 0.25)`);
      ambient.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = ambient;
      ctx.beginPath();
      ctx.arc(cx, cy, SPHERE_R * 1.55, 0, Math.PI * 2);
      ctx.fill();

      // --- project all particles ---
      type P = { sx: number; sy: number; sz: number; brightness: number; hue: number; depth: number; onShell: boolean; };
      const projected: P[] = new Array(N);

      for (let i = 0; i < N; i++) {
        const p = particles[i];

        p.theta += p.dTheta;
        p.phi   += p.dPhi;
        if (p.phi < 0.04)          { p.phi = 0.04;           p.dPhi *= -1; }
        if (p.phi > Math.PI - 0.04){ p.phi = Math.PI - 0.04; p.dPhi *= -1; }

        let rScale = p.r;

        if (ta > 0.005) {
          // Multi-harmonic ripple waves propagate over the surface
          const w1 = Math.sin(p.phi  * 7  - t * 8.5)          * 0.065;
          const w2 = Math.sin(p.theta * 6  + t * 5.5 + p.phase) * 0.042;
          const w3 = Math.sin(p.phi  * 13 - t * 3.8 + p.phase * 1.7) * 0.028;
          rScale += (w1 + w2 + w3) * ta;
        }
        if (la > 0.005) {
          rScale += Math.sin(t * 2.1 + p.phase) * 0.016 * la;
        }

        const sinPhi = Math.sin(p.phi);
        let px = sinPhi * Math.cos(p.theta) * SPHERE_R * rScale;
        let py = sinPhi * Math.sin(p.theta) * SPHERE_R * rScale;
        let pz = Math.cos(p.phi)            * SPHERE_R * rScale;

        // Rotate X-axis
        const y1 =  py * Math.cos(rx) - pz * Math.sin(rx);
        const z1 =  py * Math.sin(rx) + pz * Math.cos(rx);
        // Rotate Y-axis
        const x2 =  px * Math.cos(ry) + z1 * Math.sin(ry);
        const z2 = -px * Math.sin(ry) + z1 * Math.cos(ry);

        const scale = FOV / (FOV + z2);
        const depth = (z2 + SPHERE_R) / (SPHERE_R * 2); // 0=back 1=front

        // Hue shifts slightly with depth and pulses during talking
        const hue = p.baseHue + z2 * 0.06 + ta * Math.sin(t * 2.5 + p.phase) * 18;
        const brightness = p.brightness * (0.22 + depth * 0.78);

        projected[i] = {
          sx: cx + x2 * scale,
          sy: cy + y1 * scale,
          sz: z2,
          brightness,
          hue,
          depth,
          onShell: p.r > 0.80,
        };
      }

      // Back-to-front sort for correct occlusion
      projected.sort((a, b) => a.sz - b.sz);

      // --- SPARSE CONNECTIONS ---
      // Only front-hemisphere shell particles, sampled thinly so dots dominate
      const maxConnDist  = 48 + ta * 18;
      const maxConnDist2 = maxConnDist * maxConnDist;
      const connAlpha    = 0.07 + ta * 0.10 + la * 0.03;
      const stride = 6; // sample every 6th — keeps lines sparse

      ctx.lineWidth = 0.45;
      for (let i = 0; i < projected.length; i += stride) {
        const a = projected[i];
        if (!a.onShell || a.depth < 0.48) continue;
        for (let j = i + stride; j < Math.min(i + stride * 8, projected.length); j += stride) {
          const b = projected[j];
          if (!b.onShell || b.depth < 0.48) continue;
          const dx = a.sx - b.sx, dy = a.sy - b.sy;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxConnDist2) {
            const prox  = 1 - Math.sqrt(d2) / maxConnDist;
            const alpha = connAlpha * prox * ((a.depth + b.depth) * 0.5);
            const hue   = (a.hue + b.hue) * 0.5;
            ctx.strokeStyle = `hsla(${hue}, 75%, 70%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // --- PARTICLES ---
      for (const p of projected) {
        const { sx, sy, brightness, hue, depth } = p;

        // Soft halo — only on bright front-facing particles
        if (depth > 0.5 && brightness > 0.48) {
          const hr = 1.6 + brightness * 3.2 + ta * 1.8;
          const g  = ctx.createRadialGradient(sx, sy, 0, sx, sy, hr);
          const a0 = 0.28 * brightness * depth;
          g.addColorStop(0,   `hsla(${hue + 10}, 80%, 88%, ${a0})`);
          g.addColorStop(0.45,`hsla(${hue},      75%, 65%, ${a0 * 0.45})`);
          g.addColorStop(1,   'hsla(0,0%,0%,0)');
          ctx.fillStyle = g;
          ctx.fillRect(sx - hr, sy - hr, hr * 2, hr * 2);
        }

        // Sub-pixel crisp dot
        const lum = 28 + brightness * 52 + depth * 14;
        const sat = 55 + depth * 35;
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lum}%)`;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // --- CORE INTELLIGENCE GLOW ---
      // Subtle inner luminescence — JARVIS nucleus feel
      const coreR = SPHERE_R * 0.55;
      const coreAlpha = 0.14 + ta * 0.22 + la * 0.10 + Math.sin(t * 1.6) * 0.02;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0,   `rgba(130, 200, 255, ${coreAlpha})`);
      core.addColorStop(0.35,`rgba(80,  140, 240, ${coreAlpha * 0.55})`);
      core.addColorStop(0.7, `rgba(50,  80,  200, ${coreAlpha * 0.22})`);
      core.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Rim halo — gossamer ring at sphere edge
      const rimR   = SPHERE_R * (1.01 + Math.sin(t * 2.8) * 0.008 * (ta + 0.4));
      const rim    = ctx.createRadialGradient(cx, cy, rimR * 0.88, cx, cy, rimR * 1.14);
      rim.addColorStop(0,   `rgba(80, 160, 255, ${0.08 + ta * 0.14})`);
      rim.addColorStop(0.5, `rgba(100, 80, 220, ${0.05 + ta * 0.08})`);
      rim.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, rimR * 1.14, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Idle particle shimmer text colors
  const statusColor = isTalking
    ? 'rgba(120, 210, 255, 0.9)'
    : isListening
    ? 'rgba(160, 230, 255, 0.85)'
    : 'rgba(80, 140, 200, 0.42)';

  return (
    <div className="relative w-full h-full" style={{ background: '#04060f' }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">

        {/* Status label — floats above the sphere */}
        <div
          className="mb-[240px] text-[10px] tracking-[0.35em] uppercase transition-all duration-700 select-none"
          style={{
            color: statusColor,
            textShadow: isTalking ? '0 0 18px rgba(80,180,255,0.65)' : 'none',
          }}
        >
          {isTalking ? 'responding' : isListening ? 'listening' : 'AI assistant'}
        </div>

        {/* Mic button — anchored below the sphere */}
        <button
          onClick={handleMicClick}
          className="mt-[240px] pointer-events-auto relative flex items-center justify-center w-[52px] h-[52px] rounded-full transition-all duration-300 cursor-pointer select-none"
          style={{
            background: isListening
              ? 'radial-gradient(circle, rgba(80,200,255,0.14) 0%, rgba(60,140,240,0.04) 100%)'
              : 'radial-gradient(circle, rgba(40,90,160,0.10) 0%, rgba(20,50,120,0.02) 100%)',
            border: isListening
              ? '1px solid rgba(80,200,255,0.65)'
              : '1px solid rgba(50,100,180,0.28)',
            boxShadow: isListening
              ? '0 0 26px rgba(60,180,255,0.32), inset 0 0 12px rgba(60,180,255,0.08)'
              : isTalking
              ? '0 0 18px rgba(80,140,240,0.22)'
              : '0 0 8px rgba(40,80,160,0.12)',
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: isListening ? 'rgba(120,220,255,0.95)' : 'rgba(80,140,200,0.58)' }}>
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="9"  y1="22" x2="15" y2="22" />
          </svg>
          {isListening && (
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ border: '1px solid rgba(80,200,255,0.38)', animationDuration: '1.35s' }}
            />
          )}
        </button>

        <p
          className="mt-[10px] pointer-events-none text-[9px] tracking-[0.25em] uppercase select-none transition-all duration-500"
          style={{ color: 'rgba(60,110,180,0.38)' }}
        >
          {isListening ? 'tap to send' : isTalking ? ' ' : 'tap to speak'}
        </p>
      </div>
    </div>
  );
}
