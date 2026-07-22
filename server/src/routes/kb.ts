import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

export const kbRouter = Router();
kbRouter.use(requireAuth);

kbRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(`select * from kb_articles order by title asc`);
    res.json({ articles: rows });
  })
);

kbRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`select * from kb_articles where id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Article not found" });
    res.json({ article: rows[0] });
  })
);
