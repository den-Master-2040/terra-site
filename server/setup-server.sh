#!/bin/sh
# Однократная настройка домашнего Ubuntu-сервера под сайт.
#   sudo sh setup-server.sh dev.terra-electro.ru git@github.com:ЛОГИН/terra-site.git
# Скрипт можно запускать повторно: уже сделанные шаги он пропускает.
set -eu
DOMAIN="${1:?укажите домен, например dev.terra-electro.ru}"
REPO="${2:?укажите SSH-адрес репозитория, например git@github.com:login/terra-site.git}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== 1. Caddy (официальный репозиторий)"
if ! command -v caddy >/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg git
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
fi
# nginx со старых экспериментов занял бы порты 80/443
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo "   останавливаю nginx (освобождаю порты 80/443)"
    systemctl disable --now nginx
fi

echo "== 2. Пользователь terra и ключ для чтения репозитория"
id terra >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/terra --shell /usr/sbin/nologin terra
KEY=/home/terra/.ssh/id_ed25519
if [ ! -f "$KEY" ]; then
    install -d -m 700 -o terra -g terra /home/terra/.ssh
    sudo -u terra ssh-keygen -q -t ed25519 -N "" -C "terra-deploy@$(hostname)" -f "$KEY"
    sudo -u terra sh -c 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null'
fi
echo
echo "   Добавьте этот ключ в GitHub: репозиторий → Settings → Deploy keys → Add deploy key"
echo "   (галочку «Allow write access» НЕ ставить):"
echo
cat "$KEY.pub"
echo
printf "   Нажмите Enter, когда ключ добавлен... "; read _

echo "== 3. Клон ветки deploy в /var/www/terra"
if [ ! -d /var/www/terra/.git ]; then
    rm -rf /var/www/terra
    install -d -o terra -g terra /var/www/terra
    sudo -u terra git clone -q --branch deploy --single-branch "$REPO" /var/www/terra
fi
chmod -R a+rX /var/www/terra

echo "== 4. Автообновление раз в минуту"
install -m 755 "$HERE/terra-update.sh" /usr/local/bin/terra-update
install -m 644 "$HERE/terra-update.service" /etc/systemd/system/terra-update.service
install -m 644 "$HERE/terra-update.timer" /etc/systemd/system/terra-update.timer
systemctl daemon-reload
systemctl enable --now terra-update.timer

echo "== 5. Конфиг Caddy для $DOMAIN"
install -d -o caddy -g caddy /var/log/caddy
sed "s/DEV_DOMAIN/$DOMAIN/" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy || systemctl restart caddy

echo
echo "Готово. Сайт: https://$DOMAIN"
echo "Журнал обновлений:  journalctl -u terra-update -f"
echo "Журнал Caddy:       journalctl -u caddy -f"
