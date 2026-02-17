# Phase 1 Backend Folder Structure (NestJS)

```text
src/
  common/
    constants/
    decorators/
    types/
  config/
  prisma/
    prisma.module.ts
    prisma.service.ts
  modules/
    health/
      health.module.ts
      health.controller.ts
      health.service.ts
    auth/
      auth.module.ts
      controllers/
      services/
      dto/
    organizations/
      organizations.module.ts
      controllers/
      services/
      dto/
    projects/
      projects.module.ts
      controllers/
      services/
      dto/
    requirements/
      requirements.module.ts
      controllers/
      services/
      dto/
    estimates/
      estimates.module.ts
      controllers/
      services/
      dto/
    tech-stack/
      tech-stack.module.ts
      controllers/
      services/
      dto/
    ai/
      ai.module.ts
      controllers/
      services/
      dto/
    billing/
      billing.module.ts
      controllers/
      services/
      dto/
    integrations/
      integrations.module.ts
      email/
      storage/
      voice/
```

## Why this split

- Domain-first modules keep Phase 1 delivery clear and parallelizable.
- `integrations/` isolates third-party adapters (Stripe/SendGrid/R2/ElevenLabs).
- `common/` centralizes shared app-level utilities.
- DTO folders make the API contract explicit from day one.

## Next implementation order

1. Auth + Organization membership (JWT + roles)
2. Project intake + project input (text/voice)
3. Requirement generation pipeline
4. Feature + estimate snapshot pipeline
5. Billing + usage + webhook hardening
