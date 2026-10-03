import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/index.js';
import { audit } from '../utils/audit.js';
import { LoginSchema, SetupOwnerSchema } from '../services/schemas.js';

const tokenSecret = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  return process.env.JWT_SECRET;
};

function signUser(user: { id: string; username: string; role: 'OWNER' | 'STAFF' }) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, tokenSecret(), { expiresIn: '12h' });
}

export class AuthController {
  login = async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid username or password format.' });
    const { username, password } = parsed.data;
    const { rows } = await pool.query('SELECT id, username, display_name, password_hash, role, active FROM users WHERE username = $1', [username]);
    if (rows.length === 0 || !rows[0].active) return res.status(401).json({ error: 'Invalid credentials.' });
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
    const user = { id: rows[0].id, username: rows[0].username, role: rows[0].role as 'OWNER'|'STAFF' };
    res.json({ token: signUser(user), user: { ...user, displayName: rows[0].display_name } });
  };

  setupOwner = async (req: Request, res: Response) => {
    const parsed = SetupOwnerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid setup details.' });
    if (!process.env.SETUP_SECRET || parsed.data.setupSecret !== process.env.SETUP_SECRET) return res.status(403).json({ error: 'Invalid setup secret.' });
    const existing = await pool.query("SELECT 1 FROM users WHERE role = 'OWNER' LIMIT 1");
    if (existing.rowCount) return res.status(409).json({ error: 'Owner account already exists.' });
    const hash = await bcrypt.hash(parsed.data.password, 12);
    const { rows } = await pool.query('INSERT INTO users(username, display_name, password_hash, role) VALUES($1,$2,$3,\'OWNER\') RETURNING id, username, display_name, role', [parsed.data.username, parsed.data.displayName, hash]);
    await audit(rows[0].id, 'OWNER_CREATED', 'USER', rows[0].id, { username: rows[0].username });
    res.status(201).json({ message: 'Owner created successfully.' });
  };
}
