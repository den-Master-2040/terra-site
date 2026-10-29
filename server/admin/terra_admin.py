#!/usr/bin/env python3
"""Админка новостей сайта Терра Электро: маленький HTTP-сервис без зависимостей (только стандартная библиотека).

Что делает: проверяет пароль, отдаёт список новостей и сохраняет изменения. Сохранение — это коммит
в репозиторий: data/news.json и новые картинки в static/img/news. Дальше всё как при обычной правке:
GitHub Actions собирает сайт, сервер забирает ветку deploy, через 1–2 минуты новость на сайте.

nginx пересылает сюда запросы /api/admin/… (см. server/nginx-terra.conf).

Настройки — переменные окружения (на сервере лежат в /etc/terra-admin.env):
    ADMIN_PASSWORD_HASH  хеш пароля: python3 terra_admin.py hash-password
    ADMIN_SECRET         ключ подписи сессий, любая длинная случайная строка (без него сессии живут до перезапуска)
    GITHUB_TOKEN         fine-grained токен с правом Contents: Read and write только на репозиторий сайта
    GITHUB_REPO          владелец/репозиторий, например den-Master-2040/terra-site
    GITHUB_BRANCH        ветка с исходниками, по умолчанию main
    TERRA_REPO_DIR       вместо GitHub писать прямо в локальную копию репозитория (для проверки у себя)
    LISTEN               адрес:порт, по умолчанию 127.0.0.1:12081

Запуск у себя без GitHub:
    TERRA_REPO_DIR=. ADMIN_PASSWORD_HASH=$(python3 server/admin/terra_admin.py hash-password test) python3 server/admin/terra_admin.py
"""
import base64, getpass, hashlib, hmac, json, os, re, secrets, sys, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NEWS_PATH = "data/news.json"
IMG_DIR = "static/img/"
SESSION_TTL = 12 * 3600
MAX_BODY = 64 * 1024 * 1024
MAX_IMAGE = 12 * 1024 * 1024
MONTHS = "января февраля марта апреля мая июня июля августа сентября октября ноября декабря".split()

PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")
SECRET = (os.environ.get("ADMIN_SECRET") or secrets.token_hex(32)).encode()
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GH_REPO = os.environ.get("GITHUB_REPO", "")
GH_BRANCH = os.environ.get("GITHUB_BRANCH", "main")
LOCAL_DIR = os.environ.get("TERRA_REPO_DIR", "")


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


# ------------------------------------------------------------------ пароль и сессии
def hash_password(password, iterations=600_000):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def check_password(password):
    try:
        algo, iterations, salt, digest = PASSWORD_HASH.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    got = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
    return hmac.compare_digest(got, digest)


def make_session():
    exp = str(int(time.time()) + SESSION_TTL)
    return exp + "." + hmac.new(SECRET, exp.encode(), "sha256").hexdigest()


def session_ok(token):
    exp, _, sig = (token or "").partition(".")
    if not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, hmac.new(SECRET, exp.encode(), "sha256").hexdigest())


FAILS = {}  # ip → (число неудач подряд, время последней)


def login_allowed(ip):
    n, last = FAILS.get(ip, (0, 0))
    return n < 5 or time.time() - last > 60 * min(2 ** (n - 5), 60)


# ------------------------------------------------------------------ проверка новостей
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
IMG = re.compile(r"^news(?:/[a-z0-9-]+|-[a-z0-9-]+)\.(?:jpg|jpeg|png|webp)$")
LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
MAGIC = {b"\xff\xd8\xff": "jpg", b"\x89PNG": "png", b"RIFF": "webp"}


def clean_text(value, field, limit=20000, required=True):
    if not isinstance(value, str):
        raise ApiError(400, f"{field}: ожидается текст")
    value = re.sub(r"[ \t\r\n]+", " ", value).strip()
    if required and not value:
        raise ApiError(400, f"{field}: пусто")
    if len(value) > limit:
        raise ApiError(400, f"{field}: слишком длинно")
    for _, url in LINK.findall(value):
        if not re.match(r"^(https?://|mailto:|tel:)", url):
            raise ApiError(400, f"{field}: ссылка должна начинаться с https://, mailto: или tel:")
    return value


