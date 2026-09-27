import { cn } from "@/lib/utils";

type Tone = "neutral" | "done" | "warn" | "wait";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink/8 text-ink",
  done: "bg-done/15 text-done",
  warn: "bg-warn/15 text-warn",
  wait: "bg-gold/20 text-gold",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
