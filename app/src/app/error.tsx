"use client";

import { Button, LinkButton } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <LinkButton href="/" variant="ghost">
            Go home
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
