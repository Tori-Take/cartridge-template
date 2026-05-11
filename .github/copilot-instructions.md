# GitHub Copilot Instructions for AppHarbor Cartridge

This repository is an AppHarbor cartridge template. See `CLAUDE.md` for full guide.

## Critical rules (must follow)

1. Every table must have `organization_id uuid NOT NULL REFERENCES organizations(id)` column
2. Every query must filter by `.eq('organization_id', ctx.actor.organizationId)`
3. Server Actions must call `requireApp(slug, '<cartridge-id>')` at the top
4. Schemas must be idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
5. RLS policies use `organization_id = (auth.jwt() ->> 'organization_id')::uuid`

## Allowed imports

- `@/sdk` and `@/sdk/*` (platform SDK)
- `@/sdk/client` (browser-side)
- `react`, `react-dom`, `next/*`
- Relative paths
- npm packages

## Forbidden imports

- `@/lib/*`, `@/components/*`, `@/app/*` (Studio internals)

## Reference implementation

See [Tori-Take/cart-patrol-navi](https://github.com/Tori-Take/cart-patrol-navi) for a real-world cartridge.
