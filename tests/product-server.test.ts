import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { ProductDatabase } from '../src/product/db.js';
import { ProductService } from '../src/product/service.js';
import { createProductServer } from '../src/product/server.js';
import { SEED_CONSTRAINTS } from '../src/product/seed.js';
test('HTTP session, CSRF, privacy, persona, catalog and static routes',async()=>{
  const db=new ProductDatabase(':memory:');const service=new ProductService(db,{async interpret(){return {parsed:SEED_CONSTRAINTS.kelly!,source:'OPENAI'};},async explain(facts){return {selection:{factIds:facts.slice(0,3).map(f=>f.id)},source:'OPENAI'};}},'openai');const server=createProductServer(service);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try{
    const opened=await fetch(`${origin}/api/session`);const cookie=opened.headers.get('set-cookie')!.split(';')[0]!;assert.match(opened.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);const session=await opened.json() as any;
    const post=(path:string,data:unknown,extra:Record<string,string>={})=>fetch(origin+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':session.csrfToken,...extra},body:JSON.stringify(data)});
    assert.equal((await post('/api/demo',{}, {'x-csrf-token':'bad'})).status,403);assert.equal((await post('/api/demo',{}, {origin:'https://evil.example'})).status,403);
    assert.equal((await post('/api/demo',{})).status,200);assert.equal((await post('/api/solve',{})).status,200);
    const group=await (await fetch(origin+'/api/group',{headers:{cookie}})).json() as any;assert.equal(group.proposal.totalCents,145500);assert.doesNotMatch(JSON.stringify(group),/hardMaxCents|preferredMax|softPenalty|statement/);
    assert.equal((await fetch(origin+'/api/constraints/me')).status,401);assert.equal((await fetch(origin+'/api/constraints/sarah',{headers:{cookie}})).status,404);
    await post('/api/persona',{persona:'merchant'});assert.equal((await fetch(origin+'/api/group',{headers:{cookie}})).status,403);assert.equal((await fetch(origin+'/api/constraints/me',{headers:{cookie}})).status,403);assert.equal((await fetch(origin+'/api/catalog',{headers:{cookie}})).status,200);
    for(const path of ['/','/create','/group','/constraints','/proposal','/merchant']){const r=await fetch(origin+path);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy')!,/frame-ancestors 'none'/);}
    assert.equal((await fetch(origin+'/.env')).status,404);assert.equal((await fetch(origin+'/src/product/db.ts')).status,404);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
