export function getPasswordResetTemplate(code: string) {
  return {
    subject: `${code} is your Noltra AI password reset code`,
    text: `Your Noltra AI password reset code is: ${code}\n\nThis code expires in 1 hour and can only be used once. If you did not request a password reset, you can safely ignore this email.`,
    html: `
      <div style="margin:0;background:#f6f8fc;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;color:#182033;">
        <div style="max-width:600px;margin:0 auto;">
          <div style="height:7px;border-radius:8px 8px 0 0;background:linear-gradient(90deg,#5b8cff 0%,#c78cff 52%,#ffb4c9 100%);"></div>
          <div style="background:#ffffff;border:1px solid #e6eaf2;border-top:0;border-radius:0 0 16px 16px;overflow:hidden;box-shadow:0 10px 30px rgba(50,65,100,.08);">
            <div style="padding:28px 34px;border-bottom:1px solid #edf0f6;">
              <div style="font-size:20px;font-weight:700;letter-spacing:-.3px;color:#16213b;">Noltra <span style="color:#7191ff;">AI</span></div>
            </div>
            <div style="padding:42px 34px 38px;">
              <div style="display:inline-block;border-radius:999px;background:#f0f4ff;color:#5d7fec;font-size:12px;font-weight:700;letter-spacing:.4px;padding:8px 13px;text-transform:uppercase;">Account security</div>
              <h1 style="margin:22px 0 12px;font-size:30px;line-height:1.18;letter-spacing:-.8px;color:#182033;">Reset your password</h1>
              <p style="margin:0;color:#667085;font-size:16px;line-height:1.65;">We received a request to reset your Noltra AI password. Enter the verification code below to continue securely.</p>
              <div style="margin:30px 0;padding:24px 18px;border:1px solid #e2e7ff;border-radius:14px;background:linear-gradient(135deg,#f7f9ff 0%,#fff8fc 100%);text-align:center;">
                <div style="margin-bottom:10px;color:#7b8498;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">Your verification code</div>
                <div style="color:#536fe0;font-size:38px;font-weight:700;letter-spacing:10px;line-height:1.2;padding-left:10px;">${code}</div>
              </div>
              <p style="margin:0;color:#667085;font-size:14px;line-height:1.6;"><strong style="color:#344054;">This code expires in 1 hour</strong> and can only be used once.</p>
              <p style="margin:24px 0 0;color:#98a2b3;font-size:13px;line-height:1.6;">If you did not request a password reset, you can safely ignore this email. Your password will not change unless this code is used.</p>
            </div>
            <div style="padding:20px 34px;background:#fbfcfe;border-top:1px solid #edf0f6;color:#98a2b3;font-size:12px;line-height:1.6;">This is an automated message from Noltra AI. Please do not reply to this email.</div>
          </div>
        </div>
      </div>`,
  };
}
