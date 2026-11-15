# 界面 token 检查证据（v1 收编）

- 基线：已发布并确认的 **v1.1.0** 界面（commit `HEAD`，即 tag `v1.1.0` 的样式）
- 检查脚本：[tools/Check-FwUiTokens.mjs](../../../tools/Check-FwUiTokens.mjs)
- 规范：[docs/界面设计规范.md](../../界面设计规范.md)
- 生成命令：

  ```powershell
  # 基线（把 HEAD 的 src 复制到临时目录后用同一脚本扫）
  node tools/Check-FwUiTokens.mjs --root <临时目录> --json > scan-baseline-v1.1.0.json
  # 收编后
  node tools/Check-FwUiTokens.mjs --json > scan-after-tokens.json
  ```

## 1. 汇总

| 指标 | 基线 v1.1.0 | 收编后 |
| --- | --- | --- |
| error 违规 | **523** | **0** |
| 例外放行 | 0 | 5（全部为几何派生值） |
| info（容器/装饰尺寸） | 93 | 96 |
| 过期例外 | 0 | 0 |

基线 523 条的分布：

| 规则 | 条数 | 文件分布 |
| --- | --- | --- |
| 间距 `spacing` | 252 | styles.css |
| 字号 `font-size` | 120 | styles.css |
| 行内样式 `inline-style` | 48 | index.html 45 / app.js 3 |
| 圆角 `radius` | 44 | styles.css |
| 颜色 `color` | 28 | styles.css |
| 控件高度 `control-height` | 16 | styles.css |
| 行高 `line-height` | 9 | styles.css |
| 描边宽度 `border-width` | 5 | styles.css |
| 字体族 `font-family` | 1 | styles.css |

## 2. 直接改掉的（全部 523 条）

- 颜色 28 条：文件类型缩略图、嗅探缩略图渐变、视频海报、播放键、时长角标、
  弹窗遮罩、关闭按钮 hover、开关滑块白点、`--ok` 的失效兜底值。
- 字号 120 + 行高 9 条：统一走 `--fs-*` / `--lh-*`；仅 9.5px→10px 两处、1.6/1.7→1.65 有肉眼级差异。
- 间距 252 条：统一走 `--space-*`；奇数取最近偶数档（差 ≤2px）。
- 圆角 44 条：3/5→4、6→7、8→9、12/16→14。
- 控件高度 16 条：25→24、27/29→28、38→40，其余为精确档（22/24/26/28/30/32/36/40）。
- 描边 5 条 + 字体族 1 条：`--bw` / `--bw-strong` / `--bw-scroll`，`--mono`。
- 行内样式 48 条：能直接换 token 的换 token；`height:6px`、32px 缩略图、1×10 分隔条、
  420/320/190/120 宽度抽成 `.bar.tall`、`.thumb.sm`、`.vsep`、`.field.w*`、`.mini-select.w120`。

## 3. 进例外清单的（5 条，均为几何派生值）

| 位置 | 值 | 理由 |
| --- | --- | --- |
| `.sb.active::before` | `left:-12px` | 选中指示条贴侧栏外沿，位移 = 侧栏内边距 12px 的负值；改内边距必须同步改这里 |
| `.main.has-sel .view` | `bottom:66px` | 列表区避让批量条 = 批量条 54px + 12px 间距，与 `.task-bulk` 高度绑定 |
| `.sw.on::after` | `left:18px` | 开关滑块位移 = 轨道 36 − 滑块 14 − 2×2 |
| `.toast` | `bottom:52px` | 离底 = 状态栏 30px + 22px 呼吸位 |
| `.minw-note` | `top:52px` | 离顶 = 标题栏 44px + 8px 间距 |

## 4. 保留为 info 的容器/装饰尺寸（96 条，不阻塞）

这些不是"漏了"，而是一次性容器尺寸；写进 token 反而会让阶梯失真。
按选择器归并如下（完整明细见 `scan-after-tokens.json` 的 `infos`）：

| 选择器 | 尺寸 |
| --- | --- |
| `::-webkit-scrollbar` | 10×10 |
| `.mark` / `.mark img` | 24×24 |
| `.dot` | 6×6 |
| `.wc` | 宽 34 |
| `.avatar` | 26×26 |
| `.spark` | 120×16 |
| `.ico` | 宽 30 |
| `.field.w240/w190/w320/w420`、`.mini-select.w120` | 240 / 190 / min(320,34vw) / min(420,48vw) / 120 |
| `.stat .u` | 24×24，窄窗 20×20 |
| `.bar` / `.bar.tall` / `.conn-row .bar` / `.video-job .track` | 5 / 6 / 3 / 4 |
| `.cb`、`.t-cb .cb`、`.radio` | 15×15 |
| `.radio.on::after` | 7×7 |
| `.tbtn` | 最小宽 24，窄窗 22 |
| `.empty .big` / `.det-icon` / `.poster .play` | 54 / 52 / 46 |
| `.modal-card` / `.modal-x` | min(940px,100%) / 28 |
| `.thumb` / `.thumb.sm` / `.sn-thumb` | 40(窄窗 34) / 32 / 44×30(窄窗 34×24) |
| `.t-sub .sep` / `.st .d` / `.seg i` / `.seg-legend b` / `.cc-dots i` | 2 / 5 / 8 / 8 / 9 |
| `.t-bar .pct` / `.conn-row .id` / `.conn-row .sp` / `.out-item .k` | 34 / 34 / 64 / 26 |
| `table.fmt` 各列 | 30 / 106 / 98 / 42 / 50 / 72 / 74 |
| `.log` / `.vid-auth-raw pre` / `.update-notes` | 最大高 190 / 220 / 132 |
| `.poster` | 高 200（窄窗 170） |
| `.sw` / `.sw::after` | 36 / 14×14 |
| `.mini-select` / `.select-wrap` / `.slider` / `.filter-bar .mini-select` | 230 / 220 / 150 / 150 |
| `.path-field .field` / `.update-card .field` | min(330,46vw) / min(300,42vw) |
| `body.minw-demo .vp-frame` | 最小宽 900 |
| `.sb`（图标轨） | 宽 44 / 40 |
| `.det-url` | 最大宽 640 |

## 5. 复现

```powershell
node tools/Check-FwUiTokens.mjs          # 期望：违规 0 条，例外 5 条，info 96 条
echo $LASTEXITCODE                        # 期望：0
```
