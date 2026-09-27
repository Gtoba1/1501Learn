"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Field } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { evaluatePassword, pwnedPasswordCount, type PasswordContext } from "@/lib/security/password";
import { cn } from "@/lib/utils";

type BreachResult = { password: string; count: number | null };

const SEGMENT_TONE = ["bg-line", "bg-warn", "bg-gold", "bg-brand", "bg-done"] as const;
const LABEL_TONE = ["text-muted", "text-warn", "text-gold", "text-brand", "text-done"] as const;

const noopSubscribe = () => () => {};

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Password + confirmation with a live strength meter, rule checklist and a
// breach lookup. The server re-runs every one of these checks; this is here so
// people find out before they submit, not instead of the server deciding.
export function NewPasswordFields({
  label = "Password",
  context,
  onValidityChange,
}: {
  label?: string;
  context?: PasswordContext;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [breach, setBreach] = useState<BreachResult | null>(null);

  const strength = useMemo(
    () => evaluatePassword(password, context),
    [password, context],
  );
  // crypto.subtle only exists on secure origins (https or localhost). Read it
  // through useSyncExternalStore so server and first client render agree.
  const canCheckBreach = useSyncExternalStore(
    noopSubscribe,
    () => !!window.crypto?.subtle,
    () => false,
  );

  useEffect(() => {
    if (!strength.valid || !canCheckBreach) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const count = await pwnedPasswordCount(password, sha1Hex, controller.signal);
      if (!controller.signal.aborted) setBreach({ password, count });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [password, strength.valid, canCheckBreach]);

  const breachChecked = breach?.password === password;
  const breached = breachChecked && (breach?.count ?? 0) > 0;
  const matches = confirm.length > 0 && confirm === password;
  const valid = strength.valid && !breached && matches;

  // A breached password drops to "Too weak" regardless of how it looks.
  const score = breached ? 0 : strength.score;
  const scoreLabel = breached ? "Compromised" : strength.label;

  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  return (
    <>
      <Field label={label} htmlFor="password">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-strength password-rules"
        />
        <div id="password-strength" className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((segment) => (
              <span
                key={segment}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  score >= segment ? SEGMENT_TONE[score] : "bg-line",
                )}
              />
            ))}
          </div>
          {password.length > 0 && (
            <p className={cn("mt-1.5 text-xs font-semibold", LABEL_TONE[score])}>
              Strength: {scoreLabel}
            </p>
          )}
        </div>
        <ul id="password-rules" className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {strength.rules.map((rule) => (
            <RuleItem key={rule.id} passed={rule.passed} pending={password.length === 0}>
              {rule.label}
            </RuleItem>
          ))}
          <RuleItem
            passed={breachChecked && !breached}
            pending={!strength.valid || (canCheckBreach && !breachChecked)}
            className="sm:col-span-2"
          >
            {!canCheckBreach
              ? "Checked against known data breaches when you submit"
              : breached
                ? `Found in ${breach?.count?.toLocaleString()} data breaches`
                : breachChecked && breach?.count === null
                  ? "Breach check unavailable; it runs again when you submit"
                  : breachChecked
                    ? "Not found in known data breaches"
                    : strength.valid
                      ? "Checking known data breaches…"
                      : "Not found in known data breaches"}
          </RuleItem>
        </ul>
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirmPassword"
        error={confirm.length > 0 && !matches ? "Passwords don't match." : undefined}
      >
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {matches && <p className="mt-1.5 text-xs text-done">Passwords match.</p>}
      </Field>
    </>
  );
}

function RuleItem({
  passed,
  pending,
  className,
  children,
}: {
  passed: boolean;
  pending: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const state = pending ? "pending" : passed ? "passed" : "failed";
  return (
    <li
      className={cn(
        "flex items-start gap-1.5",
        state === "passed" && "text-done",
        state === "failed" && "text-warn",
        state === "pending" && "text-muted",
        className,
      )}
    >
      <span aria-hidden className="w-3 shrink-0 text-center font-bold">
        {state === "passed" ? "✓" : state === "failed" ? "✗" : "•"}
      </span>
      <span>
        <span className="sr-only">{state === "passed" ? "Met: " : "Not met: "}</span>
        {children}
      </span>
    </li>
  );
}
