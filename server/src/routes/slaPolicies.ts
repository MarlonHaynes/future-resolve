import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

export const slaPoliciesRouter = Router();
slaPoliciesRouter.use(requireAuth);

slaPoliciesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `select * from sla_policies order by category asc, priority asc`
    );
    res.json({ policies: rows });
  })
);
