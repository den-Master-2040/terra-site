// 3D-модель асинхронного двигателя на three.js.
// Собирается esbuild'ом в обычный (не модульный) скрипт assets/js/motor.js,
// поэтому работает и с сервера, и при открытии файла с диска (file://).
//
// Разметка:  <div class="gl" data-motor="hero|explode|poster-assembled|poster-exploded">
//              <img class="gl-poster" ...>   картинка до первого кадра и без WebGL
//              <canvas></canvas>
//            </div>
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => 1 - Math.pow(1 - t, 3);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* ---------- Текстуры ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
// Зернистость литья под эмалью
function castNoise() {
  return canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + Math.random() * 20;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [3, 3]);
}
// Шихтовка статора и ротора
function lamination() {
  const t = canvasTex(8, 256, (g) => {
    g.fillStyle = '#4a535b'; g.fillRect(0, 0, 8, 256);
    g.fillStyle = '#2b3237'; for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 8, 1);
  }, [1, 3]);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- Материалы ---------- */
function materials() {
  const noise = castNoise();
  // Синяя эмаль по чугуну: насыщенный цвет, полуматовая, слабые отражения
  const paint = new THREE.MeshStandardMaterial({
    color: 0x1a3fb8, metalness: .1, roughness: .62,
    bumpMap: noise, bumpScale: .35, envMapIntensity: .55,
  });
  const paintDouble = paint.clone(); paintDouble.side = THREE.DoubleSide;
  return {
    paint, paintDouble,
    steel: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: .9, roughness: .32, envMapIntensity: .8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3b434a, metalness: .7, roughness: .5 }),
    darkBack: new THREE.MeshStandardMaterial({ color: 0x353c42, metalness: .7, roughness: .55, side: THREE.BackSide }),
    darkDouble: new THREE.MeshStandardMaterial({ color: 0x3b434a, metalness: .7, roughness: .5, side: THREE.DoubleSide }),
    lam: new THREE.MeshStandardMaterial({ map: lamination(), metalness: .7, roughness: .45 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8662e, metalness: .9, roughness: .38, envMapIntensity: .8 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb5babe, metalness: .85, roughness: .42 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c2125, metalness: .1, roughness: .7 }),
    gland: new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: .2, roughness: .45 }),
  };
}

/* ---------- Геометрия (ось вала — X, приводной конец в -X) ---------- */
function cylX(r1, r2, len, seg, mat, open = false) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open); g.rotateZ(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}
function torusX(r, tube, mat, rs = 12, ts = 64) {
  const g = new THREE.TorusGeometry(r, tube, rs, ts); g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}
function at(mesh, x = 0, y = 0, z = 0) { mesh.position.set(x, y, z); return mesh; }

