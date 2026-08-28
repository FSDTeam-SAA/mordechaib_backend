# Client Setup Guide: Zoom and Google Meet AI Notetaker

This guide explains how to prepare the accounts and information needed to
enable the AI meeting notetaker for Zoom and Google Meet.

You do not need to write code. Please complete each checkbox in order. If a
screen looks different, send your implementation contact a screenshot with all
passwords, keys, meeting links, and personal information hidden.

## Important security notice

Please do not send passwords, verification codes, recovery codes, private keys,
API keys, or client secrets through normal email, WhatsApp, Slack, or a shared
document.

Use one of these methods instead:

- Invite the implementation contact to the relevant business account with the
  minimum required role.
- Use a password manager such as 1Password, Bitwarden, or LastPass.
- Use an approved encrypted, expiring secret-sharing link.

The company should own every account. Avoid using an employee's personal Zoom
or Google account.

## What will be connected

| Service             | Why it is needed                                                   | Who should own it   |
| ------------------- | ------------------------------------------------------------------ | ------------------- |
| Recall.ai           | Sends the bot, records the meeting, and produces media             | Client company      |
| Zoom                | Lets an organizer create and host meetings from the dashboard      | Client company      |
| Google Meet         | Allows guest entry, or provides a dedicated signed-in bot identity | Client company      |
| Application backend | Receives secure status notifications and stores transcripts        | Implementation team |

The implementation team will provide these two URLs before setup:

```text
Production backend URL: [PROVIDED BY IMPLEMENTATION TEAM]
Recall webhook URL:     [BACKEND URL]/api/v1/webhooks/recall
Zoom redirect URL:      [BACKEND URL]/api/v1/zoom-meetings/oauth/callback
Google redirect URL:    [BACKEND URL]/api/v1/google-meetings/oauth/callback
```

The backend URL must be a permanent HTTPS address. Do not use a temporary ngrok
address for production.

---

## Part 1 — Create the Recall.ai account

### Step 1. Choose the correct region

Recall regions are separate. API keys and resources created in one region will
not work in another region. Confirm the region with the implementation team
before creating anything.

Available regions:

| Location   | Region value     | Recall address                     |
| ---------- | ---------------- | ---------------------------------- |
| US West    | `us-west-2`      | `https://us-west-2.recall.ai`      |
| US East    | `us-east-1`      | `https://us-east-1.recall.ai`      |
| Europe     | `eu-central-1`   | `https://eu-central-1.recall.ai`   |
| Asia/Tokyo | `ap-northeast-1` | `https://ap-northeast-1.recall.ai` |

- [ ] The implementation team confirmed the region.
- [ ] I created the Recall account using a company-controlled email address.
- [ ] Billing or sufficient account credit is active.
- [ ] I recorded the selected region in the handoff form at the end of this guide.

