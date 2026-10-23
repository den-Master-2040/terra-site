#!/bin/sh
# Забирает свежую сборку из ветки deploy. Запускается systemd-таймером раз в минуту.
# Ничего не делает, если на GitHub нет нового коммита.
set -eu
cd /var/www/terra
git fetch -q origin deploy
local_rev=$(git rev-parse HEAD)
remote_rev=$(git rev-parse origin/deploy)
if [ "$local_rev" != "$remote_rev" ]; then
    git reset -q --hard origin/deploy
    echo "обновлено: $(git log -1 --format='%h %s')"
fi
