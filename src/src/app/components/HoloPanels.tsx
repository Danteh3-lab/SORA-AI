import { motion } from "motion/react";

interface HoloPanelsProps {
  isListening: boolean;
  isSpeaking: boolean;
  liveText: string;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ACTIVITY_BARS = [
  { label: "COGNITION", val: 0.92 },
  { label: "MEMORY",    val: 0.74 },
  { label: "LANGUAGE",  val: 0.88 },
  { label: "SEARCH",    val: 0.45 },
  { label: "REASONING", val: 0.81 },
];

const STATUS_LINES = [
  { key: "CPU",    val: "98.4%",  color: "#00e5ff" },
  { key: "MEM",    val: "12.3 GB",color: "#29b6f6" },
  { key: "LATENCY",val: "18 ms",  color: "#4fc3f7" },
  { key: "UPTIME", val: "47h 22m",color: "#00e5ff" },
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

export function HoloPanels({ isListening, isSpeaking, liveText }: HoloPanelsProps) {
  const now = new Date();

  return (
    <>
      {/* ── Left panel: Neural Activity ── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="absolute left-3 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-2 p-3 rounded-xl z-20"
        style={{ ...glassStyle, width: 160 }}
      >
        <p style={labelStyle}>NEURAL ACTIVITY</p>
        <div className="flex flex-col gap-2 mt-1">
          {ACTIVITY_BARS.map((b) => {
            const active = isListening || isSpeaking;
            const displayVal = active ? b.val * (0.9 + Math.random() * 0.1) : b.val * 0.6;
            return (
              <div key={b.label} className="flex flex-col gap-0.5">
                <div className="flex justify-between">
                  <span style={{ ...monoSm, color: "#6b7280" }}>{b.label}</span>
                  <span style={{ ...monoSm, color: "#00e5ff" }}>{Math.round(displayVal * 100)}%</span>
                </div>
                <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(0,229,255,0.1)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #1565c0, #00e5ff)" }}
                    animate={{ width: `${displayVal * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Time */}
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

      {/* ── Right panel: System Status + Insights ── */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-2 p-3 rounded-xl z-20"
        style={{ ...glassStyle, width: 160 }}
      >
        <p style={labelStyle}>SYSTEM STATUS</p>
        <div className="flex flex-col gap-1.5 mt-1">
          {STATUS_LINES.map((s) => (
            <div key={s.key} className="flex justify-between items-center">
              <span style={{ ...monoSm, color: "#374151" }}>{s.key}</span>
              <span style={{ ...monoSm, color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>AI STATE</p>
          <div className="mt-1 flex items-center gap-2">
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: isSpeaking ? "#00e5ff" : isListening ? "#40c4ff" : "#1565c0" }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.9, repeat: Infinity }}
            />
            <span style={{ ...monoSm, color: isSpeaking ? "#00e5ff" : isListening ? "#40c4ff" : "#374151" }}>
              {isSpeaking ? "RESPONDING" : isListening ? "LISTENING" : "STANDBY"}
            </span>
          </div>
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          <p style={labelStyle}>ACTIVE TOOLS</p>
          <div className="mt-1 flex flex-col gap-1">
            {["VOICE STT", "NLU ENGINE", "KNOWLEDGE"].map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full" style={{ background: "#1565c0" }} />
                <span style={{ ...monoSm, color: "#374151" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

    </>
  );
}
