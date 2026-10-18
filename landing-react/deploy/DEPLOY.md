# Deploying mypixelguard.agentiqbd.com — CI/CD on the shared Docker VPS

How this server works (found by inspection): ERP and other apps run in Docker. The only public door is the ERP's nginx container
(`pharma-erp-nginx-1`), which reads every `*.conf.template` in `/opt/pharma-erp/nginx/templates`. Certificates come from the ERP's
certbot container. `portfolio-api` was added the same way, and so is MyPixelGuard.

    GitHub push → Actions builds the site → rsync (locked key) → /var/www/mypixelguard/site
                                                              → mypixelguard-web container serves it
    ERP nginx  ←  new file mypixelguard.conf.template  →  mypixelguard-web:8080  and  mypixelguard-counter:8787

What is isolated:
- The GitHub deploy key can only write files inside `/var/www/mypixelguard` (forced `rrsync`, no shell). It cannot touch Docker or the ERP.
- Our two containers hold no secrets, are read-only, have all Linux capabilities dropped, and are memory-limited.
- ERP files are not edited: one new template file is added, then nginx is *reloaded* (not restarted).
- Upstreams are resolved per request, so stopping our containers can never stop the ERP's nginx from starting.
- Trade-off (same as portfolio-api): our containers share the `pharma-erp_default` network so nginx can reach them by name. That
  network also holds the ERP's database; our containers have no credentials for it.

Server folders:

    /opt/mypixelguard/                 docker-compose.yml, web.conf, counter/visitor-counter.mjs
    /var/www/mypixelguard/site/        the built landing page          (written by CI)
    /var/www/mypixelguard/downloads/   MyPixelGuard-mac.dmg, -windows-setup.exe   (you upload)
    /var/lib/mypixelguard-counter/     visitors.json — the real count (back it up)

## 0. Before you touch anything (as root)
    cp -a /opt/pharma-erp/nginx/templates /root/templates-backup-$(date +%F)
Also take a snapshot in Hostinger hPanel → VPS → Backups.

## 1. Folders, user, deploy key
    adduser --system --group --home /var/www/mypixelguard --shell /bin/bash deploy-mpg
    mkdir -p /var/www/mypixelguard/{site,downloads} /var/lib/mypixelguard-counter /opt/mypixelguard/counter
    chown -R deploy-mpg:deploy-mpg /var/www/mypixelguard && chmod 755 /var/www/mypixelguard
    chown 10001:10001 /var/lib/mypixelguard-counter
    echo '<h1>MyPixelGuard</h1>' > /var/www/mypixelguard/site/index.html && chmod 644 /var/www/mypixelguard/site/index.html
    apt install -y rsync && which rrsync

On your Mac make the key, and show the public half:

    ssh-keygen -t ed25519 -f ~/.ssh/mpg_deploy -C "github-actions mypixelguard" -N ""
    cat ~/.ssh/mpg_deploy.pub

On the server (use the path `which rrsync` printed; on some systems it must first be copied from `/usr/share/doc/rsync/scripts/`):

    install -d -m 700 -o deploy-mpg -g deploy-mpg /var/www/mypixelguard/.ssh
    echo 'restrict,command="/usr/bin/rrsync -wo /var/www/mypixelguard" ssh-ed25519 AAAA…paste-the-public-key…' \
      > /var/www/mypixelguard/.ssh/authorized_keys
    chown deploy-mpg:deploy-mpg /var/www/mypixelguard/.ssh/authorized_keys && chmod 600 /var/www/mypixelguard/.ssh/authorized_keys

## 2. The containers
From your Mac (replace SERVER):

    cd landing-react
    scp deploy/server/docker-compose.yml deploy/server/web.conf root@SERVER:/opt/mypixelguard/
    scp server/visitor-counter.mjs root@SERVER:/opt/mypixelguard/counter/

On the server:

    cd /opt/mypixelguard && docker compose up -d
    docker ps --format 'table {{.Names}}\t{{.Status}}' | grep mypixelguard
    docker logs mypixelguard-counter --tail 5
    docker exec mypixelguard-web wget -qO- http://127.0.0.1:8080/ | head -3     # → the placeholder page

### Changing the web container's own config later
`deploy/server/web.conf` (compression, 404 handling, caching) is not deployed by CI because CI may only write into `/var/www/mypixelguard`.
After editing it: `scp deploy/server/web.conf root@SERVER:/opt/mypixelguard/` then on the server `cd /opt/mypixelguard && docker compose restart web`.

