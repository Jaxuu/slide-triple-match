'use strict';
/* =========================================================
 * normalize-audio —— 8 个音频素材的响度归一化（Δ23/Bug1 治本）
 *
 * 运行：
 *   node tools/normalize-audio.js            # 归一化并覆写 assets/audio/*.mp3
 *   node tools/normalize-audio.js --check    # 只测量并校验是否达标（不写文件）
 *
 * 【为什么需要】
 *   原始 8 个文件未做响度对齐，integrated LUFS 跨 **21 dB**：
 *     bgm_lobby  −31.90   bgm_game   −16.98
 *     sfx_lose   −31.05   sfx_win    −20.42   sfx_shatter −25.85
 *     voice_good −18.98   voice_great −14.31  voice_unbelievable −10.84
 *   即使播放音量按 0.45/0.38 调过，两条 BGM 的实际出声电平仍差 13.4 dB，
 *   表现为「大厅 BGM 还是听不见」。改音量是治标，统一素材响度才是治本。
 *
 * 【口径】
 *   BGM（>3s，可用 loudnorm 两遍法）：
 *     目标 I = -18 LUFS / TP = -2.0 dBTP / LRA = 20（linear=true 尽量不动动态）
 *     → 出声电平 = -18 + 20*log10(volume)：
 *        lobby 0.45 → -24.9 LUFS ；game 0.38 → -26.4 LUFS
 *        （1.5 dB 的差是 0.45 vs 0.38 的**设计差**，不再是 15.5 dB 的事故差）
 *   ONE-SHOT（<1.5s，loudnorm 的积分门限不可靠 → 用确定性增益 + 限幅）：
 *     事件音效 I = -14 LUFS ；语音 I = -13 LUFS ；TP 统一 -1.5 dBTP
 *
 * 【混音层级（出声电平）】
 *   语音 -14.4  >  碎裂 -15.4  >  通关 -17.1  >  失败 -18.2
 *              >  大厅 BGM -24.9  >  局内 BGM -26.4
 *
 * 【依赖】ffmpeg / ffprobe（与 tools/gen-icon-bboxes.js 同一条「零 npm」路线）
 * 【还原】素材已入库，`git checkout -- assets/audio/` 可随时回滚
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'audio');

const PLAN = {
  'bgm_lobby.mp3': { kind: 'bgm', I: -18, TP: -2.0, LRA: 20, bitrate: '256k' },
  'bgm_game.mp3': { kind: 'bgm', I: -18, TP: -2.0, LRA: 20, bitrate: '256k' },
  'sfx_shatter.mp3': { kind: 'oneshot', I: -14, TP: -1.5, bitrate: '192k' },
  'sfx_win.mp3': { kind: 'oneshot', I: -14, TP: -1.5, bitrate: '192k' },
  'sfx_lose.mp3': { kind: 'oneshot', I: -14, TP: -1.5, bitrate: '192k' },
  'sfx_voice_good.mp3': { kind: 'oneshot', I: -13, TP: -1.5, bitrate: '192k' },
  'sfx_voice_great.mp3': { kind: 'oneshot', I: -13, TP: -1.5, bitrate: '192k' },
  'sfx_voice_unbelievable.mp3': { kind: 'oneshot', I: -13, TP: -1.5, bitrate: '192k' }
};

/* 实测容差：I ±1.5 dB / TP ≤ -0.8 dBTP */
const TOL_I = 1.5;
const TP_CEIL = -0.8;

const CHECK = process.argv.indexOf('--check') >= 0;

/* loudnorm 的 print_format=json 走 stderr —— 必须用 spawnSync 抓 stderr */
function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file,
    '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const text = (r.stderr || '') + (r.stdout || '');
  const m = parse(text);
  if (!isFinite(m.I)) throw new Error('loudnorm 测量失败: ' + file + '\n' + text.slice(-600));
  return m;
}

function parse(text) {
  function pick(k) {
    const m = text.match(new RegExp('"' + k + '"\\s*:\\s*"([-0-9.]+)"'));
    return m ? parseFloat(m[1]) : NaN;
  }
  return {
    I: pick('input_i'), TP: pick('input_tp'), LRA: pick('input_lra'),
    thresh: pick('input_thresh'), offset: pick('target_offset')
  };
}

