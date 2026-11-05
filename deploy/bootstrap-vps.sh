#!/usr/bin/env bash
# One-time VPS setup for CI deploys. Run on the VPS as the admin user:
#   sudo bash bootstrap-vps.sh petcare_ci.pub
#
# Creates the user "petcare-ci". It is NOT in the docker or sudo groups. Its SSH key can only run
# a wrapper that validates "deploy <sha>" and then runs /usr/local/bin/petcare-deploy as root,
# the single command its sudo rule allows. The existing "deploy" user (site publishing) is untouched.
# Safe to re-run: it replaces the scripts and the authorized key.
set -euo pipefail

keyfile="${1:?pass the path of the petcare-ci public key file}"
pubkey="$(tr -d '\r' <"$keyfile" | head -1)"
[[ "$pubkey" == ssh-ed25519\ * ]] || { echo "expected an ssh-ed25519 public key" >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
user=petcare-ci

id "$user" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$user"

install -d -o root -g root -m 700 /opt/petcare
install -o root -g root -m 755 "$here/deploy.sh" /usr/local/bin/petcare-deploy

cat >/usr/local/bin/petcare-deploy-ssh <<'WRAP'
#!/usr/bin/env bash
# Forced command of the petcare-ci key: accept only "deploy <40-hex sha>".
set -euo pipefail
read -r verb tag extra <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [[ "${verb:-}" != deploy || ! "${tag:-}" =~ ^[0-9a-f]{40}$ || -n "${extra:-}" ]]; then
  echo "usage: deploy <commit-sha>" >&2
  exit 2
fi
exec sudo -n /usr/local/bin/petcare-deploy "$tag"
WRAP
chown root:root /usr/local/bin/petcare-deploy-ssh
chmod 755 /usr/local/bin/petcare-deploy-ssh

rule="$user ALL=(root) NOPASSWD: /usr/local/bin/petcare-deploy"
printf '%s\n' "$rule" >/etc/sudoers.d/petcare-ci.tmp
visudo -cf /etc/sudoers.d/petcare-ci.tmp >/dev/null
chmod 440 /etc/sudoers.d/petcare-ci.tmp
mv /etc/sudoers.d/petcare-ci.tmp /etc/sudoers.d/petcare-ci

install -d -o "$user" -g "$user" -m 700 "/home/$user/.ssh"
printf 'command="/usr/local/bin/petcare-deploy-ssh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding %s\n' \
  "$pubkey" >"/home/$user/.ssh/authorized_keys"
chown "$user:$user" "/home/$user/.ssh/authorized_keys"
chmod 600 "/home/$user/.ssh/authorized_keys"

# Let the user through sshd's AllowUsers list, if there is one.
conf=$(grep -lE '^\s*AllowUsers\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | head -1 || true)
if [[ -n "$conf" ]] && ! grep -qE "^\s*AllowUsers\b.*\b$user\b" "$conf"; then
  sed -i -E "s/^(\s*AllowUsers\b.*)$/\1 $user/" "$conf"
  sshd -t
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "Added $user to AllowUsers in $conf"
fi

echo "Done. Next: create /opt/petcare/.env and log root in to ghcr.io (deploy/README.md steps 4-5)."
