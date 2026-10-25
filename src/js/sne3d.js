// 3D-модели СНЭ на three.js: шкафы СНТЭ, БАВРТЭ, контейнеры СНТЭ и НТЭ.
// Собирается esbuild'ом в обычный скрипт assets/js/sne3d.js. Его подгружает site.js
// при первом нажатии «Смотреть в 3D», поэтому на остальных страницах three.js не скачивается.
// Модели собраны из простых тел по фото изделий и габаритам из таблиц: отдельных файлов моделей нет.
//
//   SNE3D.show(stage, spec)  показать модель на холсте внутри stage; false, если нет WebGL
//   SNE3D.doors(open)        открыть или закрыть двери
//   SNE3D.reset()            вернуть исходный вид
//   SNE3D.stop()             остановить отрисовку (окно закрыто)
// spec.units — блоки слева направо: { k: 'cab-air' | 'cab-liquid' | 'pcs' | 'bavr' | 'container' | 'nte-air' | 'nte-liquid', w, d, h } в метрах.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DOOR_ANGLE = 1.65; // ≈ 95°

/* ---------- Текстуры, нарисованные на canvas ---------- */
const TEX = {};
function ctex(key, w, h, draw, opts = {}) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.color !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return (TEX[key] = t);
}
// Жалюзи: плитка 0,12 м, четыре ламели
const louvreTex = () => ctex('louvre', 64, 128, (g, w, h) => {
  g.fillStyle = '#4a5054'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const y = i * 32, grd = g.createLinearGradient(0, y, 0, y + 26);
    grd.addColorStop(0, '#f4f5f4'); grd.addColorStop(.55, '#d4d8d9'); grd.addColorStop(1, '#8d9497');
    g.fillStyle = grd; g.fillRect(0, y + 3, w, 23);
  }
}, { repeat: true });
// Перфорация: плитка 0,05 м
const perfTex = () => ctex('perf', 64, 64, (g, w, h) => {
  g.fillStyle = '#dde0e1'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#41474b';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(8 + x * 16 + (y % 2) * 8, 8 + y * 16, 5, 0, Math.PI * 2); g.fill(); }
}, { repeat: true });
// Гофра стенок контейнера (карта рельефа): плитка 0,28 м
const corrTex = () => ctex('corr', 128, 8, (g, w) => {
  for (let x = 0; x < w; x++) { const c = Math.round(128 + Math.sin(x / w * Math.PI * 2) * 100); g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(x, 0, 1, 8); }
}, { repeat: true, color: false });
// Сенсорная панель оператора
const screenTex = () => ctex('screen', 256, 192, (g, w, h) => {
  g.fillStyle = '#12181c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f2a31'; g.fillRect(10, 10, w - 20, 26);
  g.fillStyle = '#f5b818'; g.fillRect(16, 18, 60, 10);
  g.fillStyle = '#8fa3ad'; g.fillRect(w - 70, 18, 54, 10);
  // уровень заряда
  g.strokeStyle = '#8fa3ad'; g.lineWidth = 3; g.strokeRect(18, 54, 86, 120);
  g.fillStyle = '#3fbf6a'; g.fillRect(24, 90, 74, 78);
  // график мощности
  g.strokeStyle = '#f5b818'; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= 120; x += 4) { const y = 120 - Math.sin(x / 18) * 26 - x * .2; x ? g.lineTo(122 + x, y) : g.moveTo(122, y); }
  g.stroke();
  g.fillStyle = '#5d6f78'; for (let i = 0; i < 3; i++) g.fillRect(122, 150 + i * 10, 60 + i * 20, 5);
});
// Лицевая панель батарейного модуля
const moduleTex = () => ctex('module', 256, 96, (g, w, h) => {
  g.fillStyle = '#d9dcdc'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c4c8c9'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  g.fillStyle = '#2b3033'; g.fillRect(8, 22, 14, 52); g.fillRect(w - 22, 22, 14, 52); // ручки
  g.fillStyle = '#ffffff'; g.fillRect(40, 24, 92, 46);
  g.fillStyle = '#9aa1a4'; for (let i = 0; i < 4; i++) g.fillRect(48, 32 + i * 9, 50 + (i % 2) * 24, 4);
  g.fillStyle = '#f5b818'; g.fillRect(40, 24, 6, 46);
  g.fillStyle = '#e07a2c'; g.beginPath(); g.arc(166, 48, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#25292c'; g.beginPath(); g.arc(198, 48, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3fbf6a'; g.fillRect(222, 26, 6, 6);
});
// Силовой модуль преобразователя: вентиляторы и индикаторы
const pcsTex = () => ctex('pcs', 256, 128, (g, w, h) => {
  g.fillStyle = '#30363a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3b4246'; g.fillRect(6, 6, w - 12, h - 12);
  for (const cx of [60, 140]) {
    g.fillStyle = '#1b1f22'; g.beginPath(); g.arc(cx, 64, 34, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6a7378'; g.lineWidth = 2;
    for (let r = 8; r <= 34; r += 8) { g.beginPath(); g.arc(cx, 64, r, 0, Math.PI * 2); g.stroke(); }
    for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(cx, 64); g.lineTo(cx + Math.cos(a) * 34, 64 + Math.sin(a) * 34); g.stroke(); }
  }
  g.fillStyle = '#3fbf6a'; g.fillRect(200, 30, 10, 10);
  g.fillStyle = '#f5b818'; g.fillRect(200, 50, 10, 10);
  g.fillStyle = '#c8261e'; g.fillRect(200, 70, 10, 10);
  g.fillStyle = '#d0d4d6'; g.fillRect(222, 30, 22, 50);
});
// Автоматический выключатель
const breakerTex = () => ctex('breaker', 128, 160, (g, w, h) => {
  g.fillStyle = '#25292c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#33393d'; g.fillRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#c8261e'; g.fillRect(52, 40, 24, 46);
  g.fillStyle = '#e9ecec'; g.fillRect(24, 104, 80, 22);
  g.fillStyle = '#7d868a'; for (let i = 0; i < 3; i++) g.fillRect(30 + i * 26, 110, 16, 10);
});
// Кондиционер на двери НТЭ: косая решётка и круглый вентилятор
const acTex = () => ctex('ac', 192, 384, (g, w, h) => {
  g.fillStyle = '#e8ebeb'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#545b5f'; g.fillRect(28, 36, w - 56, 150);
  g.save(); g.beginPath(); g.rect(28, 36, w - 56, 150); g.clip();
  g.strokeStyle = '#f1f3f3'; g.lineWidth = 9;
  for (let x = -150; x < w; x += 22) { g.beginPath(); g.moveTo(x, 186); g.lineTo(x + 150, 36); g.stroke(); }
  g.restore();
  g.fillStyle = '#545b5f'; g.beginPath(); g.arc(w / 2, 270, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8ebeb';
  for (let y = 230; y < 312; y += 9) for (let x = 54; x < 140; x += 9) if (Math.hypot(x - w / 2, y - 270) < 40) g.fillRect(x, y, 5, 5);
});
// Блок вентиляторов климатической установки контейнера: 2×2
const fansTex = () => ctex('fans', 256, 256, (g, w, h) => {
  g.fillStyle = '#d3d7d8'; g.fillRect(0, 0, w, h);
  for (const [cx, cy] of [[66, 66], [190, 66], [66, 190], [190, 190]]) {
    g.fillStyle = '#2b3033'; g.beginPath(); g.arc(cx, cy, 56, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8c9497'; g.lineWidth = 2;
    for (let r = 10; r <= 56; r += 9) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
    for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a * .785) * 56, cy + Math.sin(a * .785) * 56); g.stroke(); }
    g.fillStyle = '#c3c8ca'; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
  }
});
// Знак «Опасно, электрическое напряжение» (прозрачный фон)
const warnTex = () => ctex('warn', 128, 128, (g) => {
  g.fillStyle = '#f5b818'; g.strokeStyle = '#151515'; g.lineWidth = 8; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(64, 10); g.lineTo(120, 112); g.lineTo(8, 112); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#151515';
  g.beginPath(); g.moveTo(70, 42); g.lineTo(48, 80); g.lineTo(62, 80); g.lineTo(54, 104); g.lineTo(80, 68); g.lineTo(66, 68); g.lineTo(74, 42); g.closePath(); g.fill();
});
// Щиток пожаротушения
const fireTex = () => ctex('fire', 96, 192, (g, w, h) => {
  g.fillStyle = '#b8231c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d63a30'; g.fillRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#7d1612'; g.fillRect(20, 24, w - 40, 54); g.fillRect(20, 110, w - 40, 54);
  g.fillStyle = '#f2f2f2'; g.fillRect(30, 36, w - 60, 10); g.fillRect(30, 122, w - 60, 10);
});

