export const runtime="nodejs"
import {NextResponse} from "next/server"
import {listKeys,revokeKey} from "@/lib/store"
function authorized(req:Request){const expected=process.env.ADMIN_API_SECRET; const got=req.headers.get("x-admin-secret")||""; return !!expected && got.length>0 && cryptoSafeEqual(got,expected)}
function cryptoSafeEqual(a:string,b:string){if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0}
export async function GET(req:Request){if(!authorized(req))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401}); return NextResponse.json({ok:true,keys:await listKeys()})}
export async function DELETE(req:Request){if(!authorized(req))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401}); const id=new URL(req.url).searchParams.get("id")||""; const ok=await revokeKey(id); return NextResponse.json({ok,error:ok?undefined:"Key not found"},{status:ok?200:404})}
