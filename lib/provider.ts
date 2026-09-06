import { fal } from "@fal-ai/client"
import crypto from "crypto"

export type VideoJob={requestId:string; status:string; videoUrl?:string|null; providerResponse?:unknown}
type Input={prompt:string;duration:number;resolution:string;aspectRatio:string}

const MODEL=process.env.FAL_VIDEO_MODEL || "fal-ai/vidu/q3/text-to-video/turbo"

function configure(){
  const key=process.env.FAL_KEY
  if(!key) throw new Error("Video engine is not configured. Add FAL_KEY in Vercel Environment Variables.")
  fal.config({credentials:key})
}

function extractVideoUrl(data:any):string|null{
  const candidates=[data?.video?.url,data?.video_url,data?.videoUrl,data?.url,data?.output?.video?.url,data?.output?.url]
  return candidates.find((x:any)=>typeof x==="string"&&x.length>0)||null
}

export async function generateWithProvider(input:Input):Promise<VideoJob>{
  if(process.env.NODE_ENV!=="production" && process.env.VIDEO_PROVIDER_MODE==="local"){
    return {requestId:crypto.randomUUID(),status:"LOCAL_RENDER",videoUrl:null,providerResponse:{provider:"viralMovie-local",...input}}
  }
  configure()
  const duration=Math.min(8,Math.max(1,Math.round(input.duration)))
  const resolution=["360p","540p","720p","1080p"].includes(input.resolution)?input.resolution:"720p"
  const aspect_ratio=["16:9","9:16","1:1"].includes(input.aspectRatio)?input.aspectRatio:"16:9"
  const {request_id}=await fal.queue.submit(MODEL,{input:{prompt:input.prompt,duration,resolution,aspect_ratio,audio:true}})
  return {requestId:request_id,status:"IN_QUEUE",videoUrl:null,providerResponse:{provider:"fal",model:MODEL}}
}

export async function getProviderStatus(requestId:string){
  configure()
  const status=await fal.queue.status(MODEL,{requestId,logs:false})
  const normalized=String(status.status||"UNKNOWN")
  if(normalized==="COMPLETED"){
    const result=await fal.queue.result(MODEL,{requestId})
    return {status:normalized,videoUrl:extractVideoUrl(result.data),providerResponse:{provider:"fal",model:MODEL}}
  }
  return {status:normalized,videoUrl:null,providerResponse:{provider:"fal",model:MODEL}}
}
