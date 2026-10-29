// 跟令狗一起收集紅蘿蔔：小遊戲本體
// 側面看的碗形溜冰場（像洛克人、卡比那樣的 2D 畫面），手機橫著玩
// 令狗穿冰刀鞋在冰上滑（有慣性、衝太快會滑倒、衝出坡頂會撞牆），接住天上掉下來的紅蘿蔔，
// 踩著跳台跳到最上面，放進紅蘿蔔箱；一次放越多越划算（1 / 3 / 6 分），3 條命用完就結束
// 干擾：炸彈（第 2 波起，碰到就爆，沒碰到過一陣子會熄掉）、小豬（第 3 波起，令狗會失控衝過去，但還能跳起來躲炸彈）、麻吉（第 4 波起，搶背著的紅蘿蔔）
// 好東西：愛心、黃金紅蘿蔔、連續接住 12 根的 FEVER、每 5 波一次的紅蘿蔔雨；後面的關卡跳台會移動
// 地獄模式：分數到 150 起「跳」「左」「右」每 10 秒亂換，偶爾起濃霧
// 瘋狂模式：分數到 200 起按鍵每 5 秒亂換、炸彈比紅蘿蔔多，偶爾畫面突然全黑
// 長期目標在 progress.js：任務、令狗等級、升級解鎖的造型
// 流程：標題 → 教學（第一次玩，在遊戲畫面裡邊玩邊學）→ 倒數 → 開始 → 命用完 → 結算
// 防誤觸：滑到「上一頁」、離開全螢幕、切到別的 App 都只會暫停；就算整個瀏覽器被關掉，下次打開也能接著玩上一局

import { carrotSVG, dogSide, dogFront, pigSVG, majiSVG, boxSVG, bombSVG, heartSVG, COSTUMES } from './sprites.js';
import { W, FLOOR, RIM, groundY, groundSlope, LAYOUTS, layoutForWave, createPlatforms, surfaceAt, buildBackground } from './stage.js';
import { wakeAudio, setMuted, sfx, music } from './audio.js';
import { progress, missionAt } from './progress.js';
import { haptic } from '../fx/haptics.js';
import { seen, markSeen, load, save as store } from '../storage.js';
import { increment, recordMax } from '../achievements/progress.js';
import { isTouch } from '../device.js';
import { canFullscreen, isFullscreen, enterFullscreen, onFullscreenChange, iosBarsShowing } from './fullscreen.js';

// ---------- 可以調整的數值 ----------
const T = {
  lives: 3,
  accel: 440, brake: 900, glide: 0.75, maxSpeed: 350,   // 冰上的加速、煞車、放開後的滑行（越小滑越久）、最高速（px/秒）
  yellow: 190, red: 268, redHeavy: 240, slipTime: 0.95, // 速度表的黃區、紅區；背 3 根時紅區提早；紅區撐多久滑倒
  rampG: 256,                    // 斜坡上的重力：紅區的速度剛好衝到坡頂
  gravity: 1600, jump: -700, jumpCut: 0.45, airAccel: 320,
  invuln: 1.6, carryMax: 3, catchR: 32,
  groundTime: 6,                 // 掉在冰上的紅蘿蔔留幾秒（最後 1.5 秒閃爍）
  feverNeed: 12, feverTime: 8,
  waveTime: 30, bonusTime: 15,   // 每 5 波一次紅蘿蔔雨
  bombLife: 5, bombR: 46,         // 落地的炸彈留幾秒（最後 1 秒閃爍，沒碰到就熄掉）；爆炸時炸飛附近紅蘿蔔的範圍
  pigTime: 2.4, majiSpeed: 232, majiFlee: 280,
  hellAt: 150, hell2At: 200,     // 地獄模式、瘋狂模式從幾分開始
  swapGap: 10, swapGap2: 5,      // 按鍵每幾秒亂換一次（地獄／瘋狂）
  hellCarrotGap: 2.4, hellBombGap: 0.8, // 瘋狂模式：紅蘿蔔和炸彈多少對調，紅蘿蔔約 2.4 秒一根、炸彈約 0.8 秒一顆
  fogTime: 2.6, darkTime: 1.3,   // 濃霧（地獄起）、全黑（瘋狂）擋住畫面幾秒
  blindGap: [12, 20],            // 隔幾秒來一次濃霧或全黑
  scale: 0.27,                   // 令狗圖的放大倍數（原圖 250 寬）
};
const STEP = 1 / 120;
const TUTORIAL_KEY = 'linggou-skate-tutorial';
const RESUME_KEY = 'linggou-skate-resume';
const RANKS = [[60, '賣光紅蘿蔔的小令狗'], [30, '賣紅蘿蔔的小令狗'], [10, '搶奪紅蘿蔔的令狗'], [0, '紅蘿蔔被偷走的令狗']];
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.5 2.3 4 6.4 4c2.3 0 3.9 1.3 5.6 3.3C13.7 5.3 15.3 4 17.6 4c4.1 0 6 4.5 4.4 7.7C19.5 16.4 12 21 12 21z"/></svg>';
const SVGNS = 'http://www.w3.org/2000/svg';
// 地獄模式的按鍵亂換：三個鍵的位置不動，功能換成另一種排法
const KEYS = ['left', 'right', 'jump'];
const KEY_ORDERS = [['left', 'right', 'jump'], ['left', 'jump', 'right'], ['right', 'left', 'jump'], ['right', 'jump', 'left'], ['jump', 'left', 'right'], ['jump', 'right', 'left']];
const KEY_LABEL = { left: ['◀', '往左'], right: ['▶', '往右'], jump: ['跳', '跳'] };
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 教學：每一步做到才往下，教學中不會受傷
const TUTORIAL = [
  { text: '按住 ◀ 或 ▶，讓令狗在冰上滑', coach: ['left', 'right'], done: (g) => g.tut.moved > 160 },
  { text: '按「跳」，跳上旁邊的跳台', coach: ['jump'], done: (g) => g.dog.plat && !g.dog.plat.top },
  { text: '接住掉下來的紅蘿蔔，接 2 根', spawn: true, done: (g) => g.dog.carry.length >= 2 },
  { text: '再跳一次，跳到最上面的跳台', coach: ['jump'], done: (g) => g.dog.plat?.top },
  { text: '走到箱子旁邊，紅蘿蔔就放進去了', done: (g) => g.tut.deposited },
  { text: '速度表到紅色太久會滑倒，撞牆、碰到炸彈也會少一條命。你有 3 條命，加油！', info: true },
];

const TEMPLATE = `
  <div class="ls-rotate"><p><span>📱</span>把手機轉成橫的玩<br><small>溜冰場比較大，左右手也比較好按</small></p></div>
  <div class="ls-swipe" hidden>
    <p><span>👆</span>往上滑一下，把網址列收起來<br><small>畫面會變大，比較好玩</small></p>
    <button type="button" class="ls-swipe-skip">先不用</button>
  </div>
  <div class="ls-game">
    <svg class="ls-stage" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g class="ls-bg"></g><g class="ls-plats"></g><g class="ls-items"></g><g class="ls-actors"></g><g class="ls-fx"></g>
    </svg>
    <div class="ls-hud" hidden>
      <div class="ls-fog" aria-hidden="true"></div>
      <div class="ls-dark" aria-hidden="true"></div>
      <div class="ls-hud-left">
        <div class="ls-chip ls-lives" aria-label="生命"></div>
        <div class="ls-chip ls-carry">背著 <i></i><i></i><i></i></div>
        <div class="ls-combo-wrap"><div class="ls-combo"><i></i></div><div class="ls-combo-label"></div></div>
      </div>
      <div class="ls-score"><b>0</b><small>最佳 0</small></div>
      <div class="ls-hud-right">
        <div class="ls-chip ls-wave">第 1 波</div>
        <button type="button" class="ls-fs ls-fs-hud" aria-label="全螢幕" hidden>⛶</button>
        <button type="button" class="ls-pause" aria-label="暫停">❚❚</button>
      </div>
      <div class="ls-toast" role="status"></div>
      <div class="ls-banner"></div>
      <div class="ls-speed"><div class="ls-gauge"></div><span>速度</span></div>
      <div class="ls-pad">
        <button type="button" class="ls-key-l" data-key="left" data-fn="left" aria-label="往左">◀</button>
        <button type="button" class="ls-key-r" data-key="right" data-fn="right" aria-label="往右">▶</button>
        <button type="button" class="ls-key-j" data-key="jump" data-fn="jump" aria-label="跳">跳</button>
      </div>
      <div class="ls-tip" hidden>
        <p class="ls-tip-step"></p>
        <p class="ls-tip-text"></p>
        <div class="ls-tip-actions">
          <button type="button" class="ls-btn primary ls-tip-go" hidden>開始！</button>
          <button type="button" class="ls-tip-skip">略過教學</button>
        </div>
      </div>
    </div>

    <section class="ls-panel ls-title-panel">
      <button type="button" class="ls-icon-btn ls-fs ls-fs-title" aria-label="全螢幕" hidden>⛶</button>
      <button type="button" class="ls-icon-btn ls-mute" aria-label="音效開關">🔊</button>
      <button type="button" class="ls-icon-btn ls-close" aria-label="離開小遊戲">✕</button>
      <div class="ls-cols">
        <div class="ls-col">
          <p class="ls-eyebrow">Carrots on Ice</p>
          <h2 class="ls-title">跟令狗一起收集<em>紅蘿蔔</em></h2>
          <svg class="ls-hero" viewBox="0 -14 200 230" aria-hidden="true"></svg>
          <p class="ls-muted ls-title-best"></p>
          <p class="ls-resume-note" hidden></p>
          <div class="ls-btn-row ls-title-actions"></div>
        </div>
        <div class="ls-col ls-side">
          <div class="ls-card">
            <h3><span class="ls-lv"></span><small class="ls-lv-next"></small></h3>
            <div class="ls-lvbar"><i></i></div>
            <ul class="ls-missions ls-title-missions"></ul>
          </div>
          <div class="ls-card">
            <h3>衣櫃<small>升級解鎖新造型</small></h3>
            <div class="ls-closet"></div>
          </div>
        </div>
      </div>
    </section>

    <section class="ls-panel ls-pause-panel" hidden>
      <div class="ls-center">
        <p class="ls-eyebrow">Paused</p>
        <h2 class="ls-title">暫停</h2>
        <p class="ls-muted ls-pause-info"></p>
        <div class="ls-btn-row">
          <button type="button" class="ls-btn primary ls-resume">繼續</button>
          <button type="button" class="ls-btn ls-restart">重新開始</button>
          <button type="button" class="ls-btn ls-home">回標題</button>
        </div>
      </div>
    </section>

    <section class="ls-panel ls-result-panel" hidden>
      <div class="ls-cols">
        <div class="ls-col">
          <p class="ls-eyebrow">Game over</p>
          <p class="ls-muted">你是</p>
          <p class="ls-rank"></p>
          <p class="ls-big">0</p>
          <p class="ls-muted ls-final-best"></p>
          <div class="ls-unlock" hidden></div>
          <div class="ls-btn-row">
            <button type="button" class="ls-btn primary ls-again">再玩一次</button>
            <button type="button" class="ls-btn ls-home">回標題</button>
          </div>
        </div>
        <div class="ls-col ls-side">
          <div class="ls-card"><div class="ls-stats"></div></div>
          <div class="ls-card">
            <h3><span>任務</span><small class="ls-result-lv"></small></h3>
            <ul class="ls-missions ls-result-missions"></ul>
          </div>
        </div>
      </div>
    </section>
  </div>
`;