/* ---------- Материалы ---------- */
let M = null;
function mats() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: .5, metalness: .1, envMapIntensity: .75 }, o));
  const tile = (map, o = {}) => std(Object.assign({ map }, o));
  M = {
    paint: std({ color: 0xeef0ef, roughness: .42 }),
    frame: std({ color: 0xe1e4e4, roughness: .45, metalness: .15 }),
    corr: std({ color: 0xeceeed, roughness: .48, bumpMap: corrTex(), bumpScale: 1.4 }),
    plinth: std({ color: 0x2a2d2f, roughness: .6, metalness: .3 }),
    rack: std({ color: 0x3a3f43, roughness: .55, metalness: .4 }),
    plate: std({ color: 0xb9bfc2, roughness: .4, metalness: .6 }),
    black: std({ color: 0x1d2023, roughness: .45, metalness: .25 }),
    gasket: std({ color: 0x2b2f31, roughness: .7 }),
    steel: std({ color: 0xc6cbce, roughness: .28, metalness: .85 }),
    copper: std({ color: 0xc0703a, roughness: .32, metalness: .9 }),
    casting: std({ color: 0x9aa0a3, roughness: .5, metalness: .45 }),
    red: std({ color: 0xc8261e, roughness: .4 }),
    green: std({ color: 0x2f9e44, roughness: .35, emissive: 0x124d1f }),
    amber: std({ color: 0xf2b416, roughness: .35, emissive: 0x4d3a05 }),
    pipeS: std({ color: 0x2f6c9e, roughness: .35 }),
    pipeR: std({ color: 0xc9652a, roughness: .35 }),
    louvre: tile(louvreTex(), { roughness: .55, metalness: .2 }),
    perf: tile(perfTex(), { roughness: .5, metalness: .3 }),
    screen: tile(screenTex(), { roughness: .15, emissive: 0xffffff, emissiveMap: screenTex(), emissiveIntensity: .45 }),
    module: tile(moduleTex(), { roughness: .5 }),
    moduleSide: std({ color: 0x9da4a7, roughness: .5, metalness: .5 }),
    pcs: tile(pcsTex(), { roughness: .5, metalness: .3 }),
    breaker: tile(breakerTex(), { roughness: .5 }),
    ac: tile(acTex(), { roughness: .45 }),
    fans: tile(fansTex(), { roughness: .5, metalness: .2 }),
    fire: tile(fireTex(), { roughness: .4 }),
    warn: new THREE.MeshStandardMaterial({ map: warnTex(), transparent: true, roughness: .4, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  return M;
}

/* ---------- Простые тела ---------- */
function box(p, w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.castShadow = o.receiveShadow = true;
  p.add(o); return o;
}
// Плоскость с повторяющейся текстурой: tile — размер плитки в метрах
function plane(p, w, h, m, x, y, z, ry = 0, tile = null) {
  const g = new THREE.PlaneGeometry(w, h);
  if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile[0], uv.getY(i) * h / tile[1]); }
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.rotation.y = ry; o.receiveShadow = true;
  p.add(o); return o;
}
function cyl(p, r, len, m, x, y, z, axis = 'y', seg = 16) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true;
  p.add(o); return o;
}

