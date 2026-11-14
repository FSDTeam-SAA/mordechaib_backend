const fs = require('fs');
const path = require('path');

// Read environment
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnv(key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

const mongoUri = getEnv('MONGO_URI');
const stripeSecretKey = getEnv('STRIPE_SECRET_KEY');

if (!mongoUri) {
  console.error('MONGO_URI is missing');
  process.exit(1);
}

const mongoose = require(path.resolve(__dirname, '../node_modules/mongoose'));
const Stripe = require(path.resolve(__dirname, '../node_modules/stripe'));

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const addonsToSeed = [
  {
    category: 'AI_ACTIONS',
    name: 'AI Actions Packs',
    description: 'Additional AI actions per month for high-throughput workflows.',
    isInquiryOnly: false,
    isActive: true,
    sortOrder: 1,
    tiers: [
      { label: '1,000 Ai Actions', quantity: 1000, priceUsd: 25 },
      { label: '5,000 Ai Actions', quantity: 5000, priceUsd: 90 },
      { label: '10,000 Ai Actions', quantity: 10000, priceUsd: 300 },
    ],
  },
  {
    category: 'VOICE_MINUTES',
    name: 'AI Voice Minutes Packs',
    description: 'Additional AI voice calling minutes per month.',
    isInquiryOnly: false,
    isActive: true,
    sortOrder: 2,
    tiers: [
      { label: '500 Voice Minutes', quantity: 500, priceUsd: 12 },
      { label: '2,000 Voice Minutes', quantity: 2000, priceUsd: 40 },
      { label: '10,000 Voice Minutes', quantity: 10000, priceUsd: 180 },
    ],
  },
  {
    category: 'OPERATIONS_BOOSTER',
    name: 'Operations Booster Pack',
    description: 'Includes +10,000 Ai Actions, +1,000 Voice Minutes, and Priority Support.',
    isInquiryOnly: true,
    isActive: true,
    sortOrder: 3,
    tiers: [
      {
        label: '+10,000 Ai Actions · +1,000 Voice Minutes · Priority Support',
        quantity: 10000,
        priceUsd: 0,
      },
    ],
  },
  {
    category: 'AI_MEETING_CAPTURE',
    name: 'AI Meeting Capture',
    description: 'Additional meeting capture and transcription hours per month.',
    isInquiryOnly: false,
    isActive: true,
    sortOrder: 4,
    tiers: [
      { label: '10 meeting hours', quantity: 10, priceUsd: 12 },
      { label: '30 meeting hours', quantity: 30, priceUsd: 32 },
      { label: '75 meeting hours', quantity: 75, priceUsd: 75 },
    ],
  },
];

async function enrichTiersWithStripe(productBaseName, tiers, isInquiryOnly) {
  if (isInquiryOnly || !stripe) {
    return tiers.map((t) => ({ ...t }));
  }

  const enriched = [];
  for (const tier of tiers) {
    try {
      const product = await stripe.products.create({
        name: `${productBaseName} — ${tier.label}`,
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(tier.priceUsd * 100),
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      enriched.push({
        ...tier,
        stripeProductId: product.id,
        stripePriceId: price.id,
      });
      console.log(`  Created Stripe Price for "${productBaseName} — ${tier.label}": ${price.id}`);
    } catch (err) {
      console.warn(`  Stripe warning for "${tier.label}": ${err.message}. Saving tier without Stripe pre-creation.`);
      enriched.push({ ...tier });
    }
  }
  return enriched;
}

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB Atlas successfully.');

  const collection = mongoose.connection.db.collection('addon_products');

  for (const item of addonsToSeed) {
    console.log(`\nProcessing: ${item.name} (${item.category})...`);

    const enrichedTiers = await enrichTiersWithStripe(
      item.name,
      item.tiers,
      item.isInquiryOnly,
    );

    const now = new Date();
    const doc = {
      category: item.category,
      name: item.name,
      description: item.description,
      isInquiryOnly: item.isInquiryOnly,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      tiers: enrichedTiers,
      updatedAt: now,
    };

    const res = await collection.updateOne(
      { category: item.category },
      {
        $set: doc,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    console.log(`Saved ${item.name}: upserted=${res.upsertedCount}, modified=${res.modifiedCount}`);
  }

  console.log('\n--- VERIFYING ADD-ONS IN DATABASE ---');
  const allAddons = await collection.find({}).sort({ sortOrder: 1 }).toArray();
  for (const a of allAddons) {
    console.log(`\nPack: ${a.name} [${a.category}] (InquiryOnly: ${a.isInquiryOnly})`);
    for (const t of a.tiers) {
      console.log(`  - ${t.label}: $${t.priceUsd} (qty: ${t.quantity}) ${t.stripePriceId ? `[Stripe Price: ${t.stripePriceId}]` : ''}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone! All add-ons successfully seeded in database.');
}

run().catch((err) => {
  console.error('Fatal error seeding add-ons:', err);
  process.exit(1);
});

