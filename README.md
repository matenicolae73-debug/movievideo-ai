# ViralMovie API — production architecture

ViralMovie is the customer-facing API layer. It creates `vm_live_...` keys, tracks credits, validates requests, and keeps the underlying video-engine credential private.

## Architecture

Client → ViralMovie API key → rate limit → credit debit → fal.ai Vidu Q3 → video job → status polling → MP4 URL.

The provider credential is stored only server-side (`FAL_KEY`). Customers never receive it.

## Production requirements

- Persistent Upstash Redis REST URL/token are required.
- Stripe secret + webhook secret are required to sell credits.
- `FAL_KEY` is required for real AI video generation.
- Default video model: `fal-ai/vidu/q3/text-to-video/turbo`.
- `ALLOW_LOCAL_PROVIDER` is never used as a production fallback.
- Every generation request requires an `Idempotency-Key`.
- Credits are charged by generated second (5–8 seconds in the current public UI/API).
- Failed provider jobs refund the charged credits once.
- Video status requires the same ViralMovie API key and verifies job ownership.

The Vidu Q3 model supports text-to-video with duration, resolution, aspect ratio and audio controls; the exact model contract is documented by fal.ai. citeturn2search4turn2search7

## API

### Generate

`POST /api/v1/video/generate`

Headers:

`Authorization: Bearer vm_live_...`

`Idempotency-Key: unique-request-id`

Body:

```json
{
  "prompt": "cinematic coffee commercial in Rome",
  "duration": 5,
  "resolution": "720p",
  "aspectRatio": "16:9"
}
```

The response contains a provider `requestId`. Poll:

`GET /api/video/status?id=<requestId>`

with the same `Authorization` header.

## Pricing

- Starter — 100 credits — €9
- Pro — 500 credits — €29
- Business — 2,000 credits — €99

Credits are internal ViralMovie credits. Provider costs are never exposed to customers.

## Vercel secrets

Put secrets in Vercel Project Settings → Environment Variables, not in Git. Vercel documents environment variables as project-scoped settings and recommends sensitive production values be protected. citeturn0search1turn0search3

Required production variables:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `FAL_KEY`
- `FAL_VIDEO_MODEL=fal-ai/vidu/q3/text-to-video/turbo`
- `REQUIRE_PERSISTENCE=true`

Never prefix `FAL_KEY`, Stripe secrets, or Redis tokens with `NEXT_PUBLIC_` because public variables are embedded into browser JavaScript. citeturn0search1


## Credit pricing model

ViralMovie uses resolution-aware credits to protect margins: 360p/540p = 1 credit per second, 720p = 3 credits per second, 1080p = 4 credits per second. The underlying Vidu Q3 Turbo provider is usage-priced by output second, with higher pricing for 720p/1080p.

## Production checklist

1. Add `FAL_KEY` only to Vercel server-side Environment Variables. Never use `NEXT_PUBLIC_FAL_KEY`.
2. Add persistent Redis/Upstash variables and keep `REQUIRE_PERSISTENCE=true`.
3. Add live Stripe secret and webhook secret.
4. Deploy after saving environment variables.
5. Create a ViralMovie customer key; customers never receive the private provider key.
6. Test a 5-second 360p or 540p generation before enabling higher resolutions.
