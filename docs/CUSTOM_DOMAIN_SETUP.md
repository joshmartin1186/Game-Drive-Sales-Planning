# Custom Domain Setup: coverage.game-drive.nl

## Overview
Configure `coverage.game-drive.nl` to serve the client-facing coverage feeds.
After setup, client feeds will be accessible at `coverage.game-drive.nl/{game-slug}`.

## Step 1: DNS Configuration (GameDrive)

Add a CNAME record in your DNS provider for `game-drive.nl`:

| Type  | Name      | Value              | TTL  |
|-------|-----------|--------------------|------|
| CNAME | coverage  | cname.vercel-dns.com | 3600 |

**Alternative (A record):** If your DNS provider doesn't support CNAME on subdomains:

| Type | Name     | Value        |
|------|----------|--------------|
| A    | coverage | 76.76.21.21  |

> Note: Vercel's IP may change. The CNAME approach is preferred.

## Step 2: Vercel Domain Configuration

1. Go to the Vercel project dashboard
2. Navigate to **Settings → Domains**
3. Add `coverage.game-drive.nl`
4. Vercel will verify DNS and provision SSL automatically
5. SSL certificate is issued within minutes

## Step 3: Environment Variables (Optional)

If you want generated URLs to use the custom domain:

```
NEXT_PUBLIC_APP_URL=https://coverage.game-drive.nl
```

Set this in Vercel → Project Settings → Environment Variables.

## How It Works

- `coverage.game-drive.nl/{slug}` → routes to `/feed/{slug}` page
- The feed page is public (no authentication required)
- Password-protected feeds still prompt for a password
- SSL is handled automatically by Vercel
- No code changes needed — the app is already domain-agnostic

## URL Structure

| URL | Description |
|-----|-------------|
| `coverage.game-drive.nl/sprint-city` | Coverage feed for "Sprint City" |
| `coverage.game-drive.nl/some-game` | Coverage feed for "Some Game" |
| `coverage.game-drive.nl/invalid` | Shows 404 page |

## Routing Note

Currently the feed is at `/feed/{slug}`. If you want feeds at the root path (`/{slug}`), a Vercel rewrite can be added to `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/:slug", "destination": "/feed/:slug" }
  ]
}
```

> **Important:** Only add this rewrite on the `coverage.game-drive.nl` domain, not the main app domain, to avoid routing conflicts.

## Troubleshooting

- **SSL not working:** Wait 5-10 minutes after adding the domain in Vercel. Certificate provisioning is automatic.
- **DNS not resolving:** CNAME propagation can take up to 48 hours (usually under 1 hour).
- **404 on valid slugs:** Ensure the game has `feed_enabled = true` in the database and has a valid `feed_slug`.
