import { motion } from "motion/react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  isTyping?: boolean;
}

interface ChatMessageProps {
  message: Message;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs ${
          isUser
            ? "bg-[#141822] border border-[rgba(0,212,200,0.2)] text-[#9ca3af]"
            : "border border-[rgba(0,212,200,0.35)] bg-[#07090f]"
        }`}
        style={
          !isUser
            ? {
                boxShadow: "0 0 12px rgba(0,212,200,0.25)",
              }
            : {}
        }
      >
        {isUser ? (
          <span style={{ fontFamily: "DM Mono, monospace" }}>U</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="3" fill="#00d4c8" opacity="0.9" />
            <circle cx="8" cy="8" r="6" stroke="#00d4c8" strokeWidth="0.75" opacity="0.35" />
          </svg>
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[72%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-[#141822] text-[#d1d5db] rounded-tr-sm border border-[rgba(255,255,255,0.05)]"
              : "bg-[#0d1017] text-[#e8eaf0] rounded-tl-sm border border-[rgba(0,212,200,0.15)]"
          }`}
          style={
            !isUser
              ? { boxShadow: "0 0 20px rgba(0,212,200,0.06)" }
              : {}
          }
        >
          {message.isTyping ? (
            <span className="flex gap-1 items-center h-4">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="inline-block w-1.5 h-1.5 rounded-full bg-[#00d4c8]"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </span>
          ) : (
            message.text
          )}
        </div>
        <span
          className="text-[10px] text-[#4b5563] px-1"
          style={{ fontFamily: "DM Mono, monospace" }}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}
