# Deploy Matin HRM on VPS port 5896

These steps assume an Ubuntu 24.04 VPS, sudo access, and a domain pointing to
the VPS. The public address is **https://hr.example.com:5896**. Replace
`hr.example.com` everywhere with your domain. Nginx terminates HTTPS on 5896;
Docker stays bound to `127.0.0.1:8081` and serves the frontend and API together.
Production authentication requires HTTPS (Secure cookies). Camera attendance
also requires a secure browser context.

## 1. Install prerequisites

Install Docker Engine and the Compose plugin using Docker's official Ubuntu
instructions: https://docs.docker.com/engine/install/ubuntu/ . If Docker is
already installed, keep the existing installation. Verify:

```bash
sudo docker version
sudo docker compose version
sudo apt update
sudo apt install -y git nginx certbot
sudo systemctl enable --now docker nginx
```

Allow TCP 5896 and 80 in your VPS provider firewall. If UFW is already active:

```bash
sudo ufw allow 5896/tcp
sudo ufw allow 80/tcp
```

Port 80 is used for certificate issuance and renewal. Keep your existing SSH
firewall rule. The backend's loopback binding avoids exposing it directly;
Docker-published public ports can bypass UFW rules.

## 2. Clone

```bash
git clone https://github.com/popper676/matin_hrm.git
cd matin_hrm
cp server/.env.example server/.env
chmod 600 server/.env
```

If the repository is private, use your GitHub credentials or an authorized SSH
key when cloning; do not put tokens in the remote URL.

## 3. Prepare Supabase

For a **new installation**, create a fresh Supabase project. In its SQL Editor,
run every file in `supabase/` in numeric order, from `001_fresh_hr_schema.sql`
through `022_legacy_leave_correction.sql`. Run each separately and resolve any
error before continuing. Migration 017 adds demo support, but does not seed
accounts. Do not run `demo:seed` for production.

Save the `HR_INSTANCE_ID` returned by migration 001. It is also available from:

```sql
select id from public.hr_instance;
```

For an existing installation, back up first and apply only migrations that
have not already been applied. Never rerun migration 001 on an existing schema.

## 4. Configure the server

Generate a secret:

```bash
openssl rand -hex 48
nano server/.env
```

Set the following, using the project URL, service-role key and instance ID from
your own Supabase project. Keep optional integration variables empty until needed.

```dotenv
PORT=8080
NODE_ENV=production
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
EXPECTED_SUPABASE_PROJECT_REF=YOUR_PROJECT_REF
HR_INSTANCE_ID=YOUR_INSTANCE_UUID
JWT_SECRET=PASTE_THE_GENERATED_SECRET
ALLOWED_ORIGINS=https://hr.example.com:5896
PUBLIC_APP_URL=https://hr.example.com:5896
FRONTEND_URL=https://hr.example.com:5896
FRONTEND_ONBOARDING_URL=https://hr.example.com:5896
```

For Nginx on the Docker host, set `TRUSTED_PROXY_CIDRS` to the Docker network's
gateway IP followed by `/32` (obtained in step 5). This lets Express recognize
Nginx's forwarded client IP without trusting arbitrary remote proxy headers.
Never put the service-role key in frontend code or commit `server/.env`.

## 5. Build, create the owner, and start

```bash
sudo docker compose build
sudo docker compose create
sudo docker network inspect lm-hr_default --format '{{(index .IPAM.Config 0).Gateway}}'
```

For example, if that prints `172.18.0.1`, add this to `server/.env`:

```dotenv
TRUSTED_PROXY_CIDRS=172.18.0.1/32
```

Then run the interactive owner setup (the image contains Node.js; no host Node
installation is needed):

```bash
sudo docker compose run --rm app npm run setup:owner
sudo docker compose up -d
sudo docker compose ps
curl --fail http://127.0.0.1:8081/api/health
```

Choose your own owner username and strong password. There is no default login.
Owner setup is one-time; skip it on later deployments. Health should report
`status: ok` and `database_verified: true`.

## 6. Enable HTTPS on port 5896

Create a certificate challenge directory and an HTTP virtual host. This can
coexist with other Nginx sites as long as this hostname is not configured twice:

```bash
sudo mkdir -p /var/www/letsencrypt
sudo tee /etc/nginx/sites-available/matin-hrm-acme >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name hr.example.com;
    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }
    location / {
        return 301 https://$host:5896$request_uri;
    }
}
EOF
sudo nano /etc/nginx/sites-available/matin-hrm-acme
sudo ln -s /etc/nginx/sites-available/matin-hrm-acme /etc/nginx/sites-enabled/matin-hrm-acme
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d hr.example.com
sudo cp nginx/hrm-5896.conf /etc/nginx/sites-available/matin-hrm
sudo nano /etc/nginx/sites-available/matin-hrm
```

Replace **every** `hr.example.com` in both Nginx files, including certificate
paths, with your domain. Replace the domain in the Certbot command too. Then:

```bash
sudo ln -s /etc/nginx/sites-available/matin-hrm /etc/nginx/sites-enabled/matin-hrm
sudo nginx -t
sudo systemctl reload nginx
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
curl --fail https://hr.example.com:5896/api/health
```

Open **https://YOUR_DOMAIN:5896**, sign in with your new owner account, and
complete the in-app Owner setup. Test login, uploads, and attendance before use.

## Updates and operations

```bash
cd ~/matin_hrm
git pull --ff-only origin main
# Apply any new Supabase migrations, after taking backups.
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100 app
```

Uploads persist in the `lm-hr_lm_hr_uploads` Docker volume. Back up that volume,
your Supabase database and private storage, and `server/.env`. Store backups
securely outside the VPS. `docker compose down` preserves the volume;
`docker compose down -v` deletes it. If you recreate the Docker network, verify
its gateway still matches `TRUSTED_PROXY_CIDRS` and recreate the app if changed.

This guide prepares the deployment; it does not provision your VPS, Supabase
project, DNS, or certificate automatically.
