// Single source of truth for the fixed category taxonomy, shared by the
// mock classifier, the Gemini prompt, the seed script, and (via the API)
// the frontend filter dropdowns.
export const CATEGORIES = [
  "Billing",
  "Technical Issue",
  "Account Access",
  "Shipping & Delivery",
  "Feature Request",
  "Bug Report",
  "General Inquiry",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["low", "med", "high", "urgent"] as const;
