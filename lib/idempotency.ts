import crypto from "crypto"

function cfg(){return {url:process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,token:process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN}}
async function redis(cmd:any[]){const c=cfg(); if(!c.url||!c.token)return null; const r=await fetch(c.url,{method:"POST",headers:{Authorization:`Bearer ${c.token}`,"Content-Type":"application/json"},body:JSON.stringify(cmd),cache:"no-store"}); if(!r.ok)throw new Error("Idempotency store unavailable"); return (await r.json()).result}

export function idempotencyHash(apiKey:string,idempotencyKey:string){return crypto.createHash("sha256").update(`${apiKey}:${idempotencyKey}`).digest("hex")}

export async function claimIdempotency(key:string,ttlSeconds=3600){
  const c=cfg();
  if(!c.url||!c.token){
    if(process.env.NODE_ENV==="production") throw new Error("Persistent Redis storage is required for idempotent production requests.")
    return true
  }
  const result=await redis(["SET",`viralmovie:idem:${key}`,"1","NX","EX",String(ttlSeconds)])
  return result==="OK"
}

export async function releaseIdempotency(key:string){
  const c=cfg(); if(c.url&&c.token) await redis(["DEL",`viralmovie:idem:${key}`])
}
