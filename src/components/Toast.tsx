import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

export function Toast() {
  const toast = useAppStore((s) => s.toast);

  return (
    // Above the tab bar, not across it. `bottom-6` alone lands the toast on
    // top of the mobile nav: it is z-50 to the tab bar's z-30, so it wins the
    // stack and covers the thing the user's thumb is reaching for. Clear the
    // bar's height plus its safe-area padding wherever the bar exists.
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 left-4 rail:bottom-6 rail:right-6 rail:left-auto z-50 pointer-events-none flex justify-end">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto w-full rail:w-auto"
          >
            <div
              className={cn(
                // Full width on a phone, where a 300px floor overflows a 320px screen
                // and gives the page a horizontal scrollbar.
                "flex items-start gap-3 rounded-lg border bg-card/95 backdrop-blur-md p-4 pr-6 shadow-xl w-full rail:w-auto rail:min-w-[300px] max-w-md",
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
