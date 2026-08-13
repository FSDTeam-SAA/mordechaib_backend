export enum RetentionOfferChoice {
  // "Get 20% off" — UI-only placeholder for now, no discount logic wired
  // up yet (deliberately deferred).
  DISCOUNT = 'DISCOUNT',
  PAUSE = 'PAUSE',
  DOWNGRADE = 'DOWNGRADE',
  SPECIALIST = 'SPECIALIST',
  // Clicked "No thanks, continue cancel" — declined all offers.
  NONE = 'NONE',
}