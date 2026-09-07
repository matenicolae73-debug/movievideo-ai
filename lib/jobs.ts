function cfg() {
  return {
    url:
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL,

    token:
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN,
  }
}

async function redis(cmd: any[]) {
  const c = cfg()

  if (!c.url || !c.token) {
    return null
  }

  const response = await fetch(c.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Job store unavailable")
  }

  const data = await response.json()
  return data.result
}

export async function saveJob(
  requestId: string,
  keyHash: string,
  creditsCharged = 0
) {
  const c = cfg()

  if (!c.url || !c.token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Persistent Redis storage is required in production."
      )
    }

    return true
  }

  const job = {
    keyHash,
    status: "IN_QUEUE",
    createdAt: new Date().toISOString(),
    refunded: false,
    creditsCharged: Number(creditsCharged) || 0,
    videoUrl: null,
  }

  await redis([
    "HSET",
    "viralmovie:jobs",
    requestId,
    JSON.stringify(job),
  ])

  return true
}

export async function getJob(requestId: string) {
  const c = cfg()

  if (!c.url || !c.token) {
    return null
  }

  const raw = await redis([
    "HGET",
    "viralmovie:jobs",
    requestId,
  ])

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function updateJob(
  requestId: string,
  patch: Record<string, unknown>
) {
  const job = await getJob(requestId)

  if (!job) {
    return null
  }

  const next = {
    ...job,
    ...patch,
  }

  const c = cfg()

  if (c.url && c.token) {
    await redis([
      "HSET",
      "viralmovie:jobs",
      requestId,
      JSON.stringify(next),
    ])
  }

  return next
}
