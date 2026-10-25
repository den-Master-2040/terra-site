// Общий скрипт сайта: тема, мобильное меню, формы, заглушки картинок.
// Обычный скрипт без модулей — работает и с сервера, и с диска.
(function () {
  var root = document.documentElement;

  // Посетитель уже на сайте — главная больше не перекидывает на лендинг в этой сессии
  try { sessionStorage.setItem('te-visited', '1'); } catch (e) {}

  /* ---- Тема: светлая по умолчанию, выбор запоминается ---- */
  var toggle = document.querySelector('.theme-toggle');
  function syncToggle() {
    if (!toggle) return;
    var dark = root.getAttribute('data-theme') === 'dark';
    toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
    toggle.querySelector('.label').textContent = dark ? 'Светлая тема' : 'Тёмная тема';
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var dark = root.getAttribute('data-theme') !== 'dark';
      if (dark) root.setAttribute('data-theme', 'dark'); else root.setAttribute('data-theme', 'light');
      try { localStorage.setItem('te-theme', dark ? 'dark' : 'light'); } catch (e) {}
      syncToggle();
    });
    syncToggle();
  }

  /* ---- Мобильное меню ---- */
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      // панель меню начинается ровно под шапкой (над ней может быть видна верхняя строка)
      var hdr = document.querySelector('.site-header');
      if (hdr) nav.style.top = Math.max(0, hdr.getBoundingClientRect().bottom) + 'px';
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && nav.classList.contains('open')) {
        nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = '';
      }
    });
  }

  /* ---- Картинки, которых пока нет (до запуска fetch-images.sh) ---- */
  document.querySelectorAll('.ph img').forEach(function (img) {
    function miss() { img.classList.add('missing'); }
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener('error', miss);
  });

  /* ---- Форма заявки: тема из ссылки ?topic=..., проверка полей ---- */
  var params = new URLSearchParams(location.search);
  document.querySelectorAll('form.form').forEach(function (form) {
    var msg = form.querySelector('textarea');
    var topic = params.get('topic');
    if (topic && msg && !msg.value) msg.value = 'Запрос: ' + topic + '\n';
    var status = form.querySelector('.form-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name, phone = form.elements.phone, email = form.elements.email;
      var hasContact = (phone && phone.value.trim()) || (email && email.value.trim());
      if (!name.value.trim() || !hasContact) {
        status.textContent = 'Укажите ФИО и телефон или почту, чтобы мы могли ответить.';
        status.hidden = false;
        (!name.value.trim() ? name : (phone || email)).focus();
        return;
      }
      // TODO: отправка на сервер — POST /api/request (обработчик ещё не подключён)
      status.textContent = 'Заявка сформирована. Отправка заработает после подключения обработчика на сервере, а пока позвоните или напишите на info@terra-electro.ru.';
      status.hidden = false;
    });
  });

  /* ---- Каталог СНЭ: фильтр по группам, ?cat=air открывает сразу нужную группу ---- */
  var tabs = document.querySelectorAll('.seg-tabs [data-filter]');
  var cards = document.querySelectorAll('.p-grid > li[data-cat]');
  var empty = document.querySelector('.cat-empty');
  function applyFilter(key) {
    var shown = 0;
    tabs.forEach(function (t) {
      var f = t.getAttribute('data-filter');
      // snte (с главной) = оба вида шкафов, подсвечиваем обе вкладки
      var on = f === key || (key === 'snte' && (f === 'air' || f === 'liquid'));
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    cards.forEach(function (li) {
      var ok = key === 'all' || li.getAttribute('data-cat').split(' ').indexOf(key) >= 0;
      li.hidden = !ok;
      if (ok) shown++;
    });
    if (empty) empty.hidden = shown > 0;
  }
  if (tabs.length) {
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var key = t.getAttribute('data-filter');
        applyFilter(key);
        try { history.replaceState(null, '', key === 'all' ? location.pathname : '?cat=' + key); } catch (e) {}
      });
    });
    var start = params.get('cat');
    if (start) applyFilter(start);
  }

  /* ---- 3D-модели СНЭ и двигателей: окно с просмотрщиком, three.js скачивается при первом открытии ---- */
  var v3d = document.getElementById('v3d');
  if (v3d) {
    var byName = {};
    JSON.parse(document.getElementById('v3d-data').textContent).forEach(function (m) { byName[m.name] = m; });
    var part = function (k) { return v3d.querySelector('[data-v3d="' + k + '"]'); };
    var stage = v3d.querySelector('.v3d-stage'), loadMsg = v3d.querySelector('.v3d-load');
    var pick = part('model'), openBtn = part('open'), current = null, waiting = null;
    var viewer = function () { return window.Model3D; };
    var loadViewer = function (cb) {
      if (viewer()) return cb();
      if (waiting) return waiting.push(cb);
      waiting = [cb];
      var s = document.createElement('script');
      s.src = v3d.getAttribute('data-src');
      s.onload = function () { waiting.forEach(function (f) { f(); }); };
      s.onerror = function () { loadMsg.textContent = 'Не удалось загрузить модель. Проверьте подключение и попробуйте ещё раз.'; waiting = null; };
      document.head.appendChild(s);
    };
    // «Открыть двери» у СНЭ, «Разобрать» у двигателей
    var setOpen = function (on) {
      openBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      openBtn.textContent = current.act[on ? 1 : 0];
      if (viewer()) viewer().open(on);
    };
    var show = function (name) {
      var m = byName[name];
      if (!m) return;
      current = m;
      document.getElementById('v3d-title').textContent = name;
      pick.value = name;
      part('info').textContent = m.info;
      setOpen(false);
      loadViewer(function () {
        if (!viewer().show(stage, m)) loadMsg.textContent = 'Браузер не поддерживает 3D-графику (WebGL). Фото и характеристики есть на странице.';
      });
    };
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-3d]');
      if (!b) return;
      e.preventDefault();
      if (typeof v3d.showModal === 'function') v3d.showModal(); else v3d.setAttribute('open', '');
      document.body.style.overflow = 'hidden';
      show(b.getAttribute('data-3d'));
      if (viewer()) viewer().start();
    });
    pick.addEventListener('change', function () { show(pick.value); });
    openBtn.addEventListener('click', function () { setOpen(openBtn.getAttribute('aria-pressed') !== 'true'); });
    part('reset').addEventListener('click', function () { if (viewer()) viewer().reset(); });
    part('close').addEventListener('click', function () { if (v3d.close) v3d.close(); else v3d.removeAttribute('open'); });
    // клик по затемнению вокруг окна закрывает его
    v3d.addEventListener('click', function (e) { if (e.target === v3d && v3d.close) v3d.close(); });
    v3d.addEventListener('close', function () {
      document.body.style.overflow = '';
      if (viewer()) viewer().stop();
    });
  }

  // Ссылки «Запросить» в карточках: подставляем тему в форму на этой же странице
  document.querySelectorAll('[data-topic]').forEach(function (a) {
    a.addEventListener('click', function () {
      var form = document.querySelector('form.form');
      var msg = form && form.querySelector('textarea');
      if (msg) msg.value = 'Запрос: ' + a.getAttribute('data-topic') + '\n';
    });
  });
})();
