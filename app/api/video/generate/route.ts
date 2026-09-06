import {NextResponse} from "next/server"
import {consumeKey,refundKey} from "@/lib/store"
import {generateWithProvider} from "@/lib/provider"
import {claimIdempotency,idempotencyHash,releaseIdempotency} from "@/lib/idempotency"
import {rateLimit} from "@/lib/rate-limit"
import {saveJob} from "@/lib/jobs"
export const runtime="nodejs"

export async function POST(req:Request){
 let idem=""
 let customerKey=""
 try{
  const auth=req.headers.get("authorization")||""
  if(!/^Bearer\s+vm_live_[a-f0-9]{48}$/i.test(auth)) return NextResponse.json({ok:false,error:"Valid ViralMovie API key required."},{status:401})
  customerKey=auth.replace(/^Bearer\s+/i,"").trim()

  const rl=await rateLimit(`video:${idempotencyHash(customerKey,req.headers.get("x-forwarded-for")||"unknown")}`,30,60)
  if(!rl.ok)return NextResponse.json({ok:false,error:"Too many video requests. Try again later."},{status:429})

  idem=(req.headers.get("idempotency-key")||"").trim()
  if(!/^[A-Za-z0-9._:-]{8,128}$/.test(idem)) return NextResponse.json({ok:false,error:"Idempotency-Key header is required (8-128 safe characters)."},{status:400})
  const idemKey=idempotencyHash(customerKey,idem)
  if(!(await claimIdempotency(idemKey))) return NextResponse.json({ok:false,error:"This request has already been accepted. Use a new Idempotency-Key."},{status:409})

  const body=await req.json()
  const prompt=String(body?.prompt||"").trim()
  if(!prompt||prompt.length>2000){await releaseIdempotency(idemKey);return NextResponse.json({ok:false,error:"Prompt is required and must be 1-2000 characters."},{status:400})}
  const duration=Math.min(8,Math.max(1,Number(body?.duration)||5))
  const resolution=["360p","540p","720p","1080p"].includes(body?.resolution)?body.resolution:"720p"
  const aspectRatio=["16:9","9:16","1:1"].includes(body?.aspectRatio)?body.aspectRatio:"16:9"

  const creditsPerSecond = resolution === "1080p" ? 4 : resolution === "720p" ? 3 : 1
  const creditCost = duration * creditsPerSecond
  const debit=await consumeKey(customerKey,creditCost)
  if(!debit.ok){await releaseIdempotency(idemKey);return NextResponse.json(debit,{status:402})}
  try{
    const job=await generateWithProvider({prompt,duration,resolution,aspectRatio})
    if(job.status!=="LOCAL_RENDER") await saveJob(job.requestId, debit.key?.keyHash || "", creditCost)
    return NextResponse.json({ok:true,...job,creditsRemaining:debit.key?.credits??null,creditsCharged:creditCost,render:{durationSeconds:duration,resolution,aspectRatio,prompt}})
  }catch(e){
    await refundKey(customerKey,creditCost)
    await releaseIdempotency(idemKey)
    throw e
  }
 }catch(e:any){return NextResponse.json({ok:false,error:e?.message||"Video generation failed."},{status:500})}
}
