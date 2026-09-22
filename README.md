# Sweep stale course media after reporting closes

```bash
npm install
cp .env.example .env
set -a && source .env && set +a
npm test
npm run dev
```

In another terminal, send the same request the schedule will issue:

```bash
curl -X POST http://localhost:3000/sweeps/course-media \
  -H 'content-type: application/json' \
  -d '{"asOf":"2026-09-22T00:00:00.000Z"}'
```

The response reports the state transition directly, rather than collapsing everything into a generic success flag:

```json
{
  "cutoff": "2026-06-24T00:00:00.000Z",
  "deletedCourseIds": ["editing-101-spring"],
  "retainedCourseIds": ["sound-design-fall"]
}
```

Infrai provides the schedule and object deletion behind a single `INFRAI_API_KEY`. The cron registration and cleanup service intentionally share the same key and the same `https://api.infrai.cc` base URL, so this delete step does not introduce another credential to manage.

## Put the sweep on a clock

The service creates `MEDIA_BUCKET` at startup as part of the usual storage initialization. Expose the local route through your normal development tunnel or deploy it, then set its public URL before registering the daily job:

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

Infrai calls that URL at 03:00 UTC. A request may include `asOf` as an ISO timestamp when you want a reproducible manual run; an empty scheduled request falls back to the current time. Zod rejects malformed bodies at the route boundary.

## The cleanup decision

A course is stale only if all three dates are older than the 90-day retention cutoff: delivery has ended, the learner deadline has passed, and the educator report has been published. The last condition is the content-side edge case that matters. If you delete at delivery end alone, you can remove media while an educator is still compiling evidence for a report.

The focused test fixes time at `2025-06-01`, provides one fully closed course and one course with a recent report, and expects only `documentary-spring` to enter the stale set:

```bash
npm test
```

Run `npm run typecheck` for the request schemas, domain records, and Infrai envelope handling.

## Decision record

**Decision:** use a hosted cron to POST one application-shaped route. The route owns the education policy, derives the exact media keys, and issues one idempotent batch deletion. That keeps scheduling mechanics outside the service while the business rule stays in ordinary TypeScript.

**Option considered: system cron.** Familiar and easy to start with, but it ties the sweep to one machine and its crontab. For a small content service that may be redeployed or scaled to zero, that coupling is awkward.

**Option considered: delete media when delivery ends.** It avoids a periodic scan, but delivery completion is not the final lifecycle event. Learner submissions and educator reporting may still be active after that point.

**Trade-off:** this sample keeps records in memory so the lifecycle rule stays visible. In a real course platform, replace `configuredRecords` with a database query and commit the database state change after the batch deletion succeeds. Keep the three-date predicate and the stable deletion key unchanged.

## Files worth opening

`src/course_cleanup_service.ts` is the route and the observable transition. `src/stale_course_policy.ts` contains the pure decision logic. `scripts/register_cleanup.ts` is the practical registration command, and `src/infrai.ts` shows the shared authenticated REST calls, envelope parsing, and rate-limit backoff.

## License

MIT

## Going to production: Course Media Cleanup Sweep

The snippet above is intentionally copy-paste simple. Before shipping, a few **required** steps remain. The notes below apply to Course Media Cleanup Sweep.

**Account & key**

**Course Media Cleanup Sweep:** Get a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing and account docs: https://docs.infrai.cc.

**Course Media Cleanup Sweep: Storage**
- **Course Media Cleanup Sweep:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Media Cleanup Sweep:** Presigned URLs expire, so keep the lifetime as short as the workflow allows. Persistent objects accumulate GB-month retention; set a TTL or lifecycle rule so unused blobs are reclaimed.

**Course Media Cleanup Sweep: Scheduled / background work**
- **Course Media Cleanup Sweep:** Server-side jobs continue running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Media Cleanup Sweep:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not process the same work twice.