import { useEffect, useRef } from 'react';
import type { AIMode } from '../App';

interface Orb {
  id: number;
  // base spherical coords (unit sphere)
  bx: number;
  by: number;
  bz: number;
  // current position (offset from base for thinking/rearrange)
  ox: number;
  oy: number;
  oz: number;
  phase: number;
  speed: number;
  glowPhase: number;
}

interface MessengerOrb {
  id: number;
  orbIndex: number;
  tx: number; // target direction x
  ty: number;
  tz: number;
  progress: number; // 0 = at sphere, 1 = max out, 2 = back
  speed: number;
}

interface LightWave {
  radius: number;
  opacity: number;
  speed: number;
}

const MODE_COLORS: Record<AIMode, { h: number; s: number }> = {
  idle:       { h: 220, s: 100 },
  listening:  { h: 185, s: 100 },
  thinking:   { h: 270, s: 100 },
  responding: { h: 45,  s: 100 },
};

export function NeuralSphere({ mode }: { mode: AIMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<AIMode>(mode);
  const orbsRef = useRef<Orb[]>([]);
  const messengersRef = useRef<MessengerOrb[]>([]);
  const wavesRef = useRef<LightWave[]>([]);
  const animationFrameRef = useRef<number>();
  const lastModeRef = useRef<AIMode>('idle');
  const messengerIdRef = useRef(0);

  // Keep modeRef in sync
  useEffect(() => {
    const prev = modeRef.current;
    modeRef.current = mode;

    // Trigger mode-specific one-shot effects
    if (mode !== prev) {
      if (mode === 'responding') {
        // spawn a burst of light waves
        for (let i = 0; i < 4; i++) {
          wavesRef.current.push({ radius: 0, opacity: 0.8, speed: 3 + i * 1.5 });
        }
        // spawn messenger orbs
        for (let k = 0; k < 5; k++) {
          const phi = Math.random() * Math.PI;
          const theta = Math.random() * Math.PI * 2;
          messengersRef.current.push({
            id: messengerIdRef.current++,
            orbIndex: Math.floor(Math.random() * orbsRef.current.length),
            tx: Math.sin(phi) * Math.cos(theta),
            ty: Math.sin(phi) * Math.sin(theta),
            tz: Math.cos(phi),
            progress: 0,
            speed: 0.006 + Math.random() * 0.004,
          });
        }
      }
      if (mode === 'listening') {
        // spawn 2 waves immediately
        wavesRef.current.push({ radius: 0, opacity: 0.5, speed: 2 });
        wavesRef.current.push({ radius: 0, opacity: 0.35, speed: 1.5 });
      }
    }
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    // Fibonacci sphere — dense particle field
    const numOrbs = 1800;
    const orbs: Orb[] = [];
    for (let i = 0; i < numOrbs; i++) {
      const phi = Math.acos(-1 + (2 * i) / numOrbs);
      const theta = Math.sqrt(numOrbs * Math.PI) * phi;
      orbs.push({
        id: i,
        bx: Math.sin(phi) * Math.cos(theta),
        by: Math.sin(phi) * Math.sin(theta),
        bz: Math.cos(phi),
        ox: 0, oy: 0, oz: 0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5,
        glowPhase: Math.random() * Math.PI * 2,
      });
    }
    orbsRef.current = orbs;

    let time = 0;
    // Track thinking rearrangement targets
    const thinkTargets: { ox: number; oy: number; oz: number }[] = orbs.map(() => ({ ox: 0, oy: 0, oz: 0 }));
    let lastThinkShuffle = 0;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const animate = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      const mode = modeRef.current;

      // Trail fade — stronger trail in thinking mode
      const trailAlpha = mode === 'thinking' ? 0.06 : mode === 'responding' ? 0.08 : 0.12;
      ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
      ctx.fillRect(0, 0, width, height);

      time += 0.005;

      const centerX = width / 2;
      const centerY = height / 2;

      // Sphere radius — expands when listening, contracts slightly when thinking
      const baseSize = Math.min(width, height) * 0.3;
      let sphereScale = 1;
      if (mode === 'listening') {
        sphereScale = 1 + Math.sin(time * 3) * 0.08 + 0.06; // breathe outward
      } else if (mode === 'thinking') {
        sphereScale = 0.95 + Math.sin(time * 5) * 0.04;
      } else if (mode === 'responding') {
        sphereScale = 1.1 + Math.sin(time * 2) * 0.05;
      }
      const sphereSize = baseSize * sphereScale;

      // Rotation — faster during thinking
      const rotSpeed = mode === 'thinking' ? 0.8 : mode === 'responding' ? 0.5 : 0.3;
      const rotY = time * rotSpeed;
      const rotX = Math.sin(time * 0.2) * 0.3;

      // Color hue interpolation
      const targetHue = MODE_COLORS[mode].h;
      const currentHue = targetHue; // canvas can't tween easily; rely on per-frame color

      // Thinking: periodically shuffle orb offsets
      if (mode === 'thinking' && time - lastThinkShuffle > 1.5) {
        lastThinkShuffle = time;
        for (let i = 0; i < orbs.length; i++) {
          thinkTargets[i] = {
            ox: (Math.random() - 0.5) * 0.25,
            oy: (Math.random() - 0.5) * 0.25,
            oz: (Math.random() - 0.5) * 0.25,
          };
        }
      }

      // Draw light waves
      wavesRef.current = wavesRef.current.filter(wave => wave.opacity > 0.01);
      wavesRef.current.forEach(wave => {
        wave.radius += wave.speed;
        wave.opacity *= 0.985;

        const waveColor = mode === 'responding'
          ? `rgba(251, 191, 36, ${wave.opacity * 0.6})`
          : mode === 'listening'
          ? `rgba(6, 182, 212, ${wave.opacity * 0.5})`
          : `rgba(139, 92, 246, ${wave.opacity * 0.5})`;

        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, wave.radius * (sphereSize / 100), 0, Math.PI * 2);
        ctx.stroke();
      });

      // Listening: continuous pulse wave emission
      if (mode === 'listening' && Math.sin(time * 4) > 0.95) {
        wavesRef.current.push({ radius: 0, opacity: 0.5, speed: 2.5 });
      }

      // Sort orbs back-to-front for proper depth
      const sortedOrbs = orbs.map((orb, index) => {
        // Approach think target offset
        if (mode === 'thinking') {
          orb.ox = lerp(orb.ox, thinkTargets[index].ox, 0.02);
          orb.oy = lerp(orb.oy, thinkTargets[index].oy, 0.02);
          orb.oz = lerp(orb.oz, thinkTargets[index].oz, 0.02);
        } else {
          // Return to sphere
          orb.ox = lerp(orb.ox, 0, 0.04);
          orb.oy = lerp(orb.oy, 0, 0.04);
          orb.oz = lerp(orb.oz, 0, 0.04);
        }

        let x = orb.bx + orb.ox;
        let y = orb.by + orb.oy;
        let z = orb.bz + orb.oz;

        // Rotate Y
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const tx = x * cosY - z * sinY;
        z = x * sinY + z * cosY;
        x = tx;

        // Rotate X
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const ty2 = y * cosX - z * sinX;
        z = y * sinX + z * cosX;
        y = ty2;

        return { orb, index, x, y, z };
      }).sort((a, b) => a.z - b.z);

      // Draw connections first (below orbs)
      const connOpacityMult = mode === 'thinking' ? 2.5 : mode === 'responding' ? 1.8 : 1;
      sortedOrbs.forEach(({ orb, index, x, y, z }) => {
        const pulse = Math.sin(time * orb.speed + orb.phase) * 0.1 + 1;
        const scale = sphereSize * pulse;
        const perspective = 1 / (1 - z * 0.35);
        const projX = centerX + x * scale * perspective;
        const projY = centerY + y * scale * perspective;

        // Connections — every Nth orb, fewer during responding
        const connEvery = mode === 'responding' ? 60 : mode === 'thinking' ? 35 : 50;
        if (index % connEvery === 0) {
          const neighbors = sortedOrbs.slice(
            Math.max(0, sortedOrbs.indexOf({ orb, index, x, y, z } as typeof sortedOrbs[0])),
          ).slice(1, mode === 'thinking' ? 4 : 2);

          neighbors.forEach(other => {
            const oPerspective = 1 / (1 - other.z * 0.35);
            const oProjX = centerX + other.x * sphereSize * oPerspective;
            const oProjY = centerY + other.y * sphereSize * oPerspective;

            const avgZ = (z + other.z) / 2;
            const baseOpacity = ((avgZ + 1) / 2) * 0.18 * connOpacityMult;

            // Energy pulse along connection during thinking
            let lineOpacity = baseOpacity;
            if (mode === 'thinking') {
              lineOpacity *= (0.5 + Math.sin(time * 8 + orb.phase) * 0.5);
            }

            const hue = currentHue + ((avgZ + 1) / 2) * 40;
            ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${Math.min(lineOpacity, 0.6)})`;
            ctx.lineWidth = mode === 'thinking' ? 0.8 : 0.5;
            ctx.beginPath();
            ctx.moveTo(projX, projY);
            ctx.lineTo(oProjX, oProjY);
            ctx.stroke();
          });
        }
      });

      // Draw orbs as a fine particle/galaxy field
      sortedOrbs.forEach(({ orb, x, y, z }) => {
        const pulse = Math.sin(time * orb.speed + orb.phase) * 0.05 + 1;
        const scale = sphereSize * pulse;
        const perspective = 1 / (1 - z * 0.35);
        const projX = centerX + x * scale * perspective;
        const projY = centerY + y * scale * perspective;

        const brightness = (z + 1) / 2;
        const twinkle = Math.sin(time * 3 + orb.glowPhase) * 0.4 + 0.6;

        let hue = currentHue + brightness * 40;
        // Slight hue variation across the field for a nebula look
        hue += Math.sin(orb.phase * 7) * 25;

        // Responding: occasional bright gold flashes
        let lightness = 75;
        if (mode === 'responding' && Math.sin(time * 10 + orb.phase * 3) > 0.88) {
          hue = 48;
          lightness = 95;
        }

        const alpha = brightness * twinkle * 0.85;

        // Tiny soft halo (very small radius, low opacity)
        if (brightness > 0.55) {
          const haloR = 2.2 * perspective;
          const haloGrad = ctx.createRadialGradient(projX, projY, 0, projX, projY, haloR);
          haloGrad.addColorStop(0, `hsla(${hue}, 100%, ${lightness}%, ${alpha * 0.35})`);
          haloGrad.addColorStop(1, `hsla(${hue}, 100%, ${lightness}%, 0)`);
          ctx.fillStyle = haloGrad;
          ctx.beginPath();
          ctx.arc(projX, projY, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Crisp centre pixel — single rect for speed and sharpness
        const dotSize = Math.max(0.6, (0.8 + brightness * 0.7) * perspective);
        ctx.fillStyle = `hsla(${hue}, 100%, ${lightness}%, ${alpha})`;
        ctx.fillRect(projX - dotSize / 2, projY - dotSize / 2, dotSize, dotSize);
      });

      // Draw central core glow
      const coreSize = 20 + (mode === 'listening' ? Math.sin(time * 6) * 8 : 0)
                          + (mode === 'responding' ? 15 : 0);
      const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreSize * 3);
      const coreHue = currentHue;
      coreGrad.addColorStop(0, `hsla(${coreHue}, 100%, 95%, 0.9)`);
      coreGrad.addColorStop(0.3, `hsla(${coreHue}, 100%, 70%, 0.5)`);
      coreGrad.addColorStop(1, `hsla(${coreHue}, 100%, 50%, 0)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreSize * 3, 0, Math.PI * 2);
      ctx.fill();

      // Messenger orbs
      messengersRef.current = messengersRef.current.filter(m => m.progress < 2);
      messengersRef.current.forEach(messenger => {
        messenger.progress += messenger.speed;

        // 0→1: travel outward. 1→2: return
        const p = messenger.progress <= 1 ? messenger.progress : 2 - messenger.progress;
        const dist = Math.sin(p * Math.PI) * sphereSize * 1.6;

        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        let mx = messenger.tx, my = messenger.ty, mz = messenger.tz;
        const tmx = mx * cosY - mz * sinY;
        mz = mx * sinY + mz * cosY;
        mx = tmx;

        const perspective = 1 / (1 - mz * 0.35);
        const projX = centerX + mx * dist * perspective;
        const projY = centerY + my * dist * perspective;

        // Trail line back to center
        const trailGrad = ctx.createLinearGradient(centerX, centerY, projX, projY);
        trailGrad.addColorStop(0, 'rgba(251, 191, 36, 0)');
        trailGrad.addColorStop(1, `rgba(251, 191, 36, ${0.6 * (1 - Math.abs(messenger.progress - 1))})`);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(projX, projY);
        ctx.stroke();

        // Messenger dot
        const mGrad = ctx.createRadialGradient(projX, projY, 0, projX, projY, 8);
        mGrad.addColorStop(0, 'rgba(255, 220, 100, 1)');
        mGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.7)');
        mGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = mGrad;
        ctx.beginPath();
        ctx.arc(projX, projY, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
}
