'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'src', 'data', 'icon-bboxes.js');

const py = [
  'import json, os',
  'from PIL import Image',
  'import numpy as np',
  'out = []',
  'for sheet in range(1, 7):',
  '    base = (sheet - 1) * 15',
  '    im = Image.open(os.path.join("assets", "icons", "sheet%d.png" % sheet)).convert("RGB")',
  '    arr = np.array(im)',
  '    H, W = arr.shape[0], arr.shape[1]',
  '    cw, ch = W // 4, H // 4',
  '    for cell in range(15):',
  '        row, col = cell // 4, cell % 4',
  '        y0, x0 = row * ch, col * cw',
  '        cellpx = arr[y0:y0 + ch, x0:x0 + cw]',
  '        mask = (cellpx[:, :, 0] < 248) | (cellpx[:, :, 1] < 248) | (cellpx[:, :, 2] < 248)',
  '        ys, xs = np.where(mask)',
  '        if ys.size == 0:',
  '            sx, sy, sw, sh = x0, y0, cw, ch',
  '        else:',
  '            sx = int(xs.min()) + x0',
  '            sy = int(ys.min()) + y0',
  '            sw = int(xs.max() - xs.min() + 1)',
  '            sh = int(ys.max() - ys.min() + 1)',
  '        out.append({"sx": sx, "sy": sy, "sw": sw, "sh": sh})',
  'print(json.dumps(out))'
].join('\n');

const stdout = execFileSync('python', ['-'], { cwd: root, input: py, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const bboxes = JSON.parse(stdout.trim());
if (!Array.isArray(bboxes) || bboxes.length !== 90) {
  throw new Error('expected 90 bboxes, got ' + (bboxes && bboxes.length));
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, 'var _stmRoot = (typeof window !== "undefined") ? window : (typeof globalThis !== "undefined" ? globalThis : global); _stmRoot.STM_ICON_BBOXES = ' + JSON.stringify(bboxes) + ';\n', 'utf8');
console.log('[gen-icon-bboxes] wrote', bboxes.length, 'entries to', outPath);
