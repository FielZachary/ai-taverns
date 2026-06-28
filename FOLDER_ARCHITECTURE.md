# Folder Architecture

Compact guide for AI agents and contributors working in this repo.

```txt
ai-taverns/
  apps/
    web/
  packages/
    shared/
  infra/
  docs/
  scripts/
```

## `apps/`

Houses runnable applications.

## `apps/web/`

Main commercial website and user app. This should be a Next.js project.

Expected responsibilities:

- Public marketing pages
- Authentication screens
- User dashboard
- Campaign and character management UI
- Live AI dungeon master session UI
- Subscription and billing UI
- Server-side API routes that safely call the configured DM provider

Important Next.js note:

```txt
apps/web/app/
```

is the Next.js App Router directory. It is different from the repo-level
`apps/` folder.

## `packages/`

Shared internal packages used by one or more apps.

## `packages/shared/`

Shared TypeScript code for frontend/backend consistency.

Expected responsibilities:

- Domain types
- Validation schemas
- Shared constants
- Subscription tier definitions
- Campaign, character, message, and session models
- Typed request/response contracts for the DM provider layer

## `infra/`

Deployment and infrastructure configuration.

Expected responsibilities:

- Hosting config
- Docker files
- Database setup notes/config
- Environment templates
- CI/CD or deployment scripts
- Future Terraform or cloud provisioning files

## `docs/`

Project documentation that is not executable code.

Expected responsibilities:

- Product notes
- Architecture decisions
- AI prompt strategy
- Billing and subscription rules
- Data model drafts
- Game design notes
- DM provider integration notes

## `scripts/`

Small utilities for development and operations.

Expected responsibilities:

- Seed demo data
- Run migrations
- Generate test campaigns
- Export/import content
- Maintenance tasks

## DM Provider Boundary

The browser should not call Hermes, DeepSeek, or any model provider directly.

Target request flow:

```txt
Browser
  -> Next.js server/API in apps/web
  -> server-side DM provider abstraction
  -> DeepSeek API
```

The Next.js server should verify auth, subscription status, usage limits, and
request validity before calling the configured DM provider with private
server-side credentials. Existing `hermes_*` database names are legacy
migration details and should be renamed only in a later cleanup pass.

## Root Files

Expected root-level files once the project is scaffolded:

- `README.md` - human-facing project overview and setup
- `FOLDER_ARCHITECTURE.md` - this architecture map
- `.env.example` - documented environment variables
- `.gitignore` - ignored local/generated files
- package manager workspace config, if using a monorepo
