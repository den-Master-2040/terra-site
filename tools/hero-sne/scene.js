// Контейнеры СНЭ на стальном поддоне и бетонной ступени — картинка для главной.
// Рендер: scene.html?w=2400&h=1150 → canvas → WebP с прозрачным фоном в <pre id="out">.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const W = +q.get('w') || 1600, H = +q.get('h') || 760;
const FMT = q.get('fmt') || 'image/webp';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// ---------- текстуры, нарисованные на canvas ----------
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function tex(c, color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// случайность с зерном, чтобы рендер был одинаковым при каждом запуске
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Габариты контейнера, м (20-футовый high cube)
const L = 6.06, D = 2.44, CH = 2.9;
const PX = 512; // пикселей текстуры на метр

// Длинная сторона: двери, штанги рисуются геометрией, тут — швы, жалюзи, знаки
function frontMaps(kind) {
  const w = Math.round(L * PX), h = Math.round(CH * PX);
  const doors = 6, dw = w / doors;
  const louverDoors = kind === 'pcs' ? [1, 2, 3, 4] : [0];
  const map = canvas(w, h, (g) => {
    g.fillStyle = '#f1f2f1'; g.fillRect(0, 0, w, h);
    // лёгкая неравномерность окраски
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.012})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 30, 2 + rnd() * 30);
    }
    // вертикальные гофры: светлее/темнее по синусу
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x / dw * Math.PI * 2 * 4);
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.05})` : `rgba(0,0,0,${-v * 0.035})`;
      g.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < doors; i++) {
      const x0 = i * dw;
      // зазор между створками и рамка
      g.fillStyle = '#7d8386'; g.fillRect(x0 - 3, 0, 6, h);
      g.strokeStyle = 'rgba(80,86,90,.55)'; g.lineWidth = 4;
      g.strokeRect(x0 + 18, 40, dw - 36, h - 80);
      if (louverDoors.includes(i)) {
        const lx = x0 + 70, lw = dw - 140, ly = h * 0.12, lh = kind === 'pcs' ? h * 0.76 : h * 0.3;
        g.fillStyle = '#c9cdcf'; g.fillRect(lx, ly, lw, lh);
        for (let y = ly + 6; y < ly + lh - 6; y += 18) {
          g.fillStyle = '#5c6366'; g.fillRect(lx + 8, y, lw - 16, 7);
          g.fillStyle = '#fbfbfb'; g.fillRect(lx + 8, y + 7, lw - 16, 4);
        }
        g.strokeStyle = '#8c9396'; g.lineWidth = 6; g.strokeRect(lx, ly, lw, lh);
      }
    }
    // знак «Осторожно, электричество»
    const sx = dw * (kind === 'pcs' ? 0.5 : 2.5), sy = h * 0.2, s = 150;
    g.fillStyle = '#f5b818'; g.strokeStyle = '#151515'; g.lineWidth = 12; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(sx, sy - s * 0.58); g.lineTo(sx + s * 0.6, sy + s * 0.46); g.lineTo(sx - s * 0.6, sy + s * 0.46); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#151515';
    g.beginPath(); g.moveTo(sx + 8, sy - 30); g.lineTo(sx - 22, sy + 12); g.lineTo(sx - 2, sy + 12); g.lineTo(sx - 12, sy + 42);
    g.lineTo(sx + 22, sy - 2); g.lineTo(sx + 2, sy - 2); g.closePath(); g.fill();
    // табличка с номером
    const px = dw * (kind === 'pcs' ? 5.5 : 4.5) - 110, py = h * 0.16;
    g.fillStyle = '#dfe2e2'; g.fillRect(px, py, 220, 120);
    g.strokeStyle = '#9aa0a3'; g.lineWidth = 4; g.strokeRect(px, py, 220, 120);
    g.fillStyle = '#4b5154';
    for (let i = 0; i < 4; i++) g.fillRect(px + 22, py + 24 + i * 22, 120 + rnd() * 50, 8);
    // жёлтая полоса вдоль низа — фирменный акцент
    g.fillStyle = '#f5b818'; g.fillRect(0, h - 70, w, 26);
  });
  const bump = canvas(w, h, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x / dw * Math.PI * 2 * 4);
      const c = Math.round(128 + v * 70);
      g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < doors; i++) {
      const x0 = i * dw;
      g.fillStyle = '#000'; g.fillRect(x0 - 3, 0, 6, h);
      g.strokeStyle = '#303030'; g.lineWidth = 4; g.strokeRect(x0 + 18, 40, dw - 36, h - 80);
      if (louverDoors.includes(i)) {
        const lx = x0 + 70, lw = dw - 140, ly = h * 0.12, lh = kind === 'pcs' ? h * 0.76 : h * 0.3;
        g.fillStyle = '#404040'; g.fillRect(lx, ly, lw, lh);
        for (let y = ly + 6; y < ly + lh - 6; y += 18) {
          g.fillStyle = '#000'; g.fillRect(lx + 8, y, lw - 16, 7);
          g.fillStyle = '#d0d0d0'; g.fillRect(lx + 8, y + 7, lw - 16, 6);
        }
      }
    }
  });
  return { map: tex(map), bump: tex(bump, false), dw: L / doors };
}

// Торец: кондиционер с двумя вентиляторами
function endMaps() {
  const w = Math.round(D * PX), h = Math.round(CH * PX);
  const map = canvas(w, h, (g) => {
    g.fillStyle = '#eef0ef'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x / w * Math.PI * 2 * 7);
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.05})` : `rgba(0,0,0,${-v * 0.035})`; g.fillRect(x, 0, 1, h);
    }
    g.fillStyle = '#e3e6e6'; g.fillRect(w * 0.12, h * 0.1, w * 0.76, h * 0.52);
    g.strokeStyle = '#8f9699'; g.lineWidth = 6; g.strokeRect(w * 0.12, h * 0.1, w * 0.76, h * 0.52);
    for (const cy of [h * 0.23, h * 0.49]) {
      const cx = w / 2, r = w * 0.2;
      g.fillStyle = '#3f4548'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9ba2a5'; g.lineWidth = 4;
      for (let k = 1; k <= 7; k++) { g.beginPath(); g.arc(cx, cy, r * k / 7, 0, Math.PI * 2); g.stroke(); }
      for (let a = 0; a < 12; a++) {
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a / 12 * Math.PI * 2) * r, cy + Math.sin(a / 12 * Math.PI * 2) * r); g.stroke();
      }
      g.fillStyle = '#c4c9cb'; g.beginPath(); g.arc(cx, cy, r * 0.16, 0, Math.PI * 2); g.fill();
    }
    // сервисная дверца и знак
    g.strokeStyle = 'rgba(80,86,90,.6)'; g.lineWidth = 5; g.strokeRect(w * 0.12, h * 0.68, w * 0.76, h * 0.26);
    g.fillStyle = '#f5b818'; g.fillRect(0, h - 70, w, 26);
  });
  const bump = canvas(w, h, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#505050'; g.fillRect(w * 0.12, h * 0.1, w * 0.76, h * 0.52);
    for (const cy of [h * 0.23, h * 0.49]) {
      g.fillStyle = '#202020'; g.beginPath(); g.arc(w / 2, cy, w * 0.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9a9a9a'; g.lineWidth = 4;
      for (let k = 1; k <= 7; k++) { g.beginPath(); g.arc(w / 2, cy, w * 0.2 * k / 7, 0, Math.PI * 2); g.stroke(); }
    }
    g.strokeStyle = '#303030'; g.lineWidth = 5; g.strokeRect(w * 0.12, h * 0.68, w * 0.76, h * 0.26);
  });
  return { map: tex(map), bump: tex(bump, false) };
}

