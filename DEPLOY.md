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

## Backups — hourly (recommended)
A backup script is included (`scripts/backup.sh`): it dumps the DB, gzips it, and keeps
the last 14 days in `~/parakkan/backups`. Schedule it hourly with cron:
```bash
crontab -e
# add this line:
0 * * * * /root/parakkan/scripts/backup.sh >> /root/parakkan/backups/backup.log 2>&1
```
Run it once by hand to confirm: `~/parakkan/scripts/backup.sh`

**These live on the same droplet** — also copy them off-site (to your laptop or DO Spaces),
e.g. from your laptop: `scp root@SERVER_IP:'~/parakkan/backups/*.gz' ./`

Restore a backup:
```bash
gunzip -c backups/hpcl-YYYYMMDD-HHMM.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U hpcl hpcl
```

## Updating to a new version
Either push to GitHub (auto-deploys, see below) or, manually on the server:
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
Migrations run automatically; your data is preserved in the `pgdata` volume.

## Auto-deploy on `git push` (GitHub Actions)
`.github/workflows/deploy.yml` SSHes into the droplet and rebuilds on every push to `main`.
One-time setup:
1. **Let the droplet pull a private repo unattended:**
   ```bash
   cd ~/parakkan && git config credential.helper store && git pull
   ```
   (enter your GitHub username + Personal Access Token once; it's cached after.)
2. **Make an SSH key for CI** (on your laptop):
   ```bash
   ssh-keygen -t ed25519 -f deploykey -N ""
   ssh-copy-id -i deploykey.pub root@SERVER_IP     # adds the public key to the droplet
   ```
3. **Add 3 GitHub repo secrets** (repo → Settings → Secrets and variables → Actions):
   - `DEPLOY_HOST` = your droplet IP
   - `DEPLOY_USER` = `root`
   - `DEPLOY_SSH_KEY` = the contents of the private `deploykey` file
4. Push to `main` → the **Actions** tab shows the deploy running.

---

## Notes
- **CRIS auto-fetch:** CRIS allows only one active session. Run "Fetch from CRIS" when you're
  not logged into CRIS yourself. The manual upload always works as a fallback.
- **Health:** `docker compose -f docker-compose.prod.yml logs -f app` shows what's happening.
- **Restart everything:** `docker compose -f docker-compose.prod.yml restart`.
- **Stop everything:** `docker compose -f docker-compose.prod.yml down` (data is kept).
