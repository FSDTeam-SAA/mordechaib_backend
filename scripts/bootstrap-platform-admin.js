const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const mongoUri = process.env.MONGO_URI;
const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.PLATFORM_ADMIN_PASSWORD;
const firstName = process.env.PLATFORM_ADMIN_FIRST_NAME?.trim() || 'Platform';
const lastName = process.env.PLATFORM_ADMIN_LAST_NAME?.trim() || 'Admin';
const platformOrganizationName = 'Noltra Platform Team';

if (!mongoUri) throw new Error('MONGO_URI is required');
if (!email) throw new Error('PLATFORM_ADMIN_EMAIL is required');
if (!password || password.length < 8) {
  throw new Error('PLATFORM_ADMIN_PASSWORD must contain at least 8 characters');
}

async function bootstrap() {
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is unavailable');

  const users = database.collection('users');
  const existing = await users.findOne({ email });
  if (existing) {
    if (!existing.isPlatformAdmin) {
      throw new Error(
        'This email already belongs to a customer account. Use a separate platform admin email.',
      );
    }
    console.log('Platform admin already exists; no changes were made.');
    return;
  }

  const organizations = database.collection('organizations');
  let organization = await organizations.findOne({
    name: platformOrganizationName,
  });
  if (!organization) {
    const now = new Date();
    const created = await organizations.insertOne({
      name: platformOrganizationName,
      timezone: 'UTC',
      status: 'ACTIVE',
      plan: 'STARTER',
      language: 'en',
      onboardingStep: 'COMPANY_DETAILS',
      createdAt: now,
      updatedAt: now,
    });
    organization = { _id: created.insertedId };
  }

  const now = new Date();
  await users.insertOne({
    organizationId: String(organization._id),
    email,
    firstName,
    lastName,
    language: 'en',
    passwordHash: await bcrypt.hash(password, 12),
    role: 'ADMIN',
    status: 'ACTIVE',
    isPlatformAdmin: true,
    emailVerifiedAt: now,
    termsAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`Created platform admin: ${email}`);
}

bootstrap()
  .finally(() => mongoose.disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
