# Noltra Backend Structure Guide — MongoDB + Mongoose

## Recommended module pattern

```text
src/modules/calls/
├── calls.module.ts
├── calls.controller.ts
├── calls.service.ts
├── calls.repository.ts
├── dto/
│   ├── create-outbound-call.dto.ts
│   └── call-query.dto.ts
├── enums/
│   ├── call-direction.enum.ts
│   └── call-status.enum.ts
└── providers/
    └── twilio-call.provider.ts      # optional
```

## What each file does

- `controller`: routes only.
- `service`: business logic.
- `repository`: MongoDB/Mongoose query.
- `dto`: request validation.
- `providers`: external APIs such as Twilio, HubSpot, Salesforce, Google, Microsoft.

## Database structure

The global MongoDB setup is here:

```text
src/database/mongoose/mongoose.module.ts
```

Shared schemas are here:

```text
src/database/schemas/
```

Example repository pattern:

```ts
constructor(@InjectModel(CallLog.name) private readonly callModel: Model<CallLog>) {}
```

## Add a new feature

Example: add `notes` feature.

1. Create `src/modules/notes`.
2. Add `notes.module.ts`, `notes.controller.ts`, `notes.service.ts`, `notes.repository.ts`.
3. Add DTOs inside `dto/`.
4. Create a Mongoose schema inside `src/database/schemas/note.schema.ts` if persistence is needed.
5. Register the schema in `src/database/mongoose/mongoose.module.ts`.
6. Register `NotesModule` in `app.module.ts`.
7. Add permission/audit log if the action is sensitive.

## Remove a feature

1. Remove the module import from `app.module.ts`.
2. Delete the module folder.
3. Remove related schema from `src/database/schemas/` and `mongoose.module.ts` only if data is no longer needed.
4. Remove related routes from frontend.

## When to create providers

Use providers for external systems:

```text
crm/providers/hubspot.provider.ts
crm/providers/salesforce.provider.ts
calendar/providers/google-calendar.provider.ts
calendar/providers/outlook-calendar.provider.ts
twilio/providers/twilio.provider.ts
```

## When to use common/helpers

Use `common/helpers` only for reusable helper functions used by multiple modules.

Good:

```text
phone.helper.ts
pagination.helper.ts
crypto.helper.ts
date.helper.ts
```

Bad:

```text
createHubSpotLead()
createTwilioSubaccount()
executeAiAction()
```

Those belong to their own modules.
