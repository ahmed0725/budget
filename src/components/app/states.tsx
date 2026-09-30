import { AlertCircle, Inbox, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, message, details, action, className }: { title: string; message: string; details?: string[]; action?: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("rounded-lg border border-destructive/30 bg-destructive/5 p-4", className)}>
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-destructive">{title}</p>
          <p className="text-sm">{message}</p>
          {details?.length ? (
            <ul className="list-inside space-y-0.5 text-sm text-muted-foreground">
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : null}
          {action ? <div className="pt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground", className)} role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
