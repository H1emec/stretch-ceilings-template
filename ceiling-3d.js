/* =====================================================================
   Ceiling3D — интерактивная 3D-модель комнаты с натяжным потолком
   ---------------------------------------------------------------------
   Самостоятельный модуль: один файл, без картинок (все текстуры рисуются
   кодом). Нужен только Three.js r128 (глобальный THREE), например:
     <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
     <script src="ceiling-3d.js"></script>

   Использование:
     const room = Ceiling3D.mount(document.getElementById('box'), {
       width: 4, length: 5, finish: 'matt', spots: 4, chandeliers: 1,
       onChange: info => console.log(info.area, info.corners)
     });
     room.set({ width: 6 });  room.addCorner();  room.setView('above');

   Полное описание — в README.md.
   ===================================================================== */
(function (global) {
  'use strict';

  /* =================================================================
     1. НАСТРОЙКИ (всё, что можно подкрутить, собрано здесь)
     ================================================================= */
  const CONFIG = {
    /* размеры сцены (в «метрах» сцены) */
    H: 3.5,            // высота потолка в 3D (условная, для красивой подачи; реальная 2,7 м)
    SLAB: .08,         // толщина полотна потолка
    DECK: .1,          // толщина досок настила
    BASE: .16,         // толщина нижней ступени платформы
    FRAME_H: .13,      // высота деревянной рамы потолка
    FRAME_W: .09,      // ширина деревянной рамы
    PLATE_MARGIN: .9,  // насколько платформа шире комнаты
    MAX_EXTENT: 5.5,   // комната крупнее этого размера уменьшается целиком (высота не меняется)

    /* ограничения ввода */
    limits: { w: [1, 30], l: [1, 30], area: [2, 900], spots: [0, 30], chand: [0, 5] },
    MIN_EDGE: .1,      // минимальная длина стенки выреза, м
    MAX_NOTCHES: 4,    // до 4 вырезов = 12 углов

    /* рендер */
    exposure: 1.02,
    clearAlpha: 0,     // 0 = прозрачный фон: сцена лежит прямо на странице
    fov: 32,

    /* свет */
    hemi: { sky: 0xffffff, ground: 0xe3d2bd, intensity: .8 },
    sun:  { color: 0xfff3e2, intensity: .85, pos: [6, 10, 7] },
    fill: { color: 0xffe8cf, intensity: .4,  pos: [-7, 2, -6] },
    floorFade: .03,            // прозрачность пола, когда смотришь снизу (0 = невидим)

    /* дерево (процедурные текстуры) */
    wood: {
      plankTones: ['#5e3519', '#573016', '#653a1a', '#512e15', '#603719', '#58321a', '#683d1d', '#54301a'], // 8 досок (тёмные)
      grainTone: '#7a4a2a',     // рама и основание
      baseTint: 0xa88468,       // оттенок нижней ступени
      planksPerTile: 8,         // досок на 1 м
      texSize: 512,
      seed: 7                   // зерно генератора (меняет рисунок волокон)
    },

    /* цвета и материалы */
    colors: {
      ceiling: 0xf7f5f1, ceilingGlow: 0x2a2620,
      cable: 0x2b2f36, cap: 0xd8dadd,
      bulb: 0xffe3b0, rim: 0xd5d2cc, dark: 0x3a342e,
      zoneLine: 0xffe3bd, cut: 0x1f8a82,
      frameHot: 0x9a4a14,        // подсветка грани под курсором
      handleRing: 0xffffff, handle: 0x1f8a82
    },

    /* тип полотна */
    finishes: {
      // reflectivity — сила отражений; grain — видна ли тонкая фактура плёнки
      matt:  { roughness: 1,   clearcoat: 0,   clearcoatRoughness: 1,   env: .04, reflectivity: 0,   color: 0xf1eee8, grain: true },
      satin: { roughness: .34, clearcoat: .3,  clearcoatRoughness: .35, env: .9,  reflectivity: .35, color: 0xf6f3ee, grain: true },
      gloss: { roughness: .03, clearcoat: 1,   clearcoatRoughness: .02, env: 2.6, reflectivity: .9,  color: 0xffffff, grain: false }
    },

    /* камера: theta — поворот вокруг, phi — наклон (радианы) */
    views: {
      rest:  { theta: .78, phi: -.04 },
      below: { theta: .78, phi: -.42 },
      above: { theta: .78, phi: .8 }
    },
    phiRange: [-1.15, 1.25],
    zoomRange: [.45, 1.7],
    autoRotateSpeed: .0024,
    orbitSpeed: [.0065, .0055],       // чувствительность мыши (по x, по y)

    /* текст подсказки над гранью */
    labels: { m: 'м', cm: 'см', hint: 'Длина грани' }
  };

  /* =================================================================
     2. МАЛЕНЬКИЕ ПОМОЩНИКИ
     ================================================================= */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = n => Math.round(n * 100) / 100;
  const round1 = n => Math.round(n * 10) / 10;

  /* генератор псевдослучайных чисел, чтобы дерево каждый раз выглядело одинаково */
  function makeRng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

  /* стили подсказки добавляются один раз */
  function injectCss() {
    if (document.getElementById('c3d-css')) return;
    const st = document.createElement('style'); st.id = 'c3d-css';
    st.textContent =
      '.c3d-box{position:relative;overflow:hidden}' +
      '.c3d-box canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}' +
      '.c3d-tip{position:absolute;z-index:3;left:0;top:0;display:flex;align-items:center;gap:4px;padding:6px 14px;border-radius:999px;' +
      'font:700 15px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:#14282a;background:rgba(255,255,255,.78);' +
      'backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);border:1px solid rgba(255,255,255,.85);' +
      'box-shadow:0 14px 40px rgba(30,60,60,.16);transform:translate(-50%,-100%);white-space:nowrap}' +
      '.c3d-tip[hidden]{display:none}' +
      '.c3d-tip input{width:2.9ch;border:0;background:none;outline:none;text-align:right;font:inherit;color:inherit;' +
      'font-variant-numeric:tabular-nums;border-radius:8px;padding:2px}' +
      '.c3d-tip input:focus{background:#fff;box-shadow:0 0 0 2px #a9ebdb}' +
      '.c3d-tip span{color:#8aa09d;font-weight:600;font-size:13px;margin-right:4px}';
    document.head.appendChild(st);
  }

  /* =================================================================
     3. ПУБЛИЧНАЯ ФУНКЦИЯ: mount(контейнер, опции) → управление
     ================================================================= */
  function mount(container, opts) {
    opts = opts || {};
    const THREE = global.THREE;
    if (!THREE) throw new Error('Ceiling3D: подключите Three.js r128 до этого файла');
    injectCss();

    const C = CONFIG, LIM = C.limits;
    const H = C.H, SLAB = C.SLAB, DECK = C.DECK, BASE = C.BASE, FRAME_H = C.FRAME_H;

    /* ------------------------------------------------------------
       3.1 СОСТОЯНИЕ КОМНАТЫ
       Комната = прямоугольная рамка ширина x длина. В её углах можно
       «вырезать» прямоугольные выступы (каждый = +2 угла). Все углы 90°.
       Размеры выреза хранятся в МЕТРАХ: da — вдоль входящей стены,
       db — вдоль исходящей. Площадь считается по контуру.
       ------------------------------------------------------------ */
    const S = {
      w: opts.width || 4, l: opts.length || 5, area: 20,
      finish: opts.finish || 'matt',
      spots: opts.spots != null ? opts.spots : 4,
      chand: opts.chandeliers != null ? opts.chandeliers : 1,
      corners: 4, notches: [], pts: []
    };
    const RC = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];   // углы рамки в долях (u,v ∈ [-0,5; 0,5])
    const ORD = [1, 3, 0, 2];                                  // порядок, в котором углы получают вырез
    const DIRS = RC.map((P, i) => { const Q = RC[(i + 3) % 4], R = RC[(i + 1) % 4];
      return { din: [P[0] - Q[0], P[1] - Q[1]], dout: [R[0] - P[0], R[1] - P[1]] }; });
    const axisLen = v => Math.abs(v[0]) > .5 ? S.w : S.l;      // метры вдоль оси стены

    function buildPts() {
      const out = [];
      for (let ci = 0; ci < 4; ci++) {
        const P = RC[ci], nt = S.notches.find(n => n.ci === ci);
        if (!nt) { out.push({ u: P[0], v: P[1], e: false, c: ci, r: 'base' }); continue; }
        const { din, dout } = DIRS[ci], fa = nt.da / axisLen(din), fb = nt.db / axisLen(dout);
        const a = [P[0] - din[0] * fa, P[1] - din[1] * fa], b = [P[0] + dout[0] * fb, P[1] + dout[1] * fb];
        const m = [a[0] + dout[0] * fb, a[1] + dout[1] * fb];
        out.push({ u: a[0], v: a[1], e: true, c: ci, r: 'a' }, { u: m[0], v: m[1], e: true, c: ci, r: 'm' }, { u: b[0], v: b[1], e: true, c: ci, r: 'b' });
      }
      return out;
    }
    const polyN = (pts) => { pts = pts || S.pts; let A = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += a.u * b.v - b.u * a.v; }
      return Math.abs(A) / 2; };
    const orient = (p, q, r) => (q.u - p.u) * (r.v - p.v) - (q.v - p.v) * (r.u - p.u);
    function validPts(pts) {                                    // контур не пересекает сам себя
      const n = pts.length;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        const a = pts[i], b = pts[(i + 1) % n], c = pts[j], d = pts[(j + 1) % n];
        if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return false;
      }
      return true;
    }
    function notchesOk() {                                      // два выреза на одной стене не накладываются
      return S.notches.every(n => { const nx = S.notches.find(m => m.ci === (n.ci + 1) % 4);
        const L = axisLen(DIRS[n.ci].dout); return (n.db + (nx ? nx.da : 0)) <= .92 * L; });
    }
    function fixNotches() {                                     // вырез не больше половины стены
      S.notches.forEach(n => {
        n.da = r2(clamp(n.da, C.MIN_EDGE, .45 * axisLen(DIRS[n.ci].din)));
        n.db = r2(clamp(n.db, C.MIN_EDGE, .45 * axisLen(DIRS[n.ci].dout)));
      });
    }
    function syncArea() { S.pts = buildPts(); S.area = round1(polyN() * S.w * S.l); S.corners = S.pts.length; }

    /* ---- изменение формы ---- */
    function addCorner() {                                      // +2 угла: новый вырез
      if (S.notches.length >= C.MAX_NOTCHES) return false;
      const ci = ORD[S.notches.length], { din, dout } = DIRS[ci];
      S.notches.push({ ci, da: r2(Math.abs(din[0]) > .5 ? .30 * S.w : .34 * S.l), db: r2(Math.abs(dout[0]) > .5 ? .30 * S.w : .34 * S.l) });
      fixNotches(); syncArea(); changed(); return true;
    }
    function removeCorner() { if (!S.notches.length) return false; S.notches.pop(); syncArea(); changed(); return true; }

    /* перетаскивание точки выреза: средняя меняет оба размера, крайние скользят вдоль стены */
    function movePoint(i, nu, nv) {
      const p = S.pts[i]; if (!p || p.r === 'base') return false;
      const nt = S.notches.find(n => n.ci === p.c), P = RC[p.c], { din, dout } = DIRS[p.c];
      const dot = d => (nu - P[0]) * d[0] + (nv - P[1]) * d[1];
      const want = { da: p.r === 'b' ? nt.da : r2(clamp(-dot(din) * axisLen(din), C.MIN_EDGE, .9 * axisLen(din))),
                     db: p.r === 'a' ? nt.db : r2(clamp(dot(dout) * axisLen(dout), C.MIN_EDGE, .9 * axisLen(dout))) };
      const old = { da: nt.da, db: nt.db };
      for (const c of [want, { da: want.da, db: old.db }, { da: old.da, db: want.db }]) {   // если упёрлись — скользим
        nt.da = c.da; nt.db = c.db;
        const pts = buildPts();
        if (notchesOk() && validPts(pts) && polyN(pts) * S.w * S.l >= 1) { syncArea(); changed(); return true; }
      }
      nt.da = old.da; nt.db = old.db; return false;
    }

    /* длина грани контура и её изменение (подсказка над потолком) */
    function edgeLen(i) { const n = S.pts.length, p = S.pts[i], q = S.pts[(i + 1) % n];
      return Math.hypot((q.u - p.u) * S.w, (q.v - p.v) * S.l); }
    function setEdgeLen(i, L) {
      const n = S.pts.length, p = S.pts[i], q = S.pts[(i + 1) % n];
      const nt = c => S.notches.find(x => x.ci === c);
      const snap = { w: S.w, l: S.l, n: S.notches.map(x => Object.assign({}, x)) };
      L = Math.max(C.MIN_EDGE, r2(L));
      if (p.c === q.c && p.r === 'a' && q.r === 'm') nt(p.c).db = L;                 // стенка выреза
      else if (p.c === q.c && p.r === 'm' && q.r === 'b') nt(p.c).da = L;            // стенка выреза
      else {                                                                        // стена комнаты → меняется ширина/длина
        const full = L + (p.r === 'b' ? nt(p.c).db : 0) + (q.r === 'a' ? nt(q.c).da : 0);
        if (Math.abs(DIRS[p.c].dout[0]) > .5) S.w = r2(clamp(full, LIM.w[0], LIM.w[1])); else S.l = r2(clamp(full, LIM.l[0], LIM.l[1]));
      }
      fixNotches();
      if (!notchesOk() || !validPts(buildPts()) || polyN(buildPts()) * S.w * S.l < 1) { S.w = snap.w; S.l = snap.l; S.notches = snap.n; return false; }
      syncArea(); changed(); return true;
    }

    /* ---- размеры ---- */
    function setWidth(v) { S.w = r2(clamp(v, LIM.w[0], LIM.w[1])); fixNotches(); syncArea(); changed(); }
    function setLength(v) { S.l = r2(clamp(v, LIM.l[0], LIM.l[1])); fixNotches(); syncArea(); changed(); }
    function setArea(v) {                                       // масштабирует всю комнату вместе с вырезами
      const cur = polyN() * S.w * S.l, f = Math.sqrt(clamp(v, LIM.area[0], LIM.area[1]) / cur);
      S.w = r2(clamp(S.w * f, LIM.w[0], LIM.w[1])); S.l = r2(clamp(S.l * f, LIM.l[0], LIM.l[1]));
      S.notches.forEach(n => { n.da = r2(n.da * f); n.db = r2(n.db * f); });
      fixNotches(); syncArea(); changed();
    }
    syncArea();

    /* информация для внешнего мира */
    function info() {
      return { width: S.w, length: S.l, area: S.area, corners: S.corners, extraCorners: Math.max(0, S.corners - 4),
        finish: S.finish, spots: S.spots, chandeliers: S.chand,
        notches: S.notches.map(n => Object.assign({}, n)), points: S.pts.map(p => ({ u: p.u, v: p.v })) };
    }
    let dirty = true;
    function changed() { dirty = true; if (typeof opts.onChange === 'function') opts.onChange(info()); }

    /* ------------------------------------------------------------
       3.2 РЕНДЕРЕР, СЦЕНА, СВЕТ
       ------------------------------------------------------------ */
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.classList.add('c3d-box');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '3D-модель комнаты. Вращайте мышью, тяните точки углов.');
    container.appendChild(canvas);

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch (e) { if (opts.onError) opts.onError(e); return null; }
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, C.clearAlpha);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = C.exposure;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(C.fov, 1, .1, 400);

    /* окружение для бликов глянцевого потолка (нарисовано на canvas) */
    (function () {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
      const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(.46, '#d9d9dc'); gr.addColorStop(.5, '#7a5a40'); gr.addColorStop(1, '#3d2a1b');   // верх — светлый, низ — тёмный деревянный пол
      g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#ffffff';
      [[30, 70, 90, 60], [190, 80, 70, 50], [330, 66, 110, 64], [450, 74, 50, 56]].forEach(r => g.fillRect(r[0], r[1], r[2], r[3]));   // окна
      g.fillRect(0, 20, 512, 18);
      g.fillStyle = '#fff1d8';                                    // полосы света внизу: именно они дают яркий блик на глянцевом потолке
      [[60, 150, 150, 14], [260, 176, 190, 12], [120, 206, 110, 10], [380, 150, 90, 14]].forEach(r => g.fillRect(r[0], r[1], r[2], r[3]));
      g.fillStyle = '#ffffff'; g.fillRect(230, 120, 30, 30);
      const tex = new THREE.CanvasTexture(cv);
      tex.mapping = THREE.EquirectangularReflectionMapping; tex.encoding = THREE.sRGBEncoding;
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(tex).texture; pm.dispose();
    })();
    scene.add(new THREE.HemisphereLight(C.hemi.sky, C.hemi.ground, C.hemi.intensity));
    const sun = new THREE.DirectionalLight(C.sun.color, C.sun.intensity); sun.position.set.apply(sun.position, C.sun.pos); scene.add(sun);
    const fillL = new THREE.DirectionalLight(C.fill.color, C.fill.intensity); fillL.position.set.apply(fillL.position, C.fill.pos); scene.add(fillL);

    /* ------------------------------------------------------------
       3.3 ТЕКСТУРЫ (процедурные — картинки не нужны)
       ------------------------------------------------------------ */
    const rnd = makeRng(C.wood.seed);
    function woodCanvas(planks) {                               // planks=true: настил из досок; false: ровное волокно
      const SZ = C.wood.texSize, c = document.createElement('canvas'); c.width = c.height = SZ;
      const g = c.getContext('2d'), n = planks ? C.wood.planksPerTile : 1, ph = SZ / n;
      const tones = planks ? C.wood.plankTones : [C.wood.grainTone];
      for (let i = 0; i < n; i++) {
        g.fillStyle = tones[i % tones.length]; g.fillRect(0, i * ph, SZ, ph);
        for (let k = 0; k < 26; k++) {                          // волокна: тёмные и светлые прожилки
          const y = i * ph + rnd() * ph, a = .05 + rnd() * .12;
          g.strokeStyle = rnd() > .5 ? 'rgba(70,35,12,' + a + ')' : 'rgba(240,190,130,' + a * .8 + ')';
          g.lineWidth = .6 + rnd() * 1.4;
          g.beginPath(); g.moveTo(0, y);
          g.bezierCurveTo(SZ * .3, y + (rnd() - .5) * 4, SZ * .65, y + (rnd() - .5) * 4, SZ, y + (rnd() - .5) * 3); g.stroke();
        }
        if (planks) {                                           // стыки досок
          g.fillStyle = 'rgba(40,18,6,.55)'; g.fillRect(0, i * ph, SZ, 1.6);
          const x = rnd() * SZ * .8 + SZ * .1; g.fillRect(x, i * ph, 1.6, ph);
        }
      }
      return c;
    }
    const mkTex = planks => { const t = new THREE.CanvasTexture(woodCanvas(planks));
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
    const plankTex = mkTex(true), grainTex = mkTex(false);

    function radial(color, stops) {                             // мягкое световое пятно
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, color.replace('A', stops[0])); gr.addColorStop(.45, color.replace('A', stops[1])); gr.addColorStop(1, color.replace('A', '0'));
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
    }
    /* box, у которого UV считаются в метрах, чтобы текстура не растягивалась */
    function woodBox(w, h, l) {
      const g = new THREE.BoxGeometry(w, h, l), uv = g.attributes.uv;
      const dims = [[l, h], [l, h], [w, l], [w, l], [w, h], [w, h]];          // px, nx, py, ny, pz, nz
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] * .9, uv.getY(i) * dims[f][1] * .9); }
      return g;
    }

    /* ------------------------------------------------------------
       3.4 МАТЕРИАЛЫ
       ------------------------------------------------------------ */
    const K = C.colors;
    const ceilMat = new THREE.MeshPhysicalMaterial({ color: K.ceiling, emissive: K.ceilingGlow, transparent: true, side: THREE.DoubleSide });
    /* тонкая фактура плёнки потолка (рисуется один раз, шум почти незаметный, но убирает «пластиковую» гладкость) */
    const ceilTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), im = g.createImageData(256, 256), r = makeRng(31);
      for (let i = 0; i < im.data.length; i += 4) { const v = 244 + Math.floor(r() * 11) - (r() > .985 ? 7 : 0); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      g.putImageData(im, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
    })();
    function applyFinish() { const f = C.finishes[S.finish] || C.finishes.matt;
      ceilMat.roughness = f.roughness; ceilMat.clearcoat = f.clearcoat; ceilMat.clearcoatRoughness = f.clearcoatRoughness; ceilMat.envMapIntensity = f.env;
      ceilMat.reflectivity = f.reflectivity; ceilMat.color.setHex(f.color); ceilMat.map = f.grain ? ceilTex : null; ceilMat.needsUpdate = true; }
    const deckMat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: .6, metalness: 0, transparent: true });
    const baseMat = new THREE.MeshStandardMaterial({ map: grainTex, color: C.wood.baseTint, roughness: .7, transparent: true });
    const frameMat = new THREE.MeshStandardMaterial({ map: grainTex, roughness: .55, transparent: true });
    const frameHot = new THREE.MeshStandardMaterial({ map: grainTex, roughness: .55, emissive: K.frameHot, emissiveIntensity: .55, transparent: true });
    const zoneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .1, depthWrite: false });
    const cutMat = new THREE.MeshBasicMaterial({ color: K.cut, transparent: true, opacity: .34, depthWrite: false });
    const zoneLine = new THREE.LineBasicMaterial({ color: K.zoneLine, transparent: true, opacity: .75 });
    const cableMat = new THREE.MeshStandardMaterial({ color: K.cable, roughness: .4, metalness: .5 });
    const capMat = new THREE.MeshStandardMaterial({ color: K.cap, metalness: .8, roughness: .25, transparent: true });
    const bulbMat = new THREE.MeshBasicMaterial({ color: K.bulb });
    const rimMat = new THREE.MeshStandardMaterial({ color: K.rim, metalness: .8, roughness: .25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: K.dark, roughness: .5, metalness: .4 });
    const poolMat = new THREE.MeshBasicMaterial({ map: radial('rgba(255,170,80,A)', ['.3', '.09']), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowMat = new THREE.MeshBasicMaterial({ map: radial('rgba(255,214,150,A)', ['.75', '.2']), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const shadowMat = new THREE.MeshBasicMaterial({ map: radial('rgba(40,28,18,A)', ['.42', '.16']), transparent: true, depthWrite: false });
    const hRing = new THREE.MeshBasicMaterial({ color: K.handleRing, transparent: true, depthTest: false, depthWrite: false });
    const hDot = new THREE.MeshBasicMaterial({ color: K.handle, transparent: true, depthTest: false, depthWrite: false });
    const hHit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });

    /* ------------------------------------------------------------
       3.5 РАСКЛАДКА СВЕТИЛЬНИКОВ (равномерно по контуру)
       ------------------------------------------------------------ */
    const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; };
    const edgeDist = (x, z, p) => { let m = 1e9; for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dz = b[1] - a[1];
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz); t = Math.max(0, Math.min(1, t));
      m = Math.min(m, Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz))); } return m; };
    const placeCache = {};
    function placements(p, w, l) {
      const key = p.map(v => v[0].toFixed(2) + ',' + v[1].toFixed(2)).join('|');
      if (placeCache[key]) return placeCache[key];
      const step = Math.max(.18, Math.max(w, l) / 38), margin = .4, cand = [];
      for (let x = -w / 2; x <= w / 2; x += step) for (let z = -l / 2; z <= l / 2; z += step) {
        if (!inPoly(x, z, p)) continue; const e = edgeDist(x, z, p); if (e >= margin) cand.push([x, z, e]);
      }
      const out = []; if (!cand.length) { placeCache[key] = out; return out; }
      let cx = 0, cz = 0; cand.forEach(c => { cx += c[0]; cz += c[1]; }); cx /= cand.length; cz /= cand.length;
      let first = cand[0], fd = 1e9; cand.forEach(c => { const d = Math.hypot(c[0] - cx, c[1] - cz); if (d < fd) { fd = d; first = c; } });
      out.push(first);
      const minD = cand.map(c => Math.hypot(c[0] - first[0], c[1] - first[1]));
      while (out.length < 36 && out.length < cand.length) {
        let bi = -1, bs = -1;
        for (let i = 0; i < cand.length; i++) { const s = Math.min(minD[i], cand[i][2] * 2.4); if (s > bs) { bs = s; bi = i; } }
        const c = cand[bi]; out.push(c);
        for (let i = 0; i < cand.length; i++) minD[i] = Math.min(minD[i], Math.hypot(cand[i][0] - c[0], cand[i][1] - c[1]));
      }
      placeCache[key] = out; if (Object.keys(placeCache).length > 60) delete placeCache[Object.keys(placeCache)[0]];
      return out;
    }

    /* ------------------------------------------------------------
       3.6 ПОСТРОЕНИЕ МОДЕЛИ (вызывается при каждом изменении)
       ------------------------------------------------------------ */
    const room = new THREE.Group(); scene.add(room);
    const plate = { w: 5, l: 6 }, view = { w: 4, l: 5, k: 1 }, hitMeshes = [], beamMeshes = [];
    let hot = -1, active = -1;
    function clearRoom() { for (let i = room.children.length - 1; i >= 0; i--) { const o = room.children[i]; room.remove(o); o.traverse(n => { if (n.geometry) n.geometry.dispose(); }); } }

    function build(w, l) {
      clearRoom();
      const k = Math.min(1, C.MAX_EXTENT / Math.max(w, l)), bw = w * k, bl = l * k;   // крупные комнаты уменьшаются целиком
      view.w = w; view.l = l; view.k = k;
      const pts = S.pts.map(p => [p.u * bw, p.v * bl]);
      plate.w = bw + C.PLATE_MARGIN; plate.l = bl + C.PLATE_MARGIN;
      const top = BASE + DECK;                                                      // верх деревянной платформы

      /* тень под платформой */
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat); sh.rotation.x = -Math.PI / 2;
      sh.scale.set(plate.w * 1.3, plate.l * 1.3, 1); sh.position.y = -.02; sh.renderOrder = -1; sh.name = 'shadow'; room.add(sh);

      /* платформа: нижняя ступень + настил */
      const base = new THREE.Mesh(woodBox(plate.w + .16, BASE, plate.l + .16), baseMat); base.position.y = BASE / 2; base.name = 'deck'; room.add(base);
      const deck = new THREE.Mesh(woodBox(plate.w, DECK, plate.l), deckMat); deck.position.y = BASE + DECK / 2; deck.name = 'deck'; room.add(deck);

      const mk = () => { const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])); s.closePath(); return s; };

      /* контур комнаты на полу + заливка вырезов */
      const zg = new THREE.ShapeGeometry(mk()); zg.rotateX(-Math.PI / 2);
      const zone = new THREE.Mesh(zg, zoneMat); zone.position.y = top + .004; zone.name = 'deck'; room.add(zone);
      const lp = []; pts.forEach(p => lp.push(new THREE.Vector3(p[0], top + .008, p[1]))); lp.push(lp[0].clone());
      const zl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(lp), zoneLine); zl.name = 'deck'; room.add(zl);
      S.notches.forEach(nt => {
        const g = []; S.pts.forEach((q, i) => { if (q.c === nt.ci) g.push(pts[i]); });
        if (g.length !== 3) return;
        const P = [RC[nt.ci][0] * bw, RC[nt.ci][1] * bl];
        const shp = new THREE.Shape(); [P, g[0], g[1], g[2]].forEach((q, j) => j ? shp.lineTo(q[0], -q[1]) : shp.moveTo(q[0], -q[1])); shp.closePath();
        const cg = new THREE.ShapeGeometry(shp); cg.rotateX(-Math.PI / 2);
        const cm = new THREE.Mesh(cg, cutMat); cm.position.y = top + .006; cm.name = 'deck'; room.add(cm);
      });

      /* ручки углов (тянутся мышью; уменьшаются у коротких стен) */
      hitMeshes.length = 0; beamMeshes.length = 0;
      pts.forEach((p, i) => {
        if (!S.pts[i].e) return;                                // обычные углы рамки не двигаются
        const pv = pts[(i + pts.length - 1) % pts.length], nx = pts[(i + 1) % pts.length];
        const dd = Math.min(Math.hypot(p[0] - pv[0], p[1] - pv[1]), Math.hypot(p[0] - nx[0], p[1] - nx[1])), hr = clamp(dd * .34, .05, .21);
        const g = new THREE.Group(); g.position.set(p[0], top + .03, p[1]);
        const ring = new THREE.Mesh(new THREE.CircleGeometry(hr, 28), hRing); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 20;
        const dot = new THREE.Mesh(new THREE.CircleGeometry(hr * .6, 24), hDot); dot.rotation.x = -Math.PI / 2; dot.position.y = .002; dot.renderOrder = 21;
        const hit = new THREE.Mesh(new THREE.CircleGeometry(clamp(dd * .5, .12, .42), 12), hHit); hit.rotation.x = -Math.PI / 2; hit.position.y = .004; hit.userData.idx = i;
        g.add(ring, dot, hit); room.add(g); hitMeshes.push(hit);
      });

      /* потолок */
      const cg = new THREE.ExtrudeGeometry(mk(), { depth: SLAB, bevelEnabled: false }); cg.rotateX(-Math.PI / 2);
      const ceil = new THREE.Mesh(cg, ceilMat); ceil.position.y = H - SLAB; ceil.name = 'ceil'; room.add(ceil);

      /* деревянная рама по периметру + тросы в углах */
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        const pr = new THREE.Mesh(woodBox(len + C.FRAME_W, FRAME_H, C.FRAME_W), i === hot ? frameHot : frameMat);
        pr.position.set((a[0] + b[0]) / 2, H - FRAME_H / 2 + .005, (a[1] + b[1]) / 2); pr.rotation.y = -Math.atan2(dz, dx); pr.name = 'ceil'; room.add(pr);
        const hb = new THREE.Mesh(new THREE.BoxGeometry(len + .1, .4, .4), hHit);          // невидимая зона наведения
        hb.position.copy(pr.position); hb.rotation.copy(pr.rotation); hb.userData.edge = i; room.add(hb); beamMeshes.push(hb);
        const cl = H - FRAME_H - top;
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, cl, 6), cableMat); cord.position.set(a[0], top + cl / 2, a[1]); room.add(cord);
        const c1 = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .07, 12), capMat); c1.position.set(a[0], H - FRAME_H - .03, a[1]); c1.name = 'ceil'; room.add(c1);
        const c2 = new THREE.Mesh(new THREE.CylinderGeometry(.04, .03, .06, 12), capMat); c2.position.set(a[0], top + .03, a[1]); c2.name = 'deck'; room.add(c2);
      }

      /* свет: люстры и точечные светильники */
      const pl = placements(pts, bw, bl), yC = H - SLAB;
      const nC = Math.min(S.chand, pl.length), nS = Math.min(S.spots, Math.max(0, pl.length - nC));
      const glow = (x, z, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), glowMat); m.rotation.x = Math.PI / 2; m.position.set(x, yC - .012, z); m.name = 'glow'; room.add(m); };
      const pool = (x, z, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), poolMat); m.rotation.x = -Math.PI / 2; m.position.set(x, top + .012, z); m.name = 'pool'; room.add(m); };
      for (let i = 0; i < nC; i++) {                              // минималистичная плоская люстра: тонкий диск вплотную к потолку
        const [x, z] = pl[i], g = new THREE.Group();
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .04, 48), rimMat); rim.position.y = -.02;
        const diff = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .012, 48), bulbMat); diff.position.y = -.044;
        g.add(rim, diff); g.position.set(x, yC, z); room.add(g); glow(x, z, 2.4); pool(x, z, 3.4);
      }
      for (let i = 0; i < nS; i++) {
        const [x, z] = pl[nC + i], g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .03, 28), rimMat); ring.position.y = yC - .014;
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .034, 28), bulbMat); lens.position.y = yC - .02;
        g.add(ring, lens); g.position.set(x, 0, z); room.add(g); glow(x, z, 1.5); pool(x, z, 2.2);
      }
    }

    /* ------------------------------------------------------------
       3.7 КАМЕРА И УПРАВЛЕНИЕ
       ------------------------------------------------------------ */
    const V = C.views;
    const cam = { theta: V.rest.theta, phi: V.rest.phi, zoom: 1, tTheta: V.rest.theta, tPhi: V.rest.phi, tZoom: 1 };
    const reduced = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let auto = opts.autoRotate !== false && !reduced, visible = true;
    const cur = { w: S.w, l: S.l };

    function size() { const r = container.getBoundingClientRect(); if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
    const ro = new ResizeObserver(size); ro.observe(container); size();

    const pointers = new Map(); let pinch = 0, drag = null, downAt = null, hideT = 0;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), HP = BASE + DECK + .03;
    const hPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HP);
    const setRay = e => { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)); ray.setFromCamera(ndc, camera); };
    const pickHandle = e => { setRay(e); const h = ray.intersectObjects(hitMeshes, false)[0]; return h ? h.object.userData.idx : -1; };
    const pickBeam = e => { setRay(e); const h = ray.intersectObjects(beamMeshes, false)[0]; return h ? h.object.userData.edge : -1; };
    const floorPoint = e => { setRay(e); const v = new THREE.Vector3(); return ray.ray.intersectPlane(hPlane, v) ? v : null; };

    /* подсказка с длиной грани (м + см), редактируемая */
    const tip = document.createElement('div'); tip.className = 'c3d-tip'; tip.hidden = true;
    tip.innerHTML = '<input inputmode="decimal" autocomplete="off" aria-label="' + C.labels.m + '"><span>' + C.labels.m +
      '</span><input inputmode="numeric" autocomplete="off" aria-label="' + C.labels.cm + '"><span>' + C.labels.cm + '</span>';
    container.appendChild(tip);
    const [eM, eC] = tip.querySelectorAll('input');
    const tipBusy = () => tip.matches(':hover') || tip.contains(document.activeElement);
    function fillTip(force) {
      if (active < 0 || active >= S.pts.length) return;
      if (!force && tip.contains(document.activeElement)) return;
      const L = edgeLen(active); let m = Math.floor(L + 1e-9), c = Math.round((L - m) * 100); if (c >= 100) { m++; c = 0; }
      eM.value = m; eC.value = c;
    }
    function showTip(i) { clearTimeout(hideT); if (i === active && !tip.hidden) return; active = i; hot = i; dirty = true; tip.hidden = false; fillTip(true); }
    function hideTip(force) {
      clearTimeout(hideT);
      hideT = setTimeout(() => { if (!force && tipBusy()) return;
        if (force && tip.contains(document.activeElement)) document.activeElement.blur();
        hot = -1; active = -1; dirty = true; tip.hidden = true; }, force ? 0 : 380);
    }
    tip.addEventListener('pointerenter', () => clearTimeout(hideT));
    tip.addEventListener('pointerleave', () => hideTip());
    const applyTip = () => { const m = parseFloat(String(eM.value).replace(',', '.')) || 0, c = parseFloat(String(eC.value).replace(',', '.')) || 0;
      const L = m + c / 100; if (L > 0 && active >= 0) setEdgeLen(active, L); };
    [eM, eC].forEach(el => {
      el.addEventListener('input', applyTip);
      el.addEventListener('focus', () => { clearTimeout(hideT); el.select(); });
      el.addEventListener('blur', () => { fillTip(true); hideTip(); });
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter') el.blur(); });
    });
    function placeTip() {
      if (tip.hidden || active < 0 || active >= S.pts.length) return;
      const n = S.pts.length, p = S.pts[active], q = S.pts[(active + 1) % n];
      const v = new THREE.Vector3((p.u + q.u) / 2 * view.w * view.k, H + .12, (p.v + q.v) / 2 * view.l * view.k).project(camera);
      const r = canvas.getBoundingClientRect(), tw = tip.offsetWidth / 2;
      tip.style.left = clamp((v.x + 1) / 2 * r.width, tw + 8, r.width - tw - 8) + 'px';
      tip.style.top = clamp((1 - v.y) / 2 * r.height - 8, tip.offsetHeight + 8, r.height - 8) + 'px';
      fillTip(false);
    }

    /* мышь / палец */
    const on = (t, ev, fn) => { t.addEventListener(ev, fn); return () => t.removeEventListener(ev, fn); };
    const offs = [];
    offs.push(on(canvas, 'pointerdown', e => {
      if (!pointers.size) {
        const idx = pickHandle(e), fp = idx >= 0 ? floorPoint(e) : null;
        if (idx >= 0 && fp) { const P = S.pts[idx];
          drag = { idx, du: P.u - fp.x / (view.w * view.k), dv: P.v - fp.z / (view.l * view.k) };
          canvas.setPointerCapture(e.pointerId); auto = false; canvas.style.cursor = 'grabbing'; return; }
      }
      canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); auto = false; downAt = { x: e.clientX, y: e.clientY };
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    }));
    offs.push(on(canvas, 'pointermove', e => {
      if (drag) { const fp = floorPoint(e); if (fp) movePoint(drag.idx, fp.x / (view.w * view.k) + drag.du, fp.z / (view.l * view.k) + drag.dv); return; }
      if (!pointers.size && e.pointerType === 'mouse') {
        if (pickHandle(e) >= 0) { canvas.style.cursor = 'pointer'; hideTip(); }
        else { const bi = pickBeam(e); canvas.style.cursor = bi >= 0 ? 'pointer' : ''; if (bi >= 0) showTip(bi); else if (!tip.hidden) hideTip(); }
      }
      const p = pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) { cam.tTheta -= dx * C.orbitSpeed[0]; cam.tPhi = clamp(cam.tPhi + dy * C.orbitSpeed[1], C.phiRange[0], C.phiRange[1]); }
      else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) cam.tZoom = clamp(cam.tZoom * pinch / d, C.zoomRange[0], C.zoomRange[1]); pinch = d; }
    }));
    const end = e => { if (drag) { drag = null; canvas.style.cursor = ''; } pointers.delete(e.pointerId); pinch = 0; };
    offs.push(on(canvas, 'pointerup', end), on(canvas, 'pointercancel', end), on(canvas, 'pointerleave', end), on(canvas, 'pointerleave', () => hideTip()));
    offs.push(on(canvas, 'click', e => {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      const bi = pickHandle(e) >= 0 ? -1 : pickBeam(e);
      if (bi >= 0) showTip(bi); else hideTip(true);
    }));

    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 }); io.observe(container);

    /* ------------------------------------------------------------
       3.8 ЦИКЛ ОТРИСОВКИ
       ------------------------------------------------------------ */
    const fade = (mats, target, k) => mats.forEach(m => { m.opacity += (target - m.opacity) * (k || .15); m.depthWrite = m.opacity > .95; });
    [deckMat, baseMat, ceilMat, frameMat, frameHot, capMat].forEach(m => { m.opacity = 1; });
    let lastKey = '', shadowK = 1, raf = 0, dead = false;

    function frame() {
      if (dead) return; raf = requestAnimationFrame(frame);
      if (!visible) return;
      const key = S.corners + '|' + S.spots + '|' + S.chand + '|' + S.finish;
      const need = Math.abs(cur.w - S.w) > .004 || Math.abs(cur.l - S.l) > .004;
      if (need) { cur.w += (S.w - cur.w) * .22; cur.l += (S.l - cur.l) * .22;
        if (Math.abs(cur.w - S.w) <= .004) cur.w = S.w; if (Math.abs(cur.l - S.l) <= .004) cur.l = S.l; }
      if (need || dirty || key !== lastKey) { applyFinish(); build(cur.w, cur.l); lastKey = key; dirty = false; }

      if (auto) cam.tTheta += C.autoRotateSpeed;
      cam.theta += (cam.tTheta - cam.theta) * .14; cam.phi += (cam.tPhi - cam.phi) * .14; cam.zoom += (cam.tZoom - cam.zoom) * .14;
      /* камера постоянна: потолок не «ездит» при смене площади */
      const hyp = Math.hypot(6.0, 6.4), fit = Math.max(3 + .95 * hyp, 1.75 * hyp / camera.aspect);
      const dist = fit * cam.zoom, ty = H / 2 + .1;
      camera.position.set(Math.sin(cam.theta) * Math.cos(cam.phi) * dist, ty + Math.sin(cam.phi) * dist, Math.cos(cam.theta) * Math.cos(cam.phi) * dist);
      camera.lookAt(0, ty, 0);

      /* снизу пол становится прозрачным, сверху — потолок; грань под курсором всегда непрозрачна */
      const below = camera.position.y < .12, above = camera.position.y > H + .1;
      fade([deckMat, baseMat], below ? C.floorFade : 1); fade([ceilMat, frameMat, capMat], above ? .16 : 1); frameHot.opacity = 1; frameHot.depthWrite = true;
      poolMat.opacity += ((below ? .05 : 1) - poolMat.opacity) * .15;
      glowMat.opacity += ((above ? .15 : 1) - glowMat.opacity) * .15;
      shadowK += ((below ? 0 : 1) - shadowK) * .15; shadowMat.opacity = shadowK;
      renderer.render(scene, camera); placeTip();
    }

    /* ------------------------------------------------------------
       3.9 ВНЕШНЕЕ УПРАВЛЕНИЕ
       ------------------------------------------------------------ */
    const api = {
      /* set({width,length,area,finish,spots,chandeliers}) — любые поля */
      set(o) {
        o = o || {};
        if (o.finish && C.finishes[o.finish]) S.finish = o.finish;
        if (o.spots != null) S.spots = clamp(Math.round(o.spots), LIM.spots[0], LIM.spots[1]);
        if (o.chandeliers != null) S.chand = clamp(Math.round(o.chandeliers), LIM.chand[0], LIM.chand[1]);
        if (o.width != null) setWidth(o.width);
        if (o.length != null) setLength(o.length);
        if (o.area != null) setArea(o.area);
        changed(); return info();
      },
      setWidth: v => (setWidth(v), info()), setLength: v => (setLength(v), info()), setArea: v => (setArea(v), info()),
      addCorner, removeCorner,                         // +2 / −2 угла (вырез)
      setEdgeLength: setEdgeLen,                       // (индекс грани, метры)
      setView(name) { const v = V[name] || V.rest; cam.tPhi = v.phi; if (name === 'rest') { cam.tTheta = v.theta; cam.tZoom = 1; auto = opts.autoRotate !== false && !reduced; } else auto = false; },
      showTop() { if (cam.tPhi < .45) cam.tPhi = V.above.phi; auto = false; },   // удобно для редактирования углов
      zoom(f) { cam.tZoom = clamp(cam.tZoom * f, C.zoomRange[0], C.zoomRange[1]); },
      getState: info,
      getViewName() { return cam.tPhi < -.2 ? 'below' : cam.tPhi > .45 ? 'above' : 'rest'; },
      /* экранные координаты (для тестов): точка выреза и середина грани */
      _screenPoint(i) { const P = S.pts[i], v = new THREE.Vector3(P.u * view.w * view.k, HP, P.v * view.l * view.k).project(camera), r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
      _screenEdge(i) { const n = S.pts.length, p = S.pts[i], q = S.pts[(i + 1) % n], v = new THREE.Vector3((p.u + q.u) / 2 * view.w * view.k, H - .06, (p.v + q.v) / 2 * view.l * view.k).project(camera), r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
      destroy() { dead = true; cancelAnimationFrame(raf); offs.forEach(f => f()); ro.disconnect(); io.disconnect(); clearRoom(); renderer.dispose(); canvas.remove(); tip.remove(); }
    };

    if (opts.view && V[opts.view]) { cam.tPhi = cam.phi = V[opts.view].phi; }
    if (opts.corners > 4) while (S.corners < opts.corners && S.notches.length < C.MAX_NOTCHES) { const ci = ORD[S.notches.length], { din, dout } = DIRS[ci];
      S.notches.push({ ci, da: r2(Math.abs(din[0]) > .5 ? .30 * S.w : .34 * S.l), db: r2(Math.abs(dout[0]) > .5 ? .30 * S.w : .34 * S.l) }); fixNotches(); syncArea(); }
    frame();
    return api;
  }

  global.Ceiling3D = { mount: mount, config: CONFIG, version: '1.0' };
})(typeof window !== 'undefined' ? window : this);
