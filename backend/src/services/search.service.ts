import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../db/prisma";

export const esClient = new Client({
  node: env.ELASTICSEARCH_NODE,
  ...(env.ELASTICSEARCH_USERNAME
    ? {
        auth: {
          username: env.ELASTICSEARCH_USERNAME,
          password: env.ELASTICSEARCH_PASSWORD,
        },
      }
    : {}),
});

export async function pingElasticsearch(): Promise<boolean> {
  if (!env.ELASTICSEARCH_ENABLED) {
    return false;
  }
  try {
    return await esClient.ping();
  } catch (err) {
    logger.warn({ err }, "Elasticsearch ping failed");
    return false;
  }
}

export async function ensureIndex(): Promise<void> {
  if (!env.ELASTICSEARCH_ENABLED) {
    return;
  }
  try {
    const exists = await esClient.indices.exists({
      index: env.ELASTICSEARCH_INDEX,
    });
    if (!exists) {
      await esClient.indices.create({
        index: env.ELASTICSEARCH_INDEX,
        mappings: {
          properties: {
            id: { type: "keyword" },
            userId: { type: "keyword" },
            campaignId: { type: "keyword" },
            recipient: { type: "text", fields: { raw: { type: "keyword" } } },
            subject: { type: "text" },
            body: { type: "text" },
            status: { type: "keyword" },
            senderEmail: { type: "keyword" },
            scheduledAt: { type: "date" },
            sentAt: { type: "date" },
            errorMessage: { type: "text" },
          },
        },
      });
      logger.info(
        { index: env.ELASTICSEARCH_INDEX },
        "Created Elasticsearch index",
      );
    }
  } catch (err) {
    logger.warn(
      { err },
      "Failed to ensure Elasticsearch index; continuing without blocking",
    );
  }
}

export async function indexEmails(
  emails: Array<{
    id: string;
    userId: string;
    campaignId: string;
    recipient: string;
    subject: string;
    body: string;
    status: string;
    senderEmail?: string;
    scheduledAt: Date;
    sentAt?: Date | null;
    errorMessage?: string | null;
  }>,
): Promise<void> {
  if (!env.ELASTICSEARCH_ENABLED) return;
  if (emails.length === 0) return;
  try {
    const operations = emails.flatMap((doc) => [
      { index: { _index: env.ELASTICSEARCH_INDEX, _id: doc.id } },
      {
        id: doc.id,
        userId: doc.userId,
        campaignId: doc.campaignId,
        recipient: doc.recipient,
        subject: doc.subject,
        body: doc.body,
        status: doc.status,
        senderEmail: doc.senderEmail,
        scheduledAt: doc.scheduledAt.toISOString(),
        sentAt: doc.sentAt ? doc.sentAt.toISOString() : null,
        errorMessage: doc.errorMessage || null,
      },
    ]);
    const response = await esClient.bulk({ refresh: true, operations });
    if (response.errors) {
      logger.warn("Some documents failed to index in Elasticsearch");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to bulk index emails into Elasticsearch");
  }
}

export async function updateEmailInIndex(
  id: string,
  partial: Partial<{
    status: string;
    sentAt: Date | null;
    scheduledAt: Date;
    errorMessage: string | null;
  }>,
): Promise<void> {
  if (!env.ELASTICSEARCH_ENABLED) return;
  try {
    const doc: Record<string, unknown> = {};
    if (partial.status !== undefined) doc.status = partial.status;
    if (partial.sentAt !== undefined)
      doc.sentAt = partial.sentAt ? partial.sentAt.toISOString() : null;
    if (partial.scheduledAt !== undefined)
      doc.scheduledAt = partial.scheduledAt.toISOString();
    if (partial.errorMessage !== undefined)
      doc.errorMessage = partial.errorMessage;

    await esClient.update({
      index: env.ELASTICSEARCH_INDEX,
      id,
      doc,
      doc_as_upsert: true,
      refresh: true,
    });
  } catch (err) {
    logger.warn(
      { err, emailId: id },
      "Failed to update email in Elasticsearch index",
    );
  }
}

export async function searchEmails(params: {
  userId: string;
  q: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  if (!env.ELASTICSEARCH_ENABLED) {
    throw new Error("Elasticsearch search is disabled");
  }
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const from = (page - 1) * limit;

  const must: Record<string, unknown>[] = [
    {
      multi_match: {
        query: params.q,
        fields: ["recipient^2", "subject^2", "body"],
        fuzziness: "AUTO",
      },
    },
  ];

  const filter: Record<string, unknown>[] = [
    { term: { userId: params.userId } },
  ];

  const activeCampaigns = await prisma.campaign.findMany({
    where: { userId: params.userId, archivedAt: null },
    select: { id: true },
  });
  const activeCampaignIds = activeCampaigns.map((campaign) => campaign.id);
  if (activeCampaignIds.length === 0) {
    return { items: [], total: 0 };
  }
  filter.push({ terms: { campaignId: activeCampaignIds } });

  if (params.status) {
    filter.push({ term: { status: params.status } });
  }

  const response = await esClient.search({
    index: env.ELASTICSEARCH_INDEX,
    from,
    size: limit,
    query: {
      bool: {
        must,
        filter,
      },
    },
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : (response.hits.total?.value ?? 0);

  const items = response.hits.hits.map(
    (hit) => hit._source as Record<string, unknown>,
  );

  return { items, total };
}
