'use strict';
/* =========================================================
 * gen-icon-bboxes —— 离线预计算图标包围盒（Δ23/Bug2 重写）
 *
 * 产物：src/data/icon-bboxes.js（window.STM_ICON_BBOXES = [{sx,sy,sw,sh}, ...]）
 * 运行：node tools/gen-icon-bboxes.js
 *       node tools/gen-icon-bboxes.js --report   # 只打印统计，不写文件
 *
 * 【为什么需要离线预计算】
 *   `file://` 下 canvas 读 sheet png 会被判定跨源污染，getImageData 抛
 *   SecurityError → 运行时无法算包围盒。故把结果预计算成 JS 常量随页面加载。
 *
 * 【Δ23 口径修正（相对旧 tools/normalize-sheets.js）】
 *   ① 格数 15 → **16**：6 张图集均为 4×4 满格（实测 96 格全部有图），
 *      base 步进 MUST 为 16（0/16/32/48/64/80）。旧脚本按 15 步进导致
 *      每张第 16 格与下一张第 1 格索引撞车，75/90 个花色取到错格 →
 *      白兔左脸/红鲸鱼头部/白牦牛左侧身体被裁切。
 *   ② 边界内缩 5%（25px）→ **只忽略最外圈 2px**：5% 内缩会把贴边的
 *      耳朵/尾鳍/角直接切掉。
 *   ③ 非白阈值 242 → **246**：旧 242 会漏掉 243~250 的浅色绒毛。
 *      不能取 252 —— 实测 sheet1 在 <252 下有 47% 像素被判非白
 *      （AI 生成图的柔和背景渐变本身就是 252~255），包围盒退化为整格
 *      508×508，图标被缩到约 45% 反而更小更糊。
 *   ④ 四周外扩 **8px** 并取**正方形**（size = max(w,h)，按中心对齐，
 *      再夹回本格内）：正方形保证 `scale = min(...)` 两轴同倍率，
 *      非正方形会导致「窄高图被横向拉伸」的观感。
 *   ⑤ 连通域 < 3px 的孤立噪点剔除（JPEG 振铃/压缩噪点）。
 *
 * 【零依赖】
 *   解码用 ffmpeg（-f rawvideo -pix_fmt rgb24），统计用 TypedArray。
 *   不引 PIL / numpy / 任何 npm 包（宪章原则 II）。
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'data', 'icon-bboxes.js');

const SHEET_COUNT = 6;
const GRID = 4;                 /* 4×4 格 */
const CELLS_PER_SHEET = 16;     /* 满格：96 个花色 = 6 × 16 */
const EDGE = 2;                 /* 只忽略最外圈 2px */
const THR = 246;                /* 非白阈值：任一通道 < THR 即墨迹 */
const PAD = 8;                  /* 四周外扩 8px */
const MIN_COMP = 3;             /* 连通域 < 3px 视为噪点剔除 */

function probeSize(file) {
  const s = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const p = s.trim().split(',');
  return { W: parseInt(p[0], 10), H: parseInt(p[1], 10) };
}

function decode(file) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo',
    '-pix_fmt', 'rgb24', '-'], { maxBuffer: 512 * 1024 * 1024 });
}

/* 8 邻域连通域，剔除像素数 < minPx 的孤立噪点 */
function dropIsolated(mask, w, h, minPx) {
  const keep = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const members = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    let sp = 0, cnt = 0;
    stack[sp++] = i; seen[i] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      members[cnt++] = p;
      const y = (p / w) | 0, x = p - y * w;
      const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : h - 1;
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : w - 1;
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
        }
      }
    }
    if (cnt >= minPx) for (let k = 0; k < cnt; k++) keep[members[k]] = 1;
  }
  return keep;
}

