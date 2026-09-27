"use client";

import { useTransition } from "react";
import { updateTheme } from "@/actions/profile";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];

export function ThemeToggle({ current }: { current: "light" | "dark" }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={current === option.value ? "primary" : "ghost"}
          disabled={isPending}
          onClick={() => startTransition(() => updateTheme(option.value))}
          className="w-auto"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
