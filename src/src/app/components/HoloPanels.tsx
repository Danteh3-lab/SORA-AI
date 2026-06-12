import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { OrbState } from "./JARVISSphere";

interface HoloPanelsProps {
  state: OrbState;
  liveText: string;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ACTIVITY_BARS = [
  { label: "COGNITION", val: 0.92 },
  { label: "MEMORY", val: 0.74 },
  { label: "LANGUAGE", val: 0.88 },
  { label: "SEARCH", val: 0.45 },
  { label: "REASONING", val: 0.81 },
];

const STATUS_LINES = [
  { key: "CPU", val: "98.4%", color: "#00e5ff" },
  { key: "MEM", val: "12.3 GB", color: "#29b6f6" },
  { key: "LATENCY", val: "18 ms", color: "#4fc3f7" },
  { key: "UPTIME", val: "47h 22m", color: "#00e5ff" },
];

const glassStyle = {
  background: "rgba(4, 8, 20, 0.72)",
  border: "1px solid rgba(0, 229, 255, 0.14)",
  boxShadow: "0 0 24px rgba(0,180,255,0.06), inset 0 1px 0 rgba(0,229,255,0.07)",
  backdropFilter: "blur(12px)",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "DM Mono, monospace",
  color: "#00e5ff",
  fontSize: 9,
  letterSpacing: "0.18em",
  opacity: 0.7,
};

const monoSm: React.CSSProperties = {
  fontFamily: "DM Mono, monospace",
  fontSize: 10,
};

function activityLevel(base: number, phase: number, state: OrbState, index: number) {
  const gain = state === "speaking" ? 0.22 : state === "thinking" ? 0.28 : state === "listening" ? 0.16 : 0.05;
  const offset = Math.sin(phase * (1.2 + index * 0.11) + index * 0.8) * gain;
  const bias = state === "thinking" ? 0.04 : state === "speaking" ? 0.06 : state === "listening" ? 0.02 : -0.1;
  return Math.max(0.08, Math.min(0.99, base + offset + bias));
}

export function HoloPanels({ state, liveText }: HoloPanelsProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setPhase((value) => value + 0.18), 180);
    return () => window.clearInterval(timer);
  }, []);

  const now = new Date();
  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isSpeaking = state === "speaking";
  const stateColor = isSpeaking ? "#00e5ff" : isThinking ? "#9be7ff" : isListening ? "#40c4ff" : "#1565c0";
  const stateLabel = isSpeaking ? "RESPONDING" : isThinking ? "REASONING" : isListening ? "LISTENING" : "STANDBY";
  const toolActivity = isSpeaking ? "VOCAL SYNTHESIS" : isThinking ? "CONTEXT WEAVE" : isListening ? "AUDIO CAPTURE" : "PASSIVE MONITOR";
  const waveform = Array.from({ length: 24 }, (_, index) =>
    8 + Math.abs(Math.sin(phase * 1.7 + index * 0.55 + (isThinking ? 0.8 : 0))) * (isSpeaking ? 28 : isThinking ? 23 : isListening ? 18 : 6),
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="absolute left-3 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-2 p-3 rounded-xl z-20"
        style={{ ...glassStyle, width: 176 }}
      >
        <p style={labelStyle}>NEURAL ACTIVITY</p>
        <div className="mt-1 flex flex-col gap-2">
          {ACTIVITY_BARS.map((bar, index) => {
            const displayVal = activityLevel(bar.val, phase, state, index);
            return (
              <div key={bar.label} className="flex flex-col gap-0.5">
                <div className="flex justify-between">
                  <span style={{ ...monoSm, color: "#6b7280" }}>{bar.label}</span>
                  <span style={{ ...monoSm, color: "#00e5ff" }}>{Math.round(displayVal * 100)}%</span>
                </div>
                <div className="h-0.5 overflow-hidden rounded-full" style={{ background: "rgba(0,229,255,0.1)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #1565c0, #00e5ff)" }}
                    animate={{ width: `${displayVal * 100}%` }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>SIGNAL LATTICE</p>
          <div className="mt-2 grid grid-cols-6 gap-1">
            {Array.from({ length: 18 }, (_, index) => {
              const intensity = Math.max(0.18, Math.sin(phase * 1.8 + index * 0.72) * 0.5 + 0.5);
              return (
                <motion.div
                  key={index}
                  className="h-1.5 rounded-full"
                  style={{ background: stateColor }}
                  animate={{ opacity: 0.15 + intensity * 0.85, scaleX: 0.8 + intensity * 0.4 }}
                  transition={{ duration: 0.25 }}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>SYSTEM TIME</p>
          <motion.p
            className="mt-1"
            style={{ ...monoSm, color: "#29b6f6" }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {formatTime(now)}
          </motion.p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-2 p-3 rounded-xl z-20"
        style={{ ...glassStyle, width: 176 }}
      >
        <p style={labelStyle}>SYSTEM STATUS</p>
        <div className="mt-1 flex flex-col gap-1.5">
          {STATUS_LINES.map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <span style={{ ...monoSm, color: "#374151" }}>{item.key}</span>
              <span style={{ ...monoSm, color: item.key === "LATENCY" ? stateColor : item.color }}>{item.val}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>AI STATE</p>
          <div className="mt-1 flex items-center gap-2">
            <motion.div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: stateColor }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.9, repeat: Infinity }}
            />
            <span style={{ ...monoSm, color: isSpeaking || isThinking || isListening ? stateColor : "#374151" }}>
              {stateLabel}
            </span>
          </div>
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>CORTEX TRACE</p>
          <div className="mt-2 flex h-10 items-end gap-[3px]">
            {waveform.map((height, index) => (
              <motion.div
                key={index}
                className="w-1 rounded-full"
                style={{ background: index % 4 === 0 ? "#b3e5fc" : stateColor }}
                animate={{ height }}
                transition={{ duration: 0.22 }}
              />
            ))}
          </div>
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>ACTIVE TOOLS</p>
          <div className="mt-1 flex flex-col gap-1">
            {["VOICE STT", toolActivity, "KNOWLEDGE"].map((tool, index) => (
              <div key={tool} className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full" style={{ background: index === 1 ? stateColor : "#1565c0" }} />
                <span style={{ ...monoSm, color: index === 1 ? "#9be7ff" : "#374151" }}>{tool}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>LIVE CONTEXT</p>
          <p className="mt-1 line-clamp-3" style={{ ...monoSm, color: "#5b7c9f", minHeight: 38 }}>
            {liveText}
          </p>
        </div>
      </motion.div>
    </>
  );
}
