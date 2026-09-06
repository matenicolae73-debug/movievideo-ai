export const runtime="nodejs"
import {NextResponse} from "next/server"
import Stripe from "stripe"
import {PLANS,PlanId} from "@/lib/plans"
import {findKey,hashKey} from "@/lib/store"
import {rateLimit} from "@/lib/rate-limit"
export async function POST(req:Request){
 try{
  const ip=(req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim()
  const rl=await rateLimit(`checkout:${ip}`,20,3600)
  if(!rl.ok)return NextResponse.json({ok:false,error:"Too many checkout attempts. Try again later."},{status:429})
  const stripeKey=process.env.STRIPE_SECRET_KEY
  if(!stripeKey)return NextResponse.json({ok:false,error:"Stripe is not configured."},{status:503})
  const b=await req.json(); const plan=String(b.plan||"") as PlanId; const email=String(b.email||"").trim().toLowerCase(); const apiKey=String(b.apiKey||"").trim()
  if(!(plan in PLANS))return NextResponse.json({ok:false,error:"Invalid plan."},{status:400})
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({ok:false,error:"Valid email is required."},{status:400})
  const key=await findKey(apiKey); if(!key||key.email.toLowerCase()!==email)return NextResponse.json({ok:false,error:"A valid API key belonging to this email is required."},{status:401})
  const p=PLANS[plan]; const stripe=new Stripe(stripeKey); const origin=process.env.NEXT_PUBLIC_APP_URL||new URL(req.url).origin
  const session=await stripe.checkout.sessions.create({mode:"payment",customer_email:email,line_items:[{price_data:{currency:p.currency,product_data:{name:`ViralMovie API — ${p.name} credits`},unit_amount:p.amount},quantity:1}],metadata:{email,plan,credits:String(p.credits),keyHash:hashKey(apiKey)},success_url:`${origin}/?paid=1`,cancel_url:`${origin}/?paid=0`})
  return NextResponse.json({ok:true,url:session.url})
 }catch(e:any){return NextResponse.json({ok:false,error:"Unable to create checkout session."},{status:500})}
}
