import { pool } from "../db.js";

// ============================================================================
// Auto-routing: assign each new ticket to the agent with the lowest
// current_workload (role='agent', admins are never auto-assigned tickets).
//
// current_workload is a simple counter of "tickets currently assigned to me
// that are not resolved" — incremented on assignment, decremented on
// resolution (see routes/tickets.ts). The schema given for `agents` has no
// per-category specialization field, so routing balances load across all
// agents globally rather than a per-category pool; see ARCHITECTURE.md.
// ============================================================================

export async function pickLeastLoadedAgent(): Promise<string | null> {
  const { rows } = await pool.query(
    `select id from agents where role = 'agent' order by current_workload asc, name asc limit 1`
  );
  return rows[0]?.id ?? null;
}

export async function incrementWorkload(agentId: string) {
  await pool.query(`update agents set current_workload = current_workload + 1 where id = $1`, [agentId]);
}

export async function decrementWorkload(agentId: string) {
  await pool.query(
    `update agents set current_workload = greatest(current_workload - 1, 0) where id = $1`,
    [agentId]
  );
}