function concreteMaps(rw, rh) {
  const w = 1024, h = 1024;
  const map = canvas(w, h, (g) => {
    g.fillStyle = '#a9a7a1'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60000; i++) {
      const c = 120 + rnd() * 80 | 0;
      g.fillStyle = `rgba(${c},${c - 2},${c - 6},${0.25 + rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(90,88,84,${rnd() * 0.25})`;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 1.6, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 40 + rnd() * 120, 20 + rnd() * 60, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  });
  const t = tex(map); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rw, rh);
  const b = tex(map, false); b.wrapS = b.wrapT = THREE.RepeatWrapping; b.repeat.set(rw, rh);
  return { map: t, bump: b };
}

// ---------- материалы ----------
const ENV = 0.45; // доля отражений окружения: меньше — контрастнее светотень
const mBody = (maps) => new THREE.MeshStandardMaterial({ color: 0xffffff, map: maps.map, bumpMap: maps.bump, bumpScale: 0.6, roughness: 0.5, metalness: 0.08, envMapIntensity: ENV });
const mFrame = new THREE.MeshStandardMaterial({ color: 0xe4e7e7, roughness: 0.45, metalness: 0.12, envMapIntensity: ENV });
const mCasting = new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.55, metalness: 0.35 });
const mRod = new THREE.MeshStandardMaterial({ color: 0xc9ced0, roughness: 0.3, metalness: 0.7 });
const mHandle = new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.5, metalness: 0.4 });
const mSteel = new THREE.MeshStandardMaterial({ color: 0x34383b, roughness: 0.45, metalness: 0.55 });
const mYellowSteel = new THREE.MeshStandardMaterial({ color: 0xf2b416, roughness: 0.45, metalness: 0.2 });
// крыша: продольный гофр
const roofBump = tex(canvas(1024, 64, (g, w, h) => {
  for (let y = 0; y < h; y++) { const c = Math.round(128 + Math.sin(y / h * Math.PI * 2) * 90); g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(0, y, w, 1); }
}), false);
roofBump.wrapS = roofBump.wrapT = THREE.RepeatWrapping; roofBump.repeat.set(1, 14);
const mRoof = new THREE.MeshStandardMaterial({ color: 0xe2e4e3, roughness: 0.6, metalness: 0.05, bumpMap: roofBump, bumpScale: 0.8 });

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

