const fs = require('fs');
const path = require('path');

const collectionPath = path.resolve('mordy_postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const usf = collection.item.find(i => i.name === 'user-subscription-flow');
const planViewingFolder = usf.item.find(i => i.name.startsWith('1. Plan Viewing'));

// 1. Update 1.4 Smart Calculator (Image 4 Case)
const calcItem1 = planViewingFolder.item.find(i => i.name.includes('Smart Calculator'));
if (calcItem1) {
  calcItem1.name = '1.4 Smart Calculator - Image 4 Usage (1320 calls, 8500 actions, 86 meetings)';
  calcItem1.request.url = {
    raw: '{{baseURL}}/subscription-plans/estimate?callMinutes=1320&aiActions=8500&aiMeetings=86',
    host: ['{{baseURL}}'],
    path: ['subscription-plans', 'estimate'],
    query: [
      { key: 'callMinutes', value: '1320' },
      { key: 'aiActions', value: '8500' },
      { key: 'aiMeetings', value: '86' }
    ]
  };
  calcItem1.request.description = 'Smart Upgrade Calculator for Image 4 inputs: 1,320 call minutes, 8,500 AI actions, 86 AI meetings. Evaluates Pay As You Go ($690) vs Growth ($149) + 2,000 Voice Minutes ($40) + 75 meeting hours ($75) = $264/mo (Saves $426.00/mo).';
  calcItem1.response = [
    {
      name: 'Success - Smart Estimate with Recommended Addons',
      status: 'OK',
      code: 200,
      _postman_previewlanguage: 'json',
      header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      body: JSON.stringify({
        estimatedMonthlyCost: 690,
        formattedEstimatedMonthlyCost: "$690.00",
        payAsYouGo: {
          name: "Pay as you go",
          planType: "PAY_AS_YOU_GO",
          totalCostUsd: 690,
          formattedTotal: "$690.00",
          rates: {
            aiActionRateUsd: 0.04,
            callMinuteRateUsd: 0.2,
            aiMeetingRateUsd: 1
          },
          breakdown: {
            aiActions: { quantity: 8500, rateUsd: 0.04, costUsd: 340, formattedCost: "$340.00" },
            callMinutes: { quantity: 1320, rateUsd: 0.2, costUsd: 264, formattedCost: "$264.00" },
            aiMeetings: { quantity: 86, rateUsd: 1, costUsd: 86, formattedCost: "$86.00" }
          }
        },
        subscription: {
          id: "6a741a3dcd2554774d14d80a",
          planType: "GROWTH",
          name: "Growth",
          displayName: "Growth subscription",
          priceUsd: 149,
          formattedPrice: "$149/month",
          limits: {
            callMinutesPerMonth: 500,
            aiActionsPerMonth: 10000,
            meetingHoursPerMonth: 30,
            crmContactsLimit: 20000,
            usersIncluded: 5
          },
          isWithinIncludedUsage: false,
          addonsPriceUsd: 115,
          estimatedTotalCostUsd: 264,
          formattedEstimatedTotalCost: "$264.00"
        },
        recommendedAddons: [
          {
            category: "VOICE_MINUTES",
            name: "AI Voice Minutes Packs",
            addonProductId: "6aebfe18ab1c8db6a4bdf515",
            label: "2,000 Voice Minutes",
            quantity: 2000,
            priceUsd: 40,
            units: "call minutes",
            reason: "Covers 820 additional call minutes needed"
          },
          {
            category: "AI_MEETING_CAPTURE",
            name: "AI Meeting Capture",
            addonProductId: "6aebfe1aab1c8db6a4bdf518",
            label: "75 meeting hours",
            quantity: 75,
            priceUsd: 75,
            units: "meeting hours",
            reason: "Covers 56 additional meeting hours needed"
          }
        ],
        bundlePricing: {
          basePlanPriceUsd: 149,
          addonsPriceUsd: 115,
          totalMonthlyPriceUsd: 264,
          formattedTotal: "$264.00/month",
          monthlySavingsUsd: 426,
          formattedSavings: "$426.00/month",
          summary: "Recommended: Growth plan ($149/mo) + Add-ons: 2,000 Voice Minutes ($40), 75 meeting hours ($75). Total $264/mo (Save $426.00/mo vs Pay as you go)."
        },
        comparison: {
          isUpgradeRecommended: true,
          recommendation: "CONSIDER_UPGRADING",
          badge: "Upgrade and save",
          headline: "Growth",
          message: "Growth with add-ons is more economical than Pay as you go.",
          monthlySavingsUsd: 426,
          formattedSavings: "$426.00/month",
          payAsYouGoTotalUsd: 690,
          subscriptionTotalUsd: 264
        }
      }, null, 2)
    }
  ];
}

// 2. Add 1.5 High Usage Exceeding Enterprise
const existing15 = planViewingFolder.item.find(i => i.name.startsWith('1.5'));
const calcItem2 = {
  name: '1.5 Smart Calculator - High Usage Crossing Enterprise (3000 calls, 60k actions, 100 meetings)',
  request: {
    method: 'GET',
    header: [],
    url: {
      raw: '{{baseURL}}/subscription-plans/estimate?callMinutes=3000&aiActions=60000&aiMeetings=100',
      host: ['{{baseURL}}'],
      path: ['subscription-plans', 'estimate'],
      query: [
        { key: 'callMinutes', value: '3000' },
        { key: 'aiActions', value: '60000' },
        { key: 'aiMeetings', value: '100' }
      ]
    },
    description: 'High volume case exceeding Enterprise base tier. Recommends Enterprise ($349) + 10,000 AI Actions ($300) + 2,000 Voice Minutes ($40) + 30 meeting hours ($32) = $721/mo vs Pay As You Go $3,100/mo (Saves $2,379.00/mo).'
  },
  response: [
    {
      name: 'Success - Enterprise Bundle with Addons',
      status: 'OK',
      code: 200,
      _postman_previewlanguage: 'json',
      header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      body: JSON.stringify({
        estimatedMonthlyCost: 3100,
        formattedEstimatedMonthlyCost: "$3100.00",
        payAsYouGo: {
          name: "Pay as you go",
          planType: "PAY_AS_YOU_GO",
          totalCostUsd: 3100,
          formattedTotal: "$3100.00"
        },
        subscription: {
          planType: "ENTERPRISE",
          name: "Enterprise",
          priceUsd: 349,
          addonsPriceUsd: 372,
          estimatedTotalCostUsd: 721
        },
        recommendedAddons: [
          {
            category: "AI_ACTIONS",
            label: "10,000 Ai Actions",
            priceUsd: 300,
            reason: "Covers 10000 additional AI actions needed"
          },
          {
            category: "VOICE_MINUTES",
            label: "2,000 Voice Minutes",
            priceUsd: 40,
            reason: "Covers 1000 additional call minutes needed"
          },
          {
            category: "AI_MEETING_CAPTURE",
            label: "30 meeting hours",
            priceUsd: 32,
            reason: "Covers 25 additional meeting hours needed"
          }
        ],
        bundlePricing: {
          basePlanPriceUsd: 349,
          addonsPriceUsd: 372,
          totalMonthlyPriceUsd: 721,
          monthlySavingsUsd: 2379,
          formattedSavings: "$2379.00/month"
        }
      }, null, 2)
    }
  ]
};

if (!existing15) {
  planViewingFolder.item.push(calcItem2);
} else {
  const idx = planViewingFolder.item.indexOf(existing15);
  planViewingFolder.item[idx] = calcItem2;
}

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf8');
console.log('Successfully updated mordy_postman_collection.json with updated Smart Calculator requests');
