import dotenv from "dotenv";
import path from "node:path";

// Load .env from the current working directory first (server/.env, if
// present), then fall back to the repo root .env for any vars not already
// set — dotenv never overwrites a variable that's already in process.env,
// so in the common case of a single root-level .env this just works no
// matter which directory the process was started from.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

// Centralized env access with placeholder-detection helpers. Nothing here
// hardcodes a secret — every value is read from process.env, with the
// .env.example placeholders treated as "not configured".

const PLACEHOLDER_MARKERS = ["YOUR_", "changeme", "placeholder"];

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return PLACEHOLDER_MARKERS.some((marker) =>
    value.toUpperCase().includes(marker.toUpperCase())
  );
}

export const env = {
  port: Number(process.env.PORT ?? 4000),

  databaseUrl: process.env.DATABASE_URL ?? "",
  isDatabaseConfigured: !isPlaceholder(process.env.DATABASE_URL),

  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  isGeminiConfigured: !isPlaceholder(process.env.GEMINI_API_KEY),

  jwtSecret: isPlaceholder(process.env.JWT_SECRET)
    ? "dev-only-insecure-secret-do-not-use-in-production"
    : (process.env.JWT_SECRET as string),
  isJwtSecretConfigured: !isPlaceholder(process.env.JWT_SECRET),
};
