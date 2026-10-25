// 3D-модели электродвигателей по фото из каталога: общепромышленный, для ПЧ, с тормозом,
// взрывозащищённый, высоковольтный асинхронный, синхронный и постоянного тока.
// Ось вала — X, приводной конец в −X, ось вала на y = 0 (на пол модель ставит просмотрщик).
// Детали, которые разъезжаются по кнопке «Разобрать», кладутся в anim: { o, d — смещение, w — окно 0…1 }.
import * as THREE from 'three';
import { M, ctex, box, plane } from './common.js';

/* ---------- Материалы двигателей ---------- */
const castNoise = () => {
  const t = ctex('cast', 256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + Math.random() * 20;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true, color: false });
  t.repeat.set(3, 3);
  return t;
};
const PAINT = {};
// Эмаль по чугуну заданного цвета: m — обычная, d — двусторонняя (для открытых обечаек)
function paint(color) {
  if (!PAINT[color]) {
    const m = new THREE.MeshStandardMaterial({ color, metalness: .12, roughness: .58, bumpMap: castNoise(), bumpScale: .35, envMapIntensity: .6 });
    const d = m.clone(); d.side = THREE.DoubleSide;
    PAINT[color] = { m, d };
  }
  return PAINT[color];
}
let MM = null;
function motorMats() {
  if (MM) return MM;
  const lam = ctex('lam', 8, 256, (g) => {
    g.fillStyle = '#4a535b'; g.fillRect(0, 0, 8, 256);
    g.fillStyle = '#2b3237'; for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 8, 1);
  }, { repeat: true });
  lam.repeat.set(1, 3);
  // Шильдик
  const plate = ctex('plate', 128, 80, (g, w, h) => {
    g.fillStyle = '#d9dcde'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3c4246'; g.fillRect(8, 8, w - 16, 12);
    g.fillStyle = '#7d868a'; for (let i = 0; i < 5; i++) g.fillRect(10, 28 + i * 9, 40 + (i * 23) % 60, 4);
  });
  // Решётка вентиляционных окон высоковольтных машин
  const vent = ctex('vent', 64, 64, (g, w, h) => {
    g.fillStyle = '#20262a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5a6267'; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 3, h);
  }, { repeat: true });
  MM = {
    steel: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: .9, roughness: .32, envMapIntensity: .8 }),
    darkBack: new THREE.MeshStandardMaterial({ color: 0x353c42, metalness: .7, roughness: .55, side: THREE.BackSide }),
    darkDouble: new THREE.MeshStandardMaterial({ color: 0x3b434a, metalness: .7, roughness: .5, side: THREE.DoubleSide }),
    lam: new THREE.MeshStandardMaterial({ map: lam, metalness: .7, roughness: .45 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8662e, metalness: .9, roughness: .38, envMapIntensity: .8 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb5babe, metalness: .85, roughness: .42 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c2125, metalness: .1, roughness: .7 }),
    gland: new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: .2, roughness: .45 }),
    plate: new THREE.MeshStandardMaterial({ map: plate, roughness: .35, metalness: .5 }),
    vent: new THREE.MeshStandardMaterial({ map: vent, roughness: .6, metalness: .3 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: .45 }),
  };
  return MM;
}

