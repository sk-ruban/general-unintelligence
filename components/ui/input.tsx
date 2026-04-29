import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded border border-white/10 bg-black/30 px-2 font-mono text-[12px] text-zinc-100 outline-none",
        "placeholder:text-zinc-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20",
        className,
      )}
      {...props}
    />
  );
}
