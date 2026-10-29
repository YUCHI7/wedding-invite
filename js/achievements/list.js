// 成就清單：全部列給訪客看，完成就跳出通知、加積分，婚禮當天用積分兌換小禮物
//
// ⚠️ 網站上線後，已經有的成就一律不要再改，只能新增 ⚠️
// 訪客的進度存在他們自己的瀏覽器裡，只記「完成了哪些成就（id）」，積分是每次打開網站時用這份清單即時加總的，所以：
//   - 改 points：所有人的積分立刻跟著變，已經有人拿著畫面來兌換、或已經比較過分數就對不起來
//   - 改 id：訪客已經完成的會被當成沒完成，那筆分數消失
//   - 刪掉成就：已經完成的人那筆分數消失
//   - 改 goal、stat、count：已經完成的人照樣算完成，但還沒完成的人條件變了，同一個成就兩種標準
// 唯一的例外是 name、desc、icon、tier 這些只影響顯示的欄位，修錯字可以，但意思不要變
// 婚紗剪影的照片數量也算在「婚紗鑑賞家」的條件裡：上線後新增婚紗照，還沒完成的人要多看幾張
//
// 每個成就：
//   id      用來記住訪客完成了哪些成就，每個成就都不一樣，上線後不能改
//   name    名稱
//   desc    內容（怎麼達成）
//   points  分數
//   icon    獎章上的圖案（emoji）
//   tier    獎章的材質：bronze 銅、silver 銀、gold 金、rainbow 彩虹（最難的）
//   stat    看哪一項紀錄（由網站各處用 progress.js 的 increment / recordMax / markItem 記錄）
//   goal    紀錄達到多少就完成
//   count   （可選）紀錄是一組項目時，怎麼算出目前進度；沒寫就是項目數量
//
// 新增成就：在清單最後加一筆，取一個沒用過的新 id；需要新的紀錄時，在對應的功能裡呼叫 increment / recordMax / markItem 記下來
// 如果訪客以前的紀錄就已經達標（例如新增「收集 5 張照片」），下次打開網站時會直接算完成（不跳通知，只亮紅點）
// 不想再讓人拿的成就也不要刪，留著讓已經完成的人保有分數

import { LOTTERY_PHOTOS, GALLERY_FEATURED, GALLERY_PHOTOS } from '../config.js';

// 婚禮當天出示成就畫面兌換獎品的說明
export const REDEEM_NOTE = '婚禮當天出示這個畫面，就能用積分兌換小禮物 🎁';

// 「帶麻吉去公園」的距離成就（公園在 1000 公尺外）
export const WALK_SHORT_METERS = 100;
export const WALK_TINY_METERS = 40;

// 麻吉、令狗的照片：檔名有「麻吉」「令狗」的扭蛋照片，之後新增的照片也會算進去
const files = (filter) => LOTTERY_PHOTOS.filter(filter).map((p) => p.file);
const MAJI_PHOTOS = files((p) => p.name.includes('麻吉'));
const LINGGOU_PHOTOS = files((p) => p.name.includes('令狗'));
const RARE_PHOTOS = files((p) => !p.downloadable);
const GALLERY_ALL = [GALLERY_FEATURED, ...GALLERY_PHOTOS.map((p) => p.src)];

// 一組項目裡有幾個在指定清單中（照片從清單拿掉就不再計入）
const within = (list) => (items) => list.filter((key) => items.has(key)).length;

