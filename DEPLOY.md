# Deploying Parakkan Petroleum Accounting (VPS + Docker)

This runs the whole app — web server, PostgreSQL, and automatic HTTPS — with a
single command on a small Linux server. Budget ~₹400–500/month.

---

## What you need

1. **A VPS in an India region**, **Ubuntu 24.04**. Good options:
   - **AWS Lightsail — Mumbai** (ap-south-1): $5/1 GB or $10/2 GB
   - **DigitalOcean — Bangalore** (closest to Kerala): $6/1 GB or $12/2 GB
   - **Linode — Mumbai**, or **E2E Networks** (Indian, INR billing)
   - **Pick 2 GB if you can** — `next build` and the CRIS browser are memory-hungry.
     1 GB works only with the swap file in Step 1b below.
2. **A domain name** (or subdomain), e.g. `app.your-outlet.com`. Needed for HTTPS.

---

## Step 1 — Create the server
Create an Ubuntu 24.04 VPS in a Mumbai/Bangalore region. Note its **public IP** (e.g. `203.0.113.10`).

## Step 1b — (Only if you chose a 1 GB server) add swap
This prevents the build from running out of memory:
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Step 2 — Point your domain at it
In your domain registrar's DNS, add an **A record**:

| Type | Name | Value |
|------|------|-------|
| A | `app` (or `@`) | your server IP |

Wait a few minutes for it to take effect (`ping app.your-outlet.com` should show the IP).

## Step 3 — Install Docker (on the server)
SSH in (`ssh root@your-server-ip`) and run:

```bash
curl -fsSL https://get.docker.com | sh
```

## Step 4 — Get the code onto the server
Easiest is git. From your machine, push this project to a private GitHub repo, then on the server:

```bash
git clone https://github.com/<you>/hpcl-outlet-accounting.git
cd hpcl-outlet-accounting
```

*(No GitHub? You can also `scp -r` the project folder to the server.)*

## Step 5 — Configure secrets
```bash
cp .env.production.example .env
nano .env
```
Fill it in. Generate strong values with:

```bash
openssl rand -hex 16     # POSTGRES_PASSWORD
openssl rand -base64 48  # SESSION_SECRET
openssl rand -hex 32     # SECRET_KEY
```
Set `DOMAIN` to your domain and `ADMIN_PASSWORD` to a strong password. Save (Ctrl-O, Enter, Ctrl-X).

## Step 6 — Launch 🚀
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
First build takes a few minutes (it installs Chromium for the CRIS fetch). On boot the app
**runs database migrations and creates your admin account automatically**.

Check it's healthy:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app   # Ctrl-C to stop watching
```

## Step 7 — Open it
Visit **https://your-domain** (Caddy gets the HTTPS certificate automatically on first load).
Log in as your admin, then:
- **Change the admin password** (Staff → edit admin).
- Add your staff under **Staff** (each gets a username + password for their phones).
- In **CRIS**, save your (rotated) CRIS login if you want auto-fetch.

Staff just open the same link on their phones and log in.

---

## Firewall (recommended)
```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
```
(Postgres is **not** exposed to the internet — only the app talks to it inside Docker.)

## Backups (do this!)
Daily database dump to a file:
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U hpcl hpcl > backup-$(date +%F).sql
```
Put that in a cron job and copy the file off-server (or to object storage). To restore:
```bash
cat backup-YYYY-MM-DD.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U hpcl hpcl
```

## Updating to a new version
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
Migrations run automatically; your data is preserved in the `pgdata` volume.

---

## Notes
- **CRIS auto-fetch:** CRIS allows only one active session. Run "Fetch from CRIS" when you're
  not logged into CRIS yourself. The manual upload always works as a fallback.
- **Health:** `docker compose -f docker-compose.prod.yml logs -f app` shows what's happening.
- **Restart everything:** `docker compose -f docker-compose.prod.yml restart`.
- **Stop everything:** `docker compose -f docker-compose.prod.yml down` (data is kept).
