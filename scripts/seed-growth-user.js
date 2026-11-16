const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

async function seedGrowthUser() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is missing from environment');
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const email = 'growth.subscriber@noltra.ai';
  const plainPassword = 'Growth@2026!#';

  // Check if user already exists
  const usersCol = mongoose.connection.collection('users');
  const orgsCol = mongoose.connection.collection('organizations');
  const subsCol = mongoose.connection.collection('organization_subscriptions');
  const plansCol = mongoose.connection.collection('subscription_plans');
  const invoicesCol = mongoose.connection.collection('invoices');

  const existingUser = await usersCol.findOne({ email });
  if (existingUser) {
    console.log('User already exists, removing old test record first...');
    await usersCol.deleteOne({ _id: existingUser._id });
    if (existingUser.organizationId) {
      await orgsCol.deleteOne({ _id: new mongoose.Types.ObjectId(existingUser.organizationId) });
      await subsCol.deleteMany({ organizationId: existingUser.organizationId });
      await invoicesCol.deleteMany({ organizationId: existingUser.organizationId });
    }
  }

  // 1. Fetch Growth Plan
  const growthPlan = await plansCol.findOne({ planType: 'GROWTH' });
  if (!growthPlan) {
    throw new Error('Growth plan not found in database');
  }
  console.log('Found Growth plan:', growthPlan._id.toString(), growthPlan.name, '$' + growthPlan.priceUsd);

  // 2. Create Organization
  const orgId = new mongoose.Types.ObjectId();
  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const organization = {
    _id: orgId,
    name: 'Growth Enterprise Labs',
    timezone: 'UTC',
    status: 'ACTIVE',
    plan: 'GROWTH',
    onboardingStep: 'COMPLETED',
    createdAt: now,
    updatedAt: now,
    __v: 0,
  };
  await orgsCol.insertOne(organization);
  console.log('Created Organization:', orgId.toString());

  // 3. Hash Password
  const saltRounds = Number(process.env.BCRYPT_ROUNDS) || 10;
  const passwordHash = await bcrypt.hash(plainPassword, saltRounds);

  // 4. Create User (Owner with full tab permissions)
  const allPermissions = [
    'Dashboard',
    'Call Intelligence',
    'Customer',
    'AI Chief of Staff',
    'AI Agents',
    'CRM',
    'ROI Dashboard',
    'Task',
    'Calendar',
    'Operational Diagnostic',
    'Settings',
    'Help & Support',
    'All Access',
  ];

  const userId = new mongoose.Types.ObjectId();
  const user = {
    _id: userId,
    organizationId: orgId.toString(),
    email: email.toLowerCase(),
    firstName: 'Alex',
    lastName: 'Vance',
    language: 'en',
    passwordHash,
    role: 'OWNER',
    permissions: allPermissions,
    mustResetPassword: false,
    status: 'ACTIVE',
    isPlatformAdmin: false,
    emailVerifiedAt: now,
    termsAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  };
  await usersCol.insertOne(user);
  console.log('Created User:', userId.toString(), user.email);

  // 5. Create OrganizationSubscription for Growth Plan
  const stripeCustomerId = `cus_growth_${Date.now()}`;
  const stripeSubscriptionId = `sub_growth_${Date.now()}`;

  const subscription = {
    _id: new mongoose.Types.ObjectId(),
    organizationId: orgId.toString(),
    planId: growthPlan._id.toString(),
    status: 'ACTIVE',
    stripeCustomerId,
    stripeSubscriptionId,
    currentPeriodStart: now,
    currentPeriodEnd: oneMonthLater,
    billingInterval: 'month',
    cancelAtPeriodEnd: false,
    pausedUntil: null,
    snapshotLimits: {
      priceUsd: growthPlan.priceUsd || 149,
      aiActionsPerMonth: growthPlan.aiActionsPerMonth || 10000,
      crmContactsLimit: growthPlan.crmContactsLimit || 20000,
      callMinutesPerMonth: growthPlan.callMinutesPerMonth || 500,
      meetingHoursPerMonth: growthPlan.meetingHoursPerMonth || 30,
      usersIncluded: growthPlan.usersIncluded || 5,
      aiAgentsIncluded: growthPlan.aiAgentsIncluded || 6,
      extraAiActionPriceUsd: growthPlan.extraAiActionPriceUsd || 0.06,
      extraCallMinutePriceUsd: growthPlan.extraCallMinutePriceUsd || 0.025,
    },
    activeAddons: [],
    createdAt: now,
    updatedAt: now,
    __v: 0,
  };
  await subsCol.insertOne(subscription);
  console.log('Created Subscription:', subscription._id.toString(), 'for Plan:', growthPlan.name);

  // 6. Create Initial Paid Invoice for Screen 1 Invoice History
  const invoice = {
    _id: new mongoose.Types.ObjectId(),
    stripeInvoiceId: `in_growth_${Date.now()}`,
    stripeSubscriptionId,
    invoiceNumber: `INV-${now.getFullYear()}-001`,
    organizationId: orgId.toString(),
    organizationName: organization.name,
    planId: growthPlan._id.toString(),
    planType: 'GROWTH',
    planName: 'Growth',
    amountUsd: growthPlan.priceUsd || 149,
    billingInterval: 'month',
    status: 'PAID',
    hostedInvoiceUrl: 'https://invoice.stripe.com/demo/growth_invoice',
    invoicePdfUrl: 'https://pay.stripe.com/invoice/demo/growth_invoice/pdf',
    periodStart: now,
    periodEnd: oneMonthLater,
    issuedAt: now,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  };
  await invoicesCol.insertOne(invoice);
  console.log('Created Invoice:', invoice.invoiceNumber, '$' + invoice.amountUsd);

  console.log('\n=======================================');
  console.log('SUCCESS! Growth User Created in Database');
  console.log('=======================================');
  console.log('Email:    ', email);
  console.log('Password: ', plainPassword);
  console.log('Role:     ', user.role);
  console.log('Org ID:   ', orgId.toString());
  console.log('Org Name: ', organization.name);
  console.log('Plan:     ', growthPlan.name, '($' + (growthPlan.priceUsd || 149) + '/mo)');
  console.log('Renewal:  ', oneMonthLater.toISOString());
  console.log('=======================================\n');

  await mongoose.disconnect();
}

seedGrowthUser().catch((err) => {
  console.error('Error seeding growth user:', err);
  process.exit(1);
});
