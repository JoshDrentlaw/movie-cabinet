#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu/Debian droplet.
#
# Usage (as root, with this repo cloned to /opt/movie-cabinet):
#   /opt/movie-cabinet/deploy/setup.sh movies.example.com
#
# Afterwards edit /etc/movie-cabinet.env (password + TMDB key), then:
#   systemctl restart movie-cabinet
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: $0 <domain>   e.g. $0 movies.example.com" >&2
  exit 1
fi
if [[ ! -f /opt/movie-cabinet/src/main.ts ]]; then
  echo "expected the repo at /opt/movie-cabinet (git clone it there first)" >&2
  exit 1
fi

echo "==> Installing packages (curl, unzip, caddy)…"
apt-get update -q
apt-get install -yq curl unzip ca-certificates debian-keyring debian-archive-keyring apt-transport-https
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi

echo "==> Installing Deno…"
if ! command -v deno >/dev/null; then
  curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- --yes
fi

echo "==> Creating service user and data directory…"
id -u cabinet &>/dev/null || useradd --system --home-dir /var/lib/movie-cabinet --create-home cabinet
mkdir -p /var/lib/movie-cabinet
chown -R cabinet:cabinet /var/lib/movie-cabinet

echo "==> Writing config…"
if [[ ! -f /etc/movie-cabinet.env ]]; then
  cat > /etc/movie-cabinet.env <<EOF
# The one password the whole family shares to sign in. CHANGE IT.
AUTH_PASSWORD=change-me-please

# Free key from https://www.themoviedb.org/settings/api — enables title search.
TMDB_API_KEY=

# Baked into printed QR codes; must match the public address.
BASE_URL=https://$DOMAIN

PORT=8000
DB_PATH=/var/lib/movie-cabinet/catalog.db
EOF
  chmod 600 /etc/movie-cabinet.env
  echo "    wrote /etc/movie-cabinet.env (edit it to set the password + TMDB key)"
else
  echo "    /etc/movie-cabinet.env already exists, leaving it alone"
fi

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	reverse_proxy localhost:8000
	encode gzip
}
EOF

echo "==> Pre-caching app dependencies…"
sudo -u cabinet DENO_DIR=/var/lib/movie-cabinet/.deno \
  bash -c "cd /opt/movie-cabinet && deno install --entrypoint src/main.ts"

echo "==> Installing and starting services…"
cp /opt/movie-cabinet/deploy/movie-cabinet.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now movie-cabinet
systemctl restart caddy

echo
echo "Done. Next steps:"
echo "  1. Edit /etc/movie-cabinet.env — set AUTH_PASSWORD and TMDB_API_KEY"
echo "  2. systemctl restart movie-cabinet"
echo "  3. Make sure $DOMAIN's DNS A record points at this server"
echo "  4. Open https://$DOMAIN"
