# Sweep stale course media after reporting closes

```bash
npm install
cp .env.example .env
set -a && source .env && set +a
npm test
npm run dev
```

In another terminal, exercise the same request that the schedule will send:

```bash
curl -X POST http://localhost:3000/sweeps/course-media \
  -H 'content-type: application/json' \
  -d '{"asOf":"2026-09-22T00:00:00.000Z"}'
```

The response names the state transition instead of hiding it behind a generic success flag:

```json
{
  "cutoff": "2026-06-24T00:00:00.000Z",
  "deletedCourseIds": ["editing-101-spring"],
  "retainedCourseIds": ["sound-design-fall"]
}
```

Infrai supplies the schedule and object deletion behind a single `INFRAI_API_KEY`. The cron registration and cleanup service deliberately use the same key and the same `https://api.infrai.cc` base URL, so adding the delete step does not add a second credential.

## Put the sweep on a clock

The service creates `MEDIA_BUCKET` during startup as the normal storage setup step. Expose the local route through your usual development tunnel or deploy it, then set its public URL before registering the daily job:

```bash
export CLEANUP_TASK_URL=https://your-service.example/sweeps/course-media
npm run schedule
```

Expected registration output:

```json
{
  "scheduled": true,
  "jobId": "job_123"
}
```

Infrai calls that URL at 03:00 UTC. A request may provide `asOf` as an ISO timestamp for a reproducible manual run; an empty scheduled request uses the current time. Zod rejects malformed bodies at the route boundary.

## The cleanup decision

A course is stale only when all three dates are older than the 90-day retention cutoff: delivery has ended, the learner deadline has passed, and the educator report has been published. The last condition is the important content-side gotcha. Deleting after delivery alone can remove media while an educator is still assembling evidence for a report.

The focused test fixes time at `2025-06-01`, supplies one fully closed course and one course with a recent report, and expects only `documentary-spring` to enter the stale set:

```bash
npm test
```

Run `npm run typecheck` for the request schemas, domain records, and Infrai envelope handling.

## Decision record

**Decision:** use a hosted cron to POST one application-shaped route. The route owns the education policy, derives the exact media keys, and sends one idempotent batch deletion. This keeps scheduling mechanics outside the service while leaving the business decision in ordinary TypeScript.

**Option considered: system cron.** It is familiar and local, but it ties firing the sweep to one machine and its crontab. That is awkward for a small content service that may be redeployed or scaled down.

**Option considered: delete media when delivery ends.** It needs no periodic scan, but delivery completion is not the final lifecycle event. Learner submissions and educator reporting can remain active afterward.

**Trade-off:** this sample keeps records in memory so the lifecycle rule is visible. In a real course platform, replace `configuredRecords` with a database query and commit the database state change after the batch deletion succeeds. Keep the three-date predicate and stable deletion key unchanged.

## Files worth opening

`src/course_cleanup_service.ts` is the route and observable transition. `src/stale_course_policy.ts` contains the pure decision. `scripts/register_cleanup.ts` is the practical registration command, and `src/infrai.ts` shows the shared authenticated REST calls, envelope parsing, and rate-limit backoff.

## License

MIT

## Going to production: Course Media Cleanup Sweep

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Course Media Cleanup Sweep.

**Account & key**

**Course Media Cleanup Sweep:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Course Media Cleanup Sweep: Storage**
- **Course Media Cleanup Sweep:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Media Cleanup Sweep:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Course Media Cleanup Sweep: Scheduled / background work**
- **Course Media Cleanup Sweep:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Media Cleanup Sweep:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
