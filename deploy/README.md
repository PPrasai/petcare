# Deploying petcare.pprasai.io

## How it works

1. A push to `main` runs **ci**, which runs `pnpm verify`.
2. If ci passes, **deploy** builds two images:
   - `petcare-api`: Node + Fastify.
   - `petcare-web`: Caddy serving the PWA, forwarding `/api` and `/cal` to the API.

   Both are tagged with the commit SHA and pushed to GHCR (private).

3. deploy then connects to the VPS over SSH as `petcare-ci` and sends `deploy <sha>`. The VPS script:
   - pulls the images;
   - takes `compose.yaml` from the image;
   - starts the stack in `/opt/petcare`;
   - waits for `/api/ready`.

   If the stack isn't ready within 90 s, it prints the API logs and **rolls back** to the previous commit.

4. The workflow then smoke-tests `https://petcare.pprasai.io/api/health`.

Pull requests that change the images only build them, so a broken Dockerfile shows up before merge.

**Where to watch:** GitHub → Actions → `deploy`. Each run shows the commit it deployed. The `production` environment page lists every deployment.

**Rolling back:** open an older successful `deploy` run and choose **Re-run jobs**. That redeploys its commit. **Run workflow** redeploys the current `main`.

```
internet ─TLS─> host Caddy (petcare.pprasai.io) ─> 127.0.0.1:8002
                 └─ web container (Caddy :8080) ─ /api, /cal ─> api container (127.0.0.1:3000)
                                                               └─ shared network: postgres, redis
```

### What the CI key can do

`petcare-ci` is a separate user. It is **not** in the `docker` or `sudo` groups, and the site's `deploy` user is untouched.

Its key is pinned to a wrapper that accepts only `deploy <40-character sha>`. The wrapper runs `/usr/local/bin/petcare-deploy` as root, the single command its sudo rule allows. A leaked key can redeploy an existing commit of this repo, and nothing else.

## One-time setup

Do these steps in order:

- `PS>` lines run in PowerShell on your PC, from the repo folder `D:\aeom projects\petcare`.
- `$` lines run on the VPS after `ssh pprasai`.
- `=#` lines run inside `psql`.

Every secret stays with you: none of them goes in the repo or the chat.

### 1. Database and role

```sh
$ sudo docker exec -it shared-postgres-1 psql -U postgres
```

First check whether they already exist. They do if `petcare` was listed in `PROJECT_DBS` when Postgres was first created.

```sql
=# \du petcare
=# \l petcare
```

- **Both exist:** keep the password from `PROJECT_DBS` in `infra/.env`, or set a new one with `\password petcare`.
- **Neither exists:** create them. `\password` asks for the password without echoing it or saving it to history.

  ```sql
  =# CREATE ROLE petcare LOGIN;
  =# \password petcare
  =# CREATE DATABASE petcare OWNER petcare;
  =# REVOKE ALL ON DATABASE petcare FROM PUBLIC;
  =# \c petcare
  =# REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  =# ALTER SCHEMA public OWNER TO petcare;
  =# \q
  ```

Any characters are fine except a single quote (`'`). Step 4 keeps the password out of the connection URL, so it never needs encoding.

### 2. CI key (on your PC)

```powershell
PS> ssh-keygen -t ed25519 -C petcare-ci -f petcare_ci
```

Press Enter twice to leave the passphrase **empty**: CI can't type one. The key's power is limited by step 3.

This creates `petcare_ci` (private, for GitHub) and `petcare_ci.pub` (public, for the VPS).

### 3. CI user on the VPS

```powershell
PS> scp deploy\bootstrap-vps.sh deploy\deploy.sh petcare_ci.pub pprasai:
PS> ssh -t pprasai 'sudo bash bootstrap-vps.sh petcare_ci.pub && rm bootstrap-vps.sh deploy.sh petcare_ci.pub'
```

The script:

- creates `petcare-ci`;
- installs `/usr/local/bin/petcare-deploy` and its SSH wrapper;
- adds the sudo rule;
- creates `/opt/petcare` (root-only);
- appends `petcare-ci` to `AllowUsers` and reloads sshd (it checks the config with `sshd -t` first).

**Keep your current SSH session open** until you've confirmed that `ssh pprasai` still works in a new window.

### 4. Secrets file `/opt/petcare/.env`

```sh
$ sudo install -o root -g root -m 600 /dev/null /opt/petcare/.env
$ sudo nano /opt/petcare/.env
```

