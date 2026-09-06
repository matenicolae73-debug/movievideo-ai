import crypto from "crypto"

type ApiKeyRecord = { id:string; email:string; name:string; keyHash:string; keyPrefix:string; credits:number; active:boolean; createdAt:string }
type Store = { keys: Record<string,ApiKeyRecord> }
const memory: Store = { keys: {} }

function redisConfig(){ return {url:process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token:process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN} }
export function hasPersistentStore(){ const c=redisConfig(); return !!(c.url&&c.token) }
async function redis(command:any[]){ const c=redisConfig(); if(!c.url||!c.token) return null; const r=await fetch(c.url,{method:"POST",headers:{Authorization:`Bearer ${c.token}`,"Content-Type":"application/json"},body:JSON.stringify(command),cache:"no-store"}); if(!r.ok) throw new Error(`Redis error ${r.status}`); const j=await r.json(); return j.result }
function requirePersistence(){ if(process.env.NODE_ENV==="production" && process.env.REQUIRE_PERSISTENCE!=="false" && !hasPersistentStore()) throw new Error("Persistent Redis storage is required in production.") }
export function hashKey(key:string){return crypto.createHash("sha256").update(key).digest("hex")}
const META="viralmovie:keys:meta", HASH="viralmovie:keys:hash", ACTIVE="viralmovie:keys:active", CREDITS="viralmovie:keys:credits"

async function allRecords():Promise<ApiKeyRecord[]>{
 const c=redisConfig();
 if(!c.url||!c.token) return Object.values(memory.keys)
 const idsRaw=await redis(["HGETALL",META]); const out:ApiKeyRecord[]=[]
 for(let i=0;i<(idsRaw||[]).length;i+=2){ const id=idsRaw[i], raw=JSON.parse(idsRaw[i+1]); const [credits,active]=await Promise.all([redis(["HGET",CREDITS,id]),redis(["HGET",ACTIVE,id])]); raw.credits=Number(credits||0); raw.active=String(active)==="1"; out.push(raw) }
 return out
}

export async function createKey(email:string,name:string,credits=10){
 requirePersistence();
 const raw="vm_live_"+crypto.randomBytes(24).toString("hex"), id=crypto.randomUUID();
 const rec:ApiKeyRecord={id,email,name,keyHash:hashKey(raw),keyPrefix:raw.slice(0,15),credits,active:true,createdAt:new Date().toISOString()}
 const c=redisConfig();
 if(c.url&&c.token){ await redis(["HSET",META,id,JSON.stringify({...rec,credits:undefined,active:undefined})]); await redis(["HSET",HASH,rec.keyHash,id]); await redis(["HSET",ACTIVE,id,"1"]); await redis(["HSET",CREDITS,id,String(credits)]) }
 else memory.keys[id]=rec
 return {id,email,name,key:raw,credits}
}

export async function findKey(raw:string){
 const h=hashKey(raw), c=redisConfig();
 if(!c.url||!c.token){ const k=Object.values(memory.keys).find(x=>x.keyHash===h&&x.active); return k||null }
 const id=await redis(["HGET",HASH,h]); if(!id) return null
 const meta=await redis(["HGET",META,id]); if(!meta) return null
 const active=await redis(["HGET",ACTIVE,id]); if(String(active)!=="1") return null
 const credits=Number(await redis(["HGET",CREDITS,id])||0); return {...JSON.parse(meta),credits,active:true} as ApiKeyRecord
}

export async function consumeKey(raw:string,cost:number){
 requirePersistence(); const k=await findKey(raw); if(!k) return {ok:false,error:"Invalid or revoked API key."}
 if(cost<=0 || !Number.isFinite(cost)) return {ok:false,error:"Invalid credit cost."}
 const c=redisConfig();
 if(c.url&&c.token){
  const script=`local a=redis.call('HGET',KEYS[1],ARGV[1]); if redis.call('HGET',ARGV[2],ARGV[1]) ~= '1' then return -2 end; if not a then return -3 end; local n=tonumber(a); local cost=tonumber(ARGV[3]); if n<cost then return -1 end; return redis.call('HINCRBY',KEYS[1],ARGV[1],-cost)`
  const result=await redis(["EVAL",script,"1",CREDITS,k.id,ACTIVE,String(cost)])
  if(Number(result)===-2||Number(result)===-3) return {ok:false,error:"Invalid or revoked API key."}
  if(Number(result)===-1) return {ok:false,error:`Insufficient API credits. Required ${cost}, available ${k.credits}.`}
  return {ok:true,key:{...k,credits:Number(result)}}
 }
 const m=memory.keys[k.id]; if(m.credits<cost)return {ok:false,error:`Insufficient API credits. Required ${cost}, available ${m.credits}.`}; m.credits-=cost; return {ok:true,key:m}
}
export async function refundKey(raw:string,cost:number){ const k=await findKey(raw); if(!k)return false; const c=redisConfig(); if(c.url&&c.token){await redis(["HINCRBY",CREDITS,k.id,cost])}else memory.keys[k.id].credits+=cost; return true }
export async function addCreditsByEmail(email:string,credits:number){ requirePersistence(); const list=(await allRecords()).filter(k=>k.email.toLowerCase()===email.toLowerCase()&&k.active); if(!list.length)return false; const c=redisConfig(); if(c.url&&c.token) await redis(["HINCRBY",CREDITS,list[0].id,credits]); else memory.keys[list[0].id].credits+=credits; return true }
export async function addCreditsByKeyHash(keyHash:string,credits:number){ requirePersistence(); const c=redisConfig(); if(c.url&&c.token){const id=await redis(["HGET",HASH,keyHash]); if(!id)return false; await redis(["HINCRBY",CREDITS,id,credits]); return true} const k=Object.values(memory.keys).find(x=>x.keyHash===keyHash&&x.active); if(!k)return false; k.credits+=credits; return true }
export async function markStripeEvent(eventId:string){ requirePersistence(); const c=redisConfig(); if(c.url&&c.token){const exists=await redis(["HEXISTS","viralmovie:stripe:events",eventId]); if(Number(exists)===1)return false; await redis(["HSET","viralmovie:stripe:events",eventId,"1"]); return true} return true }
export async function unmarkStripeEvent(eventId:string){ const c=redisConfig(); if(c.url&&c.token) await redis(["HDEL","viralmovie:stripe:events",eventId]); }
export async function listKeys(){ return (await allRecords()).map(({keyHash,...safe})=>safe) }
export async function revokeKey(id:string){ requirePersistence(); const c=redisConfig(); if(c.url&&c.token){const exists=await redis(["HEXISTS",META,id]); if(!exists)return false; await redis(["HSET",ACTIVE,id,"0"]); return true} if(!memory.keys[id])return false; memory.keys[id].active=false; return true }