// ---------- контейнер ----------
function container(kind) {
  const g = new THREE.Group();
  const fm = frontMaps(kind), em = endMaps();
  const plain = new THREE.MeshStandardMaterial({ color: 0xeef0ef, roughness: 0.55, metalness: 0.05 });
  // порядок граней BoxGeometry: +x, -x, +y, -y, +z, -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, CH, D),
    [mBody(em), mBody(em), mRoof, plain, mBody(fm), plain]);
  body.position.y = CH / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  // угловые стойки, верхние и нижние брусья
  const p = 0.13;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(p, CH, p, mFrame, sx * (L / 2 - p / 2 + 0.01), CH / 2, sz * (D / 2 - p / 2 + 0.01), g);
    for (const y of [0.09, CH - 0.09]) box(0.2, 0.18, 0.2, mCasting, sx * (L / 2 - 0.09), y, sz * (D / 2 - 0.09), g);
  }
  for (const sz of [-1, 1]) {
    box(L - 0.3, 0.12, 0.12, mFrame, 0, CH - 0.06, sz * (D / 2 - 0.04), g);
    box(L - 0.3, 0.16, 0.12, mFrame, 0, 0.08, sz * (D / 2 - 0.04), g);
  }
  // замковые штанги и ручки на каждой створке
  const rodGeo = new THREE.CylinderGeometry(0.016, 0.016, CH - 0.34, 12);
  for (let i = 0; i < 6; i++) {
    const cx = -L / 2 + fm.dw * (i + 0.5);
    for (const off of [-0.17, 0.17]) {
      const r = new THREE.Mesh(rodGeo, mRod); r.position.set(cx + off, CH / 2, D / 2 + 0.035); r.castShadow = true; g.add(r);
      for (const y of [0.35, CH - 0.35]) box(0.07, 0.05, 0.05, mRod, cx + off, y, D / 2 + 0.03, g);
    }
    box(0.05, 0.3, 0.05, mHandle, cx - 0.17 + 0.05, 1.15, D / 2 + 0.07, g).rotation.z = 0.0;
    box(0.05, 0.3, 0.05, mHandle, cx + 0.17 - 0.05, 1.15, D / 2 + 0.07, g);
  }
  // кабельный ввод и шкафчик на торце у PCS
  if (kind === 'pcs') box(0.5, 0.7, 0.25, mFrame, -L / 2 - 0.12, 0.9, 0.5, g).rotation.y = Math.PI / 2;
  return g;
}

