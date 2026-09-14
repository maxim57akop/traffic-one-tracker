# TrafficOne

Self-hosted affiliate traffic tracking panel.

Stack:

- Nginx single entrypoint
- Next.js admin UI
- Go API/tracker
- PostgreSQL config database
- Redis compiled campaign cache
- ClickHouse click/conversion analytics

## One-command local run

```bash
./start.sh
```

Open:

```text
http://127.0.0.1:8080
```

Default local admin:

```text
email: admin@example.com
password: padj9adsh3KAD
```

## Production run with Cloudflare Flexible

1. Copy env:

```bash
cp .env.example .env
```

2. Edit `.env`:

```text
APP_PORT=80
NEXT_PUBLIC_TRACKER_URL=https://your-domain.com
ADMIN_PASSWORD=strong-password
POSTGRES_PASSWORD=strong-db-password
SERVER_IP=your-origin-server-ip
```

3. Start:

```bash
./start.sh
```

Cloudflare:

- DNS record: proxied orange cloud to your origin server IP.
- SSL/TLS mode: Flexible.
- Origin container listens on HTTP port `80`.

## Useful commands

```bash
docker compose ps
docker compose logs -f nginx backend frontend
docker compose restart backend
docker compose down
```

Stop and remove app containers while keeping data volumes:

```bash
docker compose down
```

Remove all persistent database data:

```bash
docker compose down -v
```

## Git

This repo is safe to commit. Runtime data and secrets are ignored:

- `.env`
- `frontend/node_modules`
- `frontend/.next`
- uploaded/generated `lander/*`
- Docker database volumes

Initial commit:

```bash
git init
git add .
git commit -m "Initial TrafficOne docker package"
```

## Public URLs

Campaign links:

```text
https://your-domain.com/{campaign_alias}
```

Legacy `/r/{slug}` still works:

```text
https://your-domain.com/r/{campaign_slug}
```

Postbacks:

```text
https://your-domain.com/postback?click_id={click_id}&transaction_id={tid}&payout=10.50&currency=USD
```
