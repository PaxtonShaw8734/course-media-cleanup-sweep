import { z } from "zod";
import { infrai } from "../src/infrai";

const taskUrl = z.string().url().parse(process.env.CLEANUP_TASK_URL);
const job = await infrai.cron.create({
  cron_expr: "0 3 * * *",
  task: taskUrl,
});

console.log(JSON.stringify({ scheduled: true, jobId: job.job_id }, null, 2));
