"""Сборка статического сайта Терра Электро в dist/.

    python3 build.py

Что делает:
  * собирает 3D-двигатель (src/js/motor.js + three.js) в один обычный скрипт через esbuild;
  * копирует шрифты, стили, общий скрипт;
  * генерирует HTML-страницы из шаблонов ниже и текстов в content.py;
  * пишет fetch-images.sh, который скачивает картинки со старого сайта в img/.
Картинки и постеры двигателя лежат в static/ и копируются в dist/ как есть.
Ссылки между страницами относительные (catalog.html), поэтому сайт открывается и с сервера, и с диска.
"""
import hashlib, html, pathlib, shutil, subprocess, urllib.parse
import content as C

ROOT = pathlib.Path(__file__).parent
DIST = ROOT / "dist"
NM = ROOT / "node_modules"
e = html.escape


def version(rel):
    """Метка версии по содержимому файла: site.css?v=… меняется при каждой правке,
    и браузер не может подсунуть старый файл из кэша."""
    return hashlib.sha1((ROOT / rel).read_bytes()).hexdigest()[:8]


# ------------------------------------------------------------------ ресурсы
def build_assets():
    (DIST / "assets/js").mkdir(parents=True, exist_ok=True)
    (DIST / "assets/css").mkdir(parents=True, exist_ok=True)
    (DIST / "assets/fonts").mkdir(parents=True, exist_ok=True)
    (DIST / "img").mkdir(exist_ok=True)
    subprocess.run([str(NM / ".bin/esbuild"), "src/js/motor.js", "--bundle", "--minify", "--format=iife",
                    "--target=es2018", "--outfile=dist/assets/js/motor.js", "--log-level=warning"], cwd=ROOT, check=True)
    shutil.copy(ROOT / "src/js/site.js", DIST / "assets/js/site.js")
    shutil.copy(ROOT / "src/css/site.css", DIST / "assets/css/site.css")
    # Шрифт как на terra-electro.ru — Libre Franklin с Google Fonts (в этой версии есть кириллица).
    # Файлы лежат в static/assets/fonts и уже скопированы в dist вместе со static/.
    faces = [f"@font-face{{font-family:'Libre Franklin';font-style:normal;font-display:swap;font-weight:{w};"
             f"src:url(libre-franklin-{w}.woff2) format('woff2')}}" for w in (400, 500, 600, 700, 800)]
    (DIST / "assets/fonts/fonts.css").write_text("\n".join(faces) + "\n", encoding="utf-8")


def write_fetch_script():
    lines = ["#!/bin/sh",
             "# Скачивает картинки со старого сайта terra-electro.ru в папку img/.",
             "# Запуск:  sh tools/fetch-images.sh   (картинки лягут в static/img)",
             'cd "$(dirname "$0")/../static" && mkdir -p img',
             "fail=0",
             'get() { if wget -q -O "img/$1" "$2"; then echo "ok    $1"; else echo "FAIL  $1  $2"; rm -f "img/$1"; fail=$((fail+1)); fi; }']
    for local, path in C.IMAGES.items():
        url = C.SITE + urllib.parse.quote(path)
        lines.append(f'get "{local}" "{url}"')
    lines.append('echo "Готово. Не скачалось: $fail"')
    p = ROOT / "tools/fetch-images.sh"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    p.chmod(0o755)
    write_fetch_bat()


def write_fetch_bat():
    """То же самое для Windows. curl.exe встроен в Windows 10 (1803+) и 11.

    Ловушки cmd, которые здесь обойдены:
      * в .bat знак % начинает переменную, поэтому каждый % в URL удвоен (%%D0%%9F…);
      * CALL раскрывает % второй раз, поэтому никаких подпрограмм — одна строка curl на картинку;
      * файл в UTF-8 без BOM (BOM ломает первую строку) и с переводами строк CRLF.
    """
    lines = ["@echo off",
             "chcp 65001 >nul",
             "rem Скачивает картинки со старого сайта terra-electro.ru в папку img\\",
             "rem Запуск: двойной клик. Картинки лягут в static\\img",
             'cd /d "%~dp0..\\static"',
             "if not exist img mkdir img",
             "where curl >nul 2>nul || (echo Не найден curl. Он встроен в Windows 10 и 11. & pause & exit /b 1)",
             "set fail=0"]
    for local, path in C.IMAGES.items():
        url = (C.SITE + urllib.parse.quote(path)).replace("%", "%%")
        lines.append(f'curl -fsS --retry 2 -o "img\\{local}" "{url}" && (echo ok    {local}) '
                     f'|| (echo FAIL  {local} & del /q "img\\{local}" 2>nul & set /a fail+=1 >nul)')
    lines += ["echo.", "echo Готово. Не скачалось: %fail%", "pause"]
    (ROOT / "tools/fetch-images.bat").write_bytes(("\r\n".join(lines) + "\r\n").encode("utf-8"))


# ------------------------------------------------------------------ кусочки разметки
def ph(img, alt="", cls=""):
    return (f'<div class="ph {cls}"><img src="img/{e(img)}" alt="{e(alt)}" loading="lazy" decoding="async"></div>')


# Линейные иконки 24×24: обводка цветом текста, элементы с классом ac — жёлтым акцентом
ICONS = {
    "shield": '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path class="ac" d="M8.5 12l2.5 2.5 4.5-5"/>',
    "bars": '<path d="M3 21h18"/><path class="ac" d="M5 18v-5h3v5z"/><path d="M10.5 18V9h3v9z"/><path class="ac" d="M16 18V5h3v13z"/>',
    "gear": '<circle cx="12" cy="12" r="6.5"/><circle class="ac" cx="12" cy="12" r="2.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    "leaf": '<path d="M5 20c0-9 5-14 15-15 0 9.5-5 15-14 15"/><path class="ac" d="M4 21c3-5 7-9 11-11"/>',
    "bolt": '<path class="ac" d="M13 2L5 13.5h6L10 22l8-11.5h-6z"/>',
    "wave": '<path class="ac" d="M2 12h3l2.5-6 3.5 12 3-9 2 5 1.5-2H22"/>',
    "turbine": '<path d="M12 10.5V22M9 22h6"/><circle cx="12" cy="9" r="1.4"/><path class="ac" d="M12 7.6V2M13.2 9.7l4.8 2.8M10.8 9.7L6 12.5"/>',
    "factory": '<path d="M3 21V11l5 3v-3l5 3V4h4v17"/><path d="M2 21h20"/><path class="ac" d="M6.5 17.5h2M10.5 17.5h2M14.5 17.5h2"/>',
    "building": '<path d="M5 21V3h10v18M15 8h4v13M3 21h18"/><path class="ac" d="M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1"/>',
    "server": '<rect x="4" y="3" width="16" height="6" rx="1"/><rect x="4" y="11" width="16" height="6" rx="1"/><path d="M8 17v4M16 17v4"/><path class="ac" d="M7 6h1M7 14h1M12 6h5M12 14h5"/>',
    "ship": '<path d="M3 15l2 4h14l2-4z"/><path d="M6 15v-4h12v4M9 11V7h6v4M12 7V3"/><path class="ac" d="M2 22c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>',
    "doc": '<path d="M6 2h9l4 4v16H6z"/><path d="M15 2v4h4"/><path class="ac" d="M9 11h7M9 15h7M9 19h4"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "download": '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    "pylon": '<path d="M12 2L7 22M12 2l5 20M5 6h14M9 10h6M8 15h8M7.3 19h9.4"/>',
    "battery": '<rect x="4" y="6" width="16" height="15" rx="1.5"/><path d="M8 3v3M16 3v3"/><path class="ac" d="M9 11v5M6.5 13.5h5M14 13.5h4"/>',
    "monitor": '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M9 20h6M12 16v4"/><path class="ac" d="M6 13l4-4 3 2 4-5"/>',
    "chip": '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/><path class="ac" d="M10 10h4v4h-4z"/>',
    "pcs": '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M5 19L19 5"/><path class="ac" d="M6 9c1.5-2 3-2 4.5 0M13.5 15h5M13.5 17.5h5"/>',
}


