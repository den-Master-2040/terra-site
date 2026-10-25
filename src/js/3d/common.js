// Общее для 3D-моделей: текстуры на canvas, материалы, простые тела.
import * as THREE from 'three';

/* ---------- Текстуры, нарисованные на canvas ---------- */
const TEX = {};
export function ctex(key, w, h, draw, opts = {}) {
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
export let M = null;
export function mats() {
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
export function box(p, w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.castShadow = o.receiveShadow = true;
  p.add(o); return o;
}
// Плоскость с повторяющейся текстурой: tile — размер плитки в метрах
export function plane(p, w, h, m, x, y, z, ry = 0, tile = null) {
  const g = new THREE.PlaneGeometry(w, h);
  if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile[0], uv.getY(i) * h / tile[1]); }
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.rotation.y = ry; o.receiveShadow = true;
  p.add(o); return o;
}
export function cyl(p, r, len, m, x, y, z, axis = 'y', seg = 16) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true;
  p.add(o); return o;
}
