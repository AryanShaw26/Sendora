export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Email {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  senderEmail: string;
  previewUrl: string | null;
  errorMessage: string | null;
  deferredCount: number;
  body?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface CampaignCounts {
  scheduled: number;
  processing: number;
  sent: number;
  failed: number;
}

export interface Campaign {
  id: string;
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
  totalEmails: number;
  createdAt: string;
  counts: CampaignCounts;
}

export interface Sender {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  smtpHost?: string;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  emails: string[];
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  campaignId: string;
  total: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
  queueStatus: 'queued' | 'pending_reconciliation';
  persisted: boolean;
}

export interface SlackStatus {
  connected: boolean;
  teamName?: string | null;
  channelName?: string | null;
}

export interface ApiError {
  code: string;
  message: string;
}
