# Deploying to a cheap droplet

The app is a single Deno process with a SQLite file — it idles around 50 MB of RAM,
so DigitalOcean's cheapest droplet (512 MB / $4–6 per month) is plenty for a
3,000-movie collection. These steps assume Ubuntu, but any Debian-flavored VPS works
(Linode, Vultr, Hetzner, …).

Total setup time is about 15 minutes. The end result: the family opens
`https://movies.your-domain.com`, types the shared password once per device, and
never thinks about any of this again.

## 1. Create the droplet

- Ubuntu LTS, cheapest size, any region near your dad.
- Add your SSH key when creating it.

## 2. Point a domain at it

QR labels encode real URLs, so you want a name that never changes:

- **Own a domain?** Add an A record like `movies.your-domain.com` → droplet IP.
- **Don't?** A `.com` is ~$10/year, or use a free dynamic-DNS name
  (e.g. DuckDNS) pointed at the droplet IP.

HTTPS is handled automatically by Caddy — no certificate work needed, it just
requires the DNS record to exist first.

## 3. Install everything

SSH in as root and run:

```sh
git clone https://github.com/JoshDrentlaw/movie-cabinet /opt/movie-cabinet
/opt/movie-cabinet/deploy/setup.sh movies.your-domain.com
```

The script installs Deno and Caddy, creates a locked-down `cabinet` service user,
writes `/etc/movie-cabinet.env`, and starts everything under systemd (auto-restarts,
starts on boot).

## 4. Set the password and TMDB key

```sh
nano /etc/movie-cabinet.env      # set AUTH_PASSWORD and TMDB_API_KEY
systemctl restart movie-cabinet
```

- `AUTH_PASSWORD` — the one password the family shares. Pick something your dad can
  actually type on a phone. Signing in sets a year-long cookie, so each device only
  asks once. (Changing the password signs every device out.)
- `TMDB_API_KEY` — free from themoviedb.org → Settings → API. This is what makes
  adding movies pleasant: type a title, tap the match, done.

Open `https://movies.your-domain.com`, sign in, add a movie. That's the whole deploy.

## 5. Set up backups (recommended)

The entire catalog is one file. A nightly copy protects the data-entry marathon:

```sh
mkdir -p /var/backups/movie-cabinet
crontab -e
# add:
# 15 3 * * * cp /var/lib/movie-cabinet/catalog.db /var/backups/movie-cabinet/catalog-$(date +\%a).db
```

That keeps a rolling week of backups. To pull a copy to your own machine any time:

```sh
scp root@movies.your-domain.com:/var/lib/movie-cabinet/catalog.db ./
```

DigitalOcean's weekly droplet snapshots (~$1/mo) are a nice belt-and-suspenders
addition.

## Updating the app later

```sh
cd /opt/movie-cabinet && git pull && systemctl restart movie-cabinet
```

## Troubleshooting

```sh
systemctl status movie-cabinet     # is the app running?
journalctl -u movie-cabinet -e     # app logs
systemctl status caddy             # is HTTPS terminating?
```

If the site loads but QR codes point at the wrong address, fix `BASE_URL` in
`/etc/movie-cabinet.env`, restart, and reprint labels (IDs never change, so only
the QR sheets need reprinting — and only if the domain itself changed).
