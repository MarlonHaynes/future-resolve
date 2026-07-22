import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { env } from "../env.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { AuthTokenPayload } from "../types.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const { rows } = await pool.query(
      `select id, name, email, role, password_hash from agents where email = $1`,
      [email]
    );
    const agent = rows[0];
    if (!agent) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const payload: AuthTokenPayload = {
      agentId: agent.id,
      role: agent.role,
      email: agent.email,
      name: agent.name,
    };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "12h" });

    res.json({ token, agent: payload });
  })
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ agent: req.user });
});
