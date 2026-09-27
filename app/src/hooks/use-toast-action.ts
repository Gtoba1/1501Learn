"use client";

import { useActionState, useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

export type ToastActionState = { error?: string; success?: string } | null;

export function useToastAction(
  action: (prevState: ToastActionState, formData: FormData) => Promise<ToastActionState>,
  initialState: ToastActionState,
) {
  const [state, formAction] = useActionState(action, initialState);
  const { show } = useToast();
  const lastSeen = useRef(state);

  useEffect(() => {
    if (state === lastSeen.current) return;
    lastSeen.current = state;
    if (state?.success) show(state.success, "success");
    else if (state?.error) show(state.error, "error");
  }, [state, show]);

  return [state, formAction] as const;
}
