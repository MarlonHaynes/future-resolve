import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const agentsRouter = Router();
agentsRouter.use(requireAuth);

// Any authenticated user can read the agent roster (needed to populate the
// "assign to" dropdown on a ticket). Only admins can create/edit agents.
agentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `select id, name, email, role, current_workload, created_at from agents order by name asc`
    );
    res.json({ agents: rows });
  })
);

agentsRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body ?? {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, and role are required" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `insert into agents (name, email, password_hash, role) values ($1, $2, $3, $4)
       returning id, name, email, role, current_workload, created_at`,
      [name, email, passwordHash, role]
    );
    res.status(201).json({ agent: rows[0] });
  })
);

agentsRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, role } = req.body ?? {};
    const { rows } = await pool.query(
      `update agents set name = coalesce($1, name), role = coalesce($2, role) where id = $3
       returning id, name, email, role, current_workload, created_at`,
      [name ?? null, role ?? null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Agent not found" });
    res.json({ agent: rows[0] });
  })
);
