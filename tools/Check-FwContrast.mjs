// 按 WCAG 2.1 相对亮度，对 src/styles.css 里「当前实际取值的 token」逐套配色重算对比度。
//
// 为什么单独写：字号并档后 11px 元信息变多、文件类型色板/缩略图渐变/海报/遮罩都是新增 token，
// 旧对比度基线（v1.0.7 / 扩展悬浮条）已经不是同一套取值，不能续用。
//
// 用法：
//   node tools/Check-FwContrast.mjs         人读表格 + 失败清单；有不达标时退出码 1
//   node tools/Check-FwContrast.mjs --json  JSON（CI 归档 / 生成文档用）
//
// 判定口径（WCAG 2.1 SC 1.4.3 / 1.4.11）：
//   · 正文类（< 18.5px，或 < 24px 且非粗体）要求 4.5:1；
//   · 大字号（≥ 24px，或 ≥ 18.5px 且粗体）要求 3:1；
//   · 图标/图形类装饰要求 3:1。
//   半透明底色按父层合成后再算；渐变取两端里更差的一端。
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const mdOut = args.includes('--md');
const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const cssPath = join(repoRoot, 'src', 'styles.css');
const raw = readFileSync(cssPath, 'utf8');

/* ---------------- 解析 token 定义 ---------------- */

