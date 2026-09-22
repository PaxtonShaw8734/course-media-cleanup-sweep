import { z } from "zod";

export const courseRecordSchema = z.object({
  courseId: z.string().min(1),
  deliveryEndedAt: z.string().datetime(),
  learnerDeadline: z.string().datetime(),
  educatorReportPublishedAt: z.string().datetime(),
  mediaObjectKey: z.string().min(1),
});

export type CourseRecord = z.infer<typeof courseRecordSchema>;

export type CleanupDecision = {
  stale: CourseRecord[];
  retained: CourseRecord[];
  cutoff: string;
};

export function decideCleanup(
  records: CourseRecord[],
  asOf: Date,
  retentionDays: number,
): CleanupDecision {
  const cutoffDate = new Date(asOf.getTime() - retentionDays * 86_400_000);
  const isBeforeCutoff = (value: string) => new Date(value).getTime() < cutoffDate.getTime();
  const stale = records.filter(
    (record) =>
      isBeforeCutoff(record.deliveryEndedAt) &&
      isBeforeCutoff(record.learnerDeadline) &&
      isBeforeCutoff(record.educatorReportPublishedAt),
  );
  const staleIds = new Set(stale.map((record) => record.courseId));

  return {
    stale,
    retained: records.filter((record) => !staleIds.has(record.courseId)),
    cutoff: cutoffDate.toISOString(),
  };
}
