# @tennis/admin — placeholder

This is an **empty workspace placeholder** (Architecture Plan Decision #14).

- **No Refine** is installed here.
- **No `@prisma/client`** dependency and **no database connection string** — admin
  talks to the API over HTTP only (Decision #9 / §9 Risk #12).
- No admin UI, `dataProvider`, or `authProvider` code exists yet.

Refine and the real admin app are introduced in **Phase 3**, once the `/v1/admin/*`
endpoints exist for it to point at. Until then this package exists purely so the
pnpm workspace graph and CI are correct from day one.
