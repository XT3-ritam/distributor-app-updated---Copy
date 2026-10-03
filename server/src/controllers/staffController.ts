import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/index.js';
import { StaffCreateSchema, StaffUpdateSchema } from '../services/schemas.js';
import { audit } from '../utils/audit.js';
import { AuthRequest } from '../middleware/auth.js';

export class StaffController {
  list = async (_req: Request, res: Response) => {
    const { rows } = await pool.query('SELECT id, username, display_name, role, active, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = StaffCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid staff details.' });
    const hash = await bcrypt.hash(parsed.data.password, 12);
    try {
      const { rows } = await pool.query('INSERT INTO users(username, display_name, password_hash, role) VALUES($1,$2,$3,\'STAFF\') RETURNING id, username, display_name, role, active', [parsed.data.username, parsed.data.displayName, hash]);
      await audit(req.user?.id, 'STAFF_CREATED', 'USER', rows[0].id, { username: rows[0].username });
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Username already exists.' });
      throw err;
    }
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = StaffUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid update.' });
    const { id } = req.params;
    if (id === req.user?.id) return res.status(400).json({ error: 'Use a separate account to deactivate yourself.' });
    const fields: string[] = [];
    const values: any[] = [];
    if (parsed.data.displayName !== undefined) { values.push(parsed.data.displayName); fields.push(`display_name = $${values.length}`); }
    if (parsed.data.active !== undefined) { values.push(parsed.data.active); fields.push(`active = $${values.length}`); }
    if (parsed.data.password !== undefined) { values.push(await bcrypt.hash(parsed.data.password, 12)); fields.push(`password_hash = $${values.length}`); }
    values.push(id);
    const { rows } = await pool.query(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} AND role = 'STAFF' RETURNING id, username, display_name, role, active`, values);
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found.' });
    await audit(req.user?.id, 'STAFF_UPDATED', 'USER', String(id), parsed.data);
    res.json(rows[0]);
  };
}
