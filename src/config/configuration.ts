function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function booleanValue(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
}

export default () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const accessSecret =
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_SECRET ||
    'change-this-secret';

  if (
    nodeEnv === 'production' &&
    [
      'change-this-secret',
      'replace-with-at-least-32-random-characters',
    ].includes(accessSecret)
  ) {
    throw new Error('JWT_ACCESS_SECRET must be configured in production');
  }

  if (nodeEnv === 'production' && accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
  }

  const exposeDevelopmentTokens = process.env.AUTH_EXPOSE_DEVELOPMENT_TOKENS;
  const smtpPort = Number(
    process.env.SMTP_PORT || process.env.EMAIL_PORT || 587,
  );
  const smtpSecure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : smtpPort === 465;
  const recallRegion = (process.env.RECALLAI_REGION || 'us-west-2').trim();
  const recallApiKey = process.env.RECALLAI_API_KEY?.trim();
  const recallWebhookSecret = process.env.RECALLAI_WEBHOOK_SECRET?.trim();
  const signedInZoom = booleanValue(process.env.RECALLAI_SIGNED_IN_ZOOM, true);
  const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5000')
    .trim()
    .replace(/\/+$/, '');
  const transcriptionMode = (
    process.env.RECALLAI_TRANSCRIPTION_MODE || 'POST_MEETING'
  ).trim();
  const recordingOutput = (
    process.env.RECALLAI_RECORDING_OUTPUT || 'TRANSCRIPT_AND_AUDIO'
  ).trim();
  const audioStorageProvider = (
    process.env.AUDIO_STORAGE_PROVIDER || 'RECALL'
  ).trim();
  const transcriptStorage = (
    process.env.TRANSCRIPT_STORAGE || 'MONGODB'
  ).trim();
  const zoomOAuthRedirectUri =
    process.env.ZOOM_OAUTH_REDIRECT_URI ||
    `${appBaseUrl}/api/v1/zoom-meetings/oauth/callback`;
  const recallApiBaseUrl = (
    process.env.RECALLAI_API_BASE_URL || `https://${recallRegion}.recall.ai`
  ).replace(/\/+$/, '');
  const frontendUrl = (
    process.env.FRONTEND_URL ||
    (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',')[0]
  )
    .trim()
    .replace(/\/+$/, '');
  const googleOAuthRedirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${appBaseUrl}/api/v1/google-meetings/oauth/callback`;
  const googleOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const googleOAuthClientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const microsoftOAuthClientId = process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
  const microsoftOAuthClientSecret =
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim();
  const microsoftOAuthTenant =
    process.env.MICROSOFT_OAUTH_TENANT?.trim() || 'common';
  const microsoftOAuthRedirectUri =
    process.env.MICROSOFT_OAUTH_REDIRECT_URI ||
    `${appBaseUrl}/api/v1/calendar/outlook/oauth/callback`;
  const meetingOAuthStateSecret =
    process.env.MEETING_OAUTH_STATE_SECRET ||
    process.env.RECALLAI_OAUTH_STATE_SECRET ||
    accessSecret;

  if (Boolean(googleOAuthClientId) !== Boolean(googleOAuthClientSecret)) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be configured together',
    );
  }
  if (Boolean(microsoftOAuthClientId) !== Boolean(microsoftOAuthClientSecret)) {
    throw new Error(
      'MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET must be configured together',
    );
  }
  if (
    microsoftOAuthClientId &&
    microsoftOAuthRedirectUri !==
      `${appBaseUrl}/api/v1/calendar/outlook/oauth/callback`
  ) {
    throw new Error(
      'MICROSOFT_OAUTH_REDIRECT_URI must match the callback under APP_BASE_URL',
    );
  }
  if (
    googleOAuthClientId &&
    googleOAuthRedirectUri !==
      `${appBaseUrl}/api/v1/google-meetings/oauth/callback`
  ) {
    throw new Error(
      'GOOGLE_OAUTH_REDIRECT_URI must match the callback under APP_BASE_URL',
    );
  }

  if (
    recallApiKey &&
    !['us-west-2', 'us-east-1', 'eu-central-1', 'ap-northeast-1'].includes(
      recallRegion,
    )
  ) {
    throw new Error('RECALLAI_REGION is invalid');
  }

  if (recallApiKey && transcriptionMode !== 'POST_MEETING') {
    throw new Error(
      'The meeting bot integration currently supports RECALLAI_TRANSCRIPTION_MODE=POST_MEETING',
    );
  }
  if (recallApiKey && recordingOutput !== 'TRANSCRIPT_AND_AUDIO') {
    throw new Error(
      'The meeting bot integration currently supports RECALLAI_RECORDING_OUTPUT=TRANSCRIPT_AND_AUDIO',
    );
  }
  if (recallApiKey && audioStorageProvider !== 'RECALL') {
    throw new Error(
      'AUDIO_STORAGE_PROVIDER must remain RECALL until the S3 adapter is enabled',
    );
  }
  if (recallApiKey && transcriptStorage !== 'MONGODB') {
    throw new Error('TRANSCRIPT_STORAGE must be MONGODB');
  }

  if (recallApiKey) {
    let publicUrl: URL;
    try {
      publicUrl = new URL(appBaseUrl);
    } catch {
      throw new Error('APP_BASE_URL must be a valid absolute URL');
    }
    if (publicUrl.hostname.endsWith('.recall.ai')) {
      throw new Error(
        'APP_BASE_URL must point to this backend, not the Recall.ai API',
      );
    }
    if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
      throw new Error('APP_BASE_URL must contain only the public URL origin');
    }
    if (
      signedInZoom &&
      zoomOAuthRedirectUri !==
        `${appBaseUrl}/api/v1/zoom-meetings/oauth/callback`
    ) {
      throw new Error(
        'ZOOM_OAUTH_REDIRECT_URI must match the callback under APP_BASE_URL',
      );
    }
  }

  if (nodeEnv === 'production' && recallApiKey) {
    const requiredRecallValues = {
      RECALLAI_WEBHOOK_SECRET: recallWebhookSecret,
      REDIS_URL: process.env.REDIS_URL,
      INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY,
      ...(signedInZoom
        ? {
            ZOOM_OAUTH_CLIENT_ID: process.env.ZOOM_OAUTH_CLIENT_ID,
            RECALLAI_ZOOM_OAUTH_APP_ID: process.env.RECALLAI_ZOOM_OAUTH_APP_ID,
          }
        : {}),
    };
    const missing = Object.entries(requiredRecallValues)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length) {
      throw new Error(
        `Recall.ai production configuration is missing: ${missing.join(', ')}`,
      );
    }
    if (!recallWebhookSecret?.startsWith('whsec_')) {
      throw new Error('RECALLAI_WEBHOOK_SECRET must start with whsec_');
    }
    if (!appBaseUrl.startsWith('https://')) {
      throw new Error('APP_BASE_URL must use HTTPS in production');
    }
    if ((process.env.INTEGRATION_ENCRYPTION_KEY || '').length < 32) {
      throw new Error(
        'INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters',
      );
    }
    if ((process.env.RECALLAI_OAUTH_STATE_SECRET || accessSecret).length < 32) {
      throw new Error(
        'RECALLAI_OAUTH_STATE_SECRET must contain at least 32 characters',
      );
    }
  }

  if (nodeEnv === 'production' && meetingOAuthStateSecret.length < 32) {
    throw new Error(
      'MEETING_OAUTH_STATE_SECRET must contain at least 32 characters',
    );
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: Number(process.env.PORT || 5000),
    APP_BASE_URL: appBaseUrl,
    RECORDING_STORAGE_DIR:
      process.env.RECORDING_STORAGE_DIR || './storage/recordings',

    cors: {
      origins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    },

    database: {
      mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/noltra',
    },

    jwt: {
      accessSecret,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    },

    auth: {
      refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
      rememberMeRefreshExpiresIn:
        process.env.REMEMBER_ME_REFRESH_TOKEN_EXPIRES_IN || '30d',
      passwordResetExpiresIn: process.env.PASSWORD_RESET_EXPIRES_IN || '1h',
      emailVerificationExpiresIn:
        process.env.EMAIL_VERIFICATION_EXPIRES_IN || '24h',
      bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
      exposeDevelopmentTokens:
        exposeDevelopmentTokens === undefined
          ? nodeEnv !== 'production'
          : exposeDevelopmentTokens === 'true',
    },

    mail: {
      // SMTP_* is the preferred naming. EMAIL_* is supported for existing
      // deployments that already use the older names.
      host: process.env.SMTP_HOST || process.env.EMAIL_HOST,
      port: smtpPort,
      secure: smtpSecure,
      user:
        process.env.SMTP_USER ||
        process.env.EMAIL_USER ||
        process.env.EMAIL_ADDRESS,
      password: process.env.SMTP_PASSWORD || process.env.EMAIL_PASS,
      from:
        process.env.MAIL_FROM ||
        process.env.EMAIL_FROM ||
        process.env.EMAIL_ADDRESS ||
        'Noltra AI <no-reply@noltra.ai>',
      supportEmail: process.env.SUPPORT_EMAIL,
      frontendUrl,
    },

    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      defaultNumber: process.env.TWILIO_PHONE_NUMBER,
      liveMode: process.env.TWILIO_LIVE_MODE === 'true',
    },

    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },

    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },

    meta: {
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v23.0',
      oauthRedirectUri:
        process.env.META_OAUTH_REDIRECT_URI ||
        `${process.env.APP_BASE_URL || 'http://localhost:5000'}/api/v1/meta/callback`,
      stateSecret: process.env.META_OAUTH_STATE_SECRET || accessSecret,
      encryptionKey:
        process.env.INTEGRATION_ENCRYPTION_KEY ||
        'replace-with-at-least-32-random-characters',
    },

    integrations: {
      encryptionKey:
        process.env.INTEGRATION_ENCRYPTION_KEY ||
        'replace-with-at-least-32-random-characters',
    },

    recall: {
      apiKey: recallApiKey,
      region: recallRegion,
      apiBaseUrl: recallApiBaseUrl,
      webhookSecret: recallWebhookSecret,
      botName: process.env.RECALLAI_BOT_NAME || 'Noltra AI Notetaker',
      transcriptionMode,
      recordingOutput,
      retentionHours: positiveInteger(
        process.env.RECALLAI_RETENTION_HOURS,
        168,
        'RECALLAI_RETENTION_HOURS',
      ),
      consentMessage:
        process.env.RECALLAI_CONSENT_MESSAGE ||
        'This meeting is being recorded and transcribed by Noltra AI.',
      maxConcurrentMeetings: positiveInteger(
        process.env.RECALLAI_MAX_CONCURRENT_MEETINGS,
        100,
        'RECALLAI_MAX_CONCURRENT_MEETINGS',
      ),
      maxConcurrentMeetingsPerOrganization: positiveInteger(
        process.env.RECALLAI_MAX_CONCURRENT_MEETINGS_PER_ORG,
        10,
        'RECALLAI_MAX_CONCURRENT_MEETINGS_PER_ORG',
      ),
      encryptionKey:
        process.env.INTEGRATION_ENCRYPTION_KEY ||
        'replace-with-at-least-32-random-characters',
      oauthStateSecret: process.env.RECALLAI_OAUTH_STATE_SECRET || accessSecret,
      zoom: {
        signedIn: signedInZoom,
        clientId: process.env.ZOOM_OAUTH_CLIENT_ID,
        oauthAppId: process.env.RECALLAI_ZOOM_OAUTH_APP_ID,
        redirectUri: zoomOAuthRedirectUri,
      },
      googleMeet: {
        loginGroupId: process.env.RECALLAI_GOOGLE_MEET_LOGIN_GROUP_ID?.trim(),
      },
      audioStorageProvider,
      transcriptStorage,
    },

    meetingPlatforms: {
      frontendIntegrationsUrl:
        process.env.MEETING_INTEGRATIONS_FRONTEND_URL ||
        `${frontendUrl}/dashboard/integrations`,
      oauthStateSecret: meetingOAuthStateSecret,
      defaultTimezone: process.env.MEETING_DEFAULT_TIMEZONE || 'Asia/Dhaka',
      defaultDurationMinutes: positiveInteger(
        process.env.MEETING_DEFAULT_DURATION_MINUTES,
        30,
        'MEETING_DEFAULT_DURATION_MINUTES',
      ),
      defaultReminderMinutes: positiveInteger(
        process.env.MEETING_DEFAULT_REMINDER_MINUTES,
        15,
        'MEETING_DEFAULT_REMINDER_MINUTES',
      ),
      google: {
        clientId: googleOAuthClientId,
        clientSecret: googleOAuthClientSecret,
        redirectUri: googleOAuthRedirectUri,
      },
      microsoft: {
        clientId: microsoftOAuthClientId,
        clientSecret: microsoftOAuthClientSecret,
        redirectUri: microsoftOAuthRedirectUri,
        authority: `https://login.microsoftonline.com/${microsoftOAuthTenant}`,
      },
    },

    redis: {
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    },
  };
};
