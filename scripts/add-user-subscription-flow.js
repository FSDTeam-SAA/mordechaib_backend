const fs = require('fs');
const path = require('path');

const collectionPath = path.resolve('mordy_postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

// Helper for generating standard headers
const authHeader = [
  {
    key: 'Authorization',
    value: 'Bearer {{token}}',
    type: 'text',
  },
  {
    key: 'Content-Type',
    value: 'application/json',
    type: 'text',
  },
];

const authHeaderNoContentType = [
  {
    key: 'Authorization',
    value: 'Bearer {{token}}',
    type: 'text',
  },
];

const userSubscriptionFlowFolder = {
  name: 'user-subscription-flow',
  description: 'Complete user dashboard subscription management flow covering plan viewing, upgrade, smart calculator, downgrade contact leads, specialist calls, pause/resume, 6-case cancellation flow with retention offers, invoice history with PDF download, and admin query resolution.',
  item: [
    {
      name: '1. Plan Viewing & Estimation (Screen 1 & 2)',
      item: [
        {
          name: '1.1 Get My Current Plan & Subscription',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions/me',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me'],
            },
            description: 'Returns the currently active plan, snapshot limits, renewal date, and billing interval for the logged-in organization (Screen 1 card).'
          },
          response: [
            {
              name: 'Success - Active Subscription',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                subscription: {
                  id: '6737400192e210a4023b1234',
                  organizationId: '6a71a90167f3504f792355ba',
                  planId: '67373f9192e210a4023b0002',
                  status: 'ACTIVE',
                  billingInterval: 'month',
                  currentPeriodStart: '2026-11-01T00:00:00.000Z',
                  currentPeriodEnd: '2026-12-01T00:00:00.000Z',
                  cancelAtPeriodEnd: false,
                  pausedUntil: null,
                  snapshotLimits: {
                    priceUsd: 99,
                    aiActionsPerMonth: 10000,
                    crmContactsLimit: 5000,
                    callMinutesPerMonth: 500,
                    meetingHoursPerMonth: 30,
                    usersIncluded: 5,
                    aiAgentsIncluded: 6
                  }
                },
                plan: {
                  id: '67373f9192e210a4023b0002',
                  name: 'Growth',
                  planType: 'GROWTH',
                  priceUsd: 99,
                  billingInterval: 'month',
                  badgeText: 'Most Popular',
                  features: [
                    '6 AI agents',
                    'AI meeting',
                    '10,000 AI Actions',
                    '5,000 contacts',
                    'Full ROI dashboard',
                    'Priority support'
                  ]
                }
              }, null, 2)
            }
          ]
        },
        {
          name: '1.2 Compare Plans (Monthly)',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{baseURL}}/subscription-plans?billingCycle=month',
              host: ['{{baseURL}}'],
              path: ['subscription-plans'],
              query: [{ key: 'billingCycle', value: 'month' }]
            },
            description: 'Returns all active plans for the Compare Plans grid with monthly pricing (Starter $49, Growth $99, Enterprise $249, Customized).'
          },
          response: [
            {
              name: 'Success - All Monthly Plans',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify([
                {
                  id: '67373f9192e210a4023b0001',
                  name: 'Starter',
                  planType: 'STARTER',
                  priceUsd: 49,
                  billingInterval: 'month',
                  aiActionsPerMonth: 3000,
                  callMinutesPerMonth: 200,
                  meetingHoursPerMonth: 10,
                  usersIncluded: 1
                },
                {
                  id: '67373f9192e210a4023b0002',
                  name: 'Growth',
                  planType: 'GROWTH',
                  priceUsd: 99,
                  billingInterval: 'month',
                  badgeText: 'Most Popular',
                  aiActionsPerMonth: 10000,
                  callMinutesPerMonth: 500,
                  meetingHoursPerMonth: 30,
                  usersIncluded: 5
                },
                {
                  id: '67373f9192e210a4023b0003',
                  name: 'Enterprise',
                  planType: 'ENTERPRISE',
                  priceUsd: 249,
                  billingInterval: 'month',
                  aiActionsPerMonth: 50000,
                  callMinutesPerMonth: 2000,
                  meetingHoursPerMonth: 75,
                  usersIncluded: 9999
                }
              ], null, 2)
            }
          ]
        },
        {
          name: '1.3 Compare Plans (Yearly - 2 Months Free)',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{baseURL}}/subscription-plans?billingCycle=year',
              host: ['{{baseURL}}'],
              path: ['subscription-plans'],
              query: [{ key: 'billingCycle', value: 'year' }]
            },
            description: 'Returns all plans when user toggles the Yearly billing interval tab (saves 2 months free).'
          },
          response: [
            {
              name: 'Success - All Yearly Plans',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify([
                {
                  id: '67373f9192e210a4023b0004',
                  name: 'Starter Annual',
                  planType: 'STARTER',
                  priceUsd: 490,
                  billingInterval: 'year',
                  aiActionsPerMonth: 3000
                },
                {
                  id: '67373f9192e210a4023b0005',
                  name: 'Growth Annual',
                  planType: 'GROWTH',
                  priceUsd: 990,
                  billingInterval: 'year',
                  aiActionsPerMonth: 10000
                }
              ], null, 2)
            }
          ]
        },
        {
          name: '1.4 Smart Calculator (Estimate Usage)',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{baseURL}}/subscription-plans/estimate?monthlyAiActions=5000&monthlyCallMinutes=5000&monthlyMeetingHours=30',
              host: ['{{baseURL}}'],
              path: ['subscription-plans', 'estimate'],
              query: [
                { key: 'monthlyAiActions', value: '5000' },
                { key: 'monthlyCallMinutes', value: '5000' },
                { key: 'monthlyMeetingHours', value: '30' }
              ]
            },
            description: 'Powers the "Estimate your usage" interactive sliders from Screen 2. Dynamically calculates best-fit plan and add-ons.'
          },
          response: [
            {
              name: 'Success - Smart Estimate',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                recommendedPlan: {
                  id: '67373f9192e210a4023b0002',
                  name: 'Growth',
                  planType: 'GROWTH',
                  priceUsd: 99
                },
                recommendedAddons: [
                  {
                    category: 'CALL_MINUTES',
                    packName: '2,000 Voice Minutes Pack',
                    quantity: 2,
                    priceUsd: 80
                  },
                  {
                    category: 'MEETING_CAPTURE',
                    packName: '30 meeting hours',
                    quantity: 1,
                    priceUsd: 32
                  }
                ],
                totalEstimatedMonthlyPriceUsd: 211,
                summary: 'Recommended: Growth plan + Add-ons: 4,000 call minutes and 30 meeting hours.'
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      name: '2. Upgrade & Checkout Sessions',
      item: [
        {
          name: '2.1 Buy Plan (Stripe Checkout Session)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                planType: 'GROWTH',
                billingInterval: 'month',
                successUrl: 'https://noltra.ai/dashboard/subscription?session_id={CHECKOUT_SESSION_ID}',
                cancelUrl: 'https://noltra.ai/dashboard/subscription'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/billing/checkout-session',
              host: ['{{baseURL}}'],
              path: ['billing', 'checkout-session'],
            },
            description: 'Creates a Stripe Checkout Session URL for direct plan purchase without trial.'
          },
          response: [
            {
              name: 'Success - Checkout URL',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6',
                sessionId: 'cs_test_a1b2c3d4e5f6'
              }, null, 2)
            }
          ]
        },
        {
          name: '2.2 Buy Plan with Add-ons (Checkout Session)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                planType: 'GROWTH',
                billingInterval: 'month',
                successUrl: 'https://noltra.ai/dashboard/subscription?session_id={CHECKOUT_SESSION_ID}',
                cancelUrl: 'https://noltra.ai/dashboard/subscription',
                addons: [
                  { category: 'AI_ACTIONS', packageIndex: 1 },
                  { category: 'CALL_MINUTES', packageIndex: 0 },
                  { category: 'MEETING_CAPTURE', packageIndex: 0 }
                ]
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/billing/checkout-session-with-addons',
              host: ['{{baseURL}}'],
              path: ['billing', 'checkout-session-with-addons'],
            },
            description: 'Purchases base plan together with selected add-on packs bundled together in checkout.'
          },
          response: [
            {
              name: 'Success - Checkout with Addons',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                url: 'https://checkout.stripe.com/c/pay/cs_test_addons_bundle_123',
                sessionId: 'cs_test_addons_bundle_123'
              }, null, 2)
            }
          ]
        },
        {
          name: '2.3 Upgrade Subscription (Direct In-App Upgrade)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                planType: 'ENTERPRISE'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/billing/upgrade',
              host: ['{{baseURL}}'],
              path: ['billing', 'upgrade'],
            },
            description: 'Upgrades existing active subscription immediately using proration on Stripe.'
          },
          response: [
            {
              name: 'Success - Upgraded',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Subscription successfully upgraded to ENTERPRISE',
                newPlan: {
                  planType: 'ENTERPRISE',
                  priceUsd: 249,
                  usersIncluded: 9999,
                  aiActionsPerMonth: 50000
                }
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      name: '3. Pause & Resume Subscription (Screens 3 & 4)',
      item: [
        {
          name: '3.1 Pause Subscription - 30 Days',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                days: 30
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/billing/pause',
              host: ['{{baseURL}}'],
              path: ['billing', 'pause'],
            },
            description: 'Pauses subscription for 30 days (Screen 4 Option 1). Halts Stripe billing while keeping data safe.'
          },
          response: [
            {
              name: 'Success - Paused for 30 Days',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Subscription paused until 2026-12-16T14:40:00.000Z (30 days)',
                pausedUntil: '2026-12-16T14:40:00.000Z',
                status: 'PAUSED'
              }, null, 2)
            }
          ]
        },
        {
          name: '3.2 Pause Subscription - 60 Days',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                days: 60
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/billing/pause',
              host: ['{{baseURL}}'],
              path: ['billing', 'pause'],
            },
            description: 'Pauses subscription for 60 days (Screen 4 Option 2).'
          },
          response: [
            {
              name: 'Success - Paused for 60 Days',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Subscription paused until 2027-01-15T14:40:00.000Z (60 days)',
                pausedUntil: '2027-01-15T14:40:00.000Z',
                status: 'PAUSED'
              }, null, 2)
            }
          ]
        },
        {
          name: '3.3 Pause Subscription - 90 Days',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                days: 90
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/billing/pause',
              host: ['{{baseURL}}'],
              path: ['billing', 'pause'],
            },
            description: 'Pauses subscription for 90 days (Screen 4 Option 3).'
          },
          response: [
            {
              name: 'Success - Paused for 90 Days',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Subscription paused until 2027-02-14T14:40:00.000Z (90 days)',
                pausedUntil: '2027-02-14T14:40:00.000Z',
                status: 'PAUSED'
              }, null, 2)
            }
          ]
        },
        {
          name: '3.4 Resume Paused Subscription',
          request: {
            method: 'POST',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/billing/resume',
              host: ['{{baseURL}}'],
              path: ['billing', 'resume'],
            },
            description: 'Resumes an existing paused subscription immediately on Stripe and locally.'
          },
          response: [
            {
              name: 'Success - Resumed',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Subscription resumed successfully',
                status: 'ACTIVE',
                pausedUntil: null
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      name: '4. Downgrade & Specialist Requests (Screens 3, 5 & 6)',
      item: [
        {
          name: '4.1 Downgrade Request (Contact Sales)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                requestedPlanName: 'Starter',
                note: 'We are downsizing our team for the next 2 quarters'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/downgrade-request',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'downgrade-request'],
            },
            description: 'Screen 5: User clicks "Contact Sales" under Starter, Pay-as-you-go, or Limited Plan. Downgrade is routed to sales team.'
          },
          response: [
            {
              name: 'Success - Downgrade Lead Created',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Our sales team will reach out shortly'
              }, null, 2)
            }
          ]
        },
        {
          name: '4.2 Talk to a Specialist Request',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                note: 'I want a 15-minute consultation with an AI automation expert'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/specialist-request',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'specialist-request'],
            },
            description: 'Screen 6: 15-minute call request with an AI automation specialist to get questions answered and find right solution.'
          },
          response: [
            {
              name: 'Success - Specialist Call Lead Created',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'A specialist will reach out to schedule your call'
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      name: '5. Contact Sales Form (User Side)',
      item: [
        {
          name: '5.1 Submit Contact Sales Inquiry (PRICING)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                subject: 'PRICING',
                message: 'We are looking to migrate 40 team members and need custom annual enterprise pricing.',
                note: 'Best time to reach me: 2 PM EST via email or phone'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/contact-sales',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'contact-sales'],
            },
            description: 'User fills the Contact Sales form in the user dashboard. Creates a lead query in the admin dashboard query section.'
          },
          response: [
            {
              name: 'Success - Inquiry Submitted',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Your inquiry has been submitted. Our sales team will reach out shortly.'
              }, null, 2)
            }
          ]
        },
        {
          name: '5.2 Submit Contact Sales Inquiry (FEATURES / ENTERPRISE)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                subject: 'ENTERPRISE',
                message: 'We require HIPAA compliance agreement, private model tuning, and custom SLA.',
                note: 'Please provide enterprise security documentation'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/contact-sales',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'contact-sales'],
            },
            description: 'Enterprise inquiry form submission with custom requirements.'
          },
          response: [
            {
              name: 'Success - Enterprise Inquiry Submitted',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Your inquiry has been submitted. Our sales team will reach out shortly.'
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      name: '6. Cancellation Flow (All Cases - Screens 2, 3, 7, 8, 9, 10)',
      item: [
        {
          name: '6.1 Case 1: Cancel - TOO_EXPENSIVE with DISCOUNT Retention Offer',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                reason: 'TOO_EXPENSIVE',
                retentionOfferChoice: 'DISCOUNT',
                password: 'UserSecurePassword123!',
                feedback: 'Looking for a more budget-friendly plan'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel'],
            },
            description: 'Step 1: Reason TOO_EXPENSIVE. Step 2: Offered 20% Off discount. User confirms with password.'
          },
          response: [
            {
              name: 'Success - Cancellation Scheduled (7-day Grace Period)',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                status: 'PENDING',
                reason: 'TOO_EXPENSIVE',
                retentionOfferChoice: 'DISCOUNT',
                scheduledExecutionDate: '2026-11-23T14:40:00.000Z',
                gracePeriodDays: 7,
                message: 'Cancellation scheduled. Effective in 7 days. You can undo anytime before this date.'
              }, null, 2)
            }
          ]
        },
        {
          name: '6.2 Case 2: Cancel - MISSING_FEATURES with NONE (No Offer Accepted)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                reason: 'MISSING_FEATURES',
                retentionOfferChoice: 'NONE',
                password: 'UserSecurePassword123!',
                feedback: 'Need advanced custom webhook trigger support'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel'],
            },
            description: 'Reason MISSING_FEATURES, user chose not to accept any retention offer.'
          },
          response: [
            {
              name: 'Success - Cancellation Scheduled',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                status: 'PENDING',
                reason: 'MISSING_FEATURES',
                retentionOfferChoice: 'NONE',
                scheduledExecutionDate: '2026-11-23T14:40:00.000Z',
                gracePeriodDays: 7
              }, null, 2)
            }
          ]
        },
        {
          name: '6.3 Case 3: Cancel - NOT_SEEING_VALUE with PAUSE Retention Offer',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                reason: 'NOT_SEEING_VALUE',
                retentionOfferChoice: 'PAUSE',
                password: 'UserSecurePassword123!',
                feedback: 'Taking a seasonal hiatus'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel'],
            },
            description: 'Reason NOT_SEEING_VALUE, retention offer chosen: PAUSE.'
          },
          response: [
            {
              name: 'Success - Cancellation Scheduled',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                status: 'PENDING',
                reason: 'NOT_SEEING_VALUE',
                retentionOfferChoice: 'PAUSE',
                scheduledExecutionDate: '2026-11-23T14:40:00.000Z'
              }, null, 2)
            }
          ]
        },
        {
          name: '6.4 Case 4: Cancel - SWITCHING_PLATFORMS with DOWNGRADE Retention Offer',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                reason: 'SWITCHING_PLATFORMS',
                retentionOfferChoice: 'DOWNGRADE',
                password: 'UserSecurePassword123!',
                feedback: 'Looking for a simpler tool'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel'],
            },
            description: 'Reason SWITCHING_PLATFORMS, retention offer: DOWNGRADE.'
          },
          response: [
            {
              name: 'Success - Cancellation Scheduled',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                status: 'PENDING',
                reason: 'SWITCHING_PLATFORMS',
                retentionOfferChoice: 'DOWNGRADE',
                scheduledExecutionDate: '2026-11-23T14:40:00.000Z'
              }, null, 2)
            }
          ]
        },
        {
          name: '6.5 Case 5: Cancel - TECHNICAL_ISSUES with SPECIALIST Retention Offer',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                reason: 'TECHNICAL_ISSUES',
                retentionOfferChoice: 'SPECIALIST',
                password: 'UserSecurePassword123!',
                feedback: 'Having trouble configuring integration webhooks'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel'],
            },
            description: 'Reason TECHNICAL_ISSUES, retention offer: SPECIALIST.'
          },
          response: [
            {
              name: 'Success - Cancellation Scheduled',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                status: 'PENDING',
                reason: 'TECHNICAL_ISSUES',
                retentionOfferChoice: 'SPECIALIST',
                scheduledExecutionDate: '2026-11-23T14:40:00.000Z'
              }, null, 2)
            }
          ]
        },
        {
          name: '6.6 Case 6: Cancel - OTHER with Detailed Feedback Note',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                reason: 'OTHER',
                retentionOfferChoice: 'NONE',
                password: 'UserSecurePassword123!',
                feedback: 'Company is restructuring internal operations'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel'],
            },
            description: 'Reason OTHER with freeform custom feedback note.'
          },
          response: [
            {
              name: 'Success - Cancellation Scheduled',
              status: 'Created',
              code: 201,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                status: 'PENDING',
                reason: 'OTHER',
                retentionOfferChoice: 'NONE',
                scheduledExecutionDate: '2026-11-23T14:40:00.000Z'
              }, null, 2)
            }
          ]
        },
        {
          name: '6.7 Check Pending Cancellation Status (Screen 9)',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel'],
            },
            description: 'Screen 9: Displays "Your cancellation will take effect on Date (7 days from now)". Frontend checks this to render the pending banner.'
          },
          response: [
            {
              name: 'Success - Pending Cancellation Details',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                isPending: true,
                request: {
                  id: '67375a00a12e345678901234',
                  status: 'PENDING',
                  reason: 'TOO_EXPENSIVE',
                  retentionOfferChoice: 'DISCOUNT',
                  scheduledExecutionDate: '2026-11-23T14:40:00.000Z',
                  remainingDays: 7,
                  requestedAt: '2026-11-16T14:40:00.000Z'
                }
              }, null, 2)
            }
          ]
        },
        {
          name: '6.8 Undo Cancellation (Screen 10)',
          request: {
            method: 'POST',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions/me/cancel/undo',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'cancel', 'undo'],
            },
            description: 'Screen 10: "Undo cancellation" button. Cancels the scheduled cancellation and restores full subscription status.'
          },
          response: [
            {
              name: 'Success - Cancellation Undone',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Cancellation request has been revoked. Your subscription remains active.',
                status: 'ACTIVE'
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      name: '7. Invoice History & PDF Download (Screen 1)',
      item: [
        {
          name: '7.1 Get My Invoices History',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions/me/invoices?page=1&limit=10',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'invoices'],
              query: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '10' }
              ]
            },
            description: 'Screen 1 (Bottom Table): Lists invoice history for the user org with Date, Amount, Status (Paid), Invoice number, and PDF download link.'
          },
          response: [
            {
              name: 'Success - Invoices List',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                items: [
                  {
                    id: '673752e5a6f23e0012345678',
                    invoiceId: 'INV-2026-7',
                    invoiceNumber: 'INV-2026-7',
                    planName: 'Growth',
                    amountUsd: 99,
                    billingInterval: 'month',
                    status: 'PAID',
                    issuedAt: '2026-11-01T00:00:00.000Z',
                    periodStart: '2026-11-01T00:00:00.000Z',
                    periodEnd: '2026-12-01T00:00:00.000Z',
                    hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_123/inv_456',
                    invoicePdfUrl: 'https://pay.stripe.com/invoice/inv_456/pdf'
                  },
                  {
                    id: '673752e5a6f23e0012345679',
                    invoiceId: 'INV-2026-6',
                    invoiceNumber: 'INV-2026-6',
                    planName: 'Growth',
                    amountUsd: 99,
                    billingInterval: 'month',
                    status: 'PAID',
                    issuedAt: '2026-10-01T00:00:00.000Z',
                    periodStart: '2026-10-01T00:00:00.000Z',
                    periodEnd: '2026-11-01T00:00:00.000Z',
                    hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_123/inv_455',
                    invoicePdfUrl: 'https://pay.stripe.com/invoice/inv_455/pdf'
                  }
                ],
                page: 1,
                limit: 10,
                total: 2,
                totalPages: 1
              }, null, 2)
            }
          ]
        },
        {
          name: '7.2 Download Invoice PDF (Redirect)',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions/me/invoices/673752e5a6f23e0012345678/download',
              host: ['{{baseURL}}'],
              path: ['subscriptions', 'me', 'invoices', '673752e5a6f23e0012345678', 'download'],
            },
            description: 'Screen 1: Clicking "PDF" action icon redirects to the Stripe-hosted official PDF download URL.'
          },
          response: [
            {
              name: 'Success - 302 Redirect to Stripe PDF',
              status: 'Found',
              code: 302,
              header: [{ key: 'Location', value: 'https://pay.stripe.com/invoice/inv_456/pdf' }],
              body: ''
            }
          ]
        }
      ]
    },
    {
      name: '8. Admin - Sales Queries & Query Resolution (Admin Side)',
      item: [
        {
          name: '8.1 Admin: List All Sales Queries',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions-admin/sales-queries?page=1&limit=10',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'sales-queries'],
              query: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '10' }
              ]
            },
            description: 'Admin dashboard query section: View all incoming sales queries, downgrade requests, specialist call requests, and contact inquiries.'
          },
          response: [
            {
              name: 'Success - Admin Query List',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                items: [
                  {
                    id: '673752e5a6f23e0012345680',
                    organizationId: '6a71a90167f3504f792355ba',
                    packageType: 'CONTACT_SALES',
                    fullName: 'Mahabur Rahman',
                    email: 'owner@acme.com',
                    subject: 'PRICING',
                    message: 'Organization "Acme Corp" submitted a Contact Sales request.\nSubject: PRICING\nMessage: We are looking to migrate 40 team members and need custom annual enterprise pricing.',
                    status: 'SUBMITTED',
                    resolutionNote: null,
                    resolvedAt: null,
                    createdAt: '2026-11-16T14:40:00.000Z'
                  },
                  {
                    id: '673752e5a6f23e0012345681',
                    organizationId: '6a71a90167f3504f792355ba',
                    packageType: 'DOWNGRADE_REQUEST',
                    fullName: 'Mahabur Rahman',
                    email: 'owner@acme.com',
                    subject: null,
                    message: 'Organization "Acme Corp" requested a downgrade to "Starter". Note: We are downsizing our team',
                    status: 'SUBMITTED',
                    resolutionNote: null,
                    resolvedAt: null,
                    createdAt: '2026-11-16T14:35:00.000Z'
                  }
                ],
                page: 1,
                limit: 10,
                total: 2,
                totalPages: 1
              }, null, 2)
            }
          ]
        },
        {
          name: '8.2 Admin: Filter Queries by Status (SUBMITTED / CONTACTED / CLOSED)',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions-admin/sales-queries?status=SUBMITTED&packageType=CONTACT_SALES',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'sales-queries'],
              query: [
                { key: 'status', value: 'SUBMITTED' },
                { key: 'packageType', value: 'CONTACT_SALES' }
              ]
            },
            description: 'Filter queries by status (SUBMITTED, CONTACTED, CLOSED) and packageType.'
          },
          response: [
            {
              name: 'Success - Filtered Queries',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                items: [
                  {
                    id: '673752e5a6f23e0012345680',
                    packageType: 'CONTACT_SALES',
                    fullName: 'Mahabur Rahman',
                    email: 'owner@acme.com',
                    status: 'SUBMITTED'
                  }
                ],
                page: 1,
                limit: 10,
                total: 1,
                totalPages: 1
              }, null, 2)
            }
          ]
        },
        {
          name: '8.3 Admin: Get Query Details by ID',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions-admin/sales-queries/673752e5a6f23e0012345680',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'sales-queries', '673752e5a6f23e0012345680'],
            },
            description: 'Returns all fields for a specific query.'
          },
          response: [
            {
              name: 'Success - Query Detail',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                id: '673752e5a6f23e0012345680',
                organizationId: '6a71a90167f3504f792355ba',
                packageType: 'CONTACT_SALES',
                fullName: 'Mahabur Rahman',
                email: 'owner@acme.com',
                subject: 'PRICING',
                message: 'Organization "Acme Corp" submitted a Contact Sales request.',
                status: 'SUBMITTED',
                resolutionNote: null,
                resolvedAt: null,
                createdAt: '2026-11-16T14:40:00.000Z'
              }, null, 2)
            }
          ]
        },
        {
          name: '8.4 Admin: Resolve Query (Mark as CONTACTED / CLOSED)',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                status: 'CONTACTED',
                note: 'Spoke with the customer via phone and presented enterprise custom bundle proposal.'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions-admin/sales-queries/673752e5a6f23e0012345680/resolve',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'sales-queries', '673752e5a6f23e0012345680', 'resolve'],
            },
            description: 'Admin updates query status (e.g. to CONTACTED or CLOSED) and adds an internal note.'
          },
          response: [
            {
              name: 'Success - Query Resolved',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Sales query status updated to CONTACTED',
                query: {
                  id: '673752e5a6f23e0012345680',
                  status: 'CONTACTED',
                  resolutionNote: 'Spoke with the customer via phone and presented enterprise custom bundle proposal.',
                  resolvedAt: '2026-11-16T14:45:00.000Z',
                  resolvedByUserId: '67373f9192e210a4023b9999'
                }
              }, null, 2)
            }
          ]
        },
        {
          name: '8.5 Admin: Contact User Directly via Email',
          request: {
            method: 'POST',
            header: authHeader,
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                subject: 'Response regarding your Noltra.ai Enterprise inquiry',
                message: 'Hi Mahabur,\n\nThank you for reaching out to Noltra.ai! We have prepared a customized enterprise proposal tailored for your 40 team members with dedicated AI model tuning.\n\nCould we schedule a brief 15-minute call this Wednesday?\n\nBest regards,\nNoltra Sales Team'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: '{{baseURL}}/subscriptions-admin/sales-queries/673752e5a6f23e0012345680/contact-user',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'sales-queries', '673752e5a6f23e0012345680', 'contact-user'],
            },
            description: 'Admin sends an email directly to the customer who submitted the inquiry.'
          },
          response: [
            {
              name: 'Success - Email Sent',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Email successfully sent to owner@acme.com',
                recipient: 'owner@acme.com',
                subject: 'Response regarding your Noltra.ai Enterprise inquiry'
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      name: '9. Admin - Cancellation Queue & Actions (Admin Side)',
      item: [
        {
          name: '9.1 Admin: List Cancellation Requests Queue',
          request: {
            method: 'GET',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions-admin/cancellation-requests?status=PENDING&page=1&limit=10',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'cancellation-requests'],
              query: [
                { key: 'status', value: 'PENDING' },
                { key: 'page', value: '1' },
                { key: 'limit', value: '10' }
              ]
            },
            description: 'Lists all pending cancellation requests currently inside the 7-day grace period countdown.'
          },
          response: [
            {
              name: 'Success - Cancellation Queue',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                items: [
                  {
                    id: '67375a00a12e345678901234',
                    organizationId: '6a71a90167f3504f792355ba',
                    organizationName: 'Acme Corp',
                    status: 'PENDING',
                    reason: 'TOO_EXPENSIVE',
                    retentionOfferChoice: 'DISCOUNT',
                    scheduledExecutionDate: '2026-11-23T14:40:00.000Z',
                    gracePeriodRemainingDays: 7
                  }
                ],
                page: 1,
                limit: 10,
                total: 1,
                totalPages: 1
              }, null, 2)
            }
          ]
        },
        {
          name: '9.2 Admin: Execute Cancellation Early',
          request: {
            method: 'POST',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions-admin/cancellation-requests/67375a00a12e345678901234/execute',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'cancellation-requests', '67375a00a12e345678901234', 'execute'],
            },
            description: 'Admin executes the cancellation immediately without waiting for the 7-day grace period to expire.'
          },
          response: [
            {
              name: 'Success - Executed Early',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Cancellation executed by admin. Subscription marked cancel_at_period_end on Stripe.',
                status: 'EXECUTED'
              }, null, 2)
            }
          ]
        },
        {
          name: '9.3 Admin: Undo Cancellation for Customer',
          request: {
            method: 'POST',
            header: authHeaderNoContentType,
            url: {
              raw: '{{baseURL}}/subscriptions-admin/cancellation-requests/67375a00a12e345678901234/undo',
              host: ['{{baseURL}}'],
              path: ['subscriptions-admin', 'cancellation-requests', '67375a00a12e345678901234', 'undo'],
            },
            description: 'Admin revokes and undos the cancellation on behalf of the customer, keeping subscription active.'
          },
          response: [
            {
              name: 'Success - Revoked by Admin',
              status: 'OK',
              code: 200,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify({
                message: 'Cancellation request revoked by administrator. Subscription active.',
                status: 'UNDONE'
              }, null, 2)
            }
          ]
        }
      ]
    }
  ]
};

// Remove existing 'user-subscription-flow' if present
collection.item = collection.item.filter(i => i.name !== 'user-subscription-flow');

// Insert after 'organization-team' or at index 4
const orgTeamIndex = collection.item.findIndex(i => i.name === 'organization-team');
if (orgTeamIndex !== -1) {
  collection.item.splice(orgTeamIndex + 1, 0, userSubscriptionFlowFolder);
} else {
  collection.item.push(userSubscriptionFlowFolder);
}

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf8');
console.log('Successfully added user-subscription-flow to mordy_postman_collection.json');
