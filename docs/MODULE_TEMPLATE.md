# Module Template

Copy this pattern when adding a new feature.

```text
src/modules/feature-name/
├── feature-name.module.ts
├── feature-name.controller.ts
├── feature-name.service.ts
├── feature-name.repository.ts
├── dto/
│   ├── create-feature.dto.ts
│   └── query-feature.dto.ts
├── enums/
│   └── feature-status.enum.ts
└── providers/
    └── external-api.provider.ts    # only when needed
```

## Rule

- Controller: route only.
- Service: business logic.
- Repository: database.
- Provider: external API.
- DTO: validation.

## Example flow

```text
Request → Controller → Service → Repository/Provider → Response
```
