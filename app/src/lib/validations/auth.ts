import { z } from "zod";
import { firstPasswordProblem } from "@/lib/security/password";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Enter a valid email address")
  .email("Enter a valid email address");

const fullName = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(100, "Name must be 100 characters or fewer")
  .regex(/^[^<>\u0000-\u001f]+$/u, "Name contains characters that aren't allowed");

export const signUpSchema = z
  .object({
    fullName,
    email,
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const problem = firstPasswordProblem(data.password, {
      email: data.email,
      fullName: data.fullName,
    });
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
    else if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords don't match." });
    }
  });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(256, "Incorrect email or password."),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const problem = firstPasswordProblem(data.password);
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
    else if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords don't match." });
    }
  });

export const fullNameSchema = fullName;
