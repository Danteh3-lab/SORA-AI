import { useEffect, useRef } from "react";
import { motion } from "motion/react";

interface VoiceVisualizerProps {
  isListening: boolean;
  isSpeaking: boolean;
}

export function VoiceVisualizer({ isListening, isSpeaking }: VoiceVisualizerProps) {
  const active = isListening || isSpeaking;
  const barCount = 32;

  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {Array.from({ length: barCount }).map((_, i) => {
        const center = barCount / 2;
        const distFromCenter = Math.abs(i - center) / center;
        const maxHeight = active ? (1 - distFromCenter * 0.5) * 48 + 4 : 4;
        const delay = (i % 4) * 0.07;

        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: 3,
              background: isSpeaking
                ? `oklch(0.75 0.18 ${180 + distFromCenter * 40})`
                : isListening
                ? `oklch(0.72 0.2 ${195 + distFromCenter * 30})`
                : "#1e2535",
            }}
            animate={{
              height: active
                ? [
                    maxHeight * 0.3,
                    maxHeight * (0.6 + Math.random() * 0.4),
                    maxHeight * 0.3,
                  ]
                : 4,
              opacity: active ? 1 : 0.3,
            }}
            transition={
              active
                ? {
                    duration: 0.5 + Math.random() * 0.3,
                    repeat: Infinity,
                    delay,
                    ease: "easeInOut",
                  }
                : { duration: 0.4 }
            }
          />
        );
      })}
    </div>
  );
}
