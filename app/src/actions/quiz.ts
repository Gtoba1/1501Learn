"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { consume, TOO_MANY_ATTEMPTS } from "@/lib/security/rate-limit";

export type QuizResultBreakdown = {
  questionId: string;
  question: string;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  explanation: string | null;
  correct: boolean;
};

export type QuizResult = {
  score: number;
  totalQuestions: number;
  passed: boolean;
  passingScore: number;
  breakdown: QuizResultBreakdown[];
};

export type QuizActionState = { error?: string; result?: QuizResult } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Error codes raised by public.submit_quiz_attempt (0007_security_hardening.sql).
const RPC_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: "You must be signed in.",
  QUIZ_NOT_FOUND: "This quiz could not be found.",
  NOT_ENROLLED: "This quiz could not be found.",
  NO_ATTEMPTS_LEFT: "You've used all your attempts for this quiz.",
  NO_QUESTIONS: "This quiz has no questions yet.",
};

export async function submitQuizAttempt(
  quizId: string,
  _prev: QuizActionState,
  formData: FormData,
): Promise<QuizActionState> {
  if (!UUID.test(quizId)) return { error: "This quiz could not be found." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  if (!consume(`quiz:${user.id}`, 10, 60_000)) return { error: TOO_MANY_ATTEMPTS };

  // Answers arrive as question-<uuid> = <option uuid>. Anything else is dropped;
  // the database checks each option really belongs to its question.
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("question-") || typeof value !== "string") continue;
    const questionId = key.slice("question-".length);
    if (UUID.test(questionId) && UUID.test(value)) answers[questionId] = value;
  }

  // Grading runs inside the database, where learners can't read the answer key
  // or write attempts directly.
  const { data, error } = await supabase.rpc("submit_quiz_attempt", {
    p_quiz_id: quizId,
    p_answers: answers,
  });

  if (error || !data) {
    const known = error && Object.keys(RPC_ERRORS).find((code) => error.message.includes(code));
    if (!known) console.error("submit_quiz_attempt failed:", error?.message);
    return { error: known ? RPC_ERRORS[known] : "Could not save your attempt. Please try again." };
  }

  // Passing a quiz can complete a module, which shows on the course pages too.
  revalidatePath("/dashboard");
  revalidatePath("/courses", "layout");

  return { result: data as unknown as QuizResult };
}