export const ACHIEVEMENTS = [
  // ---------- 扭蛋 ----------
  { id: 'gacha-first', name: '聖誕快樂', desc: '第一次轉動聖誕扭蛋機', points: 5, icon: '🎄', tier: 'bronze', stat: 'gachaSpins', goal: 1 },
  { id: 'photos-10', name: '初次收藏', desc: '收集到 10 張扭蛋照片', points: 10, icon: '📸', tier: 'bronze', stat: 'photos', goal: 10 },
  { id: 'photos-15', name: '漸入佳境', desc: '收集到 15 張扭蛋照片', points: 15, icon: '📸', tier: 'bronze', stat: 'photos', goal: 15 },
  { id: 'photos-20', name: '小小收藏家', desc: '收集到 20 張扭蛋照片', points: 20, icon: '📸', tier: 'silver', stat: 'photos', goal: 20 },
  { id: 'photos-25', name: '回憶滿滿', desc: '收集到 25 張扭蛋照片', points: 25, icon: '📸', tier: 'silver', stat: 'photos', goal: 25 },
  { id: 'photos-30', name: '三十而立', desc: '收集到 30 張扭蛋照片', points: 40, icon: '📸', tier: 'gold', stat: 'photos', goal: 30 },
  { id: 'photos-rare', name: '珍藏初體驗', desc: '收集到第一張「珍藏」照片', points: 10, icon: '💎', tier: 'silver', stat: 'photos', goal: 1, count: within(RARE_PHOTOS) },
  { id: 'photos-maji', name: '麻吉頭號粉絲', desc: '收集到 10 張麻吉的照片', points: 20, icon: '🐶', tier: 'gold', stat: 'photos', goal: 10, count: within(MAJI_PHOTOS) },
  { id: 'photos-linggou', name: '令狗守護者', desc: '收集到 7 張令狗的照片', points: 15, icon: '🥕', tier: 'gold', stat: 'photos', goal: 7, count: within(LINGGOU_PHOTOS) },

  // ---------- 帶麻吉去公園 ----------
  { id: 'walk-300', name: '散步新手', desc: '「帶麻吉去公園」走到 300 公尺', points: 30, icon: '🐾', tier: 'bronze', stat: 'walkMeters', goal: 300 },
  { id: 'walk-600', name: '遛狗達人', desc: '「帶麻吉去公園」走到 600 公尺', points: 50, icon: '🦮', tier: 'silver', stat: 'walkMeters', goal: 600 },
  { id: 'walk-park', name: '抵達公園', desc: '「帶麻吉去公園」平安走到 1000 公尺外的公園', points: 100, icon: '🏞️', tier: 'rainbow', stat: 'walkMeters', goal: 1000 },
  { id: 'walk-short', name: '出師未捷', desc: `「帶麻吉去公園」走不到 ${WALK_SHORT_METERS} 公尺就結束`, points: 1, icon: '🩹', tier: 'bronze', stat: 'walkShort', goal: 1 },
  { id: 'walk-tiny', name: '寸步難行', desc: `「帶麻吉去公園」走不到 ${WALK_TINY_METERS} 公尺就結束`, points: 0.87, icon: '🐌', tier: 'bronze', stat: 'walkTiny', goal: 1 },
  { id: 'walk-plays-30', name: '每天都要散步', desc: '「帶麻吉去公園」玩 30 次', points: 30, icon: '📅', tier: 'silver', stat: 'walkPlays', goal: 30 },
  { id: 'walk-full-lives', name: '元氣滿滿', desc: '「帶麻吉去公園」抵達公園時還有 5 條命', points: 200, icon: '💖', tier: 'rainbow', stat: 'walkFullLives', goal: 1 },
  { id: 'walk-flawless', name: '毫髮無傷', desc: '「帶麻吉去公園」一次都沒撞到就抵達公園（無敵時撞到的不算）', points: 250, icon: '🛡️', tier: 'rainbow', stat: 'walkFlawless', goal: 1 },

  // ---------- 首頁 ----------
  { id: 'gallery-all', name: '婚紗鑑賞家', desc: '放大看過每一張婚紗照', points: 20, icon: '💍', tier: 'silver', stat: 'gallery', goal: GALLERY_ALL.length, count: within(GALLERY_ALL) },
  { id: 'love-10', name: '愛心連發', desc: '點月曆上 12/20 的愛心 10 次', points: 30, icon: '💗', tier: 'bronze', stat: 'loveTaps', goal: 10 },
  { id: 'snow-3', name: '鏟雪小幫手', desc: '把照片底下的積雪清乾淨 3 次', points: 15, icon: '⛄', tier: 'bronze', stat: 'snowCleared', goal: 3 },
  { id: 'seasons-3', name: '四季輪迴', desc: '在首頁經歷完整的春夏秋冬 3 次', points: 10, icon: '🌸', tier: 'silver', stat: 'seasonCycles', goal: 3 },
  { id: 'daynight-3', name: '日日夜夜', desc: '在首頁經歷完整的白天與夜晚 3 次', points: 20, icon: '🌙', tier: 'silver', stat: 'dayNightCycles', goal: 3 },
  { id: 'music-full', name: '知音', desc: '從頭到尾連續聽完一首背景音樂〈超越時空的思念〉', points: 20, icon: '🎵', tier: 'silver', stat: 'songPlays', goal: 1 },

  // ---------- 跟令狗一起收集紅蘿蔔 ----------
  { id: 'skate-20', name: '溜冰新手', desc: '「跟令狗一起收集紅蘿蔔」單局收集 20 根', points: 20, icon: '⛸️', tier: 'bronze', stat: 'skateCarrots', goal: 20 },
  { id: 'skate-50', name: '紅蘿蔔小販', desc: '「跟令狗一起收集紅蘿蔔」單局收集 50 根', points: 30, icon: '🥕', tier: 'silver', stat: 'skateCarrots', goal: 50 },
  { id: 'skate-100', name: '賣光紅蘿蔔', desc: '「跟令狗一起收集紅蘿蔔」單局收集 100 根', points: 40, icon: '🧺', tier: 'gold', stat: 'skateCarrots', goal: 100 },
  { id: 'skate-triple', name: '貪心的令狗', desc: '「跟令狗一起收集紅蘿蔔」一次放進 3 根紅蘿蔔', points: 10, icon: '🤲', tier: 'bronze', stat: 'skateTriple', goal: 1 },
  { id: 'skate-recover', name: '搶回來了！', desc: '「跟令狗一起收集紅蘿蔔」從麻吉嘴裡搶回紅蘿蔔', points: 20, icon: '🐶', tier: 'silver', stat: 'skateRecover', goal: 1 },
  { id: 'skate-slip', name: '屁股著地', desc: '「跟令狗一起收集紅蘿蔔」第一次滑倒', points: 1, icon: '🩹', tier: 'bronze', stat: 'skateSlip', goal: 1 },
  { id: 'skate-200', name: '地獄歸來', desc: '「跟令狗一起收集紅蘿蔔」單局收集 200 根', points: 100, icon: '🔥', tier: 'rainbow', stat: 'skateCarrots', goal: 200 },
  { id: 'skate-250', name: '紅蘿蔔之王', desc: '「跟令狗一起收集紅蘿蔔」單局收集 250 根', points: 200, icon: '👑', tier: 'rainbow', stat: 'skateCarrots', goal: 250 },
  { id: 'skate-plays-30', name: '溜冰場常客', desc: '「跟令狗一起收集紅蘿蔔」玩 30 次', points: 30, icon: '🎫', tier: 'silver', stat: 'skatePlays', goal: 30 },
  { id: 'skate-total-520', name: '我愛你', desc: '「跟令狗一起收集紅蘿蔔」累積收集 520 根', points: 10, icon: '💌', tier: 'silver', stat: 'skateTotal', goal: 520 },
  { id: 'skate-total-1314', name: '一生一世', desc: '「跟令狗一起收集紅蘿蔔」累積收集 1314 根', points: 20, icon: '💞', tier: 'gold', stat: 'skateTotal', goal: 1314 },
];
