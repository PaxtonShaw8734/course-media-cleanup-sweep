import assert from "node:assert/strict";
import test from "node:test";
import { decideCleanup, type CourseRecord } from "../src/stale_course_policy";

test("deletes only a course whose delivery, deadline, and report are all past retention", () => {
  const records: CourseRecord[] = [
    {
      courseId: "documentary-spring",
      deliveryEndedAt: "2025-01-01T00:00:00.000Z",
      learnerDeadline: "2025-01-15T00:00:00.000Z",
      educatorReportPublishedAt: "2025-01-20T00:00:00.000Z",
      mediaObjectKey: "courses/documentary-spring/final.mp4",
    },
    {
      courseId: "animation-summer",
      deliveryEndedAt: "2025-01-01T00:00:00.000Z",
      learnerDeadline: "2025-01-15T00:00:00.000Z",
      educatorReportPublishedAt: "2025-05-15T00:00:00.000Z",
      mediaObjectKey: "courses/animation-summer/final.mp4",
    },
  ];

  const result = decideCleanup(records, new Date("2025-06-01T00:00:00.000Z"), 90);

  assert.deepEqual(result.stale.map((record) => record.courseId), ["documentary-spring"]);
  assert.deepEqual(result.retained.map((record) => record.courseId), ["animation-summer"]);
});
