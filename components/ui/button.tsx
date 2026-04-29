import type * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

export function Button({ className, variant = "secondary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 border font-medium text-[12px] leading-none outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-cyan-300/60 bg-cyan-300 text-black hover:bg-cyan-200",
        variant === "secondary" && "border-white/10 bg-white/[0.055] text-zinc-100 hover:bg-white/[0.09]",
        variant === "ghost" && "border-transparent bg-transparent text-zinc-300 hover:bg-white/[0.07]",
        variant === "danger" && "border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
        size === "sm" && "h-7 rounded px-2",
        size === "md" && "h-8 rounded px-3",
        size === "icon" && "h-8 w-8 rounded",
        className,
      )}
      {...props}
    />
  );
}
