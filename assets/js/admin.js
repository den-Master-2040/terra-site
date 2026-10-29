// Редактор новостей. Подгружается из site.js только после входа на /login (в localStorage отметка te-admin)
// и только на news.html и страницах новостей. Данные и сохранение — через server/admin/terra_admin.py.
// Сохранение коммитит data/news.json и фото в репозиторий; на сайте изменения появляются после сборки, через 1–2 минуты.
(function () {
  var API = '/api/admin/news';
  var section = document.querySelector('[data-news-admin]');
  var mode = section.getAttribute('data-news-admin');   // "list" на news.html, иначе слаг открытой новости
  var state = { news: [], version: null };
  var pending = {};   // новые фото: имя → base64, уходят на сервер со следующим сохранением
  var previews = {};  // новые фото: имя → blob:-адрес для показа, пока сайт не пересобран

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function src(name) { return previews[name] || 'img/' + name; }
  function api(method, body) {
    return fetch(method === 'POST' ? '/api/admin/logout' : API, {
      method: method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Terra-Admin': '1' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return { error: 'Админка не отвечает (' + r.status + ')' }; }).then(function (d) {
        if (r.status === 401) { forget(); throw new Error('Сессия закончилась, войдите снова.'); }
        if (!r.ok) throw new Error(d.error || ('Ошибка ' + r.status));
        return d;
      });
    });
  }
  function forget() { try { localStorage.removeItem('te-admin'); } catch (e) {} }

  /* ---- Панель редактора ---- */
  var msg = el('span', { class: 'adm-msg', role: 'status' });
  var bar = el('div', { class: 'adm-bar' }, [
    el('b', { text: 'Редактор новостей' }), msg,
    mode === 'list'
      ? el('button', { class: 'btn btn-primary', type: 'button', text: '+ Добавить новость', onclick: function () { edit(null); } })
      : el('span', {}, [
          el('button', { class: 'btn btn-primary', type: 'button', text: 'Изменить', onclick: function () { edit(find(mode)); } }), ' ',
          el('button', { class: 'btn btn-ghost', type: 'button', text: 'Удалить', onclick: function () { remove(find(mode)); } })
        ]),
    el('button', { class: 'adm-link', type: 'button', text: 'Выйти', onclick: function () {
      api('POST', {}).catch(function () {}).then(function () { forget(); location.reload(); });
    } })
  ]);
  section.querySelector('.wrap').prepend(bar);
  function say(text, bad) { msg.textContent = text; msg.classList.toggle('bad', !!bad); }

  function find(slug) { return state.news.filter(function (n) { return n.slug === slug; })[0]; }

  /* ---- Список новостей на news.html: рисуем из данных админки, чтобы правки были видны сразу ---- */
  function renderList() {
    if (mode !== 'list') return;
    var ul = section.querySelector('ul.news');
    ul.innerHTML = '';
    state.news.forEach(function (n) {
      ul.appendChild(el('li', { id: 'n-' + n.slug }, [
        el('a', { class: 'news-card', href: 'news-' + n.slug + '.html' }, [
          el('div', { class: 'ph cover' }, [el('img', { src: src(n.img), alt: n.title, loading: 'lazy' })]),
          el('time', { datetime: n.iso, text: n.date }), el('h3', { text: n.title }), el('p', { text: n.lead })
        ]),
        el('div', { class: 'adm-card-actions' }, [
          el('button', { class: 'btn btn-primary', type: 'button', text: 'Изменить', onclick: function () { edit(n); } }),
          el('button', { class: 'btn btn-ghost', type: 'button', text: 'Удалить', onclick: function () { remove(n); } })
        ])
      ]));
    });
  }

  function save(news, done) {
    var used = JSON.stringify(news), files = {};
    Object.keys(pending).forEach(function (k) { if (used.indexOf('"' + k + '"') >= 0) files[k] = pending[k]; });
    say('Сохраняем…');
    return api('PUT', { news: news, version: state.version, files: files }).then(function (d) {
      state.news = d.news; state.version = d.version;
      Object.keys(files).forEach(function (k) { delete pending[k]; });
      say('Сохранено. На сайте изменения появятся через 1–2 минуты.');
      renderList();
      if (done) done();
    }).catch(function (err) { say(err.message, true); throw err; });
  }

  function remove(n) {
    if (!n || !confirm('Удалить новость «' + n.title + '»?')) return;
    save(state.news.filter(function (x) { return x !== n; }), function () {
      if (mode !== 'list') location.href = 'news.html';
    }).catch(function () {});
  }

  /* ---- Фото: уменьшаем в браузере до 1600 px и JPEG, чтобы не раздувать репозиторий ---- */
  function addPhoto(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // прозрачный PNG — на белом
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          var name = 'news/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
          var fr = new FileReader();
          fr.onload = function () {
            pending[name] = fr.result.split(',')[1];
            previews[name] = URL.createObjectURL(blob);
            resolve(name);
          };
          fr.readAsDataURL(blob);
        }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не получилось открыть ' + file.name)); };
      img.src = url;
    });
  }
  function pickPhotos(multiple, cb) {
    var input = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: multiple });
    input.addEventListener('change', function () {
      Promise.all([].slice.call(input.files).map(addPhoto)).then(cb).catch(function (err) { alert(err.message); });
    });
    input.click();
  }

  /* ---- Ссылка: оборачивает выделенный текст в [текст](адрес) ---- */
  function insertLink(ta) {
    var a = ta.selectionStart, b = ta.selectionEnd, sel = ta.value.slice(a, b);
    var url = prompt('Адрес ссылки (https://…, mailto:… или tel:…)', 'https://');
    if (!url || url === 'https://') return;
    if (!/^(https?:\/\/|mailto:|tel:)/.test(url)) url = 'https://' + url;
    var text = sel || prompt('Текст ссылки', '') || url;
    ta.setRangeText('[' + text + '](' + url + ')', a, b, 'end');
    ta.focus();
  }

  var RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  function slugify(t) {
    return t.toLowerCase().split('').map(function (c) { return RU[c] != null ? RU[c] : c; }).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-') || 'novost';
  }
  function youtubeId(v) {
    var m = String(v).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,20})/) || String(v).trim().match(/^([\w-]{6,20})$/);
    return m ? m[1] : null;
  }

  /* ---- Окно редактирования ---- */
  var dlg = el('dialog', { class: 'adm-dlg', 'aria-label': 'Новость' });
  document.body.appendChild(dlg);

  function edit(orig) {
    var isNew = !orig;
    var n = orig ? JSON.parse(JSON.stringify(orig)) : {
      slug: '', iso: new Date().toISOString().slice(0, 10), title: '', lead: '', img: '', body: [['p', '']]
    };
    var slugTouched = !isNew;
    dlg.innerHTML = '';
    var f = {};
    var cover = el('div', { class: 'adm-cover' });
    function drawCover() {
      cover.innerHTML = '';
      if (n.img) cover.appendChild(el('img', { src: src(n.img), alt: '' }));
      cover.appendChild(el('button', { class: 'btn btn-ghost', type: 'button', text: n.img ? 'Заменить обложку' : 'Выбрать обложку',
        onclick: function () { pickPhotos(false, function (names) { n.img = names[0]; drawCover(); }); } }));
    }
    drawCover();

    var blocksBox = el('div', { class: 'adm-blocks' });
    function drawBlocks() {
      blocksBox.innerHTML = '';
      n.body.forEach(function (b, i) {
        var kind = b[0] === 'gallery' ? 'img' : b[0];
        var label = { p: 'Абзац', ul: 'Список', img: 'Фото', video: 'Видео YouTube' }[kind];
        var move = function (d) { var j = i + d; if (j < 0 || j >= n.body.length) return; n.body.splice(j, 0, n.body.splice(i, 1)[0]); drawBlocks(); };
        var head = el('div', { class: 'adm-block-head' }, [
          el('b', { text: label }),
          el('button', { type: 'button', title: 'Выше', 'aria-label': 'Выше', text: '↑', onclick: function () { move(-1); } }),
          el('button', { type: 'button', title: 'Ниже', 'aria-label': 'Ниже', text: '↓', onclick: function () { move(1); } }),
          el('button', { type: 'button', title: 'Убрать блок', 'aria-label': 'Убрать блок', text: '✕', onclick: function () { n.body.splice(i, 1); drawBlocks(); } })
        ]);
        var box = el('div', { class: 'adm-block' }, [head]);
        if (kind === 'p' || kind === 'ul') {
          var ta = el('textarea', { rows: kind === 'p' ? 5 : 4, placeholder: kind === 'ul' ? 'Каждый пункт с новой строки' : 'Текст абзаца' });
          ta.value = kind === 'ul' ? b[1].join('\n') : b[1];
          ta.addEventListener('input', function () {
            b[1] = kind === 'ul' ? ta.value.split('\n') : ta.value;
          });
          head.insertBefore(el('button', { type: 'button', class: 'adm-linkbtn', text: '🔗 Ссылка', title: 'Выделите текст и нажмите', onclick: function () {
            insertLink(ta); ta.dispatchEvent(new Event('input'));
          } }), head.children[1]);
          box.appendChild(ta);
        } else if (kind === 'img') {
          var files = b[0] === 'img' ? [b[1]] : b[1];
          var grid = el('div', { class: 'adm-photos' });
          files.forEach(function (name, k) {
            grid.appendChild(el('figure', {}, [el('img', { src: src(name), alt: '' }),
              el('button', { type: 'button', 'aria-label': 'Убрать фото', text: '✕', onclick: function () {
                files.splice(k, 1); n.body[i] = files.length ? ['gallery', files] : null;
                if (!files.length) n.body.splice(i, 1);
                drawBlocks();
              } })]));
          });
          grid.appendChild(el('button', { type: 'button', class: 'adm-add-photo', text: '+ фото', onclick: function () {
            pickPhotos(true, function (names) { n.body[i] = ['gallery', files.concat(names)]; drawBlocks(); });
          } }));
          box.appendChild(grid);
        } else if (kind === 'video') {
          var vi = el('input', { type: 'url', placeholder: 'Ссылка на ролик YouTube', value: b[1] ? 'https://www.youtube.com/watch?v=' + b[1] : '' });
          vi.addEventListener('input', function () { b[1] = youtubeId(vi.value) || ''; vi.setCustomValidity(b[1] || !vi.value ? '' : 'Не похоже на ссылку YouTube'); });
          box.appendChild(vi);
        }
        blocksBox.appendChild(box);
      });
    }
    drawBlocks();

    function field(label, input, hint) {
      return el('label', { class: 'adm-field' }, [el('span', { text: label }), input, hint ? el('small', { text: hint }) : null]);
    }
    f.title = el('input', { value: n.title, required: true });
    f.iso = el('input', { type: 'date', value: n.iso, required: true });
    f.slug = el('input', { value: n.slug, pattern: '[a-z0-9]+(-[a-z0-9]+)*', required: true, readonly: !isNew });
    f.lead = el('textarea', { rows: 3, required: true });
    f.lead.value = n.lead;
    f.title.addEventListener('input', function () { if (!slugTouched) f.slug.value = slugify(f.title.value); });
    f.slug.addEventListener('input', function () { slugTouched = true; });
    var err = el('p', { class: 'adm-err', role: 'alert' });

    var form = el('form', { class: 'adm-form', novalidate: true }, [
      el('div', { class: 'adm-dlg-head' }, [el('h2', { text: isNew ? 'Новая новость' : 'Изменить новость' }),
        el('button', { type: 'button', class: 'adm-x', 'aria-label': 'Закрыть', text: '✕', onclick: function () { dlg.close(); } })]),
      el('div', { class: 'adm-dlg-body' }, [
        field('Заголовок', f.title),
        el('div', { class: 'adm-row' }, [field('Дата', f.iso),
          field('Адрес страницы', f.slug, isNew ? 'news-…html, латиницей. После создания не меняется.' : 'Адрес уже опубликован и не меняется.')]),
        field('Краткое описание', f.lead, 'Показывается в карточке на странице «Новости».'),
        el('div', { class: 'adm-field' }, [el('span', { text: 'Обложка' }), cover]),
        el('div', { class: 'adm-field' }, [el('span', { text: 'Текст новости' }),
          el('small', { text: 'Ссылка в тексте выглядит так: [текст](https://адрес). Выделите слова и нажмите «Ссылка».' }), blocksBox,
          el('div', { class: 'adm-add' }, [
            el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Абзац', onclick: function () { n.body.push(['p', '']); drawBlocks(); } }),
            el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Список', onclick: function () { n.body.push(['ul', []]); drawBlocks(); } }),
            el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Фото', onclick: function () {
              pickPhotos(true, function (names) { n.body.push(['gallery', names]); drawBlocks(); });
            } }),
            el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Видео', onclick: function () { n.body.push(['video', '']); drawBlocks(); } })
          ])])
      ]),
      el('div', { class: 'adm-dlg-foot' }, [err,
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'Отмена', onclick: function () { dlg.close(); } }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Сохранить' })])
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      n.title = f.title.value.trim(); n.iso = f.iso.value; n.slug = f.slug.value.trim(); n.lead = f.lead.value.trim();
      var problem = !n.title ? 'Заполните заголовок.' : !n.iso ? 'Укажите дату.' : !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.slug) ? 'Адрес страницы — латиница, цифры и дефисы.' :
        isNew && find(n.slug) ? 'Адрес news-' + n.slug + '.html уже занят, поменяйте его.' : !n.lead ? 'Заполните краткое описание.' : !n.img ? 'Выберите обложку.' : '';
      if (!problem && n.body.some(function (b) { return b[0] === 'video' && !b[1]; })) problem = 'В блоке видео нет ссылки на YouTube.';
      if (problem) { err.textContent = problem; return; }
      // пустые абзацы и пункты не сохраняем
      n.body = n.body.filter(function (b) {
        if (b[0] === 'ul') b[1] = b[1].map(function (x) { return x.trim(); }).filter(Boolean);
        return b[0] === 'p' ? b[1].trim() : b[0] === 'ul' || b[0] === 'gallery' ? b[1].length : true;
      });
      var list = isNew ? [n].concat(state.news) : state.news.map(function (x) { return x === orig ? n : x; });
      err.textContent = '';
      save(list, function () { dlg.close(); }).catch(function (e2) { err.textContent = e2.message; });
    });
    dlg.appendChild(form);
    dlg.showModal();
    f.title.focus();
  }

  say('Загружаем…');
  api('GET').then(function (d) {
    state.news = d.news; state.version = d.version;
    say('');
    renderList();
    if (mode !== 'list' && !find(mode)) say('Этой новости уже нет в данных: её удалили, сайт скоро обновится.');
  }).catch(function (err) {
    bar.innerHTML = '';
    bar.appendChild(el('span', { text: err.message + ' ' }));
    bar.appendChild(el('a', { href: 'login.html', text: 'Войти' }));
  });
})();
