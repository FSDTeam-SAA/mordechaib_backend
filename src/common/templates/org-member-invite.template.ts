type OrgMemberInviteTemplateInput = {
  name: string;
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  tempPassword: string;
  loginUrl: string;
};

export function getOrgMemberInviteTemplate({
  name,
  email,
  organizationName,
  inviterName,
  role,
  tempPassword,
  loginUrl,
}: OrgMemberInviteTemplateInput) {
  const humanRole = role.replace(/_/g, ' ').toLowerCase();

  return {
    subject: `You've been invited to join ${organizationName} on Noltra AI`,
    text: `Hi ${name},\n\n${inviterName} has invited you to join ${organizationName} on Noltra AI as a ${humanRole}.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nSign in at ${loginUrl} to access your workspace.\n\nIf you were not expecting this, please contact your workspace administrator.`,
    html: `
      <div style="margin:0;background:#f6f8fc;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;color:#182033;">
        <div style="max-width:600px;margin:0 auto;">
          <div style="height:7px;border-radius:8px 8px 0 0;background:linear-gradient(90deg,#5b8cff 0%,#c78cff 52%,#ffb4c9 100%);"></div>
          <div style="background:#ffffff;border:1px solid #e6eaf2;border-top:0;border-radius:0 0 16px 16px;overflow:hidden;box-shadow:0 10px 30px rgba(50,65,100,.08);">
            <div style="padding:28px 34px;border-bottom:1px solid #edf0f6;display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:20px;font-weight:700;letter-spacing:-.3px;color:#16213b;">Noltra <span style="color:#7191ff;">AI</span></div>
              <div style="font-size:13px;font-weight:600;color:#667085;background:#f2f4f8;padding:4px 10px;border-radius:6px;">${organizationName}</div>
            </div>
            <div style="padding:42px 34px 38px;">
              <div style="display:inline-block;border-radius:999px;background:#f0f4ff;color:#5d7fec;font-size:12px;font-weight:700;letter-spacing:.4px;padding:8px 13px;text-transform:uppercase;">Workspace Invitation</div>
              <h1 style="margin:22px 0 12px;font-size:28px;line-height:1.2;letter-spacing:-.8px;color:#182033;">Welcome, ${name}</h1>
              <p style="margin:0;color:#667085;font-size:16px;line-height:1.65;">
                <strong style="color:#182033;">${inviterName}</strong> has invited you to collaborate on <strong style="color:#182033;">${organizationName}</strong> as a <strong>${humanRole}</strong>. Use your temporary credentials below to sign in:
              </p>
              <div style="margin:28px 0;padding:24px 20px;border:1px solid #e2e7ff;border-radius:14px;background:linear-gradient(135deg,#f7f9ff 0%,#fff8fc 100%);">
                <div style="margin-bottom:14px;">
                  <div style="color:#7b8498;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Login Email</div>
                  <div style="color:#182033;font-size:16px;font-weight:600;">${email}</div>
                </div>
                <div>
                  <div style="color:#7b8498;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Temporary Password</div>
                  <div style="color:#536fe0;font-size:22px;font-weight:700;letter-spacing:2px;font-family:monospace;">${tempPassword}</div>
                </div>
              </div>
              <a href="${loginUrl}" style="display:inline-block;background:#536fe0;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:10px;box-shadow:0 4px 12px rgba(83,111,224,0.35);">Sign in to Workspace</a>
              <p style="margin:24px 0 0;color:#98a2b3;font-size:13px;line-height:1.6;">You'll be prompted to update your password when you log in. If you were not expecting this invitation, you can safely ignore this email.</p>
            </div>
            <div style="padding:20px 34px;background:#fbfcfe;border-top:1px solid #edf0f6;color:#98a2b3;font-size:12px;line-height:1.6;">This is an automated invitation from Noltra AI on behalf of ${organizationName}.</div>
          </div>
        </div>
      </div>`,
  };
}
