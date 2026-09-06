export const runtime="nodejs"
import {NextResponse} from "next/server"
import Stripe from "stripe"
import {addCreditsByKeyHash,markStripeEvent,unmarkStripeEvent} from "@/lib/store"
export async function POST(req:Request){
 const secret=process.env.STRIPE_SECRET_KEY, webhook=process.env.STRIPE_WEBHOOK_SECRET
 if(!secret||!webhook)return NextResponse.json({error:"Stripe webhook is not configured."},{status:503})
 const stripe=new Stripe(secret), sig=req.headers.get("stripe-signature")||"", raw=await req.text()
 try{
  const event=stripe.webhooks.constructEvent(raw,sig,webhook)
  if(event.type==="checkout.session.completed"){
   const s=event.data.object as Stripe.Checkout.Session; const credits=Number(s.metadata?.credits||0); const keyHash=s.metadata?.keyHash||""
   if(credits>0&&keyHash){const fresh=await markStripeEvent(event.id); if(fresh){try{const added=await addCreditsByKeyHash(keyHash,credits); if(!added) throw new Error("API key no longer exists.")}catch(err){await unmarkStripeEvent(event.id); throw err}}}
  }
  return NextResponse.json({received:true})
 }catch(e:any){return NextResponse.json({error:`Webhook verification failed: ${e?.message||"invalid"}`},{status:400})}
}
