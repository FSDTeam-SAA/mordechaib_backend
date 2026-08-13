export function getPasswordResetTemplate(url: string) {
  return {
    subject: 'Reset your Noltra AI password',
    text: `Reset your password by opening this link: ${url}\n\nIf you did not request this, you can ignore this email.`,
  };
}