Required:

```
DATABASE_URL=postgres://petcare@postgres:5432/petcare
PGPASSWORD='<password from step 1>'
REDIS_URL=redis://:<REDIS_PASSWORD from /opt/pprasai/infra/.env>@redis:6379
BETTER_AUTH_SECRET=<output of: openssl rand -hex 32>
```

- **Database password:** it goes in `PGPASSWORD`, not in `DATABASE_URL`. The Postgres driver used by the API and the job queue reads `PGPASSWORD` whenever the URL has no password. Keep the single quotes: they stop Docker Compose from treating `$` as a variable.
- **Redis password:** the Redis client only takes it inside `REDIS_URL`. If it has characters other than letters and digits, percent-encode them, for example `@` → `%40`, `#` → `%23`, `$` → `%24`, `/` → `%2F`.

Optional:

- Add each OAuth provider as both `AUTH_<GOOGLE|GITHUB|MICROSOFT>_CLIENT_ID` and `_SECRET`. A provider turns on only when both are set. The callback URL is `https://petcare.pprasai.io/api/auth/callback/<provider>`.
- For web push, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:<you>`.

All other keys have production defaults. `compose.yaml` fixes `APP_ORIGIN`, `PORT`, `FILES_DIR` and `TRUST_PROXY`.

### 5. Let the VPS pull private images

1. On GitHub, go to Settings → Developer settings → Personal access tokens → **Tokens (classic)**.
2. Create a token with only the `read:packages` scope. Fine-grained tokens can't read packages.
3. On the VPS, run the following and paste the token when asked for a password:

```sh
$ sudo docker login ghcr.io -u PPrasai
```

The login is stored for root, which is the user the deploy script runs as.

### 6. Caddy

1. Uncomment the `petcare.pprasai.io` block in `D:\pprasai.io\deploy\Caddyfile`.
2. Install it the same way as in `docs/VPS-SETUP.md` step 10:

```powershell
PS> scp D:\pprasai.io\deploy\Caddyfile pprasai:~/Caddyfile
```

```sh
$ sudo install -m 644 -o root -g root ~/Caddyfile /etc/caddy/Caddyfile && rm ~/Caddyfile
$ sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
$ sudo systemctl reload caddy
```

Until the first deploy, the site answers 502. That's expected.

### 7. GitHub secrets and variables (on your PC)

Find the VPS address and SSH port that your `pprasai` shortcut uses:

```powershell
PS> ssh -G pprasai | Select-String '^(hostname|port) '
```

Then, replacing `<host>` and `<port>`:

```powershell
PS> gh secret set DEPLOY_SSH_KEY -R PPrasai/petcare --body (Get-Content petcare_ci -Raw)
PS> ssh-keyscan -p <port> -t ed25519 <host> | gh secret set DEPLOY_KNOWN_HOSTS -R PPrasai/petcare
PS> gh variable set DEPLOY_HOST -R PPrasai/petcare --body "<host>"
PS> gh variable set DEPLOY_PORT -R PPrasai/petcare --body "<port>"
PS> gh variable set DEPLOY_ENABLED -R PPrasai/petcare --body true
PS> Remove-Item petcare_ci, petcare_ci.pub
```

GitHub now holds the only copy of the private key. To rotate it, repeat steps 2, 3 and 7.

**First deploy:** go to GitHub → Actions → `deploy` → **Run workflow**. When it's green, open https://petcare.pprasai.io.

### Checking it by hand

```sh
$ sudo docker compose -f /opt/petcare/compose.yaml ps
$ sudo docker compose -f /opt/petcare/compose.yaml logs --tail 100 api
$ sudo cat /opt/petcare/.deployed-tag
```

## Notes

- **Images:**
  - The API image runs the TypeScript sources through `tsx` with the full workspace installed. That's simple and correct, but large.
  - A slimmer single image, with the API serving the PWA itself, is planned for slice 18. When it lands, update this folder and keep the interface `petcare-deploy <sha>`.
- **Observability:** telemetry export is off (`OTEL_SDK_DISABLED=true`) until an LGTM stack runs on the VPS.
- **Backups:**
  - Uploaded files live in the Docker volume `petcare-files`. `infra/backup.sh` backs up databases only.
  - Add the volume to the backup before real data goes in.
- **SSH rate limit:** fail2ban and `ufw limit` see at most one SSH connection per deploy from GitHub, which is well under their limits.