/* ---------- Геометрия ---------- */
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o;
}
function cylX(r1, r2, len, seg, mat, open = false) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open); g.rotateZ(Math.PI / 2);
  return mesh(g, mat);
}
function torusX(r, tube, mat, rs = 12, ts = 64) {
  const g = new THREE.TorusGeometry(r, tube, rs, ts); g.rotateY(Math.PI / 2);
  return mesh(g, mat);
}
function at(o, x = 0, y = 0, z = 0) { o.position.set(x, y, z); return o; }
function part(anim, o, d, w) { anim.push({ o, d: new THREE.Vector3(...d), base: o.position.clone(), w }); }
// Рёбра станины по окружности радиуса r, кроме сектора под лапами
function fins(group, P, len, r, n = 34, skipBottom = .62) {
  const geo = new THREE.BoxGeometry(len, .16, .05), list = [];
  for (let i = 0; i < n; i++) {
    const th = i / n * Math.PI * 2;
    if (Math.abs(th - Math.PI) < skipBottom || th < .2 || th > Math.PI * 2 - .2) continue;
    const f = mesh(geo, P); f.position.set(0, Math.cos(th) * (r + .06), Math.sin(th) * (r + .06)); f.rotation.x = th;
    group.add(f); list.push(f);
  }
  return list;
}
function feet(group, P, xs = [-.72, .72], y = -.92) {
  for (const sx of xs) {
    group.add(at(mesh(new THREE.BoxGeometry(.42, .32, 1.1), P), sx, y, 0));
    group.add(at(mesh(new THREE.BoxGeometry(.44, .12, 2.0), P), sx, y - .22, 0));
    for (const sz of [-.8, .8]) group.add(at(mesh(new THREE.CylinderGeometry(.055, .055, .13, 16), MM.black), sx, y - .18, sz));
  }
}
// Ротор с валом и «беличьей клеткой»
function cageRotor(len = 1.7, r = .55, shaft = 3.5, shaftX = -.35) {
  const rotor = new THREE.Group();
  rotor.add(at(cylX(.16, .16, shaft, 32, MM.steel), shaftX));
  rotor.add(cylX(r, r, len, 64, MM.lam));
  const bar = new THREE.BoxGeometry(len + .02, .04, .07);
  for (let i = 0; i < 26; i++) {
    const th = i / 26 * Math.PI * 2, b = mesh(bar, MM.alu);
    b.position.set(0, Math.cos(th) * (r + .005), Math.sin(th) * (r + .005)); b.rotation.x = th; rotor.add(b);
  }
  rotor.add(at(cylX(r + .05, r + .05, .09, 48, MM.alu), -len / 2 - .03), at(cylX(r + .05, r + .05, .09, 48, MM.alu), len / 2 + .03));
  rotor.add(at(mesh(new THREE.BoxGeometry(.38, .05, .08), MM.steel), shaftX - shaft / 2 + .3, .17, 0)); // шпонка
  rotor.add(at(torusX(.22, .065, MM.steel), -len / 2 - .37), at(torusX(.22, .065, MM.steel), len / 2 + .37)); // подшипники
  return rotor;
}
function statorCore(len = 1.7, ro = .9, ri = .64) {
  const s = new THREE.Group();
  s.add(cylX(ro, ro, len, 72, MM.lam, true));
  s.add(cylX(ri, ri, len, 72, MM.darkBack, true));
  for (const k of [-1, 1]) {
    const cap = mesh(new THREE.RingGeometry(ri, ro, 72), MM.darkDouble); cap.rotation.y = Math.PI / 2; cap.position.x = k * len / 2; s.add(cap);
    [[.72, .1], [.8, .085], [.76, .075]].forEach(([r, t], i) => s.add(at(torusX(r, t, MM.copper, 14, 72), k * (len / 2 + .08 + i * .05))));
  }
  return s;
}
function nameplate(group, x, y, z, ry = 0) {
  const p = plane(group, .5, .31, MM.plate, x, y, z, ry); p.castShadow = false;
}

