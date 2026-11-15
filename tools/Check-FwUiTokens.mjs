// 检查界面里散落的硬编码尺寸/字号/间距/颜色是否走了 token（规范见 docs/界面设计规范.md）。
//
// 用法：
//   node tools/Check-FwUiTokens.mjs            人读输出；有违规时退出码 1
//   node tools/Check-FwUiTokens.mjs --json     JSON 输出（CI 归档、发布证据用）
//   node tools/Check-FwUiTokens.mjs --strict   例外清单里“已失效”的条目也判失败
//
// 判定口径：
//   · token 定义区（src/styles.css 顶部的 :root、html[data-theme|color|density] 块）是唯一
//     允许出现字面值的地方；其余位置出现字面颜色/字号/行高/间距/圆角/描边宽度/控件高度都算违规。
//   · 容器与装饰尺寸（缩略图、图标底板、内容最大高度等）按 info 记录，不阻塞发布，
//     便于评审时发现 34/32/36 这类“差一点”的漂移。
//   · 例外必须写进 tools/fw-ui-tokens.exceptions.json，并且每条都要有 reason；
//     没有 reason 的条目直接判失败。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const arg = (n, fb) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fb;
};

const repoRoot = resolve(arg('root', join(dirname(fileURLToPath(import.meta.url)), '..')));
const jsonOut = flag('json');
const strict = flag('strict');
const exceptionsPath = join(repoRoot, 'tools', 'fw-ui-tokens.exceptions.json');

// SVG 图标尺寸写在 width/height 属性上，无法引用 CSS 变量，因此用离散档位白名单：
// 9(排序箭头) 10/12/13/14/15/16(行内图标) 17(文件类型图标) 20/24(品牌与空状态)。
const ICON_SCALE = new Set([9, 10, 12, 13, 14, 15, 16, 17, 20, 24]);
const CONTROL_SELECTOR = /\.(btn|field|ico|tbtn|chip|mini-select|sw|color-card|wc|tb-pill|modal-x|update-badge)\b|\.vp-dock\s+button|\.select-wrap\s+select/;
const SPACING_PROPS = /^(padding|margin|gap|row-gap|column-gap|padding-(top|right|bottom|left)|margin-(top|right|bottom|left)|top|right|bottom|left|inset)$/;
const SIZE_PROPS = /^(width|height|min-width|min-height|max-width|max-height)$/;
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
const LITERAL_PX = /-?\d+(?:\.\d+)?px/;

// 角色 → 允许的 token 档位。这是“防选错档”的核心：
// 同一个角色只允许落在它自己那几档上，用了阶梯里别的档位（比如主按钮突然 28px、次级按钮突然 36px）
// 就报错；同一角色的高度集合只有 1 个值时，等于强制“同角色容器尺寸一致”。
// 未列出的选择器只做字面值检查，不做角色约束——角色表宁缺毋滥，不硬凑。
const ROLES = [
  { id: 'btn-inline', label: '行内紧凑按钮', match: /^\.tbtn(?![a-z-])|^\.vp-dock\s*button$/, font: ['--fs-body'], height: ['--ctl-xs'] },
  { id: 'btn-secondary', label: '次级按钮', match: /^\.btn\.sm(?![a-z-])|^\.chip(?![a-z-])|^\.mini-select(?![a-z-])|^\.modal-x(?![a-z-])|^\.ico(?![a-z-])/, font: ['--fs-body'], height: ['--ctl-sm'] },
  { id: 'btn-primary', label: '主按钮', match: /^\.btn(?![a-z-])/, font: ['--fs-body'], height: ['--ctl-md'] },
  { id: 'field', label: '输入框', match: /^\.field(?![a-z-])|^\.color-card(?![a-z-])|^\.select-wrap\s+select$/, font: ['--fs-body'], height: ['--ctl-md'] },
  { id: 'nav', label: '导航项', match: /^\.sb(?![a-z-])|^\.set-nav\s+a$/, font: ['--fs-base'], height: ['--ctl-lg'] },
  { id: 'row', label: '列表行', match: /^\.task(?![a-z-])|^\.sn(?![a-z-])/, font: ['--fs-base'], height: ['--row-h'] },
  { id: 'heading', label: '标题', match: /^\.h1(?![a-z-])|^\.det-title(?![a-z-])|^\.vid-info\s+h2$|^\.big-speed$/, font: ['--fs-title', '--fs-head', '--fs-display'], height: [] },
  { id: 'text-body', label: '正文', match: /^body$|^\.sec-h(?![a-z-])|^\.t-name(?![a-z-])|^\.h2(?![a-z-])|^\.brand-name(?![a-z-])|^\.update-ver(?![a-z-])/, font: ['--fs-base'], height: [] },
  { id: 'text-secondary', label: '次级文字', match: /^\.muted(?![a-z-])|^\.dim(?![a-z-])|^\.sec-d(?![a-z-])|^\.t-sub(?![a-z-])|^\.det-url(?![a-z-])|^\.kv(?![a-z-])|^\.conn-row(?![a-z-])|^\.sniff-url(?![a-z-])/, font: ['--fs-body', '--fs-caption'], height: [] },
  { id: 'text-meta', label: '元信息/徽标', match: /^\.tag(?![a-z-])|^\.q-badge(?![a-z-])|^\.update-badge(?![a-z-])|^\.dup(?![a-z-])|^\.stat\s+\.k$|^\.stat\s+\.d$|^\.list-head$|^\.statusbar$|^\.poster\s+\.dur$/, font: ['--fs-caption'], height: [] }
];

