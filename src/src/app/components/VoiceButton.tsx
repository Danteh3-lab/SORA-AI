import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Square } from "lucide-react";

interface VoiceButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  onToggle: () => void;
  onStop: () => void;
}

export function VoiceButton({ isListening, isSpeaking, onToggle, onStop }: VoiceButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Main mic button */}
      <div className="relative">
        {/* Pulse rings when listening */}
        <AnimatePresence>
          {isListening && (
            <>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border border-[#00d4c8]"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.8 + i * 0.5, opacity: 0 }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    delay: i * 0.5,
                    ease: "easeOut",
                  }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        <motion.button
          onClick={onToggle}
          whileTap={{ scale: 0.93 }}
          className="relative w-20 h-20 rounded-full flex items-center justify-center cursor-pointer"
          style={{
            background: isListening
              ? "radial-gradient(circle, rgba(0,212,200,0.2) 0%, rgba(0,212,200,0.05) 100%)"
              : "rgba(13,16,23,0.9)",
            border: isListening
              ? "1.5px solid rgba(0,212,200,0.7)"
              : "1.5px solid rgba(0,212,200,0.2)",
            boxShadow: isListening
              ? "0 0 30px rgba(0,212,200,0.3), inset 0 0 20px rgba(0,212,200,0.08)"
              : "0 0 0px rgba(0,212,200,0)",
            transition: "all 0.3s ease",
          }}
        >
          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.div
                key="listening"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Mic size={28} color="#00d4c8" />
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <MicOff size={28} color="#4b5563" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Stop button when AI speaking */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={onStop}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs cursor-pointer"
            style={{
              background: "rgba(244,63,94,0.1)",
              border: "1px solid rgba(244,63,94,0.3)",
              color: "#f43f5e",
              fontFamily: "DM Mono, monospace",
            }}
          >
            <Square size={10} fill="#f43f5e" />
            stop
          </motion.button>
        )}
      </AnimatePresence>

      <p
        className="text-xs"
        style={{
          fontFamily: "DM Mono, monospace",
          color: isListening ? "#00d4c8" : "#4b5563",
          transition: "color 0.3s",
        }}
      >
        {isListening ? "listening..." : isSpeaking ? "speaking..." : "tap to speak"}
      </p>
    </div>
  );
}
