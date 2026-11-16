const mongoose = require('mongoose');

async function updatePlans() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is missing');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const plansCol = mongoose.connection.collection('subscription_plans');

  // Helper to ensure 'AI meeting' is at index 0 of features
  function formatFeatures(existingFeatures = []) {
    const without = existingFeatures.filter(f => f.toLowerCase() !== 'ai meeting');
    return ['AI meeting', ...without];
  }

  // 1. Pay as you go
  const payAsYouGo = await plansCol.findOne({ planType: 'PAY_AS_YOU_GO' });
  if (payAsYouGo) {
    await plansCol.updateOne(
      { _id: payAsYouGo._id },
      {
        $set: {
          meetingHoursPerMonth: 0,
          extraMeetingHourPriceUsd: 1.00,
          extraAiActionPriceUsd: 0.04,
          extraCallMinutePriceUsd: 0.20,
          tagline: 'Then $0.04 per AI action · $0.20 per call minute · $1.00 per meeting hour',
          features: formatFeatures(payAsYouGo.features),
          updatedAt: new Date()
        }
      }
    );
    console.log('Updated PAY_AS_YOU_GO plan');
  }

  // 2. Growth
  const growth = await plansCol.findOne({ planType: 'GROWTH' });
  if (growth) {
    await plansCol.updateOne(
      { _id: growth._id },
      {
        $set: {
          meetingHoursPerMonth: 30,
          extraMeetingHourPriceUsd: 1.10,
          features: formatFeatures(growth.features),
          updatedAt: new Date()
        }
      }
    );
    console.log('Updated GROWTH plan with 30 AI meeting hours');
  }

  // 3. Enterprise
  const enterprise = await plansCol.findOne({ planType: 'ENTERPRISE' });
  if (enterprise) {
    await plansCol.updateOne(
      { _id: enterprise._id },
      {
        $set: {
          meetingHoursPerMonth: 75,
          extraMeetingHourPriceUsd: 1.00,
          features: formatFeatures(enterprise.features),
          updatedAt: new Date()
        }
      }
    );
    console.log('Updated ENTERPRISE plan with 75 AI meeting hours');
  }

  // 4. Custom
  const custom = await plansCol.findOne({ planType: 'CUSTOM' });
  if (custom) {
    await plansCol.updateOne(
      { _id: custom._id },
      {
        $set: {
          meetingHoursPerMonth: 0,
          features: formatFeatures(custom.features),
          updatedAt: new Date()
        }
      }
    );
    console.log('Updated CUSTOM plan');
  }

  // 5. Also update any active subscriptions to have the new snapshot limits
  const subsCol = mongoose.connection.collection('organization_subscriptions');
  if (growth) {
    await subsCol.updateMany(
      { planId: growth._id.toString() },
      {
        $set: {
          'snapshotLimits.meetingHoursPerMonth': 30,
          'snapshotLimits.extraMeetingHourPriceUsd': 1.10
        }
      }
    );
    console.log('Updated existing Growth subscriptions snapshotLimits');
  }

  const updatedPlans = await plansCol.find({}).toArray();
  console.log('\n--- ALL UPDATED PLANS ---');
  updatedPlans.forEach(p => {
    console.log({
      name: p.name,
      planType: p.planType,
      priceUsd: p.priceUsd,
      meetingHoursPerMonth: p.meetingHoursPerMonth,
      extraMeetingHourPriceUsd: p.extraMeetingHourPriceUsd,
      tagline: p.tagline,
      features: p.features
    });
  });

  await mongoose.disconnect();
}

updatePlans().catch(err => {
  console.error('Error updating plans:', err);
  process.exit(1);
});
