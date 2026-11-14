/** What a business memory is about. */
export enum BusinessMemoryKind {
  /** Who an important customer is and what matters about them. */
  CUSTOMER = 'CUSTOMER',
  /** How a customer likes to work (channel, timing, pricing, contacts). */
  PREFERENCE = 'PREFERENCE',
  /** What was discussed or agreed in a meeting or call. */
  MEETING = 'MEETING',
  /** Something the owner promised. */
  COMMITMENT = 'COMMITMENT',
  /** What an employee is responsible for. */
  RESPONSIBILITY = 'RESPONSIBILITY',
  /** A company goal. */
  GOAL = 'GOAL',
  /** A revenue, cost, margin or other financial target. */
  FINANCIAL_TARGET = 'FINANCIAL_TARGET',
  /** A decision that was taken. */
  DECISION = 'DECISION',
  /** Something still outstanding. */
  OPEN_ITEM = 'OPEN_ITEM',
}

/**
 * Memories proposed by Laura wait for the owner (PENDING_REVIEW). Only ACTIVE
 * memories are ever given back to the AI.
 */
export enum BusinessMemoryStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

export enum BusinessMemorySourceType {
  /** Learned by an AI agent from an organizer chat message. */
  USER_MESSAGE = 'USER_MESSAGE',
  /** Written by the owner or an admin. */
  MANUAL = 'MANUAL',
}
