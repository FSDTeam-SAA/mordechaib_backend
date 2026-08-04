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
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.MAIL_FROM || 'Noltra AI <no-reply@noltra.ai>',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    },

    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      defaultNumber: process.env.TWILIO_PHONE_NUMBER,
    },

    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },

    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
  };
};
