"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileEdit,
  Info,
  Lock,
  RotateCcw,
  Send,
  ThumbsUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { tDynamic } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger" | "locked";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info/10 text-info ring-info/25",
  progress: "bg-primary/10 text-primary ring-primary/25",
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/15 text-warning-foreground ring-warning/40 dark:text-warning",
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  locked: "bg-success/10 text-success ring-success/25",
};

const STATUS_MAP: Record<string, { tone: Tone; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: FileEdit },
  PREPARATION: { tone: "info", icon: FileEdit },
  SUBMITTED: { tone: "info", icon: Send },
  UNDER_REVIEW: { tone: "progress", icon: Clock },
  REVIEW: { tone: "progress", icon: Clock },
  RECOMMENDED: { tone: "progress", icon: ThumbsUp },
  ENDORSED: { tone: "progress", icon: ThumbsUp },
  RETURNED: { tone: "warning", icon: RotateCcw },
  APPROVED: { tone: "success", icon: CheckCircle2 },
  PUBLISHED: { tone: "success", icon: Lock },
  ACTIVE: { tone: "success", icon: CircleDot },
  CLOSED: { tone: "neutral", icon: Lock },
  REJECTED: { tone: "danger", icon: XCircle },
  PASS: { tone: "success", icon: CheckCircle2 },
  VALID: { tone: "success", icon: CheckCircle2 },
  WARNING: { tone: "warning", icon: AlertTriangle },
  ERROR: { tone: "danger", icon: XCircle },
  INFO: { tone: "info", icon: Info },
  DUPLICATE: { tone: "warning", icon: CircleDashed },
  SKIPPED: { tone: "neutral", icon: CircleDashed },
  IMPORTED: { tone: "success", icon: CheckCircle2 },
  COMPLETED: { tone: "success", icon: CheckCircle2 },
  FAILED: { tone: "danger", icon: XCircle },
  PROPOSED: { tone: "info", icon: FileEdit },
  SUSPENDED: { tone: "warning", icon: AlertTriangle },
  CANCELLED: { tone: "danger", icon: Ban },
  COMMITTED: { tone: "info", icon: CircleDot },
  OBLIGATED: { tone: "progress", icon: FileEdit },
  LIQUIDATED: { tone: "success", icon: CheckCircle2 },
  OPEN: { tone: "warning", icon: AlertTriangle },
  REOPENED: { tone: "warning", icon: RotateCcw },
  RESOLVED: { tone: "progress", icon: CheckCircle2 },
  ACCEPTED: { tone: "success", icon: CheckCircle2 },
  UPLOADED: { tone: "neutral", icon: CircleDashed },
  MAPPED: { tone: "info", icon: CircleDot },
  VALIDATED: { tone: "progress", icon: CheckCircle2 },
  IMPORTING: { tone: "progress", icon: Clock },
};

/** Status indicator: colour + icon + text (colour is never the only signal). */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const { t } = useT();
  const cfg = STATUS_MAP[status] ?? { tone: "neutral" as Tone, icon: CircleDot };
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONE_CLASSES[cfg.tone], className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label ?? tDynamic(t, "status", status)}
    </span>
  );
}