## 3. HTTPS certificate (same two steps as portfolio-api)
Step 1 — HTTP-only file, so Let's Encrypt can check the domain:

    scp deploy/server/mypixelguard.http-only.conf.template root@SERVER:/opt/pharma-erp/nginx/templates/mypixelguard.conf.template
    # on the server:
    docker exec pharma-erp-nginx-1 /docker-entrypoint.d/20-envsubst-on-templates.sh
    docker exec pharma-erp-nginx-1 nginx -t && docker exec pharma-erp-nginx-1 nginx -s reload

(The first line re-renders the templates into nginx's config, exactly as at container start. If `nginx -t` complains, do **not**
reload: run `rm /opt/pharma-erp/nginx/templates/mypixelguard.conf.template` and `docker exec pharma-erp-nginx-1 rm -f /etc/nginx/conf.d/mypixelguard.conf`.)

Ask for the certificate:

    docker exec pharma-erp-certbot-1 certbot certonly --webroot -w /var/www/certbot \
      -d mypixelguard.agentiqbd.com --email YOU@example.com --agree-tos --no-eff-email

Step 2 — the full file:

    scp deploy/server/mypixelguard.conf.template root@SERVER:/opt/pharma-erp/nginx/templates/mypixelguard.conf.template
    # on the server:
    docker exec pharma-erp-nginx-1 /docker-entrypoint.d/20-envsubst-on-templates.sh
    docker exec pharma-erp-nginx-1 nginx -t && docker exec pharma-erp-nginx-1 nginx -s reload

Check: `curl -I https://mypixelguard.agentiqbd.com/` → 200, and `curl https://mypixelguard.agentiqbd.com/api/count` → `{"total":0}`.

Renewals: the certbot container renews certificates but nginx only picks them up on reload. Add a monthly reload so nothing expires
unnoticed: `crontab -e` → `0 4 1 * * docker exec pharma-erp-nginx-1 nginx -s reload`.

## 4. GitHub: secrets and the production environment
Repo → Settings → **Environments** → `production` → Deployment branches: `main` only. Secrets there:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | server IP |
| `DEPLOY_USER` | `deploy-mpg` |
| `DEPLOY_SSH_KEY` | whole content of `~/.ssh/mpg_deploy` (private key) |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 SERVER_IP` |

`.github/workflows/deploy-landing.yml` then deploys on every push to `main` that changes `landing-react/` (or by hand from the Actions tab).

## 5. Releases (installers)
Each installer has a `.sha256` file next to it (the download page reads it and shows the fingerprint). `package_dmg.sh` writes
`releases/MyPixelGuard-mac.dmg.sha256`; the Windows workflow uploads its own. Upload the pair together.
    scp releases/MyPixelGuard-mac.dmg releases/MyPixelGuard-mac.dmg.sha256 root@SERVER:/var/www/mypixelguard/downloads/
    scp MyPixelGuard-windows-setup.exe root@SERVER:/var/www/mypixelguard/downloads/
    ssh root@SERVER 'chown deploy-mpg:deploy-mpg /var/www/mypixelguard/downloads/* && chmod 644 /var/www/mypixelguard/downloads/*'

## 6. Extra hardening worth doing
- `chmod 600 /opt/pharma-erp/.env /opt/pharma-erp/.env.bak.2026-09-23 /opt/pharma-erp/.env.save` — they are readable by every user right now.
- `apt install unattended-upgrades fail2ban`.
- `ufw` is already on (provision.sh). Docker bypasses it for *published* ports, so never add `ports:` to a compose file unless you mean it.
- SSH: once every admin uses keys, set `PasswordAuthentication no` in `/etc/ssh/sshd_config` (`sshd -t && systemctl reload ssh`); test a new login before closing the old one.

## Rollback
    rm /opt/pharma-erp/nginx/templates/mypixelguard.conf.template
    docker exec pharma-erp-nginx-1 rm -f /etc/nginx/conf.d/mypixelguard.conf
    docker exec pharma-erp-nginx-1 nginx -t && docker exec pharma-erp-nginx-1 nginx -s reload
    cd /opt/mypixelguard && docker compose down
The ERP and portfolio-api are not affected by any of these.