def icon(name, cls="ic"):
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'


def arrow_link(text, href, cls="more"):
    return f'<a class="{cls}" href="{href}">{e(text)}{icon("arrow", "ic ic-arrow")}</a>'


def topic_link(name, page="catalog.html"):
    return f'{page}?topic={urllib.parse.quote(name)}#request'


def head(title, desc, redirect=False):
    redir = ""
    if redirect:
        # Первый заход в сессии на главную → лендинг. Внутри сайта не срабатывает (site.js ставит отметку).
        redir = ("<script>(function(){try{if(location.search.indexOf('site')<0&&!sessionStorage.getItem('te-visited')){"
                 "sessionStorage.setItem('te-visited','1');location.replace('landing.html');}}catch(e){}})();</script>\n")
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="icon" href="img/favicon.png">
<script>(function(){{try{{if(localStorage.getItem('te-theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}}catch(e){{}}}})();</script>
{redir}<link rel="stylesheet" href="assets/fonts/fonts.css?v={version("static/assets/fonts/libre-franklin-400.woff2")}">
<link rel="stylesheet" href="assets/css/site.css?v={version("src/css/site.css")}">
</head>
<body>
"""


def header(current, cta="#request"):
    items = []
    for href, name, subs in C.MENU:
        cur = ' aria-current="page"' if current in [href] + [s[0] for s in subs] else ""
        if subs:
            sub = "".join(f'<li><a href="{h}"{" aria-current=\"page\"" if h == current else ""}>{e(n)}</a></li>' for h, n in subs)
            items.append(f'<li class="has-sub"><a href="{href}"{cur}>{e(name)}</a><ul class="sub">{sub}</ul></li>')
        else:
            items.append(f'<li><a href="{href}"{cur}>{e(name)}</a></li>')
    return f"""<div class="topbar"><div class="wrap">
  <span class="tagline">{e(C.TAGLINE)}</span>
  <a class="phone-top" href="tel:{C.PHONE_TEL}">{C.PHONE}</a>
  <a class="email" href="mailto:{C.EMAIL}">{C.EMAIL}</a>
  <button class="theme-toggle" type="button" aria-pressed="false">
    <svg class="ic-moon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    <svg class="ic-sun" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g></svg>
    <span class="label">Тёмная тема</span>
  </button>
</div></div>
<header class="site-header"><div class="wrap">
  <a class="brand" href="index.html?site" aria-label="Терра Электро, на главную">
    <img src="img/logo.png" alt="Терра Электро" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
    <span class="brand-text" hidden>Терра Электро</span>
  </a>
  <nav class="nav" id="nav" aria-label="Разделы сайта"><ul>{''.join(items)}</ul></nav>
  <a class="btn btn-primary btn-cta" href="{cta}">Связаться с нами</a>
  <button class="burger" type="button" aria-label="Меню" aria-controls="nav" aria-expanded="false"><span></span><span></span><span></span></button>
</div></header>
"""


def request_block(title="Отправить запрос", text=None):
    text = text or ("Подберём замену установленному оборудованию с учётом характеристик и условий работы, "
                    "сохраним габаритные и присоединительные размеры. Техническая консультация бесплатно.")
    return f"""<section class="section band request" id="request" aria-labelledby="request-title"><div class="wrap">
  <div class="intro">
    <h2 id="request-title">{e(title)}</h2>
    <p>{e(text)}</p>
    <p class="contact-line"><a href="tel:{C.PHONE_TEL}">{C.PHONE}</a><br><a href="mailto:{C.EMAIL}">{C.EMAIL}</a></p>
  </div>
  <form class="form" novalidate>
    <div class="field full"><label for="f-name">ФИО</label><input id="f-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="f-email">E-mail</label><input id="f-email" name="email" type="email" autocomplete="email"></div>
    <div class="field"><label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
    <div class="field full"><label for="f-msg">Сообщение</label><textarea id="f-msg" name="message" placeholder="Например: АИР132M4, 11 кВт, 1500 об/мин, IM1081, 2 шт."></textarea></div>
    <div class="form-foot full"><button class="btn btn-primary" type="submit">Отправить запрос</button><span class="form-note">Нажимая кнопку, вы соглашаетесь на обработку персональных данных</span></div>
    <p class="form-status" role="status" hidden></p>
  </form>
</div></section>
"""


def footer(scripts=""):
    links = "".join(f'<li><a href="{h}">{e(n)}</a></li>' for h, n, _ in C.MENU if h != "index.html")
    return f"""<footer class="site-footer"><div class="wrap">
  <div class="footer-grid">
    <div><a class="brand" href="index.html?site"><img src="img/logo.png" alt="Терра Электро" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="brand-text" hidden>Терра Электро</span></a>
      <p>{e(C.TAGLINE)}</p></div>
    <ul class="footer-nav">{links}</ul>
    <div class="footer-contacts">
      <a href="tel:{C.PHONE_TEL}">{C.PHONE}</a>
      <a href="mailto:{C.EMAIL}">{C.EMAIL}</a>
      <span>{e(C.ADDRESS)}</span>
    </div>
  </div>
  <div class="footer-bottom"><span>© 2026 ООО «Терра-Электро»</span><span>Пн–Чт 9:00–17:00, Пт 9:00–16:00</span></div>
</div></footer>
<script src="assets/js/site.js?v={version("src/js/site.js")}"></script>
{scripts}</body>
</html>
"""


def page_head(crumbs, h1, lead=""):
    cr = '<li><a href="index.html?site">Главная</a></li>' + "".join(
        f'<li><a href="{h}">{e(n)}</a></li>' if h else f'<li aria-current="page">{e(n)}</li>' for h, n in crumbs)
    lead_html = f'<p class="lead">{e(lead)}</p>' if lead else ""
    return f"""<div class="page-head"><div class="wrap">
  <ol class="crumbs" aria-label="Навигационная цепочка">{cr}</ol>
  <h1>{e(h1)}</h1>{lead_html}
</div></div>
"""


def tiles(cats=C.CATEGORIES, page="catalog.html"):
    out = []
    for name, text, img, link in cats:
        href = link or topic_link(name, page)
        out.append(f'<li><a class="tile" href="{href}">{ph(img, name)}<h3>{e(name)}</h3><p>{e(text)}</p></a></li>')
    return f'<ul class="tiles">{"".join(out)}</ul>'


def directions():
    return '<ul class="dirs">' + "".join(
        f'<li><a class="dir-card" href="{href}">{ph(img, name)}<h3>{e(name)}</h3><p>{e(text)}</p><span class="go">Подробнее</span></a></li>'
        for name, text, img, href in C.DIRECTIONS) + "</ul>"


def advantages():
    return '<ul class="adv">' + "".join(
        f'<li>{ph(img)}<div><b>{e(t)}</b><span>{e(s)}</span></div></li>' for t, s, img in C.ADVANTAGES) + "</ul>"


def brand_logos(link=True):
    tag = "a" if link else "div"
    href = ' href="brands.html"' if link else ""
    return '<ul class="logos">' + "".join(
        f'<li><{tag} class="logo-card"{href}>{ph(img, name)}<span>{e(name)}</span></{tag}></li>' for name, img in C.BRANDS) + "</ul>"


def clients():
    return '<ul class="logos">' + "".join(
        f'<li><div class="logo-card">{ph(img, name)}<span>{e(name)}<small>{e(country)}</small></span></div></li>'
        for name, country, img in C.CLIENTS) + "</ul>"


def news_cards(items):
    return '<ul class="news">' + "".join(
        f'<li id="n-{iso}"><article class="news-card">{ph(img, title, "cover")}<time datetime="{iso}">{e(date)}</time>'
        f'<h3>{e(title)}</h3><p>{e(text)}</p></article></li>' for iso, date, title, text, img in items) + "</ul>"


def write(name, html_text):
    (DIST / name).write_text(html_text, encoding="utf-8")


def page(name, title, desc, body, current=None, request=True, request_title="Отправить запрос", scripts="", redirect=False):
    write(name, head(title, desc, redirect) + header(current or name, "#request" if request else "contacts.html#request") + "<main>\n" + body +
          (request_block(request_title) if request else "") + "</main>\n" + footer(scripts))


# ------------------------------------------------------------------ СНЭ: общие блоки
def sne_diagram():
    """Схема «сеть — преобразователь — батарея» с EMS и BMS. Иконки те же, что в ICONS."""
    def ic(name, x, y, size=40):
        return f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="0 0 24 24" class="dg-ic">{ICONS[name]}</svg>'
    def label(x, y, lines, anchor="start"):
        return "".join(f'<text x="{x}" y="{y + i * 19}" text-anchor="{anchor}">{e(t)}</text>' for i, t in enumerate(lines))
    return f"""<svg class="sne-diagram" viewBox="0 0 600 350" role="img" aria-label="Состав СНЭ: сеть и потребитель, силовой преобразователь PCS, аккумуляторная батарея, системы управления EMS и BMS">
  <path class="dg-line" d="M70 52H470M240 52V118M240 182V222"/>
  <path class="dg-flow" d="M222 66v40M216 72l6-7 6 7M216 100l6 7 6-7M222 190v24M216 196l6-7 6 7M216 208l6 7 6-7"/>
  <path class="dg-dash" d="M272 150H360M320 150V250H360"/>
  {ic("pylon", 24, 24, 44)}{label(84, 40, ["Сеть"])}
  {ic("factory", 474, 26, 44)}{label(496, 98, ["Потребитель"], "middle")}
  <rect class="dg-box" x="208" y="118" width="64" height="64" rx="4"/>{ic("pcs", 220, 130, 40)}
  {label(196, 136, ["Силовой", "преобразователь", "(PCS)"], "end")}
  <rect class="dg-box" x="216" y="222" width="48" height="56" rx="4"/>{ic("battery", 220, 230, 40)}
  {label(240, 304, ["Аккумуляторная", "батарея"], "middle")}
  <rect class="dg-box" x="360" y="126" width="48" height="48" rx="4"/>{ic("monitor", 366, 132, 36)}
  {label(420, 146, ["Система управления", "энергией (EMS)"])}
  <rect class="dg-box" x="360" y="226" width="48" height="48" rx="4"/>{ic("chip", 366, 232, 36)}
  {label(420, 246, ["Система управления", "батареями (BMS)"])}
</svg>"""


def sne_functions(full=False):
    items = C.SNE_FUNCTIONS
    if full:
        body = "".join(f'<li>{icon(i)}<div><b>{e(t)}</b><span>{e(d)}</span></div></li>' for i, t, d in items)
        t, d = C.SNE_FUNCTION_EXTRA
        body += f'<li>{icon("wave")}<div><b>{e(t)}</b><span>{e(d)}</span></div></li>'
        return f'<ul class="abilities full">{body}</ul>'
    return '<ul class="abilities">' + "".join(f'<li>{icon(i)}<span>{e(t)}</span></li>' for i, t, _ in items) + "</ul>"


def sne_about_block(more=True):
    btn = arrow_link("Подробнее", "sne.html#about", "btn btn-primary") if more else ""
    return f"""<div class="what">
  <div class="what-text">
    <h2>Что такое СНЭ?</h2>
    <p class="lead">{e(C.SNE_LEAD)}</p>
    {btn}
  </div>
  {sne_diagram()}
</div>"""


def cta_band():
    pts = [("gear", "Индивидуальные решения"), ("doc", "Техническое сопровождение"), ("bars", "Полный цикл реализации")]
    pts_html = "".join(f"<li>{icon(i)}<span>{e(t)}</span></li>" for i, t in pts)
    return f"""<section class="cta-band"><div class="wrap">
  <div class="cta-text">
    <h2>Инженерные решения от «Терра Электро»</h2>
    <p>От проектирования до внедрения</p>
    {arrow_link("Отправить запрос", "#request", "btn btn-primary")}
  </div>
  <ul class="cta-points">{pts_html}</ul>
</div></section>
"""


# ------------------------------------------------------------------ страницы
def home():
    feats = "".join(f"<li>{icon(i)}<span>{e(t)}</span></li>" for i, t in C.SNE_FEATURES)
    sols = "".join(
        f'<li><a class="sol-card" href="{href}">{ph(img, name)}'
        f'<div class="sol-body"><h3>{e(name)}</h3><p>{e(rng)}</p><span class="round">{icon("arrow")}</span></div></a></li>'
        for name, rng, img, href in C.SNE_SOLUTIONS)
    areas = "".join(f'<li class="area"><div class="area-top">{icon(i, "ic ic-big")}</div>'
                    f'<div class="area-label">{icon(i)}<span>{e(t)}</span></div></li>' for i, t in C.SNE_AREAS)
    body = f"""<section class="hero"><div class="wrap">
  <div class="hero-text">
    <h1>Системы накопления <em>электрической энергии</em></h1>
    <p class="lead">Надёжные решения для управления электрической мощностью</p>
    <div class="actions">
      {arrow_link("Подобрать решение", "sne.html", "btn btn-primary")}
      <a class="btn btn-ghost-light" href="docs/katalog-sne.pdf" download>{icon("doc")}Скачать каталог</a>
    </div>
  </div>
  <div class="hero-visual">
    <img src="img/hero-sne.webp" width="1850" height="1339" alt="Контейнеры системы накопления энергии на стальном поддоне и бетонном основании">
  </div>
</div></section>

<section class="feat-strip"><div class="wrap"><ul>{feats}</ul></div></section>

<section class="section what-section"><div class="wrap">{sne_about_block()}</div></section>

<section class="section"><div class="wrap">
  <div class="row-head"><h2>Наши решения</h2>{arrow_link("Весь каталог", "sne.html")}</div>
  <ul class="solutions">{sols}</ul>
</div></section>

<section class="section tight"><div class="wrap">
  <div class="row-head"><h2>Ключевые возможности</h2>{arrow_link("Все функции", "sne.html#functions")}</div>
  {sne_functions()}
</div></section>

<section class="section tight"><div class="wrap">
  <div class="row-head"><h2>Области применения</h2></div>
  <ul class="areas">{areas}</ul>
</div></section>

<section class="section tight"><div class="wrap">
  <div class="row-head"><h2>Другие направления</h2>{arrow_link("Весь каталог", "catalog.html")}</div>
  {directions()}
</div></section>

{cta_band()}"""
    page("index.html", "Терра Электро — системы накопления энергии",
         "Системы накопления электрической энергии, быстродействующий АВР, аккумуляторные контейнеры. " + C.TAGLINE + ".",
         body, request_title="Отправить запрос")


def catalog():
    feats = [
        ("Комплектные трансформаторные подстанции", "Одно- и двухтрансформаторные КТПП и подстанции с аварийным вводом 2КТПА-ТЭ.", "prod-ktp.png", "podstantsii.html"),
        ("Низковольтное оборудование", "ШСА, ЩПТ, ШУЭС, ЩУЭС, ШВС, ПР 85 ТЭ, АВР, ЩСУ, МЩУ, ящики управления двигателями.", "cat-shkafy.png", "nizkovoltnoye.html"),
        ("Электрооборудование в зданиях", "Поставка электрооборудования для блочно-модульных зданий высокой заводской готовности.", "prod-bmz.png", "proizvodstvo.html#bmz"),
        ("Металлоконструкции", "Кожухи трансформаторов, корпуса щитов и пультов, нетиповые конструкции по чертежам.", "prod-metall.png", "proizvodstvo.html#metall"),
    ]
    prod = "".join(f'<li><a class="tile" href="{h}">{ph(i, n)}<h3>{e(n)}</h3><p>{e(t)}</p></a></li>' for n, t, i, h in feats)
    body = page_head([(None, "Каталог")], "Каталог продукции", C.TAGLINE) + f"""
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Основная продукция</h2><p>Нажмите на категорию, чтобы перейти в раздел или отправить запрос по ней.</p></div>
  {tiles()}
</div></section>
<section class="section band"><div class="wrap">
  <div class="section-head"><h2>Наше производство</h2></div>
  <ul class="tiles">{prod}</ul>
</div></section>
<section class="section tight"><div class="wrap">
  <div class="section-head"><h2>Производители</h2><p>Работаем с более чем 50 мировыми брендами. Основные:</p><a class="more" href="brands.html">Все производители</a></div>
  {brand_logos()}
</div></section>
"""
    page("catalog.html", "Каталог — Терра Электро", "Трансформаторы, электродвигатели, автоматика, преобразователи, кабель, РЗА, ИБП и шкафы.", body)


def sne_cat_tokens(cat):
    return f"{cat} snte" if cat in ("air", "liquid") else cat


def sne_catalog():
    tabs = "".join(f'<button type="button" data-filter="{k}" aria-pressed="{"true" if k == "all" else "false"}">{e(t)}</button>'
                   for k, t in C.SNE_FILTERS)
    cards = []
    for s in C.SNE_SERIES:
        for n, m in enumerate(s["models"], 1):
            bullets = "".join(f"<li>{e(b.format(**m))}</li>" for b in s["card"])
            cards.append(f'<li data-cat="{sne_cat_tokens(s["cat"])}"><article class="p-card">{ph(m["img"], m["name"])}'
                         f'<h3>{e(m["name"])}</h3><p class="p-type">{e(s["short"])}</p><ul class="p-points">{bullets}</ul>'
                         f'<div class="p-foot"><span class="price">Цена по запросу</span>'
                         f'<a class="btn btn-dark btn-small stretched" href="{s["page"]}#m{n}">Подробнее</a></div></article></li>')
    parts = "".join(f"<li><b>{e(t)}</b><span>{e(d)}</span></li>" for t, d in C.SNE_PARTS)
    about = "".join(f"<p>{e(x)}</p>" for x in C.SNE_ABOUT)
    eng = "".join(f"<p>{e(x)}</p>" for x in C.SNE_ENGINEERING)
    body = f"""<section class="cat-head blueprint"><div class="wrap">
  <ol class="crumbs" aria-label="Навигационная цепочка"><li><a href="index.html">Главная</a></li><li aria-current="page">Системы накопления энергии</li></ol>
  <h1>Каталог систем накопления энергии (СНЭ)</h1>
  <p class="lead">Комплексные решения для промышленных и коммерческих объектов</p>
  <div class="seg-tabs" role="group" aria-label="Тип оборудования">{tabs}</div>
</div></section>

<section class="section cat-body blueprint"><div class="wrap">
  <ul class="p-grid">{''.join(cards)}</ul>
  <p class="cat-empty" hidden>В этой группе пока нет моделей.</p>
</div></section>

<section class="section band" id="about"><div class="wrap">
  {sne_about_block(more=False)}
  <div class="about-cols">
    <div class="prose">{about}</div>
    <div><h3 class="sub-h">Состав батарейной СНЭ</h3><ul class="parts">{parts}</ul></div>
  </div>
</div></section>

<section class="section" id="functions"><div class="wrap">
  <div class="row-head"><h2>Функции СНЭ</h2></div>
  {sne_functions(full=True)}
</div></section>

<section class="section band"><div class="wrap">
  <div class="about-cols">
    <div><h2 class="h2">Инженерные решения «Терра Электро»</h2></div>
    <div class="prose">{eng}
      <p><a class="btn btn-ghost" href="docs/katalog-sne.pdf" download>{icon("download")}Скачать каталог СНЭ (PDF)</a></p></div>
  </div>
</div></section>
"""
    page("sne.html", "Системы накопления энергии — Терра Электро",
         "Каталог СНЭ: шкафы СНТЭ с воздушным и жидкостным охлаждением, БАВРТЭ, аккумуляторные контейнеры НТЭ.",
         body, request_title="Подобрать систему накопления")


def product_hero(crumbs, title, accent, lead, img, actions, extra="", tag=""):
    """Тёмный главный экран страницы товара: текст слева, изделие справа."""
    cr = '<li><a href="index.html">Главная</a></li>' + "".join(
        f'<li><a href="{h}">{e(n)}</a></li>' if h else f'<li aria-current="page">{e(n)}</li>' for h, n in crumbs)
    tag_html = f'<span class="pv-tag">{e(tag)}</span>' if tag else ""
    return f"""<section class="p-hero"><div class="wrap">
  <div class="p-hero-text">
    <ol class="crumbs" aria-label="Навигационная цепочка">{cr}</ol>
    <h1>{e(title)}</h1>
    <p class="p-accent">{e(accent)}</p>
    <p class="lead">{e(lead)}</p>
    {extra}
    <div class="actions">{actions}</div>
  </div>
  <div class="p-visual"><img src="img/{e(img)}" alt="{e(title)}">{tag_html}</div>
</div></section>
"""


def bavr_wave():
    """Две синусоиды: сеть и резерв, между ними — время переключения."""
    return """<svg class="bavr-wave" viewBox="0 0 320 90" role="img" aria-label="Переключение с основного источника на резервный менее чем за 20 мс">
  <path class="w1" d="M10 50c12-38 28-38 40 0s28 38 40 0"/>
  <path class="w2" d="M130 50c12-38 28-38 40 0s28 38 40 0 28-38 40 0 28 38 40 0"/>
  <path class="wx" d="M10 50h300M90 14v72M130 14v72M94 20h32M94 20l5-4M94 20l5 4M126 20l-5-4M126 20l-5 4"/>
  <text x="110" y="10" text-anchor="middle">&lt; 20 мс</text>
</svg>"""


def sne_table(cols, models):
    groups = [g for g, _, _ in cols]
    labels = "".join(f'<th scope="col">{e(x)}</th>' for _, _, x in cols)
    if any(groups):
        top, i = [], 0
        while i < len(cols):
            j = i
            while j < len(cols) and cols[j][0] == cols[i][0]:
                j += 1
            top.append(f'<th scope="colgroup" colspan="{j - i}">{e(cols[i][0])}</th>')
            i = j
        thead = (f'<tr><th scope="col" rowspan="2" class="sticky">Наименование</th>{"".join(top)}</tr>'
                 f'<tr>{labels}</tr>')
    else:
        thead = f'<tr><th scope="col" class="sticky">Наименование</th>{labels}</tr>'
    rows, wrap_attr = [], ' class="wrap"'  # длинным значениям разрешаем перенос
    for n, m in enumerate(models, 1):
        tds = "".join(f'<td{wrap_attr if len(m[k]) > 16 else ""}>{e(m[k]).replace(" + ", "<br>+ ")}</td>' for _, k, _ in cols)
        rows.append(f'<tr id="m{n}"><th scope="row" class="sticky">{e(m["name"])}</th>{tds}</tr>')
    return f'<div class="mt-wrap" tabindex="0" role="region" aria-label="Таблица моделей"><table class="mt"><thead>{thead}</thead><tbody>{"".join(rows)}</tbody></table></div>'


def code_card(s):
    segs = []
    for n, (txt, num) in enumerate(s["code"]):
        prev = s["code"][n - 1][0] if n else None
        if n and txt != "/" and prev != "/":
            segs.append('<span class="sep">-</span>')
        segs.append(f'<span class="sep">/</span>' if num is None else f'<span class="seg">{e(txt)}<sup>{num}</sup></span>')
    subs = {
        "volt": ", ".join(f"{k} — {v}" for k, v in C.VOLT_CODES),
        "cool": ", ".join(f"{k} — {v}" for k, v in C.COOL_CODES),
    }
    legend = []
    for num, text, sub in s["legend"]:
        extra = ""
        if sub == "climate":
            extra = '<ul class="climate">' + "".join(f"<li><b>{k}</b> {e(c)} — {e(d)}</li>" for k, c, d in C.CLIMATE) + "</ul>"
        elif sub:
            extra = f"<small>{e(subs[sub])}</small>"
        legend.append(f'<li><span class="num">{num}</span><div>{e(text)}{extra}</div></li>')
    ex, ex_text = s["example"]
    return f"""<aside class="code-card" aria-labelledby="code-title">
  <h2 id="code-title">Структура условного обозначения</h2>
  <p class="code-line">{''.join(segs)}</p>
  <ol class="legend">{''.join(legend)}</ol>
  <p class="code-ex">Пример: <b>{e(ex)}</b> — {e(ex_text)}.</p>
</aside>"""


def other_series(current):
    items = "".join(f'<li><a class="mini-card" href="{s["page"]}">{ph(s["img"], s["title"])}<span>{e(s["title"])}</span></a></li>'
                    for s in C.SNE_SERIES if s["page"] != current)
    return f"""<section class="section tight"><div class="wrap">
  <div class="row-head"><h2>Другие серии</h2>{arrow_link("Весь каталог", "sne.html")}</div>
  <ul class="mini-cards">{items}</ul>
</div></section>
"""


def sne_series(s):
    num, cap = s["stat"]
    extra = f'<div class="p-stats">{bavr_wave() if s["cat"] == "bavr" else ""}<div class="stat"><b>{e(num)}</b><span>{e(cap)}</span></div></div>'
    actions = (f'<a class="btn btn-primary" href="#request" data-topic="{e(s["title"])}">Получить ТКП</a>'
               f'<a class="btn btn-ghost-light" href="docs/katalog-sne.pdf" download>{icon("doc")}Скачать каталог</a>')
    adv = ""
    if s["adv"]:
        adv = ('<section class="section tight band"><div class="wrap"><div class="row-head"><h2>Преимущества</h2></div><ul class="adv-list">'
               + "".join(f"<li><b>{e(t)}</b><span>{e(d)}</span></li>" for t, d in s["adv"]) + "</ul></div></section>\n")
    text = "".join(f"<p>{e(x)}</p>" for x in s["text"])
    text_html = f'<div class="prose spec-note">{text}</div>' if text else ""
    body = product_hero([("sne.html", "Системы накопления"), (None, s["title"])], s["title"], s["accent"], s["lead"],
                        s["img"], actions, extra, tag=s["models"][0]["name"].split("-")[0]) + f"""
<section class="section spec-section"><div class="wrap">
  <div class="spec-grid">
    <div class="spec-main">
      <h2 class="h2">Технические характеристики</h2>
      {sne_table(s["cols"], s["models"])}
      {text_html}
    </div>
    {code_card(s)}
  </div>
</div></section>
{adv}{other_series(s["page"])}"""
    page(s["page"], f'{s["title"]} — Терра Электро', s["lead"], body, current=s["page"],
         request_title="Запросить технико-коммерческое предложение")


def motors():
    cards = "".join(f'<li><a class="m-card" href="dvigatel-{slug}.html">{ph(img, name)}<h3>{e(name)}</h3>'
                    f'<span class="round">{icon("arrow")}</span></a></li>' for slug, name, img, _, _ in C.MOTORS)
    sol = [("Подбор аналогов", "Найдём замену снятому с производства или импортному двигателю с теми же присоединительными размерами."),
           ("Индивидуальные решения", "Подберём исполнение под ваш режим работы, среду и способ монтажа."),
           ("Техническое сопровождение", "Консультируем при подборе, монтаже и пусконаладке.")]
    sol_html = "".join(f'<li><div><b>{e(t)}</b><span>{e(s)}</span></div></li>' for t, s in sol)
    body = page_head([("catalog.html", "Каталог"), (None, "Электродвигатели")], "Промышленные электродвигатели",
                     "Подбор, поставка и техническое сопровождение") + f"""
<section class="section tight"><div class="wrap">
  <div class="prose">
    <p>Широкий выбор электродвигателей для разных промышленных задач и условий эксплуатации: насосы, вентиляторы, компрессоры, конвейеры, краны, станки, дробилки, мешалки, сушилки, упаковочные и технологические линии.</p>
    <p>Работаем с предприятиями нефтегазовой и нефтехимической отрасли, угольной и горнодобывающей промышленности, металлургии, энергетики и цементного производства.</p>
  </div>
</div></section>
<section class="section band"><div class="wrap">
  <ul class="m-grid">{cards}</ul>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Наши решения — ваш результат</h2></div>
  <ul class="adv text">{sol_html}</ul>
</div></section>
"""
    page("elektrodvigateli.html", "Электродвигатели — Терра Электро",
         "Асинхронные, синхронные, взрывозащищённые, высоковольтные и двигатели постоянного тока.",
         body, request_title="Нужен подбор электродвигателя?")
    for m in C.MOTORS:
        motor_page(*m)


def motor_page(slug, name, img, text, specs):
    power = dict(specs).get("Мощность", "")
    actions = (f'<a class="btn btn-primary" href="#request" data-topic="{e(name)}">Запросить цену</a>'
               f'<a class="btn btn-ghost-light" href="elektrodvigateli.html">Все электродвигатели</a>')
    rows = "".join(f'<tr><th scope="row">{e(k)}</th><td>{e(v)}</td></tr>' for k, v in specs)
    others = "".join(f'<li><a href="dvigatel-{s}.html">{e(n)}</a></li>' for s, n, _, _, _ in C.MOTORS if s != slug)
    body = product_hero([("catalog.html", "Каталог"), ("elektrodvigateli.html", "Электродвигатели"), (None, name)],
                        name, f"Мощность {power}" if power else "", text, img, actions) + f"""
<section class="section spec-section"><div class="wrap">
  <div class="spec-grid">
    <div class="spec-main">
      <h2 class="h2">Технические характеристики</h2>
      <div class="mt-wrap"><table class="mt mt-pairs"><tbody>{rows}</tbody></table></div>
      <p class="spec-note">Точные параметры конкретной модели уточним при подборе: пришлите данные с шильдика или техзадание.</p>
    </div>
    <aside class="code-card" aria-labelledby="others-title">
      <h2 id="others-title">Другие типы двигателей</h2>
      <ul class="others">{others}</ul>
    </aside>
  </div>
</div></section>
"""
    page(f"dvigatel-{slug}.html", f"{name} — Терра Электро", text, body, current="elektrodvigateli.html",
         request_title="Запросить подбор и цену")


def brands():
    body = page_head([("catalog.html", "Каталог"), (None, "Производители")], "Производители",
                     "Более десяти лет работаем с европейскими и мировыми производителями: широкий выбор поставщиков, быстрые и точные поставки, техническая поддержка.") + f"""
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Основные производители</h2></div>
  {brand_logos(link=False)}
</div></section>
<section class="section band"><div class="wrap">
  <div class="section-head"><h2>Другие бренды</h2><p>{e(C.BRANDS_MORE)}.</p></div>
</div></section>
"""
    page("brands.html", "Производители — Терра Электро", "Siemens, ABB, Schneider Electric, Danfoss и другие производители.", body)


def sgp():
    body = page_head([("catalog.html", "Каталог"), (None, "Системы гарантированного питания")], "Системы гарантированного питания",
                     "ИБП, аккумуляторные батареи и выпрямители ведущих производителей.") + f"""
<section class="section"><div class="wrap">
  <div class="feature">{ph("cat-sgp.png", "Системы гарантированного питания")}
    <div><h3>Каталог раздела оформляется</h3>
      <p>Пока карточки товаров готовятся, пришлите запрос по почте или телефону: подберём оборудование и пришлём техническую информацию.</p>
      <p style="margin-top:12px"><b>Производители:</b> Weidmüller, ESE GmbH, GAPTEC, Vicor, Delta Electronics.</p>
      <a class="more" href="#request">Отправить запрос</a></div></div>
</div></section>
"""
    page("sgp.html", "Системы гарантированного питания — Терра Электро", "ИБП, аккумуляторы, выпрямители.", body,
         request_title="Есть вопросы по продукции?")


def proizvodstvo():
    nvo = ["ШСА, ЩПТ, ШУЭС, ЩУЭС, ШВС", "Распределительные шкафы серии ПР 85 ТЭ", "АВР",
           "Ящики управления асинхронными двигателями с короткозамкнутым ротором", "ЩСУ", "Коробки клеммные типа КК", "МЩУ"]
    body = page_head([(None, "Производство")], "Производство электротехнической продукции",
                     "Собственный участок сборки щитового оборудования: шкафы и щиты автоматики, щиты управления инженерными установками.") + f"""
<section class="section"><div class="wrap">
  <div class="feature">{ph("prod-ktp-big.png", "КТП")}<div><h3>Комплектные трансформаторные подстанции</h3>
    <p>Одно- и двухтрансформаторные подстанции КТПП и подстанции с аварийным вводом 2КТПА-ТЭ.</p>
    <a class="more" href="podstantsii.html">Подробнее о подстанциях</a></div></div>
  <div class="feature">{ph("prod-nvo-big.png", "Низковольтное оборудование")}<div><h3>Низковольтное оборудование общепромышленного назначения</h3>
    <ul>{''.join(f'<li>{e(x)}</li>' for x in nvo)}</ul>
    <a class="more" href="nizkovoltnoye.html">Весь перечень</a></div></div>
  <div class="feature" id="bmz">{ph("prod-bmz-big.png", "БМЗ")}<div><h3>Электротехническое оборудование в зданиях</h3>
    <p>Поставляем электрооборудование для блочно-модульных зданий (БМЗ) высокой заводской готовности.</p></div></div>
  <div class="feature" id="metall">{ph("prod-metall-big.png", "Металлоконструкции")}<div><h3>Производство металлоконструкций</h3>
    <p>Защитные кожухи для силовых трансформаторов, корпуса щитов и пультов управления, нетиповые корпуса и конструкции. Работаем по своим чертежам и по чертежам заказчика.</p></div></div>
</div></section>
"""
    page("proizvodstvo.html", "Производство — Терра Электро", "КТП, низковольтное оборудование, БМЗ, металлоконструкции.", body)


def podstantsii():
    body = page_head([("proizvodstvo.html", "Производство"), (None, "Комплектные трансформаторные подстанции")],
                     "Комплектные трансформаторные подстанции",
                     "Одно- и двухтрансформаторные подстанции для промышленных предприятий.") + f"""
<section class="section"><div class="wrap">
  <div class="feature">{ph("ktp-1.png", "Подстанция КТПП")}<div><h3>Подстанции типа КТПП</h3>
    <p>Для электроснабжения промышленных предприятий. По желанию заказчика размещаются в блочно-модульном здании для установки на открытой площадке; здание соответствует ГОСТ 22853 и техническому заданию.</p>
    <a class="more" href="ktpp.html">Характеристики КТПП</a></div></div>
  <div class="feature">{ph("ktp-2.png", "Подстанция 2КТПА-ТЭ")}<div><h3>Подстанции с аварийным вводом типа 2КТПА-ТЭ</h3>
    <p>Для предприятий, где перерыв в электроснабжении опасен для людей, грозит серьёзным экономическим или экологическим ущербом либо нарушает сложные технологические процессы.</p>
    <a class="more" href="#request">Запросить информацию</a></div></div>
</div></section>
"""
    page("podstantsii.html", "Трансформаторные подстанции — Терра Электро", "КТПП и 2КТПА-ТЭ собственного производства.", body)


def ktpp():
    spec = "".join(f"<tr><th scope=\"row\">{e(k)}</th><td>{e(v)}</td></tr>" for k, v in C.KTPP_SPECS)
    size = "".join(f"<tr><th scope=\"row\">{e(k)}</th><td>{e(v)}</td></tr>" for k, v in C.KTPP_SIZES)
    body = page_head([("proizvodstvo.html", "Производство"), ("podstantsii.html", "Подстанции"), (None, "КТПП")],
                     "Одно- и двухтрансформаторные подстанции КТПП",
                     "Электроснабжение промышленных предприятий. Возможна поставка в блочно-модульном здании по ГОСТ 22853.") + f"""
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Состав</h2></div>
  <div class="prose"><ul>
    <li>Шкафы: габариты зависят от мощности и комплектации (отечественной или импортной).</li>
    <li>Защитная автоматика на электронных и электромеханических реле для вводных и секционного выключателей, защита от однофазных замыканий.</li>
    <li>АВР в двухтрансформаторных подстанциях на электронных и электромагнитных реле, по требованию с выводом сигналов в телемеханику.</li>
    <li>Учёт активной и реактивной энергии индукционными или электронными счётчиками.</li>
  </ul></div>
</div></section>
<section class="section band"><div class="wrap">
  <div class="section-head"><h2>Технические характеристики</h2></div>
  <div class="table-wrap"><table class="spec-table"><tbody>{spec}</tbody></table></div>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Габариты шкафов, Ш × Г × В, мм</h2></div>
  <div class="table-wrap"><table class="spec-table"><tbody>{size}</tbody></table></div>
</div></section>
"""
    page("ktpp.html", "КТПП — Терра Электро", "Технические характеристики подстанций КТПП 250–2500 кВА, 6/10 кВ.", body)


def nizkovoltnoye():
    cards = "".join(f'<li><article class="product text-only"><h3>{e(n)}</h3><p style="color:var(--muted)">{e(t)}</p>'
                    f'<div class="product-foot"><span class="price">Под проект</span>'
                    f'<a class="btn btn-primary btn-small" href="#request" data-topic="{e(n)}">Запросить</a></div></article></li>'
                    for n, t in C.LOW_VOLTAGE)
    body = page_head([("proizvodstvo.html", "Производство"), (None, "Низковольтное оборудование")],
                     "Низковольтное оборудование общепромышленного назначения",
                     "Собираем шкафы силовые и автоматики (ШСА), щиты постоянного тока (ЩПТ) и другое оборудование. Более 10 лет поставляем его предприятиям России и СНГ.") + f"""
<section class="section"><div class="wrap">
  <ul class="products">{cards}</ul>
</div></section>
"""
    page("nizkovoltnoye.html", "Низковольтное оборудование — Терра Электро", "ШУЭС, ШВС, ПР 85 ТЭ, АВР, Я 5000-ТЭ, ЩСУ, КК, МЩУ.", body)


def inzhiniring():
    st = "".join(f"<li><b>{e(t)}</b><span>{e(s)}</span></li>" for t, s in C.ENG_STAGES)
    body = page_head([(None, "Инжиниринг")], "Инжиниринг в области АСУ ТП и распределения электроэнергии",
                     "Инженерные решения для промышленной энергетики, энергосбережения, автоматизации производства и теплотехники.") + f"""
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Этапы работ</h2><p>Ведём проект целиком или подключаемся на нужном этапе.</p></div>
  <ol class="stages">{st}</ol>
</div></section>
<section class="section band"><div class="wrap">
  <div class="feature">{ph("eng-2.png", "Проектные работы")}<div><h3>Обучение персонала</h3>
    <p>После запуска обучаем сотрудников заказчика эксплуатации оборудования и остаёмся на связи: гарантийное и сервисное обслуживание, техподдержка, консультации.</p></div></div>
</div></section>
"""
    page("inzhiniring.html", "Инжиниринг — Терра Электро", "Предпроектные работы, проектирование, поставка, СМР, ПНР, сервис.", body,
         request_title="Как заказать услуги")


def news():
    body = page_head([(None, "Новости")], "Новости компании") + f"""
<section class="section"><div class="wrap">{news_cards(C.NEWS)}</div></section>
"""
    page("news.html", "Новости — Терра Электро", "Новости и выполненные проекты компании Терра Электро.", body, request=False)


def company():
    comp = [("Более 50 мировых брендов", "От клемм и предохранителей до трансформаторов."),
            ("Собственное производство", "Изготовление оборудования, СМР, ПНР и сдача объектов в эксплуатацию."),
            ("Быстрые и аккуратные поставки", "Комплектация под задачу клиента."),
            ("Гарантия и техподдержка", "Гарантийное и постгарантийное обслуживание, консультации.")]
    comp_html = "".join(f'<li><div><b>{e(t)}</b><span>{e(s)}</span></div></li>' for t, s in comp)
    faq = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in C.FAQ)
    body = page_head([(None, "О компании")], "Почему выбирают нашу компанию",
                     "Честность, порядочность и своевременное предоставление информации, товаров и услуг.") + f"""
<section class="section"><div class="wrap">
  <div class="feature">{ph("about-1.png", "Терра Электро")}<div class="prose">
    <h3>Торгово-инжиниринговая компания</h3>
    <p>«Терра Электро» поставляет электротехнические компоненты и инженерные решения для промышленных предприятий в энергетике, промышленной автоматизации и модернизации производств.</p>
    <p>Ведём полный цикл: от разработки и внедрения системных решений до сервисного обслуживания. На собственном участке собираем шкафы автоматики, щиты управления и силовые распределительные щиты (ВРУ, ГРЩ, АВР и другие) на оборудовании ведущих мировых производителей.</p>
    <p>Открыты в отношениях с партнёрами, поставщиками и сотрудниками. Вопрос о работе компании можно задать генеральному директору через форму ниже: обращения рассматриваем в течение суток.</p>
  </div></div>
</div></section>
<section class="section band"><div class="wrap">
  <div class="section-head"><h2>Конкурентные преимущества</h2></div>
  <ul class="adv text">{comp_html}</ul>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Основные заказчики</h2></div>
  {clients()}
</div></section>
<section class="section band"><div class="wrap">
  <div class="section-head"><h2>Вопросы и ответы</h2></div>
  <div class="faq">{faq}</div>
</div></section>
"""
    page("company.html", "О компании — Терра Электро", "Торгово-инжиниринговая компания: поставка, производство, инжиниринг.", body)


def contacts():
    body = page_head([(None, "Контакты")], "Контакты") + f"""
<section class="section"><div class="wrap">
  <div class="offices">
    <div class="office"><h3>Санкт-Петербург</h3><dl>
      <div><dt>Адрес</dt><dd>192236, {e(C.ADDRESS)}</dd></div>
      <div><dt>Телефоны</dt><dd><a href="tel:{C.PHONE_TEL}">{C.PHONE}</a><br><a href="tel:{C.PHONE2_TEL}">{C.PHONE2}</a></dd></div>
      <div><dt>E-mail</dt><dd><a href="mailto:{C.EMAIL}">{C.EMAIL}</a></dd></div>
      <div><dt>Время работы</dt><dd>Пн–Чт 9:00–17:00<br>Пт 9:00–16:00<br>Сб, Вс — выходной</dd></div>
    </dl></div>
    <div class="office"><h3>Новосибирск</h3><dl>
      <div><dt>Филиал</dt><dd>ООО «ЭР ПЛЮС»</dd></div>
      <div><dt>Адрес</dt><dd>630054, г. Новосибирск, Степная ул., д. 6, офис 6</dd></div>
      <div><dt>Телефон</dt><dd><a href="tel:+79965440596">+7 (996) 544-05-96</a></dd></div>
      <div><dt>E-mail</dt><dd><a href="mailto:Infosib@terra-electro.ru">Infosib@terra-electro.ru</a></dd></div>
    </dl></div>
  </div>
  <div class="map"><iframe title="Офис на карте" loading="lazy" src="https://yandex.ru/map-widget/v1/?um=constructor%3Ae8153478dc8f924baeeb3fe8c30e3af1babd9c91e17e5f943b637dcb7dfd5e49&amp;source=constructor"></iframe></div>
  <a class="map-link" href="https://yandex.ru/maps/?text=%D0%A1%D0%B0%D0%BD%D0%BA%D1%82-%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B1%D1%83%D1%80%D0%B3%2C%20%D0%A1%D0%BE%D1%84%D0%B8%D0%B9%D1%81%D0%BA%D0%B0%D1%8F%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%2C%206%D0%BA8" target="_blank" rel="noopener">Открыть в Яндекс Картах</a>
</div></section>
"""
    page("contacts.html", "Контакты — Терра Электро", "Офис в Санкт-Петербурге и филиал в Новосибирске.", body)


def landing():
    steps = [
        ("Двигатель в сборе", "Асинхронный двигатель с короткозамкнутым ротором — самая распространённая машина в промышленности. Подбираем двигатели по мощности, частоте вращения, монтажному исполнению и степени защиты."),
        ("Кожух и вентилятор", "Вентилятор сидит на валу и гонит воздух вдоль рёбер станины. Если двигатель долго работает на низких оборотах от преобразователя частоты, своего вентилятора не хватает. Тогда подбираем исполнение с независимой вентиляцией."),
        ("Подшипниковые щиты", "Щиты держат подшипники и центрируют ротор в статоре. При питании от ПЧ через подшипники могут течь паразитные токи, поэтому для таких приводов предлагаем изолированные подшипники."),
        ("Ротор и вал", "Ротор набран из листов электротехнической стали, в пазах залита алюминиевая «беличья клетка». Вал передаёт момент через шпонку; размеры выходного конца сверяем с вашей муфтой или шкивом."),
        ("Статор и обмотка", "Медная обмотка в пазах статора создаёт вращающееся магнитное поле. Класс изоляции определяет допустимый нагрев: с классом F двигатель с запасом переносит перегрузки и жаркие цеха."),
        ("Станина и клеммная коробка", "Станина с лапами (IM1081) или фланцем (IM3081). В клеммной коробке обмотки соединяют треугольником на 380 В или звездой на 660 В. IP55 подходит для пыльных и влажных помещений."),
    ]
    steps_html = "".join(f'<li class="step{" is-active" if i == 0 else ""}"><span class="step-no">{i+1} из 6</span><h3>{e(t)}</h3><p>{e(p)}</p></li>'
                         for i, (t, p) in enumerate(steps))
    body = f"""<section class="l-hero"><div class="wrap">
  <div class="l-hero-text">
    <h1>Электродвигатели, щиты и подстанции для промышленных предприятий</h1>
    <p class="lead">Поставляем оборудование ведущих производителей, собираем щиты на своём участке и налаживаем всё на объекте.</p>
    <div class="l-actions"><a class="btn btn-primary" href="index.html?site">Перейти на сайт</a><a class="btn btn-ghost" href="#request">Запросить подбор</a></div>
    <p class="l-facts"><span><b>Более 10 лет</b> в России и СНГ</span><span>Работаем по <b>44‑ФЗ, 223‑ФЗ, 275‑ФЗ</b></span></p>
  </div>
  <div class="l-visual">
    <div class="gl" data-motor="hero">
      <img class="gl-poster" src="assets/img/motor.png" alt="Асинхронный электродвигатель">
      <canvas aria-label="3D-модель асинхронного двигателя, её можно поворачивать"></canvas>
      <span class="drag-hint" aria-hidden="true">Потяните, чтобы повернуть</span>
    </div>
    <div class="plate-holder">
      <div class="plate" role="img" aria-label="Шильдик двигателя АИР132M4: 11 кВт, 1450 об/мин, 380/660 В, IP55">
        <span class="rivet"></span><span class="rivet"></span><span class="rivet"></span><span class="rivet"></span>
        <div class="plate-head">ДВИГАТЕЛЬ АСИНХРОННЫЙ 3~</div>
        <div class="plate-type">АИР132M4</div>
        <dl class="plate-grid">
          <div><dt>кВт</dt><dd>11</dd></div><div><dt>об/мин</dt><dd>1450</dd></div><div><dt>Гц</dt><dd>50</dd></div><div><dt>Схема</dt><dd>Δ/Y</dd></div>
          <div class="w2"><dt>В</dt><dd>380/660</dd></div><div class="w2"><dt>А</dt><dd>22,8/13,1</dd></div>
          <div><dt>КПД</dt><dd>87,5 %</dd></div><div><dt>cos φ</dt><dd>0,84</dd></div><div><dt>IP</dt><dd>55</dd></div><div><dt>Изол.</dt><dd>F</dd></div>
          <div class="w2"><dt>Исполнение</dt><dd>IM1081</dd></div><div><dt>Режим</dt><dd>S1</dd></div><div><dt>Масса</dt><dd>70 кг</dd></div>
        </dl>
      </div>
      <p class="plate-caption">Шильдик модели на экране. Пришлите <a href="#request">фото своего</a>, и мы подберём замену.</p>
    </div>
  </div>
</div></section>

<section class="section band" data-explode aria-labelledby="motor-title"><div class="wrap">
  <div class="section-head"><h2 id="motor-title">Что внутри двигателя</h2>
    <p>Прокрутите страницу, и двигатель разберётся по деталям. От каждой из них зависит, как он поведёт себя у вас на объекте, поэтому при подборе мы смотрим на все.</p></div>
  <div class="explode-grid">
    <div class="stage"><div class="stage-sticky">
      <div class="gl" data-motor="explode">
        <img class="gl-poster" src="assets/img/motor-exploded.png" alt="Двигатель в разобранном виде">
        <canvas aria-label="Двигатель в разобранном виде, детали расходятся при прокрутке"></canvas>
      </div>
      <div class="stage-meter" aria-hidden="true"><span class="on"></span><span></span><span></span><span></span><span></span><span></span></div>
    </div></div>
    <ol class="steps">{steps_html}</ol>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>Поставка, производство и наладка</h2></div>
  {directions()}
</div></section>

<section class="section tight band"><div class="wrap l-to-site">
  <h2>Каталог, производство, инжиниринг и контакты — на основном сайте</h2>
  <a class="btn btn-primary" href="index.html?site">Перейти на сайт</a>
</div></section>
"""
    page("landing.html", "Двигатель в 3D — Терра Электро", "Как устроен асинхронный электродвигатель: интерактивная 3D-модель.",
         body, current="landing.html", request_title="Расскажите, что нужно подобрать",
         scripts='<script src="assets/js/motor.js"></script>\n')


def main():
    # dist/ всегда собирается с нуля; всё, что не генерируется (картинки, постеры), лежит в static/
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(ROOT / "static", DIST, ignore=shutil.ignore_patterns(".gitkeep"))
    build_assets()
    write_fetch_script()
    for f in (home, sne_catalog, catalog, motors, brands, sgp, proizvodstvo, podstantsii, ktpp, nizkovoltnoye, inzhiniring, news, company, contacts, landing):
        f()
    for series in C.SNE_SERIES:
        sne_series(series)
    print("ok:", ", ".join(sorted(p.name for p in DIST.glob("*.html"))))


if __name__ == "__main__":
    main()
