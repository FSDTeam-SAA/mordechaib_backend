const mongoose = require('mongoose');

async function setExtraAiCallMinute() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is missing');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const plansCol = mongoose.connection.collection('subscription_plans');
  const subsCol = mongoose.connection.collection('organization_subscriptions');

  const payAsYouGoId = new mongoose.Types.ObjectId('6ae0363462dfe2e6e461016c');

  const updateResult = await plansCol.updateOne(
    { _id: payAsYouGoId },
    {
      $set: {
        extraAiCallMinute: 1,
        extraAlcallminute: 1,
        extraAiCallMinutePriceUsd: 1,
        extraMeetingHourPriceUsd: 1,
        updatedAt: new Date()
      }
    }
  );

  console.log('Updated pay as you go plan in subscription_plans:', updateResult.modifiedCount);

  // Also update any subscriptions linked to pay as you go
  await subsCol.updateMany(
    { planId: '6ae0363462dfe2e6e461016c' },
    {
      $set: {
        'snapshotLimits.extraAiCallMinute': 1,
        'snapshotLimits.extraAlcallminute': 1,
        'snapshotLimits.extraAiCallMinutePriceUsd': 1,
        'snapshotLimits.extraMeetingHourPriceUsd': 1
      }
    }
  );

  const doc = await plansCol.findOne({ _id: payAsYouGoId });
  console.log('\n--- PAY AS YOU GO DOCUMENT IN MONGODB ---');
  console.log(JSON.stringify(doc, null, 2));

  await mongoose.disconnect();
}

setExtraAiCallMinute().catch(err => {
  console.error(err);
  process.exit(1);
});