// ---------- поддон (стальная рама) ----------
const COUNT = 3, GAP = 0.5;
const ROW = COUNT * L + (COUNT - 1) * GAP;
const skid = new THREE.Group(); scene.add(skid);
const SK = 0.32;
for (const sz of [-1, 1]) box(ROW + 0.6, SK, 0.22, mSteel, 0, SK / 2, sz * (D / 2 - 0.15), skid);
for (let x = -ROW / 2 - 0.2; x <= ROW / 2 + 0.25; x += 1.25) box(0.18, SK * 0.8, D - 0.2, mSteel, x, SK * 0.4, 0, skid);
// жёлтые торцевые балки поддона — заметный акцент
for (const sx of [-1, 1]) box(0.24, SK, D + 0.1, mYellowSteel, sx * (ROW / 2 + 0.42), SK / 2, 0, skid);
box(ROW + 0.6, 0.04, D - 0.1, mSteel, 0, SK - 0.02, 0, skid);

// ---------- контейнеры ----------
const kinds = ['bat', 'pcs', 'bat'];
const lens = [L, L, L];
let x = -ROW / 2;
kinds.forEach((k, i) => {
  const c = container(k);
  c.position.set(x + lens[i] / 2, SK, 0);
  scene.add(c);
  x += lens[i] + GAP;
});

// ---------- бетонная ступень: две плиты ----------
const s1 = { w: ROW + 4.2, h: 0.42, d: D + 3.4 };
const s2 = { w: ROW + 2.2, h: 0.36, d: D + 1.6 };
const cm1 = concreteMaps(s1.w / 3, s1.d / 3), cm2 = concreteMaps(s2.w / 3, s2.d / 3);
const mC = (cm) => new THREE.MeshStandardMaterial({ color: 0xffffff, map: cm.map, bumpMap: cm.bump, bumpScale: 1.2, roughness: 0.92, metalness: 0, envMapIntensity: ENV });
const slab1 = box(s1.w, s1.h, s1.d, mC(cm1), 0, -s2.h - s1.h / 2, 0.4, scene);
const slab2 = box(s2.w, s2.h, s2.d, mC(cm2), 0, -s2.h / 2, 0.15, scene);
// фаска-тень на ребре ступени
box(s2.w + 0.01, 0.015, 0.02, new THREE.MeshStandardMaterial({ color: 0x8d8b86, roughness: 1 }), 0, -0.006, 0.15 + s2.d / 2, scene).castShadow = false;

// ---------- свет ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8b84, 0.35));
const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.position.set(-13, 13, -2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xf2f4f6, 0.9); fill.position.set(4, 7, 16); scene.add(fill);

// ---------- камера ----------
const cam = new THREE.PerspectiveCamera(+q.get('fov') || 21, W / H, 0.1, 200);
cam.position.set(+q.get('cx') || -15, +q.get('cy') || 8, +q.get('cz') || 25);
cam.lookAt(+q.get('tx') || 0.6, +q.get('ty') || 0.9, 0.6);

renderer.render(scene, cam);
// обрезаем прозрачные поля, оставляя небольшой отступ
const src = renderer.domElement;
const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
const g2 = c2.getContext('2d'); g2.drawImage(src, 0, 0);
const a = g2.getImageData(0, 0, W, H).data;
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 8) {
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const pad = Math.round(W * 0.01);
x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
document.getElementById('out').textContent = out.toDataURL(FMT, 0.9);
document.title = 'done';