/* ---------- Асинхронный двигатель с короткозамкнутым ротором (основа для четырёх типов) ---------- */
// o.color — цвет эмали; o.ex — взрывозащищённый; o.brake — с тормозом; o.pch — для ПЧ (независимый вентилятор)
function induction(g, anim, o) {
  motorMats();
  const P = paint(o.color).m, Pd = paint(o.color).d;
  const tail = o.brake ? .55 : 0; // на сколько тормоз удлиняет хвост

  // Станина с рёбрами и лапами
  const frame = new THREE.Group();
  frame.add(cylX(1, 1, 2.4, 72, P));
  fins(frame, P, 2.26, 1);
  feet(frame, P);
  const eye = mesh(new THREE.TorusGeometry(.11, .03, 10, 32), MM.steel); eye.position.set(-.62, 1.3, 0); frame.add(eye);
  frame.add(at(mesh(new THREE.CylinderGeometry(.035, .035, .2, 12), MM.steel), -.62, 1.12, 0));
  frame.add(at(mesh(new THREE.BoxGeometry(.56, .16, .5), P), .15, 1.04, 0));
  nameplate(frame, .3, .1, 1.075);
  g.add(frame);

  // Клеммная коробка: у взрывозащищённого — массивная, с круглой крышкой на болтах
  const tbox = new THREE.Group();
  if (o.ex) {
    tbox.add(at(mesh(new THREE.BoxGeometry(.8, .42, .74), P), .15, 1.32, 0));
    tbox.add(at(mesh(new THREE.CylinderGeometry(.4, .42, .2, 48), P), .15, 1.62, 0));
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      tbox.add(at(mesh(new THREE.CylinderGeometry(.035, .035, .05, 6), MM.steel), .15 + Math.cos(a) * .36, 1.73, Math.sin(a) * .36));
    }
    for (const dx of [-.12, .22]) {
      const gl = new THREE.CylinderGeometry(.09, .09, .22, 6); gl.rotateX(Math.PI / 2);
      tbox.add(at(mesh(gl, P), .15 + dx, 1.3, .46));
    }
    // знак Ex на крышке
    const ex = ctex('exmark', 64, 64, (c) => {
      c.fillStyle = '#f2b416'; c.beginPath(); c.moveTo(32, 4); c.lineTo(60, 32); c.lineTo(32, 60); c.lineTo(4, 32); c.closePath(); c.fill();
      c.fillStyle = '#151515'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText('Ex', 32, 40);
    });
    const m = mesh(new THREE.PlaneGeometry(.22, .22), new THREE.MeshStandardMaterial({ map: ex, transparent: true, roughness: .4 }));
    m.rotation.x = -Math.PI / 2; m.position.set(.15, 1.725, 0); tbox.add(m);
  } else {
    tbox.add(at(mesh(new THREE.BoxGeometry(.72, .3, .62), P), .15, 1.27, 0));
    const lid = new THREE.CylinderGeometry(.5, .52, .07, 8); lid.rotateY(Math.PI / 8); lid.scale(1, 1, .86);
    tbox.add(at(mesh(lid, P), .15, 1.455, 0));
    const glands = o.pch ? [-.05, .2] : [.15];
    for (const gx of glands) {
      const body = new THREE.CylinderGeometry(.075, .075, .12, 20); body.rotateX(Math.PI / 2);
      const nut = new THREE.CylinderGeometry(.095, .095, .07, 6); nut.rotateX(Math.PI / 2);
      tbox.add(at(mesh(nut, MM.gland), gx, 1.25, .345), at(mesh(body, MM.gland), gx, 1.25, .43));
    }
    for (const [dx, dz] of [[-.33, -.27], [.33, -.27], [-.33, .27], [.33, .27]])
      tbox.add(at(mesh(new THREE.CylinderGeometry(.03, .03, .04, 10), MM.steel), .15 + dx, 1.5, dz));
  }
  g.add(tbox);

  // Подшипниковые щиты
  const shieldF = new THREE.Group(), shieldR = new THREE.Group();
  const sw = o.ex ? .22 : .16;
  shieldF.add(at(cylX(1.03, 1.03, sw, 72, P), -1.28));
  shieldF.add(at(cylX(.34, .44, .24, 48, P), -1.48));
  shieldR.add(at(cylX(1.03, 1.03, sw, 72, P), 1.28));
  shieldR.add(at(cylX(.42, .34, .16, 48, P), 1.43));
  const nb = o.ex ? 8 : 4;
  for (let k = 0; k < nb; k++) {
    const a = Math.PI / nb + k * Math.PI * 2 / nb, y = Math.cos(a) * .92, z = Math.sin(a) * .92;
    shieldF.add(at(cylX(.05, .05, .08, 12, MM.steel), -1.28 - sw / 2 - .03, y, z));
    shieldR.add(at(cylX(.05, .05, .08, 12, MM.steel), 1.28 + sw / 2 + .03, y, z));
  }
  g.add(shieldF, shieldR);

  const rotor = cageRotor(); g.add(rotor);
  const stator = statorCore(); g.add(stator);

  // Тормоз: гладкий корпус за задним щитом и рычаг ручного растормаживания
  let brake = null;
  if (o.brake) {
    brake = new THREE.Group();
    brake.add(at(cylX(1.0, 1.0, tail, 72, P), 1.36 + tail / 2));
    brake.add(at(cylX(.7, .7, .06, 48, MM.alu), 1.36 + .08));
    brake.add(at(mesh(new THREE.CylinderGeometry(.04, .04, .9, 12), MM.black), 1.36 + tail / 2, 1.35, 0));
    brake.add(at(mesh(new THREE.CylinderGeometry(.07, .07, .22, 16), MM.black), 1.36 + tail / 2, 1.85, 0));
    g.add(brake);
  }

  // Вентилятор на валу (у двигателя для ПЧ свой вентилятор с отдельным мотором)
  const fan = new THREE.Group(); fan.position.x = 1.64 + tail;
  fan.add(cylX(.16, .16, .18, 24, MM.black));
  const blade = new THREE.BoxGeometry(.2, .5, .04);
  for (let i = 0; i < 9; i++) {
    const th = i / 9 * Math.PI * 2, b = mesh(blade, MM.black);
    b.position.set(0, Math.cos(th) * .43, Math.sin(th) * .43); b.rotation.x = th; fan.add(b);
  }
  g.add(fan);

  // Кожух вентилятора с решёткой
  const cover = new THREE.Group(), cx = 1.78 + tail, coverLen = o.pch ? .8 : .62;
  cover.add(at(cylX(1.0, 1.0, coverLen, 72, Pd, true), cx + (coverLen - .62) / 2));
  const gx = cx + coverLen - .32;
  for (const r of [.2, .36, .52, .68, .84, .98]) cover.add(at(torusX(r, .022, P, 8, 72), gx));
  for (let k = 0; k < 3; k++) { const s = mesh(new THREE.BoxGeometry(.04, 1.96, .05), P); s.position.x = gx; s.rotation.x = k * Math.PI / 3; cover.add(s); }
  if (o.pch) {
    // мотор независимого вентилятора на торце кожуха и его коробка
    cover.add(at(cylX(.36, .36, .55, 48, P), gx + .3));
    fins(cover, P, .5, .36, 18, 0).forEach(f => { f.position.x = gx + .3; f.scale.set(1, .6, 1); });
    cover.add(at(cylX(.3, .3, .04, 32, P), gx + .59));
    cover.add(at(mesh(new THREE.BoxGeometry(.28, .2, .24), P), gx + .32, .44, 0));
  } else cover.add(at(cylX(.11, .11, .05, 24, P), gx + .01));
  g.add(cover);

  // Вспомогательная Ex-коробка над хвостом (подогрев, датчики)
  if (o.ex) {
    const aux = new THREE.Group();
    aux.add(at(mesh(new THREE.BoxGeometry(.42, .36, .42), P), 1.3, 1.2, .05));
    aux.add(at(mesh(new THREE.CylinderGeometry(.22, .22, .1, 32), P), 1.3, 1.43, .05));
    const gl = new THREE.CylinderGeometry(.06, .06, .16, 6); gl.rotateX(Math.PI / 2);
    aux.add(at(mesh(gl, P), 1.3, 1.18, .32));
    shieldR.add(aux);
  }

  // Порядок разборки: кожух, вентилятор, тормоз, щиты, ротор, станина вверх, коробка ещё выше
  part(anim, cover, [2.4 + tail, 0, 0], [.05, .2]);
  part(anim, fan, [1.7 + tail, 0, 0], [.1, .26]);
  if (brake) part(anim, brake, [1.4, 0, 0], [.18, .34]);
  part(anim, shieldR, [1.15 + tail * .5, 0, 0], [.28, .44]);
  part(anim, shieldF, [-1.3, 0, 0], [.3, .46]);
  part(anim, rotor, [-2.7, 0, 0], [.46, .66]);
  part(anim, frame, [0, 2.1, 0], [.64, .84]);
  part(anim, tbox, [0, 2.85, 0], [.7, .92]);
  return g;
}

