export type UsagePeriodSubscription = {
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  billingInterval?: string;
};

export function resolveUsagePeriod(
  subscription?: UsagePeriodSubscription,
  now = new Date(),
) {
  if (
    subscription?.billingInterval !== 'year' &&
    subscription?.currentPeriodStart &&
    subscription.currentPeriodEnd
  ) {
    return {
      periodStart: new Date(subscription.currentPeriodStart),
      periodEnd: new Date(subscription.currentPeriodEnd),
    };
  }

  return {
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    periodEnd: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ),
  };
}
