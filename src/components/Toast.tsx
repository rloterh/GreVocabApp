import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

export function Toast() {
  const toast = useAppStore((s) => s.toast);

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto"
          >
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-card/95 backdrop-blur-md p-4 pr-6 shadow-xl min-w-[300px] max-w-md",
                toast.variant === "success" && "border-success/40",
                toast.variant === "error" && "border-destructive/40",
              )}
            >
              <div className="mt-0.5">
                {toast.variant === "success" && (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                )}
                {toast.variant === "error" && (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
                {!toast.variant || toast.variant === "default" ? (
                  <Info className="w-5 h-5 text-muted-foreground" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {toast.description}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