function duration(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
}

/* BGM：loudnorm 两遍法（第一遍测量，第二遍带 measured_* 线性归一） */
function normalizeBgm(src, dst, cfg) {
  const m = measure(src);
  const ln = 'loudnorm=I=' + cfg.I + ':TP=' + cfg.TP + ':LRA=' + cfg.LRA +
    ':measured_I=' + m.I + ':measured_TP=' + m.TP + ':measured_LRA=' + m.LRA +
    ':measured_thresh=' + m.thresh + ':offset=' + (isFinite(m.offset) ? m.offset : 0) +
    ':linear=true:print_format=json';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', ln,
    '-c:a', 'libmp3lame', '-b:a', cfg.bitrate, dst], { stdio: 'inherit' });
  return m;
}

/* 一次性音效：确定性增益 + alimiter（limit = 10^(TP/20)） */
function normalizeOneShot(src, dst, cfg) {
  const m = measure(src);
  const gain = cfg.I - m.I;
  const limit = Math.pow(10, cfg.TP / 20);
  const af = 'volume=' + gain.toFixed(2) + 'dB,' +
    'alimiter=limit=' + limit.toFixed(4) + ':attack=5:release=50:level=false';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', af,
    '-c:a', 'libmp3lame', '-b:a', cfg.bitrate, dst], { stdio: 'inherit' });
  return { m: m, gain: gain };
}

const names = Object.keys(PLAN);
const rows = [];
let bad = 0;

for (const name of names) {
  const src = path.join(DIR, name);
  if (!fs.existsSync(src)) { console.error('缺少素材 ' + src); bad++; continue; }
  const cfg = PLAN[name];
  const dur0 = duration(src);

  if (CHECK) {
    const m = measure(src);
    const dev = Math.abs(m.I - cfg.I);
    const okI = dev <= TOL_I;
    const okTP = m.TP <= TP_CEIL;
    if (!okI || !okTP) bad++;
    rows.push({ name, dur: dur0, before: m, after: m, target: cfg, ok: okI && okTP });
    continue;
  }

  const tmp = src + '.tmp.mp3';
  let before;
  if (cfg.kind === 'bgm') {
    before = normalizeBgm(src, tmp, cfg);
  } else {
    before = normalizeOneShot(src, tmp, cfg).m;
  }
  const after = measure(tmp);
  const dur1 = duration(tmp);
  /* 时长漂移超过 30ms 视为异常（防止误加静音/裁切） */
  const durOk = Math.abs(dur1 - dur0) < 0.03;
  const okI = Math.abs(after.I - cfg.I) <= TOL_I;
  const okTP = after.TP <= TP_CEIL;
  const ok = okI && okTP && durOk;
  if (!ok) bad++;
  rows.push({ name, dur: dur0, before, after, target: cfg, ok: ok, durOk: durOk });
  if (ok) { fs.renameSync(tmp, src); } else { try { fs.unlinkSync(tmp); } catch (e) { } }
}

/* ---- 报告 ---- */
function f(v, n) { return isFinite(v) ? v.toFixed(n == null ? 2 : n) : '—'; }
console.log('\n' + (CHECK ? '【校验】' : '【归一化】') + ' assets/audio/ 响度');
console.log('文件'.padEnd(30) + '目标I'.padStart(7) + '原I'.padStart(9) + '新I'.padStart(9) +
  '新TP'.padStart(8) + '  结果');
for (const r of rows) {
  const src = CHECK ? r.before : r.after;
  console.log(r.name.padEnd(30) +
    f(r.target.I, 1).padStart(7) +
    f(r.before.I, 2).padStart(9) +
    f(src.I, 2).padStart(9) +
    f(src.TP, 2).padStart(8) +
    '  ' + (r.ok ? '✓' : '✗') + (r.durOk === false ? ' 时长漂移!' : ''));
}
console.log('\n' + (bad === 0 ? '全部达标' : bad + ' 项未达标') +
  '（I 容差 ±' + TOL_I + ' dB / TP ≤ ' + TP_CEIL + ' dBTP）');
process.exit(bad === 0 ? 0 : 1);