// 控件高度只看控件元素本身：取选择器最后一个复合选择器，且排除伪元素（那是内部零件，不是控件）。
function lastCompound(sel) {
  if (/::?(before|after)/.test(sel)) return '';
  return sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() || '';
}

function isControlSelector(sel) {
  const last = lastCompound(sel);
  return CONTROL_SELECTOR.test(last);
}

// 角色命中：以最后一个复合选择器为准。只有当它是不带类名的元素选择器（`a`、`h2`、`button`）时，
// 才回退到整条选择器匹配——否则 `.sb .n` 这种后代会被误判成导航项本体。
function roleOf(sel) {
  const last = lastCompound(sel);
  if (!last) return null;
  const isBareElement = /^[a-z][a-z0-9]*$/i.test(last);
  for (const r of ROLES) {
    if (r.match.test(last) || (isBareElement && r.match.test(sel))) return r;
  }
  return null;
}

// 抽出 var(--x) 里的 token 名；不是单一变量（calc/混合/0）时返回 null。
function tokenOf(value) {
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(value.trim());
  return m ? m[1] : null;
}

// 容器/装饰尺寸之前只记 info，下一轮就会各自漂 1–2px。这里按“角色”收口：
// 同一角色只能取同一组写死的固定档位（响应式收窄的档也算在集合里，例如缩略图 40/34）；
// 出现集合外的值就报错，避免每加一个视图就发明 34/32/36 这种“差一点”的尺寸。
// 未列角色的容器尺寸仍记 info——但角色表要覆盖重复出现的尺寸，不能长期留成“永远 info”。
const SIZE_ROLES = [
  { id: 'scrollbar', label: '滚动条', match: /::-webkit-scrollbar$/, allow: { width: ['10px'], height: ['10px'] } },
  { id: 'brand-mark', label: '品牌标记', match: /^\.mark(?![a-z-])(\s+img)?$/, allow: { width: ['24px'], height: ['24px'] } },
  // 6 = 侧栏状态点，5 = 徽标内小点：两个固定档，不是随手取 5/6
  { id: 'status-dot', label: '状态点', match: /^\.dot(?![a-z-])$|^\.st\s+\.d$/, allow: { width: ['5px', '6px'], height: ['5px', '6px'] } },
  { id: 'window-control', label: '窗口控制键', match: /^\.wc$/, allow: { width: ['34px'] } },
  { id: 'avatar', label: '头像', match: /^\.avatar$/, allow: { width: ['26px'], height: ['26px'] } },
  { id: 'spark', label: '速率迷你图', match: /^\.spark$/, allow: { width: ['120px'], height: ['16px'] } },
  { id: 'field-width', label: '输入类定宽', match: /^\.field\.w(240|190|320|420)$|^\.mini-select(\.w120)?$|^\.filter-bar\s+\.mini-select$|^\.slider$|^\.select-wrap$|^\.path-field\s+\.field$|^\.update-card\s+\.set-row\s+\.field$/, allow: { width: ['240px', '190px', 'min(320px,34vw)', 'min(420px,48vw)', 'min(330px,46vw)', 'min(300px,42vw)', '150px', '220px'], 'max-width': ['120px', '230px', '150px'] } },
  { id: 'stat-unit', label: '统计图标底板', match: /^\.stat\s+\.u$/, allow: { width: ['24px', '20px'], height: ['24px', '20px'] } },
  // 3/4 为迷你轨道，5/6 为常规进度条：四个固定厚度，超出即漂移
  { id: 'track', label: '进度/波形轨道', match: /^\.bar(\.tall)?$|^\.conn-row\s+\.bar$|^\.video-job\s+\.track$|^\.mini-track$/, allow: { height: ['3px', '4px', '5px', '6px'] } },
  { id: 'tick', label: '刻度线', match: /^\.seg-ticks\s+span$/, allow: { width: ['1px'] } },
  { id: 'checkbox', label: '复选框/单选框', match: /^\.cb$|^\.t-cb\s+\.cb$|^\.radio$/, allow: { width: ['15px'], height: ['15px'] } },
  { id: 'checkbox-dot', label: '单选框选中点', match: /^\.radio\.on::after$/, allow: { width: ['7px'], height: ['7px'] } },
  { id: 'inline-btn-width', label: '行内按钮最小宽', match: /^\.tbtn$/, allow: { 'min-width': ['24px', '22px'] } },
  { id: 'empty-big', label: '空状态图标', match: /^\.empty\s+\.big$/, allow: { width: ['54px'], height: ['54px'] } },
  { id: 'modal-card', label: '弹窗容器', match: /^\.modal-card$/, allow: { width: ['min(940px,100%)'] } },
  { id: 'icon-button', label: '图标按钮', match: /^\.modal-x$/, allow: { width: ['28px'] } },
  { id: 'thumb', label: '列表缩略图', match: /^\.thumb$/, allow: { width: ['40px', '34px'], height: ['40px', '34px'] } },
  { id: 'thumb-sm', label: '小缩略图', match: /^\.thumb\.sm$/, allow: { width: ['32px'], height: ['32px'] } },
  { id: 'sn-thumb', label: '嗅探缩略图', match: /^\.sn-thumb$/, allow: { width: ['44px', '34px'], height: ['30px', '24px'] } },
  { id: 'separator', label: '分隔符', match: /^\.t-sub\s+\.sep$/, allow: { width: ['2px'], height: ['2px'] } },
  { id: 'fixed-col', label: '定宽数字列', match: /^\.t-bar\s+\.pct$|^\.conn-row\s+\.id$|^\.conn-row\s+\.sp$|^\.out-item\s+\.k$/, allow: { width: ['26px', '34px', '64px'] } },
  { id: 'detail-icon', label: '详情类型图标', match: /^\.det-icon$/, allow: { width: ['52px'], height: ['52px'] } },
  { id: 'long-text', label: '长文本最大宽', match: /^\.det-url$/, allow: { 'max-width': ['640px'] } },
  { id: 'seg-bar', label: '分段条块', match: /^\.seg\s+i$/, allow: { height: ['8px'] } },
  { id: 'legend-swatch', label: '图例色块', match: /^\.seg-legend\s+b$|^\.color-card\s+\.cc-dots\s+i$/, allow: { width: ['8px', '9px'], height: ['8px', '9px'] } },
  { id: 'scroll-box', label: '滚动区最大高', match: /^\.log$|^\.vid-auth-raw\s+pre$|^\.update-notes$/, allow: { 'max-height': ['132px', '190px', '220px'] } },
  { id: 'poster', label: '视频海报', match: /^\.poster$/, allow: { height: ['200px', '170px'] } },
  { id: 'poster-play', label: '海报播放键', match: /^\.poster\s+\.play$/, allow: { width: ['46px'], height: ['46px'] } },
  { id: 'table-col', label: '格式表列宽', match: /^table\.fmt\s+th:nth-child\(\d\)$/, allow: { width: ['30px', '42px', '50px', '72px', '74px', '98px', '106px'] } },
  { id: 'sidebar-rail', label: '侧栏图标轨', match: /^\.sb$/, allow: { width: ['44px', '40px'] } },
  { id: 'demo-frame', label: 'demo 画布', match: /^body\.minw-demo\s+\.vp-frame$/, allow: { 'min-width': ['900px'] } }
];

