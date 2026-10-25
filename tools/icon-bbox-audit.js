'use strict';
/* =========================================================
 * icon-bbox-audit —— 离线包围盒独立校验（Δ23/Bug2）
 *
 * 运行：node tools/icon-bbox-audit.js        退出码 0 = 全过
 *
 * 与 gen-icon-bboxes.js 的区别：本工具**不复用生成逻辑**，而是用一套
 * 更严格的独立口径去「反证」产物是对的：
 *   ① 条数 = 96（6 张 × 16 格满格）
 *   ② 每条 bbox 落在自己那一格内（越界 = 会切到邻格内容）
 *   ③ 每条 bbox 覆盖该格「强墨迹」（任一通道 < 200）像素 ≥ 99.5%
 *      —— 强墨迹是与背景（252~255）完全无歧义的部分，
 *         只要它全在框内，就绝不会出现「动物被切掉一块」
 *   ④ 相邻 suit 的 bbox 不得逐字相同（错格的直接指纹）
 *
 * 零依赖：ffmpeg / ffprobe 解码，原生 TypedArray 统计。
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'data', 'icon-bboxes.js');

const SHEETS = 6, GRID = 4, CELLS = 16, CW = 512, CH = 512;
const STRONG = 200;          /* 强墨迹阈值 */
const MIN_COVER = 0.995;     /* 强墨迹必须被框住的比例 */

let fails = 0, passes = 0;
function ok(cond, label, extra) {
  if (cond) { passes++; console.log('  ✓ ' + label); }
  else { fails++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}

function loadBBoxes() {
  const src = fs.readFileSync(SRC, 'utf8');
  const m = src.match(/=\s*(\[[\s\S]*\])\s*;/);
  if (!m) throw new Error('无法从 icon-bboxes.js 解析数组');
  return JSON.parse(m[1]);
}

function decode(file) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo',
    '-pix_fmt', 'rgb24', '-'], { maxBuffer: 512 * 1024 * 1024 });
}

const bboxes = loadBBoxes();
console.log('\n[1] 条数与几何');
ok(bboxes.length === SHEETS * CELLS, '条数 = 96（6 张 × 16 格满格）', '实测 ' + bboxes.length);

let nonSquare = 0, outOfCell = 0, badSize = 0;
for (let k = 0; k < bboxes.length; k++) {
  const b = bboxes[k];
  const cell = k % CELLS, sheet = Math.floor(k / CELLS);
  const gx = (cell % GRID) * CW, gy = Math.floor(cell / GRID) * CH;
  if (b.sw !== b.sh) nonSquare++;
  if (!(b.sw >= 64 && b.sw <= CW)) badSize++;
  if (b.sx < gx || b.sy < gy || b.sx + b.sw > gx + CW || b.sy + b.sh > gy + CH) {
    if (outOfCell === 0) console.log('    [首个越界] suit' + k + ' sheet' + (sheet + 1) +
      ' cell' + cell + ' bbox=(' + b.sx + ',' + b.sy + ',' + b.sw + ',' + b.sh + ')');
    outOfCell++;
  }
}
ok(nonSquare === 0, '全部为正方形（两轴同倍率缩放）', '非正方形 ' + nonSquare);
ok(outOfCell === 0, '全部落在自己那一格内（不切邻格）', '越界 ' + outOfCell);
ok(badSize === 0, '边长 64~512 合理区间', '异常 ' + badSize);

console.log('\n[2] 相邻 suit 错格指纹');
let dupAdj = 0;
for (let k = 1; k < bboxes.length; k++) {
  const a = bboxes[k - 1], b = bboxes[k];
  if (a.sx === b.sx && a.sy === b.sy && a.sw === b.sw && a.sh === b.sh) dupAdj++;
}
ok(dupAdj === 0, '相邻 suit 的 bbox 互不相同（无重复注册）', '重复 ' + dupAdj);

