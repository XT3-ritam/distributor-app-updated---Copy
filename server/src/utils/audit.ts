import pool from '../db/index.js';

export async function audit(actorId: string | undefined, action: string, entityType: string, entityId: string | undefined, details: unknown, db = pool): Promise<void> {
  await db.query(
    'INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
    [actorId ?? null, action, entityType, entityId ?? null, details ? JSON.stringify(details) : null]
  );
}
