import "server-only";
import { createHash } from "node:crypto";
import { pwnedPasswordCount } from "@/lib/security/password";

// Server-side breach check. Fails open (returns false) if the service is down,
// so an outage at Have I Been Pwned never blocks signups.
export async function isPasswordPwned(password: string): Promise<boolean> {
  const count = await pwnedPasswordCount(
    password,
    async (input) => createHash("sha1").update(input, "utf8").digest("hex"),
    AbortSignal.timeout(3000),
  );
  return (count ?? 0) > 0;
}
