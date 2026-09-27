// Password policy shared by the browser (live strength meter) and the server
// (the rules that actually decide). Anything the meter shows as passing must
// also pass here, so both sides import from this one file.

export const PASSWORD_MIN_LENGTH = 12;
// Supabase hashes with bcrypt, which silently ignores everything past 72 bytes.
export const PASSWORD_MAX_BYTES = 72;

export type PasswordRuleId =
  | "length"
  | "lower"
  | "upper"
  | "digit"
  | "symbol"
  | "common"
  | "personal"
  | "repeat"
  | "sequence";

export type PasswordRule = { id: PasswordRuleId; label: string; passed: boolean };

export type PasswordStrength = {
  rules: PasswordRule[];
  valid: boolean;
  // 0 empty/too weak, 1 weak, 2 fair, 3 good, 4 strong
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

// Top passwords from public breach corpora. Matched after normalising case,
// common letter substitutions and trailing digits/symbols, so "P@ssw0rd2024!"
// is caught as "password".
const COMMON_PASSWORDS = new Set([
  "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234", "111111",
  "1234567", "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein",
  "shadow", "master", "666666", "qwertyuiop", "123321", "mustang", "1234567890", "michael",
  "654321", "superman", "1qaz2wsx", "7777777", "121212", "000000", "qazwsx", "123qwe",
  "killer", "trustno1", "jordan", "jennifer", "zxcvbnm", "asdfgh", "hunter", "buster",
  "soccer", "harley", "batman", "andrew", "tigger", "sunshine", "iloveyou",
  "charlie", "robert", "thomas", "hockey", "ranger", "daniel", "starwars", "klaster",
  "112233", "george", "computer", "michelle", "jessica", "pepper", "zxcvbn", "555555",
  "11111111", "131313", "freedom", "777777", "pass", "maggie", "159753", "aaaaaa", "ginger",
  "princess", "joshua", "cheese", "amanda", "summer", "love", "ashley", "nicole", "chelsea",
  "biteme", "matthew", "access", "yankees", "987654321", "dallas", "austin", "thunder",
  "taylor", "matrix", "william", "corvette", "hello", "martin", "heather", "secret",
  "merlin", "diamond", "1234qwer", "gfhjkm", "hammer", "silver", "222222", "88888888",
  "anthony", "justin", "test", "bailey", "q1w2e3r4t5", "patrick", "internet", "scooter",
  "orange", "11111", "golfer", "cookie", "richard", "samantha", "bigdog", "guitar",
  "jackson", "whatever", "mickey", "chicken", "sparky", "snoopy", "maverick", "phoenix",
  "camaro", "peanut", "morgan", "welcome", "falcon", "cowboy", "ferrari", "samsung",
  "andrea", "smokey", "steelers", "joseph", "mercedes", "dakota", "arsenal", "eagles",
  "melissa", "boomer", "booboo", "spider", "nascar", "monster", "tigers", "yellow",
  "xxxxxx", "123123123", "gateway", "marina", "diablo", "bulldog", "qwer1234", "compaq",
  "purple", "hardcore", "banana", "junior", "hannah", "123654", "porsche", "lakers",
  "iceman", "money", "cowboys", "987654", "london", "tennis", "999999", "ncc1701",
  "coffee", "scooby", "0000", "miller", "boston", "q1w2e3r4", "brandon", "yamaha",
  "chester", "mother", "forever", "johnny", "edward", "333333", "oliver", "redsox",
  "player", "nikita", "knight", "fender", "barney", "midnight", "please", "brandy",
  "chicago", "badboy", "slayer", "rangers", "charles", "angel", "flower", "bigdaddy",
  "rabbit", "wizard", "jasper", "enter", "rachel", "chris", "steven", "winner", "adidas",
  "victoria", "natasha", "1q2w3e4r", "jasmine", "winter", "prince", "marine",
  "ghbdtn", "fishing", "cocacola", "casper", "james", "232323", "raiders", "888888",
  "marlboro", "gandalf", "asdfasdf", "crystal", "87654321", "12344321", "golden",
  "8675309", "admin", "administrator", "root", "changeme", "default", "guest", "login",
  "passw0rd", "password1", "welcome1", "qwerty123", "iloveyou1", "abcd1234", "aa123456",
  "football1", "baseball1", "letmein1", "monkey1", "dragon1", "master1", "superman1",
  "sunshine1", "princess1", "shadow1", "charlie1", "azerty", "abcdef", "abcdefg",
  "abcdefgh", "qwertyui", "asdfghjkl", "zaq12wsx", "1qazxsw2", "lovely", "loveme",
  "trustme", "blessed", "blessing", "jesus", "god", "faith", "nigeria", "lagos", "abuja",
  "naija", "africa", "shoplink", "bootcamp", "upskill", "learn", "student", "school",
  "course", "data", "analytics", "engineer", "engineering", "database", "python", "sql",
  "supabase", "letmein123", "password123", "admin123", "welcome123", "p4ssword",
]);

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "i", "+": "t",
};

