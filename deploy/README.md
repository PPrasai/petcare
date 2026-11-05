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
   - starts the stack in `/opt/pprasai/projects/petcare`;
   - waits for `/api/ready`.

   If the stack isn't ready within 90 s, it prints the API logs and **rolls back** to the previous commit.

4. The workflow smoke-tests `https://petcare.pprasai.io/api/health`.

Pull requests that change the images only build them, so a broken Dockerfile shows up before merge.

**Where to watch:** GitHub → Actions → `deploy`. Each run shows the commit it deployed.

**Rolling back:** open an older successful `deploy` run and choose **Re-run jobs**. That redeploys its commit. **Run workflow** redeploys the current `main`.

```
internet ─TLS─> host Caddy (petcare.pprasai.io) ─> 127.0.0.1:8002
                 └─ web container (Caddy :8080) ─ /api, /cal ─> api container (127.0.0.1:3000)
                                                               └─ shared network: postgres, redis
```

### The CI user

`petcare-ci` sits next to your `pprasai` (admin) and `deploy` (site) users. Following the one-key-per-role rule from `docs/VPS-SETUP.md`, it gets its own key, `ci@petcare.pprasai.io`.

- It isn't in the `sudo` or `docker` groups.
- Its key is pinned to a wrapper that accepts only `deploy <40-character sha>`.
- The wrapper runs `/usr/local/bin/petcare-deploy` as root, the single command its sudo rule allows.

A leaked key can redeploy an existing commit of this repo, and nothing else. The `deploy` user is untouched.

## One-time setup

- `PS>` lines run in PowerShell on your PC, from `D:\aeom projects\petcare`. Until PR #1 is merged, use `D:\aeom projects\petcare-cicd` instead.
- `$` lines run on the VPS after `ssh pprasai`.
- `=#` lines run inside `psql`.

### 1. Database and role

```bash
$ sudo docker exec -it shared-postgres-1 psql -U postgres
```

Check whether they already exist. They do if `petcare` was in `PROJECT_DBS` when Postgres was first created.

```sql
=# \du petcare
=# \l petcare
```

- **Both exist:** use the password from `PROJECT_DBS` in `/opt/pprasai/infra/.env`, or set a new one with `\password petcare`.
- **Neither exists:**

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

`\password` asks twice without echoing and doesn't save the password to history. Any characters are fine except a single quote (`'`).

To **change** the password later, run `\password petcare` the same way, then update `PGPASSWORD` in step 4.

### 2. CI key (on your PC)

You already have `$env:USERPROFILE\.ssh\ci@petcare.pprasai.io` and its `.pub`. If not:

```powershell
PS> ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\ci@petcare.pprasai.io -C "ci@petcare.pprasai.io"
```

Unlike your admin and deploy keys, this key must have **no passphrase**, because GitHub can't type one. To check, run:

```powershell
PS> ssh-keygen -y -f $env:USERPROFILE\.ssh\ci@petcare.pprasai.io
# expect: a line starting "ssh-ed25519 …" printed straight away. If it asks for a passphrase, remove it:
PS> ssh-keygen -p -f $env:USERPROFILE\.ssh\ci@petcare.pprasai.io
# enter the old passphrase, then press Enter twice for an empty one
```

The private key (the file without `.pub`) goes **only** to GitHub, in step 7. Never copy it to the VPS.

### 3. CI user on the VPS

Upload the two scripts and the **public** key, then run the setup script:

```powershell
PS> scp deploy\bootstrap-vps.sh deploy\deploy.sh pprasai:
PS> scp $env:USERPROFILE\.ssh\ci@petcare.pprasai.io.pub pprasai:ci.pub
PS> ssh -t pprasai "sudo bash bootstrap-vps.sh ci.pub && rm bootstrap-vps.sh deploy.sh ci.pub"
# -t gives sudo a terminal so it can ask for your pprasai password
# expect: "Added petcare-ci to AllowUsers in /etc/ssh/sshd_config.d/00-hardening.conf" and "Done."
```

The script:

- creates `petcare-ci`;
- installs `/usr/local/bin/petcare-deploy` and its SSH wrapper;
- adds the sudo rule;
- creates `/opt/pprasai/projects/petcare` (root-only);
- appends `petcare-ci` to `AllowUsers`, after checking the SSH config with `sshd -t`.

It's safe to run again.

Check it, in a **new** window, keeping the old one open:

```powershell
PS> ssh pprasai "echo admin ok"
# expect: admin ok
PS> ssh -o IdentitiesOnly=yes -i $env:USERPROFILE\.ssh\ci@petcare.pprasai.io petcare-ci@<VPS IP> deploy nope
# expect: usage: deploy <commit-sha>   (the key works and can do nothing else)
```

`<VPS IP>` is the `HostName` in your `%USERPROFILE%\.ssh\config`.

### 4. Secrets file

```bash
$ sudo install -m 600 -o root -g root /dev/null /opt/pprasai/projects/petcare/.env
$ sudo nano /opt/pprasai/projects/petcare/.env
```

Required:

```
DATABASE_URL=postgres://petcare@postgres:5432/petcare
PGPASSWORD='<password from step 1>'
REDIS_URL=redis://:<REDIS_PASSWORD from /opt/pprasai/infra/.env>@redis:6379
BETTER_AUTH_SECRET=<output of: openssl rand -hex 32>
```

- **Database password:** it goes in `PGPASSWORD`, not in the URL. The Postgres driver reads `PGPASSWORD` whenever the URL has no password. Keep the single quotes: they stop Docker Compose from treating `$` as a variable.
- **Redis password:** the Redis client only takes it inside `REDIS_URL`. Percent-encode any character other than letters and digits: `@` → `%40`, `#` → `%23`, `$` → `%24`, `/` → `%2F`, `:` → `%3A`, `%` → `%25`.

