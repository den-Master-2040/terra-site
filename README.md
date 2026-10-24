# Сайт Терра Электро

Новый сайт terra-electro.ru: многостраничный сайт (главная и раздел «Системы накопления энергии» по макетам из `example/`, остальная структура — со старого WordPress-сайта) и лендинг с 3D-двигателем на three.js (сейчас скрыт: ссылок на него нет). Чистая статика, без PHP и базы.

История решений и договорённостей — в [docs/DECISIONS.md](docs/DECISIONS.md). Читать первым, если продолжаете работу в новом чате.

## Как устроено

```
main  ──push──▶  GitHub Actions: npm ci + python3 build.py  ──▶  ветка deploy (готовый dist/)
                                                                     │
домашний сервер: systemd-таймер раз в минуту делает git fetch ◀──────┘
                 Caddy отдаёт /var/www/terra по HTTPS
```

| Папка / файл | Что там |
|---|---|
| `content.py` | Все тексты, меню, карточки, список картинок. Правьте здесь. |
| `build.py` | Шаблоны страниц и сборка в `dist/`. |
| `src/css/site.css` | Стили (светлая тема + тёмная по кнопке). |
| `src/js/site.js` | Тема, мобильное меню, формы. |
| `src/js/motor.js` | 3D-двигатель. Собирается esbuild в обычный скрипт, поэтому работает и с диска. |
| `static/` | Копируется в сайт как есть: `img/` — картинки со старого сайта, `assets/img/` — постеры двигателя. |
| `tools/` | `fetch-images.bat` / `.sh` — скачать картинки со старого сайта в `static/img`; `render_posters.py` — перерисовать постеры после правок 3D. |
| `server/` | Caddyfile, автообновление, `setup-server.sh` для настройки сервера. |
| `.github/workflows/deploy.yml` | Сборка и публикация в ветку `deploy`. |

## Собрать и посмотреть у себя (Windows)

Нужны [Node.js LTS](https://nodejs.org) и [Python 3](https://www.python.org).

```bat
npm ci
python build.py
```

Открыть `dist\index.html` двойным кликом — всё работает и с диска.

## Настроить сервер (один раз)

1. В DNS домена: A-запись `dev` → белый IP дома. Порты 80 и 443 проброшены на сервер.
2. На сервере:
   ```bash
   git clone https://github.com/ЛОГИН/terra-site.git ~/terra-site   # или скопировать папку server/
   sudo sh ~/terra-site/server/setup-server.sh dev.terra-electro.ru git@github.com:ЛОГИН/terra-site.git
   ```
   Скрипт поставит Caddy, создаст ключ только для чтения и попросит добавить его в GitHub (Settings → Deploy keys).
3. Через минуту после каждого пуша в `main` сайт на `https://dev.terra-electro.ru` обновится сам.

Проверка: `journalctl -u terra-update -f` (обновления), `journalctl -u caddy -f` (веб-сервер).

## Что ещё не подключено

- Отправка формы заявки (нужен обработчик `POST /api/request`).
- Полные тексты новостей, страницы остальных категорий каталога и брендов, политика конфиденциальности.
