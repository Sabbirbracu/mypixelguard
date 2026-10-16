# Deploying mypixelguard.agentiqbd.com (own VPS: nginx + the visitor counter)

Layout on the server:

    /var/www/mypixelguard/site/          the built landing page (replaced on every deploy)
    /var/www/mypixelguard/downloads/     MyPixelGuard-mac.dmg, MyPixelGuard-windows-setup.exe (you upload these once per release)
    /var/www/mypixelguard/counter/       visitor-counter.mjs
    /var/www/mypixelguard/counter-data/  visitors.json (the real count — back this up)

## One-time setup

1. **DNS** — at wherever agentiqbd.com's DNS is managed, add `A  mypixelguard  →  <server IPv4>` (and `AAAA` if the server has IPv6). Wait until `dig +short mypixelguard.agentiqbd.com` shows the IP.
2. **Server packages** (Ubuntu/Debian): `apt install nginx certbot python3-certbot-nginx nodejs rsync` — Node 18 or newer.
3. **nginx** — copy `deploy/nginx.conf` to `/etc/nginx/sites-available/mypixelguard`, link it into `sites-enabled`, then `nginx -t && systemctl reload nginx`.
4. **HTTPS** — `certbot --nginx -d mypixelguard.agentiqbd.com`.
5. **Counter service** — copy `deploy/mypixelguard-counter.service` to `/etc/systemd/system/`, then `systemctl daemon-reload && systemctl enable --now mypixelguard-counter` (after the first deploy has put the script in place).

## Every update

    SERVER=root@<server-ip> ./deploy/deploy.sh

Builds with `VITE_VISITOR_API=https://mypixelguard.agentiqbd.com`, uploads `dist/` and the counter script, restarts the counter.

## Releases

    scp releases/MyPixelGuard-mac.dmg  root@<server-ip>:/var/www/mypixelguard/downloads/
    scp MyPixelGuard-windows-setup.exe root@<server-ip>:/var/www/mypixelguard/downloads/

## Checks

- `curl -I https://mypixelguard.agentiqbd.com/` → 200
- `curl https://mypixelguard.agentiqbd.com/api/count` → `{"total":N}`
- `curl -I https://mypixelguard.agentiqbd.com/downloads/MyPixelGuard-mac.dmg` → 200 once uploaded
