import { Response } from 'express';
import pool from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';
import { SettingsSchema } from '../services/schemas.js';
import { audit } from '../utils/audit.js';

export class SettingsController {
  get = async (_req: AuthRequest, res: Response) => {
    const { rows } = await pool.query("SELECT key,value FROM settings WHERE key IN ('company','billing') ORDER BY key");
    const result: Record<string, unknown> = {}; for (const r of rows) result[r.key]=r.value;
    res.json(result);
  };
  update = async (req: AuthRequest, res: Response) => {
    const parsed=SettingsSchema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Invalid settings.',details:parsed.error.flatten()});
    const client=await pool.connect();
    try{await client.query('BEGIN'); for(const [key,val] of Object.entries(parsed.data)){await client.query('UPDATE settings SET value=$1,updated_by=$2,updated_at=NOW() WHERE key=$3',[JSON.stringify(val),req.user!.id,key]);} await client.query('COMMIT'); await audit(req.user!.id,'SETTINGS_UPDATED','SETTINGS',undefined,{keys:Object.keys(parsed.data)}); res.json(parsed.data);}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  };
}
