'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'src', 'data', 'icon-bboxes.js');

const py = [  'import json, os',
  'from PIL import Image',
  'import numpy as np',
  '',
  'out = []',
  'for sheet in range(1, 7):',
  '    im = Image.open(os.path.join(\"assets\", \"icons\", \"sheet%d.png\" % sheet)).convert(\"RGB\")',
  '    arr = np.array(im)',
  '    H, W = arr.shape[0], arr.shape[1]',
  '    cw, ch = W // 4, H // 4',
  '    for cell in range(16):',
  '        row, col = cell // 4, cell % 4',
  '        x0, y0 = col * cw, row * ch',
  '        # shrink 5%',
  '        mx = int(cw * 0.05)',
  '        my = int(ch * 0.05)',
  '        x_lo, x_hi = x0 + mx, x0 + cw - mx',
  '        y_lo, y_hi = y0 + my, y0 + ch - my',
  '        region = arr[y_lo:y_hi, x_lo:x_hi]',
  '        mask = (region[:,:,0] < 242) | (region[:,:,1] < 242) | (region[:,:,2] < 242)',
  '        # connected components 8-dir, remove components < 3 pixels',
  '        # simple BFS',
  '        h, w = mask.shape',
  '        visited = np.zeros((h,w), dtype=bool)',
  '        keep = np.zeros((h,w), dtype=bool)',
  '        for yy in range(h):',
  '            for xx in range(w):',
  '                if mask[yy,xx] and not visited[yy,xx]:',
  '                    # BFS',
  '                    stack=[(yy,xx)]',
  '                    comp=[]',
  '                    visited[yy,xx]=True',
  '                    while stack:',
  '                        cy,cx=stack.pop()',
  '                        comp.append((cy,cx))',
  '                        for ny in range(max(0,cy-1), min(h,cy+2)):',
  '                            for nx in range(max(0,cx-1), min(w,cx+2)):',
  '                                if mask[ny,nx] and not visited[ny,nx]:',
  '                                    visited[ny,nx]=True',
  '                                    stack.append((ny,nx))',
  '                    if len(comp) >= 3:',
  '                        for (cy,cx) in comp:',
  '                            keep[cy,cx]=True',
  '        ys, xs = np.where(keep)',
  '        if ys.size == 0:',
  '            sx, sy, sw, sh = x0, y0, cw, ch',
  '        else:',
  '            sx = int(xs.min()) + x_lo',
  '            sy = int(ys.min()) + y_lo',
  '            sw = int(xs.max() - xs.min() + 1)',
  '            sh = int(ys.max() - ys.min() + 1)',
  '        out.append({\"sx\": sx, \"sy\": sy, \"sw\": sw, \"sh\": sh})',
  '',
  'print(json.dumps(out))',
].join('\n');

const stdout = execFileSync('python', ['-'], { cwd: root, input: py, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const bboxes = JSON.parse(stdout.trim());
if (!Array.isArray(bboxes) || bboxes.length !== 96) {
  throw new Error('expected 96 bboxes, got ' + (bboxes && bboxes.length));
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, 'var _stmRoot = (typeof window !== "undefined") ? window : (typeof globalThis !== "undefined" ? globalThis : global); _stmRoot.STM_ICON_BBOXES = ' + JSON.stringify(bboxes) + ';\\n', 'utf8');
console.log('[normalize-sheets] wrote', bboxes.length, 'entries to', outPath);
