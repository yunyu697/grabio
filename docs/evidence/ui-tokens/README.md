# 界面 token 检查证据（v2：阶梯收敛 + 角色闸门 + 真实视觉验收）

- 规范：[docs/界面设计规范.md](../../界面设计规范.md)（v2）
- 检查脚本：[tools/Check-FwUiTokens.mjs](../../../tools/Check-FwUiTokens.mjs)
- 截图脚本：[tools/Capture-FwUiShots.ps1](../../../tools/Capture-FwUiShots.ps1)
- 本轮扫描：[scan-v2.json](scan-v2.json)；上一轮收编结果保留为 v1 对照（[scan-after-tokens.json](scan-after-tokens.json)）

## 1. 汇总

| 指标 | 基线 v1.1.0 | v1 收编后 | **v2 收敛后** |
| --- | --- | --- | --- |
| error 违规 | 523 | 0 | **0** |
| 例外放行 | 0 | 5 | **0** |
| 过期例外 | 0 | 0 | **0** |
| info（容器/装饰尺寸） | 93 | 96 | **91** |

v2 的 0 error 与 v1 性质不同：v1 只保证"用了 var()"，v2 还保证"该角色只用了允许的档位"。
按选择器归并后的 info 61 组 / 91 条见第 5 节。

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

脚本内置 10 个角色，每个角色绑定允许的字号集合与控件高度集合；命中角色但用了集合外的档位即报 `role-font` / `role-height` error。
高度集合写成单值时，等于强制"同角色容器尺寸一致"（例如所有 `.btn.sm` 只能是 28）。角色表见规范 3.4 节。

负向验证（临时副本注入，验证后已回退）：

| 注入 | 期望 | 实测 |
| --- | --- | --- |
| `.btn.sm{height:var(--ctl-lg)}` | `role-height` 报错（次级按钮 36 ∉ {28}） | 报错 ✓ |
| `.t-name{font-size:var(--fs-caption)}` | `role-font` 报错（正文 11 ∉ {13}） | 报错 ✓ |
| `color:#123456` | `color` 报错（字面色值） | 报错 ✓ |

## 5. 保留为 info 的容器/装饰尺寸（61 组 / 91 条，不阻塞）

这些是一次性容器/装饰尺寸，写进 token 反而会让阶梯失真。完整明细见 `scan-v2.json` 的 `infos`：

| 选择器 | 尺寸 |
| --- | --- |
| `::-webkit-scrollbar` | 10×10 |
| `.mark` / `.mark img` | 24×24 |
| `.dot` | 6×6 |
| `.wc` | 宽 34 |
| `.mini-track` | 高 4 |
| `.avatar` | 26×26 |
| `.spark` | 120×16 |
| `.field.w240/w190/w320/w420`、`.mini-select.w120` | 240 / 190 / min(320,34vw) / min(420,48vw) / max 120 |
| `.stat .u` | 24×24，窄窗 20×20 |
| `.bar` / `.bar.tall` / `.conn-row .bar` / `.video-job .track` | 5 / 6 / 3 / 4 |
| `.seg-ticks span` | 宽 1 |
| `.cb`、`.t-cb .cb`、`.radio` | 15×15 |
| `.radio.on::after` | 7×7 |
| `.tbtn` | 最小宽 24，窄窗 22 |
| `.empty .big` / `.det-icon` / `.poster .play` | 54 / 52 / 46 |
| `.modal-card` / `.modal-x` | min(940px,100%) / 28 |
| `.thumb` / `.thumb.sm` / `.sn-thumb` | 40（窄窗 34） / 32 / 44×30（窄窗 34×24） |
| `.t-sub .sep` / `.st .d` / `.seg i` / `.seg-legend b` / `.color-card .cc-dots i` | 2 / 5 / 8 / 8 / 9 |
| `.t-bar .pct` / `.conn-row .id` / `.conn-row .sp` / `.out-item .k` | 34 / 34 / 64 / 26 |
| `table.fmt` 各列 | 30 / 106 / 98 / 42 / 50 / 72 / 74 |
| `.log` / `.vid-auth-raw pre` / `.update-notes` | 最大高 190 / 220 / 132 |
| `.poster` | 高 200（窄窗 170） |
| `.mini-select` / `.slider` / `.filter-bar .mini-select` / `.select-wrap` | max 230 / 150 / max 150 / 220 |
| `.path-field .field` / `.update-card .set-row .field` | min(330,46vw) / min(300,42vw) |
| `body.minw-demo .vp-frame` | 最小宽 900 |
| `.sb`（图标轨） | 宽 44 / 40 |
| `.det-url` | 最大宽 640 |