function normaliseForDictionary(password: string): string[] {
  const lower = password.toLowerCase();
  const stripped = lower.replace(/[^a-z]+$/, "").replace(/^[^a-z]+/, "");
  const unleet = lower.replace(/[013457895@$!|+]/g, (c) => LEET[c] ?? c);
  const unleetStripped = stripped.replace(/[013457895@$!|+]/g, (c) => LEET[c] ?? c);
  return [lower, stripped, unleet, unleetStripped].filter((v) => v.length > 0);
}

export function isCommonPassword(password: string): boolean {
  return normaliseForDictionary(password).some((candidate) => COMMON_PASSWORDS.has(candidate));
}

// Three or more of the same character in a row: "aaa", "111", "!!!".
export function hasRepeatedCharacters(password: string): boolean {
  return /(.)\1\1/u.test(password);
}

const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
];
const SEQUENCE_RUN = 4;

// Four or more consecutive characters from the alphabet, digits or a keyboard
// row, forwards or backwards: "abcd", "4321", "qwer", "lkjh".
export function hasSequentialCharacters(password: string): boolean {
  const lower = password.toLowerCase();
  for (let i = 0; i <= lower.length - SEQUENCE_RUN; i++) {
    const chunk = lower.slice(i, i + SEQUENCE_RUN);
    const reversed = [...chunk].reverse().join("");
    if (SEQUENCES.some((seq) => seq.includes(chunk) || seq.includes(reversed))) return true;
  }
  return false;
}

function containsPersonalInfo(password: string, context: PasswordContext): boolean {
  const lower = password.toLowerCase();
  const tokens = [
    context.email?.split("@")[0],
    ...(context.fullName?.split(/\s+/) ?? []),
  ]
    .map((t) => t?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "")
    .filter((t) => t.length >= 4);
  return tokens.some((t) => lower.includes(t));
}

export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export type PasswordContext = { email?: string; fullName?: string };

export function evaluatePassword(password: string, context: PasswordContext = {}): PasswordStrength {
  const rules: PasswordRule[] = [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      passed:
        password.length >= PASSWORD_MIN_LENGTH && passwordByteLength(password) <= PASSWORD_MAX_BYTES,
    },
    { id: "lower", label: "A lowercase letter", passed: /\p{Ll}/u.test(password) },
    { id: "upper", label: "An uppercase letter", passed: /\p{Lu}/u.test(password) },
    { id: "digit", label: "A number", passed: /\p{Nd}/u.test(password) },
    { id: "symbol", label: "A symbol, like ! ? # or %", passed: /[^\p{L}\p{Nd}\s]/u.test(password) },
    { id: "common", label: "Not a common password", passed: password.length > 0 && !isCommonPassword(password) },
    {
      id: "personal",
      label: "Doesn't contain your name or email",
      passed: password.length > 0 && !containsPersonalInfo(password, context),
    },
    {
      id: "repeat",
      label: "No character repeated 3 times in a row",
      passed: password.length > 0 && !hasRepeatedCharacters(password),
    },
    {
      id: "sequence",
      label: "No runs like abcd, 1234 or qwer",
      passed: password.length > 0 && !hasSequentialCharacters(password),
    },
  ];

  const valid = rules.every((r) => r.passed);
  const passedCount = rules.filter((r) => r.passed).length;
  // Too short or on the common list is weak no matter what else it gets right.
  const fatal = rules.some((r) => (r.id === "length" || r.id === "common") && !r.passed);

  let score: PasswordStrength["score"];
  if (password.length === 0) score = 0;
  else if (valid) {
    const unique = new Set(password).size;
    score = password.length >= 16 && unique >= 10 ? 4 : 3;
  } else if (!fatal && passedCount >= rules.length - 2) score = 2;
  else if (password.length >= 6) score = 1;
  else score = 0;

  const label = ["Too weak", "Weak", "Fair", "Good", "Strong"][score];
  return { rules, valid, score, label };
}

// First failing rule, phrased as an instruction, for server-side error messages.
export function firstPasswordProblem(password: string, context: PasswordContext = {}): string | null {
  if (passwordByteLength(password) > PASSWORD_MAX_BYTES) {
    return "Password is too long. Keep it under 72 characters.";
  }
  const failed = evaluatePassword(password, context).rules.find((r) => !r.passed);
  if (!failed) return null;
  const messages: Record<PasswordRuleId, string> = {
    length: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    lower: "Password needs at least one lowercase letter.",
    upper: "Password needs at least one uppercase letter.",
    digit: "Password needs at least one number.",
    symbol: "Password needs at least one symbol.",
    common: "That password is too common. Choose something less predictable.",
    personal: "Password can't contain your name or email.",
    repeat: "Password can't repeat the same character 3 times in a row.",
    sequence: "Password can't contain runs like abcd, 1234 or qwer.",
  };
  return messages[failed.id];
}

// Have I Been Pwned range API with k-anonymity: only the first 5 hex chars of
// the SHA-1 hash leave the machine, never the password or its full hash.
// Returns the breach count, or null if the service could not be reached.
export async function pwnedPasswordCount(
  password: string,
  sha1Hex: (input: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const hash = (await sha1Hex(password)).toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [candidate, count] = line.trim().split(":");
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}
