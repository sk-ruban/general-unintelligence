import type React from "react";
import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
}: PropsWithChildren<{
  className?: string;
}>) {
  return (
    <section className={cn("flex flex-col rounded border border-white/10 bg-[var(--bg-panel)]", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  kicker,
  right,
}: {
  title: string;
  kicker?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-white/10 border-b px-3 py-1.5">
      <div className="min-w-0">
        <div className="mono truncate font-medium text-[11px] text-zinc-500 uppercase tracking-[0.05em]">
          {title}
        </div>
        {kicker ? <div className="truncate text-[10px] text-zinc-500">{kicker}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