Official guidance: [Recall regions and signup](https://docs.recall.ai/docs/regions).

### Step 2. Create a dedicated API key

1. Sign in to the selected Recall regional dashboard.
2. Open **Developers**, then **API Keys & Secrets**.
3. Create a new API key.
4. Name it clearly, for example `Noltra Production Backend`.
5. Copy it when shown and place it in the approved secure-sharing tool.

- [ ] A production API key was created.
- [ ] The API key was shared securely with the implementation team.
- [ ] The API key was not pasted into this document.

Create separate keys for development and production. This makes it possible to
revoke one environment without interrupting the other.

### Step 3. Create the webhook verification secret

This secret proves that meeting updates really came from Recall.

1. In Recall, open **Developers**, then **API Keys & Secrets**.
2. Select **Create Workspace Secret**.
3. Copy the value beginning with `whsec_`.
4. Save it in the approved secure-sharing tool.

- [ ] The workspace secret begins with `whsec_`.
- [ ] It was shared securely with the implementation team.
- [ ] It was not pasted into this document.

Official guidance: [Verifying requests from Recall](https://docs.recall.ai/docs/authenticating-requests-from-recallai).

### Step 4. Add the webhook endpoint

1. In the same Recall regional dashboard, open **Webhooks**.
2. Click **Add Endpoint**.
3. Paste the exact webhook URL supplied by the implementation team:

   ```text
   [BACKEND URL]/api/v1/webhooks/recall
   ```

4. Subscribe to the following events:

   ```text
   bot.*
   recording.done
   recording.failed
   transcript.done
   transcript.failed
   ```

5. Save the endpoint.
6. If Recall offers **Send test** or **Test endpoint**, send a test and tell the
   implementation team when it was sent.

- [ ] The endpoint uses the permanent production HTTPS URL.
- [ ] There is no trailing space in the URL.
- [ ] All listed events are selected.
- [ ] A test webhook was sent successfully.

Changing the backend URL does not automatically update Recall. If the domain
changes, the endpoint in the Recall dashboard must also be changed.

Official guidance: [Webhook setup](https://docs.recall.ai/docs/status-change-webhooks-setup-verification)
and [recording events](https://docs.recall.ai/docs/recording-webhooks).

---

## Part 2 — Prepare the organizer Zoom connection

### Step 1. Choose the organizer Zoom account

Choose a company-owned Zoom user who will own meetings created from the
dashboard. The Recall bot uses short-lived authorization from this same meeting
owner when it joins; do not create a separate bot user for this Phase 1 flow.
A suggested organizer profile is:

```text
First name: Meeting organizer's real first name
Last name: Meeting organizer's real last name
Email: organizer@[client-company-domain]
```

Use an appropriate paid Zoom license for production. Free accounts and a single
account may have simultaneous meeting limitations.

- [ ] The Zoom account belongs to the company.
- [ ] The account can sign in successfully.
- [ ] It is the account that should own meetings created by this organization.
- [ ] Recovery and multi-factor authentication are controlled by the company.

Do not send the organizer's Zoom password or MFA code to the implementation
team. The organizer authorizes access through Zoom's own consent screen.

### Step 2. Create the Zoom OAuth application

1. Sign in to the [Zoom App Marketplace](https://marketplace.zoom.us/develop/create)
   using a company account allowed to create applications.
2. Create a **General App / OAuth App**. If Zoom asks for the management type,
   choose the user-managed option suitable for authorizing the dedicated user.
3. Use a clear name, for example `Noltra Meeting Bot`.
4. Complete the basic company and contact-information fields.
5. Enable OAuth.
6. Add this exact OAuth Redirect URL:

   ```text
   [BACKEND URL]/api/v1/zoom-meetings/oauth/callback
   ```

7. Add the same URL to Zoom's OAuth allow list if that field is shown.
8. Add the following Zoom scopes (Zoom may show newer granular names):

   ```text
   user_info:read
   user:read:zak
   meeting:read
   meeting:write
   ```

9. Save or activate the app for use by the dedicated company account.

- [ ] The redirect URL exactly matches the URL supplied by the implementation team.
- [ ] Profile, ZAK, meeting-read, and meeting-write permissions are present.
- [ ] The Zoom OAuth Client ID was copied into the handoff form.
- [ ] The Zoom Client Secret remains in the secure vault and was not pasted here.

Official guidance: [Recall signed-in Zoom bots](https://docs.recall.ai/docs/zoom-signed-in-bots).

### Step 3. Register the Zoom OAuth app with Recall

The Zoom client secret should be stored with Recall, not in the application
backend.

1. Open the Recall dashboard in the same region selected in Part 1.
2. Open the Zoom OAuth app/credential setup area or Recall API Explorer.
3. Create a Zoom OAuth App entry using the Zoom application's:

   - Client ID
   - Client Secret
   - Zoom webhook secret token, if the Recall form requests it

4. Save the entry.
5. Copy the ID returned by Recall. This is the **Recall Zoom OAuth App ID**.

- [ ] Zoom OAuth credentials were entered directly into Recall.
- [ ] The Recall Zoom OAuth App ID was copied into the handoff form.
- [ ] The Zoom Client Secret was not sent through normal email or messaging.

If you cannot find this screen, invite the implementation contact to Recall or
complete this step together on a screen-sharing call. Do not send screenshots
that show the client secret.

### Step 4. Complete the one-time Zoom connection

After the implementation team has configured the Client ID and Recall Zoom
OAuth App ID:

1. Sign in to the organizer dashboard and click **Connect Zoom**.
2. Open it promptly; the link expires after approximately 10 minutes.
3. Sign in as the company organizer who should own the created meetings.
4. Review and approve the requested permission.
5. Wait for the success page before closing the browser.
6. Ask the implementation team to confirm that the connection shows
   `connected: true`.

- [ ] The organizer completed authorization.
- [ ] The implementation team confirmed the connection.
- [ ] A short Zoom test meeting was completed.

The authorization link means the implementation team does not need the Zoom
user's password.

---

## Part 3 — Choose the Google Meet bot type

Choose one of the following options with the implementation team.

### Option A — Guest Google Meet bot

This is the simplest bot identity and does not require a dedicated Google bot
account. The organizer still connects their own Google account to the
application so it can create the Calendar event and Google Meet link.

The meeting host or an eligible participant normally needs to admit the bot.
Some organizations block guests or disable knocking; the bot will not be able
to join those meetings.

- [ ] We accept that a participant may need to admit the bot.
- [ ] We do not require a custom Google profile image for the bot.
- [ ] We selected **Guest mode** in the handoff form.

If Guest mode is selected, complete the organizer Google connection below and
then skip only the signed-in bot setup in Option B.

### Organizer Google connection (required for creating Meet links)

The company must create one Google Cloud OAuth application. Individual
organizers then click **Connect Google** in the dashboard; nobody sends their
Google password to the implementation team.

1. Create or select a company-owned project in Google Cloud Console.
2. Enable the **Google Calendar API**.
3. Configure the OAuth consent screen with the company name and support email.
4. Create a **Web application** OAuth client.
5. Add this exact authorized redirect URI:

   ```text
   [BACKEND URL]/api/v1/google-meetings/oauth/callback
   ```

6. Share the Client ID normally and the Client Secret only through the approved
   secure channel.
7. If the app remains in Testing mode, add each organizer as a test user.
8. After deployment, an owner or administrator clicks **Connect Google** and
   approves permission to create and manage Calendar events.

- [ ] Google Calendar API is enabled.
- [ ] OAuth consent screen is configured.
- [ ] The redirect URI exactly matches the backend callback.
- [ ] Client ID and Client Secret were delivered through the correct channels.
- [ ] An owner or administrator completed the dashboard connection.

### Option B — Signed-in Google Meet bot

Use this option when meetings require Google sign-in, guest knocking is blocked,
or the bot needs a recognizable Google identity.

This setup requires a new dedicated paid Google Workspace and organization-wide
SSO changes. Do not apply these changes to the company's existing Workspace.
Complete this section with a Google Workspace administrator and the
implementation team.

Official guidance: [Recall signed-in Google Meet bots](https://docs.recall.ai/docs/google-meet-login-getting-started).

### Step 1. Create a separate Google Workspace

1. Create a new paid [Google Workspace](https://workspace.google.com/) solely
   for bot accounts.
2. Use a new domain or suitable subdomain as its primary domain, for example:

   ```text
   sso.client-company.com
   ```

3. Do not reuse the company's existing Google Workspace. Recall's signed-in
   setup requires an organization-wide SSO policy that could otherwise disrupt
   employee logins.
4. Create a standard, non-admin user for the first bot:

   ```text
   Email: meeting-bot-01@sso.client-company.com
   Name:  Noltra AI Notetaker
   ```

5. Sign in to the bot account manually once and accept Google's first-login
   terms before enabling SSO.
6. Add an approved profile image and display name.

- [ ] A separate paid Workspace was created.
- [ ] The bot user is a standard user, not an administrator.
- [ ] The bot user completed its first manual sign-in.
- [ ] The account profile is client-approved.

An administrator account cannot be used as the bot login.

### Step 2. Create a Google Login Group in Recall

1. Open the Recall dashboard for the region selected in Part 1.
2. Open **Explorer**, then **Google Logins**.
3. Click **Create Group**.
4. Suggested name:

   ```text
   Noltra Production Google Meet Bots
   ```

5. For the first test, set login mode to **Always sign in** / `always`.
6. Save and copy the Google Login Group ID.

- [ ] The login group was created in the same region as the API key.
- [ ] Test login mode is set to `always`.
- [ ] The Login Group ID was copied into the handoff form.

### Step 3. Configure the dedicated Workspace SSO

This step should be completed during a guided call with the implementation team
or an IT administrator.

1. Generate an RSA private key and self-signed certificate. Store both securely.
2. In Google Admin, open:

   **Security → Authentication → SSO with third-party identity provider**

3. Add a SAML/legacy SSO profile.
4. Use the Recall URLs for the selected region:

   ```text
   Sign-in URL:  https://[RECALL-REGION].recall.ai/api/v1/bot/gmeet-sign-in
   Sign-out URL: https://[RECALL-REGION].recall.ai/api/v1/bot/gmeet-sign-out
   ```

   Example for region `ap-northeast-1`:

   ```text
   https://ap-northeast-1.recall.ai/api/v1/bot/gmeet-sign-in
   https://ap-northeast-1.recall.ai/api/v1/bot/gmeet-sign-out
   ```

5. Upload the generated certificate.
6. Enable **Use a domain-specific issuer**.
7. Assign the legacy SSO profile as instructed in the official Recall guide.

- [ ] The URLs use the same Recall region as the API key.
- [ ] The certificate and private key are backed up securely.
- [ ] The SSO policy was applied only to the dedicated bot Workspace.

Never email or paste the private key into this document.

### Step 4. Add the Google login to Recall

1. Return to Recall **Explorer → Google Logins**.
2. Create a login in the group from Step 2.
3. Provide Recall with:

   - Google Login Group
   - Dedicated Workspace primary domain
   - Dedicated bot email address
   - SSO certificate
   - SSO private key
   - Active status enabled

4. Save the login.
5. Confirm the login appears as active inside the selected group.

The SSO certificate/private key should be entered directly into Recall. The
application backend only needs the Google Login Group ID.

- [ ] The Google login is active in Recall.
- [ ] No Google password or SSO private key was sent to the implementation team.
- [ ] A signed-in Google Meet test was completed.

For higher concurrent usage, additional standard bot users can be added to the
same login group. Keep their display names and profile photos consistent.

### Step 5. Calendar invitation behavior

To help a signed-in bot bypass the Google Meet waiting room, add the bot's email
address to the meeting's calendar invitation. If multiple bot users are used,
the implementation team may recommend a Google Group containing all bot users.

Google Calendar synchronization is not required for the current manual meeting
bot feature and should not be configured as part of this handoff unless it is a
separately approved project.

---

## Part 4 — Information to send to the implementation team

Complete this form. Leave all secret values out of the document and send those
through the approved secure channel.

### General

```text
Client/company name:
Primary contact name:
Primary contact email:
Environment: Development / Production
Approved bot display name:
Approved recording consent message:
```

### Recall.ai

```text
Recall account owner email:                    [email only, no password]
Recall region:                                 [for example ap-northeast-1]
Billing/credits active:                        Yes / No
Production API key created:                    Yes / No
API key shared through secure channel:         Yes / No
Workspace webhook secret created:              Yes / No
Webhook secret shared through secure channel:  Yes / No
Webhook endpoint added:                        Yes / No
Test webhook sent:                             Yes / No
```

### Zoom

```text
Connected Zoom organizer email:                [email only, no password]
Zoom app name:
Zoom OAuth Client ID:
Required profile/ZAK/meeting scopes added:      Yes / No
Redirect URL added exactly:                    Yes / No
Recall Zoom OAuth App ID:
Zoom secret entered directly in Recall:        Yes / No
Organizer dashboard authorization complete:    Yes / No
```

### Google Meet

```text
Selected mode:                                 Guest / Signed-in
Google Cloud project name:
Google OAuth Client ID:
Google OAuth Client Secret shared securely:    Yes / No
Google redirect URL added exactly:              Yes / No
Organizer dashboard connection complete:       Yes / No

If Signed-in:
Dedicated Workspace primary domain:
Dedicated bot email:                           [email only, no password]
Bot user is non-admin:                         Yes / No
First manual login completed:                  Yes / No
Recall Google Login Group name:
Recall Google Login Group ID:
Active Google login visible in Recall:          Yes / No
SSO key/certificate entered directly in Recall: Yes / No
```

### Secret items sent separately

Only confirm delivery here; never paste the values:

```text
Recall API key delivered securely:             Yes / No
Recall workspace secret delivered securely:    Yes / No
```

The backend does not need the following items and they should not be sent:

- Zoom user password or MFA code
- Google user/admin password or MFA code
- Zoom OAuth Client Secret, once entered directly into Recall
- Google SSO private key, once entered directly into Recall
- Personal recovery codes

---

## Part 5 — Final acceptance test

Complete one short meeting on each enabled platform.

### Google Meet

- [ ] The bot appeared in the meeting or waiting room.
- [ ] The bot was admitted when Guest mode was used.
- [ ] The bot showed the expected Google profile when Signed-in mode was used.
- [ ] Participants saw the recording consent message.
- [ ] The meeting was recorded for at least one minute with clear speech.
- [ ] The final status became `COMPLETED`.
- [ ] The transcript was available.
- [ ] The audio download was available.

### Zoom

- [ ] The Zoom organizer authorization was connected.
- [ ] The bot appeared in the meeting or waiting room.
- [ ] Participants saw the recording consent message.
- [ ] The meeting was recorded for at least one minute with clear speech.
- [ ] The final status became `COMPLETED`.
- [ ] The transcript was available.
- [ ] The audio download was available.

If a meeting ends but remains at `JOINING` or `PROCESSING`, do not create more
accounts or rotate credentials immediately. Ask the implementation team to
check the Recall webhook delivery log first.

## Official references

- [Recall regions and signup](https://docs.recall.ai/docs/regions)
- [Recall webhook setup](https://docs.recall.ai/docs/status-change-webhooks-setup-verification)
- [Recall webhook request verification](https://docs.recall.ai/docs/authenticating-requests-from-recallai)
- [Recall recording webhooks](https://docs.recall.ai/docs/recording-webhooks)
- [Signed-in Zoom bots](https://docs.recall.ai/docs/zoom-signed-in-bots)
- [Signed-in Google Meet bots](https://docs.recall.ai/docs/google-meet-login-getting-started)
- [Google Meet FAQ](https://docs.recall.ai/docs/google-meet-faq)
