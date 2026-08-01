export function getEmailVerificationTemplate(url: string) {
  return {
    subject: 'Verify your Noltra AI email',
    text: `Verify your email by opening this link: ${url}\n\nThis link expires soon and can only be used once.`,
  };
}