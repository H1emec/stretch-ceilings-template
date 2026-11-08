/* Панель дизайна.
   Меняет CSS-переменные из :root в index.html, настройки хранятся в localStorage браузера.
   Отключить панель для посетителей: <script>window.FC_EDITOR=false</script> перед подключением этого файла. */
(function () {
  'use strict';
  var KEY = 'fc-design-v1';
  var root = document.documentElement;

  /* ---------- шрифты (все с кириллицей) ---------- */
  var FONTS = [
    ['Manrope', 'sans', '', 1], ['Inter', 'sans', '400;500;600;700;800'], ['Montserrat', 'sans', '400;500;600;700;800'],
    ['Raleway', 'sans', '400;500;600;700;800'], ['Nunito', 'sans', '400;500;600;700;800'], ['Roboto', 'sans', '400;500;700'],
    ['Golos Text', 'sans', '400;500;600;700;800'], ['Onest', 'sans', '400;500;600;700;800'], ['Jost', 'sans', '400;500;600;700;800'],
    ['Rubik', 'sans', '400;500;600;700;800'], ['Open Sans', 'sans', '400;500;600;700;800'], ['PT Sans', 'sans', '400;700'],
    ['Comfortaa', 'sans', '400;500;600;700'], ['Unbounded', 'sans', '400;500;600;700;800'], ['Oswald', 'sans', '400;500;600;700'],
    ['Fraunces', 'serif', '', 1], ['Playfair Display', 'serif', '400;500;600;700;800'], ['Lora', 'serif', '400;500;600;700'],
    ['Cormorant Garamond', 'serif', '400;500;600;700'], ['PT Serif', 'serif', '400;700'], ['Merriweather', 'serif', '400;700'],
    ['Spectral', 'serif', '400;500;600;700;800']
  ];
  var loaded = { Manrope: 1, Fraunces: 1 };
  function fontByName(n) { for (var i = 0; i < FONTS.length; i++) if (FONTS[i][0] === n) return FONTS[i]; }
  function stack(n) {
    var f = fontByName(n);
    return f && f[1] === 'serif' ? '"' + n + '",Georgia,serif' : '"' + n + '",system-ui,-apple-system,"Segoe UI",sans-serif';
  }
  function nameOf(v) { var m = /^\s*"?([^",]+)"?/.exec(v || ''); return m ? m[1].trim() : ''; }
  function loadFont(n) {
    var f = fontByName(n);
    if (!f || loaded[n]) return;
    loaded[n] = 1;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + n.replace(/ /g, '+') + ':wght@' + f[2] + '&display=swap';
    document.head.appendChild(l);
  }

  /* ---------- сохранённые настройки ---------- */
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} }
  /* баланс белого: -100 (синий) … +100 (жёлтый) -> наклон каналов в SVG-фильтре */
  function syncWB() {
    var cs = getComputedStyle(root);
    ['hero', 'bg', 'photos'].forEach(function (n) {
      var f = document.getElementById('fc-wb-' + n); if (!f) return;
      var t = (parseFloat(cs.getPropertyValue('--wb-' + n)) || 0) / 100;
      var s = { R: 1 + 0.28 * t, G: 1 + 0.06 * t, B: 1 - 0.34 * t };
      ['R', 'G', 'B'].forEach(function (c) { f.querySelector('feFunc' + c).setAttribute('slope', s[c].toFixed(3)); });
    });
  }
  function apply(k, v) {
    root.style.setProperty(k, v);
    if (k === '--font' || k === '--display') loadFont(nameOf(v));
    if (k.indexOf('--wb-') === 0) syncWB();
  }
  Object.keys(saved).forEach(function (k) { apply(k, saved[k]); }); // сразу, чтобы не было «мигания»
  document.addEventListener('DOMContentLoaded', syncWB);

  if (window.FC_EDITOR === false) return;

  /* ---------- описание панели ---------- */
  // [переменная, подпись, тип, min, max, step, единица]
  var GROUPS = [
    ['Фон страницы', [
      ['--veil-a', 'Плотность светлой вуали (меньше — фон виднее)', 'range', 0, 1, 0.01, ''],
      ['--veil-1', 'Цвет вуали сверху', 'color'],
      ['--veil-2', 'Цвет вуали снизу', 'color'],
      ['--bg-bright', 'Яркость фонового фото', 'range', 0.3, 1.6, 0.01, ''],
      ['--bg-blur', 'Размытие фонового фото', 'range', 0, 50, 1, 'px'],
      ['--bg-sat', 'Насыщенность фонового фото', 'range', 0, 2.5, 0.01, '']
    ]],
    ['Главная фотография', [
      ['--hero-bright', 'Яркость', 'range', 0.2, 1.8, 0.01, ''],
      ['--hero-contrast', 'Контраст', 'range', 0.5, 1.6, 0.01, ''],
      ['--hero-sat', 'Насыщенность', 'range', 0, 2, 0.01, ''],
      ['--hero-shade', 'Затемнение к низу (под текстом)', 'range', 0, 1, 0.01, '']
    ]],
    ['Баланс белого (−100 синий … +100 жёлтый)', [
      ['--wb-hero', 'Главная фотография', 'range', -100, 100, 1, ''],
      ['--wb-bg', 'Фоновое фото', 'range', -100, 100, 1, ''],
      ['--wb-photos', 'Фото в «Работах» и «Установке»', 'range', -100, 100, 1, '']
    ]],
    ['Стекло: панели и карточки', [
      ['--gp-a', 'Непрозрачность стекла', 'range', 0, 1, 0.01, ''],
      ['--gp-blur', 'Мутность (размытие)', 'range', 0, 60, 1, 'px'],
      ['--gp-sat', 'Насыщенность за стеклом', 'range', 100, 250, 1, '%'],
      ['--gp-border', 'Яркость рамки', 'range', 0, 1, 0.01, ''],
      ['--gp-shadow', 'Сила тени', 'range', 0, 0.6, 0.01, ''],
      ['--gp-tint', 'Цвет стекла', 'color']
    ]],
    ['Стекло: шапка, плашки, иконки-кнопки', [
      ['--gc-a', 'Непрозрачность стекла', 'range', 0, 1, 0.01, ''],
      ['--gc-blur', 'Мутность (размытие)', 'range', 0, 60, 1, 'px'],
      ['--gc-sat', 'Насыщенность за стеклом', 'range', 100, 250, 1, '%'],
      ['--gc-border', 'Яркость рамки', 'range', 0, 1, 0.01, ''],
      ['--gc-tint', 'Цвет стекла', 'color']
    ]],
    ['Плашка с ценой (калькулятор)', [
      ['--res-1', 'Цвет плашки: начало градиента', 'color'],
      ['--res-2', 'Цвет плашки: конец градиента', 'color'],
      ['--res-a', 'Непрозрачность плашки', 'range', 0, 1, 0.01, ''],
      ['--res-blur', 'Мутность (размытие за плашкой)', 'range', 0, 50, 1, 'px'],
      ['--res-border', 'Яркость рамки', 'range', 0, 1, 0.01, ''],
      ['--res-shadow', 'Сила тени', 'range', 0, 0.6, 0.01, ''],
      ['--res-radius', 'Скругление углов', 'range', 0, 50, 1, 'px'],
      ['--res-pad', 'Внутренние отступы', 'range', 10, 50, 1, 'px'],
      ['--c-total', 'Цвет цены', 'color'],
      ['--k-total', 'Размер цены', 'range', 0.5, 1.7, 0.01, '×'],
      ['--c-res-text', 'Цвет подписей (расчёт, примечание)', 'color'],
      ['--c-res-b', 'Цвет сумм в строках расчёта', 'color']
    ]],
    ['Шрифты и размеры', [
      ['--display', 'Шрифт заголовков', 'font'],
      ['--font', 'Шрифт основного текста', 'font'],
      ['--k-base', 'Размер всего текста', 'range', 0.7, 1.5, 0.01, '×'],
      ['--k-h1', 'Размер главного заголовка', 'range', 0.4, 1.6, 0.01, '×'],
      ['--k-h2', 'Размер заголовков разделов', 'range', 0.5, 1.6, 0.01, '×'],
      ['--k-h3', 'Размер заголовков карточек', 'range', 0.6, 1.8, 0.01, '×']
    ]],
    ['Цвета: шапка', [
      ['--c-logo', 'Логотип (1 часть)', 'color'],
      ['--c-logo-em', 'Логотип (2 часть)', 'color'],
      ['--c-nav', 'Пункты меню', 'color'],
      ['--c-phone', 'Телефон / «Контакты» в шапке', 'color']
    ]],
    ['Цвета: главный экран', [
      ['--c-h1', 'Заголовок на главной', 'color'],
      ['--c-hero-p', 'Подзаголовок', 'color'],
      ['--c-chip', 'Текст на плашках (телефон)', 'color'],
      ['--c-btn', 'Текст на зелёных кнопках', 'color']
    ]],
    ['Цвета: тексты разделов', [
      ['--c-h2', 'Заголовки разделов', 'color'],
      ['--c-lead', 'Вводные абзацы под заголовками', 'color'],
      ['--c-h3', 'Заголовки карточек (виды, контакты, форма)', 'color'],
      ['--c-label', 'Названия и пункты (шаги, «Монтаж», адрес)', 'color'],
      ['--c-text', 'Описания и мелкий текст', 'color'],
      ['--c-big', 'Крупные цифры («1 день», «до 15 лет»)', 'color'],
      ['--c-cap', 'Подписи на фото и «Площадь»', 'color'],
      ['--c-ghost', 'Текст светлой кнопки («Больше работ…»)', 'color']
    ]],
    ['Иконки и кнопки', [
      ['--ic-hero', 'Цвет иконок на главном экране', 'color'],
      ['--ic-hero-size', 'Размер иконок на главном экране', 'range', 10, 40, 1, 'px'],
      ['--ic-contacts', 'Цвет иконок в контактах', 'color'],
      ['--ic-c-size', 'Размер иконок в контактах', 'range', 12, 48, 1, 'px'],
      ['--c-glyph', 'Цвет стрелок ‹ › и знаков + −', 'color'],
      ['--green', 'Цвет зелёных кнопок и акцентов', 'color']
    ]]
  ];

  /* ---------- стили панели ---------- */
  var css = [
    '#fc-ed-btn{position:fixed;left:16px;bottom:16px;z-index:10001;display:flex;align-items:center;gap:8px;height:44px;padding:0 18px;border-radius:999px;background:#241b14;color:#f6eee2;font:700 14px/1 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;border:1px solid rgba(255,255,255,.18)}',
    '#fc-ed-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}',
    '#fc-ed{position:fixed;top:0;right:0;bottom:0;z-index:10002;width:min(370px,100vw);background:#1d1611;color:#f1e8db;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-y:auto;box-shadow:-12px 0 40px rgba(0,0,0,.4);transform:translateX(105%);transition:transform .25s ease;padding:0 0 24px;overscroll-behavior:contain}',
    '#fc-ed.open{transform:none}',
    '#fc-ed *{box-sizing:border-box;font-family:inherit}',
    '#fc-ed .hd{position:sticky;top:0;z-index:2;background:#1d1611;padding:14px 16px 12px;border-bottom:1px solid rgba(255,255,255,.1)}',
    '#fc-ed .hd h2{all:unset;display:block;font:700 16px/1.2 system-ui,sans-serif;color:#fff;margin-bottom:10px;max-width:none}',
    '#fc-ed .bar{display:flex;flex-wrap:wrap;gap:6px}',
    '#fc-ed .bar button,#fc-ed .x{height:32px;padding:0 12px;border-radius:8px;background:#3a2d22;color:#f1e8db;font:600 12px/1 system-ui,sans-serif;cursor:pointer;border:0}',
    '#fc-ed .bar button:hover,#fc-ed .x:hover{background:#4d3b2d}',
    '#fc-ed .bar .danger{background:#5b2a22}',
    '#fc-ed .x{position:absolute;right:12px;top:12px;width:32px;padding:0;font-size:18px}',
    '#fc-ed details{border-bottom:1px solid rgba(255,255,255,.08)}',
    '#fc-ed summary{list-style:none;cursor:pointer;padding:13px 16px;font:700 13px/1.2 system-ui,sans-serif;color:#fff;display:flex;justify-content:space-between;align-items:center}',
    '#fc-ed summary::-webkit-details-marker{display:none}',
    '#fc-ed summary::after{content:"+";font-size:18px;color:#c9a26b}',
    '#fc-ed details[open] summary::after{content:"−"}',
    '#fc-ed .body{padding:2px 16px 14px;display:grid;gap:13px}',
    '#fc-ed .l{display:flex;align-items:center;gap:8px;margin-bottom:5px;color:#d9cdbb}',
    '#fc-ed .l span{flex:1}',
    '#fc-ed .l b{font-weight:700;color:#fff;font-variant-numeric:tabular-nums;font-size:12px}',
    '#fc-ed .rs{width:22px;height:22px;border-radius:6px;background:transparent;color:#c9a26b;font-size:14px;line-height:1;cursor:pointer;border:0;padding:0}',
    '#fc-ed .rs:hover{background:#3a2d22}',
    '#fc-ed input[type=range]{width:100%;height:20px;margin:0;accent-color:#d9a05b;background:none;padding:0;border:0}',
    '#fc-ed .cw{display:flex;align-items:center;gap:10px}',
    '#fc-ed input[type=color]{width:44px;height:30px;padding:0;border:1px solid rgba(255,255,255,.25);border-radius:7px;background:none;cursor:pointer}',
    '#fc-ed .cw code{font:12px ui-monospace,Consolas,monospace;color:#d9cdbb}',
    '#fc-ed select{width:100%;height:34px;border-radius:8px;background:#2c2118;color:#fff;border:1px solid rgba(255,255,255,.2);padding:0 8px;font-size:13px}',
    '#fc-ed .hint{padding:12px 16px 0;color:#a99a86;font-size:12px}',
    '#fc-toast{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:10003;background:#241b14;color:#fff;padding:10px 18px;border-radius:999px;font:600 13px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:none;opacity:0;transition:opacity .2s}',
    '#fc-toast.on{opacity:1}',
    '@media (max-width:600px){#fc-ed{top:auto;height:62vh;width:100vw;transform:translateY(105%);border-radius:18px 18px 0 0}#fc-ed.open{transform:none}#fc-ed-btn{bottom:12px;left:12px}}'
  ].join('\n');

  /* ---------- сборка интерфейса ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function toast(msg) {
    var t = document.getElementById('fc-toast');
    if (!t) { t = el('div', { id: 'fc-toast' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }
  function copy(text, ok) {
    function fallback() {
      var ta = el('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(ok); } catch (e) { window.prompt('Скопируйте вручную:', text); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(ok); }, fallback);
    else fallback();
  }

  function build() {
    var st = el('style'); st.textContent = css; document.head.appendChild(st);

    // значения по умолчанию = то, что написано в :root (читаем без сохранённых правок)
    var defs = {}, all = [];
    GROUPS.forEach(function (g) { g[1].forEach(function (c) { all.push(c[0]); }); });
    var keep = {};
    all.forEach(function (k) { keep[k] = root.style.getPropertyValue(k); root.style.removeProperty(k); });
    var cs = getComputedStyle(root);
    all.forEach(function (k) { defs[k] = cs.getPropertyValue(k).trim(); });
    all.forEach(function (k) { if (keep[k]) root.style.setProperty(k, keep[k]); });

    var refreshers = [];
    function cur(k) { return saved[k] != null ? saved[k] : defs[k]; }
    function set(k, v) {
      if (v === defs[k]) delete saved[k]; else saved[k] = v;
      apply(k, v); persist();
    }
    function reset(k) { delete saved[k]; root.style.removeProperty(k); persist(); syncWB(); }

    var panel = el('aside', { id: 'fc-ed', 'aria-label': 'Панель дизайна' });
    var hd = el('div', { class: 'hd' });
    hd.appendChild(el('h2', { text: 'Дизайн сайта' }));
    hd.appendChild(el('button', { class: 'x', type: 'button', 'aria-label': 'Закрыть панель', text: '×' }));
    var bar = el('div', { class: 'bar' });
    function bbtn(text, fn, cls) { var b = el('button', { type: 'button', text: text, class: cls || '' }); b.onclick = fn; bar.appendChild(b); }
    bbtn('Копировать настройки', function () { copy(JSON.stringify(saved, null, 2), 'Настройки скопированы'); });
    bbtn('Копировать как CSS', function () {
      copy(':root{\n' + Object.keys(saved).map(function (k) { return '  ' + k + ':' + saved[k] + ';'; }).join('\n') + '\n}', 'CSS скопирован');
    });
    bbtn('Вставить настройки', function () {
      var s = window.prompt('Вставьте настройки (JSON), которые вы копировали ранее:');
      if (!s) return;
      try {
        var o = JSON.parse(s);
        Object.keys(o).forEach(function (k) { if (all.indexOf(k) > -1) set(k, String(o[k])); });
        refreshers.forEach(function (r) { r(); }); toast('Настройки применены');
      } catch (e) { toast('Не получилось прочитать настройки'); }
    });
    bbtn('Сбросить всё', function () {
      if (!window.confirm('Вернуть дизайн к исходному?')) return;
      Object.keys(saved).forEach(function (k) { root.style.removeProperty(k); });
      saved = {}; persist(); syncWB(); refreshers.forEach(function (r) { r(); }); toast('Дизайн сброшен');
    }, 'danger');
    hd.appendChild(bar);
    panel.appendChild(hd);
    panel.appendChild(el('p', { class: 'hint', text: 'Изменения видны сразу и сохраняются в этом браузере. Кнопка ↺ у каждой настройки возвращает исходное значение.' }));

    GROUPS.forEach(function (g, gi) {
      var d = el('details'); if (gi === 0) d.setAttribute('open', '');
      d.appendChild(el('summary', { text: g[0] }));
      var body = el('div', { class: 'body' });
      g[1].forEach(function (c) {
        var k = c[0], type = c[2], input, out, row = el('div');
        var lab = el('div', { class: 'l' }, [el('span', { text: c[1] })]);
        out = el('b'); lab.appendChild(out);
        var rs = el('button', { class: 'rs', type: 'button', title: 'Вернуть исходное', 'aria-label': 'Сбросить: ' + c[1], text: '↺' });
        lab.appendChild(rs);
        row.appendChild(lab);

        if (type === 'range') {
          var unit = c[6];
          input = el('input', { type: 'range', min: c[3], max: c[4], step: c[5] });
          var show = function (v) { out.textContent = (Math.round(parseFloat(v) * 100) / 100) + (unit === '×' ? '×' : unit); };
          input.oninput = function () { show(input.value); set(k, input.value + (unit === '×' ? '' : unit)); };
          refreshers.push(function () { input.value = parseFloat(cur(k)); show(input.value); });
          row.appendChild(input);
        } else if (type === 'color') {
          input = el('input', { type: 'color' });
          var code = el('code');
          input.oninput = function () { code.textContent = input.value; set(k, input.value); };
          refreshers.push(function () { var v = cur(k); input.value = v; code.textContent = v; out.textContent = ''; });
          row.appendChild(el('div', { class: 'cw' }, [input, code]));
        } else {
          input = el('select');
          FONTS.forEach(function (f) { input.appendChild(el('option', { value: f[0], text: f[0] + (f[1] === 'serif' ? ' (с засечками)' : '') })); });
          input.onchange = function () { set(k, stack(input.value)); };
          refreshers.push(function () { input.value = nameOf(cur(k)); });
          row.appendChild(input);
        }
        rs.onclick = function () { reset(k); refreshers.forEach(function (r) { r(); }); };
        body.appendChild(row);
      });
      d.appendChild(body); panel.appendChild(d);
    });

    var btn = el('button', { id: 'fc-ed-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'fc-ed' });
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>Дизайн';
    function toggle(open) {
      panel.classList.toggle('open', open); btn.setAttribute('aria-expanded', open);
      try { sessionStorage.setItem('fc-ed-open', open ? '1' : ''); } catch (e) {}
    }
    btn.onclick = function () { toggle(!panel.classList.contains('open')); };
    hd.querySelector('.x').onclick = function () { toggle(false); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) toggle(false); });

    document.body.appendChild(panel); document.body.appendChild(btn);
    refreshers.forEach(function (r) { r(); });
    try { if (sessionStorage.getItem('fc-ed-open')) toggle(true); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
