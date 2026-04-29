import type React from "react";
import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
}: PropsWithChildren<{
  className?: string;
}>) {
  return <section className={cn("border border-white/10 bg-zinc-950/68", className)}>{children}</section>;
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
    <div className="flex min-h-9 items-center justify-between border-white/10 border-b px-3">
      <div className="min-w-0">
        <div className="truncate font-semibold text-[12px] text-zinc-100 uppercase tracking-normal">
          {title}
        </div>
        {kicker ? <div className="truncate text-[10px] text-zinc-500">{kicker}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