/* ---------- Двери ---------- */
// Дверь на петлях между x0 и x1, низ y0, высота h, наружная грань на z.
// hinge −1 — петли слева, +1 — справа; open — доля полного угла открывания.
// Всё, что висит на двери, добавляется в leaf: там x отсчитывается от центра полотна, y — от низа,
// лицевая сторона на z = leaf.f.
function door(parent, doors, x0, x1, y0, h, z, hinge, open = 1, t = .025) {
  const w = x1 - x0;
  const pivot = new THREE.Group();
  pivot.position.set(hinge < 0 ? x0 : x1, y0, z - t);
  const leaf = new THREE.Group(); leaf.position.x = hinge < 0 ? w / 2 : -w / 2;
  pivot.add(leaf); parent.add(pivot);
  box(leaf, w - .006, h, t, M.paint, 0, h / 2, t / 2);
  doors.push({ o: pivot, s: (hinge < 0 ? -1 : 1) * open });
  return { leaf, w, h, f: t + .001 };
}
function handle(D, x, y, len = .2) {
  box(D.leaf, .045, len + .05, .012, M.black, x, y, D.f + .006);
  box(D.leaf, .028, len, .03, M.black, x, y, D.f + .025);
}
// Тёмная кромка уплотнителя по контуру полотна (как на фото контейнеров)
function gasket(D, inset = .03) {
  const { leaf, w, h, f } = D, k = .012;
  box(leaf, w - inset * 2, k, .002, M.gasket, 0, inset, f);
  box(leaf, w - inset * 2, k, .002, M.gasket, 0, h - inset, f);
  box(leaf, k, h - inset * 2, .002, M.gasket, -w / 2 + inset, h / 2, f);
  box(leaf, k, h - inset * 2, .002, M.gasket, w / 2 - inset, h / 2, f);
}
// Замковые штанги контейнерной двери
function lockRods(D, xs) {
  for (const x of xs) {
    cyl(D.leaf, .014, D.h - .12, M.steel, x, D.h / 2, D.f + .03);
    for (const y of [.25, D.h / 2, D.h - .25]) box(D.leaf, .07, .05, .03, M.steel, x, y, D.f + .015);
  }
  box(D.leaf, .32, .035, .035, M.steel, (xs[0] + xs[xs.length - 1]) / 2, D.h * .48, D.f + .055);
}
function louvrePanel(p, w, h, x, y, z) {
  box(p, w + .03, h + .03, .006, M.frame, x, y, z + .003);
  plane(p, w, h, M.louvre, x, y, z + .007, 0, [.06, .12]);
}
function lamps(p, x, y, z, list) {
  list.forEach((m, i) => cyl(p, .016, .02, m, x + i * .06, y, z + .01, 'z', 20));
}
function estop(p, x, y, z) {
  box(p, .09, .09, .02, M.amber, x, y, z + .01);
  cyl(p, .03, .03, M.red, x, y, z + .035, 'z', 24);
}
function warnSign(p, x, y, z, s = .14) { plane(p, s, s, M.warn, x, y, z + .002); }

