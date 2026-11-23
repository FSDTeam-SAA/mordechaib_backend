export const DEFAULT_UNAVAILABLE_MESSAGE =
  'Thank you for calling. The business owner is currently unavailable to take your call. Please try calling back later or reach out to us directly.';

export const DEFAULT_AFTER_HOURS_MESSAGE =
  'Thank you for calling. Our office is currently closed. Please call back during our normal business hours.';

export const DEFAULT_TWILIO_VOICE_ATTRIBUTES = {
  voice: 'Polly.Amy' as const,
  language: 'en-US' as const,
};

export const DEFAULT_DIAL_TIMEOUT_SECONDS = 25;
