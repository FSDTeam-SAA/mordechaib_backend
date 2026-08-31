type TeamInviteTemplateInput = {
  name: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
};

export function getTeamInviteTemplate({
  name,
  email,
  tempPassword,
  loginUrl,
}: TeamInviteTemplateInput) {
  return {
    subject: "You've been added to the Noltra AI team",
    text: `Hi ${name},\n\nYou've been added as a team member on Noltra AI.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nSign in at ${loginUrl} and you'll be asked to set your own password.\n\nIf you weren't expecting this, please contact your administrator.`,
    html: `
      <div style="margin:0;background:#f6f8fc;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;color:#182033;">
        <div style="max-width:600px;margin:0 auto;">
          <div style="height:7px;border-radius:8px 8px 0 0;background:linear-gradient(90deg,#5b8cff 0%,#c78cff 52%,#ffb4c9 100%);"></div>
          <div style="background:#ffffff;border:1px solid #e6eaf2;border-top:0;border-radius:0 0 16px 16px;overflow:hidden;box-shadow:0 10px 30px rgba(50,65,100,.08);">
            <div style="padding:28px 34px;border-bottom:1px solid #edf0f6;">
              <div style="font-size:20px;font-weight:700;letter-spacing:-.3px;color:#16213b;">Noltra <span style="color:#7191ff;">AI</span></div>
            </div>
            <div style="padding:42px 34px 38px;">
              <div style="display:inline-block;border-radius:999px;background:#f0f4ff;color:#5d7fec;font-size:12px;font-weight:700;letter-spacing:.4px;padding:8px 13px;text-transform:uppercase;">Team invitation</div>
              <h1 style="margin:22px 0 12px;font-size:30px;line-height:1.18;letter-spacing:-.8px;color:#182033;">Welcome, ${name}</h1>
              <p style="margin:0;color:#667085;font-size:16px;line-height:1.65;">You've been added as a team member on Noltra AI. Use the temporary credentials below to sign in — you'll be asked to set your own password right away.</p>
              <div style="margin:30px 0;padding:24px 18px;border:1px solid #e2e7ff;border-radius:14px;background:linear-gradient(135deg,#f7f9ff 0%,#fff8fc 100%);">
                <div style="margin-bottom:14px;">
                  <div style="color:#7b8498;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Email</div>
                  <div style="color:#182033;font-size:16px;font-weight:600;">${email}</div>
                </div>
                <div>
                  <div style="color:#7b8498;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Temporary password</div>
                  <div style="color:#536fe0;font-size:22px;font-weight:700;letter-spacing:2px;">${tempPassword}</div>
                </div>
              </div>
              <a href="${loginUrl}" style="display:inline-block;background:#536fe0;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:10px;">Sign in to Noltra AI</a>
              <p style="margin:24px 0 0;color:#98a2b3;font-size:13px;line-height:1.6;">If you weren't expecting this invitation, please contact your administrator.</p>
            </div>
            <div style="padding:20px 34px;background:#fbfcfe;border-top:1px solid #edf0f6;color:#98a2b3;font-size:12px;line-height:1.6;">This is an automated message from Noltra AI. Please do not reply to this email.</div>
          </div>
        </div>
      </div>`,
  };
}
