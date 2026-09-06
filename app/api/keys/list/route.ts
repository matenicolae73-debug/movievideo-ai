import {NextResponse} from "next/server"
export async function GET(){return NextResponse.json({ok:false,error:"Admin authentication required. Use /api/admin/keys with X-Admin-Secret."},{status:401})}
