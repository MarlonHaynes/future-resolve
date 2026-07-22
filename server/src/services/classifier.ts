import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../env.js";
import { CATEGORIES, PRIORITIES } from "./categories.js";
import { ClassificationResult, KbArticle, Priority } from "../types.js";

// ============================================================================
// Ticket classification: given a subject + body, return
// { category, priority, suggested_kb_article_id, reasoning }.
//
// Two implementations:
//   - classifyWithGemini(): the REAL Gemini 2.5 Flash call (only reachable
//     when GEMINI_API_KEY is configured and the caller opts into a live call)
//   - classifyWithMockRules(): a deterministic keyword-based classifier used
//     for (a) all seeded demo data, and (b) every ticket creation by default,
//     so the app is fully functional with zero API calls and zero rate-limit
//     risk. Reasoning strings are still generated so the UI is never a black
//     box even in mock mode.
//
// classifyTicket() is the single entry point routes should call. It decides
// which implementation to use and always falls back to the mock on any
// Gemini error (missing key, network failure, bad JSON, etc.) so the app
// never breaks because of the AI provider.
// ============================================================================

const KEYWORD_RULES: { category: (typeof CATEGORIES)[number]; keywords: string[] }[] = [
  {
    category: "Billing",
    keywords: ["invoice", "charge", "refund", "billing", "payment", "subscription", "price", "credit card"],
  },
  {
    category: "Technical Issue",
    keywords: ["error", "crash", "not working", "broken", "bug", "500", "timeout", "fails", "failing"],
  },
  {
    category: "Bug Report",
    keywords: ["reproduce", "stack trace", "exception", "regression", "unexpected behavior"],
  },
  {
    category: "Account Access",
    keywords: ["login", "log in", "password", "locked out", "2fa", "reset my", "can't access", "cannot access", "mfa"],
  },
  {
    category: "Shipping & Delivery",
    keywords: ["shipment", "delivery", "tracking", "package", "shipped", "courier", "arrived damaged"],
  },
  {
    category: "Feature Request",
    keywords: ["would be great", "feature request", "please add", "suggestion", "it would help if"],
  },
];

const URGENT_KEYWORDS = ["urgent", "asap", "immediately", "production is down", "critical", "emergency", "all users affected"];
const HIGH_KEYWORDS = ["down", "cannot login", "can't login", "data loss", "security", "breach", "blocked"];
const LOW_KEYWORDS = ["whenever you can", "no rush", "just curious", "small suggestion", "minor"];

function pickKbArticle(category: string, kbArticles: KbArticle[]): string | null {
  const match = kbArticles.find((a) => a.category === category);
  return match?.id ?? null;
}

/**
 * Deterministic, offline classifier. No network calls. Used for seed data
 * and as the default/fallback path so the app works without an API key.
 */
export function classifyWithMockRules(
  subject: string,
  body: string,
  kbArticles: KbArticle[]
): ClassificationResult {
  const text = `${subject} ${body}`.toLowerCase();

  let bestCategory: (typeof CATEGORIES)[number] = "General Inquiry";
  let bestScore = 0;
  const matchedKeywordsByCategory: string[] = [];

  for (const rule of KEYWORD_RULES) {
    const hits = rule.keywords.filter((kw) => text.includes(kw));
    if (hits.length > bestScore) {
      bestScore = hits.length;
      bestCategory = rule.category;
      matchedKeywordsByCategory.length = 0;
      matchedKeywordsByCategory.push(...hits);
    }
  }

  let priority: Priority = "med";
  let priorityReason = "no strong urgency signal detected, defaulted to medium";
  if (URGENT_KEYWORDS.some((kw) => text.includes(kw))) {
    priority = "urgent";
    priorityReason = `matched urgent-signal keyword(s): ${URGENT_KEYWORDS.filter((kw) => text.includes(kw)).join(", ")}`;
  } else if (HIGH_KEYWORDS.some((kw) => text.includes(kw))) {
    priority = "high";
    priorityReason = `matched high-severity keyword(s): ${HIGH_KEYWORDS.filter((kw) => text.includes(kw)).join(", ")}`;
  } else if (LOW_KEYWORDS.some((kw) => text.includes(kw))) {
    priority = "low";
    priorityReason = `matched low-urgency keyword(s): ${LOW_KEYWORDS.filter((kw) => text.includes(kw)).join(", ")}`;
  }

  const reasoning =
    bestScore > 0
      ? `Classified as "${bestCategory}" because the text contains keyword(s): ${matchedKeywordsByCategory.join(", ")}. Priority set to "${priority}": ${priorityReason}. (mock rule-based classifier — no live AI call)`
      : `No category keywords matched; defaulted to "General Inquiry". Priority set to "${priority}": ${priorityReason}. (mock rule-based classifier — no live AI call)`;

  return {
    category: bestCategory,
    priority,
    suggested_kb_article_id: pickKbArticle(bestCategory, kbArticles),
    reasoning,
    source: "mock",
  };
}

