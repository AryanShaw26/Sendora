import axios, { AxiosError } from 'axios';
import {
  User,
  Email,
  PaginatedResponse,
  Campaign,
  Sender,
  ScheduleRequest,
  ScheduleResponse,
  SlackStatus,
  ApiError,
} from '../types';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: ApiError }>) => {
    // If unauthorized on any endpoint other than /api/me, redirect to /login
    if (error.response?.status === 401 && !error.config?.url?.includes('/api/me')) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    const normalizedMessage =
      error.response?.data?.error?.message ||
      error.message ||
      'An unexpected error occurred. Please try again.';

    return Promise.reject(new Error(normalizedMessage));
  }
);

// Auth endpoints
export const getMe = async (): Promise<User> => {
  const { data } = await apiClient.get<User>('/api/me');
  return data;
};

export const logout = async (): Promise<void> => {
  await apiClient.post('/auth/logout');
};

// Schedule endpoints
export const scheduleEmails = async (payload: ScheduleRequest): Promise<ScheduleResponse> => {
  const { data } = await apiClient.post<ScheduleResponse>('/api/schedule', payload);
  return data;
};

// Emails endpoints
export const getEmails = async (params: {
  status: 'scheduled' | 'sent';
  page?: number;
  limit?: number;
  campaignId?: string;
}): Promise<PaginatedResponse<Email>> => {
  const { data } = await apiClient.get<PaginatedResponse<Email>>('/api/emails', { params });
  return data;
};

export const searchEmails = async (params: {
  q: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Email>> => {
  const { data } = await apiClient.get<PaginatedResponse<Email>>('/api/emails/search', { params });
  return data;
};

// Campaigns endpoints
export const getCampaigns = async (): Promise<{ items: Campaign[] }> => {
  const { data } = await apiClient.get<{ items: Campaign[] }>('/api/campaigns');
  return data;
};

// Senders endpoints
export const getSenders = async (): Promise<{ items: Sender[] }> => {
  const { data } = await apiClient.get<{ items: Sender[] }>('/api/senders');
  return data;
};

// Slack endpoints
export const getSlackConnectUrl = async (): Promise<{ url: string }> => {
  const { data } = await apiClient.get<{ url: string }>('/api/slack/connect');
  return data;
};

export const getSlackStatus = async (): Promise<SlackStatus> => {
  const { data } = await apiClient.get<SlackStatus>('/api/slack/status');
  return data;
};

export const disconnectSlack = async (): Promise<void> => {
  await apiClient.delete('/api/slack');
};

export const sendTestSlackAlert = async (): Promise<void> => {
  await apiClient.post('/api/slack/test');
};