/* ---------- Начинка ---------- */
// Стойка батарейных модулей: заполняет прямоугольник x0…x1, y0…y1, лицевая сторона на zf, глубина depth
function batteryRack(p, x0, x1, y0, y1, zf, depth, liquid) {
  const W = x1 - x0, cols = Math.max(1, Math.round(W / .62)), cw = W / cols;
  const mh = .19, gap = .035, rows = Math.max(1, Math.floor((y1 - y0 - .12) / (mh + gap)));
  const mm = [M.moduleSide, M.moduleSide, M.moduleSide, M.moduleSide, M.module, M.moduleSide];
  box(p, W, .04, depth, M.rack, (x0 + x1) / 2, y0 + .02, zf - depth / 2);
  for (let c = 0; c <= cols; c++) box(p, .035, y1 - y0, .035, M.rack, x0 + c * cw, (y0 + y1) / 2, zf - .02);
  for (let c = 0; c < cols; c++) {
    const cx = x0 + cw * (c + .5);
    for (let r = 0; r < rows; r++) {
      const y = y0 + .08 + r * (mh + gap) + mh / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(cw - .07, mh, depth - .06), mm);
      m.position.set(cx, y, zf - .04 - (depth - .06) / 2); m.castShadow = m.receiveShadow = true; p.add(m);
      box(p, cw - .02, .012, depth - .04, M.rack, cx, y - mh / 2 - .008, zf - depth / 2); // полка
    }
    if (liquid) { // подача и обратка охлаждающей жидкости вдоль стойки
      const top = y0 + .08 + rows * (mh + gap);
      cyl(p, .018, top - y0 - .05, M.pipeS, cx - cw / 2 + .06, (y0 + top) / 2, zf - .01);
      cyl(p, .018, top - y0 - .05, M.pipeR, cx + cw / 2 - .06, (y0 + top) / 2, zf - .01);
    }
  }
  // кабель-канал BMS сверху
  box(p, W, .06, .08, M.black, (x0 + x1) / 2, y1 - .03, zf - .06);
}
// Силовой преобразователь: модули с вентиляторами, шины, вводной автомат
function pcsBlock(p, x0, x1, y0, y1, zf, depth) {
  const W = x1 - x0, cx = (x0 + x1) / 2, H = y1 - y0;
  const mod = [M.rack, M.rack, M.rack, M.rack, M.pcs, M.rack];
  const n = Math.max(2, Math.min(4, Math.floor(H * .62 / .3)));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W * .62, .26, depth), mod);
    m.position.set(x0 + W * .33, y0 + .2 + i * .31, zf - depth / 2); m.castShadow = true; p.add(m);
  }
  for (let i = 0; i < 3; i++) box(p, .03, H * .75, .01, M.copper, x0 + W * .72 + i * .07, y0 + H * .45, zf - .1);
  const b = [M.black, M.black, M.black, M.black, M.breaker, M.black];
  const br = new THREE.Mesh(new THREE.BoxGeometry(Math.min(.24, W * .22), .3, .2), b);
  br.position.set(x0 + W * .79, y0 + H * .86, zf - .1); br.castShadow = true; p.add(br);
}

/* ---------- Изделия ---------- */
// Корпус шкафа без передней стенки; возвращает z лицевой плоскости
function cabinetShell(g, w, d, h, base) {
  const t = .02, H = h - base;
  box(g, w - .04, base, d - .04, M.plinth, 0, base / 2, 0);
  box(g, w, t, d, M.paint, 0, base + t / 2, 0);
  box(g, w + .01, .03, d + .01, M.paint, 0, h - .015, 0);
  box(g, w, H, t, M.paint, 0, base + H / 2, -d / 2 + t / 2);
  for (const s of [-1, 1]) box(g, t, H - .03, d, M.paint, s * (w / 2 - t / 2), base + (H - .03) / 2, 0);
  return d / 2;
}
function eyeBolts(g, w, d, h) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.03, .008, 8, 20), M.steel);
    r.position.set(sx * (w / 2 - .06), h + .035, sz * (d / 2 - .06)); g.add(r);
  }
}

// СНТЭ, воздушное охлаждение: жалюзи сверху, окно панели оператора, кондиционер на боковой стенке
function cabAir(g, u, doors) {
  const { w, d, h } = u, base = .12, z = cabinetShell(g, w, d, h, base), top = .3;
  box(g, w - .04, top, .02, M.paint, 0, h - .03 - top / 2, z - .01);
  louvrePanel(g, w * .62, top * .6, -w * .1, h - .03 - top / 2, z);
  const D = door(g, doors, -w / 2 + .02, w / 2 - .02, base + .02, h - base - top - .06, z, -1);
  const { leaf, f } = D, L = D.h;
  box(leaf, .3, .34, .012, M.frame, 0, L * .7, f + .006);
  plane(leaf, .26, .2, M.screen, 0, L * .72, f + .013);
  lamps(leaf, -.04, L * .58, f, [M.green, M.red]);
  estop(leaf, .1, L * .58, f);
  box(leaf, D.w - .05, .006, .004, M.gasket, 0, L * .4, f + .002);
  handle(D, D.w / 2 - .08, L * .55, .26);
  warnSign(leaf, 0, L * .2, f);
  // кондиционер на правой стенке
  const ah = (h - base) * .42, ad = d * .56;
  box(g, .16, ah, ad, M.paint, w / 2 + .08, h - .2 - ah / 2, 0);
  plane(g, ad * .7, ah * .35, M.perf, w / 2 + .161, h - .2 - ah * .3, 0, Math.PI / 2, [.05, .05]);
  plane(g, ad * .7, ah * .35, M.louvre, w / 2 + .161, h - .2 - ah * .74, 0, Math.PI / 2, [.06, .12]);
  // внутри: стойка модулей и преобразователь
  batteryRack(g, -w / 2 + .06, w / 2 - .06, base + .04, h - top - .45, z - .06, d * .62, false);
  const pm = [M.rack, M.rack, M.rack, M.rack, M.pcs, M.rack];
  const pc = new THREE.Mesh(new THREE.BoxGeometry(w * .7, .3, d * .55), pm);
  pc.position.set(0, h - top - .25, z - .06 - d * .275); pc.castShadow = true; g.add(pc);
}

