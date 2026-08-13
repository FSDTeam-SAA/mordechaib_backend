export enum CancellationRequestStatus {
  // Waiting out the 7-day grace period.
  SCHEDULED = 'SCHEDULED',
  // The org clicked "Undo cancellation" before it took effect.
  UNDONE = 'UNDONE',
  // Stripe cancellation actually applied — either by the nightly cron
  // once the grace period elapsed, or by an admin acting early.
  EXECUTED = 'EXECUTED',
}