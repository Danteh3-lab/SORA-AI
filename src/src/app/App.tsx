import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MicOff, Square, Volume2, VolumeX } from "lucide-react";
import { JARVISSphere, type OrbState } from "./components/JARVISSphere";
import { HoloPanels } from "./components/HoloPanels";
import { StarField } from "./components/StarField";
import type { Message } from "./components/ChatMessage";

const RESPONSES: Record<string, string> = {
  default:  "All neural pathways nominal. Awaiting your next directive.",
  hello:    "Online and fully operational. How may I assist you?",
  weather:  "Current conditions: 72°F, clear skies. Wind SW at 8 mph. Atmospheric pressure stable.",
  time:     `The time is ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
  music:    "Audio sequence initiated. Routing ambient playlist to output.",
  news:     "Briefing: Global markets +1.4%. Climate accords ratified. New deep-space imagery released — resolution unprecedented.",
  joke:     "An AI walks into a bar. The bartender says 'We don't serve robots.' The AI says — that's fine, I don't drink. I'm just here to process the ambiance.",
  help:     "Available: weather, time, news briefings, music, calculations, reminders, general queries. What do you need?",
  status:   "All subsystems green. Neural cores at 98%. Quantum memory nominal. I am fully operational.",
};

function getResponse(text: string): string {
  const l = text.toLowerCase();
  if (l.includes("hello") || l.includes("hi") || l.includes("hey")) return RESPONSES.hello;
  if (l.includes("weather") || l.includes("temperature")) return RESPONSES.weather;
  if (l.includes("time") || l.includes("clock")) return RESPONSES.time;
  if (l.includes("music") || l.includes("play")) return RESPONSES.music;
  if (l.includes("news") || l.includes("briefing")) return RESPONSES.news;
  if (l.includes("joke") || l.includes("funny")) return RESPONSES.joke;
  if (l.includes("help") || l.includes("what can")) return RESPONSES.help;
  if (l.includes("status") || l.includes("system") || l.includes("online")) return RESPONSES.status;
  return RESPONSES.default;
}

const DEMO_INPUTS = [
  "System status report",
  "What's the weather today?",
  "Give me a news briefing",
  "What time is it?",
  "Tell me a joke",
];

const QUICK_CMDS = ["STATUS", "WEATHER", "NEWS", "TIME", "MUSIC", "HELP"];
const CMD_MAP: Record<string, string> = {
  STATUS: "System status report", WEATHER: "Weather report",
  NEWS: "News briefing", TIME: "What time is it?",
  MUSIC: "Play music", HELP: "What can you do?",
};

let _id = 0;
const uid = () => `m${++_id}`;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: uid(), role: "assistant", text: "AURA online. Neural cores initialised. All systems nominal. Standing by.", timestamp: new Date() },
  ]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [liveText, setLiveText] = useState("Neural cores online.");
  const [showCmds, setShowCmds] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const addMsg = useCallback((msg: Omit<Message, "id">) => {
    setMessages((p) => [...p, { ...msg, id: uid() }]);
  }, []);

  const simulateResponse = useCallback((userText: string) => {
    const typingId = uid();
    setMessages((p) => [...p, { id: typingId, role: "assistant", text: "", timestamp: new Date(), isTyping: true }]);
    setOrbState("speaking");
    setLiveText("Processing…");

    speakTimer.current = setTimeout(() => {
      const resp = getResponse(userText);
      setLiveText(resp.length > 60 ? resp.slice(0, 60) + "…" : resp);
      setMessages((p) => p.map((m) => m.id === typingId ? { ...m, text: resp, isTyping: false } : m));
      speakTimer.current = setTimeout(() => {
        setOrbState("idle");
        setLiveText("Standing by.");
      }, resp.length * 28 + 600);
    }, 950);
  }, []);

  const startListening = useCallback(() => {
    if (speakTimer.current) clearTimeout(speakTimer.current);
    setOrbState("listening");
    setLiveText("Listening…");

    listenTimer.current = setTimeout(() => {
      const text = DEMO_INPUTS[Math.floor(Math.random() * DEMO_INPUTS.length)];
      setLiveText(text);
      addMsg({ role: "user", text, timestamp: new Date() });
      simulateResponse(text);
    }, 3200);
  }, [addMsg, simulateResponse]);

  const cancelListening = useCallback(() => {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    setOrbState("idle");
    setLiveText("Standing by.");
  }, []);

  const interrupt = useCallback(() => {
    if (speakTimer.current) clearTimeout(speakTimer.current);
    setOrbState("idle");
    setLiveText("Interrupted.");
    setMessages((p) => p.map((m) => m.isTyping ? { ...m, text: "—", isTyping: false } : m));
  }, []);

  const handleOrbClick = useCallback(() => {
    if (orbState === "listening") cancelListening();
    else if (orbState === "speaking") interrupt();
    else startListening();
  }, [orbState, cancelListening, interrupt, startListening]);

  const sendCmd = useCallback((cmd: string) => {
    if (orbState !== "idle") return;
    const text = CMD_MAP[cmd] || cmd;
    addMsg({ role: "user", text, timestamp: new Date() });
    simulateResponse(text);
    setShowCmds(false);
  }, [orbState, addMsg, simulateResponse]);

  const isListening = orbState === "listening";
  const isSpeaking  = orbState === "speaking";

  const statusColor = isSpeaking ? "#00e5ff" : isListening ? "#40c4ff" : "#1565c0";
  const statusText  = isSpeaking ? "RESPONDING" : isListening ? "LISTENING" : "STANDBY";

  return (
    <div
      className="relative flex flex-col h-screen w-full overflow-hidden select-none"
      style={{ background: "#020510", fontFamily: "Inter, sans-serif" }}
    >
      {/* Deep space gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(10,20,60,0.55) 0%, rgba(2,5,16,0.9) 65%, #020510 100%)",
        }}
      />

      {/* Volumetric fog layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(0,50,120,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Star field + network nodes */}
      <StarField mouseX={mousePos.x} mouseY={mousePos.y} />

      {/* ── Header HUD ── */}
      <header
        className="relative z-30 flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(0,229,255,0.07)" }}
      >
        <div className="flex flex-col">
          <span
            className="tracking-[0.25em]"
            style={{ fontFamily: "DM Mono, monospace", color: "#00e5ff", fontSize: 12, opacity: 0.85 }}
          >
            AURA
          </span>
          <span
            style={{ fontFamily: "DM Mono, monospace", color: "#1e3a5f", fontSize: 9, letterSpacing: "0.15em" }}
          >
            ADVANCED UNIFIED REASONING AGENT
          </span>
        </div>

        {/* Center status badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(0,229,255,0.05)",
            border: "1px solid rgba(0,229,255,0.12)",
          }}
        >
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, letterSpacing: "0.15em", color: statusColor }}>
            {statusText}
          </span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMuted((v) => !v)}
            className="cursor-pointer transition-colors"
            style={{ color: isMuted ? "#f43f5e" : "#1e3a5f" }}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div
            className="w-1 h-1 rounded-full"
            style={{ background: "#00e5ff", boxShadow: "0 0 6px #00e5ff" }}
          />
        </div>
      </header>

      {/* ── Central sphere (fills remaining space) ── */}
      <div className="relative z-20 flex-1 min-h-0">
        <JARVISSphere
          state={orbState}
          onClick={handleOrbClick}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
        />

        {/* Floating side panels */}
        <HoloPanels
          isListening={isListening}
          isSpeaking={isSpeaking}
          liveText={liveText}
        />

        {/* Live status text — center overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 mt-52">
            <motion.p
              key={liveText}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-center max-w-[220px] leading-relaxed"
              style={{
                fontFamily: "DM Mono, monospace",
                color: isSpeaking ? "#b3e5fc" : isListening ? "#80d8ff" : "#1e3a5f",
                textShadow: (isSpeaking || isListening) ? `0 0 24px ${statusColor}66` : "none",
                fontSize: 11,
              }}
            >
              {liveText}
            </motion.p>

            {/* Action buttons */}
            <AnimatePresence>
              {isListening && (
                <motion.button
                  key="cancel"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={cancelListening}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer pointer-events-auto"
                  style={{
                    background: "rgba(64,196,255,0.07)",
                    border: "1px solid rgba(64,196,255,0.22)",
                    color: "#40c4ff",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                  }}
                >
                  <MicOff size={10} /> CANCEL
                </motion.button>
              )}
              {isSpeaking && (
                <motion.button
                  key="interrupt"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={interrupt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer pointer-events-auto"
                  style={{
                    background: "rgba(244,63,94,0.07)",
                    border: "1px solid rgba(244,63,94,0.22)",
                    color: "#f43f5e",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                  }}
                >
                  <Square size={9} fill="#f43f5e" /> INTERRUPT
                </motion.button>
              )}
              {orbState === "idle" && (
                <motion.p
                  key="tap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.35 }}
                  exit={{ opacity: 0 }}
                  style={{ fontFamily: "DM Mono, monospace", color: "#29b6f6", fontSize: 9, letterSpacing: "0.2em" }}
                >
                  TAP ORB TO SPEAK
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Conversation log (below sphere, above footer) ── */}
      <div
        className="relative z-30 flex-shrink-0 px-4 pt-3 pb-2 flex flex-col gap-2 max-h-36 overflow-y-auto"
        style={{ borderTop: "1px solid rgba(0,229,255,0.06)", scrollbarWidth: "none" }}
      >
        <AnimatePresence>
          {messages.slice(-4).map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className="px-2.5 py-1.5 rounded-lg max-w-[85%] leading-relaxed"
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: 10,
                  background: msg.role === "user" ? "rgba(255,255,255,0.04)" : "rgba(0,100,180,0.1)",
                  border: msg.role === "user" ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,229,255,0.14)",
                  color: msg.role === "user" ? "#6b7280" : "#b3e5fc",
                }}
              >
                {msg.isTyping ? (
                  <span className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="inline-block w-1 h-1 rounded-full"
                        style={{ background: "#00e5ff" }}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }}
                      />
                    ))}
                  </span>
                ) : msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Footer: Quick commands ── */}
      <footer
        className="relative z-30 flex-shrink-0 px-5 py-3"
        style={{ borderTop: "1px solid rgba(0,229,255,0.06)" }}
      >
        <button
          onClick={() => setShowCmds((v) => !v)}
          className="w-full flex items-center justify-center gap-2 cursor-pointer mb-3"
          style={{
            fontFamily: "DM Mono, monospace",
            color: showCmds ? "#29b6f6" : "#1e3a5f",
            fontSize: 9,
            letterSpacing: "0.18em",
            transition: "color 0.2s",
          }}
        >
          QUICK COMMANDS
        </button>

        <AnimatePresence>
          {showCmds && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 justify-center pb-1">
                {QUICK_CMDS.map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => sendCmd(cmd)}
                    disabled={orbState !== "idle"}
                    className="px-3 py-1.5 rounded cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                    style={{
                      fontFamily: "DM Mono, monospace",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      background: "rgba(0,229,255,0.04)",
                      border: "1px solid rgba(0,229,255,0.1)",
                      color: "#1e3a5f",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget;
                      el.style.borderColor = "rgba(0,229,255,0.4)";
                      el.style.color = "#00e5ff";
                      el.style.background = "rgba(0,229,255,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget;
                      el.style.borderColor = "rgba(0,229,255,0.1)";
                      el.style.color = "#1e3a5f";
                      el.style.background = "rgba(0,229,255,0.04)";
                    }}
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
}