/**
 * ============================================================================
 * THE REAL GEMINI CALL — this is the only place in the codebase that talks
 * to Google's API. Called only when GEMINI_API_KEY is configured AND the
 * caller explicitly requested a live classification (see routes/tickets.ts,
 * the "Try live classification" button).
 * ============================================================================
 */
async function classifyWithGemini(
  subject: string,
  body: string,
  kbArticles: KbArticle[]
): Promise<ClassificationResult> {
  const genAI = new GoogleGenerativeAI(env.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const kbList = kbArticles.map((a) => `- ${a.id}: ${a.title} (category: ${a.category})`).join("\n");

  const prompt = `You are a support ticket triage assistant. Classify the following ticket.

Subject: ${subject}
Body: ${body}

Choose exactly one category from this list: ${CATEGORIES.join(", ")}
Choose exactly one priority from this list: ${PRIORITIES.join(", ")}

Available knowledge base articles (pick the single best match if any is clearly relevant, otherwise null):
${kbList || "(none available)"}

Respond ONLY with minified JSON in this exact shape, no markdown fences, no extra text:
{"category": "<one of the categories>", "priority": "<one of the priorities>", "suggested_kb_article_id": "<uuid or null>", "reasoning": "<one or two sentences explaining the classification>"}`;

  const result = await model.generateContent(prompt);
  const rawText = result.response.text().trim();

  // Strip markdown code fences if the model added them despite instructions.
  const jsonText = rawText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(jsonText);

  if (!CATEGORIES.includes(parsed.category)) {
    throw new Error(`Gemini returned an unrecognized category: ${parsed.category}`);
  }
  if (!PRIORITIES.includes(parsed.priority)) {
    throw new Error(`Gemini returned an unrecognized priority: ${parsed.priority}`);
  }

  return {
    category: parsed.category,
    priority: parsed.priority,
    suggested_kb_article_id:
      typeof parsed.suggested_kb_article_id === "string" ? parsed.suggested_kb_article_id : null,
    reasoning: `${parsed.reasoning} (live Gemini 2.5 Flash classification)`,
    source: "gemini",
  };
}

/**
 * Entry point used by routes. `preferLive` requests a real Gemini call; it
 * is honored only if GEMINI_API_KEY is actually configured, and any failure
 * transparently falls back to the mock classifier rather than erroring the
 * whole ticket-creation request.
 */
export async function classifyTicket(
  subject: string,
  body: string,
  kbArticles: KbArticle[],
  preferLive = false
): Promise<ClassificationResult> {
  if (preferLive && env.isGeminiConfigured) {
    try {
      return await classifyWithGemini(subject, body, kbArticles);
    } catch (err) {
      console.error("[classifier] Gemini call failed, falling back to mock:", err);
      const fallback = classifyWithMockRules(subject, body, kbArticles);
      fallback.reasoning = `[Gemini call failed, used fallback] ${fallback.reasoning}`;
      return fallback;
    }
  }
  return classifyWithMockRules(subject, body, kbArticles);
}
