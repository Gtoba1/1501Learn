import "server-only";
import { headers } from "next/headers";

// Fixed-window limiter held in process memory. It stops scripted brute force
// against a single server instance; Supabase Auth's own rate limits remain the
// backstop across instances. Swap for Redis/Upstash if the app scales out.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

// Returns true when the call is allowed, false once `limit` is exceeded within
// `windowMs` for this key.
export function consume(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export const TOO_MANY_ATTEMPTS = "Too many attempts. Wait a few minutes and try again.";
