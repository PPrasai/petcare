#!/usr/bin/env bash
# One-time VPS setup for CI deploys. Run as root on the VPS:
#   sudo bash bootstrap-vps.sh "<contents of the deploy public key, ssh-ed25519 ...>"
# Creates the "deploy" user, /opt/petcare, and an SSH key that can ONLY run deploy.sh.
# Safe to re-run (it replaces deploy.sh and the authorized key).
set -euo pipefail

pubkey="${1:?pass the deploy public key as the first argument}"
[[ "$pubkey" == ssh-* ]] || { echo "that does not look like an SSH public key" >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"

id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy

install -d -o deploy -g deploy -m 750 /opt/petcare
install -o root -g root -m 755 "$here/deploy.sh" /usr/local/bin/petcare-deploy
if [[ -f /opt/petcare/.env ]]; then
  chown root:deploy /opt/petcare/.env
  chmod 640 /opt/petcare/.env
fi

install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
printf 'command="/usr/local/bin/petcare-deploy",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding %s\n' \
  "$pubkey" >/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "Done. Next: create /opt/petcare/.env, then log the deploy user in to ghcr.io (deploy/README.md)."
