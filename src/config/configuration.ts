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

  return {
    NODE_ENV: nodeEnv,
    PORT: Number(process.env.PORT || 5000),
    APP_BASE_URL: (process.env.APP_BASE_URL || 'http://localhost:5000').trim(),
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
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
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
  };
};