`.sw` / `.sw::after` 已从 info 升为 token（`--sw-w` 40 / `--sw-knob` 16），`.ico` 已并入 `--ctl-sm`（28）。

## 6. 视觉验收（真实 Tauri 构建，12 张）

用 `--debug --no-bundle` 构建真实产物（真实 WebView2、真实窗口尺寸），脚本按宽度/明暗/配色重设窗口、点选视图后截图。
不用 `?demo`：demo 只有 960px 一个视口，验不出并档后的窄窗行为。

| 覆盖维度 | 文件 |
| --- | --- |
| 宽屏 1440 × 明/暗 | `main-1440-dark-violet.png`、`main-1440-light-violet.png` |
| 窄屏 960 × 明/暗 | `main-960-dark-violet.png`、`main-960-light-violet.png` |
| 最窄 760 × 明/暗 | `main-760-dark-violet.png`、`main-760-light-violet.png` |
| 四套配色（1180×760） | `theme-violet-1180.png`、`theme-azure-1180.png`、`theme-emerald-1180.png`、`theme-amber-1180.png` |
| 设置页（长内容 + 表单） | `settings-1440-dark-violet.png`、`settings-760-light-violet.png` |

（截图目录 [visual-v2/](visual-v2/)。为能真实验收 760 宽，`src-tauri/tauri.conf.json` 的 `minWidth` 由 900 调为 760。）

### 结论

- 字号并档后**没有**出现换行、截断、行高挤压：13px 正文在 1440/960/760 三档宽度下行数一致；元信息 11px 徽标、12px 次级文字在 760 窄窗仍单行显示；行高 1.6 在详情页段落、设置页说明、失败原因多行文本处均无贴行。
- 四套配色下徽标/状态色/进度条对比度一致，无因并档导致的弱化。
- **发现并修复 1 处真实缺陷**：760 宽、长中文文件名（任务 2 `Adobe_Photoshop_2024_v25.12.1_macOS_中文版.dmg`）把尾部"断点已保存"标签挤出行右边界被裁掉。修复：`src/app.js` 把文件名包进 `.nm`，CSS 由文件名自己省略、标签按内容占位（`.t-name > .nm{min-width:0;overflow:hidden;text-overflow:ellipsis}`、`.t-name > .tag{flex:0 0 auto}`）。1440 / 960 / 760 复拍确认标签完整、文件名正常省略。
- 另修 4 处同角色不一致：`.add-panel` 输入框与主按钮统一 32（原 36）；`.ico` 30→28；`.set-nav a` 12.5→13（导航项定档）；删除窄窗下与基准同档的冗余覆盖（`.stat .d`、`.det-title` 字号），并将窄窗 `.stat .v` 20→16、`.big-speed` 28→20 收进标题允许档位。

## 7. 复现

```powershell
node tools/Check-FwUiTokens.mjs --strict   # 期望：违规 0、例外 0、过期例外 0；exit 0
node tools/Check-FwUiTokens.mjs --json > docs/evidence/ui-tokens/scan-v2.json

# 视觉验收（需先构建：CARGO_TARGET_DIR=C:\fw-target npm run tauri build -- --debug --no-bundle）
powershell -ExecutionPolicy Bypass -File tools/Capture-FwUiShots.ps1 `
  -FwExe C:\fw-target\debug\fetchweir.exe -FwOut docs/evidence/ui-tokens/visual-v2
```
