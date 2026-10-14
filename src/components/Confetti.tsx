/**
 * The celebration a result screen earns.
 *
 * Shared by Flashcards and Games, so "a personal best" looks the same
 * wherever it is earned. Callers decide whether to render it at all — under
 * `reduceMotion` they should not.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ConfettiVariant = "confetti" | "emoji" | "streamers";

const EMOJI = ["🎉", "✨", "🧠", "📚", "🏆", "💫"];

export function Confetti({ variant = "confetti" }: { variant?: ConfettiVariant }) {
  const count = variant === "streamers" ? 24 : 40;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * (variant === "streamers" ? 320 : 500),
        y: -Math.random() * 200 - 100,
        rot: Math.random() * 720 - 360,
        scale: 0.6 + Math.random() * 0.8,
        color: [
          "hsl(var(--accent))",
          "hsl(var(--success))",
          "hsl(var(--warning))",
          "hsl(var(--primary))",
        ][i % 4]!,
        emoji: EMOJI[i % EMOJI.length]!,
        delay: Math.random() * 0.15,
      })),
    // Variant decides the shape of the burst, so it has to re-roll with it.
    [count, variant],
  );
  return (
    <div className="absolute inset-x-0 top-0 h-0 pointer-events-none z-40">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: p.x,
            y: p.y + 500,
            rotate: p.rot,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 1.6,
            delay: p.delay,
            ease: [0.16, 1, 0.3, 1],
          }}
          className={cn(
            "absolute left-1/2 top-8 origin-center",
            variant === "emoji" && "text-2xl leading-none",
            variant === "streamers" && "w-1 h-10 rounded-full",
            variant === "confetti" && "w-2 h-3 rounded-sm",
          )}
          style={{
            backgroundColor: variant === "emoji" ? undefined : p.color,
            scale: p.scale,
          }}
        >
          {variant === "emoji" ? p.emoji : null}
        </motion.div>
      ))}
    </div>
  );
}
