#!/usr/bin/env bash
# Installed on the VPS as /usr/local/bin/petcare-deploy (root-owned) by bootstrap-vps.sh.
# CI reaches it only through the petcare-ci SSH key:  ssh petcare-ci@<vps> "deploy <commit sha>"
# CI sends its short-lived GITHUB_TOKEN on stdin; it is used for this pull only and never stored.
# Pulls that commit's images, starts them, waits for /api/ready, and rolls back on failure.
set -euo pipefail

dir=/opt/pprasai/projects/petcare
registry=ghcr.io/pprasai
tag="${1:-}"
if [[ ! "$tag" =~ ^[0-9a-f]{40}$ || $# -ne 1 ]]; then
  echo "usage: petcare-deploy <40-character commit sha>" >&2
  exit 2
fi

cd "$dir"
exec 9>"$dir/.deploy.lock"
flock -w 900 9
[[ -f .env ]] || { echo "$dir/.env is missing; create it first (deploy/README.md)" >&2; exit 1; }

prev=$(cat .deployed-tag 2>/dev/null || true)

# Registry login for this run only, in a throwaway Docker config that is deleted on exit.
token=""
if [[ ! -t 0 ]]; then IFS= read -r token || true; fi
pull_config="${DOCKER_CONFIG:-$HOME/.docker}"
if [[ -n "$token" ]]; then
  pull_config=$(mktemp -d)
  trap 'rm -rf "$pull_config"' EXIT
  printf '%s' "$token" | DOCKER_CONFIG="$pull_config" docker login ghcr.io -u github-actions --password-stdin >/dev/null
fi
unset token

echo "Pulling $tag"
DOCKER_CONFIG="$pull_config" docker pull -q "$registry/petcare-api:$tag" >/dev/null
DOCKER_CONFIG="$pull_config" docker pull -q "$registry/petcare-web:$tag" >/dev/null

# Take compose.yaml from the image so it always matches the code being deployed.
[[ -f compose.yaml ]] && cp compose.yaml compose.prev.yaml
docker run --rm --entrypoint cat "$registry/petcare-api:$tag" /app/deploy/compose.yaml >compose.yaml.new
mv compose.yaml.new compose.yaml

PETCARE_TAG="$tag" docker compose up -d --remove-orphans

for _ in $(seq 1 45); do
  if curl -fsS -o /dev/null http://127.0.0.1:8002/api/ready; then
    echo "$tag" >.deployed-tag
    docker image prune -f --filter "until=168h" >/dev/null || true
    echo "Deployed $tag"
    exit 0
  fi
  sleep 2
done

echo "Health check failed for $tag. Last API logs:" >&2
PETCARE_TAG="$tag" docker compose logs --no-color --tail 80 api >&2 || true
if [[ -n "$prev" && -f compose.prev.yaml ]]; then
  cp compose.prev.yaml compose.yaml
  PETCARE_TAG="$prev" docker compose up -d --remove-orphans
  echo "Rolled back to $prev" >&2
fi
exit 1
