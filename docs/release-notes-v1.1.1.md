# Grabio 1.1.1

本版把产品名从 **Fetchweir** 改为 **Grabio**，功能与 1.1.0 一致。改名的查重口径、
被排除的备选与已知风险见 [命名决策.md](命名决策.md)。

## 改名范围

| 位置 | 1.1.0 | 1.1.1 |
| --- | --- | --- |
| 产品名 / 窗口标题 | Fetchweir | **Grabio** |
| 安装包 | `Fetchweir_1.1.0_x64-setup*.exe` | **`Grabio_1.1.1_x64-setup*.exe`** |
| 安装目录（当前用户） | `%LOCALAPPDATA%\Fetchweir` | **`%LOCALAPPDATA%\Grabio`** |
| 安装目录（所有用户） | `%ProgramFiles%\Fetchweir` | **`%ProgramFiles%\Grabio`** |
| 数据目录 | `%APPDATA%\Fetchweir` | **`%APPDATA%\Grabio`** |
| WebView2 配置目录 | `%LOCALAPPDATA%\dev.fetchweir.app` | **`%LOCALAPPDATA%\dev.grabio.app`** |
| 卸载登记项 | `…\Uninstall\Fetchweir` | **`…\Uninstall\Grabio`** |
| 浏览器宿主注册名 | `dev.fetchweir.nmh` | **`dev.grabio.nmh`** |
| Firefox 扩展 ID | `fetchweir@yunyu697` | **`grabio@yunyu697`** |
| Chrome/Edge 扩展 ID | `fjngndhalbkfkfcfhleflcgkicknkele` | 不变（manifest `key` 未动） |
| 更新源 | `yunyu697/fetchweir` | **`yunyu697/grabio`** |

签名私钥与内置公钥**未重新生成**，1.1.1 的 `latest.json` 仍由同一把私钥签名。

## 全新安装

1.1.1 是全新安装版：请先卸载旧版 Fetchweir（自带卸载器），再安装 Grabio。
两版互不相认——旧版的数据目录、WebView2 配置与浏览器宿主注册不会自动迁移，
也不会被新版读取。旧版数据目录默认保留在 `%APPDATA%\Fetchweir`，可自行备份后删除。

## 本机实测（Windows 11，2026-11-15）

| 项目 | 结果 |
| --- | --- |
| 两个安装包构建 | `Grabio_1.1.1_x64-setup.exe`（当前用户）与 `…-allusers.exe`（所有用户），字节不同，分别内嵌 `asInvoker` / `requireAdministrator` |
| 当前用户安装 | 静默安装退出码 0；装到 `%LOCALAPPDATA%\Grabio`；卸载项 `Grabio 1.1.0/1.1.1`；开始菜单与桌面快捷方式均生成 |
| 所有用户安装 | UAC 后静默安装退出码 0；装到 `%ProgramFiles%\Grabio`，卸载项在 HKLM；卸载后目录与键均清空 |
| 启动 | 窗口标题 `Grabio · 下载管理`；`app_info` 返回 version 1.1.0（阶段 1 构建）/ 1.1.1，dataDir 为 `%APPDATA%\Grabio` |
| 浏览器宿主注册 | 启动后 Chrome / Chromium / Edge / Brave / Vivaldi / Firefox 六处均写入 `dev.grabio.nmh`，指向 `%APPDATA%\Grabio\nm\dev.grabio.nmh(.firefox).json` |
| 扩展 | 真实 Chromium（headless Edge）三档嗅探 + 浮动条，8/8 通过，扩展 ID 仍为 `fjngndhalbkfkfcfhleflcgkicknkele` |
| 检查更新 | 1.1.0 构建对当时最新 Release（v1.1.0）返回 `upToDate`，界面显示「已是最新版本」 |
| 旧地址重定向 | `github.com/yunyu697/fetchweir` → 301 到 `/grabio`；旧路径下的 `releases/latest`、`latest.json`、`latest.json.sig` 均仍可下载（200） |
| 界面闸门 | `Check-FwUiTokens.mjs --strict` error 0 / 例外 0 / info 0（归档 `docs/evidence/ui-tokens/scan-1.1.1.json`）；`Check-FwContrast.mjs` 明暗 × 四套配色全部达标 |

## 已知限制（与 1.1.0 相同）

- 安装包**未做代码签名**：首次运行会被 SmartScreen 拦截，需「更多信息」→「仍要运行」；
  只从本仓库 Releases 下载。
- 浏览器扩展需手动加载（`chrome://extensions` 开发者模式 → 加载已解压的扩展程序）。
- 名称风险：`grabio.io` 存在同名产品的开发中占位页，域名不可得。详见 [命名决策.md](命名决策.md)。
- macOS / Linux 仍只有 CI 编译与单测，未构建产物、未跑 GUI。

## 未验证 / 不做的事

- 本版**不包含**旧版数据迁移：1.1.0 的 `tasks.json`、设置、下载记录不会被读取；
  代码里也没有旧目录检测或旧注册清理逻辑。
- 未验证「1.1.0 已安装 → 覆盖安装 1.1.1」：安装目录与卸载项都换了名字，属于两套并存而非升级。
- CI 三平台编译通过不等于运行时可用（WebView 启动、托盘、Native Messaging、系统级安装均未在非 Windows 实测）。
