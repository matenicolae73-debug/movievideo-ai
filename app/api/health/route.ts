import {NextResponse} from "next/server"
import {hasPersistentStore} from "@/lib/store"
export async function GET(){return NextResponse.json({ok:true,service:"viralmovie-api",provider:process.env.FAL_KEY ? "fal" : "unconfigured",persistentStore:hasPersistentStore(),stripeConfigured:!!process.env.STRIPE_SECRET_KEY,adminConfigured:!!process.env.ADMIN_API_SECRET})}
