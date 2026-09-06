import {NextResponse} from "next/server"
export async function POST(){return NextResponse.json({ok:false,error:"Admin authentication required. Use /api/admin/keys."},{status:401})}
