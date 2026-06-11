import { motion, AnimatePresence } from "motion/react";
import type { Message } from "./ChatMessage";

interface HoloTranscriptProps {
  messages: Message[];
  visible: boolean;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HoloTranscript({ messages, visible }: HoloTranscriptProps) {
  const recent = messages.slice(-4);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-2 w-full max-w-xs"
        >
          {recent.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: isUser ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className="px-3 py-2 rounded-lg text-xs leading-relaxed max-w-[90%]"
                  style={{
                    background: isUser
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,188,212,0.06)",
                    border: isUser
                      ? "1px solid rgba(255,255,255,0.07)"
                      : "1px solid rgba(0,188,212,0.18)",
                    color: isUser ? "#9ca3af" : "#e8eaf0",
                    fontFamily: msg.isTyping ? undefined : "inherit",
                  }}
                >
                  {msg.isTyping ? (
                    <span className="flex gap-1 items-center h-4">
                      {[0, 1, 2].map((j) => (
                        <motion.span
                          key={j}
                          className="inline-block w-1 h-1 rounded-full"
                          style={{ background: "#00bcd4" }}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: j * 0.2 }}
                        />
                      ))}
                    </span>
                  ) : (
                    msg.text
                  )}
                </div>
                <span
                  className="text-[9px] mt-0.5 px-1"
                  style={{ fontFamily: "DM Mono, monospace", color: "#374151" }}
                >
                  {isUser ? "YOU" : "AURA"} · {formatTime(msg.timestamp)}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
