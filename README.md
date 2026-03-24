# Liquidation App

Inventory workflow for liquidation businesses: upload B-Stock style manifest CSVs, review deduplicated lines, attach photos, set discounts, send to admin approval, and publish to Shopify.

## Stack

- Next.js (App Router), PostgreSQL, Drizzle ORM, Auth.js, OpenAI (optional), Shopify Admin API (optional).

## Setup

1. Copy [`.env.example`](./.env.example) to `.env.local` and fill in values.
2. `npm install`
3. `npm run db:push` — apply schema (requires `DATABASE_URL`).
4. `npm run db:seed` — create default `admin@example.com` and `employee@example.com` users (passwords printed in the console).
5. `npm run dev` — open [http://localhost:3000](http://localhost:3000).

### Local UI preview without login

Set `AUTH_DEV_BYPASS=true` in `.env.local` (development only; see `.env.example`).

## Scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `npm run dev`     | Development server         |
| `npm run build`   | Production build           |
| `npm run lint`    | ESLint                     |
| `npm run test`    | Vitest                     |
| `npm run db:push` | Push Drizzle schema to DB  |
| `npm run db:seed` | Seed users                 |

## Publish to GitHub

Git is initialized on `main` with an initial commit. If GitHub CLI is logged in:

```bash
cd liquidation-inventory
gh auth login
gh repo create liquidation-app --private --source=. --remote=origin --push --description "Liquidation inventory web app"
```

Use another repo name if you prefer (GitHub URLs cannot contain spaces; `liquidation-app` or `Liquidation-App` are typical).

**Without `gh`:** create an empty repository named e.g. `liquidation-app` on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/liquidation-app.git
git push -u origin main
```

Set your commit identity if needed:

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

## License

Private / your use only unless you add a license.
