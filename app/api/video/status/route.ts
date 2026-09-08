import {NextResponse} from "next/server"
import {findKey,refundKey} from "@/lib/store"
import {getProviderStatus} from "@/lib/provider"
import {getJob,updateJob} from "@/lib/jobs"

export const runtime="nodejs"

export async function GET(req:Request){
 try{
  const auth=req.headers.get("authorization")||""
  if(!/^Bearer\s+vm_live_[a-f0-9]{48}$/i.test(auth)) return NextResponse.json({ok:false,error:"Valid ViralMovie API key required."},{status:401})
  const apiKey=auth.replace(/^Bearer\s+/i,"").trim()
  const key=await findKey(apiKey); if(!key)return NextResponse.json({ok:false,error:"Invalid or revoked API key."},{status:401})
  const id=new URL(req.url).searchParams.get("id")||""; if(!id)return NextResponse.json({ok:false,error:"Job id is required."},{status:400})
  const job=await getJob(id); if(!job || job.keyHash!==key.keyHash)return NextResponse.json({ok:false,error:"Job not found."},{status:404})
  if(job.status==="COMPLETED" || job.status==="FAILED" || job.status==="CANCELLED") return NextResponse.json({ok:true,requestId:id,status:job.status,videoUrl:job.videoUrl||null,creditsRemaining:key.credits})
  const result=await getProviderStatus(id)
  if(result.status==="COMPLETED") await updateJob(id,{status:"COMPLETED",videoUrl:result.videoUrl||null,providerResponse:result.providerResponse})
  else if(["FAILED","CANCELLED","ERROR"].includes(result.status)){
   if(!job.refunded){await refundKey(apiKey,Number(job.creditsCharged||5));await updateJob(id,{status:"FAILED",refunded:true,providerResponse:result.providerResponse})}
  } else await updateJob(id,{status:result.status,providerResponse:result.providerResponse})
  const fresh=await findKey(apiKey)
  return NextResponse.json({ok:true,requestId:id,status:result.status,videoUrl:result.videoUrl||null,creditsRemaining:fresh?.credits??null})
 }catch(e:any){return NextResponse.json({ok:false,error:"Unable to read video job status."},{status:500})}
}