console.log('\n[3] 强墨迹覆盖率（阈值 < ' + STRONG + '）');
let worst = 1, worstSuit = -1;
/* Δ24: 同时统计「可见主体占框比」——THR 235 可见范围长边 / bbox 长边。
 * 这是「卡牌图标有的大有的小」的离线代理指标：包围盒若被柔和投影撑大，
 * 可见主体只占框的一小块，渲染出来自然显小。
 * 之所以取 235 而不是 200（强墨迹）：浅色主体（白牦牛/白兔/天鹅/白鸟）
 * 的实体大量落在 200~244 区间，用 200 当基准会把它们误判成「框过大」。 */
const VIS = 235;
const fillRatios = [];
for (let sheet = 1; sheet <= SHEETS; sheet++) {
  const file = path.join(ROOT, 'assets', 'icons', 'sheet' + sheet + '.png');
  if (!fs.existsSync(file)) { ok(false, '缺少素材 ' + file); continue; }
  const buf = decode(file);
  for (let cell = 0; cell < CELLS; cell++) {
    const suit = (sheet - 1) * CELLS + cell;
    const b = bboxes[suit];
    const gx = (cell % GRID) * CW, gy = Math.floor(cell / GRID) * CH;
    let strong = 0, inside = 0;
    let vMinX = 1e9, vMinY = 1e9, vMaxX = -1, vMaxY = -1;
    for (let y = gy; y < gy + CH; y++) {
      for (let x = gx; x < gx + CW; x++) {
        const pi = (y * (GRID * CW) + x) * 3;
        const r0 = buf[pi], g0 = buf[pi + 1], b0 = buf[pi + 2];
        if (r0 < STRONG || g0 < STRONG || b0 < STRONG) {
          strong++;
          if (x >= b.sx && x < b.sx + b.sw && y >= b.sy && y < b.sy + b.sh) inside++;
        }
        if (r0 < VIS || g0 < VIS || b0 < VIS) {
          if (x < vMinX) vMinX = x;
          if (x > vMaxX) vMaxX = x;
          if (y < vMinY) vMinY = y;
          if (y > vMaxY) vMaxY = y;
        }
      }
    }
    const cover = strong === 0 ? 1 : inside / strong;
    if (cover < worst) { worst = cover; worstSuit = suit; }
    if (vMaxX >= 0) {
      const visLong = Math.max(vMaxX - vMinX + 1, vMaxY - vMinY + 1);
      fillRatios.push({ suit: suit, r: visLong / b.sw, visLong: visLong, box: b.sw });
    }
  }
}
console.log('    最差覆盖率: ' + (worstSuit < 0 ? '全部 100%' :
  ('suit' + worstSuit + ' = ' + (worst * 100).toFixed(2) + '%')));
ok(worst >= MIN_COVER, '96 个花色强墨迹覆盖率 ≥ ' + (MIN_COVER * 100) + '%',
  '最差 suit' + worstSuit + ' = ' + (worst * 100).toFixed(2) + '%');

console.log('\n[4] 可见主体占框比（Δ24：图标大小一致性的离线代理）');
fillRatios.sort((a, b) => a.r - b.r);
const MIN_FILL = 0.90;
const bad4 = fillRatios.filter(o => o.r < MIN_FILL);
console.log('    最低 5 个: ' + fillRatios.slice(0, 5).map(o =>
  'suit' + o.suit + '=' + (o.r * 100).toFixed(1) + '%').join(' '));
console.log('    中位: ' + (fillRatios[(fillRatios.length / 2) | 0].r * 100).toFixed(1) + '%');
ok(bad4.length === 0,
  '96 个花色可见主体占框比 ≥ ' + (MIN_FILL * 100) + '%（包围盒未被柔和投影撑大）',
  '不达标 ' + bad4.length + ' 个: ' + bad4.slice(0, 6).map(o =>
    'suit' + o.suit + '=' + (o.r * 100).toFixed(1) + '%').join(' '));

console.log('\n──────────── 结果 ────────────');
console.log('通过 ' + passes + ' / 失败 ' + fails);
process.exit(fails > 0 ? 1 : 0);
