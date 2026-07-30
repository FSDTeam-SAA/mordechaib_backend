export default () => ({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:5000',

  database: {
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/noltra',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
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
  },
});
