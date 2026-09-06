export const runtime="nodejs"

import {NextResponse} from "next/server"
import {createKey} from "@/lib/store"
import {rateLimit} from "@/lib/rate-limit"
export async function POST(req:Request){
 try{
  const ip=(req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"unknown").split(",")[0].trim(); const rl=await rateLimit(`create:${ip}`,5,3600); if(!rl.ok)return NextResponse.json({ok:false,error:"Too many key creation attempts. Try again later."},{status:429});
  const b=await req.json(); const email=String(b.email||"").trim().toLowerCase(); const name=String(b.name||"").trim()||"Developer"
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ok:false,error:"Valid email is required."},{status:400})
  const result=await createKey(email,name,10)
  return NextResponse.json({ok:true,...result,message:"Save this API key now. It will not be shown again."})
 }catch(e:any){return NextResponse.json({ok:false,error:e?.message||"Server error"},{status:500})}
}
