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
for (let sheet = 1; sheet <= SHEETS; sheet++) {
  const file = path.join(ROOT, 'assets', 'icons', 'sheet' + sheet + '.png');
  if (!fs.existsSync(file)) { ok(false, '缺少素材 ' + file); continue; }
  const buf = decode(file);
  for (let cell = 0; cell < CELLS; cell++) {
    const suit = (sheet - 1) * CELLS + cell;
    const b = bboxes[suit];
    const gx = (cell % GRID) * CW, gy = Math.floor(cell / GRID) * CH;
    let strong = 0, inside = 0;
    for (let y = gy; y < gy + CH; y++) {
      for (let x = gx; x < gx + CW; x++) {
        const pi = (y * (GRID * CW) + x) * 3;
        if (buf[pi] < STRONG || buf[pi + 1] < STRONG || buf[pi + 2] < STRONG) {
          strong++;
          if (x >= b.sx && x < b.sx + b.sw && y >= b.sy && y < b.sy + b.sh) inside++;
        }
      }
    }
    const cover = strong === 0 ? 1 : inside / strong;
    if (cover < worst) { worst = cover; worstSuit = suit; }
  }
}
console.log('    最差覆盖率: ' + (worstSuit < 0 ? '全部 100%' :
  ('suit' + worstSuit + ' = ' + (worst * 100).toFixed(2) + '%')));
ok(worst >= MIN_COVER, '96 个花色强墨迹覆盖率 ≥ ' + (MIN_COVER * 100) + '%',
  '最差 suit' + worstSuit + ' = ' + (worst * 100).toFixed(2) + '%');

console.log('\n──────────── 结果 ────────────');
console.log('通过 ' + passes + ' / 失败 ' + fails);
process.exit(fails > 0 ? 1 : 0);