const blocks = { root: new Map(), theme: { dark: new Map(), light: new Map() }, color: new Map() };
const blockRe = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = blockRe.exec(raw))) {
  const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  if (!/^(:root|html\[data-)/.test(sel)) continue;
  const decls = new Map();
  // 块内注释要先去掉：注释后的第一条声明会被误当成键名的一部分（--fs-caption 曾因此丢档）
  for (const part of m[2].replace(/\/\*[\s\S]*?\*\//g, ' ').split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k.startsWith('--')) decls.set(k, part.slice(i + 1).trim());
  }
  if (sel === ':root') {
    for (const [k, v] of decls) blocks.root.set(k, v);
    continue;
  }
  const th = /data-theme="(dark|light)"/.exec(sel);
  const co = /data-color="([a-z]+)"/.exec(sel);
  if (co) {
    const key = co[1] + '/' + (th ? th[1] : '');
    blocks.color.set(key, decls);
  } else if (th) {
    for (const [k, v] of decls) blocks.theme[th[1]].set(k, v);
  }
}

const COLORS = ['violet', 'azure', 'emerald', 'amber'];
const THEMES = ['dark', 'light'];
const COMBOS = THEMES.flatMap((t) => COLORS.map((c) => ({ theme: t, color: c })));

function varsOf(combo) {
  const vars = new Map(blocks.root);
  const base = blocks.theme[combo.theme];
  if (base) for (const [k, v] of base) vars.set(k, v);
  // 紫罗兰没有单独的 data-color 块，直接继承明暗基础块
  const themed = blocks.color.get(combo.color + '/' + combo.theme);
  if (themed) for (const [k, v] of themed) vars.set(k, v);
  return vars;
}

/* ---------------- 颜色解析 ---------------- */

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

function fnToRgb(s) {
  const m = /^rgba?\(([^)]+)\)$/i.exec(s.trim());
  if (!m) return null;
  const p = m[1].split(/[,/]/).map((x) => x.trim());
  const ch = (x) => (x.endsWith('%') ? (parseFloat(x) / 100) * 255 : parseFloat(x));
  return { r: ch(p[0]), g: ch(p[1]), b: ch(p[2]), a: p[3] == null ? 1 : parseFloat(p[3]) };
}

// color-mix(in srgb, A p%, B)：只支持本项目用到的写法（含 transparent、百分比二选一）。
function splitTop(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((x) => x.trim()).filter(Boolean);
}

function colorMix(s, vars) {
  const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'));
  const parts = splitTop(inner);
  const items = parts.slice(1).map((p) => {
    const pm = /^(.*?)\s+([\d.]+)%$/.exec(p);
    return { spec: pm ? pm[1].trim() : p, pct: pm ? parseFloat(pm[2]) : null };
  });
  if (items.length < 2) return null;
  let [a, b] = items;
  if (a.pct == null && b.pct != null) a.pct = 100 - b.pct;
  if (b.pct == null && a.pct != null) b.pct = 100 - a.pct;
  if (a.pct == null) { a.pct = 50; b.pct = 50; }
  const ca = parseColor(a.spec, vars), cb = parseColor(b.spec, vars);
  if (!ca || !cb) return null;
  const w = a.pct / 100, v = b.pct / 100;
  const alpha = ca.a * w + cb.a * v;
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mixCh = (x, y) => (x * ca.a * w + y * cb.a * v) / alpha;
  return { r: mixCh(ca.r, cb.r), g: mixCh(ca.g, cb.g), b: mixCh(ca.b, cb.b), a: alpha };
}

function parseColor(spec, vars, depth = 0) {
  if (!spec || depth > 8) return null;
  const s = spec.trim();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith('#')) return hexToRgb(s);
  if (/^rgba?\(/i.test(s)) return fnToRgb(s);
  if (/^color-mix\(/i.test(s)) return colorMix(s, vars);
  const vm = /^var\((--[a-z0-9-]+)\)$/.exec(s);
  if (vm) {
    const v = vars.get(vm[1]);
    return v == null ? null : parseColor(v, vars, depth + 1);
  }
  return null;
}

function over(fg, bg) {
  if (!fg) return null;
  if (fg.a >= 1) return fg;
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1
  };
}

function lum(c) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

function ratio(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* ---------------- 检查项 ---------------- */
// bg 里出现两个值表示渐变两端，取更差一端；over 是半透明色要合成的父层。

const PAIRS = [
  // 正文
  { group: '正文', label: '列表/详情正文', fg: '--fg', bg: ['--bg', '--panel', '--panel-2'], size: '--fs-base', weight: 500, where: '.t-name / body / 卡片' },
  // 次级文字
  { group: '次级文字', label: '次级文字（12px）', fg: '--fg-2', bg: ['--bg', '--panel', '--panel-2'], size: '--fs-body', where: '.muted / .t-size / .kv .k' },
  { group: '次级文字', label: '弱化文字（11–12px）', fg: '--fg-3', bg: ['--bg', '--bg-2', '--panel', '--panel-2'], size: '--fs-body', where: '.dim / .sec-d / .t-sub' },
  // 11px 小字单独一行：并档后元信息全落在这档，必须按 4.5:1 逐套核对
  { group: '次级文字', label: '弱化文字（11px）', fg: '--fg-3', bg: ['--bg', '--bg-2', '--panel', '--panel-2'], size: '--fs-caption', where: '.t-sub / .sb .n / .statusbar / .stat .k' },
  // 强调文字
  { group: '强调文字', label: '强调/链接文字', fg: '--accent', bg: ['--bg', '--bg-2', '--panel'], size: '--fs-base', where: '.sb.active .n / .hbtn.on' },
  { group: '强调文字', label: '强调文字在选中底上', fg: '--accent', bg: ['color-mix(in srgb,var(--accent) 13%,transparent)'], over: '--bg-2', size: '--fs-caption', where: '.sb.active .n（11px）' },
  // 主按钮
  { group: '主按钮', label: '主按钮白字（常态）', fg: '--accent-fg', bg: ['--accent-solid', '--accent-solid-2'], size: '--fs-body', weight: 600, where: '.btn.primary' },
  { group: '主按钮', label: '主按钮白字（悬停）', fg: '--accent-fg', bg: ['--accent-solid-hover', '--accent-solid'], size: '--fs-body', weight: 600, where: '.btn.primary:hover' },
  // 状态徽标
  { group: '状态徽标', label: '下载中', fg: 'color-mix(in srgb,var(--accent) 82%,var(--fg))', bg: ['color-mix(in srgb,var(--accent) 14%,transparent)'], over: '--bg', size: '--fs-caption', weight: 550, where: '.st.dl' },
  { group: '状态徽标', label: '排队中', fg: '--fg-2', bg: ['--panel-3'], size: '--fs-caption', weight: 550, where: '.st.wait' },
  { group: '状态徽标', label: '已完成', fg: '--ok', bg: ['color-mix(in srgb,var(--ok) 14%,transparent)'], over: '--bg', size: '--fs-caption', weight: 550, where: '.st.ok / .sb-badge' },
  { group: '状态徽标', label: '需处理', fg: '--err', bg: ['color-mix(in srgb,var(--err) 15%,transparent)'], over: '--bg', size: '--fs-caption', weight: 550, where: '.st.err / .tag.yt' },
  { group: '状态徽标', label: '已暂停', fg: '--warn', bg: ['color-mix(in srgb,var(--warn) 14%,transparent)'], over: '--bg', size: '--fs-caption', weight: 550, where: '.st.pause / .tag.auto' },
  { group: '状态徽标', label: '默认标签', fg: '--fg-2', bg: ['--panel-3'], size: '--fs-caption', where: '.tag（列表行内）' },
  { group: '状态徽标', label: '嗅探/类型标签', fg: '--info', bg: ['color-mix(in srgb,var(--info) 13%,transparent)'], over: '--bg', size: '--fs-caption', where: '.tag.hls' },
  { group: '状态徽标', label: '成功按钮文字', fg: '--ok', bg: ['color-mix(in srgb,var(--ok) 16%,var(--panel))'], size: '--fs-body', weight: 600, where: '.btn.ok' },
  // 输入框占位
  { group: '次级文字', label: '输入框占位符', fg: '--fg-3', bg: ['--panel'], size: '--fs-body', where: '.field input::placeholder' },
  // 文件类型缩略图（渐变，取两端更差者）
  { group: '文件类型色板', label: '视频缩略图', fg: '--file-video-fg', bg: ['--file-video-1', '--file-video-2'], size: '--fs-caption', weight: 700, icon: true, where: '.thumb.v' },
  { group: '文件类型色板', label: '音频缩略图', fg: '--file-audio-fg', bg: ['--file-audio-1', '--file-audio-2'], size: '--fs-caption', weight: 700, icon: true, where: '.thumb.a' },
  { group: '文件类型色板', label: '图片缩略图', fg: '--file-image-fg', bg: ['--file-image-1', '--file-image-2'], size: '--fs-caption', weight: 700, icon: true, where: '.thumb.i' },
  { group: '文件类型色板', label: '文档缩略图', fg: '--file-doc-fg', bg: ['--file-doc-1', '--file-doc-2'], size: '--fs-caption', weight: 700, icon: true, where: '.thumb.d' },
  // 缩略图渐变上的小字（嗅探）
  { group: '文件类型色板', label: '嗅探小字（暗）', fg: 'color-mix(in srgb,var(--fg-inverse) 70%,transparent)', bg: ['--sn-g1a', '--sn-g2a', '--sn-g3a'], size: '--fs-caption', weight: 700, where: '.sn-thumb .mini（暗）', only: 'dark' },
  { group: '文件类型色板', label: '嗅探小字（明）', fg: 'color-mix(in srgb,var(--sn-mini) 85%,transparent)', bg: ['--sn-g1a', '--sn-g2a', '--sn-g3a', '--sn-g1b', '--sn-g2b', '--sn-g3b'], size: '--fs-caption', weight: 700, where: '.sn-thumb .mini（明）', only: 'light' },
  // 海报与遮罩（时长角标 / 播放键）
  { group: '海报与遮罩', label: '海报时长角标', fg: '--fg-inverse', bg: ['color-mix(in srgb,#000 65%,transparent)'], over: '--poster-b', size: '--fs-caption', where: '.poster .dur' },
  { group: '海报与遮罩', label: '海报播放键', fg: '--fg-inverse', bg: ['color-mix(in srgb,#000 65%,transparent)'], over: '--poster-b', size: '--fs-caption', icon: true, opacity: 0.85, where: '.poster .play' }
];

function need(pair) {
  if (pair.icon) return 3;
  const px = parseFloat(String(pair.sizePx || 0));
  if (px >= 24) return 3;
  if (px >= 18.5 && (pair.weight || 400) >= 600) return 3;
  return 4.5;
}

const results = [];
const failures = [];

for (const combo of COMBOS) {
  const vars = varsOf(combo);
  const tokenPx = (t) => parseFloat(vars.get(t));

  for (const pair of PAIRS) {
    if (pair.only && pair.only !== combo.theme) continue;
    const sizePx = tokenPx(pair.size);
    const wrap = (s) => (s.startsWith('--') ? `var(${s})` : s);
    const base = parseColor(wrap(pair.over || '--bg'), vars);
    const fgRaw = parseColor(wrap(pair.fg), vars);
    if (!fgRaw) { failures.push({ combo, pair, error: '解析不到前景色 ' + pair.fg }); continue; }
    const fg = pair.opacity ? { ...fgRaw, a: fgRaw.a * pair.opacity } : fgRaw;

    let worst = null;
    for (const bgSpec of pair.bg) {
      const bgRaw = parseColor(wrap(bgSpec), vars);
      if (!bgRaw) continue;
      const bg = over(bgRaw, base);
      const fgC = over(fg, bg);
      const r = ratio(fgC, bg);
      if (!worst || r < worst.ratio) worst = { ratio: r, bg: bgSpec, bgC: bg, fgC };
    }
    if (!worst) { failures.push({ combo, pair, error: '解析不到背景色' }); continue; }

    const req = need({ ...pair, sizePx });
    const rec = {
      theme: combo.theme,
      color: combo.color,
      group: pair.group,
      label: pair.label,
      where: pair.where,
      fg: pair.fg,
      bg: worst.bg,
      sizePx,
      weight: pair.weight || 400,
      need: req,
      ratio: Math.round(worst.ratio * 100) / 100,
      pass: worst.ratio >= req
    };
    results.push(rec);
    if (!rec.pass) failures.push({ combo, pair, rec });
  }
}

/* ---------------- 输出 ---------------- */

const key = (r) => r.group + '｜' + r.label;
const groups = [...new Set(results.map((r) => r.group))];
const combosLabel = (r) => `${r.theme === 'dark' ? '暗' : '明'}/${r.color}`;

if (jsonOut) {
  const summary = {
    combos: COMBOS.map((c) => `${c.theme}/${c.color}`),
    pairs: new Set(results.map(key)).size,
    checks: results.length,
    failed: failures.filter((f) => f.rec).length,
    failures: failures.map((f) => f.rec || { error: f.error, label: f.pair.label, combo: `${f.combo.theme}/${f.combo.color}` })
  };
  process.stdout.write(JSON.stringify({ summary, results, failures: summary.failures }, null, 2) + '\n');
} else if (mdOut) {
  const uniq = [...new Map(results.map((r) => [key(r), r])).values()];
  console.log('| 角色 | 元素 | 字号 | 要求 | 最低对比度 | 区间 | 不达标套数 |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of uniq) {
    const all = results.filter((r) => key(r) === key(row));
    const min = all.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
    const max = all.reduce((a, b) => (a.ratio >= b.ratio ? a : b));
    const bad = all.filter((r) => !r.pass).length;
    console.log(`| ${row.group} | ${row.label} | ${row.sizePx}px | ${row.need}:1 | **${min.ratio.toFixed(2)}** | ${max.ratio.toFixed(2)}–${min.ratio.toFixed(2)} | ${bad ? bad + '/' + all.length : 0} |`);
  }
  console.log('');
  console.log('### 11px 小字逐套明细');
  console.log('');
  console.log('| 元素 | ' + COMBOS.map((c) => (c.theme === 'dark' ? '暗/' : '明/') + c.color).join(' | ') + ' |');
  console.log('| --- | ' + COMBOS.map(() => '---').join(' | ') + ' |');
  for (const row of uniq.filter((r) => r.sizePx < 12)) {
    const cells = COMBOS.map((c) => {
      const hit = results.find((r) => key(r) === key(row) && r.theme === c.theme && r.color === c.color);
      if (!hit) return '—';
      return `${hit.ratio.toFixed(2)}${hit.pass ? '' : ' ✗'}`;
    });
    console.log(`| ${row.group}/${row.label} | ${cells.join(' | ')} |`);
  }
} else {
  console.log('Fetchweir 界面对比度（WCAG 2.1，按 src/styles.css 当前 token 实算）');
  console.log(`配色组合：${COMBOS.length}（明暗 × 四套配色）  检查项：${new Set(results.map(key)).size}  点数：${results.length}`);
  console.log('');
  for (const g of groups) {
    const rows = [...new Map(results.filter((r) => r.group === g).map((r) => [key(r), r])).values()];
    console.log(`【${g}】`);
    for (const row of rows) {
      const all = results.filter((r) => key(r) === key(row));
      const min = all.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
      const max = all.reduce((a, b) => (a.ratio >= b.ratio ? a : b));
      const bad = all.filter((r) => !r.pass);
      const verdict = bad.length ? `✗ ${bad.length}/${all.length} 套不达标` : '✓';
      console.log(
        `  ${row.label.padEnd(14, '　')} ${String(row.sizePx) + 'px'}  ${min.ratio.toFixed(2)}–${max.ratio.toFixed(2)}:1  需 ${row.need}:1  ${verdict}` +
        `  最低出现在 ${combosLabel(min)}（${row.where}）`
      );
    }
    console.log('');
  }
  if (failures.length) {
    console.log(`✗ 不达标 ${failures.filter((f) => f.rec).length} 个点位`);
    for (const f of failures.filter((x) => x.rec)) {
      console.log(`  ${combosLabel(f.rec)}  ${f.rec.group}/${f.rec.label}  ${f.rec.ratio}:1 < ${f.rec.need}:1  背景 ${f.rec.bg}`);
    }
  } else {
    console.log('✓ 全部达标');
  }
}

process.exit(failures.length ? 1 : 0);
