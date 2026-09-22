import { createServer, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { z } from "zod";
import { infrai, InfraiError } from "./infrai";
import { courseRecordSchema, decideCleanup, type CourseRecord } from "./stale_course_policy";

const sweepRequestSchema = z.object({
  asOf: z.string().datetime().optional(),
});

const configuredRecords = z.array(courseRecordSchema).parse([
  {
    courseId: "editing-101-spring",
    deliveryEndedAt: "2025-02-01T00:00:00.000Z",
    learnerDeadline: "2025-02-15T00:00:00.000Z",
    educatorReportPublishedAt: "2025-02-20T00:00:00.000Z",
    mediaObjectKey: "courses/editing-101-spring/render.mp4",
  },
  {
    courseId: "sound-design-fall",
    deliveryEndedAt: "2026-08-01T00:00:00.000Z",
    learnerDeadline: "2026-10-01T00:00:00.000Z",
    educatorReportPublishedAt: "2026-08-20T00:00:00.000Z",
    mediaObjectKey: "courses/sound-design-fall/render.mp4",
  },
]);

let records: CourseRecord[] = [...configuredRecords];
const bucket = process.env.MEDIA_BUCKET ?? "course-delivery-media";
const retentionDays = Number(process.env.RETENTION_DAYS ?? "90");

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export async function runSweep(asOf: Date): Promise<ReturnType<typeof decideCleanup>> {
  const decision = decideCleanup(records, asOf, retentionDays);
  if (decision.stale.length > 0) {
    const keys = decision.stale.map((record) => record.mediaObjectKey);
    const idempotencyKey = createHash("sha256")
      .update(`${decision.cutoff}:${keys.slice().sort().join("|")}`)
      .digest("hex");
    await infrai.storage.object.delete_batch(bucket, {
      keys,
      idempotency_key: idempotencyKey,
    });
    records = decision.retained;
  }
  return decision;
}

export async function start(): Promise<void> {
  await infrai.storage.bucket.create({
    name: bucket,
  });
  const port = Number(process.env.PORT ?? "3000");
  createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/sweeps/course-media") {
      send(response, 404, { error: "route_not_found" });
      return;
    }
    try {
      const input = sweepRequestSchema.parse(await readJson(request));
      const result = await runSweep(input.asOf ? new Date(input.asOf) : new Date());
      send(response, 200, {
        cutoff: result.cutoff,
        deletedCourseIds: result.stale.map((record) => record.courseId),
        retainedCourseIds: result.retained.map((record) => record.courseId),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        send(response, 400, { error: "invalid_request", issues: error.issues });
        return;
      }
      if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        send(response, status, { error: error.code, message: error.message });
        return;
      }
      send(response, 500, { error: "sweep_failed" });
    }
  }).listen(port, () => console.log(`Course cleanup listening on http://localhost:${port}`));
}

if (process.env.NODE_ENV !== "test") await start();
