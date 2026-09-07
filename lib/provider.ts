import { fal } from "@fal-ai/client"
import crypto from "crypto"

export type VideoJob = {
  requestId: string
  status: string
  videoUrl?: string | null
  providerResponse?: unknown
}

type Input = {
  prompt: string
  duration: number
  resolution: string
  aspectRatio: string
}

const MODEL =
  process.env.FAL_VIDEO_MODEL ||
  "fal-ai/vidu/q3/text-to-video/turbo"

function configure() {
  const key = process.env.FAL_KEY

  if (!key) {
    throw new Error(
      "Video engine is not configured. Add FAL_KEY in Vercel Environment Variables."
    )
  }

  fal.config({
    credentials: key,
  })
}

function extractVideoUrl(data: any): string | null {
  const candidates = [
    data?.video?.url,
    data?.video_url,
    data?.videoUrl,
    data?.url,
    data?.output?.video?.url,
    data?.output?.url,
  ]

  return (
    candidates.find(
      (value: any) =>
        typeof value === "string" && value.length > 0
    ) || null
  )
}

export async function generateWithProvider(
  input: Input
): Promise<VideoJob> {
  // Local mode is only for development/testing.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.VIDEO_PROVIDER_MODE === "local"
  ) {
    return {
      requestId: crypto.randomUUID(),
      status: "LOCAL_RENDER",
      videoUrl: null,
      providerResponse: {
        provider: "viralMovie-local",
        ...input,
      },
    }
  }

  configure()

  const duration = Math.min(
    8,
    Math.max(1, Math.round(input.duration))
  )

  const resolution = [
    "360p",
    "540p",
    "720p",
    "1080p",
  ].includes(input.resolution)
    ? input.resolution
    : "720p"

  const aspectRatio = [
    "16:9",
    "9:16",
    "1:1",
  ].includes(input.aspectRatio)
    ? input.aspectRatio
    : "16:9"

  try {
    const response = await fal.queue.submit(MODEL, {
      input: {
        prompt: input.prompt,
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        audio: true,
      },
    })

    const requestId = response?.request_id

    if (!requestId) {
      throw new Error(
        "Video provider did not return a request ID."
      )
    }

    return {
      requestId,
      status: "IN_QUEUE",
      videoUrl: null,
      providerResponse: {
        provider: "fal",
        model: MODEL,
      },
    }
  } catch (error: any) {
    console.error("FAL_SUBMIT_ERROR", error)

    throw new Error(
      error?.message ||
        "Unable to start video generation with the video provider."
    )
  }
}

export async function getProviderStatus(
  requestId: string
) {
  configure()

  try {
    const status = await fal.queue.status(MODEL, {
      requestId,
      logs: false,
    })

    const normalized = String(
      status?.status || "UNKNOWN"
    ).toUpperCase()

    if (normalized === "COMPLETED") {
      const result = await fal.queue.result(MODEL, {
        requestId,
      })

      const videoUrl = extractVideoUrl(result?.data)

      return {
        status: normalized,
        videoUrl,
        providerResponse: {
          provider: "fal",
          model: MODEL,
        },
      }
    }

    return {
      status: normalized,
      videoUrl: null,
      providerResponse: {
        provider: "fal",
        model: MODEL,
      },
    }
  } catch (error: any) {
    console.error("FAL_STATUS_ERROR", error)

    throw new Error(
      error?.message ||
        "Unable to read video generation status."
    )
  }
}