/* 单格包围盒（返回绝对值坐标 + 正方形 + 外扩 + 夹回本格） */
function cellBBox(buf, W, x0, y0, cw, ch) {
  const xLo = x0 + EDGE, yLo = y0 + EDGE;
  const w = cw - EDGE * 2, h = ch - EDGE * 2;
  const mask = new Uint8Array(w * h);
  let ink = 0;
  for (let y = 0; y < h; y++) {
    const rowBase = ((yLo + y) * W + xLo) * 3;
    for (let x = 0; x < w; x++) {
      const pi = rowBase + x * 3;
      if (buf[pi] < THR || buf[pi + 1] < THR || buf[pi + 2] < THR) { mask[y * w + x] = 1; ink++; }
    }
  }
  const keep = dropIsolated(mask, w, h, MIN_COMP);
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!keep[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    /* 空单元：整格兜底（绝不产出 0 尺寸 bbox） */
    return { sx: x0, sy: y0, sw: cw, sh: ch, ink: ink, empty: true };
  }
  /* 1) 外扩 PAD */
  let bx0 = xLo + minX - PAD, by0 = yLo + minY - PAD;
  let bx1 = xLo + maxX + PAD, by1 = yLo + maxY + PAD;
  /* 2) 取正方形：size = max(bw,bh)，围绕当前中心扩张 */
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
  let size = Math.max(bw, bh);
  if (size > cw) size = cw;                 /* 不超过一格 */
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  let sx = Math.round(cx - size / 2), sy = Math.round(cy - size / 2);
  /* 3) 夹回本格内（保证不与邻格重叠） */
  if (sx < x0) sx = x0;
  if (sy < y0) sy = y0;
  if (sx + size > x0 + cw) sx = x0 + cw - size;
  if (sy + size > y0 + ch) sy = y0 + ch - size;
  return { sx: sx, sy: sy, sw: size, sh: size, ink: ink, empty: false };
}

const report = process.argv.indexOf('--report') >= 0;
const bboxes = [];
const stats = [];
let minSide = 1e9, maxSide = 0, empties = 0;

for (let sheet = 1; sheet <= SHEET_COUNT; sheet++) {
  const file = path.join(ROOT, 'assets', 'icons', 'sheet' + sheet + '.png');
  if (!fs.existsSync(file)) throw new Error('缺少素材: ' + file);
  const { W, H } = probeSize(file);
  const buf = decode(file);
  const cw = Math.floor(W / GRID), ch = Math.floor(H / GRID);
  for (let cell = 0; cell < CELLS_PER_SHEET; cell++) {
    const row = (cell / GRID) | 0, col = cell % GRID;
    const b = cellBBox(buf, W, col * cw, row * ch, cw, ch);
    if (b.empty) empties++;
    if (b.sw < minSide) minSide = b.sw;
    if (b.sw > maxSide) maxSide = b.sw;
    bboxes.push({ sx: b.sx, sy: b.sy, sw: b.sw, sh: b.sh });
    stats.push('sheet' + sheet + '#' + String(cell).padStart(2, '0') +
      ' suit' + String((sheet - 1) * CELLS_PER_SHEET + cell).padStart(2, '0') +
      '  ' + b.sw + 'x' + b.sh + '@' + b.sx + ',' + b.sy + '  ink=' + b.ink);
  }
}

const expect = SHEET_COUNT * CELLS_PER_SHEET;
if (bboxes.length !== expect) {
  throw new Error('expected ' + expect + ' bboxes, got ' + bboxes.length);
}

if (report) {
  console.log(stats.join('\n'));
  console.log('\n合计 ' + bboxes.length + ' 条  边长 ' + minSide + '~' + maxSide +
    '  空单元 ' + empties + '  THR<' + THR + ' EDGE=' + EDGE + ' PAD=' + PAD);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT,
    'var _stmRoot = (typeof window !== "undefined") ? window : ' +
    '(typeof globalThis !== "undefined" ? globalThis : global); ' +
    '_stmRoot.STM_ICON_BBOXES = ' + JSON.stringify(bboxes) + ';\n', 'utf8');
  console.log('[gen-icon-bboxes] wrote ' + bboxes.length + ' entries → ' + OUT);
  console.log('  边长 ' + minSide + '~' + maxSide + '  空单元 ' + empties +
    '  THR<' + THR + ' EDGE=' + EDGE + ' PAD=' + PAD);
}
