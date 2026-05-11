# AI Agent Instructions

→ See `CLAUDE.md` for the canonical AppHarbor cartridge development guide.

This file exists for AI agents that look for `AGENTS.md` by convention.
The content is intentionally short — please read CLAUDE.md for full details.

## TL;DR

This is an AppHarbor cartridge. Five rules to remember:

1. All tables need `organization_id` column
2. All queries filter by organization_id
3. Server Actions call `requireApp(slug, 'cartridge-id')` first
4. Schema is idempotent (`CREATE IF NOT EXISTS`)
5. RLS policies use `auth.jwt() ->> 'organization_id'`

Imports: `@/sdk`, `react`, `next/*`, relative, npm.
Forbidden: `@/lib/*`, `@/components/*`, `@/app/*`.

Reference: github.com/Tori-Take/cart-patrol-navi