// СНТЭ, жидкостное охлаждение: узкая дверь чиллера слева, широкая дверь с панелью оператора справа
function cabLiquid(g, u, doors) {
  const { w, d, h } = u, base = .1, z = cabinetShell(g, w, d, h, base);
  eyeBolts(g, w, d, h);
  const split = -w / 2 + w * .42, y0 = base + .02, H = h - base - .06;
  const A = door(g, doors, -w / 2 + .02, split, y0, H, z, -1);
  louvrePanel(A.leaf, .11, H * .42, -A.w / 2 + .12, H * .62, A.f);
  handle(A, A.w / 2 - .06, H * .5, .24);
  const B = door(g, doors, split, w / 2 - .02, y0, H, z, 1);
  box(B.leaf, .2, .17, .012, M.frame, 0, H * .8, B.f + .006);
  plane(B.leaf, .17, .13, M.screen, 0, H * .8, B.f + .013);
  box(B.leaf, .05, .26, .012, M.black, 0, H * .58, B.f + .006);
  lamps(B.leaf, 0, H * .64, B.f + .006, [M.green]); lamps(B.leaf, 0, H * .58, B.f + .006, [M.amber]); lamps(B.leaf, 0, H * .52, B.f + .006, [M.green]);
  cyl(B.leaf, .022, .03, M.red, 0, H * .45, B.f + .015, 'z', 20);
  warnSign(B.leaf, 0, .15, B.f, .12);
  // внутри: чиллер за узкой дверью, стойка модулей с трубами за широкой
  const cx = (-w / 2 + split) / 2, cw = split + w / 2 - .08;
  box(g, cw, H * .45, d * .7, M.rack, cx, y0 + H * .25, z - .06 - d * .35);
  plane(g, cw * .8, H * .3, M.fans, cx, y0 + H * .25, z - .059, 0);
  for (const [m, dx] of [[M.pipeS, -.04], [M.pipeR, .04]]) cyl(g, .02, H * .45, m, cx + dx, y0 + H * .7, z - .1);
  batteryRack(g, split + .03, w / 2 - .05, y0 + .02, h - .12, z - .06, d * .7, true);
}

// Шкаф преобразователя в составе системы из нескольких шкафов
function pcsCabinet(g, u, doors) {
  const { w, d, h } = u, base = .1, z = cabinetShell(g, w, d, h, base);
  eyeBolts(g, w, d, h);
  const y0 = base + .02, H = h - base - .06;
  for (const [x0, x1, hinge] of [[-w / 2 + .02, 0, -1], [0, w / 2 - .02, 1]]) {
    const D = door(g, doors, x0, x1, y0, H, z, hinge);
    louvrePanel(D.leaf, D.w * .62, H * .14, 0, H * .84, D.f);
    louvrePanel(D.leaf, D.w * .62, H * .14, 0, H * .16, D.f);
    handle(D, -hinge * (D.w / 2 - .06), H * .5, .24);
    if (hinge > 0) { box(D.leaf, .24, .19, .012, M.frame, 0, H * .6, D.f + .006); plane(D.leaf, .2, .15, M.screen, 0, H * .6, D.f + .013); }
    else warnSign(D.leaf, 0, H * .6, D.f);
  }
  pcsBlock(g, -w / 2 + .06, w / 2 - .06, y0, h - .12, z - .06, d * .6);
}

// БАВРТЭ: узкий глубокий шкаф, перфорированная решётка на двери
function bavr(g, u, doors) {
  const { w, d, h } = u, base = .12, z = cabinetShell(g, w, d, h, base);
  const H = h - base - .06;
  const D = door(g, doors, -w / 2 + .02, w / 2 - .02, base + .02, H, z, -1);
  box(D.leaf, .3, .36, .008, M.frame, D.w / 2 - .24, H * .8, D.f + .004);
  plane(D.leaf, .27, .33, M.perf, D.w / 2 - .24, H * .8, D.f + .009, 0, [.05, .05]);
  handle(D, D.w / 2 - .05, H * .5, .2);
  warnSign(D.leaf, -.1, H * .42, D.f, .12);
  // боковая дверь справа (закрыта) — ручка
  box(g, .012, .2, .04, M.black, w / 2 + .006, base + H * .5, d / 2 - .2);
  // монтажная панель с аппаратами
  const zp = -d / 2 + .05;
  box(g, w - .1, H - .1, .02, M.plate, 0, base + H / 2, zp);
  const bm = [M.black, M.black, M.black, M.black, M.breaker, M.black];
  for (const [x, y] of [[-.15, .78], [.15, .78]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .22), bm);
    b.position.set(x, base + H * y, zp + .12); b.castShadow = true; g.add(b);
  }
  // тиристорные ключи на радиаторах
  for (let i = 0; i < 3; i++) {
    const x = -.2 + i * .2, y = base + H * .45;
    box(g, .16, .3, .1, M.steel, x, y, zp + .06);
    for (let k = 0; k < 7; k++) box(g, .004, .3, .1, M.steel, x - .07 + k * .023, y, zp + .16);
    box(g, .12, .06, .05, M.black, x, y + .19, zp + .1);
  }
  for (let i = 0; i < 3; i++) box(g, .03, H * .72, .01, M.copper, -.12 + i * .12, base + H * .5, zp + .3);
  box(g, .2, .14, .06, M.rack, .18, base + H * .2, zp + .05);
  plane(g, .14, .09, M.screen, .18, base + H * .2, zp + .081);
}

