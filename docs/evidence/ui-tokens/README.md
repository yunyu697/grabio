# 界面 token 检查证据（v2：阶梯收敛 + 角色闸门 + 真实视觉验收）

- 规范：[docs/界面设计规范.md](../../界面设计规范.md)（v2.1）
- 检查脚本：[tools/Check-FwUiTokens.mjs](../../../tools/Check-FwUiTokens.mjs)
- 对比度脚本：[tools/Check-FwContrast.mjs](../../../tools/Check-FwContrast.mjs)
- 截图脚本：[tools/Capture-FwUiShots.ps1](../../../tools/Capture-FwUiShots.ps1)
- 本轮扫描：[scan-v3.json](scan-v3.json)；上一轮 [scan-v2.json](scan-v2.json)；v1 收编对照 [scan-after-tokens.json](scan-after-tokens.json)

## 1. 汇总

| 指标 | 基线 v1.1.0 | v1 收编后 | v2 收敛后 | **v2.1 收尾后** |
| --- | --- | --- | --- | --- |
| error 违规 | 523 | 0 | 0 | **0** |
| 例外放行 | 0 | 5 | 0 | **0** |
| 过期例外 | 0 | 0 | 0 | **0** |
| info（未归类的容器尺寸） | 93 | 96 | 91 | **0** |

v2 的 0 error 与 v1 性质不同：v1 只保证"用了 var()"，v2 还保证"该角色只用了允许的档位"。
v2.1 再进一步：原先 91 条 info 容器尺寸按 31 个角色锁成固定档位，越界直接报 `role-size`，
不再有"永远 info"。角色表见第 5 节与规范 6.1 节。

## 2. 阶梯收敛（v1 → v2）

v1 按现状逐个命名（有着误把"现状"当"规范"的风险）：字号 16 档、间距 13 档、控件高度 9 档。
v2 先定角色，再给角色留 1 档，最后把阶梯收敛到能覆盖角色的最少档位。

| 类别 | v1 | v2 | 处理 |
| --- | --- | --- | --- |
| 字号 | 16 档（9 ~ 30） | **6 档**（11 / 12 / 13 / 16 / 20 / 28） | 10/10.5/11/11.5/12/12.5/13 串按角色并档：元信息→11、次级文字与控件→12、正文/导航/列表行→13；标题 16/20、展示 28 |
| 行高 | 5 档（1 / 1.1 / 1.55 / 1.65 / 1.9） | **4 档**（1 / 1.1 / 1.6 / 1.9） | 1.55 与 1.65 合并为 1.6 |
| 间距 | 13 档（2px 基准，含 2/6/10/14） | **10 档**（4px 网格：4/8/12/16/20/24/32/40/56/64） | 去掉 2px 逐档；2→4、6→8、10→12、14→16 |
| 圆角 | 8 档（2/4/7/9/10/14/20/50%） | **4 档 + 胶囊/圆形**（4/6/10/14） | 2→4、7→6、9→10、20→999（胶囊） |
| 控件高度 | 9 档（20 ~ 40，≤32 每档 2px） | **4 档**（24 / 28 / 32 / 36） | 按控件角色分配：图标/行内→24、次级与下拉→28、主按钮/输入框→32、导航与大输入→36 |
| 外壳尺寸 | 散落 | `--shell-*` + `--bulk-h` | 结构值不进阶梯；`--bulk-h` = 12×2 内边距 + 28 控件 + 2 描边 |

并档必然改动视觉，所以本轮同时做了真实构建的多尺寸验收（第 6 节），不只看样式代码。

## 3. 原 5 条例外全部改为几何推导（例外清单清零）

v1 用例外放行 5 个"魔法数"。v2 把它们全部改写成由 token 推导的表达式，`fw-ui-tokens.exceptions.json` 归零：

| 位置 | v1 | v2 |
| --- | --- | --- |
| `.sb.active::before` | `left:-12px` | `left:calc(-1 * var(--space-12))` |
| `.main.has-sel .view[data-view="main"]` | `bottom:66px` | `bottom:calc(var(--bulk-h) + var(--space-12))` |
| `.sw.on::after` | `left:18px` | `left:calc(100% - var(--sw-knob) - var(--space-4))`（并新增 `--sw-w:40px` / `--sw-knob:16px`） |
| `.toast` | `bottom:52px` | `bottom:calc(var(--shell-status) + var(--space-20))` |
| `.minw-note` | `top:52px` | `top:calc(var(--shell-titlebar) + var(--space-8))` |

例外清单为空的额外好处：`--strict` 下不会再出现"例外条目写好后再也没被命中"的隐性腐化。

## 4. 角色闸门（防"选错档"）

脚本内置 10 个字号/控件高度角色，每个角色绑定允许的字号集合与控件高度集合；命中角色但用了集合外的档位即报 `role-font` / `role-height` error。
高度集合写成单值时，等于强制"同角色容器尺寸一致"（例如所有 `.btn.sm` 只能是 28）。角色表见规范 3.4 节；
容器/装饰尺寸的角色表（31 个）见第 5 节。

