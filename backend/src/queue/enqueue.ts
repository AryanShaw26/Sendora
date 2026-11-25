import { emailQueue } from "./queue";
import { logger } from "../config/logger";

export interface EnqueueEmailItem {
  id: string;
  scheduledAt: Date;
}

export async function enqueueEmails(
  emails: EnqueueEmailItem[],
  chunkSize = 500,
): Promise<{ enqueued: number; failedIds: string[] }> {
  let enqueued = 0;
  const failedIds: string[] = [];

  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    try {
      const jobs = chunk.map((e) => {
        const delay = Math.max(0, e.scheduledAt.getTime() - Date.now());
        return {
          name: "send-email",
          data: { emailId: e.id },
          opts: {
            jobId: e.id,
            delay,
          },
        };
      });

      await emailQueue.addBulk(jobs);
      enqueued += chunk.length;
    } catch (err) {
      logger.error(
        { err, chunkStartIndex: i },
        "Bulk enqueue failed for chunk",
      );
      for (const item of chunk) {
        failedIds.push(item.id);
      }
    }
  }

  return { enqueued, failedIds };
}