export function createGame(root, { onClose } = {}) {
  root.insertAdjacentHTML('beforeend', TEMPLATE);
  const $ = (sel) => root.querySelector(sel);
  const layer = {
    items: $('.ls-items'), actors: $('.ls-actors'), fx: $('.ls-fx'), plats: $('.ls-plats'),
  };
  const hud = $('.ls-hud');
  const padEl = $('.ls-pad');
  const toastEl = $('.ls-toast');
  const bannerEl = $('.ls-banner');
  const tipEl = $('.ls-tip');
  const panels = { title: $('.ls-title-panel'), pause: $('.ls-pause-panel'), result: $('.ls-result-panel') };
  const save = progress.data;

  const updateSnow = buildBackground($('.ls-bg'));
  const plats = createPlatforms(layer.plats);
  let boxEl = null;

  const el = (tag, parent, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.append(e);
    return e;
  };

  // ---------- 遊戲狀態 ----------
  // mode：title | tutorial | count | play | pause | over
  const state = { mode: 'title', t: 0, pausedFrom: null, countT: 0 };
  const input = { left: false, right: false, jump: false, jumpPressed: false };
  // 每個鍵（螢幕按鍵的位置、鍵盤的鍵）現在是什麼功能；平常就是自己，地獄模式會亂換
  const keyFn = { left: 'left', right: 'right', jump: 'jump' };
  let dog, items, run, fx = [];
  let dogEl = null, dogKey = '', hudKey = '';
  const tut = { step: 0, moved: 0, deposited: false, wait: 0, spawnT: 0 };

  // 收起教學的提示卡和手指：教學做完、略過，或中途回標題、重新開始都要收，不然手指會一直留在按鍵上
  function clearTutorial() {
    tipEl.hidden = true;
    root.querySelectorAll('.ls-pad button').forEach((b) => b.classList.remove('ls-coach'));
  }

  function reset(tutorial) {
    clearTutorial();
    dog = {
      x: tutorial ? 140 : 400, y: FLOOR, v: 0, vx: 0, vy: 0, ground: true, plat: null, face: 1,
      carry: [], hurtT: 0, slip: 0, mode: 'normal', modeT: 0, rimArmed: true,
    };
    items = { carrots: [], bombs: [], hearts: [], pig: null, maji: null, warns: [] };
    fx = [];
    run = {
      lives: T.lives, score: 0, wave: 1, waveT: 0, bonus: false, time: 0,
      combo: 0, fever: 0, feverCount: 0, hot: false, hotT: 0, nextHot: rand(16, 22),
      timers: { carrot: 0.6, bomb: 4, pig: rand(6, 10), maji: rand(3, 6), gold: rand(18, 26), heart: rand(22, 31) },
      stats: { score: 0, air: 0, triple: 0, wave: 1, fever: 0, gold: 0, ride: 0, pig: 0, recover: 0, hot: 0, nohit: 0, rim: 0, dodge: 0, caught: 0, stolen: 0, slips: 0, bombs: 0, walls: 0, maxDrop: 0 },
      noHitT: 0, completed: new Set(), boxFill: 0,
      hell: 0, swapT: 0, blind: null, blindT: 0,
    };
    setKeys(KEYS);
    setBlind(null);
    padEl.classList.remove('ls-shuffle');
    layer.items.replaceChildren();
    layer.actors.replaceChildren();
    layer.fx.replaceChildren();
    plats.reset();
    boxEl = el('g', layer.plats);
    renderBox();
    renderPlats();
    dogEl = el('g', layer.actors);
    dogKey = '';
    hudKey = '';
    music.tempo = 1;
    toastEl.classList.remove('show');
    bannerEl.classList.remove('show');
  }

  const renderBox = () => { boxEl.innerHTML = boxSVG(run.boxFill, run.hot); };
  const renderPlats = () => {
    plats.render();
    const top = plats.top;
    boxEl.setAttribute('transform', `translate(${(top.cx - 30).toFixed(1)} ${(top.y - 43).toFixed(1)}) scale(.5)`);
  };

  // ---------- 特效、提示 ----------
  function popup(x, y, text, color = '#c65a17', size = 18) {
    const t = el('text', layer.fx, {
      x, y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 900, fill: color,
      stroke: '#fff', 'stroke-width': 4, 'paint-order': 'stroke', 'font-family': 'PingFang TC, Noto Sans TC, sans-serif',
    });
    t.textContent = text;
    fx.push({ el: t, t: 0, life: 1, vy: -40, y });
  }
  function ring(x, y, r, color) {
    const c = el('circle', layer.fx, { cx: x, cy: y, r: 4, fill: 'none', stroke: color, 'stroke-width': 6 });
    fx.push({ el: c, t: 0, life: 0.45, ring: r });
  }
  function updateFx(dt) {
    fx = fx.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      if (f.ring) { f.el.setAttribute('r', 4 + f.ring * k); f.el.setAttribute('opacity', 1 - k); }
      else { f.el.setAttribute('y', f.y + f.vy * f.t); f.el.setAttribute('opacity', 1 - k * k); }
      if (k >= 1) { f.el.remove(); return false; }
      return true;
    });
  }
  let toastT = 0;
  const toast = (text, dur = 1.8) => { toastEl.textContent = text; toastEl.classList.add('show'); toastT = dur; };
  let bannerT = 0;
  const banner = (html, dur = 1.6) => { bannerEl.innerHTML = html; bannerEl.classList.add('show'); bannerT = dur; };

  // ---------- 受傷 ----------
  function hurt(kind, knock = 0) {
    if (dog.hurtT > 0) return;
    // 教學中不扣命：只提醒一下
    if (state.mode === 'tutorial') {
      dog.slip = 0;
      dog.hurtT = 0.8;
      popup(dog.x, dog.y - 70, kind === 'slip' ? '太快了，放開一下！' : '小心！', '#b35d50', 16);
      sfx.wall();
      return;
    }
    if (state.mode !== 'play') return;
    run.lives--;
    run.stats[kind === 'slip' ? 'slips' : kind === 'bomb' ? 'bombs' : 'walls']++;
    dog.hurtT = T.invuln;
    run.noHitT = 0;
    breakCombo();
    scatterCarrots();
    if (kind === 'bomb') { dog.mode = 'soot'; dog.modeT = 1; dog.vy = -420; dog.vx = knock; dog.ground = false; dog.plat = null; }
    else if (kind === 'slip') { dog.mode = 'slip'; dog.modeT = 1.2; sfx.slip(); popup(dog.x, dog.y - 70, '咻——啪！', '#3a6fb0', 20); increment('skateSlip'); }
    else { dog.mode = 'stun'; dog.modeT = 0.6; sfx.wall(); popup(dog.x, dog.y - 70, '咚！', '#b35d50', 22); }
    sfx.hurt();
    haptic(80);
    renderHud();
    if (run.lives <= 0) setTimeout(gameOver, 900);
  }
  function scatterCarrots() {
    dog.carry.forEach((v, i) => {
      items.carrots.push(makeCarrot(dog.x, dog.y - 40, v > 1, { vx: (i - 1) * 100 + rand(-30, 30), vy: -300 - i * 40, noCatch: 0.5 }));
    });
    dog.carry = [];
  }
  const breakCombo = () => { if (run.fever <= 0) run.combo = 0; };

  // ---------- 紅蘿蔔 ----------
  function makeCarrot(x, y, gold = false, extra = {}) {
    const c = { x, y, vx: 0, vy: 40, gold, state: 'fall', t: 0, rot: rand(-30, 30), spin: rand(-120, 120), noCatch: 0, ...extra };
    c.el = el('g', layer.items);
    c.el.innerHTML = carrotSVG(0, 0, 0, gold ? 1.05 : 0.95, gold);
    return c;
  }
  const spawnCarrot = (gold = false, x = rand(30, W - 30)) => items.carrots.push(makeCarrot(x, -30, gold, { vy: gold ? 120 : 60 }));

  function catchCarrot(c) {
    if (dog.carry.length >= T.carryMax) return false;
    dog.carry.push(c.gold ? 5 : 1);
    run.combo++;
    run.stats.caught++;
    if (c.gold) run.stats.gold++;
    if (!dog.ground) { run.stats.air++; popup(c.x, c.y - 20, '空中接住！', '#3a6fb0', 14); }
    if (dog.plat?.moving) run.stats.ride++;
    sfx.catch(run.combo);
    if (state.mode === 'play' && run.combo >= T.feverNeed && run.fever <= 0) startFever();
    return true;
  }
  function startFever() {
    run.fever = T.feverTime;
    run.feverCount++;
    run.stats.fever = run.feverCount;
    sfx.fever();
    banner('FEVER!<small>紅蘿蔔加倍、得分 ×2</small>', 1.4);
    music.tempo = 1.18;
  }
  function deposit() {
    const n = dog.carry.length;
    const sum = dog.carry.reduce((a, b) => a + b, 0);
    let mult = 1;
    if (run.fever > 0) mult *= 2;
    if (run.hot) { mult *= 2; run.stats.hot += n; }
    const gain = (sum + [0, 0, 1, 3][n]) * mult;
    run.score += gain;
    run.stats.score = run.score;
    run.stats.maxDrop = Math.max(run.stats.maxDrop, n);
    if (n === 3) {
      run.stats.triple++;
      if (state.mode === 'play') increment('skateTriple');
    }
    dog.carry = [];
    run.boxFill = Math.min(6, run.boxFill + n);
    const top = plats.top;
    popup(top.cx, top.y - 60, `+${gain}`, '#c65a17', n === 3 ? 28 : 22);
    if (n > 1) popup(top.cx, top.y - 86, n === 3 ? '三根一起放！' : '兩根一起放！', '#2f7d50', 15);
    // 箱子上 6 個洞插滿了：放一下煙火，清空重來
    if (run.boxFill >= 6) { setTimeout(() => { run.boxFill = 0; renderBox(); }, 700); ring(top.cx, top.y - 20, 60, '#ffd84d'); }
    sfx.drop(n);
    haptic(20);
    renderBox();
    // 麻吉追到一半，紅蘿蔔都存起來了 → 生氣離開
    const m = items.maji;
    if (m && m.state === 'chase') { m.state = 'sulk'; m.t = 0; popup(m.x, groundY(clamp(m.x, 0, W)) - 70, '哼！', '#b35d50', 18); }
    tut.deposited = true;
    if (state.mode === 'play') checkHell();
  }

  // ---------- 地獄模式：分數到了就開始，按鍵定時亂換 ----------
  function checkHell() {
    const lv = run.score >= T.hell2At ? 2 : run.score >= T.hellAt ? 1 : 0;
    if (lv <= run.hell) return;
    const gap = lv === 2 ? T.swapGap2 : T.swapGap;
    run.swapT = run.hell ? Math.min(run.swapT, gap) : gap;
    if (!run.hell) run.blindT = rand(6, 10);
    run.hell = lv;
    sfx.hell();
    haptic(60);
    banner(lv === 2 ? '瘋狂模式<small>炸彈比紅蘿蔔多！按鍵每 5 秒亂換，畫面還會突然變黑</small>' : '地獄模式<small>「跳」「左」「右」每 10 秒亂換，還會起濃霧！</small>', 2.4);
    renderHud();
  }
  // 三個鍵依序換成 fns 的功能，按鍵上的字跟著改
  function setKeys(fns) {
    KEYS.forEach((k, i) => { keyFn[k] = fns[i]; });
    root.querySelectorAll('.ls-pad button').forEach((b) => {
      const f = keyFn[b.dataset.key];
      b.dataset.fn = f;
      b.textContent = KEY_LABEL[f][0];
      b.setAttribute('aria-label', KEY_LABEL[f][1]);
    });
  }
  // 濃霧、全黑：一下子就散，瘋狂模式兩種都會來，全黑比較常見
  function setBlind(kind) {
    $('.ls-fog').classList.toggle('on', kind === 'fog');
    $('.ls-dark').classList.toggle('on', kind === 'dark');
  }
  function updateBlind(dt) {
    if (run.blind) {
      if ((run.blind.t -= dt) <= 0) { run.blind = null; run.blindT = rand(...T.blindGap); setBlind(null); }
      return;
    }
    if ((run.blindT -= dt) > 0) return;
    const kind = run.hell === 2 && Math.random() < 0.65 ? 'dark' : 'fog';
    run.blind = { kind, t: kind === 'dark' ? T.darkTime : T.fogTime };
    setBlind(kind);
  }
  function shuffleKeys() {
    const now = KEYS.map((k) => keyFn[k]).join();
    const options = KEY_ORDERS.filter((o) => o.join() !== now);
    setKeys(options[Math.floor(Math.random() * options.length)]);
    // 按著的鍵全部放開，換完要重按才算，不會按著按著突然變成別的動作
    releaseAll();
    sfx.shuffle();
    haptic(30);
    toast('按鍵亂換了！看清楚再按', 1.4);
  }

  // =====================================================================
  // 主迴圈：固定步長，手機卡頓時也不會穿過跳台
  // =====================================================================
  let raf = 0;
  let last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.mode === 'play' || state.mode === 'tutorial') {
      let left = dt;
      while (left > 0) { const s = Math.min(STEP, left); update(s); left -= s; }
      render();
      if (state.mode === 'play') music.tick();
    } else if (state.mode === 'count') {
      countdown(dt);
    }
    updateSnow(dt);
    updateFx(dt);
  }

  function countdown(dt) {
    const before = Math.ceil(state.countT);
    state.countT -= dt;
    const now = Math.ceil(state.countT);
    if (now !== before) {
      if (now > 0) { banner(`${now}`, 1); sfx.count(false); }
      else { banner('開始！', 0.8); sfx.count(true); state.mode = 'play'; music.restart(); }
    }
    plats.update(dt);
    render();
  }

  function update(dt) {
    run.time += dt;
    state.t += dt;
    if (dog.hurtT > 0) dog.hurtT -= dt;
    if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('show');
    if (bannerT > 0 && (bannerT -= dt) <= 0) bannerEl.classList.remove('show');

    if (state.mode === 'play') {
      run.noHitT += dt;
      run.stats.nohit = Math.max(run.stats.nohit, Math.floor(run.noHitT));
      updateWave(dt);
      if (run.fever > 0) { run.fever -= dt; if (run.fever <= 0) { run.combo = 0; music.tempo = 1; } }
      // 箱子發金光：10 秒內放進去 ×2
      if (run.hot) { run.hotT -= dt; if (run.hotT <= 0) { run.hot = false; renderBox(); } }
      else if ((run.nextHot -= dt) <= 0) { run.hot = true; run.hotT = 10; run.nextHot = rand(18, 26); renderBox(); toast('箱子發金光了！現在放進去 ×2', 1.8); }
      // 地獄模式：時間到就亂換按鍵，最後 1 秒按鍵先抖一抖提醒
      if (run.hell && (run.swapT -= dt) <= 0) { shuffleKeys(); run.swapT = run.hell === 2 ? T.swapGap2 : T.swapGap; }
      padEl.classList.toggle('ls-shuffle', run.hell > 0 && run.swapT < 1);
      if (run.hell) updateBlind(dt);
      spawnAll(dt);
    } else {
      updateTutorial(dt);
    }

    plats.update(dt);
    updateDog(dt);
    updateCarrots(dt);
    updateBombs(dt);
    updateHearts(dt);
    updatePig(dt);
    updateMaji(dt);
    if (state.mode === 'play') checkMissions();
  }

  function updateWave(dt) {
    run.waveT += dt;
    if (run.waveT < (run.bonus ? T.bonusTime : T.waveTime)) return;
    run.waveT = 0;
    run.wave++;
    run.stats.wave = run.wave;
    const wasBonus = run.bonus;
    run.bonus = run.wave % 5 === 0;
    const layout = layoutForWave(run.wave, run.bonus);
    const changed = layout !== layoutForWave(run.wave - 1, wasBonus);
    plats.set(layout);
    sfx.wave();
    const intro = { 2: '炸彈來了！別碰到它', 3: '小豬出沒！', 4: '麻吉來搶紅蘿蔔！' }[run.wave];
    const sub = run.bonus ? '紅蘿蔔雨！盡量接！' : [intro, changed ? LAYOUTS[layout].name : ''].filter(Boolean).join('　') || '越來越快了！';
    banner(`第 ${run.wave} 波<small>${sub}</small>`, 2);
    saveRun();
  }

  function spawnAll(dt) {
    const w = run.wave;
    const tm = run.timers;
    const feverMul = run.fever > 0 ? 2 : 1;
    // 紅蘿蔔：第 1 波約 2.2 秒一根，越後面越快，最快 0.85 秒；場上同時最多 3（第 1 波）／6 根
    // 瘋狂模式：紅蘿蔔和炸彈多少對調，紅蘿蔔變少、炸彈一直掉（紅蘿蔔雨照樣有）
    const hell2 = run.hell >= 2;
    const carrotGap = run.bonus ? 0.4 : hell2 ? T.hellCarrotGap : Math.max(0.85, 2.2 - 0.1 * (w - 1));
    const carrotCap = (w === 1 || (hell2 && !run.bonus) ? 3 : 6) * feverMul;
    if ((tm.carrot -= dt * feverMul) <= 0 && items.carrots.length < carrotCap) { spawnCarrot(); tm.carrot = carrotGap * rand(0.75, 1.25); }
    if (w >= 2 && !run.bonus && (tm.bomb -= dt) <= 0) {
      const x = rand(40, W - 40);
      items.warns.push({ x, t: 0.9, el: warnEl(x) });
      tm.bomb = (hell2 ? T.hellBombGap : Math.max(1.2, 4.4 - 0.45 * (w - 2))) * rand(0.8, 1.2);
    }
    if (w >= 3 && (tm.gold -= dt) <= 0) { spawnCarrot(true); tm.gold = rand(20, 28); }
    if (run.lives < T.lives && (tm.heart -= dt) <= 0) { spawnHeart(); tm.heart = rand(24, 33); }
    const calm = dog.mode === 'normal' && dog.hurtT <= 0;
    if (w >= 3 && !run.bonus && !items.pig && calm && (tm.pig -= dt) <= 0) { spawnPig(); tm.pig = rand(16, 24); }
    // 麻吉：第 4 波起每 8～13 秒來一次；時間到了，等令狗背著紅蘿蔔就衝進來
    if (w >= 4 && !run.bonus && !items.maji) {
      tm.maji -= dt;
      if (tm.maji <= 0 && dog.carry.length && calm) { spawnMaji(); tm.maji = rand(8, 13); }
    }
    // 炸彈的警告標誌倒數完才掉下來
    items.warns = items.warns.filter((wn) => {
      wn.t -= dt;
      wn.el.setAttribute('opacity', Math.sin(wn.t * 20) > 0 ? 1 : 0.4);
      if (wn.t <= 0) { wn.el.remove(); spawnBomb(wn.x); return false; }
      return true;
    });
  }
  function warnEl(x) {
    const g = el('g', layer.fx, { transform: `translate(${x} 70)` });
    g.innerHTML = `<path d="M0,-14 L13,10 L-13,10 Z" fill="#ffd84d" stroke="#3e2618" stroke-width="2.4" stroke-linejoin="round"/><text y="7" text-anchor="middle" font-size="15" font-weight="900" fill="#3e2618">!</text>
      <path d="M0,16 V${groundY(x) - 80}" stroke="#e2524a" stroke-width="2" stroke-dasharray="5 7" opacity=".5"/>`;
    return g;
  }

  // ---------- 教學 ----------
  function startTutorial() {
    reset(true);
    Object.assign(tut, { step: 0, moved: 0, deposited: false, wait: 0, spawnT: 0 });
    showPanel(null);
    hud.hidden = false;
    tipEl.hidden = false;
    state.mode = 'tutorial';
    renderHud();
    showTip();
  }
  function showTip() {
    const s = TUTORIAL[tut.step];
    $('.ls-tip-step').textContent = `第 ${tut.step + 1} 步，共 ${TUTORIAL.length} 步`;
    $('.ls-tip-text').textContent = s.text;
    $('.ls-tip-go').hidden = !s.info;
    root.querySelectorAll('.ls-pad button').forEach((b) => b.classList.toggle('ls-coach', !!s.coach?.includes(b.dataset.key)));
  }
  function updateTutorial(dt) {
    const s = TUTORIAL[tut.step];
    // 接紅蘿蔔那一步：紅蘿蔔掉在令狗附近
    if (s.spawn && dog.carry.length < 2 && items.carrots.length < 2 && (tut.spawnT -= dt) <= 0) {
      spawnCarrot(false, clamp(dog.x + rand(-60, 60), 60, W - 60));
      tut.spawnT = 1.2;
    }
    if (tut.wait > 0) {
      tut.wait -= dt;
      if (tut.wait <= 0) { tut.step++; showTip(); }
      return;
    }
    if (!s.info && s.done({ dog, tut })) {
      sfx.step();
      $('.ls-tip-text').textContent = '👍 做得好！';
      root.querySelectorAll('.ls-pad button').forEach((b) => b.classList.remove('ls-coach'));
      tut.wait = 0.8;
    }
  }
  function finishTutorial() {
    markSeen(TUTORIAL_KEY);
    startRun();
  }

  // ---------- 令狗 ----------
  function updateDog(dt) {
    if (dog.modeT > 0) { dog.modeT -= dt; if (dog.modeT <= 0) dog.mode = 'normal'; }
    const ctrl = dog.mode === 'normal' || dog.mode === 'soot';
    // 衝向小豬時方向不能控制，但還是可以跳，不然路上有炸彈躲不掉
    const canJump = ctrl || dog.mode === 'love';
    let dir = ctrl ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
    if (dog.mode === 'love' && items.pig) dir = Math.sign(items.pig.x - dog.x) || 1;
    const x0 = dog.x;

    if (dog.ground) {
      // 站在會動的跳台上：跟著跳台走
      if (dog.plat) dog.x += dog.plat.dx;
      const s = dog.plat ? 0 : groundSlope(dog.x);
      const k = 1 / Math.sqrt(1 + s * s);
      const cap = dog.mode === 'love' ? 260 : T.maxSpeed;
      if (dir) {
        const a = Math.sign(dog.v) && Math.sign(dog.v) !== dir ? T.brake : T.accel * (dog.mode === 'love' ? 1.6 : 1);
        dog.v += dir * a * dt;
        dog.face = dir;
      } else dog.v *= Math.exp(-T.glide * dt);
      if (dog.mode === 'slip' || dog.mode === 'stun') dog.v *= Math.exp(-2.5 * dt);
      dog.v += T.rampG * s * k * dt;
      dog.v = clamp(dog.v, -cap, cap);
      dog.x += dog.v * k * dt;

      if (dog.plat) {
        dog.y = dog.plat.y;
        if (dog.x < dog.plat.x1 - 6 || dog.x > dog.plat.x2 + 6) {
          dog.ground = false; dog.vx = dog.v; dog.vy = Math.min(0, dog.plat.dy / dt * 0.5); dog.plat = null;
        }
      } else {
        // 衝出坡頂就撞牆
        if (dog.x <= 2 || dog.x >= W - 2) {
          const side = dog.x <= 2 ? 1 : -1;
          dog.x = dog.x <= 2 ? 2 : W - 2;
          if (Math.abs(dog.v) > 60 && dog.mode !== 'love') hurt('wall');
          else if (dog.mode === 'love') sfx.wall();
          dog.v = side * 160;
        }
        dog.y = groundY(dog.x);
        // 衝到坡頂差一點撞牆：好險！
        if (dog.y < RIM + 16 && dog.rimArmed && dog.hurtT <= 0) { run.stats.rim++; dog.rimArmed = false; popup(dog.x < W / 2 ? 60 : W - 60, RIM - 40, '好險！', '#2f7d50', 16); }
        if (dog.y > RIM + 80) dog.rimArmed = true;
      }

      // 速度表到紅區太久就滑倒
      const speed = Math.abs(dog.v);
      const red = dog.carry.length >= 3 ? T.redHeavy : T.red;
      if (speed >= red && dog.mode === 'normal') { dog.slip += dt; if (dog.slip >= T.slipTime) { dog.slip = 0; hurt('slip'); } }
      else dog.slip = Math.max(0, dog.slip - dt * 2);

      if (input.jumpPressed && canJump) {
        dog.ground = false;
        dog.vx = dog.v * k;
        dog.vy = T.jump + (dog.plat ? Math.min(0, dog.plat.dy / dt) : 0);
        dog.plat = null;
        sfx.jump();
      }
    } else {
      if (dir) { dog.vx += dir * T.airAccel * dt; dog.face = dir; }
      dog.vx = clamp(dog.vx, -T.maxSpeed, T.maxSpeed);
      // 放開跳鍵就跳得比較低
      if (!input.jump && dog.vy < -200) dog.vy *= Math.pow(T.jumpCut, dt * 10);
      dog.vy += T.gravity * dt;
      const yPrev = dog.y;
      dog.x += dog.vx * dt;
      dog.y += dog.vy * dt;
      if (dog.x < 6 || dog.x > W - 6) {
        dog.x = clamp(dog.x, 6, W - 6);
        if (Math.abs(dog.vx) > T.yellow && dog.mode === 'normal') hurt('wall');
        dog.vx *= -0.5;
      }
      if (dog.y < -40) dog.vy = Math.max(dog.vy, 0);
      if (dog.vy > 0) {
        const hit = surfaceAt(plats.list, dog.x, yPrev, dog.y);
        if (hit) { dog.y = hit.y; dog.ground = true; dog.plat = hit.plat; dog.v = dog.vx; }
      }
    }
    input.jumpPressed = false;
    tut.moved += Math.abs(dog.x - x0);

    // 接紅蘿蔔：嘴巴附近碰到就接住
    const mx = dog.x + dog.face * 24, my = dog.y - 30;
    for (const c of items.carrots) {
      if (c.noCatch > 0 || c.gone) continue;
      if (Math.hypot(c.x - mx, c.y - my) < T.catchR && catchCarrot(c)) { c.gone = true; c.el.remove(); }
    }
    // 放進最上面跳台的箱子
    if (dog.carry.length && dog.plat === plats.top && Math.abs(dog.x - plats.top.cx) < 40) deposit();
  }

  function updateCarrots(dt) {
    const maxV = Math.min(320, 140 + 18 * run.wave);
    for (const c of items.carrots) {
      if (c.gone) continue;
      c.t += dt;
      if (c.noCatch > 0) c.noCatch -= dt;
      if (c.state === 'fall') {
        c.vy = Math.min(c.vy + 260 * dt, c.gold ? maxV * 1.35 : maxV);
        if (c.vx) c.vy += 600 * dt;
        const yPrev = c.y;
        c.x = clamp(c.x + c.vx * dt, 8, W - 8);
        c.y += c.vy * dt;
        c.rot += c.spin * dt;
        const hit = surfaceAt(plats.list, c.x, yPrev, c.y);
        if (hit && c.vy > 0) { c.state = 'ground'; c.y = hit.y - 8; c.plat = hit.plat; c.t = 0; c.vx = 0; c.rot = 90; }
      } else {
        if (c.plat) {
          // 跟著跳台走；跳台移走了就掉下去
          c.x += c.plat.dx;
          c.y = c.plat.y - 8;
          if (c.x < c.plat.x1 || c.x > c.plat.x2) { c.state = 'fall'; c.vy = 0; c.plat = null; }
        } else {
          // 掉在斜坡上會往下滑
          const s = groundSlope(c.x);
          c.vx += 260 * s / Math.sqrt(1 + s * s) * dt;
          c.vx *= Math.exp(-1.2 * dt);
          c.x = clamp(c.x + c.vx * dt, 4, W - 4);
          c.y = groundY(c.x) - 8;
        }
        if (c.t > T.groundTime) { c.gone = true; c.el.remove(); if (run.fever <= 0) run.combo = 0; }
      }
    }
    items.carrots = items.carrots.filter((c) => !c.gone);
  }

  // ---------- 炸彈：令狗碰到就爆；落地後沿著斜坡滾到碗底，沒碰到過一陣子會熄掉 ----------
  function spawnBomb(x) {
    const b = { x, y: -20, vy: 220, v: 0, state: 'fall', t: 0 };
    b.el = el('g', layer.items);
    b.el.innerHTML = bombSVG();
    items.bombs.push(b);
  }
  function explode(b) {
    b.gone = true;
    b.el.remove();
    sfx.boom();
    ring(b.x, b.y - 8, T.bombR, '#ff8a00');
    popup(b.x, b.y - 30, '碰！', '#e2524a', 26);
    hurt('bomb', Math.sign(dog.x - b.x || 1) * 220);
    for (const c of items.carrots) if (c.state === 'ground' && Math.hypot(c.x - b.x, c.y - b.y) < T.bombR) { c.gone = true; c.el.remove(); }
  }
  // 令狗身體碰到炸彈；剛受傷閃爍的時候穿過去不算
  const touchingBomb = (b) => dog.hurtT <= 0 && Math.hypot(dog.x - b.x, dog.y - 24 - (b.y - 10)) < 32;
  function updateBombs(dt) {
    for (const b of items.bombs) {
      if (b.gone) continue;
      if (b.state === 'fall') {
        const yPrev = b.y;
        b.vy += 500 * dt;
        b.y += b.vy * dt;
        if (touchingBomb(b)) { explode(b); continue; }
        const hit = surfaceAt(plats.list, b.x, yPrev, b.y);
        if (hit) { b.state = 'ground'; b.y = hit.y; b.plat = hit.plat; b.t = T.bombLife; }
      } else {
        if (b.plat) {
          b.x += b.plat.dx;
          b.y = b.plat.y;
          if (b.x < b.plat.x1 || b.x > b.plat.x2) b.plat = null;
        } else {
          const gy = groundY(clamp(b.x, 0, W));
          if (b.y < gy - 2) b.y = Math.min(gy, b.y + 300 * dt);
          else {
            const s = groundSlope(b.x);
            b.v += 320 * s / Math.sqrt(1 + s * s) * dt;
            b.v *= Math.exp(-0.9 * dt);
            b.x = clamp(b.x + b.v * dt, 10, W - 10);
            b.y = groundY(b.x);
          }
        }
        if (touchingBomb(b)) { explode(b); continue; }
        b.t -= dt;
        // 沒碰到：引信熄掉，冒一縷煙就消失
        if (b.t <= 0) {
          b.gone = true;
          b.el.remove();
          popup(b.x, b.y - 30, '噗⋯', '#8a8f9c', 16);
        }
      }
    }
    items.bombs = items.bombs.filter((b) => !b.gone);
  }

  // ---------- 愛心：補一條命 ----------
  function spawnHeart() {
    const h = { x: rand(40, W - 40), y: -20, vy: 80, state: 'fall', t: 0 };
    h.el = el('g', layer.items);
    h.el.innerHTML = heartSVG();
    items.hearts.push(h);
  }
  function updateHearts(dt) {
    for (const h of items.hearts) {
      h.t += dt;
      if (h.state === 'fall') {
        const yPrev = h.y;
        h.y += h.vy * dt;
        const hit = surfaceAt(plats.list, h.x, yPrev, h.y);
        if (hit) { h.state = 'ground'; h.y = hit.y - 12; h.plat = hit.plat; h.t = 0; }
      } else {
        if (h.plat) { h.x += h.plat.dx; h.y = h.plat.y - 12; }
        if (h.t > 5) h.gone = true;
      }
      if (!h.gone && Math.hypot(dog.x - h.x, dog.y - 26 - h.y) < 30) {
        h.gone = true;
        run.lives = Math.min(T.lives, run.lives + 1);
        sfx.item();
        popup(h.x, h.y - 20, '+1 命', '#e0445a', 18);
        renderHud();
      }
      if (h.gone) h.el.remove();
    }
    items.hearts = items.hearts.filter((h) => !h.gone);
  }

  // ---------- 小豬：令狗愛心眼衝過去，碰到小豬就清醒 ----------
  const bubble = (text, color) => {
    const g = el('g', layer.fx);
    g.innerHTML = `<rect x="-32" y="-16" width="64" height="26" rx="13" fill="#fff" stroke="#3e2618" stroke-width="2.2"/><text y="3" text-anchor="middle" font-size="14" font-weight="900" fill="${color}">${text}</text>`;
    return g;
  };
  function spawnPig() {
    const fromLeft = dog.x > W / 2;
    const p = { x: fromLeft ? -30 : W + 30, dir: fromLeft ? 1 : -1, t: 0, state: 'enter' };
    p.el = el('g', layer.actors);
    p.el.innerHTML = pigSVG();
    p.bubble = bubble('噗噗！', '#d6466d');
    items.pig = p;
    sfx.oink();
  }
  function updatePig(dt) {
    const p = items.pig;
    if (!p) return;
    p.t += dt;
    const py = groundY(clamp(p.x, 0, W));
    if (p.state === 'enter') {
      p.x += p.dir * 80 * dt;
      if (p.t > 0.8) {
        p.state = 'walk';
        if (dog.mode === 'normal' && dog.hurtT <= 0) { dog.mode = 'love'; dog.modeT = T.pigTime; toast('令狗看到小豬，衝過去了！💕', 1.6); }
      }
    } else if (p.state === 'walk') {
      p.x += p.dir * 70 * dt;
      if (p.x < 140 || p.x > W - 140) p.dir *= -1;
      if (Math.hypot(dog.x - p.x, dog.y - py) < 42) {
        run.stats.pig++;
        p.state = 'flee';
        p.dir = dog.x < p.x ? 1 : -1;
        if (dog.mode === 'love') { dog.mode = 'normal'; dog.modeT = 0; }
        sfx.oink();
        popup(p.x, py - 70, '♡', '#ff4f7b', 26);
      }
      if (p.t > 10) { p.state = 'flee'; p.dir = p.x < W / 2 ? -1 : 1; }
    } else {
      p.x += p.dir * 240 * dt;
      if (p.x < -60 || p.x > W + 60) { p.el.remove(); p.bubble.remove(); items.pig = null; return; }
    }
    const y = groundY(clamp(p.x, 0, W));
    p.el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${y.toFixed(1)}) scale(${p.dir * 0.46} 0.46) translate(-60 -92)`);
    p.bubble.setAttribute('transform', `translate(${clamp(p.x, 40, W - 40).toFixed(1)} ${(y - 62).toFixed(1)})`);
    p.bubble.setAttribute('opacity', p.state === 'flee' ? 0 : 1);
  }

  // ---------- 麻吉：追令狗搶紅蘿蔔；追上牠搶得回來，跳上跳台牠就抓不到 ----------
  function spawnMaji() {
    const fromLeft = dog.x > W / 2;
    const m = { x: fromLeft ? -40 : W + 40, dir: fromLeft ? 1 : -1, state: 'warn', t: 0, loot: 0, jumpedOver: false };
    m.el = el('g', layer.actors);
    m.el.innerHTML = majiSVG(false);
    m.bubble = bubble('汪！', '#3e2618');
    items.maji = m;
    sfx.bark();
    toast('麻吉來搶紅蘿蔔了！跳上跳台或快去放！', 2);
  }
  function updateMaji(dt) {
    const m = items.maji;
    if (!m) return;
    m.t += dt;
    const y = groundY(clamp(m.x, 0, W));
    if (m.state === 'warn') {
      if (m.t > 1) { m.state = 'chase'; m.t = 0; }
    } else if (m.state === 'chase') {
      m.dir = Math.sign(dog.x - m.x) || m.dir;
      m.x += m.dir * T.majiSpeed * dt;
      // 從麻吉頭上跳過去
      if (!dog.ground && Math.abs(dog.x - m.x) < 22 && dog.y < y - 40 && !m.jumpedOver) { m.jumpedOver = true; run.stats.dodge++; popup(m.x, y - 80, '跳過去了！', '#3a6fb0', 13); }
      if (Math.abs(dog.x - m.x) > 44) m.jumpedOver = false;
      if (Math.hypot(dog.x - m.x, dog.y - y) < 36 && dog.carry.length && dog.hurtT <= 0 && dog.ground && !dog.plat) {
        m.loot = dog.carry.pop();
        m.state = 'flee';
        m.dir = Math.sign(m.x - dog.x) || (m.x < W / 2 ? -1 : 1);   // 往遠離令狗的方向逃
        m.t = 0;
        m.el.innerHTML = majiSVG(true);
        run.stats.stolen++;
        breakCombo();
        sfx.steal();
        popup(m.x, y - 80, '被搶走了！', '#b35d50', 16);
      }
      if (!dog.carry.length || m.t > 8) { m.state = 'sulk'; m.t = 0; }
    } else if (m.state === 'flee') {
      m.x += m.dir * T.majiFlee * dt;
      if (m.t > 0.5 && Math.hypot(dog.x - m.x, dog.y - y) < 42) {
        if (dog.carry.length < T.carryMax) dog.carry.push(m.loot);
        m.loot = 0;
        run.stats.recover++;
        increment('skateRecover');
        m.el.innerHTML = majiSVG(false);
        m.state = 'sulk';
        m.t = 0;
        sfx.item();
        popup(m.x, y - 80, '搶回來了！', '#2f7d50', 18);
      }
      if (m.x < -60 || m.x > W + 60) m.gone = true;
    } else if (m.state === 'sulk') {
      m.dir = m.x < W / 2 ? -1 : 1;
      m.x += m.dir * 170 * dt;
      if (m.x < -60 || m.x > W + 60) m.gone = true;
    }
    if (m.gone) { m.el.remove(); m.bubble.remove(); items.maji = null; return; }
    const yy = groundY(clamp(m.x, 0, W));
    m.el.setAttribute('transform', `translate(${m.x.toFixed(1)} ${yy.toFixed(1)}) scale(${m.dir * 0.26} 0.26) translate(-125 -180)`);
    m.bubble.setAttribute('transform', `translate(${clamp(m.x, 34, W - 34).toFixed(1)} ${(yy - 70).toFixed(1)})`);
    m.bubble.setAttribute('opacity', m.state === 'warn' || (m.state === 'chase' && m.t < 0.8) ? 1 : 0);
  }

  // =====================================================================
  // 畫面
  // =====================================================================
  const STARS = '<g class="ls-spin" transform="translate(60 120)"><path d="M0,-30 l4,9 l10,1 l-8,6 l3,10 l-9,-6 l-9,6 l3,-10 l-8,-6 l10,-1 z M30,0 l3,6 l7,1 l-5,4 l2,7 l-7,-4 l-6,4 l2,-7 l-5,-4 l7,-1 z" fill="#ffd23f" stroke="#3e2618" stroke-width="2"/></g>';
  function render() {
    renderPlats();
    const pose = dog.mode === 'slip' ? 'slip' : !dog.ground ? 'air' : 'skate';
    const speed = Math.abs(dog.ground ? dog.v : dog.vx);
    const red = dog.carry.length >= 3 ? T.redHeavy : T.red;
    const eyes = dog.mode === 'love' ? 'heart' : dog.mode === 'slip' || dog.mode === 'stun' ? 'dizzy' : dog.mode === 'soot' ? 'white' : 'normal';
    const sweat = dog.ground && speed >= red;
    // 令狗：動作有變才重畫
    const key = [pose, eyes, sweat, dog.carry.join(','), dog.mode === 'soot', save.costume].join('|');
    if (key !== dogKey) {
      dogKey = key;
      const cls = pose === 'skate' ? 'ls-run' : pose === 'air' ? 'ls-air' : 'ls-flail';
      dogEl.innerHTML = `<g class="${cls}">${dogSide({ eyes, carry: dog.carry, costume: save.costume, soot: dog.mode === 'soot', sweat })}${pose === 'slip' ? STARS : ''}</g>`;
    }
    const g = dogEl.firstChild;
    if (pose === 'skate') g.style.setProperty('--ls-dur', `${clamp(0.75 - speed / 600, 0.22, 0.75)}s`);
    g.classList.toggle('ls-run', pose === 'skate' && speed > 25);
    const ang = Math.atan(dog.ground && !dog.plat ? groundSlope(dog.x) : 0) * 180 / Math.PI;
    const slipRot = dog.mode === 'slip' ? 180 : 0;
    const wob = sweat ? Math.sin(state.t * 40) * 6 : 0;
    dogEl.setAttribute('transform', `translate(${dog.x.toFixed(1)} ${(dog.y - (slipRot ? 32 : 0)).toFixed(1)}) rotate(${(ang + wob).toFixed(1)}) rotate(${slipRot}) scale(${dog.face * T.scale} ${T.scale}) translate(-125 -182)`);
    dogEl.setAttribute('opacity', dog.hurtT > 0 && Math.sin(state.t * 30) > 0 ? 0.45 : 1);
    dogEl.classList.toggle('ls-fever', run.fever > 0);

    for (const c of items.carrots) {
      const blink = c.state === 'ground' && c.t > T.groundTime - 1.5 && Math.sin(c.t * 30) > 0;
      c.el.setAttribute('transform', `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${c.rot.toFixed(0)})`);
      c.el.setAttribute('opacity', blink ? 0.3 : 1);
    }
    for (const b of items.bombs) {
      b.el.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${((b.x * 2) % 360).toFixed(0)})`);
      b.el.setAttribute('opacity', b.state === 'ground' && b.t < 1 && Math.sin(b.t * 30) > 0 ? 0.35 : 1);
    }
    for (const h of items.hearts) h.el.setAttribute('transform', `translate(${h.x.toFixed(1)} ${(h.y + Math.sin(h.t * 4) * 3).toFixed(1)})`);

    $('.ls-gauge').style.setProperty('--v', clamp(speed / T.maxSpeed, 0, 1).toFixed(3));
    const combo = $('.ls-combo');
    combo.classList.toggle('fever', run.fever > 0);
    combo.firstChild.style.width = `${run.fever > 0 ? (run.fever / T.feverTime) * 100 : Math.min(100, (run.combo / T.feverNeed) * 100)}%`;
    $('.ls-combo-label').textContent = run.fever > 0 ? `FEVER ${Math.ceil(run.fever)}` : run.combo >= 2 ? `${run.combo} 連擊` : '';
    renderHud();
  }

  // 分數、命、背著幾根、第幾波：有變才更新
  function renderHud() {
    const key = [run.lives, run.score, dog.carry.join(','), run.wave, run.bonus, run.hell, state.mode].join('|');
    if (key === hudKey) return;
    hudKey = key;
    $('.ls-lives').innerHTML = Array.from({ length: T.lives }, (_, i) => HEART_SVG.replace('<svg', i < run.lives ? '<svg' : '<svg class="off"')).join('');
    $('.ls-score b').textContent = run.score;
    $('.ls-score small').textContent = `最佳 ${Math.max(save.best, state.mode === 'play' ? run.score : 0)}`;
    root.querySelectorAll('.ls-carry i').forEach((s, i) => {
      s.className = i < dog.carry.length ? (dog.carry[i] > 1 ? 'on gold' : 'on') : '';
      s.textContent = i < dog.carry.length ? '🥕' : '';
    });
    $('.ls-wave').textContent = state.mode === 'tutorial' ? '教學' : `第 ${run.wave} 波${run.bonus ? '・紅蘿蔔雨' : ''}${['', '・地獄', '・瘋狂'][run.hell]}`;
  }

  // =====================================================================
  // 任務、等級、造型
  // =====================================================================
  function checkMissions() {
    save.active.forEach((mi) => {
      const m = missionAt(mi);
      if (!run.completed.has(mi) && (run.stats[m.stat] ?? 0) >= m.goal) {
        run.completed.add(mi);
        sfx.mission();
        toast(`任務完成：${m.text}`, 2);
      }
    });
  }
  function missionRows(list, done = new Set(), stats = null) {
    return list.map((mi) => {
      const m = missionAt(mi);
      const ok = done.has(mi);
      const now = stats ? Math.min(m.goal, stats[m.stat] ?? 0) : 0;
      return `<li class="${ok ? 'done' : ''}"><span>${ok ? '✓ ' : ''}${m.text}</span><b>${ok ? '完成！' : `${now}/${m.goal}`}</b></li>`;
    }).join('');
  }
  function renderTitle() {
    $('.ls-hero').innerHTML = dogFront(save.costume, 'happy');
    $('.ls-title-best').textContent = save.best ? `最佳紀錄 ${save.best} 根・累積 ${save.total} 根` : '第一次玩會先教你怎麼玩';
    const lv = progress.level();
    const within = save.done % 3;
    $('.ls-lv').textContent = `令狗 Lv ${lv}`;
    $('.ls-lvbar i').style.width = `${(within / 3) * 100}%`;
    const nextCos = COSTUMES.find((c) => c.lv > lv);
    $('.ls-lv-next').textContent = `再完成 ${3 - within} 個任務升級${nextCos ? `，解鎖「${nextCos.name}」` : ''}`;
    $('.ls-title-missions').innerHTML = missionRows(save.active);
    $('.ls-closet').innerHTML = COSTUMES.map((c) => `<button type="button" data-cos="${c.id}" aria-pressed="${save.costume === c.id}" ${c.lv > lv ? 'disabled' : ''}>${c.lv > lv ? `🔒 Lv${c.lv}` : c.name}</button>`).join('');
    $('.ls-mute').textContent = save.muted ? '🔇' : '🔊';
    const actions = $('.ls-title-actions');
    const snap = savedRun();
    const note = $('.ls-resume-note');
    note.hidden = !snap;
    if (snap) note.textContent = `上一局玩到一半：第 ${snap.wave} 波・${snap.score} 根`;
    actions.innerHTML = snap
      ? '<button type="button" class="ls-btn primary" data-go="continue">接著玩上一局</button><button type="button" class="ls-btn" data-go="run">重新開始</button>'
      : seen(TUTORIAL_KEY)
        ? '<button type="button" class="ls-btn primary" data-go="run">開始！</button><button type="button" class="ls-btn" data-go="tutorial">再看一次教學</button>'
        : '<button type="button" class="ls-btn primary" data-go="tutorial">開始教學</button><button type="button" class="ls-btn" data-go="run">我會玩，直接開始</button>';
  }

  // ---------- 接關：玩到一半被打斷（不小心滑出瀏覽器、App 被關掉、手機沒電），下次打開還能接著玩 ----------
  // 每次暫停、每換一波就把這一局記下來；命用完結算、或按「重新開始」才清掉
  // 只記分數、命、第幾波這些，場上的紅蘿蔔、炸彈、跳台位置不記，接著玩時令狗從碗底重新出發
  const inRun = () => state.mode === 'play' || state.mode === 'count' || (state.mode === 'pause' && state.pausedFrom !== 'tutorial');
  function saveRun() {
    // 剛開始沒幾秒就不用記了，免得標題一直問要不要接著玩 0 根的那一局
    if (!inRun() || run.lives <= 0 || run.time < 3) return;
    store(RESUME_KEY, {
      score: run.score, lives: run.lives, wave: run.wave, waveT: run.waveT, bonus: run.bonus, time: run.time,
      feverCount: run.feverCount, boxFill: run.boxFill, hell: run.hell, keys: KEYS.map((k) => keyFn[k]),
      stats: run.stats, completed: [...run.completed], carry: dog.carry,
    });
  }
  const clearRun = () => store(RESUME_KEY, null);
  function savedRun() {
    const s = load(RESUME_KEY, null);
    return s && s.lives > 0 && Number.isFinite(s.score) ? s : null;
  }
  function continueRun() {
    const s = savedRun();
    if (!s) { startRun(); return; }
    reset(false);
    Object.assign(run, {
      score: s.score, lives: Math.min(T.lives, s.lives), wave: s.wave, waveT: s.waveT || 0, bonus: !!s.bonus, time: s.time || 0,
      feverCount: s.feverCount || 0, boxFill: s.boxFill || 0, hell: s.hell || 0,
      stats: { ...run.stats, ...s.stats }, completed: new Set(s.completed || []),
    });
    if (run.hell) {
      run.swapT = run.hell === 2 ? T.swapGap2 : T.swapGap;
      run.blindT = rand(6, 10);
      if (KEY_ORDERS.some((o) => o.join() === s.keys?.join())) setKeys(s.keys);
    }
    dog.carry = Array.isArray(s.carry) ? s.carry.slice(0, T.carryMax) : [];
    plats.set(layoutForWave(run.wave, run.bonus), true);
    plats.update(0);
    renderBox();
    renderPlats();
    begin();
  }

  function gameOver() {
    if (state.mode !== 'play') return;
    state.mode = 'over';
    sfx.over();
    recordMax('skateCarrots', run.score);
    const before = progress.level();
    const isBest = run.score > save.best;
    save.best = Math.max(save.best, run.score);
    save.total += run.score;
    recordMax('skateTotal', save.total);
    save.plays++;
    increment('skatePlays');
    clearRun();
    const shown = save.active.slice();
    // 完成的任務換成下一個
    save.active = save.active.map((mi) => (run.completed.has(mi) ? save.next++ : mi));
    save.done += run.completed.size;
    progress.write();
    const after = progress.level();

    hud.hidden = true;
    $('.ls-rank').textContent = `「${RANKS.find(([n]) => run.score >= n)[1]}」`;
    $('.ls-big').textContent = run.score;
    $('.ls-final-best').textContent = isBest ? '新紀錄！🎉' : `最佳紀錄 ${save.best} 根`;
    $('.ls-stats').innerHTML = [
      ['撐到', `第 ${run.wave} 波`], ['接到', `${run.stats.caught} 根`], ['空中接住', `${run.stats.air} 根`], ['一次最多放', `${run.stats.maxDrop} 根`],
      ['FEVER', `${run.stats.fever} 次`], ['被麻吉搶走', `${run.stats.stolen} 根`], ['滑倒', `${run.stats.slips} 次`], ['撞牆／被炸', `${run.stats.walls}／${run.stats.bombs}`],
    ].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
    $('.ls-result-missions').innerHTML = missionRows(shown, run.completed, run.stats);
    $('.ls-result-lv').textContent = `令狗 Lv ${after}`;
    const unlock = $('.ls-unlock');
    const got = COSTUMES.filter((c) => c.lv > before && c.lv <= after).map((c) => c.name);
    unlock.hidden = after <= before;
    unlock.textContent = `升到 Lv ${after}！${got.length ? `解鎖造型：${got.join('、')}，到標題的衣櫃換裝` : ''}`;
    showPanel('result');
    $('.ls-again').focus({ preventScroll: true });
  }

  // =====================================================================
  // 流程
  // =====================================================================
  function showPanel(name) {
    Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== name; });
    checkBars();
  }
  function startRun() {
    clearRun();
    reset(false);
    begin();
  }
  function begin() {
    showPanel(null);
    hud.hidden = false;
    tipEl.hidden = true;
    state.t = 0;
    startCount();
    renderHud();
  }
  // 倒數 3、2、1：按下去馬上出現 3
  function startCount() {
    state.mode = 'count';
    state.countT = 3;
    banner('3', 1);
    sfx.count(false);
  }
  // why：為什麼暫停（玩家自己按的就不用說明）
  const PAUSE_WHY = {
    back: '剛剛好像滑到「上一頁」了，先幫你暫停',
    fullscreen: '離開全螢幕了，先幫你暫停',
    away: '剛剛離開了一下，先幫你暫停',
  };
  function pause(why) {
    if (state.mode !== 'play' && state.mode !== 'tutorial' && state.mode !== 'count') return;
    state.pausedFrom = state.mode === 'count' ? 'count' : state.mode;
    state.mode = 'pause';
    releaseAll();
    saveRun();
    const info = state.pausedFrom === 'tutorial' ? '教學中' : `目前 ${run.score} 根・第 ${run.wave} 波`;
    $('.ls-pause-info').textContent = PAUSE_WHY[why] ? `${PAUSE_WHY[why]}・${info}` : info;
    showPanel('pause');
    $('.ls-resume').focus({ preventScroll: true });
  }
  function resume() {
    if (state.mode !== 'pause') return;
    showPanel(null);
    state.mode = state.pausedFrom;
    if (state.mode === 'count') startCount();
    last = performance.now();
    music.resume();
    // 最後一條命沒了、還沒跳結算就暫停的話，回來直接結算
    if (state.mode === 'play' && run.lives <= 0) gameOver();
  }
  function home() {
    state.mode = 'title';
    hud.hidden = true;
    clearTutorial();
    renderTitle();
    showPanel('title');
  }

  // ---------- 讓畫面變大：全螢幕，或請 iPhone 玩家往上滑收起網址列 ----------
  // 手機上按下開始時順便進全螢幕（要在點擊當下才會答應）
  const goBig = () => { if (isTouch()) enterFullscreen(root); };
  const updateFsButtons = () => {
    const show = canFullscreen() && !isFullscreen();
    root.querySelectorAll('.ls-fs').forEach((b) => { b.hidden = !show; });
  };
  // 手機上離開全螢幕（Android 的返回手勢第一下就是離開全螢幕）多半是不小心的，先暫停
  onFullscreenChange(() => {
    updateFsButtons();
    if (!isFullscreen() && isTouch()) pause('fullscreen');
  });

  const swipeEl = $('.ls-swipe');
  let swipeSkipped = false;
  // iPhone Safari：網址列還在、而且停在標題／暫停／結算畫面時，請玩家往上滑一下；
  // 這時讓後面的網頁捲得動（Safari 捲動時才會收起網址列），收起來之後再鎖回去
  function checkBars() {
    const onPanel = Object.values(panels).some((p) => !p.hidden);
    const show = !swipeSkipped && onPanel && iosBarsShowing();
    if (show === !swipeEl.hidden) return;
    swipeEl.hidden = !show;
    root.classList.toggle('ls-swiping', show);
    document.body.style.overflow = show ? '' : 'hidden';
    if (show && innerHeight + scrollY >= document.documentElement.scrollHeight - 40) scrollBy(0, -240);
  }
  const hideSwipe = () => {
    if (swipeEl.hidden) return;
    swipeEl.hidden = true;
    root.classList.remove('ls-swiping');
    document.body.style.overflow = 'hidden';
  };

  // ---------- 按鈕 ----------
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.matches('[data-go], .ls-again, .ls-restart, .ls-resume, .ls-tip-go')) goBig();
    if (b.dataset.go === 'run') startRun();
    else if (b.dataset.go === 'continue') continueRun();
    else if (b.dataset.go === 'tutorial') startTutorial();
    else if (b.matches('.ls-fs')) enterFullscreen(root);
    else if (b.matches('.ls-swipe-skip')) { swipeSkipped = true; hideSwipe(); }
    else if (b.dataset.cos && !b.disabled) { save.costume = b.dataset.cos; progress.write(); renderTitle(); }
    else if (b.matches('.ls-again, .ls-restart')) startRun();
    else if (b.matches('.ls-home')) home();
    else if (b.matches('.ls-resume')) resume();
    else if (b.matches('.ls-pause')) pause();
    else if (b.matches('.ls-tip-go, .ls-tip-skip')) finishTutorial();
    else if (b.matches('.ls-close')) close(true);
    else if (b.matches('.ls-mute')) { save.muted = !save.muted; setMuted(save.muted); progress.write(); renderTitle(); }
  });

  // ---------- 輸入：螢幕按鍵（可以同時按）、鍵盤 ----------
  // 每根手指按著哪顆鍵記在 held，鍵盤按著的記在 keys；input 每次從這兩個重新算，按鍵不會卡住
  // 以前靠按鍵自己收「放開」，iPhone 跳出放大鏡、選單時手指被系統搶走，收不到放開，
  // 那顆鍵就一直算按著（右鍵卡住時，按左鍵左右抵消，看起來就像左鍵壞了）；現在多了三道保險：
  //   在哪裡放開都算放開、手指全部離開螢幕就全部放開、第一根手指按下時先清掉之前沒放開的
  const held = new Map();
  const keys = new Set();
  const padButtons = [...root.querySelectorAll('.ls-pad button')];
  // held、keys 記的是哪顆鍵；換成功能要看 keyFn（地獄模式會亂換）
  const syncKeys = () => {
    const on = new Set([...held.values(), ...keys].map((k) => keyFn[k]));
    if (on.has('jump') && !input.jump) input.jumpPressed = true;
    for (const k of ['left', 'right', 'jump']) input[k] = on.has(k);
    padButtons.forEach((b) => b.classList.toggle('down', held.size > 0 && [...held.values()].includes(b.dataset.key)));
  };
  const releaseAll = () => {
    held.clear();
    keys.clear();
    syncKeys();
  };
  padButtons.forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.isPrimary) held.clear();
      held.set(e.pointerId, b.dataset.key);
      syncKeys();
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  // 按著 ◀ 或 ▶ 的手指滑到另一顆，就換方向（不用放開再按）
  const onPointerMove = (e) => {
    const key = held.get(e.pointerId);
    if (key !== 'left' && key !== 'right') return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ls-pad button')?.dataset.key;
    if ((over === 'left' || over === 'right') && over !== key) {
      held.set(e.pointerId, over);
      syncKeys();
    }
  };
  const onPointerUp = (e) => { if (held.delete(e.pointerId)) syncKeys(); };
  const onTouchEnd = (e) => { if (!e.touches.length && held.size) { held.clear(); syncKeys(); } };

  // iPhone：連續點按鍵會被當成雙擊、長按，Safari 跳出放大鏡、「選取」選單或選起文字，擋住遊戲（跟帶麻吉去公園同一個問題）
  // 光靠 CSS 的 user-select: none 擋不完，直接取消觸控的預設動作，上面的 pointer 事件照樣會送來
  // 不擋的：選單上要點的按鈕、標題結算畫面的捲動、請玩家往上滑收網址列的提示
  root.addEventListener('touchstart', (e) => {
    const t = e.target;
    if (t.closest('.ls-panel, .ls-swipe, .ls-tip')) return;
    if (t.closest('button') && !t.closest('.ls-pad')) return;
    e.preventDefault();
  }, { passive: false });
  root.addEventListener('selectstart', (e) => e.preventDefault());
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump' };
  const onKeyDown = (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state.mode === 'pause') resume(); else pause();
      return;
    }
    const k = KEYMAP[e.code];
    if (k && (state.mode === 'play' || state.mode === 'tutorial')) {
      e.preventDefault();
      if (!e.repeat) { keys.add(k); syncKeys(); }
    }
  };
  const onKeyUp = (e) => {
    const k = KEYMAP[e.code];
    if (k && keys.delete(k)) syncKeys();
  };
  const onHidden = () => { if (document.hidden) pause('away'); };
  // 有些瀏覽器關掉分頁、App 被系統收掉時只送 pagehide
  const onPageHide = () => saveRun();

  // ---------- 返回手勢：只會暫停，不會離開 ----------
  // 手機橫拿時大拇指就在螢幕邊緣，很容易順手滑出「上一頁」（iPhone 從左邊、Android 兩邊都是）；
  // 從 LINE、Messenger 點開的網頁沒有上一頁，一滑整個瀏覽器就關掉了
  // 所以打開遊戲時先多墊一層瀏覽紀錄：滑到「上一頁」只會退掉這一層，遊戲收到後往回一步再墊回去——
  //   遊戲中 → 暫停，暫停／結算 → 回標題，標題 → 離開小遊戲（這時才真的退出，不會把人困住）
  const GUARD = { linggouSkate: true };
  const guarded = () => history.state?.linggouSkate === true;
  const onPopState = () => {
    if (state.mode === 'play' || state.mode === 'tutorial' || state.mode === 'count') pause('back');
    else if (state.mode === 'pause' || state.mode === 'over') home();
    else { close(false); return; }
    history.pushState(GUARD, '');
  };
  const portrait = matchMedia('(orientation: portrait) and (max-width: 820px)');
  const onPortrait = (e) => { if (e.matches) pause(); };

  // ---------- 開關 ----------
  function open() {
    // 底下頁面若還有選起來的文字，iPhone 的「拷貝」選單會一直浮在遊戲上面
    window.getSelection()?.removeAllRanges();
    setMuted(save.muted);
    reset(false);
    home();
    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onHidden);
    portrait.addEventListener('change', onPortrait);
    addEventListener('resize', checkBars);
    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
    addEventListener('pointercancel', onPointerUp);
    addEventListener('touchend', onTouchEnd);
    addEventListener('touchcancel', onTouchEnd);
    addEventListener('blur', releaseAll);
    addEventListener('pagehide', onPageHide);
    addEventListener('popstate', onPopState);
    if (!guarded()) history.pushState(GUARD, '');
    releaseAll();
    swipeSkipped = false;
    updateFsButtons();
    checkBars();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    $('.ls-title-actions .primary')?.focus({ preventScroll: true });
  }
  // byButton：按 ✕ 離開時，把打開時墊的那一層瀏覽紀錄退掉；滑「上一頁」離開的已經退過了
  function close(byButton) {
    state.mode = 'title';
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    document.removeEventListener('visibilitychange', onHidden);
    portrait.removeEventListener('change', onPortrait);
    removeEventListener('resize', checkBars);
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('pointerup', onPointerUp);
    removeEventListener('pointercancel', onPointerUp);
    removeEventListener('touchend', onTouchEnd);
    removeEventListener('touchcancel', onTouchEnd);
    removeEventListener('blur', releaseAll);
    removeEventListener('pagehide', onPageHide);
    removeEventListener('popstate', onPopState);
    if (byButton && guarded()) history.back();
    releaseAll();
    hideSwipe();
    onClose?.();
  }

  // 網址加上 #debug 可以從主控台快轉測試
  if (location.hash === '#debug') window.__ls = { get run() { return run; }, get dog() { return dog; }, get items() { return items; }, plats, input, state, update, render, startRun, startTutorial, gameOver, continueRun, T, wake: wakeAudio };

  return { open };
}
