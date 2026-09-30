import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Signed change shown under the value, e.g. "+12.4% vs 2026". */
  delta?: { text: string; direction: "up" | "down" | "flat"; good?: boolean };
  icon?: LucideIcon;
  href?: string;
  className?: string;
  children?: React.ReactNode;
}

/** Metric tile (label · value · optional delta). Clickable tiles drill down to details. */
export function StatCard({ label, value, hint, delta, icon: Icon, href, className, children }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {delta ? (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs font-medium",
            delta.good === undefined ? "text-muted-foreground" : delta.good ? "text-success" : "text-destructive",
          )}
        >
          {delta.direction === "up" ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta.direction === "down" ? <ArrowDownRight className="size-3.5" aria-hidden /> : <ArrowRight className="size-3.5" aria-hidden />}
          {delta.text}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </>
  );
  const classes = cn("block rounded-lg border bg-card p-4 text-card-foreground", href && "transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-ring", className);
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}
