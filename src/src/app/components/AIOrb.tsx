import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";

interface AIOrbProps {
  isListening: boolean;
  isSpeaking: boolean;
  isIdle: boolean;
  onClick: () => void;
}

export function AIOrb({ isListening, isSpeaking, isIdle, onClick }: AIOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const state = isSpeaking ? "speaking" : isListening ? "listening" : "idle";

  const colors = {
    idle:      { core: "#00bcd4", ring: "#0097a7", glow: "rgba(0,188,212,0.15)", particle: "#00e5ff" },
    listening: { core: "#29b6f6", ring: "#0288d1", glow: "rgba(41,182,246,0.25)", particle: "#81d4fa" },
    speaking:  { core: "#7c4dff", ring: "#651fff", glow: "rgba(124,77,255,0.25)", particle: "#b388ff" },
  };
  const c = colors[state];

  // Canvas particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width = 320;
    const H = canvas.height = 320;
    const cx = W / 2, cy = H / 2;

    const particles: { angle: number; radius: number; speed: number; size: number; opacity: number; layer: number }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 80 + Math.random() * 60,
        speed: (Math.random() - 0.5) * 0.008,
        size: Math.random() * 1.5 + 0.4,
        opacity: Math.random() * 0.6 + 0.2,
        layer: Math.floor(Math.random() * 3),
      });
    }

    function draw() {
      timeRef.current += 0.012;
      const t = timeRef.current;
      ctx.clearRect(0, 0, W, H);

      const active = isSpeaking || isListening;
      const particleColor = isSpeaking ? "#b388ff" : isListening ? "#81d4fa" : "#00e5ff";
      const glowColor = isSpeaking ? "rgba(124,77,255," : isListening ? "rgba(41,182,246," : "rgba(0,188,212,";

      // Outer subtle halo
      const halo = ctx.createRadialGradient(cx, cy, 60, cx, cy, 150);
      halo.addColorStop(0, glowColor + "0.08)");
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      // Particles orbiting
      particles.forEach((p) => {
        p.angle += p.speed * (active ? 2.5 : 1);
        const wobble = active ? Math.sin(t * 3 + p.layer * 2) * 6 : 0;
        const r = p.radius + wobble;
        const x = cx + Math.cos(p.angle) * r;
        const y = cy + Math.sin(p.angle) * r;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = particleColor;
        ctx.globalAlpha = p.opacity * (active ? 0.9 : 0.45);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Rotating arc rings
      [
        { r: 90, width: 0.8, speed: 0.3, dashLen: 0.6, opacity: active ? 0.5 : 0.2 },
        { r: 108, width: 0.6, speed: -0.18, dashLen: 0.4, opacity: active ? 0.4 : 0.15 },
        { r: 125, width: 0.5, speed: 0.1, dashLen: 0.5, opacity: active ? 0.3 : 0.1 },
      ].forEach(({ r, width, speed, dashLen, opacity }) => {
        ctx.beginPath();
        const startAngle = t * speed;
        const arc = Math.PI * 2 * dashLen;
        ctx.arc(cx, cy, r, startAngle, startAngle + arc);
        ctx.strokeStyle = particleColor;
        ctx.lineWidth = width;
        ctx.globalAlpha = opacity;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Data scan line (only when active)
      if (active) {
        const scanAngle = t * 1.2;
        const scanGrad = ctx.createLinearGradient(
          cx, cy,
          cx + Math.cos(scanAngle) * 130,
          cy + Math.sin(scanAngle) * 130
        );
        scanGrad.addColorStop(0, "transparent");
        scanGrad.addColorStop(1, particleColor);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(scanAngle) * 130, cy + Math.sin(scanAngle) * 130);
        ctx.strokeStyle = scanGrad;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isListening, isSpeaking]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 320, height: 320 }}>
      {/* Canvas particles + arcs */}
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="absolute inset-0"
        style={{ pointerEvents: "none" }}
      />

      {/* Outermost slow rotating ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 260,
          height: 260,
          border: `1px solid ${c.ring}`,
          opacity: 0.18,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      />

      {/* Dashed orbital ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 220,
          height: 220,
          border: `1px dashed ${c.ring}`,
          opacity: state === "idle" ? 0.15 : 0.3,
          transition: "opacity 0.5s",
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />

      {/* Inner ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 168,
          height: 168,
          border: `1px solid ${c.core}`,
          opacity: state === "idle" ? 0.2 : 0.45,
          transition: "opacity 0.5s",
          boxShadow: `0 0 20px ${c.glow}`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />

      {/* Pulse rings when active */}
      <AnimatePresence>
        {(isListening || isSpeaking) &&
          [0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 140,
                height: 140,
                border: `1px solid ${c.core}`,
              }}
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: i * 0.65,
                ease: "easeOut",
              }}
            />
          ))}
      </AnimatePresence>

      {/* Core orb — clickable */}
      <motion.button
        onClick={onClick}
        className="relative z-10 rounded-full flex items-center justify-center cursor-pointer outline-none"
        style={{
          width: 130,
          height: 130,
          background: `radial-gradient(circle at 38% 36%, ${c.core}33 0%, ${c.ring}22 50%, transparent 100%)`,
          border: `1.5px solid ${c.core}`,
          boxShadow: `0 0 40px ${c.glow}, 0 0 80px ${c.glow}, inset 0 0 30px ${c.core}11`,
          transition: "all 0.45s ease",
        }}
        whileTap={{ scale: 0.94 }}
        animate={
          isSpeaking
            ? { scale: [1, 1.04, 1] }
            : isListening
            ? { scale: [1, 1.025, 1] }
            : {}
        }
        transition={{ duration: isSpeaking ? 0.9 : 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Inner lens */}
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: 88,
            height: 88,
            background: `radial-gradient(circle at 40% 35%, ${c.core}44, ${c.ring}22 60%, transparent)`,
            border: `1px solid ${c.core}55`,
          }}
        >
          {/* Center symbol */}
          <motion.div
            animate={
              state === "speaking"
                ? { scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }
                : state === "listening"
                ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }
                : { scale: [1, 1.03, 1], opacity: [0.5, 0.7, 0.5] }
            }
            transition={{ duration: state === "speaking" ? 0.7 : 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="6" fill={c.core} opacity="0.95" />
              <circle cx="18" cy="18" r="11" stroke={c.core} strokeWidth="1" opacity="0.4" />
              <circle cx="18" cy="18" r="16" stroke={c.core} strokeWidth="0.5" opacity="0.2" />
              {/* Cross hairs */}
              <line x1="18" y1="2" x2="18" y2="8" stroke={c.core} strokeWidth="0.8" opacity="0.5" />
              <line x1="18" y1="28" x2="18" y2="34" stroke={c.core} strokeWidth="0.8" opacity="0.5" />
              <line x1="2" y1="18" x2="8" y2="18" stroke={c.core} strokeWidth="0.8" opacity="0.5" />
              <line x1="28" y1="18" x2="34" y2="18" stroke={c.core} strokeWidth="0.8" opacity="0.5" />
            </svg>
          </motion.div>
        </div>
      </motion.button>
    </div>
  );
}
