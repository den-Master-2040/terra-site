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

  // Ссылки «Запросить» в карточках: подставляем тему в форму на этой же странице
  document.querySelectorAll('[data-topic]').forEach(function (a) {
    a.addEventListener('click', function () {
      var form = document.querySelector('form.form');
      var msg = form && form.querySelector('textarea');
      if (msg) msg.value = 'Запрос: ' + a.getAttribute('data-topic') + '\n';
    });
  });
})();