// Корпус контейнера: рама со стойками и фитингами, гофрированные стенки, без длинной лицевой стенки
function containerShell(g, L, W, H) {
  const p = .15, cz = W / 2 - .07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, p, H, p, M.frame, sx * (L / 2 - p / 2), H / 2, sz * (W / 2 - p / 2));
    for (const y of [.08, H - .08]) box(g, .18, .16, .18, M.casting, sx * (L / 2 - .09), y, sz * (W / 2 - .09));
  }
  for (const sz of [-1, 1]) {
    box(g, L - .36, .2, .14, M.frame, 0, .12, sz * (W / 2 - .07));
    box(g, L - .36, .14, .14, M.frame, 0, H - .07, sz * (W / 2 - .07));
  }
  for (const sx of [-1, 1]) {
    box(g, .14, .2, W - .36, M.frame, sx * (L / 2 - .07), .12, 0);
    box(g, .14, .14, W - .36, M.frame, sx * (L / 2 - .07), H - .07, 0);
    corrWall(g, .03, H - .34, W - .3, sx * (L / 2 - .05), H / 2, 0); // торцевые стенки
  }
  corrWall(g, L - .3, H - .34, .03, 0, H / 2, -W / 2 + .05);
  box(g, L - .1, .03, W - .1, M.paint, 0, H - .015, 0);
  box(g, L - .3, .03, W - .3, M.rack, 0, .21, 0);
  return { z: cz + .07, x0: -L / 2 + p, x1: L / 2 - p, y0: .22, y1: H - .14 };
}
// Гофрированная стенка: рельеф повторяется вдоль стены с шагом 0,28 м
function corrWall(p, w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
  // порядок граней: ±x (u идёт вдоль z), ±y, ±z (u идёт вдоль x)
  for (let f = 0; f < 6; f++) for (let i = f * 4; i < f * 4 + 4; i++) uv.setX(i, uv.getX(i) * (f < 2 ? d : w) / .28);
  const o = new THREE.Mesh(geo, M.corr); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true;
  p.add(o); return o;
}
// Ставит батарейные стойки за проёмами дверей
function racksBehind(g, bays, C, W, liquid) {
  for (const [x0, x1] of bays) batteryRack(g, x0 + .04, x1 - .04, C.y0 + .02, C.y1 - .1, C.z - .14, Math.min(1.1, W * .42), liquid);
}

// Контейнер СНТЭ с жидкостным охлаждением: климатическая установка слева, двери с замковыми штангами, жалюзи справа
function container(g, u, doors) {
  const { w: L, d: W, h: H } = u, C = containerShell(g, L, W, H), Hd = C.y1 - C.y0;
  // левый отсек: дверь с панелью и блок вентиляторов
  const xa = C.x0 + .5, xb = xa + .95;
  const A = door(g, doors, C.x0, xa, C.y0, Hd, C.z, -1);
  gasket(A); handle(A, A.w / 2 - .07, Hd * .5, .22);
  box(A.leaf, .2, .16, .012, M.frame, 0, Hd * .75, A.f + .006); plane(A.leaf, .16, .12, M.screen, 0, Hd * .75, A.f + .013);
  lamps(A.leaf, -.05, Hd * .63, A.f, [M.green, M.amber, M.red]);
  box(g, xb - xa, Hd, .04, M.paint, (xa + xb) / 2, C.y0 + Hd / 2, C.z - .02);
  plane(g, (xb - xa) * .86, (xb - xa) * .86, M.fans, (xa + xb) / 2, C.y0 + Hd * .66, C.z + .002);
  louvrePanel(g, (xb - xa) * .7, Hd * .22, (xa + xb) / 2, C.y0 + Hd * .2, C.z);
  // двери батарейных отсеков
  const xr = C.x1 - .5, n = Math.max(2, Math.round((xr - xb) / .95)), bw = (xr - xb) / n, bays = [];
  for (let i = 0; i < n; i++) {
    const x0 = xb + i * bw, D = door(g, doors, x0 + .01, x0 + bw - .01, C.y0, Hd, C.z, -1);
    gasket(D); lockRods(D, [-.12, .12]);
    bays.push([x0, x0 + bw]);
    if (i === 0) plane(D.leaf, .3, .3, M.perf, 0, .45, D.f + .002, 0, [.05, .05]);
  }
  for (let i = 1; i < n; i++) box(g, .05, Hd, .05, M.frame, xb + i * bw, C.y0 + Hd / 2, C.z - .03);
  // правый отсек: жалюзи
  box(g, C.x1 - xr, Hd, .04, M.paint, (xr + C.x1) / 2, C.y0 + Hd / 2, C.z - .02);
  louvrePanel(g, (C.x1 - xr) * .66, Hd * .5, (xr + C.x1) / 2, C.y0 + Hd * .62, C.z);
  warnSign(g, (xr + C.x1) / 2, C.y0 + Hd * .2, C.z + .001);
  box(g, xb - C.x0 - .1, Hd * .5, W * .4, M.rack, (C.x0 + xb) / 2, C.y0 + Hd * .3, C.z - .1 - W * .2);
  racksBehind(g, bays, C, W, true);
}