function sizeRoleOf(sel) {
  return SIZE_ROLES.find((r) => r.match.test(sel)) || null;
}

// 命中角色但用了集合外的值，就是“同角色尺寸漂了”，直接报错而不是记 info。
function sizeSetOf(role, prop) {
  return role.allow[prop] || [];
}

const normValue = (v) => v.replace(/\s+/g, '').toLowerCase();

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(join(repoRoot, 'src')).sort();
const violations = [];
const rel = (p) => relative(repoRoot, p).replace(/\\/g, '/');

function add(rule, severity, file, line, selector, text, hint) {
  violations.push({ rule, severity, file: rel(file), line, selector: selector || '', text: text.trim(), hint });
}

// ---- CSS ----
// 把 token 定义块挖掉（用等长空白替换，保持行号不变），其余部分逐条声明检查。
function maskTokenBlocks(src) {
  let out = src;
  const openRe = /(^|\n)(\s*)(:root|html\[data-[^\s{,{]*[^{]*?)\{/g;
  let m;
  while ((m = openRe.exec(out))) {
    const braceStart = out.indexOf('{', m.index);
    let depth = 0, i = braceStart;
    for (; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') { depth--; if (depth === 0) break; }
    }
    const block = out.slice(braceStart, i + 1);
    out = out.slice(0, braceStart) + block.replace(/[^\n]/g, ' ') + out.slice(i + 1);
    openRe.lastIndex = i + 1;
  }
  return out;
}

function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (idx) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

function selectorAt(src, idx) {
  const brace = src.lastIndexOf('{', idx);
  if (brace < 0) return '';
  const prevClose = Math.max(src.lastIndexOf('}', brace), src.lastIndexOf(';', brace));
  let sel = src.slice(prevClose + 1, brace).trim().replace(/\s+/g, ' ');
  // 嵌套 at-rule 时取最后一段选择器
  const inner = sel.lastIndexOf('{');
  if (sel.startsWith('@') && inner >= 0) sel = sel.slice(inner + 1).trim();
  return sel;
}

for (const file of files.filter((f) => f.endsWith('.css'))) {
  const raw = readFileSync(file, 'utf8');
  const src = maskTokenBlocks(raw);
  const lineOf = lineIndex(src);
  const re = /([^{};]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').trim().replace(/\s+/g, ' ');
    const body = m[2];
    const bodyStart = m.index + m[1].length + 1;
    const role = roleOf(selector);
    for (const part of body.split(';')) {
      const decl = part.trim();
      if (!decl || !decl.includes(':')) continue;
      const ci = decl.indexOf(':');
      const prop = decl.slice(0, ci).trim().toLowerCase();
      const value = decl.slice(ci + 1).trim();
      if (!value) continue;
      const offset = bodyStart + body.indexOf(part);
      const line = lineOf(offset);
      const usesVar = value.includes('var(');
      const tok = tokenOf(value);

      // —— 角色约束：先判“选错档”，再判字面值 ——
      if (role && tok && role.font.length && prop === 'font-size' && !role.font.includes(tok)) {
        add('role-font', 'error', file, line, selector, decl,
          `「${role.label}」的字号只允许 ${role.font.join(' / ')}，${tok} 是别的角色的档位`);
        continue;
      }
      if (role && tok && role.height.length && /^(height|min-height)$/.test(prop) && !role.height.includes(tok)) {
        add('role-height', 'error', file, line, selector, decl,
          `「${role.label}」的高度只允许 ${role.height.join(' / ')}；换档会让同角色容器尺寸不一致`);
        continue;
      }

      // —— 容器/装饰尺寸的角色档位：命中角色就不允许漂到集合外 ——
      if (SIZE_PROPS.test(prop) && LITERAL_PX.test(value) && !usesVar) {
        const sizeRole = sizeRoleOf(selector);
        if (sizeRole) {
          const allowed = sizeSetOf(sizeRole, prop);
          if (allowed.length && !allowed.map(normValue).includes(normValue(value))) {
            add('role-size', 'error', file, line, selector, decl,
              `「${sizeRole.label}」的 ${prop} 只允许 ${allowed.join(' / ')}；同角色尺寸必须一致，不要为新位置再发明一档`);
            continue;
          }
          if (allowed.length) continue;
        }
      }

      if (LITERAL_COLOR.test(value) && !/^url\(/.test(value)) {
        add('color', 'error', file, line, selector, decl, '颜色必须用 --bg/--fg/--accent/--ok/--warn/--err 等 token，或 color-mix(var(--x) …)');
        continue;
      }
      if (prop === 'font-size') {
        if (LITERAL_PX.test(value) || /^\d/.test(value) && /px|rem|em/.test(value)) {
          if (value !== '0') {
            add('font-size', 'error', file, line, selector, decl, '字号必须用 var(--fs-*)，阶梯见规范第 3 节');
            continue;
          }
        }
      }
      if (prop === 'font' && LITERAL_PX.test(value) && !value.includes('var(--fs')) {
        add('font-size', 'error', file, line, selector, decl, 'font 简写里的字号必须写成 var(--fs-*)');
        continue;
      }
      if (prop === 'font-family' && !/^var\(/.test(value)) {
        add('font-family', 'error', file, line, selector, decl, '字体族必须用 var(--font) 或 var(--mono)');
        continue;
      }
      if (prop === 'line-height' && !usesVar && value !== 'inherit' && value !== 'normal') {
        add('line-height', 'error', file, line, selector, decl, '行高必须用 var(--lh-*)');
        continue;
      }
      if (SPACING_PROPS.test(prop) && LITERAL_PX.test(value) && !usesVar) {
        add('spacing', 'error', file, line, selector, decl, '间距必须用 var(--space-*)（2px 阶梯）');
        continue;
      }
      if (prop === 'border-radius' && LITERAL_PX.test(value) && !usesVar) {
        add('radius', 'error', file, line, selector, decl, '圆角必须用 var(--r-*)');
        continue;
      }
      if (/^(border|border-(top|right|bottom|left)|outline)$/.test(prop) && !usesVar && /\d+(?:\.\d+)?px\s+(solid|dashed|dotted)/.test(value)) {
        add('border-width', 'error', file, line, selector, decl, '描边宽度必须用 var(--bw) / var(--bw-strong)');
        continue;
      }
      if (/^(height|min-height)$/.test(prop) && LITERAL_PX.test(value) && !usesVar) {
        if (isControlSelector(selector)) {
          add('control-height', 'error', file, line, selector, decl, '控件高度必须用 var(--ctl-*)');
        } else {
          add('size-info', 'info', file, line, selector, decl, '容器/装饰尺寸，不强制 token；若与相邻值只差 1–2px 视为漂移');
        }
        continue;
      }
      if (SIZE_PROPS.test(prop) && LITERAL_PX.test(value) && !usesVar) {
        add('size-info', 'info', file, line, selector, decl, '容器尺寸，不强制 token；若与相邻值只差 1–2px 视为漂移');
      }
    }
  }
}

// ---- HTML / JS ----
for (const file of files.filter((f) => /\.(html|js)$/.test(f))) {
  const src = readFileSync(file, 'utf8');
  const lineOf = lineIndex(src);

  // 行内样式：只允许 var()/calc()/%/0/auto，出现 px 或颜色字面量就算违规
  const styleRe = /\bstyle="([^"]*)"/g;
  let m;
  while ((m = styleRe.exec(src))) {
    const body = m[1];
    const line = lineOf(m.index);
    const bad = [];
    if (LITERAL_COLOR.test(body)) bad.push('颜色字面量');
    const pxHits = body.match(/-?\d+(?:\.\d+)?px/g);
    if (pxHits) bad.push('尺寸字面量 ' + [...new Set(pxHits)].join('/'));
    if (bad.length) {
      add('inline-style', 'error', file, line, 'style="…"', body, '行内样式必须用 var(--*)：' + bad.join('，'));
    }
  }
  // JS 里给 element.style.* 赋值
  const jsStyleRe = /\.style\.([A-Za-z]+)\s*=\s*(['"`])([^'"`]*)\2/g;
  if (file.endsWith('.js')) {
    while ((m = jsStyleRe.exec(src))) {
      const body = m[3];
      if (!LITERAL_COLOR.test(body) && !LITERAL_PX.test(body)) continue;
      add('inline-style', 'error', file, lineOf(m.index), `.style.${m[1]}`, body, '动态样式也要用 var(--*)，或在 CSS 里加工具类');
    }
  }
  // SVG 图标尺寸：属性写法无法用变量，改用离散档位白名单
  const svgRe = /<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/g;
  while ((m = svgRe.exec(src))) {
    const w = Number(m[1]), h = Number(m[2]);
    if (!ICON_SCALE.has(w) || !ICON_SCALE.has(h) || w !== h) {
      add('icon-size', 'error', file, lineOf(m.index), '<svg>', `width="${w}" height="${h}"`, '图标尺寸必须落在 9/10/12–17/20/24 档位且宽高相等');
    }
  }
}

// ---- 例外清单 ----
const exceptions = [];
if (existsSync(exceptionsPath)) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
  } catch (e) {
    console.error('例外清单不是合法 JSON：' + exceptionsPath + '\n' + e.message);
    process.exit(2);
  }
  for (const e of parsed.entries || []) {
    const missing = ['rule', 'file', 'match', 'reason'].filter((k) => !e[k] || !String(e[k]).trim());
    if (missing.length) {
      add('exception-format', 'error', exceptionsPath, 0, '', JSON.stringify(e), '例外条目缺少字段：' + missing.join('/'));
      continue;
    }
    exceptions.push({ ...e, used: 0 });
  }
} else if (!jsonOut) {
  console.error('提示：没有找到例外清单 ' + rel(exceptionsPath) + '，全部按违规处理');
}

for (const v of violations) {
  if (v.severity !== 'error') continue;
  const hit = exceptions.find((e) => !e.used && e.rule === v.rule && e.file === v.file && v.text.includes(e.match));
  if (hit) { hit.used++; v.excepted = true; v.reason = hit.reason; }
}

const errors = violations.filter((v) => v.severity === 'error' && !v.excepted);
const infos = violations.filter((v) => v.severity === 'info');
const stale = exceptions.filter((e) => !e.used);
const formattedBad = violations.filter((v) => v.rule === 'exception-format');

const summary = {
  files: files.map(rel),
  errors: errors.length,
  errorsExcepted: violations.filter((v) => v.excepted).length,
  infos: infos.length,
  exceptions: exceptions.length,
  staleExceptions: stale.length
};

if (jsonOut) {
  process.stdout.write(JSON.stringify({ summary, errors, infos, excepted: violations.filter((v) => v.excepted), staleExceptions: stale }, null, 2) + '\n');
} else {
  console.log('Grabio 界面 token 检查');
  console.log('扫描：' + files.map(rel).join('  '));
  console.log('token 定义区：src/styles.css 顶部（:root + 明暗 × 四套颜色主题 + 密度）');
  console.log('');
  if (errors.length) {
    console.log(`✗ 违规 ${errors.length} 条（必须改）`);
    for (const v of errors) {
      console.log(`  ${v.file}:${v.line}  ${v.selector || ''}`);
      console.log(`    ${v.text}`);
      console.log(`    → ${v.hint}`);
    }
    console.log('');
  } else {
    console.log('✓ 违规 0 条：颜色/字号/行高/间距/圆角/描边/控件高度全部走 token');
  }
  const excepted = violations.filter((v) => v.excepted);
  if (excepted.length) {
    console.log(`· 例外放行 ${excepted.length} 条（详见 tools/fw-ui-tokens.exceptions.json）`);
    for (const v of excepted) console.log(`  ${v.file}:${v.line}  ${v.text}  — ${v.reason}`);
  }
  if (infos.length) {
    console.log(`· info ${infos.length} 条（容器/装饰尺寸，仅记录不阻塞）`);
  }
  if (stale.length) {
    console.log(`· 过期例外 ${stale.length} 条（对应违规已不存在，建议删除）`);
    for (const e of stale) console.log(`  ${e.file}  ${e.match}`);
  }
  if (formattedBad.length) {
    console.log(`✗ 例外清单格式错误 ${formattedBad.length} 条`);
  }
}

if (errors.length || formattedBad.length || (strict && stale.length)) process.exit(1);
