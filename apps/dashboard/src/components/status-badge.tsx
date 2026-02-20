import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "lg";
}

const statusConfig: Record<string, { label: string; className: string }> = {
  queued: {
    label: "Queued",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  running: {
    label: "Running",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  pass: {
    label: "Pass",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  fail: {
    label: "Fail",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        config.className,
        size === "lg" && "text-sm px-3 py-1"
      )}
    >
      {status === "running" && (
        <span className="mr-1.5 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
      )}
      {config.label}
    </Badge>
  );
}