// НТЭ с воздушным охлаждением: кондиционеры навешены на двери
function nteAir(g, u, doors) {
  const { w: L, d: W, h: H } = u, C = containerShell(g, L, W, H), Hd = C.y1 - C.y0;
  const n = 6, bw = (C.x1 - C.x0) / n, bays = [];
  for (let i = 0; i < n; i++) {
    const x0 = C.x0 + i * bw;
    if (i === n - 1) { // последний отсек глухой
      box(g, bw, Hd, .04, M.paint, x0 + bw / 2, C.y0 + Hd / 2, C.z - .02);
      box(g, .45, .32, .3, M.paint, x0 + bw / 2, C.y0 + .4, C.z + .15);
      box(g, .38, .05, .24, M.gasket, x0 + bw / 2, C.y0 + .23, C.z + .15);
      continue;
    }
    const D = door(g, doors, x0 + .01, x0 + bw - .01, C.y0, Hd, C.z, -1);
    gasket(D, .02);
    cyl(D.leaf, .014, Hd - .1, M.steel, D.w / 2 - .06, Hd / 2, D.f + .025);
    box(D.leaf, .06, .2, .04, M.steel, -D.w / 2 + .1, Hd * .4, D.f + .02);
    // кондиционер
    const aw = Math.min(.56, D.w - .2), ah = 1.15;
    const ac = [M.paint, M.paint, M.paint, M.paint, M.ac, M.paint];
    const m = new THREE.Mesh(new THREE.BoxGeometry(aw, ah, .26), ac);
    m.position.set(0, Hd * .62, D.f + .13); m.castShadow = m.receiveShadow = true; D.leaf.add(m);
    bays.push([x0, x0 + bw]);
  }
  for (let i = 1; i < n; i++) box(g, .05, Hd, .05, M.frame, C.x0 + i * bw, C.y0 + Hd / 2, C.z - .03);
  box(g, .4, .3, .25, M.paint, C.x0 + .3, H - .45, C.z + .1);
  racksBehind(g, bays, C, W, false);
}

// НТЭ с жидкостным охлаждением: три пары дверей, справа отсек чиллера с козырьками и щиток пожаротушения
function nteLiquid(g, u, doors) {
  const { w: L, d: W, h: H } = u, C = containerShell(g, L, W, H), Hd = C.y1 - C.y0;
  const xr = C.x1 - .62, n = 6, bw = (xr - C.x0) / n, bays = [];
  for (let i = 0; i < n; i++) {
    const x0 = C.x0 + i * bw, hinge = i % 2 ? 1 : -1;
    const D = door(g, doors, x0 + .006, x0 + bw - .006, C.y0, Hd, C.z, hinge, hinge > 0 ? .78 : 1);
    box(D.leaf, .025, .17, .03, M.black, -hinge * (D.w / 2 - .06), Hd * .48, D.f + .015);
    if (i % 2 === 0) bays.push([x0, x0 + bw * 2]);
  }
  box(g, C.x1 - xr, Hd, .04, M.paint, (xr + C.x1) / 2, C.y0 + Hd / 2, C.z - .02);
  for (const y of [Hd * .83, Hd * .18]) {
    box(g, .5, .42, .32, M.paint, (xr + C.x1) / 2, C.y0 + y, C.z + .16);
    box(g, .42, .02, .26, M.gasket, (xr + C.x1) / 2, C.y0 + y - .21, C.z + .16);
  }
  plane(g, .26, .52, M.fire, (xr + C.x1) / 2, C.y0 + Hd * .5, C.z + .002);
  // карманы под вилочный погрузчик
  for (const sx of [-1, 1]) box(g, .36, .1, .02, M.gasket, sx * 1.03, .12, W / 2 + .001);
  racksBehind(g, bays, C, W, true);
}

const BUILD = { 'cab-air': cabAir, 'cab-liquid': cabLiquid, pcs: pcsCabinet, bavr, container, 'nte-air': nteAir, 'nte-liquid': nteLiquid };

function buildModel(spec, doors) {
  const root = new THREE.Group();
  const total = spec.units.reduce((s, u) => s + u.w, 0);
  let x = -total / 2;
  for (const u of spec.units) {
    const g = new THREE.Group(); g.position.x = x + u.w / 2;
    (BUILD[u.k] || cabAir)(g, u, doors);
    root.add(g); x += u.w;
  }
  return root;
}