function buildMotor(M) {
  const root = new THREE.Group();

  // Станина
  const frame = new THREE.Group();
  frame.add(cylX(1, 1, 2.4, 72, M.paint));
  const finGeo = new THREE.BoxGeometry(2.26, .16, .05);
  const nFins = 34;
  for (let i = 0; i < nFins; i++) {
    const th = i / nFins * Math.PI * 2;
    if (Math.abs(th - Math.PI) < .62) continue;
    if (th < .2 || th > Math.PI * 2 - .2) continue;
    const fin = new THREE.Mesh(finGeo, M.paint);
    fin.position.set(0, Math.cos(th) * 1.06, Math.sin(th) * 1.06);
    fin.rotation.x = th;
    frame.add(fin);
  }
  for (const sx of [-.72, .72]) {
    frame.add(at(new THREE.Mesh(new THREE.BoxGeometry(.42, .32, 1.1), M.paint), sx, -.92, 0));
    frame.add(at(new THREE.Mesh(new THREE.BoxGeometry(.44, .12, 2.0), M.paint), sx, -1.14, 0));
    for (const sz of [-.8, .8]) frame.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .13, 16), M.black), sx, -1.1, sz));
  }
  const eye = new THREE.Mesh(new THREE.TorusGeometry(.11, .03, 10, 32), M.steel); eye.position.set(-.62, 1.3, 0); frame.add(eye);
  frame.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .2, 12), M.steel), -.62, 1.12, 0));
  frame.add(at(new THREE.Mesh(new THREE.BoxGeometry(.56, .16, .5), M.paint), .15, 1.04, 0));

  // Клеммная коробка: корпус, крышка с фасками, сальник сбоку
  const tbox = new THREE.Group();
  tbox.add(at(new THREE.Mesh(new THREE.BoxGeometry(.72, .3, .62), M.paint), .15, 1.27, 0));
  const lidGeo = new THREE.CylinderGeometry(.5, .52, .07, 8); lidGeo.rotateY(Math.PI / 8); lidGeo.scale(1, 1, .86);
  tbox.add(at(new THREE.Mesh(lidGeo, M.paint), .15, 1.455, 0));
  const glandBody = new THREE.CylinderGeometry(.075, .075, .12, 20); glandBody.rotateX(Math.PI / 2);
  const glandNut = new THREE.CylinderGeometry(.095, .095, .07, 6); glandNut.rotateX(Math.PI / 2);
  tbox.add(at(new THREE.Mesh(glandNut, M.gland), .15, 1.25, .345));
  tbox.add(at(new THREE.Mesh(glandBody, M.gland), .15, 1.25, .43));
  for (const [dx, dz] of [[-.33, -.27], [.33, -.27], [-.33, .27], [.33, .27]])
    tbox.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .04, 10), M.steel), .15 + dx, 1.5, dz));
  frame.add(tbox);
  root.add(frame);

  // Подшипниковые щиты
  const shieldF = new THREE.Group();
  shieldF.add(at(cylX(1.03, 1.03, .16, 72, M.paint), -1.28));
  shieldF.add(at(cylX(.34, .44, .24, 48, M.paint), -1.48));
  const shieldR = new THREE.Group();
  shieldR.add(at(cylX(1.03, 1.03, .16, 72, M.paint), 1.28));
  shieldR.add(at(cylX(.42, .34, .16, 48, M.paint), 1.43));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, y = Math.cos(a) * .9, z = Math.sin(a) * .9;
    shieldF.add(at(cylX(.05, .05, .08, 12, M.steel), -1.38, y, z));
    shieldR.add(at(cylX(.05, .05, .08, 12, M.steel), 1.38, y, z));
  }
  root.add(shieldF, shieldR);

  // Ротор с валом
  const rotor = new THREE.Group();
  rotor.add(at(cylX(.16, .16, 3.5, 32, M.steel), -.35));
  rotor.add(cylX(.55, .55, 1.7, 64, M.lam));
  const barGeo = new THREE.BoxGeometry(1.72, .04, .07);
  for (let i = 0; i < 26; i++) {
    const th = i / 26 * Math.PI * 2;
    const bar = new THREE.Mesh(barGeo, M.alu);
    bar.position.set(0, Math.cos(th) * .555, Math.sin(th) * .555); bar.rotation.x = th;
    rotor.add(bar);
  }
  rotor.add(at(cylX(.6, .6, .09, 48, M.alu), -.88), at(cylX(.6, .6, .09, 48, M.alu), .88));
  rotor.add(at(new THREE.Mesh(new THREE.BoxGeometry(.38, .05, .08), M.steel), -1.85, .17, 0));
  rotor.add(at(torusX(.22, .065, M.steel), -1.22), at(torusX(.22, .065, M.steel), 1.22));
  root.add(rotor);

  // Статор с обмоткой
  const stator = new THREE.Group();
  stator.add(cylX(.9, .9, 1.7, 72, M.lam, true));
  stator.add(cylX(.64, .64, 1.7, 72, M.darkBack, true));
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.RingGeometry(.64, .9, 72), M.darkDouble);
    cap.rotation.y = Math.PI / 2; cap.position.x = s * .85; stator.add(cap);
    [[.72, .1], [.8, .085], [.76, .075]].forEach(([r, t], i) => stator.add(at(torusX(r, t, M.copper, 14, 72), s * (.93 + i * .05))));
  }
  root.add(stator);

  // Вентилятор
  const fan = new THREE.Group(); fan.position.x = 1.64;
  fan.add(cylX(.16, .16, .18, 24, M.black));
  const bladeGeo = new THREE.BoxGeometry(.2, .5, .04);
  for (let i = 0; i < 9; i++) {
    const th = i / 9 * Math.PI * 2;
    const b = new THREE.Mesh(bladeGeo, M.black);
    b.position.set(0, Math.cos(th) * .43, Math.sin(th) * .43); b.rotation.x = th;
    fan.add(b);
  }
  root.add(fan);

  // Кожух вентилятора с решёткой
  const cover = new THREE.Group();
  cover.add(at(cylX(1.0, 1.0, .62, 72, M.paintDouble, true), 1.78));
  for (const r of [.2, .36, .52, .68, .84, .98]) cover.add(at(torusX(r, .022, M.paint, 8, 72), 2.08));
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.96, .05), M.paint); s.position.x = 2.08; s.rotation.x = k * Math.PI / 3; cover.add(s); }
  cover.add(at(cylX(.11, .11, .05, 24, M.paint), 2.09));
  root.add(cover);

  // Порядок разборки: объект, смещение, окно прогресса 0..1
  const parts = [
    { o: cover,   d: new THREE.Vector3(2.4, 0, 0),  w: [.17, .27] },
    { o: fan,     d: new THREE.Vector3(1.7, 0, 0),  w: [.20, .31] },
    { o: shieldR, d: new THREE.Vector3(1.15, 0, 0), w: [.34, .45] },
    { o: shieldF, d: new THREE.Vector3(-1.3, 0, 0), w: [.36, .47] },
    { o: rotor,   d: new THREE.Vector3(-2.7, 0, 0), w: [.50, .62] },
    { o: frame,   d: new THREE.Vector3(0, 2.1, 0),  w: [.67, .78] },
    { o: tbox,    d: new THREE.Vector3(0, .75, 0),  w: [.84, .94] },
  ];
  parts.forEach(p => { p.base = p.o.position.clone(); });
  return { root, parts, rotor, fan };
}

