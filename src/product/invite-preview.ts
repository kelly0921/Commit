import {createHash} from 'node:crypto';
import type {ProductDatabase} from './db.js';
import {invariant} from './domain.js';

// Public invitation capability projection. Explicit whitelist, SELECTs only.
// Preview never consumes the invitation, creates identity or grants authority.
export function invitePreview(db:ProductDatabase,token:unknown){
 invariant(typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token),'INVITE_EXPIRED_OR_INVALID',404);
 const invite=db.get<{group_id:string;max_members:number}>(
  'SELECT group_id,max_members FROM group_invites WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',
  createHash('sha256').update(token).digest('hex'),new Date().toISOString());
 invariant(invite,'INVITE_EXPIRED_OR_INVALID',404);
 const members=db.all<{name:string;role:string}>(
  'SELECT u.name,m.role FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.rowid',invite.group_id);
 const closed=db.get(`SELECT c.id FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id JOIN proposals p ON p.id=a.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=? AND c.paypal_order_id IS NOT NULL`,invite.group_id);
 invariant(members.length<invite.max_members&&!closed,'INVITE_UNAVAILABLE',409);
 const group=db.get<{name:string}>('SELECT name FROM groups WHERE id=?',invite.group_id)!;
 const goal=db.get<{description:string}>('SELECT description FROM purchase_goals WHERE group_id=?',invite.group_id);
 const catalog=db.get<{catalog_json:string}>('SELECT catalog_json FROM group_catalogs WHERE group_id=?',invite.group_id);
 const packages: {terms:{startDate:string;endDate:string}}[]=catalog?JSON.parse(catalog.catalog_json):[];
 const dates=Array.from(new Map(packages.map(p=>[p.terms.startDate+':'+p.terms.endDate,{start:p.terms.startDate,end:p.terms.endDate}])).values());
 return {name:group.name,organizer:members.find(m=>m.role==='ORGANIZER')?.name??'Your friend',
  participants:members.map(m=>({name:m.name,initial:m.name[0]??'?'})),dates,goal:goal?.description??'',demoIdentity:true};
}
