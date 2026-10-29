// 成就上線前就在用網站的人：把當時已經存下來的紀錄補記進成就，達標的直接算完成
// 補記的成就不跳通知（不然一進來就連跳好幾個），只在泡泡上亮紅點；泡泡出現時會介紹一次成就
// 每次打開網站都會跑一次，已經記過的不會重複計算
//
// 上線前有存下來、可以補記的：
//   扭蛋圖鑑收集到的照片（collection）→ 收集照片、珍藏、麻吉、令狗的成就
//   有收集到照片就一定扭過蛋 → 「聖誕快樂」
//   帶麻吉去公園的最佳紀錄（maji-walk-best）→ 走到 300 / 600 / 1000 公尺
//   跟令狗一起收集紅蘿蔔玩過幾局（linggou-skate 的 plays）→ 玩 30 次
//   跟令狗一起收集紅蘿蔔累積收集幾根（linggou-skate 的 total）→ 累積 520 / 1314 根
// 上線前沒有記錄、只能從零開始的：走不到 100 公尺、帶麻吉去公園玩幾次、5 條命／沒撞到抵達公園、看過哪些婚紗照、點愛心、清積雪、四季、日夜、聽完音樂

import { load } from '../storage.js';
import { markItem, recordMax } from './progress.js';

export function creditEarlierProgress() {
  const collection = load('collection', {});
  const photos = Array.isArray(collection.files) ? collection.files : [];
  if (photos.length) {
    markItem('photos', photos, { quiet: true });
    recordMax('gachaSpins', 1, { quiet: true });
  }

  const walk = load('maji-walk-best', {});
  const meters = Number(walk?.meters) || 0;
  if (meters > 0) recordMax('walkMeters', meters, { quiet: true });

  const skatePlays = Number(load('linggou-skate', {})?.plays) || 0;
  if (skatePlays > 0) recordMax('skatePlays', skatePlays, { quiet: true });

  const skateTotal = Number(load('linggou-skate', {})?.total) || 0;
  if (skateTotal > 0) recordMax('skateTotal', skateTotal, { quiet: true });
}