/* ---------- Просмотрщик ---------- */
let V = null;
function webgl() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}
function viewer(stage) {
  const canvas = stage.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), .04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8b84, .5));
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .2 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minPolarAngle = .2; controls.maxPolarAngle = 1.5;
  controls.autoRotateSpeed = .7;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  const v = { stage, renderer, scene, sun, camera, controls, model: null, doors: [], p: 0, target: 0, running: false, home: null };
  const resize = () => {
    const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    if (v.home && !v.moved) fit(v, v.target > 0);
  };
  new ResizeObserver(resize).observe(stage);
  controls.addEventListener('start', () => { v.moved = true; v.goal = null; });
  v.resize = resize;
  return v;
}
// Камера спереди-справа-сверху, модель целиком в кадре. front — почти анфас, чтобы заглянуть в открытые двери.
// smooth — не прыгать, а долететь до новой точки за несколько кадров.
function fit(v, front = false, smooth = false) {
  const { size, center, y0 } = front ? v.homeOpen : v.home, cam = v.camera;
  const dir = (front ? new THREE.Vector3(.3, .42, 1.25) : new THREE.Vector3(.85, .5, 1.25)).normalize();
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const r = size.length() / 2;
  // расстояние, при котором все углы габаритного ящика попадают в кадр с полями
  const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right);
  let dist = 0;
  for (const sx of [-.5, .5]) for (const sy of [-.5, .5]) for (const sz of [-.5, .5]) {
    const c = new THREE.Vector3(size.x * sx, y0 + size.y * (sy + .5) - center.y, size.z * sz);
    const z = c.dot(dir);
    dist = Math.max(dist, z + Math.abs(c.dot(right)) / (t * cam.aspect * .86), z + Math.abs(c.dot(up)) / (t * .84));
  }
  const pos = center.clone().addScaledVector(dir, dist);
  v.goal = smooth && !reduceMotion ? pos : null;
  if (!v.goal) cam.position.copy(pos);
  v.controls.target.copy(center);
  v.controls.minDistance = r * 1.2; v.controls.maxDistance = dist * 2;
  v.controls.update();
}
// Габарит модели и точка, вокруг которой вращается камера (чуть ниже середины по высоте)
function frameOf(model) {
  const bb = new THREE.Box3().setFromObject(model), size = bb.getSize(new THREE.Vector3()), center = bb.getCenter(new THREE.Vector3());
  center.y = bb.min.y + size.y * .45;
  return { size, center, y0: bb.min.y };
}
function dispose(o) {
  o.traverse(m => { if (m.geometry) m.geometry.dispose(); });
}
function loop() {
  if (!V || !V.running) return;
  requestAnimationFrame(loop);
  const d = V.target - V.p;
  V.p = reduceMotion || Math.abs(d) < .002 ? V.target : V.p + d * .07;
  for (const x of V.doors) x.o.rotation.y = x.s * DOOR_ANGLE * V.p;
  if (V.goal) { V.camera.position.lerp(V.goal, .07); if (V.camera.position.distanceTo(V.goal) < .01) V.goal = null; }
  V.controls.update();
  V.renderer.render(V.scene, V.camera);
  if (!V.ready) { V.ready = true; V.stage.classList.add('gl-ready'); }
}

const api = {
  show(stage, spec) {
    if (!webgl()) return false;
    if (!V || V.stage !== stage) { try { V = viewer(stage); } catch (e) { return false; } }
    mats();
    if (V.model) { V.scene.remove(V.model); dispose(V.model); }
    V.doors = []; V.p = V.target = 0;
    V.model = buildModel(spec, V.doors); V.scene.add(V.model);
    // два кадра: с закрытыми и с открытыми дверями (открытые створки выходят за габарит)
    V.home = frameOf(V.model);
    for (const x of V.doors) x.o.rotation.y = x.s * DOOR_ANGLE;
    V.homeOpen = frameOf(V.model);
    for (const x of V.doors) x.o.rotation.y = 0;
    const { size, center } = V.home;
    // тень: источник света над моделью, рамка теней по её размеру
    const s = Math.max(size.x, size.z) * .8 + 1, cam = V.sun.shadow.camera;
    cam.left = cam.bottom = -s; cam.right = cam.top = s; cam.near = .5; cam.far = s * 6; cam.updateProjectionMatrix();
    V.sun.position.set(center.x - s * .8, s * 2.2, center.z + s * 1.4); V.sun.target.position.copy(center);
    V.moved = false;
    V.resize(); fit(V);
    V.controls.autoRotate = !reduceMotion;
    api.start();
    return true;
  },
  doors(open, instant = false) {
    if (!V) return;
    V.target = open ? 1 : 0;
    if (instant) V.p = V.target;
    // пока посетитель сам не крутил модель, поворачиваем её фасадом к нему
    if (!V.moved) { V.controls.autoRotate = !open && !reduceMotion; fit(V, open, !instant); }
  },
  reset() { if (!V) return; V.moved = false; fit(V, V.target > 0, true); V.controls.autoRotate = !reduceMotion && !V.target; },
  start() { if (V && !V.running) { V.running = true; requestAnimationFrame(loop); } },
  stop() { if (V) V.running = false; },
};
window.SNE3D = api;
