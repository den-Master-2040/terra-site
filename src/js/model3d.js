// 3D-просмотр изделий на three.js: СНЭ (src/js/3d/sne.js) и электродвигатели (src/js/3d/motors.js).
// Собирается esbuild'ом в обычный скрипт assets/js/model3d.js. Его подгружает site.js
// при первом нажатии «Смотреть в 3D», поэтому на остальных страницах three.js не скачивается.
// Модели собраны из простых тел по фото изделий: отдельных файлов моделей нет.
//
//   Model3D.show(stage, spec)  показать модель на холсте внутри stage; false, если нет WebGL
//   Model3D.open(on)           открыть двери СНЭ или разобрать двигатель
//   Model3D.reset()            вернуть исходный вид
//   Model3D.stop() / start()   остановить и возобновить отрисовку (окно закрыто / открыто)
// spec.units — блоки слева направо: { k: вид изделия, w, d, h } в метрах (у двигателей только k).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mats } from './3d/common.js';
import { SNE } from './3d/sne.js';
import { MOTORS } from './3d/motors.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DOOR_ANGLE = 1.65; // ≈ 95°
const BUILD = Object.assign({}, SNE, MOTORS);
// Направления камеры [обычный вид, вид на открытое]: СНЭ — спереди справа, двигатель — со стороны вала
const SNE_VIEW = [[.85, .5, 1.25], [.3, .42, 1.25]];
const MOTOR_VIEW = [[-.85, .45, 1.15], [-.1, .5, 1.2]];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Блоки ставятся в ряд вдоль X и опускаются на пол
function buildModel(spec, anim) {
  const root = new THREE.Group();
  const total = spec.units.reduce((s, u) => s + (u.w || 0), 0);
  let x = -total / 2;
  for (const u of spec.units) {
    const g = new THREE.Group(); g.position.x = x + (u.w || 0) / 2;
    BUILD[u.k](g, u, anim);
    g.position.y = -new THREE.Box3().setFromObject(g).min.y;
    root.add(g); x += u.w || 0;
  }
  return root;
}
// Положение подвижных частей при доле p: двери поворачиваются, детали двигателя разъезжаются
function pose(anim, p) {
  for (const x of anim) {
    if (x.d) x.o.position.copy(x.base).addScaledVector(x.d, smooth(x.w[0], x.w[1], p));
    else x.o.rotation.y = x.s * DOOR_ANGLE * p;
  }
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
  const v = { stage, renderer, scene, sun, camera, controls, model: null, anim: [], p: 0, target: 0, running: false, home: null };
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
// Модель целиком в кадре. open — вид на открытые двери или разобранный двигатель.
// glide — не прыгать, а долететь до новой точки за несколько кадров.
function fit(v, open = false, glide = false) {
  const { size, center, y0 } = open ? v.homeOpen : v.home, cam = v.camera;
  const dir = new THREE.Vector3(...v.view[open ? 1 : 0]).normalize();
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
  v.goal = glide && !reduceMotion ? pos : null;
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
  pose(V.anim, V.p);
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
    V.anim = []; V.p = V.target = 0;
    V.model = buildModel(spec, V.anim); V.scene.add(V.model);
    V.view = spec.units[0].k in MOTORS ? MOTOR_VIEW : SNE_VIEW;
    // два кадра: в исходном виде и с открытыми дверями или разобранный (детали выходят за габарит)
    V.home = frameOf(V.model);
    pose(V.anim, 1); V.homeOpen = frameOf(V.model); pose(V.anim, 0);
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
  open(open, instant = false) {
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
window.Model3D = api;