def clean_image(value, known, field):
    if not isinstance(value, str) or not IMG.match(value) or value not in known:
        raise ApiError(400, f"{field}: нет такой картинки ({value})")
    return value


def clean_news(items, known_images):
    if not isinstance(items, list) or len(items) > 1000:
        raise ApiError(400, "Ожидается список новостей")
    out, slugs = [], set()
    for n, it in enumerate(items, 1):
        where = f"Новость {n}"
        if not isinstance(it, dict):
            raise ApiError(400, where + ": неверный формат")
        slug = it.get("slug", "")
        if not isinstance(slug, str) or not SLUG.match(slug) or len(slug) > 80:
            raise ApiError(400, where + ": адрес страницы — только латиница, цифры и дефисы")
        if slug in slugs:
            raise ApiError(400, f"{where}: адрес news-{slug}.html уже занят")
        slugs.add(slug)
        iso = it.get("iso", "")
        if not isinstance(iso, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", iso):
            raise ApiError(400, where + ": дата в формате ГГГГ-ММ-ДД")
        y, m, d = (int(x) for x in iso.split("-"))
        if not (1 <= m <= 12 and 1 <= d <= 31):
            raise ApiError(400, where + ": неверная дата")
        body = []
        for b in it.get("body") or []:
            if not isinstance(b, list) or len(b) != 2:
                raise ApiError(400, where + ": неверный блок текста")
            kind, val = b
            if kind == "p":
                body.append(["p", clean_text(val, where + ", абзац")])
            elif kind == "ul":
                items_ = [clean_text(x, where + ", список") for x in (val if isinstance(val, list) else []) if str(x).strip()]
                if items_:
                    body.append(["ul", items_])
            elif kind == "img":
                body.append(["img", clean_image(val, known_images, where + ", фото")])
            elif kind == "gallery":
                files = [clean_image(x, known_images, where + ", фото") for x in (val if isinstance(val, list) else [])]
                if files:
                    body.append(["gallery", files] if len(files) > 1 else ["img", files[0]])
            elif kind == "video":
                if not isinstance(val, str) or not re.match(r"^[\w-]{6,20}$", val):
                    raise ApiError(400, where + ": неверный ролик YouTube")
                body.append(["video", val])
            else:
                raise ApiError(400, f"{where}: неизвестный блок {kind}")
        out.append({
            "slug": slug, "iso": iso, "date": f"{d} {MONTHS[m - 1]} {y}",
            "title": clean_text(it.get("title"), where + ", заголовок", 300),
            "lead": clean_text(it.get("lead"), where + ", краткое описание", 600),
            "img": clean_image(it.get("img"), known_images, where + ", обложка"),
            "body": body,
        })
    out.sort(key=lambda x: x["iso"], reverse=True)  # sorted() устойчив: в один день порядок сохраняется
    return out


def decode_uploads(files):
    """{"news/имя.jpg": base64} → {путь в репозитории: байты}. Проверяет имя, размер и что это правда картинка."""
    out = {}
    if not isinstance(files, dict) or len(files) > 60:
        raise ApiError(400, "Слишком много файлов за раз")
    for name, data in files.items():
        if not isinstance(name, str) or not name.startswith("news/") or not IMG.match(name):
            raise ApiError(400, f"Недопустимое имя файла: {name}")
        try:
            raw = base64.b64decode(data, validate=True)
        except Exception:
            raise ApiError(400, f"Файл {name} повреждён")
        if len(raw) > MAX_IMAGE:
            raise ApiError(400, f"Файл {name} больше {MAX_IMAGE // 1024 // 1024} МБ")
        if not any(raw.startswith(sig) for sig in MAGIC) or (raw.startswith(b"RIFF") and raw[8:12] != b"WEBP"):
            raise ApiError(400, f"{name} — не картинка JPG, PNG или WebP")
        out[IMG_DIR + name] = raw
    return out


# ------------------------------------------------------------------ хранилище: GitHub или локальная папка
def gh(method, path, payload=None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{GH_REPO}/{path}", method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {GH_TOKEN}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "terra-admin"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:300]
        if err.code == 422 and path.startswith("git/refs"):
            raise ApiError(409, "Пока вы редактировали, репозиторий изменился. Обновите страницу и повторите.")
        raise ApiError(502, f"GitHub ответил {err.code}: {detail}")
    except urllib.error.URLError as err:
        raise ApiError(502, f"Нет связи с GitHub: {err.reason}")


class GitHubStore:
    def _head(self):
        """(sha последнего коммита ветки, sha его дерева)"""
        head = gh("GET", f"git/ref/heads/{GH_BRANCH}")["object"]["sha"]
        return head, gh("GET", f"git/commits/{head}")["tree"]["sha"]

    def _tree(self, tree_sha):
        tree = gh("GET", f"git/trees/{tree_sha}?recursive=1")
        if tree.get("truncated"):
            raise ApiError(502, "GitHub отдал неполный список файлов репозитория")
        return tree

    def load(self):
        _, tree_sha = self._head()
        tree = self._tree(tree_sha)
        entry = next(t for t in tree["tree"] if t["path"] == NEWS_PATH)
        blob = gh("GET", f"git/blobs/{entry['sha']}")
        news = json.loads(base64.b64decode(blob["content"]))
        images = {t["path"][len(IMG_DIR):] for t in tree["tree"] if t["path"].startswith(IMG_DIR) and t["type"] == "blob"}
        return news, entry["sha"], images

    def save(self, news_bytes, uploads, version, message):
        head, tree_sha = self._head()
        tree = self._tree(tree_sha)
        current = next(t["sha"] for t in tree["tree"] if t["path"] == NEWS_PATH)
        if current != version:
            raise ApiError(409, "Новости уже изменили в другом окне или в репозитории. Обновите страницу и повторите.")
        entries = []
        for path, raw in list(uploads.items()) + [(NEWS_PATH, news_bytes)]:
            blob = gh("POST", "git/blobs", {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
            entries.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        new_tree = gh("POST", "git/trees", {"base_tree": tree_sha, "tree": entries})
        new_commit = gh("POST", "git/commits", {"message": message, "tree": new_tree["sha"], "parents": [head]})
        gh("PATCH", f"git/refs/heads/{GH_BRANCH}", {"sha": new_commit["sha"]})
        return next(e["sha"] for e in entries if e["path"] == NEWS_PATH)


class LocalStore:
    """Пишет прямо в рабочую копию репозитория — для проверки админки у себя. Ничего не коммитит."""
    def __init__(self, root):
        self.root = os.path.abspath(root)

    def _version(self, raw):
        return hashlib.sha1(raw).hexdigest()

    def load(self):
        with open(os.path.join(self.root, NEWS_PATH), "rb") as f:
            raw = f.read()
        img_root = os.path.join(self.root, IMG_DIR)
        images = set()
        for dirpath, _, files in os.walk(img_root):
            for fn in files:
                images.add(os.path.relpath(os.path.join(dirpath, fn), img_root).replace(os.sep, "/"))
        return json.loads(raw), self._version(raw), images

    def save(self, news_bytes, uploads, version, message):
        _, current, _ = self.load()
        if current != version:
            raise ApiError(409, "Новости уже изменили в другом окне. Обновите страницу и повторите.")
        for path, raw in uploads.items():
            os.makedirs(os.path.dirname(os.path.join(self.root, path)), exist_ok=True)
            with open(os.path.join(self.root, path), "wb") as f:
                f.write(raw)
        with open(os.path.join(self.root, NEWS_PATH), "wb") as f:
            f.write(news_bytes)
        print("сохранено локально:", message, file=sys.stderr)
        return self._version(news_bytes)


def describe(old, new):
    """Подпись коммита: что поменялось."""
    before = {n["slug"]: n for n in old}
    after = {n["slug"]: n for n in new}
    parts = [f"добавлена «{after[s]['title']}»" for s in after if s not in before]
    parts += [f"удалена «{before[s]['title']}»" for s in before if s not in after]
    parts += [f"изменена «{after[s]['title']}»" for s in after if s in before and after[s] != before[s]]
    return "Новости (админка): " + ("; ".join(parts) if parts else "без изменений")


STORE = LocalStore(LOCAL_DIR) if LOCAL_DIR else GitHubStore()


# ------------------------------------------------------------------ HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "terra-admin"

    def _ip(self):
        return self.headers.get("X-Real-IP") or self.client_address[0]

    def _send(self, status, payload, cookie=None):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            age = SESSION_TTL if cookie else 0
            self.send_header("Set-Cookie", f"te_admin={cookie}; Path=/api/admin/; Max-Age={age}; HttpOnly; SameSite=Strict{secure}")
        self.end_headers()
        self.wfile.write(body)

    def _json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ApiError(413, "Слишком большой запрос: уменьшите число или размер фото")
        # простой заслон от CSRF: браузер не пошлёт этот заголовок с чужого сайта без CORS
        if self.headers.get("X-Terra-Admin") != "1":
            raise ApiError(403, "Запрос не из админки")
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            raise ApiError(400, "Неверный JSON")

    def _authed(self):
        cookies = dict(c.strip().split("=", 1) for c in (self.headers.get("Cookie") or "").split(";") if "=" in c)
        if not session_ok(cookies.get("te_admin")):
            raise ApiError(401, "Нужно войти")

    def _route(self, method):
        path = self.path.split("?")[0]
        if method == "POST" and path == "/api/admin/login":
            data = self._json()
            ip = self._ip()
            if not login_allowed(ip):
                raise ApiError(429, "Слишком много попыток. Подождите и попробуйте снова.")
            if not PASSWORD_HASH or not check_password(str(data.get("password", ""))):
                n, _ = FAILS.get(ip, (0, 0))
                FAILS[ip] = (n + 1, time.time())
                time.sleep(1)
                raise ApiError(401, "Неверный пароль")
            FAILS.pop(ip, None)
            return self._send(200, {"ok": True}, cookie=make_session())
        if method == "POST" and path == "/api/admin/logout":
            self._json()
            return self._send(200, {"ok": True}, cookie="")
        self._authed()
        if method == "GET" and path == "/api/admin/news":
            news, version, _ = STORE.load()
            return self._send(200, {"news": news, "version": version})
        if method == "PUT" and path == "/api/admin/news":
            data = self._json()
            old, _, images = STORE.load()
            uploads = decode_uploads(data.get("files") or {})
            known = images | {p[len(IMG_DIR):] for p in uploads}
            news = clean_news(data.get("news"), known)
            raw = (json.dumps(news, ensure_ascii=False, indent=1) + "\n").encode()
            version = STORE.save(raw, uploads, data.get("version"), describe(old, news))
            return self._send(200, {"news": news, "version": version})
        raise ApiError(404, "Нет такого адреса")

    def _handle(self, method):
        try:
            self._route(method)
        except ApiError as err:
            self._send(err.status, {"error": str(err)})
        except Exception as err:  # не роняем сервис из-за одной ошибки
            self.log_error("ошибка: %r", err)
            self._send(500, {"error": "Внутренняя ошибка админки"})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PUT(self):
        self._handle("PUT")


def main():
    if sys.argv[1:2] == ["hash-password"]:
        pw = sys.argv[2] if len(sys.argv) > 2 else getpass.getpass("Пароль админки: ")
        print(hash_password(pw))
        return
    if not PASSWORD_HASH:
        sys.exit("Не задан ADMIN_PASSWORD_HASH (python3 terra_admin.py hash-password)")
    if not LOCAL_DIR and not (GH_TOKEN and GH_REPO):
        sys.exit("Задайте GITHUB_TOKEN и GITHUB_REPO или TERRA_REPO_DIR")
    host, _, port = os.environ.get("LISTEN", "127.0.0.1:12081").rpartition(":")
    print(f"админка слушает {host}:{port}, хранилище: {'папка ' + LOCAL_DIR if LOCAL_DIR else 'GitHub ' + GH_REPO}", file=sys.stderr)
    ThreadingHTTPServer((host, int(port)), Handler).serve_forever()


if __name__ == "__main__":
    main()