负向验证（临时副本注入，验证后已回退）：

| 注入 | 期望 | 实测 |
| --- | --- | --- |
| `.btn.sm{height:var(--ctl-lg)}` | `role-height` 报错（次级按钮 36 ∉ {28}） | 报错 ✓ |
| `.t-name{font-size:var(--fs-caption)}` | `role-font` 报错（正文 11 ∉ {13}） | 报错 ✓ |
| `color:#123456` | `color` 报错（字面色值） | 报错 ✓ |

## 5. 容器/装饰尺寸的角色档位（31 个角色，info 归零）

v2 的 91 条 info 不是"漏了"，但也不是可以长期放行的：下一轮加视图就会各自漂 1–2px。
v2.1 把它们按角色收口，同角色只允许一组写死的固定档位（含响应式收窄档），越界报 `role-size`。

| 分组 | 角色数 | 角色（允许值） |
| --- | --- | --- |
| 缩略图 | 3 | 列表 40/34、小 32、嗅探 44×30 / 34×24 |
| 海报与播放 | 2 | 海报高 200/170、播放键 46 |
| 头像与标记 | 4 | 头像 26、品牌 24、详情图标 52、空状态 54 |
| 表格与定宽列 | 2 | 表格列 30/42/50/72/74/98/106、数字列 26/34/64 |
| 输入类定宽 | 1 | 240/190/220/150、`min()` 组合、mini 下拉 max 120/150/230 |
| 侧栏与外壳 | 4 | 侧栏图标轨 44/40、窗口控制 34、弹窗 940、滚动条 10 |
| 小控件与点 | 8 | 复选/单选 15、选中点 7、状态点 6/5、图例 8/9、分隔 2、刻度 1、轨道 3/4/5/6、分段 8 |
| 文本与滚动区 | 3 | 长文本 max 640、详情 URL 640、滚动区 max 132/190/220 |
| 其它 | 4 | 速率图 120×16、统计底板 24/20、行内按钮最小宽 24/22、demo 画布 900 |

完整档位表见规范 6.1 节；脚本里的表是 `SIZE_ROLES`（31 项）。

负向验证（临时副本注入，验证后已回退）：

| 注入 | 期望 | 实测 |
| --- | --- | --- |
| `.thumb{width:36px}` | `role-size`（列表缩略图只允许 40/34） | 报错 ✓ |
| `.avatar{width:30px}` | `role-size`（头像只允许 26） | 报错 ✓ |
| `table.fmt th:nth-child(2){width:100px}` | `role-size`（表格列只允许 7 个固定值） | 报错 ✓ |

## 6. 视觉验收（真实 Tauri 构建，16 张）

用 `--debug --no-bundle` 构建真实产物（真实 WebView2、真实窗口尺寸），脚本按宽度/明暗/配色重设窗口、点选视图后截图。
不用 `?demo`：demo 只有 960px 一个视口，验不出并档后的窄窗行为。

| 覆盖维度 | 文件 |
| --- | --- |
| 宽屏 1440 × 明/暗 | `main-1440-dark-violet.png`、`main-1440-light-violet.png` |
| 窄屏 960 × 明/暗 | `main-960-dark-violet.png`、`main-960-light-violet.png` |
| 最窄 760 × 明/暗 | `main-760-dark-violet.png`、`main-760-light-violet.png` |
| 四套配色（1180×760，暗） | `theme-violet-1180.png`、`theme-azure-1180.png`、`theme-emerald-1180.png`、`theme-amber-1180.png` |
| 四套配色（1180×760，明） | [visual-v3/](visual-v3/) 的 `theme-*-light-1180.png`（对比度调色后复拍） |
| 设置页（长内容 + 表单） | `settings-1440-dark-violet.png`、`settings-760-light-violet.png` |

（截图目录 [visual-v2/](visual-v2/)。为能真实验收 760 宽，`src-tauri/tauri.conf.json` 的 `minWidth` 由 900 调为 760。）

### 结论

- 字号并档后**没有**出现换行、截断、行高挤压：13px 正文在 1440/960/760 三档宽度下行数一致；元信息 11px 徽标、12px 次级文字在 760 窄窗仍单行显示；行高 1.6 在详情页段落、设置页说明、失败原因多行文本处均无贴行。
- 四套配色下徽标/状态色/进度条对比度一致，无因并档导致的弱化。
- **发现并修复 1 处真实缺陷**：760 宽、长中文文件名（任务 2 `Adobe_Photoshop_2024_v25.12.1_macOS_中文版.dmg`）把尾部"断点已保存"标签挤出行右边界被裁掉。修复：`src/app.js` 把文件名包进 `.nm`，CSS 由文件名自己省略、标签按内容占位（`.t-name > .nm{min-width:0;overflow:hidden;text-overflow:ellipsis}`、`.t-name > .tag{flex:0 0 auto}`）。1440 / 960 / 760 复拍确认标签完整、文件名正常省略。
- 另修 4 处同角色不一致：`.add-panel` 输入框与主按钮统一 32（原 36）；`.ico` 30→28；`.set-nav a` 12.5→13（导航项定档）；删除窄窗下与基准同档的冗余覆盖（`.stat .d`、`.det-title` 字号），并将窄窗 `.stat .v` 20→16、`.big-speed` 28→20 收进标题允许档位。

