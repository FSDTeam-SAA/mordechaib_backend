export class RecallApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'RecallApiError';
  }

  get retryable() {
    return this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

export type RecallBot = {
  id: string;
  status_changes?: Array<{
    code?: string;
    sub_code?: string;
    message?: string;
    created_at?: string;
  }>;
  recordings?: RecallRecording[];
  [key: string]: unknown;
};

export type RecallRecording = {
  id: string;
  expires_at?: string | null;
  media_shortcuts?: {
    audio_mixed?: RecallMediaArtifact | null;
    transcript?: RecallMediaArtifact | null;
  };
  [key: string]: unknown;
};

export type RecallMediaArtifact = {
  id?: string;
  data?: { download_url?: string } | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RecallWebhookPayload = {
  event: string;
  data?: {
    data?: {
      code?: string;
      sub_code?: string | null;
      message?: string;
      updated_at?: string;
    };
    bot?: { id?: string; [key: string]: unknown };
    recording?: { id?: string; [key: string]: unknown };
    transcript?: { id?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