/* ---------- Высоковольтный асинхронный: коробчатый корпус с охладителем сверху ---------- */
function hvAsync(g, anim) {
  motorMats();
  const P = paint(0x1f4fc8).m;
  const L = 3.4, W = 2.2;
  // нижний корпус статора с лапами
  const body = new THREE.Group();
  body.add(at(mesh(new THREE.BoxGeometry(L, 1.9, W), P), 0, -.05, 0));
  for (const sz of [-1, 1]) {
    body.add(at(mesh(new THREE.BoxGeometry(L + .2, .3, .45), P), 0, -1.15, sz * (W / 2 - .05)));
    for (const x of [-1.2, 0, 1.2]) body.add(at(mesh(new THREE.BoxGeometry(.5, .5, .06), MM.darkDouble), x, -.75, sz * (W / 2 + .001)));
    for (const x of [-1.5, 1.5]) body.add(at(mesh(new THREE.TorusGeometry(.12, .035, 10, 24), MM.steel), x, .95, sz * (W / 2 - .2)));
  }
  nameplate(body, -.9, .3, W / 2 + .002);
  g.add(body);
  // охладитель «воздух — воздух» сверху, с V-образными окнами на торце
  const cooler = new THREE.Group();
  cooler.add(at(mesh(new THREE.BoxGeometry(L - .2, 1.25, W - .1), P), 0, 1.55, 0));
  cooler.add(at(mesh(new THREE.BoxGeometry(L - .1, .08, W), P), 0, .95, 0));
  for (let i = 0; i < 4; i++) {
    const v = mesh(new THREE.BoxGeometry(.02, .95, .14), MM.vent);
    v.position.set(-L / 2 + .09, 1.55, -.6 + i * .4); v.rotation.x = i % 2 ? .45 : -.45; cooler.add(v);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cooler.add(at(mesh(new THREE.TorusGeometry(.1, .03, 10, 24), MM.steel), sx * (L / 2 - .3), 2.25, sz * (W / 2 - .2)));
  g.add(cooler);
  // передний щит с рёбрами и вал
  const shieldF = new THREE.Group();
  shieldF.add(at(cylX(.85, .85, .14, 64, P), -L / 2 - .07, -.1));
  for (let i = 0; i < 24; i++) {
    const th = i / 24 * Math.PI * 2, r = mesh(new THREE.BoxGeometry(.1, .5, .04), P);
    r.position.set(-L / 2 - .17, -.1 + Math.cos(th) * .5, Math.sin(th) * .5); r.rotation.x = th; shieldF.add(r);
  }
  shieldF.add(at(cylX(.3, .36, .22, 32, P), -L / 2 - .2, -.1));
  g.add(shieldF);
  const rotor = new THREE.Group();
  rotor.add(at(cylX(.17, .17, L + 1.2, 32, MM.steel), -.4, -.1));
  rotor.add(at(cylX(.7, .7, L - .8, 64, MM.lam), .1, -.1));
  rotor.add(at(mesh(new THREE.BoxGeometry(.4, .05, .08), MM.steel), -L / 2 - .7, .08, 0));
  g.add(rotor);
  // большая клеммная коробка сбоку и коробки датчиков
  const tbox = new THREE.Group();
  tbox.add(at(mesh(new THREE.BoxGeometry(.9, 1.0, .4), P), 1.05, -.2, W / 2 + .2));
  tbox.add(at(mesh(new THREE.BoxGeometry(.95, 1.05, .05), P), 1.05, -.2, W / 2 + .42));
  tbox.add(at(mesh(new THREE.BoxGeometry(.5, .35, .5), P), 1.05, -.85, W / 2 + .2));
  for (const x of [-.55, -.2]) tbox.add(at(mesh(new THREE.BoxGeometry(.28, .3, .16), P), x, .2, W / 2 + .08));
  plane(tbox, .16, .16, M.warn, 1.3, -.45, W / 2 + .447);
  g.add(tbox);
  part(anim, cooler, [0, 1.8, 0], [.05, .3]);
  part(anim, tbox, [0, 0, 1.4], [.2, .42]);
  part(anim, shieldF, [-1.4, 0, 0], [.35, .55]);
  part(anim, rotor, [-4.2, 0, 0], [.55, .85]);
  return g;
}

/* ---------- Синхронный высоковольтный: открытый статор, явнополюсный ротор, стояковый подшипник ---------- */
function syncHV(g, anim) {
  motorMats();
  const P = paint(0x3f7f57).m, Pd = paint(0x3f7f57).d;
  const R = 2.1, len = 1.7, axisY = 0;
  // сварная рама-основание с карманами
  const base = new THREE.Group();
  base.add(at(mesh(new THREE.BoxGeometry(6.4, .7, 5), P), -.4, -R - .35, 0));
  for (const sz of [-1, 1]) for (let i = 0; i < 6; i++)
    base.add(at(mesh(new THREE.BoxGeometry(.7, .42, .04), MM.darkDouble), -3.2 + .45 + i * 1.03, -R - .38, sz * 2.502));
  g.add(base);
  // корпус статора: широкое кольцо, окна вентиляции, клеммная коробка
  const stator = new THREE.Group();
  stator.add(at(cylX(R, R, len, 96, Pd, true), .6));
  stator.add(at(cylX(R - .3, R - .3, len, 96, MM.darkBack, true), .6));
  for (const sx of [.6 - len / 2, .6 + len / 2]) {
    const ring = mesh(new THREE.RingGeometry(R - .3, R + .06, 96), Pd); ring.rotation.y = Math.PI / 2; ring.position.x = sx; stator.add(ring);
  }
  stator.add(at(torusX(R - .15, .12, P, 12, 96), .6 - len / 2));
  for (const z of [-.9, .9]) {
    const v = mesh(new THREE.BoxGeometry(len * .8, 1.2, .06), MM.vent);
    v.position.set(.6, .95, Math.sign(z) * 1.86); v.rotation.x = Math.sign(z) * -.5; stator.add(v);
  }
  stator.add(at(mesh(new THREE.BoxGeometry(len * .9, .9, .2), P), .6, -1.3, R - .02));
  stator.add(at(mesh(new THREE.BoxGeometry(.9, .7, .4), P), .9, -.2, R + .1));
  plane(stator, .2, .2, MM.red, .9, -.1, R + .302);
  // лапы статора
  for (const sz of [-1, 1]) stator.add(at(mesh(new THREE.BoxGeometry(len, .5, .7), P), .6, -R + .15, sz * 1.6));
  // обмотка статора видна в открытом торце
  for (const i of [0, 1]) stator.add(at(torusX(R - .4 - i * .12, .1, MM.copper, 12, 96), .6 - len / 2 - .08 - i * .1));
  g.add(stator);
  // явнополюсный ротор: полюса с медными катушками
  const rotor = new THREE.Group();
  rotor.add(at(cylX(.3, .3, 6.2, 32, MM.steel), -1.6));
  rotor.add(at(cylX(.95, .95, len - .1, 48, MM.lam), .6));
  const n = 16;
  for (let i = 0; i < n; i++) {
    const th = i / n * Math.PI * 2, pole = new THREE.Group();
    pole.add(at(mesh(new THREE.BoxGeometry(len - .2, .38, .3), MM.copper), 0, 1.15, 0));
    pole.add(at(mesh(new THREE.BoxGeometry(len - .1, .1, .36), MM.lam), 0, 1.4, 0));
    pole.position.x = .6; pole.rotation.x = th; rotor.add(pole);
  }
  rotor.add(at(cylX(.5, .5, .25, 32, MM.copper), -.6)); // контактные кольца возбуждения
  g.add(rotor);
  // стояковый подшипник со стороны привода
  const ped = new THREE.Group();
  ped.add(at(mesh(new THREE.BoxGeometry(.9, R - .3, 1.3), P), -2.4, -R / 2 - .15, 0));
  ped.add(at(cylX(.6, .6, .8, 48, P), -2.4));
  ped.add(at(mesh(new THREE.BoxGeometry(.9, .2, 1.6), P), -2.4, -R + .1, 0));
  ped.add(at(mesh(new THREE.BoxGeometry(.8, .25, .9), P), -2.4, .55, 0));
  g.add(ped);
  part(anim, ped, [-1.6, 0, 0], [.05, .3]);
  part(anim, rotor, [-5.2, 0, 0], [.3, .7]);
  part(anim, stator, [0, 2.6, 0], [.6, .92]);
  return g;
}

/* ---------- Постоянного тока: гранёный корпус, вентилятор-«улитка» сверху ---------- */
function dcMotor(g, anim) {
  motorMats();
  const P = paint(0x2e63b8).m;
  const len = 2.6, R = 1.15;
  const frame = new THREE.Group();
  const oct = new THREE.CylinderGeometry(R, R, len, 8, 1, true); oct.rotateY(Math.PI / 8); oct.rotateZ(Math.PI / 2);
  const shell = mesh(oct, paint(0x2e63b8).d); frame.add(shell);
  for (const sz of [-1, 1]) {
    frame.add(at(mesh(new THREE.BoxGeometry(len - .2, .35, .5), P), 0, -R + .05, sz * .7));
    frame.add(at(mesh(new THREE.BoxGeometry(len, .12, .7), P), 0, -R - .15, sz * .75));
  }
  frame.add(at(mesh(new THREE.TorusGeometry(.13, .035, 10, 24), MM.steel), -len / 2 + .3, R + .12, 0));
  nameplate(frame, -.2, .45, R * .924 + .01);
  // окна щёточного узла на боковых гранях у переднего торца
  for (const k of [-1, 1]) plane(frame, .55, .7, MM.vent, -len / 2 + .4, -.05, k * (R * .924 + .004), k < 0 ? Math.PI : 0);
  g.add(frame);
  // торцевые щиты (восьмигранные)
  const shield = (x) => {
    const s = new THREE.Group();
    const geo = new THREE.CylinderGeometry(R, R, .16, 8); geo.rotateY(Math.PI / 8); geo.rotateZ(Math.PI / 2);
    s.add(at(mesh(geo, P), x));
    s.add(at(cylX(.38, .46, .25, 32, P), x + Math.sign(x) * .2));
    return s;
  };
  const shieldF = shield(-len / 2 - .08), shieldR = shield(len / 2 + .08);
  g.add(shieldF, shieldR);
  // якорь с коллектором
  const arm = new THREE.Group();
  arm.add(at(cylX(.17, .17, len + 1.6, 32, MM.steel), -.5));
  arm.add(at(cylX(.72, .72, len * .55, 64, MM.lam), .25));
  arm.add(at(cylX(.48, .48, .5, 48, MM.copper), -len * .3));
  for (let i = 0; i < 30; i++) {
    const th = i / 30 * Math.PI * 2, b = mesh(new THREE.BoxGeometry(.5, .02, .04), MM.black);
    b.position.set(-len * .3, Math.cos(th) * .48, Math.sin(th) * .48); b.rotation.x = th; arm.add(b);
  }
  arm.add(at(mesh(new THREE.BoxGeometry(.4, .05, .08), MM.steel), -len / 2 - .9, .17, 0));
  g.add(arm);
  // полюса возбуждения внутри корпуса
  const poles = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group(); p.add(at(mesh(new THREE.BoxGeometry(len * .55, .25, .5), MM.copper), .25, .9, 0)); p.rotation.x = Math.PI / 4 + i * Math.PI / 2; poles.add(p);
  }
  g.add(poles);
  // вентилятор: улитка, патрубок вниз в корпус, мотор вентилятора сбоку
  const blower = new THREE.Group();
  const scroll = new THREE.CylinderGeometry(.72, .72, .6, 48); scroll.rotateX(Math.PI / 2);
  blower.add(at(mesh(scroll, P), .5, R + .9, 0));
  blower.add(at(mesh(new THREE.BoxGeometry(.7, .55, .6), P), .95, R + .45, 0));
  blower.add(at(mesh(new THREE.BoxGeometry(.9, .1, .8), P), .9, R + .15, 0));
  const fm = new THREE.CylinderGeometry(.34, .34, .6, 32); fm.rotateX(Math.PI / 2);
  blower.add(at(mesh(fm, P), .5, R + .9, -.6));
  const fc = new THREE.CylinderGeometry(.36, .36, .2, 32); fc.rotateX(Math.PI / 2);
  blower.add(at(mesh(fc, MM.vent), .5, R + .9, -1.0));
  g.add(blower);
  // клеммная коробка сбоку
  const tbox = new THREE.Group();
  tbox.add(at(mesh(new THREE.BoxGeometry(.8, .7, .35), P), .65, -.25, R * .924 + .15));
  tbox.add(at(mesh(new THREE.BoxGeometry(.3, .3, .2), P), .65, -.25, R * .924 + .42));
  g.add(tbox);
  part(anim, blower, [0, 2.2, 0], [.05, .3]);
  part(anim, tbox, [0, 0, 1.4], [.2, .4]);
  part(anim, shieldR, [1.4, 0, 0], [.3, .5]);
  part(anim, shieldF, [-1.4, 0, 0], [.32, .52]);
  part(anim, arm, [-3.6, 0, 0], [.5, .8]);
  part(anim, frame, [0, 2.6, 0], [.7, .95]);
  return g;
}

const BLUE = 0x1a3fb8;
export const MOTORS = {
  'motor-general': (g, u, anim) => induction(g, anim, { color: BLUE }),
  'motor-pch': (g, u, anim) => induction(g, anim, { color: BLUE, pch: true }),
  'motor-ex': (g, u, anim) => induction(g, anim, { color: 0x1d4fb0, ex: true }),
  'motor-brake': (g, u, anim) => induction(g, anim, { color: 0x34393d, brake: true }),
  'motor-hv': (g, u, anim) => hvAsync(g, anim),
  'motor-sync': (g, u, anim) => syncHV(g, anim),
  'motor-dc': (g, u, anim) => dcMotor(g, anim),
};
