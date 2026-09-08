import { NextResponse } from "next/server"
import { consumeKey, refundKey } from "@/lib/store"
import { generateWithProvider } from "@/lib/provider"
import {
  claimIdempotency,
  idempotencyHash,
  releaseIdempotency,
} from "@/lib/idempotency"
import { rateLimit } from "@/lib/rate-limit"
import { saveJob } from "@/lib/jobs"

export const runtime = "nodejs"

function getBearerKey(req: Request): string | null {
  const auth = req.headers.get("authorization") || ""

  if (!/^Bearer\s+vm_live_[a-f0-9]{48}$/i.test(auth)) {
    return null
  }

  return auth.replace(/^Bearer\s+/i, "").trim()
}

export async function POST(req: Request) {
  let idemKey = ""
  let customerKey = ""

  try {
    // 1. Verify ViralMovie API key
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

    customerKey = apiKey

    // 2. Rate limit
    const forwardedFor =
      req.headers.get("x-forwarded-for") || "unknown"

    const rl = await rateLimit(
      `video:${idempotencyHash(customerKey, forwardedFor)}`,
      30,
      60
    )

    if (!rl.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many video requests. Try again later.",
        },
        { status: 429 }
      )
    }

    // 3. Idempotency
    const idem = (
      req.headers.get("idempotency-key") || ""
    ).trim()

    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idem)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Idempotency-Key header is required (8-128 safe characters).",
        },
        { status: 400 }
      )
    }

    idemKey = idempotencyHash(customerKey, idem)

    const claimed = await claimIdempotency(idemKey)

    if (!claimed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This request has already been accepted. Use a new Idempotency-Key.",
        },
        { status: 409 }
      )
    }

    // 4. Read request body
    const body = await req.json()

    const prompt = String(body?.prompt || "").trim()

    if (!prompt || prompt.length > 2000) {
      await releaseIdempotency(idemKey)

      return NextResponse.json(
        {
          ok: false,
          error:
            "Prompt is required and must be 1-2000 characters.",
        },
        { status: 400 }
      )
    }

    // 5. Duration
    const requestedDuration = Number(body?.duration)

    const duration = Number.isFinite(requestedDuration)
      ? Math.min(
          8,
          Math.max(1, Math.round(requestedDuration))
        )
      : 3

    // 6. Resolution
    const resolution = [
      "360p",
      "540p",
      "720p",
      "1080p",
    ].includes(body?.resolution)
      ? body.resolution
      : "720p"

    // 7. Aspect ratio
    const aspectRatio = [
      "16:9",
      "9:16",
      "1:1",
    ].includes(body?.aspectRatio)
      ? body.aspectRatio
      : "16:9"

    // 8. Calculate credits
    const creditsPerSecond =
      resolution === "1080p"
        ? 4
        : resolution === "720p"
          ? 3
          : 1

    const creditCost =
      duration * creditsPerSecond

    // 9. Charge credits
    const debit = await consumeKey(
      customerKey,
      creditCost
    )

    if (!debit.ok) {
      await releaseIdempotency(idemKey)

      return NextResponse.json(
        debit,
        { status: 402 }
      )
    }

    // 10. Generate video
    try {
      const job = await generateWithProvider({
        prompt,
        duration,
        resolution,
        aspectRatio,
      })

      // 11. Save job in Redis
      if (job.status !== "LOCAL_RENDER") {
        await saveJob(
          job.requestId,
          debit.key?.keyHash || "",
          creditCost
        )
      }

      // 12. Return result
      return NextResponse.json({
        ok: true,

        requestId: job.requestId,

        status: job.status,

        videoUrl:
          job.videoUrl || null,

        creditsRemaining:
          debit.key?.credits ?? null,

        creditsCharged:
          creditCost,

        render: {
          durationSeconds:
            duration,

          resolution,

          aspectRatio,

          prompt,
        },
      })
    } catch (error) {
      // Provider failed -> refund credits
      await refundKey(
        customerKey,
        creditCost
      )

      await releaseIdempotency(
        idemKey
      )

      throw error
    }
  } catch (error) {
    console.error(
      "VIDEO_GENERATION_ERROR",
      error
    )

    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Video generation failed."

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
