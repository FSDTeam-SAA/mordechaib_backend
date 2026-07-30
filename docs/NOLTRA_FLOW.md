# Noltra Core Backend Flow

## Incoming call

```text
Customer calls Twilio number
→ Twilio webhook hits /webhooks/twilio/voice
→ Backend finds organization by phone number
→ Twilio forwards call to CEO real number
→ Recording callback received
→ Call saved
→ AI analysis job created
→ AI creates summary/actions
→ Approval created
→ CEO approves
→ CRM/task/calendar updated
```

## Outgoing call

```text
CEO clicks Call
→ Backend calls Twilio API
→ Twilio calls CEO first
→ CEO answers
→ Twilio connects client
→ Recording callback
→ AI summary/actions
```

## CRM action

```text
AI suggests Create Lead
→ Approval created
→ CEO approves
→ CRM service resolves provider
→ HubSpot or Salesforce provider called
→ Audit log saved
```

## Calendar action

```text
AI suggests meeting
→ Availability checked
→ Approval created
→ CEO approves
→ Google/Outlook event created
→ CRM note/task saved
```
