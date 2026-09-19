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

type OrganizerMeetingConfirmationEmailInput = {
  organizerName: string;
  packageType: string;
  startTime: string;
  endTime: string;
  timezone: string;
  meetingLink?: string;
  hasBookingNote: boolean;
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

export function getOnboardingSetupOrganizerMeetingConfirmationTemplate(
  input: OrganizerMeetingConfirmationEmailInput,
) {
  const subject = 'Your Noltra onboarding meeting is scheduled';
  const text = [
    `Hi ${input.organizerName || 'there'},`,
    '',
    'Your Noltra onboarding and integration meeting has been scheduled.',
    '',
    `Package: ${input.packageType}`,
    `Start: ${input.startTime} (${input.timezone})`,
    `End: ${input.endTime} (${input.timezone})`,
    input.meetingLink
      ? `Join meeting: ${input.meetingLink}`
      : 'The meeting link will be shared by the onboarding team.',
    ...(input.hasBookingNote
      ? ['', 'Your booking note has been shared with the onboarding team.']
      : []),
  ].join('\n');

  return { subject, text };
}
