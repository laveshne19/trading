# VPS Deployment Instructions

A step-by-step for deploying on a fresh Ubuntu 22.04 VPS (e.g. AWS Lightsail,
DigitalOcean, Hetzner). Prefer a VPS **in or near Mumbai/Singapore** to minimise
latency to NSE/Zerodha.

## 1. Provision

- 2 vCPU / 4 GB RAM is comfortable (TensorFlow optional; XGBoost is light).
- Ubuntu 22.04 LTS.
- Open only ports 22 (SSH) and 443 (HTTPS via reverse proxy). **Do not** expose
  Postgres/Redis/uvicorn to the internet.

## 2. Harden the box

```bash
adduser trader && usermod -aG sudo trader
# SSH: disable password login, use keys only
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban
sudo ufw allow OpenSSH && sudo ufw allow 443/tcp && sudo ufw enable
```

## 3. Install Docker (recommended path)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker trader
# log out / back in
```

## 4. Deploy the app

```bash
sudo mkdir -p /opt/zerodha_kite_trader && sudo chown trader:trader /opt/zerodha_kite_trader
cd /opt/zerodha_kite_trader
git clone <your-fork-url> .        # or copy the zerodha_kite_trader/ directory
cp .env.example .env
nano .env                          # configure; START WITH BROKER=paper
docker compose up -d
docker compose logs -f engine
```

## 5. TLS + auth for the dashboard

```bash
sudo apt -y install caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
trading.example.com {
    basicauth { admin JDJhJDE0... }   # caddy hash-password
    reverse_proxy 127.0.0.1:8000
}
EOF
sudo systemctl restart caddy
```

Then in `docker-compose.yml` bind the dashboard to `127.0.0.1:8000:8000` so it's
only reachable through Caddy.

## 6. Daily token + scheduling

```bash
# interactive, each morning
docker compose run --rm engine python scripts/kite_login.py
# paste token into .env, then:
docker compose up -d
```

For full automation, add a systemd timer that runs your token-refresh script at
~08:45 IST and restarts the `engine` service.

## 7. Time zone & clock

```bash
sudo timedatectl set-timezone Asia/Kolkata
sudo apt -y install chrony   # keep the clock tight; session windows depend on it
```

## 8. Backups

```bash
# nightly Postgres dump
echo '0 2 * * * docker exec $(docker ps -qf name=postgres) pg_dump -U trading trading | gzip > /opt/backups/trading_$(date +\%F).sql.gz' | crontab -
```

## 9. Monitoring & auto-restart

`restart: unless-stopped` (compose) or `Restart=always` (systemd) brings the
engine back after crashes/reboots. Watch `logs/audit.log` and Telegram alerts.
Consider a simple uptime check hitting `GET /health`.

## 10. Cost-aware reminder

A VPS, the Kite Connect subscription, and trading charges are fixed monthly
costs. On ₹1L capital they are a meaningful drag — factor them into your
expected edge before going live.
