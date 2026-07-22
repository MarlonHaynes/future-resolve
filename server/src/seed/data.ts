// Realistic demo content used only by the seed script. Ticket bodies are
// written to naturally contain the keywords the mock classifier looks for,
// so seeded tickets run through the exact same classifyWithMockRules()
// logic the live app uses — the "AI reasoning" shown in the UI for demo
// tickets is real output from the classifier, not hand-written text.

export const AGENTS = [
  { name: "Priya Natarajan", email: "priya@futureresolve.demo", role: "agent" as const },
  { name: "Marcus Webb", email: "marcus@futureresolve.demo", role: "agent" as const },
  { name: "Sofia Alvarez", email: "sofia@futureresolve.demo", role: "agent" as const },
  { name: "Jin Park", email: "jin@futureresolve.demo", role: "agent" as const },
  { name: "Alex Okafor", email: "alex@futureresolve.demo", role: "agent" as const },
];

export const ADMIN = { name: "Dana Whitfield", email: "admin@futureresolve.demo", role: "admin" as const };

export const DEMO_PASSWORD = "password123";

export const KB_ARTICLES = [
  {
    title: "How to update your payment method",
    category: "Billing",
    body: "Go to Settings > Billing > Payment Methods. Click 'Add new card', enter details, then set it as default. Old charges are not retroactively affected.",
  },
  {
    title: "Understanding refund timelines",
    category: "Billing",
    body: "Refunds are issued to the original payment method and typically post within 5-10 business days depending on your bank. Subscription refunds are prorated.",
  },
  {
    title: "Troubleshooting 500 errors on checkout",
    category: "Technical Issue",
    body: "500 errors during checkout are usually caused by a stale session. Clear cookies for the site, hard-refresh, and retry. If it persists, check our status page.",
  },
  {
    title: "Resetting your password",
    category: "Account Access",
    body: "Click 'Forgot password' on the login screen. A reset link is valid for 30 minutes. If you don't receive the email, check spam or contact support to verify your account email.",
  },
  {
    title: "Enabling and recovering two-factor authentication",
    category: "Account Access",
    body: "2FA can be enabled under Settings > Security. If you're locked out, use one of your 10 backup codes, or contact support with a government ID for manual verification.",
  },
  {
    title: "Tracking your shipment",
    category: "Shipping & Delivery",
    body: "Tracking numbers are emailed once a package leaves the warehouse, usually within 24 hours of order confirmation. Carrier delays beyond 3 business days should be reported to support.",
  },
  {
    title: "How we prioritize feature requests",
    category: "Feature Request",
    body: "We review incoming feature requests monthly, scored by number of votes and engineering effort. Popular requests are added to our public roadmap.",
  },
  {
    title: "Reporting a reproducible bug effectively",
    category: "Bug Report",
    body: "Include exact steps to reproduce, expected vs actual behavior, browser/OS, and a screenshot or console error if possible. This speeds up triage significantly.",
  },
];

interface Template {
  subject: string;
  body: string;
}

