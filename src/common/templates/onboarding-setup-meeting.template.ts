type OnboardingMeetingEmailInput = {
  organizerName: string;
  organizerEmail: string;
  organizationId: string;
  setupId: string;
  packageType: string;
  startTime: string;
  endTime: string;
  timezone: string;
  meetingLink?: string;
};

export function getOnboardingSetupMeetingTemplate(
  input: OnboardingMeetingEmailInput,
) {
  const meetingLink =
    input.meetingLink || 'The meeting link will be provided separately.';
  const subject = `New onboarding integration meeting - ${input.organizerName}`;
  const text = [
    'A new onboarding integration meeting has been scheduled.',
    '',
    `Organizer: ${input.organizerName}`,
    `Organizer email: ${input.organizerEmail}`,
    `Organization ID: ${input.organizationId}`,
    `Setup ID: ${input.setupId}`,
    `Package: ${input.packageType}`,
    `Start: ${input.startTime} (${input.timezone})`,
    `End: ${input.endTime} (${input.timezone})`,
    `Meeting link: ${meetingLink}`,
  ].join('\n');

  return { subject, text };
}