## 7. 对比度（v2 按当前 token 重算）

字号并档后 11px 元信息变多，颜色侧又新增了文件类型色板、缩略图渐变、海报与遮罩，旧对比度基线不再适用。
[tools/Check-FwContrast.mjs](../../../tools/Check-FwContrast.mjs) 直接解析 `src/styles.css` 的 token 定义，
按明暗 × 四套配色实算，正文类 4.5:1、图标/图形 3:1。

- 结果：8 套 × 24 个检查项全部达标，0 处低于阈值（明细 [contrast-v2.md](contrast-v2.md) / [contrast-v2.json](contrast-v2.json)）。
- 11px 小字最低 4.57:1（明/azure 选中导航强调文字），弱化文字最低 4.59:1（明/azure）。
- 首轮实测不达标 7 处，全部**改色**而非写进限制：四套明色 `--fg-3` 调深、`--accent`（森绿/暖砂）调深、
  明色 `--err` / `--info` 调深、明色音频/文档缩略图前景调深、明色嗅探小字 `--sn-mini` 调深；
  默认 `.tag` 前景由 `--fg-3` 改为 `--fg-2`（11px 压在 panel-3 上原仅 4.09:1）。
- 调色后的明色四套已用真实构建复拍：[visual-v3/](visual-v3/)（1180×760 × 紫罗兰/海蓝/森绿/暖砂）。

## 8. 调色前后对比与全尺寸复拍（v2.1）

调色动了 `--fg-3`（四套明色）、`--accent`（明/森绿、明/暖砂）、`--err`、`--info`、两个缩略图前景和 `.tag` 取色，
这些用户能直接看到，所以补两组证据。before 用 `93ea663` 的 token 重新构建、after 用当前 token，
同一份播种数据、同一窗口尺寸、同一截图脚本。

并排对比图（左 before / 右 after，1180×760 明色）：

| 配色 | 对比图 |
| --- | --- |
| 紫罗兰 | [compare/light-violet-before-after.png](compare/light-violet-before-after.png) |
| 海蓝 | [compare/light-azure-before-after.png](compare/light-azure-before-after.png) |
| 森绿 | [compare/light-emerald-before-after.png](compare/light-emerald-before-after.png) |
| 暖砂 | [compare/light-amber-before-after.png](compare/light-amber-before-after.png) |

原始单张在 [compare-before/](compare-before/)（before）与 [visual-v4/](visual-v4/)（after，同名文件）。

结论：

- **品牌强调色**：紫罗兰、海蓝未动，观感一致；森绿、暖砂只小幅调深（`#0F7A52→#0C6E4A`、`#A8540A→#9C4C09`），
  主按钮与选中导航仍是明确的绿/橙，没有发黑或变脏，不需要回退。
- **状态色**：明色 `--err` 由 #BE123C 调到 #B51038、`--info` 由 #0E7490 调到 #0C6882，色相未变，
  「需处理」「嗅探标签」不发紫、不发青。
- **11px 小字**：四套明色 `--fg-3` 调深后是"更清楚"而不是"更灰"——域名、段数、大小这些元信息在缩放 50% 的对比图里也能读。
- **默认标签**：`.tag` 前景由 `--fg-3` 改为 `--fg-2`，标签文字略提亮，未出现"抢正文"的观感。
- 全尺寸复拍 [visual-v4/](visual-v4/) 共 16 张：1440/960/760 × 明暗 6 张、四套配色明暗 8 张、设置页 2 张。
  未发现新的对比度或可读性问题；760 宽的长文件名仍正常省略、尾部标签完整。

## 9. 复现

```powershell
node tools/Check-FwUiTokens.mjs --strict   # 期望：违规 0、例外 0、过期例外 0、info 0；exit 0
node tools/Check-FwUiTokens.mjs --json > docs/evidence/ui-tokens/scan-v3.json
node tools/Check-FwContrast.mjs            # 期望：8 套配色全部达标；exit 0
node tools/Check-FwContrast.mjs --md > docs/evidence/ui-tokens/contrast-v2.md

# 视觉验收（需先构建：CARGO_TARGET_DIR=C:\fw-target npm run tauri build -- --debug --no-bundle）
powershell -ExecutionPolicy Bypass -File tools/Capture-FwUiShots.ps1 `
  -FwExe C:\fw-target\debug\fetchweir.exe -FwOut docs/evidence/ui-tokens/visual-v2
```