To see the Redis password without printing the rest of the file:

```bash
$ sudo grep '^REDIS_PASSWORD=' /opt/pprasai/infra/.env
```

Optional:

- OAuth providers: set `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`, and likewise for `GITHUB` and `MICROSOFT`. A provider turns on only when both are set. The callback URL is `https://petcare.pprasai.io/api/auth/callback/<google|github|microsoft>`.
- Web push: set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:<you>`.

All other keys have production defaults. `compose.yaml` sets `APP_ORIGIN`, `PORT`, `FILES_DIR` and `TRUST_PROXY`.

`ship-app.ps1` resets every `.env` under `/opt/pprasai` to root-only (600), which is what this file needs anyway.

### 5. Let the VPS pull private images

1. On GitHub, go to Settings → Developer settings → Personal access tokens → **Tokens (classic)**.
2. Generate a token with only `read:packages`. Fine-grained tokens can't read packages.
3. Then run:

```bash
$ sudo docker login ghcr.io -u PPrasai
# paste the token at the password prompt; expect: Login Succeeded
```

The login is stored for root, which is the user the deploy script runs as. Keep the token in your password manager.

### 6. Caddy

Uncomment the `petcare.pprasai.io` block in `D:\pprasai.io\deploy\Caddyfile`, then install it as in `docs/VPS-SETUP.md` step 10:

```powershell
PS> scp D:\pprasai.io\deploy\Caddyfile pprasai:~/Caddyfile
```

```bash
$ sudo install -m 644 -o root -g root ~/Caddyfile /etc/caddy/Caddyfile && rm ~/Caddyfile
$ sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
$ sudo systemctl reload caddy
```

DNS is already covered by the wildcard record. Until the first deploy, the site answers 502. That's expected.

### 7. GitHub secrets and variables (on your PC)

```powershell
PS> gh secret set DEPLOY_SSH_KEY -R PPrasai/petcare --body (Get-Content $env:USERPROFILE\.ssh\ci@petcare.pprasai.io -Raw)
PS> ssh-keyscan -t ed25519 <VPS IP> | gh secret set DEPLOY_KNOWN_HOSTS -R PPrasai/petcare
PS> gh variable set DEPLOY_HOST -R PPrasai/petcare --body "<VPS IP>"
PS> gh variable set DEPLOY_ENABLED -R PPrasai/petcare --body true
```

SSH is on port 22, so `DEPLOY_PORT` isn't needed. If you ever move it, set `DEPLOY_PORT` and add `-p <port>` to `ssh-keyscan`.

GitHub now holds the private key, and you can delete your local copy if you like. To rotate it, generate a new key and repeat steps 2, 3 and 7.

**First deploy:** go to GitHub → Actions → `deploy` → **Run workflow**. When it's green, open https://petcare.pprasai.io.

## Checking it by hand

```bash
$ sudo docker compose -p petcare ps
$ sudo docker compose -p petcare logs --tail 100 api
$ sudo cat /opt/pprasai/projects/petcare/.deployed-tag
```

## Notes

- **Images:**
  - The API image runs the TypeScript sources through `tsx` with the full workspace installed. That's simple and correct, but large.
  - A slimmer single image, with the API serving the PWA itself, is planned for slice 18. When it lands, update this folder and keep the interface `petcare-deploy <sha>`.
- **Observability:** telemetry export is off (`OTEL_SDK_DISABLED=true`) until an LGTM stack runs on the VPS.
- **Backups:**
  - Uploaded files live in the Docker volume `petcare-files`. `infra/backup.sh` backs up databases only.
  - Add the volume to the backup before real data goes in.
