import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { ticketsRouter } from "./routes/tickets.js";
import { agentsRouter } from "./routes/agents.js";
import { kbRouter } from "./routes/kb.js";
import { analyticsRouter } from "./routes/analytics.js";
import { slaPoliciesRouter } from "./routes/slaPolicies.js";
import { startSlaBreachSweep } from "./services/sla.js";
import { CATEGORIES, PRIORITIES } from "./services/categories.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    databaseConfigured: env.isDatabaseConfigured,
    geminiConfigured: env.isGeminiConfigured,
    jwtSecretConfigured: env.isJwtSecretConfigured,
  });
});

app.get("/api/meta", (_req, res) => {
  res.json({ categories: CATEGORIES, priorities: PRIORITIES });
});

app.use("/api/auth", authRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/kb", kbRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/sla-policies", slaPoliciesRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Future Resolve API listening on http://localhost:${env.port}`);
  if (!env.isDatabaseConfigured) {
    console.warn("⚠ DATABASE_URL is not configured — API calls that hit Postgres will fail until you set it in .env");
  }
  if (!env.isGeminiConfigured) {
    console.warn("⚠ GEMINI_API_KEY is not configured — classification will use the mock classifier only");
  }
  if (!env.isJwtSecretConfigured) {
    console.warn("⚠ JWT_SECRET is not configured — using an insecure dev-only default, do not deploy like this");
  }

  if (env.isDatabaseConfigured) {
    startSlaBreachSweep();
  }
});
