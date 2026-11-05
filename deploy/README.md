# Deploying petcare.pprasai.io

## How it works

1. A push to `main` runs **ci**, which runs `pnpm verify`.
2. If ci passes, **deploy** builds two images:
   - `petcare-api`: Node + Fastify.
   - `petcare-web`: Caddy serving the PWA, forwarding `/api` and `/cal` to the API.

   Both are tagged with the commit SHA and pushed to GHCR (private).

3. deploy then connects to the VPS over SSH as `deploy`. That key can only run `deploy.sh`. The script:
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

## One-time setup

Do these steps in order. Every secret stays with you: none of them goes in the repo or the chat.

### 1. Database and role (on the VPS)

Choose a password and keep it for step 4.

```sh
docker exec -it shared-postgres-1 psql -U postgres
CREATE ROLE petcare LOGIN PASSWORD '<choose one>';
CREATE DATABASE petcare OWNER petcare;
REVOKE ALL ON DATABASE petcare FROM PUBLIC;
\c petcare
REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO petcare;
```

### 2. Deploy key (on your PC)

```sh
ssh-keygen -t ed25519 -N "" -C petcare-ci -f petcare_deploy
```

This creates `petcare_deploy` (private, for GitHub) and `petcare_deploy.pub` (public, for the VPS).

### 3. Deploy user (on the VPS)

```sh
scp deploy/bootstrap-vps.sh deploy/deploy.sh petcare_deploy.pub pprasai:
ssh -t pprasai 'sudo bash bootstrap-vps.sh "$(cat petcare_deploy.pub)" && rm bootstrap-vps.sh deploy.sh petcare_deploy.pub'
```

### 4. Secrets file `/opt/petcare/.env` (on the VPS)

```sh
sudo install -o root -g deploy -m 640 /dev/null /opt/petcare/.env
sudo nano /opt/petcare/.env
```

Required:

```
DATABASE_URL=postgres://petcare:<password from step 1>@postgres:5432/petcare
REDIS_URL=redis://:<redis password from infra/.env>@redis:6379
BETTER_AUTH_SECRET=<output of: openssl rand -base64 48>
```

Optional:

- Add each OAuth provider as both `AUTH_<GOOGLE|GITHUB|MICROSOFT>_CLIENT_ID` and `_SECRET`. A provider turns on only when both are set.
- For web push, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:<you>`.

All other keys have production defaults. `compose.yaml` fixes `APP_ORIGIN`, `PORT`, `FILES_DIR` and `TRUST_PROXY`.

### 5. Let the VPS pull private images

Create a GitHub token: **classic**, scope `read:packages` only, no expiry or a long one. Then run:

```sh
ssh -t pprasai 'sudo -u deploy -H docker login ghcr.io -u PPrasai'
```

Paste the token when prompted.

### 6. Caddy

Uncomment the `petcare.pprasai.io` block in `pprasai.io/deploy/Caddyfile`, then ship it with `deploy.ps1` as usual.

### 7. GitHub secrets and variables (on your PC)

```sh
gh secret set DEPLOY_SSH_KEY -R PPrasai/petcare < petcare_deploy
ssh-keyscan -t ed25519 <vps host> | gh secret set DEPLOY_KNOWN_HOSTS -R PPrasai/petcare
gh variable set DEPLOY_HOST -R PPrasai/petcare --body "<vps host>"
gh variable set DEPLOY_ENABLED -R PPrasai/petcare --body true
# only if SSH is not on port 22:
gh variable set DEPLOY_PORT -R PPrasai/petcare --body <port>
```

Then delete `petcare_deploy` from your PC; GitHub holds the only copy. Start the first deploy from Actions → `deploy` → **Run workflow**.

## Notes

- **Images:**
  - The API image runs the TypeScript sources through `tsx` with the full workspace installed. That's simple and correct, but large.
  - A slimmer single image, with the API serving the PWA itself, is planned for slice 18. When it lands, update this folder and keep `deploy.sh`'s interface (`deploy <sha>`).
- **Observability:** telemetry export is off (`OTEL_SDK_DISABLED=true`) until an LGTM stack runs on the VPS.
- **Backups:**
  - Uploaded files live in the Docker volume `petcare-files`. `infra/backup.sh` backs up databases only.
  - Add the volume to the backup before real data goes in.
