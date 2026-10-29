// 帶麻吉去公園：小遊戲本體
// 主人（白色小人）牽著麻吉走到 1000 公尺外的公園，路上閃過汽車、機車、野狗、樹、盆栽
// 主人自己可以往前後左右走；麻吉不聽指揮，會突然往左右衝、往前暴衝、往回跑或停住不動（頭上先冒出符號預告）
// 兩人之間是一條軟軟的牽繩：繩子拉緊時麻吉會拖著主人走，主人也可以拉繩子把麻吉拉回來（麻吉停住不動時拉不動）；
// 主人走得比麻吉快，可以靠近一點讓繩子鬆開，但跟麻吉撞在一起也算撞到
// 主人或麻吉撞到障礙物、或兩個撞在一起，就少一條命（一共 5 條），撞到後有一下下不會再被撞；❤️ 補一條命、
// ⭐ 一陣子無敵，而且往前的速度變 2 倍：鏡頭拉廣、畫面出現集中線與迎面飛來的風切線，音樂也跟著加快
// 流程：標題（麻吉特寫）→ 教學（第一次玩）→ 倒數 → 出發 → 抵達公園／命用完 → 再走一次或離開

import * as THREE from './three.js';
import { createStreet, WALK_HALF } from './street.js';
import { createObstacles } from './obstacles.js';
import { createDog, createOwner, createLeash } from './characters.js';
import { createInput } from './input.js';
import { createWind } from './wind.js';
import { music, sfx } from './music.js';
import { haptic } from '../fx/haptics.js';
import { isTouch } from '../device.js';
import { load, save, seen, markSeen } from '../storage.js';
import { rand } from './kit.js';
import { increment, recordMax } from '../achievements/progress.js';
import { WALK_SHORT_METERS, WALK_TINY_METERS } from '../achievements/list.js';

const GOAL = 1000;            // 公園在幾公尺外
const LIVES = 5;
const LEASH = 3.2;            // 牽繩長度（公尺）
const BODY_R = 0.3;           // 人和狗的碰撞半徑
const BUMP = 0.62;            // 主人和麻吉靠這麼近就算撞在一起
const EDGE = WALK_HALF - 0.3;
const INVULN = 1.6;           // 撞到之後幾秒內不會再被撞
const STAR_TIME = 7;
const BOOST = 2;              // 吃到星星時往前的速度是平常的幾倍（左右閃避不變）
const BOOST_EASE = 4;         // 加速、減速的快慢：越大越快到達目標速度（約 1 / BOOST_EASE 秒）
const BOOST_FOV = 14;         // 全速時鏡頭視角多拉廣幾度，看起來更快
const STAR_GRACE = 1;         // 星星結束後還有幾秒不會被撞（剛從高速慢下來，來不及閃）
const TELEGRAPH = 0.7;        // 麻吉發作前幾秒先冒出符號
const SKY = 0xbfe2f4;
const STEP = 1 / 60;
const TUTORIAL_KEY = 'maji-walk-tutorial';
const BEST_KEY = 'maji-walk-best';

// 麻吉的脾氣：give 是拉牽繩時麻吉被拉動的比例（0 完全拉不動）
const MOODS = {
  trot: { give: 0.35 },
  sit: { give: 0 },
  left: { give: 0.3, icon: '←', label: '麻吉往左衝！', dur: [0.7, 1.2] },
  right: { give: 0.3, icon: '→', label: '麻吉往右衝！', dur: [0.7, 1.2] },
  dash: { give: 0.12, icon: '!!', label: '麻吉暴衝！', dur: [0.8, 1.3] },
  back: { give: 0.25, icon: '↩', label: '麻吉往回跑！', dur: [0.6, 1.0] },
  freeze: { give: 0, icon: '…', label: '麻吉不走了⋯⋯', dur: [1.0, 1.8] },
  happy: { give: 0 },
};

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.5 2.3 4 6.4 4c2.3 0 3.9 1.3 5.6 3.3C13.7 5.3 15.3 4 17.6 4c4.1 0 6 4.5 4.4 7.7C19.5 16.4 12 21 12 21z"/></svg>';

const TEMPLATE = `
  <div class="mw-stage"></div>
  <div class="mw-speed" aria-hidden="true"></div>
  <div class="mw-hud" hidden>
    <div class="mw-lives"></div>
    <div class="mw-meter">
      <div class="mw-bar"><i class="mw-fill"></i><b class="mw-runner">🐕</b><b class="mw-goal">🌳</b></div>
      <span class="mw-dist">0</span>
    </div>
    <div class="mw-star" hidden>⭐ 無敵衝刺 <span></span></div>
  </div>
  <div class="mw-top">
    <button type="button" class="mw-icon-btn mw-pause" aria-label="暫停" hidden>❚❚</button>
    <button type="button" class="mw-icon-btn mw-close" aria-label="離開小遊戲">✕</button>
  </div>
  <div class="mw-bubble" aria-hidden="true"></div>
  <div class="mw-toast" aria-live="polite"></div>
  <div class="mw-joy"><span></span></div>
  <div class="mw-coach" aria-hidden="true"><span></span></div>
  <div class="mw-tip" hidden>
    <p class="mw-tip-step"></p>
    <p class="mw-tip-text"></p>
    <button type="button" class="mw-skip">略過教學</button>
  </div>
  <div class="mw-count" aria-live="assertive"></div>
  <div class="mw-panel" hidden></div>
`;

