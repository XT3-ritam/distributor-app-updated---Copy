import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request { user?: { id:string; role:'OWNER'|'STAFF'; username:string } }
export const authenticate=(req:AuthRequest,res:Response,next:NextFunction)=>{ const header=req.headers.authorization; const token=header?.startsWith('Bearer ')?header.slice(7):''; if(!token)return res.status(401).json({error:'Unauthorized'}); try{if(!process.env.JWT_SECRET)throw new Error('JWT secret missing'); req.user=jwt.verify(token,process.env.JWT_SECRET) as AuthRequest['user']; next();}catch{res.status(401).json({error:'Invalid or expired session.'});} };
export const authorize=(roles:Array<'OWNER'|'STAFF'>)=>(req:AuthRequest,res:Response,next:NextFunction)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:'Forbidden'});next();};
