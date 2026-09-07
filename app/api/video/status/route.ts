import { NextResponse } from "next/server"
import { findKey, refundKey } from "@/lib/store"
import { getProviderStatus } from "@/lib/provider"
import { getJob, updateJob } from "@/lib/jobs"

export const runtime = "nodejs"

function getBearerKey(req: Request): string | null {
  const auth = req.headers.get("authorization") || ""

  if (!/^Bearer\s+vm_live_[a-f0-9]{48}$/i.test(auth)) {
    return null
  }

  return auth.replace(/^Bearer\s+/i, "").trim()
}

export async function GET(req: Request) {
  try {
    const apiKey = getBearerKey(req)

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Valid ViralMovie API key required.",
        },
        { status: 401 }
      )
    }

    const key = await findKey(apiKey)

    if (!key) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid or revoked API key.",
        },
        { status: 401 }
      )
    }

    const id = new URL(req.url).searchParams.get("id") || ""

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Job id is required.",
        },
        { status: 400 }
      )
    }

    const job = await getJob(id)

    if (!job || job.keyHash !== key.keyHash) {
      return NextResponse.json(
        {
          ok: false,
          error: "Job not found.",
        },
        { status: 404 }
      )
    }

    // Job already finished
    if (
      job.status === "COMPLETED" ||
      job.status === "FAILED" ||
      job.status === "CANCELLED"
    ) {
      return NextResponse.json({
        ok: true,
        requestId: id,
        status: job.status,
        videoUrl: job.videoUrl || null,
        creditsRemaining: key.credits,
      })
    }

    // Ask fal.ai for the latest status
    const result = await getProviderStatus(id)

    const providerStatus = String(
      result.status || "UNKNOWN"
    ).toUpperCase()

    // Video completed successfully
    if (providerStatus === "COMPLETED") {
      await updateJob(id, {
        status: "COMPLETED",
        videoUrl: result.videoUrl || null,
        providerResponse: result.providerResponse,
      })
    }

    // Video generation failed
    else if (
      providerStatus === "FAILED" ||
      providerStatus === "CANCELLED" ||
      providerStatus === "ERROR"
    ) {
      if (!job.refunded) {
        const charged = Number(job.creditsCharged || 0)

        if (charged > 0) {
          await refundKey(apiKey, charged)
        }

        await updateJob(id, {
          status: "FAILED",
          refunded: true,
          providerResponse: result.providerResponse,
        })
      }
    }

    // Still processing
    else {
      await updateJob(id, {
        status: providerStatus,
        providerResponse: result.providerResponse,
      })
    }

    const freshKey = await findKey(apiKey)

    return NextResponse.json({
      ok: true,
      requestId: id,
      status: providerStatus,
      videoUrl: result.videoUrl || null,
      creditsRemaining: freshKey?.credits ?? null,
    })
  } catch (error) {
    console.error("VIDEO_STATUS_ERROR", error)

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to read video job status.",
      },
      { status: 500 }
    )
  }
}