export function createGame(root, { onClose } = {}) {
  root.insertAdjacentHTML('beforeend', TEMPLATE);
  const $ = (sel) => root.querySelector(sel);
  const stage = $('.mw-stage');
  const hud = $('.mw-hud');
  const livesEl = $('.mw-lives');
  const fill = $('.mw-fill');
  const runner = $('.mw-runner');
  const distEl = $('.mw-dist');
  const starEl = $('.mw-star');
  const pauseBtn = $('.mw-pause');
  const bubble = $('.mw-bubble');
  const toastEl = $('.mw-toast');
  const coach = $('.mw-coach');
  const tip = $('.mw-tip');
  const countEl = $('.mw-count');
  const panel = $('.mw-panel');

  livesEl.innerHTML = Array.from({ length: LIVES }, () => `<i>${HEART_SVG}</i>`).join('');

  // ---------- three.js 場景 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  stage.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 42, 108);
  scene.add(new THREE.HemisphereLight(0xf4f8ff, 0xb3a389, 1.75));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.position.set(-4, 8, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 150);

  const street = createStreet(scene);
  const wind = createWind(scene);
  const obstacles = createObstacles(scene, { onHonk: () => sfx.honk() });
  const maji = createDog();
  const person = createOwner();
  const leash = createLeash(LEASH);
  scene.add(maji.root, person.root, leash.mesh);
  // 整個畫面（提示卡上也可以）都能按住拖曳
  const input = createInput(root, $('.mw-joy'));

  let baseFov = 60;
  const resize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = camera.aspect < 1 ? 66 : 52;
    camera.fov = baseFov + (boost - 1) / (BOOST - 1) * BOOST_FOV;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);

  // ---------- 遊戲狀態 ----------
  let state = 'closed';     // title | tutorial | countdown | play | paused | over | win
  let pausedFrom = null;
  const owner = { x: 0.8, d: 0, vx: 0, vd: 0, lean: 0, yaw: 0, pull: 0 };
  const dog = { x: 0, d: 2.4, vx: 0, vd: 0, yaw: 0, mood: 'sit', t: Infinity, pending: null, wander: 0 };
  let lives = LIVES;
  let hits = 0;             // 這一局撞到幾次（無敵時撞到的不算）
  let invuln = 0;
  let starT = 0;
  let boost = 1;           // 目前的速度倍率：吃到星星時慢慢加到 BOOST，結束後慢慢回到 1
  let boosting = false;
  let raceStart = 0;
  let parkD = Infinity;
  let maxD = 0;
  let elapsed = 0;
  let time = 0;
  let trafficT = 0;
  let shake = 0;
  let base = 4;            // 麻吉平常的速度，越走越快
  let progress = 0;
  let camMode = 'portrait';
  let lesson = null;       // 教學進行中的步驟
  let timers = [];

  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- 畫面上的提示 ----------

  const project = (obj, out = new THREE.Vector3()) => {
    obj.getWorldPosition(out).project(camera);
    return { x: (out.x * 0.5 + 0.5) * stage.clientWidth, y: (-out.y * 0.5 + 0.5) * stage.clientHeight };
  };

  const popup = (text, target, cls = '') => {
    const p = project(target);
    const el = document.createElement('div');
    el.className = `mw-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    root.append(el);
    el.addEventListener('animationend', () => el.remove());
  };

  let toastTimer = 0;
  const toast = (text) => {
    toastEl.textContent = text;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1100);
  };

  const renderLives = () => {
    [...livesEl.children].forEach((el, i) => el.classList.toggle('empty', i >= lives));
  };

  const renderProgress = () => {
    const m = Math.max(0, Math.min(GOAL, owner.d - raceStart));
    const pct = (m / GOAL) * 100;
    fill.style.width = `${pct}%`;
    runner.style.left = `${pct}%`;
    distEl.innerHTML = `${Math.floor(m)}<small> / ${GOAL} m</small>`;
    starEl.hidden = starT <= 0;
    if (starT > 0) starEl.lastElementChild.textContent = Math.ceil(starT);
  };

  const showPanel = ({ eyebrow, title, body, buttons }) => {
    panel.innerHTML = `
      <p class="mw-eyebrow">${eyebrow}</p>
      <h2 class="mw-title">${title}</h2>
      <div class="mw-body">${body}</div>
      <div class="mw-actions"></div>`;
    const actions = panel.querySelector('.mw-actions');
    buttons.forEach(({ label, primary, onClick }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = primary ? 'mw-btn primary' : 'mw-btn';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actions.append(btn);
    });
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('show'));
    actions.firstElementChild?.focus({ preventScroll: true });
  };
  const hidePanel = () => {
    panel.classList.remove('show');
    panel.hidden = true;
  };

  // ---------- 麻吉的脾氣 ----------

  const setMood = (mood, duration = Infinity) => {
    dog.mood = mood;
    dog.t = duration;
    dog.pending = null;
  };

  // 預告：頭上冒出符號，暴衝前還會汪汪叫
  const warn = (mood) => {
    dog.pending = mood;
    if (mood === 'dash') sfx.bark();
    else if (mood !== 'freeze') sfx.bark(1);
  };

  const chooseMood = () => {
    const w = {
      left: dog.x < -2.5 ? 0.25 : 1,
      right: dog.x > 2.5 ? 0.25 : 1,
      dash: 1.1,
      back: 0.6,
      freeze: 0.8,
    };
    let r = Math.random() * Object.values(w).reduce((s, v) => s + v, 0);
    for (const [mood, v] of Object.entries(w)) if ((r -= v) < 0) return mood;
    return 'dash';
  };

  // 正式出發時麻吉自己決定什麼時候發作
  const moodAI = (dt) => {
    dog.t -= dt;
    if (dog.mood !== 'trot') {
      if (dog.t <= 0) setMood('trot', rand(3.4, 5) - progress * 2);
      return;
    }
    if (!dog.pending && dog.t <= TELEGRAPH) warn(chooseMood());
    if (dog.t <= 0 && dog.pending) {
      const mood = dog.pending;
      setMood(mood, rand(...MOODS[mood].dur));
      toast(MOODS[mood].label);
    }
  };

  // 麻吉想走的速度
  const dogWants = () => {
    const pace = base * boost;
    switch (dog.mood) {
      case 'trot': return { x: Math.sin(time * 1.1 + dog.wander) * 0.9 - dog.x * 0.12, d: pace };
      case 'left': return { x: -4.6, d: pace * 0.55 };
      case 'right': return { x: 4.6, d: pace * 0.55 };
      case 'dash': return { x: Math.sin(time * 2) * 0.5, d: pace + 5.5 };
      case 'back': return { x: 0, d: -5.5 };
      default: return { x: 0, d: 0 };
    }
  };

  // ---------- 物理：兩個人各走各的，再用牽繩把距離拉回繩長 ----------

  const physics = (dt, move) => {
    // 主人全速往前比麻吉快一點：可以追上去讓繩子鬆開，但追太近會撞到麻吉
    const forward = (base + 1.4) * boost;
    owner.vx = move.x * 5.5;
    owner.vd = move.y >= 0 ? move.y * forward : move.y * 4.2;
    owner.x += owner.vx * dt;
    owner.d += owner.vd * dt;

    const want = dogWants();
    const k = Math.min(1, dt * 7);
    dog.vx += (want.x - dog.vx) * k;
    dog.vd += (want.d - dog.vd) * k;
    const px = dog.x;
    const pd = dog.d;
    dog.x += dog.vx * dt;
    dog.d += dog.vd * dt;

    let pulled = 0;
    const dx = dog.x - owner.x;
    const dd = dog.d - owner.d;
    const dist = Math.hypot(dx, dd);
    if (dist > LEASH) {
      const excess = dist - LEASH;
      const give = MOODS[dog.mood].give;
      const nx = dx / dist;
      const nd = dd / dist;
      dog.x -= nx * excess * give;
      dog.d -= nd * excess * give;
      owner.x += nx * excess * (1 - give);
      owner.d += nd * excess * (1 - give);
      pulled = (excess * (1 - give)) / dt;
    }
    // 撞在一起：兩個各被彈開一半（麻吉停住不動時只有主人被彈開）
    const bx = dog.x - owner.x;
    const bd = dog.d - owner.d;
    const near = Math.hypot(bx, bd);
    owner.bumped = near < BUMP;
    if (owner.bumped) {
      const nx = near > 1e-4 ? bx / near : 1;
      const nd = near > 1e-4 ? bd / near : 0;
      const push = BUMP + 0.08 - near;
      const give = MOODS[dog.mood].give > 0 ? 0.5 : 0;
      dog.x += nx * push * give;
      dog.d += nd * push * give;
      owner.x -= nx * push * (1 - give);
      owner.d -= nd * push * (1 - give);
    }
    owner.x = Math.max(-EDGE, Math.min(EDGE, owner.x));
    dog.x = Math.max(-EDGE, Math.min(EDGE, dog.x));
    owner.pull += (Math.min(1, pulled / 3.5) - owner.pull) * Math.min(1, dt * 6);

    // 麻吉面向實際移動的方向
    const mx = (dog.x - px) / dt;
    const md = (dog.d - pd) / dt;
    dog.speed = Math.hypot(mx, md);
    if (dog.speed > 0.6) {
      const target = Math.atan2(-mx, md);
      let diff = target - dog.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      dog.yaw += diff * Math.min(1, dt * 9);
    }
  };

  // ---------- 撞到、撿到 ----------

  const actorObj = (who) => (who === 'dog' ? maji.headTop : person.hand);

  // 扣一條命（教學時只提醒）；回傳 true 表示命用完了
  const hurt = (who, practice, label = '−1 ❤') => {
    invuln = INVULN;
    shake = 0.35;
    sfx.bonk();
    if (who === 'dog') sfx.yelp();
    haptic([30, 40, 50]);
    if (practice) {
      popup('小心！', actorObj(who), 'bad');
      return false;
    }
    lives--;
    hits++;
    renderLives();
    popup(label, actorObj(who), 'bad');
    if (lives > 0) return false;
    gameOver();
    return true;
  };

  const collide = (practice) => {
    // 主人和麻吉撞在一起
    if (owner.bumped && starT <= 0 && invuln <= 0) {
      if (hurt('dog', practice, '撞到麻吉了！−1 ❤')) return;
    }
    for (const who of ['owner', 'dog']) {
      const c = who === 'dog' ? dog : owner;
      const pickup = obstacles.takePickup(c.x, c.d, BODY_R);
      if (pickup?.type === 'heart') {
        sfx.heart();
        haptic(15);
        if (lives < LIVES) lives++;
        renderLives();
        popup('+1 ❤', actorObj(who), 'good');
      } else if (pickup?.type === 'star') {
        sfx.star();
        haptic([15, 40, 15]);
        if (starT <= 0) sfx.whoosh();
        starT = practice ? 4 : STAR_TIME;
        if (state === 'play') music.setMode('star');
        popup('無敵！', actorObj(who), 'star');
      }

      const o = obstacles.hit(c.x, c.d, BODY_R);
      if (!o) continue;
      if (starT > 0) {
        // 無敵：東西撞飛，野狗嚇得跑開
        if (o.type === 'stray') o.vx = (o.x > c.x ? 1 : -1) * 5;
        else obstacles.knock(o, c.x);
        sfx.smash();
        continue;
      }
      if (invuln > 0) continue;
      obstacles.wobble(o);
      if (hurt(who, practice)) return;
    }
  };

  // ---------- 鏡頭 ----------

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();

  const aimCamera = (dt, snap = false) => {
    if (camMode === 'portrait') {
      // 標題：從斜前方看麻吉的臉
      // 標題卡片蓋住下面三分之一，鏡頭往下看一點讓麻吉在畫面上半部
      wantPos.set(dog.x - 1.3, 1.25, -(dog.d + 3.1));
      wantLook.set(dog.x - 0.1, camera.aspect < 1 ? 0.05 : 0.4, -dog.d);
    } else if (camMode === 'orbit') {
      const a = time * 0.35;
      wantPos.set(dog.x + Math.sin(a) * 6, 3.4, -(dog.d) + Math.cos(a) * 6);
      wantLook.set(dog.x, 0.6, -dog.d);
    } else {
      // 跟著主人：直式手機視角比較窄，鏡頭拉遠一點才看得到兩邊
      // 用平常的視角算距離：加速時視角拉廣，鏡頭不跟著靠近
      const halfFov = THREE.MathUtils.degToRad(baseFov / 2);
      const hTan = Math.tan(halfFov) * camera.aspect;
      const back = Math.max(6, Math.min(8.6, 3.3 / hTan));
      const cx = (owner.x * 0.55 + dog.x * 0.45) * 0.75;
      wantPos.set(cx, back * 0.55 + 1, -(owner.d - back));
      wantLook.set(cx * 0.85, 0.6, -(owner.d + 6));
    }
    if (snap) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
    } else {
      const k = Math.min(1, dt * (camMode === 'follow' ? 6 : 2.2));
      camPos.lerp(wantPos, k);
      camLook.lerp(wantLook, k);
    }
    camera.position.copy(camPos);
    // 加速時微微抖動，像風很大
    const jitter = shake * 0.8 + (boost - 1) * 0.05;
    if (jitter > 0) {
      camera.position.x += (Math.random() - 0.5) * jitter;
      camera.position.y += (Math.random() - 0.5) * jitter;
    }
    const fov = baseFov + ((boost - 1) / (BOOST - 1)) * BOOST_FOV;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(camLook);
  };

  // ---------- 每一格畫面 ----------

  const syncModels = (dt) => {
    maji.root.position.set(dog.x, 0, -dog.d);
    maji.root.rotation.y = dog.yaw;
    const sitting = dog.mood === 'sit' || dog.mood === 'freeze';
    maji.animate(dt, {
      speed: sitting ? 0 : dog.speed ?? 0,
      pose: sitting ? 'sit' : 'run',
      happy: dog.mood === 'happy' ? 2 : 1,
      pant: dog.mood === 'dash' || dog.mood === 'happy',
    });
    person.root.position.set(owner.x, 0, -owner.d);
    const yaw = Math.max(-0.6, Math.min(0.6, -(dog.x - owner.x) * 0.25));
    owner.yaw += (yaw - owner.yaw) * Math.min(1, dt * 6);
    person.root.rotation.y = owner.yaw;
    person.animate(dt, { speed: Math.hypot(owner.vx, owner.vd) + owner.pull * 5, lean: owner.pull });
    person.root.updateMatrixWorld(true);
    maji.root.updateMatrixWorld(true);
    leash.update(person.hand, maji.collarPoint, dt);

    // 撞到後閃爍；無敵時發出彩色的光
    const blink = invuln > 0 && Math.floor(invuln * 12) % 2 === 0;
    maji.root.visible = person.root.visible = !blink;
    const glow = starT > 0 ? new THREE.Color().setHSL((time * 1.5) % 1, 0.9, 0.35) : null;
    for (const mat of [...maji.materials, ...person.materials]) {
      if (glow) mat.emissive.copy(glow);
      else mat.emissive.setRGB(0, 0, 0);
    }
  };

  const showBubble = () => {
    const icon = dog.pending ? MOODS[dog.pending].icon : null;
    if (!icon || state === 'title') {
      bubble.classList.remove('show');
      return;
    }
    const p = project(maji.headTop);
    bubble.textContent = icon;
    bubble.style.left = `${p.x}px`;
    bubble.style.top = `${p.y}px`;
    bubble.classList.add('show');
  };

  const simulate = (dt) => {
    time += dt;
    invuln = Math.max(0, invuln - dt);
    if (starT > 0) {
      starT -= dt;
      if (starT <= 0) {
        invuln = Math.max(invuln, STAR_GRACE);
        if (state === 'play') music.setMode('run');
      }
    }
    const goal = starT > 0 && (state === 'play' || state === 'tutorial') ? BOOST : 1;
    boost += (goal - boost) * Math.min(1, dt * BOOST_EASE);
    if (Math.abs(boost - goal) < 0.002) boost = goal;
    shake = Math.max(0, shake - dt);

    if (state === 'play') {
      progress = Math.max(0, Math.min(1, (owner.d - raceStart) / GOAL));
      base = 6.4 + progress * 2.8;
      elapsed += dt;
      moodAI(dt);
      physics(dt, input.read());
      collide(false);
      if (state !== 'play') return;
      maxD = Math.max(maxD, owner.d - raceStart);
      trafficT -= dt;
      if (trafficT <= 0) {
        trafficT = rand(9, 15) - progress * 5;
        if (progress > 0.06 && parkD - owner.d > 110) obstacles.spawnTraffic(owner.d + 85);
      }
      if (owner.d >= parkD) win();
    } else if (state === 'tutorial') {
      lessonTick(dt);
      physics(dt, input.read());
      collide(true);
    } else if (state === 'win') {
      // 公園裡繞圈圈跑
      const cx = 0;
      const cd = parkD + 9;
      owner.vx = owner.vd = 0;
      owner.x += (cx - 1.2 - owner.x) * Math.min(1, dt * 1.5);
      owner.d += (cd - 2.5 - owner.d) * Math.min(1, dt * 1.5);
      const a = time * 2.2;
      const px = dog.x;
      const pd = dog.d;
      dog.x += (cx + Math.cos(a) * 2.2 - dog.x) * Math.min(1, dt * 4);
      dog.d += (cd + Math.sin(a) * 2.2 - dog.d) * Math.min(1, dt * 4);
      dog.speed = Math.hypot(dog.x - px, dog.d - pd) / dt;
      if (dog.speed > 0.5) dog.yaw = Math.atan2(-(dog.x - px), dog.d - pd);
    }
  };

  // 加速開始、結束（包含暫停、抵達、撞完命、離開）時切換集中線與音樂速度
  const syncBoost = () => {
    const on = starT > 0 && (state === 'play' || state === 'tutorial');
    if (on === boosting) return;
    boosting = on;
    root.classList.toggle('boost', on);
    music.setTempo(on ? BOOST : 1);
  };

  const clock = new THREE.Clock(false);
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (state !== 'paused') {
      let left = dt;
      while (left > 1e-4) {
        const step = Math.min(STEP, left);
        simulate(step);
        left -= step;
      }
      obstacles.update(dt, owner.d, time);
      street.update(owner.d);
      wind.update(dt, owner.d, (boost - 1) / (BOOST - 1));
      syncModels(dt);
    }
    syncBoost();
    aimCamera(dt);
    renderer.render(scene, camera);
    if (hud.hidden === false) renderProgress();
    showBubble();
  };

  // ---------- 教學 ----------

  const touch = isTouch();
  const DEMO = [
    ['left', '← 突然往左衝'],
    ['right', '→ 突然往右衝'],
    ['dash', '!! 突然往前暴衝'],
    ['back', '↩ 突然往回跑，小心別被牠撞到'],
    ['freeze', '… 突然停住不動，怎麼拉都拉不動，也別撞上去'],
  ];

  const LESSONS = [
    {
      title: '走走看',
      text: touch
        ? '你是白色小人！按住畫面任何地方拖曳，往哪拖就往哪走'
        : '你是白色小人！用方向鍵或 WASD 走走看（滑鼠按住拖曳也可以）',
      enter(s) {
        setMood('sit');
        s.moved = 0;
        coach.classList.toggle('show', touch && !input.used);
      },
      tick(dt, s) {
        s.moved += Math.hypot(owner.vx, owner.vd) * dt;
        if (input.used) coach.classList.remove('show');
        return s.moved > 6;
      },
    },
    {
      title: '麻吉拖著你走',
      text: '麻吉會自己往前走，繩子拉緊就會拖著你跑。往前走可以跟上牠，但靠太近撞到麻吉也會少一條命喔！',
      enter(s) {
        setMood('trot');
        s.t = 0;
        s.forward = 0;
      },
      tick(dt, s) {
        s.t += dt;
        if (input.read().y > 0.3) s.forward += dt;
        return (s.t > 3 && s.forward > 1.2) || s.t > 9;
      },
    },
    {
      title: '麻吉的脾氣',
      text: '麻吉不聽指揮！頭上冒出符號，就是牠要發作了',
      enter(s) {
        setMood('trot');
        s.t = -1.4;
        s.i = 0;
        s.phase = 'wait';
      },
      // 每一種示範一次：預告 → 發作 → 恢復小跑步
      tick(dt, s) {
        s.t += dt;
        if (s.i >= DEMO.length) {
          if (s.phase !== 'end') {
            s.phase = 'end';
            s.t = 0;
            setText('你沒辦法控制麻吉，但可以拉牽繩把牠拉回來！');
          }
          return s.t > 3;
        }
        const [mood, text] = DEMO[s.i];
        if (s.phase === 'wait' && s.t >= 0) {
          s.phase = 'warn';
          s.t = 0;
          warn(mood);
          setText(text);
        } else if (s.phase === 'warn' && s.t >= 0.9) {
          s.phase = 'act';
          s.t = 0;
          setMood(mood, Infinity);
          toast(MOODS[mood].label);
        } else if (s.phase === 'act' && s.t >= (mood === 'freeze' ? 1.8 : 1.1)) {
          s.phase = 'wait';
          s.t = -1.1;
          s.i++;
          setMood('trot');
        }
        return false;
      },
    },
    {
      title: '小心障礙物',
      text: '撞到汽車、機車、野狗、樹、盆栽或麻吉，就會少一條命（一共 5 條）。閃過前面的盆栽和三角錐！',
      enter(s) {
        hud.hidden = false;
        hud.classList.add('practice');
        const d = owner.d;
        obstacles.place('pot', -2.6, d + 20);
        obstacles.place('pot', -1.85, d + 20);
        obstacles.place('cone', 1.2, d + 20);
        obstacles.place('cone', 2.3, d + 20);
        obstacles.place('tree', 4.75, d + 32);
        obstacles.place('car', -2.95, d + 33);
        obstacles.place('pot', 0.4, d + 33);
        s.end = d + 37;
      },
      tick: (dt, s) => owner.d > s.end,
    },
    {
      title: '道具',
      text: '吃到 ❤ 可以補回一條命；吃到 ⭐ 可以無敵一陣子、速度變兩倍，撞到的東西都會被撞飛！',
      enter(s) {
        const d = owner.d;
        obstacles.place('heart', owner.x * 0.5, d + 14);
        obstacles.place('star', 0, d + 26);
        for (const x of [-2.2, -1.1, 0, 1.1, 2.2]) obstacles.place('cone', x, d + 34);
        s.end = d + 38;
      },
      tick: (dt, s) => owner.d > s.end,
    },
  ];

  const tipStep = tip.querySelector('.mw-tip-step');
  const tipText = tip.querySelector('.mw-tip-text');
  const setText = (text) => {
    tipText.textContent = text;
    tip.classList.remove('pulse');
    void tip.offsetWidth;
    tip.classList.add('pulse');
  };

  const startLesson = (i) => {
    const l = LESSONS[i];
    lesson = { i, s: {} };
    tipStep.textContent = `教學 ${i + 1} / ${LESSONS.length}・${l.title}`;
    setText(l.text);
    l.enter(lesson.s);
  };

  const lessonTick = (dt) => {
    if (!lesson) return;
    if (LESSONS[lesson.i].tick(dt, lesson.s)) {
      sfx.ding();
      if (lesson.i + 1 < LESSONS.length) startLesson(lesson.i + 1);
      else finishTutorial();
    }
  };

  const startTutorial = () => {
    hidePanel();
    state = 'tutorial';
    camMode = 'follow';
    lives = LIVES;
    renderLives();
    tip.hidden = false;
    pauseBtn.hidden = false;
    input.enable(true);
    music.play('calm');
    startLesson(0);
  };

  const finishTutorial = () => {
    markSeen(TUTORIAL_KEY);
    lesson = null;
    tip.hidden = true;
    coach.classList.remove('show');
    state = 'ready';
    camMode = 'portrait';
    hud.hidden = true;
    input.enable(false);
    setMood('sit');
    owner.vx = owner.vd = 0;
    showPanel({
      eyebrow: 'READY?',
      title: '準備好了！',
      body: `<p>公園在 <b>${GOAL}</b> 公尺外，五條命用完就結束。</p><p>帶麻吉出發吧！</p>`,
      buttons: [{ label: '出發！', primary: true, onClick: () => startRace(false) }],
    });
  };

  // ---------- 開始、結束 ----------

  const placeActors = (d) => {
    Object.assign(owner, { x: 0.8, d, vx: 0, vd: 0, lean: 0, yaw: 0, pull: 0 });
    Object.assign(dog, { x: 0, d: d + 2.4, vx: 0, vd: 0, yaw: 0, speed: 0, wander: Math.random() * 10 });
    setMood('sit');
    leash.reset();
  };

  const freshWorld = () => {
    street.reset(0);
    obstacles.reset();
    placeActors(0);
    parkD = Infinity;
    raceStart = 0;
    street.update(0);
  };

  // fresh：再走一次時整條街重來；教學完直接出發則從現在的位置接著走
  const startRace = (fresh) => {
    hidePanel();
    clearTimers();
    if (fresh) freshWorld();
    obstacles.reset();
    raceStart = Math.round(owner.d);
    parkD = raceStart + GOAL;
    street.setPark(parkD);
    obstacles.planRace(raceStart, parkD);
    lives = LIVES;
    hits = 0;
    invuln = starT = elapsed = maxD = progress = 0;
    boost = 1;
    base = 6.4;
    trafficT = 6;
    renderLives();
    hud.hidden = false;
    hud.classList.remove('practice');
    pauseBtn.hidden = false;
    camMode = 'follow';
    state = 'countdown';
    input.enable(false);
    setMood('sit');
    music.stop(0.2);
    const steps = ['3', '2', '1', '出發！'];
    steps.forEach((label, i) => later(i * 700, () => {
      countEl.textContent = label;
      countEl.classList.remove('show');
      void countEl.offsetWidth;
      countEl.classList.add('show');
      sfx.count(i === steps.length - 1);
      if (i === steps.length - 1) {
        state = 'play';
        input.enable(true);
        setMood('trot', rand(2.5, 3.5));
        music.play('run');
      }
    }));
  };

  const finish = (won) => {
    input.enable(false);
    hud.hidden = true;
    pauseBtn.hidden = true;
    bubble.classList.remove('show');
    dog.pending = null;
    const m = won ? GOAL : Math.floor(Math.max(0, maxD));
    const best = load(BEST_KEY, { meters: 0, seconds: null });
    const record = m > best.meters || (won && (best.seconds == null || elapsed < best.seconds));
    if (record) save(BEST_KEY, { meters: Math.max(m, best.meters), seconds: won ? Math.min(elapsed, best.seconds ?? Infinity) : best.seconds });
    recordMax('walkMeters', m);
    increment('walkPlays');
    if (!won && m < WALK_SHORT_METERS) increment('walkShort');
    if (!won && m < WALK_TINY_METERS) increment('walkTiny');
    if (won && lives === LIVES) increment('walkFullLives');
    if (won && !hits) increment('walkFlawless');
    return { m, best: load(BEST_KEY, best), record };
  };

  const resultButtons = () => [
    { label: '再走一次', primary: true, onClick: () => startRace(true) },
    { label: '離開', onClick: close },
  ];

  function gameOver() {
    state = 'over';
    setMood('sit');
    owner.vx = owner.vd = 0;
    owner.pull = 0;
    music.stop(0.15);
    sfx.lose();
    const { m, best, record } = finish(false);
    later(1300, () => showPanel({
      eyebrow: 'GAME OVER',
      title: '走不動了⋯⋯',
      body: `<p>你和麻吉一起走了 <b>${m}</b> 公尺</p>
        <p class="mw-note">${record ? '新紀錄！' : `最佳紀錄 ${best.meters} 公尺`}・離公園還有 ${GOAL - m} 公尺</p>`,
      buttons: resultButtons(),
    }));
  }

  function win() {
    state = 'win';
    camMode = 'orbit';
    setMood('happy');
    starT = 0;
    music.stop(0.3);
    sfx.win();
    haptic([30, 60, 30, 60, 80]);
    const { best, record } = finish(true);
    const secs = Math.round(elapsed);
    later(1800, () => {
      root.classList.add('confetti');
      showPanel({
        eyebrow: 'WE MADE IT!',
        title: '抵達公園！',
        body: `<p>花了 <b>${secs}</b> 秒、還剩 <b>${lives}</b> 條命</p>
          <p class="mw-note">${record ? '新紀錄！' : `最快紀錄 ${Math.round(best.seconds)} 秒`}</p>
          <p>麻吉開心地在草地上跑來跑去 🐾</p>`,
        buttons: resultButtons(),
      });
      music.play('calm');
    });
  }

  const showTitle = () => {
    state = 'title';
    camMode = 'portrait';
    hud.hidden = true;
    tip.hidden = true;
    pauseBtn.hidden = true;
    input.enable(false);
    const played = seen(TUTORIAL_KEY);
    const best = load(BEST_KEY, null);
    showPanel({
      eyebrow: "LET'S GO FOR A WALK",
      title: '帶麻吉去公園',
      body: `<p>麻吉想去 ${GOAL} 公尺外的公園玩！牽好牠，閃過路上的車子、機車、野狗和盆栽，平安走到公園吧。</p>
        ${best?.meters ? `<p class="mw-note">最佳紀錄 ${best.meters} 公尺${best.seconds ? `・最快 ${Math.round(best.seconds)} 秒` : ''}</p>` : ''}`,
      buttons: played
        ? [{ label: '出發！', primary: true, onClick: () => startRace(false) }, { label: '再看一次教學', onClick: startTutorial }]
        : [{ label: '開始教學', primary: true, onClick: startTutorial }, { label: '我會玩，直接出發', onClick: () => startRace(false) }],
    });
    music.play('calm');
  };

  // ---------- 暫停、離開 ----------

  const pause = () => {
    if (!['tutorial', 'countdown', 'play'].includes(state)) return;
    if (state === 'countdown') {
      // 倒數到一半暫停：回到倒數前，繼續時重新倒數
      clearTimers();
      countEl.classList.remove('show');
    }
    pausedFrom = state;
    state = 'paused';
    input.enable(false);
    music.stop(0.1);
    showPanel({
      eyebrow: 'PAUSED',
      title: '休息一下',
      body: '<p>麻吉坐下來等你</p>',
      buttons: [
        { label: '繼續', primary: true, onClick: resume },
        { label: '離開', onClick: close },
      ],
    });
  };

  function resume() {
    hidePanel();
    clock.getDelta();
    if (pausedFrom === 'countdown') {
      state = 'ready';
      startRace(false);
      return;
    }
    state = pausedFrom;
    input.enable(true);
    music.play(state === 'play' ? (starT > 0 ? 'star' : 'run') : 'calm', false);
  }

  function close() {
    if (state === 'closed') return;
    state = 'closed';
    clearTimers();
    music.stop(0.2);
    input.enable(false);
    renderer.setAnimationLoop(null);
    clock.stop();
    syncBoost();
    hidePanel();
    root.classList.remove('open', 'confetti');
    root.querySelectorAll('.mw-pop').forEach((el) => el.remove());
    onClose?.();
  }

  pauseBtn.addEventListener('click', pause);
  root.querySelector('.mw-close').addEventListener('click', close);
  root.querySelector('.mw-skip').addEventListener('click', finishTutorial);
  // 小遊戲疊在扭蛋機、圖鑑、燈箱上面：開著時按鍵先在這裡攔下，不往下傳（方向鍵由 input.js 在同一層處理）
  window.addEventListener('keydown', (e) => {
    if (state === 'closed') return;
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'p' || e.key === 'P') (state === 'paused' ? resume : pause)();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  const open = () => {
    clearTimers();
    freshWorld();
    lives = LIVES;
    starT = invuln = 0;
    boost = 1;
    syncBoost();
    resize();
    aimCamera(0, true);
    // 底下頁面若還有選起來的文字，iPhone 的「拷貝」選單會一直浮在遊戲上面
    window.getSelection()?.removeAllRanges();
    root.classList.add('open');
    root.classList.remove('confetti');
    clock.start();
    renderer.setAnimationLoop(frame);
    showTitle();
  };

  return { open, close };
}