function shadowMesh() {
  const tex = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,.4)'); grd.addColorStop(.55, 'rgba(0,0,0,.15)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = -1.22; m.scale.set(5, 2.5, 1);
  return m;
}

/* ---------- Просмотрщик ---------- */
function createViewer(host, opts = {}) {
  const canvas = host.querySelector('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve });
  } catch (e) { return null; }
  renderer.setPixelRatio(opts.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), .04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-4, 7, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe7ff, .5); fill.position.set(5, 2, -5); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
  const motor = buildMotor(materials());
  const pivot = new THREE.Group(); pivot.add(motor.root); scene.add(pivot);
  const shadow = shadowMesh(); scene.add(shadow);

  const view = new THREE.Vector3(-.5, .38, 1).normalize();
  const target = new THREE.Vector3();
  const state = { visible: true, ready: false };

  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host); else addEventListener('resize', resize);
  resize();
  if (window.IntersectionObserver)
    new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(host);

  function setProgress(p, yOffset = 0) {
    for (const part of motor.parts) {
      const k = smooth(part.w[0], part.w[1], p);
      part.o.position.copy(part.base).addScaledVector(part.d, k);
    }
    const e = smooth(.12, .9, p);
    const halfW = lerp(2.35, 4.7, e), halfH = lerp(1.45, 3.3, e);
    target.set(lerp(0, -.1, e), lerp(.1, 1.65, e) + yOffset, 0);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(halfH / t, halfW / (t * camera.aspect)) + 1.4;
    camera.position.copy(target).addScaledVector(view, dist);
    camera.lookAt(target);
    shadow.scale.set(lerp(5, 9.5, e), lerp(2.5, 3.8, e), 1);
  }
  function render() {
    renderer.render(scene, camera);
    if (!state.ready) { state.ready = true; host.classList.add('gl-ready'); }
  }
  return { renderer, pivot, motor, setProgress, render, state };
}

/* ---------- Режимы ---------- */
const loops = [];

function initHero(host) {
  const v = createViewer(host); if (!v) return;
  let angle = -.35, vel = 0, dragging = false, lastX = 0;
  const start = performance.now();
  const c = v.renderer.domElement;
  c.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; vel = 0; try { c.setPointerCapture(e.pointerId); } catch (_) {} });
  c.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; angle += dx * .008; vel = dx * .008; });
  const end = () => { dragging = false; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  loops.push(now => {
    if (!v.state.visible) return;
    const t = reduceMotion ? 1 : clamp((now - start - 200) / 1900, 0, 1);
    v.setProgress(.96 * (1 - ease(t)), -.3);
    if (!dragging) { vel *= .94; angle += vel + (reduceMotion ? 0 : .0022); }
    v.pivot.rotation.y = angle;
    if (!reduceMotion) { v.motor.rotor.rotation.x += .03; v.motor.fan.rotation.x += .03; }
    v.render();
  });
}

function initExplode(host) {
  const v = createViewer(host); if (!v) return;
  const section = host.closest('[data-explode]') || document;
  const stepsEl = section.querySelector('.steps');
  const stepEls = [...section.querySelectorAll('.step')];
  const meter = [...section.querySelectorAll('.stage-meter span')];
  let target = 0, p = 0, active = 0;
  const read = () => {
    if (!stepsEl) return;
    const r = stepsEl.getBoundingClientRect();
    const anchor = innerHeight * (matchMedia('(max-width: 860px)').matches ? .75 : .55);
    target = clamp((anchor - r.top) / r.height, 0, 1);
    const idx = Math.min(stepEls.length - 1, Math.floor(target * stepEls.length));
    if (idx !== active) {
      active = idx;
      stepEls.forEach((el, i) => el.classList.toggle('is-active', i === idx));
      meter.forEach((m, i) => m.classList.toggle('on', i <= idx));
    }
  };
  addEventListener('scroll', read, { passive: true }); addEventListener('resize', read); read();
  loops.push(() => {
    if (!v.state.visible) return;
    p = reduceMotion ? target : lerp(p, target, .09);
    v.setProgress(p);
    v.pivot.rotation.y = -.25 + p * .55;
    v.render();
  });
}

// Статичный кадр для генерации картинок-заглушек (используется при сборке)
function initPoster(host, progress) {
  const v = createViewer(host, { preserve: true, pixelRatio: 2 }); if (!v) return;
  v.setProgress(progress, progress > .5 ? 0 : -.05);
  v.pivot.rotation.y = progress > .5 ? .3 : -.35;
  v.render();
  host.dataset.rendered = '1';
}

function boot() {
  const hosts = document.querySelectorAll('[data-motor]');
  if (!hosts.length) return;
  if (!webglAvailable()) { document.documentElement.classList.add('no-webgl'); return; }
  hosts.forEach(h => {
    const mode = h.dataset.motor;
    if (mode === 'hero') initHero(h);
    else if (mode === 'explode') initExplode(h);
    else if (mode === 'poster-assembled') initPoster(h, 0);
    else if (mode === 'poster-exploded') initPoster(h, 1);
  });
  if (loops.length) {
    const tick = now => { for (const f of loops) f(now); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
