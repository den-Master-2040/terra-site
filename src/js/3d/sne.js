// 3D-модели СНЭ: шкафы СНТЭ, БАВРТЭ, контейнеры СНТЭ и НТЭ.
// Собраны из простых тел по фото изделий; пропорции — из габаритов в таблицах (spec.units).
// Каждая функция получает группу g, блок u {w, d, h} в метрах и список anim, куда кладёт двери.
import * as THREE from 'three';
import { M, box, plane, cyl } from './common.js';

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


export const SNE = { 'cab-air': cabAir, 'cab-liquid': cabLiquid, pcs: pcsCabinet, bavr, container, 'nte-air': nteAir, 'nte-liquid': nteLiquid };