// Each category has a spread of templates whose wording naturally implies
// different priority levels (urgent/high/med/low keyword signals), matching
// what services/classifier.ts's keyword lists look for.
export const TEMPLATES: Record<string, Template[]> = {
  Billing: [
    {
      subject: "Charged twice for my subscription this month",
      body: "I was charged twice for my monthly subscription and it's urgent — I need this refund processed asap, it's affecting my account balance.",
    },
    {
      subject: "Question about my last invoice",
      body: "I noticed my last invoice was higher than usual. Can someone explain the billing breakdown when you get a chance? No rush.",
    },
    {
      subject: "Need to update my credit card on file",
      body: "My card on file expired. Can you point me to where I update the payment method for my billing account?",
    },
    {
      subject: "Requesting a refund for unused seats",
      body: "We downgraded our plan but were still charged for the old subscription tier. Please process a refund for the difference.",
    },
    {
      subject: "Payment failed but I was still billed",
      body: "This is critical — our payment failed according to the email, but the charge still shows on our card statement. Please look into this immediately.",
    },
  ],
  "Technical Issue": [
    {
      subject: "Production is down for our whole team",
      body: "This is urgent, production is down for all users affected on our end. We're getting a 500 error timeout on every request since this morning.",
    },
    {
      subject: "Dashboard fails to load intermittently",
      body: "The dashboard sometimes fails to load with a timeout error. It's not consistent — happens maybe once every few hours.",
    },
    {
      subject: "Export feature keeps crashing",
      body: "Every time I try to export a report the page crashes with an error. Not blocking my work today, just wanted to flag it.",
    },
    {
      subject: "API returning 500 errors since this morning",
      body: "Our integration is down — the API has been failing with 500 error responses since about 9am today. This is blocking our checkout flow.",
    },
    {
      subject: "Slow page loads on the reports page",
      body: "The reports page has been noticeably slow lately, sometimes timing out. Minor annoyance, whenever you can look into it.",
    },
  ],
  "Bug Report": [
    {
      subject: "Regression: filters reset after page refresh",
      body: "I can reproduce this every time: apply a filter, refresh the page, and the filter silently resets. Stack trace attached, unexpected behavior from last release.",
    },
    {
      subject: "Date picker shows wrong month in Safari",
      body: "Minor bug — the date picker shows the wrong month on first open in Safari only. Easy to reproduce, low impact though.",
    },
    {
      subject: "Duplicate entries after bulk import",
      body: "After a bulk CSV import, several rows appear duplicated. This is a data integrity issue and needs attention soon, it's affecting our reporting.",
    },
    {
      subject: "Console exception on settings page",
      body: "There's a console exception thrown every time I open the settings page. Doesn't seem to break functionality but wanted to report the regression.",
    },
  ],
  "Account Access": [
    {
      subject: "Locked out of my account, need urgent help",
      body: "I cannot login and I've been locked out for an hour, this is urgent as I have a client presentation in 30 minutes. Please help immediately.",
    },
    {
      subject: "2FA codes not being accepted",
      body: "My 2FA codes aren't being accepted anymore, cannot access my dashboard. All users on our team seem affected, which feels like a security concern.",
    },
    {
      subject: "Forgot my password, reset link not arriving",
      body: "I requested a password reset but the email never arrived. Can you help me reset my password when you have a moment?",
    },
    {
      subject: "Need to change the email on my account",
      body: "I'd like to update the email address linked to my login. No rush, just want to keep my account details current.",
    },
    {
      subject: "MFA backup codes lost after phone reset",
      body: "I reset my phone and lost my MFA backup codes, now I can't log in at all. This is blocking access to critical account data.",
    },
  ],
  "Shipping & Delivery": [
    {
      subject: "Package shows delivered but never arrived",
      body: "Tracking says my package was delivered yesterday but it never arrived. This is urgent since it contains time-sensitive materials.",
    },
    {
      subject: "Tracking number not updating",
      body: "My shipment tracking hasn't updated in 4 days. Just checking in on the status, not in a rush.",
    },
    {
      subject: "Item arrived damaged in shipment",
      body: "The package I received arrived damaged — the courier must have mishandled it. Would like a replacement shipped out.",
    },
    {
      subject: "Delivery delayed beyond estimated window",
      body: "My delivery is now several days beyond the estimated arrival window. Can someone check with the courier on the shipment status?",
    },
  ],
  "Feature Request": [
    {
      subject: "Would be great to have dark mode",
      body: "Small suggestion: it would be great to have a dark mode option in settings. Not urgent, just a nice-to-have for late-night work.",
    },
    {
      subject: "Please add CSV export for the analytics page",
      body: "Feature request: please add a CSV export button on the analytics page, would help a lot with sharing reports internally.",
    },
    {
      subject: "Bulk actions for ticket management",
      body: "It would help if we could select multiple tickets and bulk-update their status at once. Just a suggestion for a future release, whenever you can.",
    },
    {
      subject: "Custom notification preferences",
      body: "Would love more granular control over email notifications. This is a minor suggestion, no rush on this one.",
    },
  ],
  "General Inquiry": [
    {
      subject: "Question about enterprise plan pricing",
      body: "Just curious what the enterprise plan pricing looks like for a team of 50. No rush, evaluating options for next quarter.",
    },
    {
      subject: "Do you offer a public status page?",
      body: "Wondering if there's a public status page we can subscribe to for uptime notifications. Small suggestion if not.",
    },
    {
      subject: "Can I get a demo of the analytics features?",
      body: "We're interested in a walkthrough of the analytics dashboard before renewing. Whenever you can schedule call works for us.",
    },
    {
      subject: "General feedback on the new UI",
      body: "Just wanted to share some general feedback on the redesigned UI, overall looks clean, no rush replying.",
    },
  ],
};
