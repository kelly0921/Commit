import {createHash,randomUUID} from 'node:crypto';
import webPush from 'web-push';
import type {ProductDatabase,Session} from './db.js';
import {invariant} from './domain.js';

export type ActivityType='PLAN_READY'|'APPROVAL_REQUIRED'|'GROUP_PROGRESS'|'OFFER_AVAILABLE'|'TERMS_CHANGED'|'EVERYONE_READY'|'FINALIZING'|'PURCHASE_CONFIRMED'|'RECOVERY_STARTED'|'RECOVERY_COMPLETED'|'MANUAL_REVIEW_REQUIRED'|'NEEDS_ACTION';
export type PushConfig={publicKey?:string;privateKey?:string;contact?:string};
export type PushSender=(subscription:webPush.PushSubscription,payload:string)=>Promise<unknown>;
export const safeRoutes=new Set(['/proposal','/commit','/waiting','/group','/activity']);
export function safeDeepLink(link:string){const u=new URL(link,'https://commit.invalid');return u.origin==='https://commit.invalid'&&safeRoutes.has(u.pathname)&&!u.username&&!u.password;}
const critical=new Set(['APPROVAL_REQUIRED','TERMS_CHANGED','PURCHASE_CONFIRMED','RECOVERY_STARTED','RECOVERY_COMPLETED','MANUAL_REVIEW_REQUIRED','NEEDS_ACTION']);
export class CommunicationService {
 readonly sender?:PushSender;
 constructor(readonly db:ProductDatabase,readonly config:PushConfig={},sender?:PushSender){
  if(sender)this.sender=sender;
  else if(config.publicKey&&config.privateKey&&config.contact)this.sender=(subscription,payload)=>webPush.sendNotification(subscription,payload,{vapidDetails:{subject:config.contact!,publicKey:config.publicKey!,privateKey:config.privateKey!},TTL:3600,timeout:10000});
 }
 participant(session:Session){const f=this.db.session(session.id);invariant(f?.group_id&&f.persona!=='merchant'&&this.db.get('SELECT user_id FROM group_members WHERE group_id=? AND user_id=?',f.group_id,f.persona),'PARTICIPANT_ONLY',403);return f as Session&{group_id:string};}
 preferences(session:Session){const f=this.participant(session);const p=this.db.get<{push_enabled:number;progress:number;recommendations:number}>('SELECT * FROM notification_preferences WHERE group_id=? AND user_id=?',f.group_id,f.persona);return {pushEnabled:!!p?.push_enabled,progress:!!p?.progress,recommendations:p?!!p.recommendations:true,pushConfigured:!!this.sender,publicKey:this.config.publicKey??null};}
 setPreferences(session:Session,input:unknown){const f=this.participant(session);invariant(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_PREFERENCES');const v=input as Record<string,unknown>;invariant(Object.keys(v).every(k=>['pushEnabled','progress','recommendations'].includes(k))&&['pushEnabled','progress','recommendations'].every(k=>typeof v[k]==='boolean'),'INVALID_PREFERENCES');this.db.run('INSERT INTO notification_preferences VALUES(?,?,?,?,?) ON CONFLICT(group_id,user_id) DO UPDATE SET push_enabled=excluded.push_enabled,progress=excluded.progress,recommendations=excluded.recommendations',f.group_id,f.persona,Number(v.pushEnabled),Number(v.progress),Number(v.recommendations));return this.preferences(f);}
 list(session:Session){const f=this.participant(session);const items=this.db.all<{id:string;type:string;title:string;body:string;deep_link:string;actionable:number;read_at:string|null;resolved_at:string|null;created_at:string}>('SELECT id,type,title,body,deep_link,actionable,read_at,resolved_at,created_at FROM activity_events WHERE recipient_kind=\'CONSUMER\' AND recipient_id=? AND group_id=? ORDER BY CASE WHEN actionable=1 AND resolved_at IS NULL THEN 0 ELSE 1 END,created_at DESC LIMIT 100',f.persona,f.group_id);return {items,unreadActionable:this.db.get<{n:number}>('SELECT COUNT(*) AS n FROM activity_events WHERE recipient_kind=\'CONSUMER\' AND recipient_id=? AND group_id=? AND actionable=1 AND read_at IS NULL AND resolved_at IS NULL',f.persona,f.group_id)!.n};}
 read(session:Session,id:unknown){const f=this.participant(session);invariant(typeof id==='string','ACTIVITY_REQUIRED');const result=this.db.run('UPDATE activity_events SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_kind=\'CONSUMER\' AND recipient_id=? AND group_id=?',new Date().toISOString(),id,f.persona,f.group_id);invariant(Number(result.changes)===1,'ACTIVITY_NOT_FOUND',404);return this.list(f);}
 create(kind:'CONSUMER'|'MERCHANT',recipient:string,groupId:string|null,type:ActivityType,title:string,body:string,deepLink:string,key:string,actionable=false){
  invariant(safeDeepLink(deepLink),'UNSAFE_ACTIVITY_LINK',500);this.db.transaction(()=>{const id=randomUUID(),now=new Date().toISOString();
  const insert=this.db.run('INSERT OR IGNORE INTO activity_events(id,recipient_kind,recipient_id,group_id,type,title,body,deep_link,actionable,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,kind,recipient,groupId,type,title,body,deepLink,Number(actionable),key,now);
  if(!Number(insert.changes)||kind!=='CONSUMER'||!groupId)return;
  const p=this.db.get<{push_enabled:number;progress:number;recommendations:number}>('SELECT * FROM notification_preferences WHERE group_id=? AND user_id=?',groupId,recipient);
  if(!p?.push_enabled||(!critical.has(type)&&((type==='GROUP_PROGRESS'&&!p.progress)||(type==='PLAN_READY'&&!p.recommendations))))return;
  for(const s of this.db.all<{id:string}>('SELECT id FROM push_subscriptions WHERE group_id=? AND user_id=?',groupId,recipient))this.db.run('INSERT OR IGNORE INTO notification_outbox(id,activity_id,subscription_id,available_at) VALUES(?,?,?,?)',randomUUID(),id,s.id,now);});
 }
 subscribe(session:Session,input:unknown){const f=this.participant(session);invariant(this.sender&&this.config.publicKey,'PUSH_NOT_CONFIGURED',503);invariant(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_PUSH_SUBSCRIPTION');const s=input as webPush.PushSubscription&{expirationTime?:number|null};let url:URL;try{url=new URL(s.endpoint);}catch{throw Error('INVALID_PUSH_SUBSCRIPTION');}
  // Capability URL only goes to a known push service, never a client-selected internal host.
  invariant(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]*push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/.test(url.hostname),'UNSUPPORTED_PUSH_SERVICE');
  invariant(s.endpoint.length<=4096&&s.keys&&typeof s.keys.p256dh==='string'&&typeof s.keys.auth==='string'&&/^[A-Za-z0-9_-]+$/.test(s.keys.p256dh)&&/^[A-Za-z0-9_-]+$/.test(s.keys.auth)&&Buffer.from(s.keys.p256dh,'base64url').length===65&&Buffer.from(s.keys.auth,'base64url').length===16,'INVALID_PUSH_SUBSCRIPTION');
  invariant(s.expirationTime==null||(Number.isFinite(s.expirationTime)&&s.expirationTime>Date.now()),'EXPIRED_PUSH_SUBSCRIPTION');
  const endpointHash=createHash('sha256').update(s.endpoint).digest('hex');const existing=this.db.get<{group_id:string;user_id:string}>('SELECT * FROM push_subscriptions WHERE endpoint_hash=?',endpointHash);invariant(!existing||(existing.group_id===f.group_id&&existing.user_id===f.persona),'PUSH_SUBSCRIPTION_OWNED_BY_ANOTHER_SESSION',409);
  const id=randomUUID();this.db.run('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET subscription_json=excluded.subscription_json,expires_at=excluded.expires_at',id,f.group_id,f.persona,endpointHash,JSON.stringify({endpoint:s.endpoint,keys:s.keys}),s.expirationTime?new Date(s.expirationTime).toISOString():null,new Date().toISOString());return {subscribed:true};
 }
 unsubscribe(session:Session){const f=this.participant(session);this.db.run('DELETE FROM push_subscriptions WHERE group_id=? AND user_id=?',f.group_id,f.persona);this.db.run('UPDATE notification_preferences SET push_enabled=0 WHERE group_id=? AND user_id=?',f.group_id,f.persona);return {subscribed:false};}
 async deliver(limit=20){
  this.db.run('DELETE FROM push_subscriptions WHERE expires_at IS NOT NULL AND expires_at<=?',new Date().toISOString());if(!this.sender)return 0;
  const rows=this.db.all<{id:string;subscription_id:string;subscription_json:string;activity_id:string;deep_link:string;type:string;attempts:number;recipient_id:string;group_id:string}>("SELECT o.*,s.subscription_json,a.deep_link,a.type,a.recipient_id,a.group_id FROM notification_outbox o JOIN push_subscriptions s ON s.id=o.subscription_id JOIN activity_events a ON a.id=o.activity_id WHERE o.state='PENDING' AND o.available_at<=? LIMIT ?",new Date().toISOString(),limit);
  let sent=0;for(const row of rows){const pref=this.db.get<{push_enabled:number}>('SELECT push_enabled FROM notification_preferences WHERE group_id=? AND user_id=?',row.group_id,row.recipient_id);if(!pref?.push_enabled){this.db.run("UPDATE notification_outbox SET state='FAILED' WHERE id=?",row.id);continue;}
   const badge=this.db.get<{n:number}>("SELECT COUNT(*) AS n FROM activity_events WHERE recipient_kind='CONSUMER' AND recipient_id=? AND group_id=? AND actionable=1 AND read_at IS NULL AND resolved_at IS NULL",row.recipient_id,row.group_id)!.n;
   try{await this.sender(JSON.parse(row.subscription_json),JSON.stringify({title:'Commit update',body:'Open Commit to review the latest update.',deepLink:row.deep_link,activityId:row.activity_id,badge}));this.db.run("UPDATE notification_outbox SET state='SENT',attempts=attempts+1 WHERE id=?",row.id);sent++;}
   catch(error){const code=(error as {statusCode?:number}).statusCode;if(code===404||code===410)this.db.run('DELETE FROM push_subscriptions WHERE id=?',row.subscription_id);else this.db.run("UPDATE notification_outbox SET state=?,attempts=attempts+1,available_at=? WHERE id=?",row.attempts>=4?'FAILED':'PENDING',new Date(Date.now()+60000*2**row.attempts).toISOString(),row.id);}
  }return sent;
 }
}
