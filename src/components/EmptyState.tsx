import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-dashed border-border bg-grid",
        className,
      )}
    >
      <div className="w-12 h-12 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center mb-4">
        <Icon className="w-5 h-5" />
      </div>
      {/* h2: an empty state sits directly under the page heading. */}
      <h2 className="text-base font-semibold mb-1.5">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm text-balance">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
