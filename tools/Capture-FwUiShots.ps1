# 真实 Tauri 构建的界面视觉验收：按「宽度 × 明暗 × 配色」批量截图。
#
# 为什么不用浏览器 demo：demo 只有 960px 一个视口，验不出字号的窄窗行为。
# 这里直接跑构建产物（decorations:false，窗口矩形就是界面本体），
# 用真实的 WebView2 渲染、真实的 Tauri 窗口尺寸，截图存到 docs/evidence/ui-tokens/。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools/Capture-FwUiShots.ps1 `
#     -FwExe C:\fw-target\debug\grabio.exe -FwOut docs/evidence/ui-tokens/visual-v2
#
# 依赖：已构建的 exe；%APPDATA%\Grabio 下的 settings.json / tasks.json 会被临时替换，
# 脚本结束（含异常）时还原。
param(
    [string]$FwExe = 'C:\fw-target\debug\grabio.exe',
    [string]$FwOut = 'docs/evidence/ui-tokens/visual-v2',
    # 只重拍个别图（例如修完一处再补），按文件名通配符过滤。
    [string]$FwOnly = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class FwWin {
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    // 取进程里可见窗口；应用除了主窗还有置顶的“更新就绪”小条，按面积选出主窗。
    public static List<IntPtr> Windows(uint pid) {
        var list = new List<IntPtr>();
        EnumWindows((h, p) => {
            uint wp; GetWindowThreadProcessId(h, out wp);
            if (wp == pid && IsWindowVisible(h)) {
                RECT r; GetWindowRect(h, out r);
                if (r.Right - r.Left > 40 && r.Bottom - r.Top > 40) list.Add(h);
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }
    public static IntPtr Largest(uint pid) {
        IntPtr best = IntPtr.Zero; long bestArea = 0;
        foreach (var h in Windows(pid)) {
            RECT r; GetWindowRect(h, out r);
            long a = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
            if (a > bestArea) { bestArea = a; best = h; }
        }
        return best;
    }
}
'@

[void][FwWin]::SetProcessDpiAwarenessContext([IntPtr](-4))  # PER_MONITOR_AWARE_V2

$fwData = Join-Path $env:APPDATA 'Grabio'
$fwOutDir = Join-Path (Get-Location) $FwOut
New-Item -ItemType Directory -Force -Path $fwOutDir | Out-Null

# 应用用 serde 读 JSON，BOM 会让它解析失败、静默回落成空状态——必须写成无 BOM。
$fwUtf8 = New-Object Text.UTF8Encoding($false)

# —— 备份用户数据，结束后还原 ——
$fwBackups = @{}
foreach ($name in 'settings.json', 'tasks.json') {
    $p = Join-Path $fwData $name
    if (Test-Path $p) { $fwBackups[$name] = [IO.File]::ReadAllText($p) }
}

function Stop-FwApp {
    # 必须等进程真的消失：应用装了 single-instance 插件，上一个实例还活着时新实例会直接退出。
    for ($i = 0; $i -lt 24; $i++) {
        $ps = @(Get-Process -Name grabio -ErrorAction SilentlyContinue)
        if ($ps.Count -eq 0) { break }
        foreach ($p in $ps) { try { $p.Kill() } catch { } }
        Start-Sleep -Milliseconds 200
    }
    Start-Sleep -Milliseconds 500
}

# —— 造一份有真实内容的任务列表：长文件名、中文名、失败原因，专门用来验截断与换行 ——
function New-FwTasks {
    $seg = @(@{start = 0; end = 1; done = 0 })
    $mk = {
        param($id, $url, $name, $total, $done, $state, $err)
        [ordered]@{
            id = $id; url = $url; saveDir = 'D:\Downloads'; fileName = $name; userNamed = $true
            connections = 8; total = $total; done = $done; state = $state; error = $err
            supportsRanges = $true; createdAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() - $id * 3600000
            segments = @(); partPath = "D:\Downloads\$name.part"; finalPath = "D:\Downloads\$name"
        }
    }
    $tasks = @(
        (& $mk 1 'https://mirrors.tuna.tsinghua.edu.cn/ubuntu-releases/24.04.1/ubuntu-24.04.1-desktop-amd64.iso' 'ubuntu-24.04.1-desktop-amd64.iso' 6550982656 4320133120 'paused' $null),
        (& $mk 2 'https://download.adobe.example.com/products/photoshop/2024/Adobe_Photoshop_2024_v25.12.1_macOS_中文版.dmg' 'Adobe_Photoshop_2024_v25.12.1_macOS_中文版.dmg' 2576980377 1020054732 'paused' $null),
        (& $mk 3 'https://files.example.com/VideoProc-Converter-AI-Setup-x64.exe' 'VideoProc-Converter-AI-Setup-x64.exe' 228589568 228589568 'completed' $null),
        (& $mk 4 'https://cdn.example.com/assets/2026/11/grabio-bundle-2026.11.15.tar.zst' 'grabio-bundle-2026.11.15.tar.zst' 0 0 'failed' 'HTTP 403 Forbidden：直链已过期，请重新获取下载地址'),
        (& $mk 5 'https://mirrors.aliyun.com/openjdk/21.0.5/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip' 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip' 197132288 0 'paused' $null),
        (& $mk 6 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-7.1-full_build.7z' 'ffmpeg-7.1-full_build.7z' 146800640 146800640 'completed' $null),
        (& $mk 7 'https://example.com/models/Stable-Diffusion-XL-base-1.0.safetensors' 'Stable-Diffusion-XL-base-1.0.safetensors' 6933053440 1258291200 'paused' $null),
        (& $mk 8 'https://example.com/archive/2026-11/国家统计局-2025年统计年鉴-完整版.pdf' '国家统计局-2025年统计年鉴-完整版.pdf' 0 0 'failed' '磁盘空间不足：目标目录剩余 1.2 GB，需要 2.4 GB')
    )
    [ordered]@{ version = 1; nextId = 9; tasks = $tasks } | ConvertTo-Json -Depth 8
}

function Set-FwTheme([string]$theme, [string]$color) {
    $s = $fwBackups['settings.json']
    $obj = if ($s) { $s | ConvertFrom-Json } else { [pscustomobject]@{} }
    $obj | Add-Member -NotePropertyName theme -NotePropertyValue $theme -Force
    $obj | Add-Member -NotePropertyName colorTheme -NotePropertyValue $color -Force
    $obj | Add-Member -NotePropertyName density -NotePropertyValue 'comfortable' -Force
    $obj | Add-Member -NotePropertyName startMinimized -NotePropertyValue $false -Force
    $obj | Add-Member -NotePropertyName closeToTray -NotePropertyValue $false -Force
    $obj | Add-Member -NotePropertyName downloadDir -NotePropertyValue 'D:\Downloads' -Force
    $obj | ConvertTo-Json -Depth 5 | ForEach-Object { [IO.File]::WriteAllText((Join-Path $fwData 'settings.json'), $_, $fwUtf8) }
}

function Save-FwShot {
    param([string]$Name, [int]$LogicalW, [int]$LogicalH, [string]$Theme, [string]$Color, [string]$ClickAt)
    if ($FwOnly -and $Name -notlike $FwOnly) { return }
    Stop-FwApp
    Set-FwTheme -theme $Theme -color $Color
    [IO.File]::WriteAllText((Join-Path $fwData 'tasks.json'), (New-FwTasks), $fwUtf8)

    $fwDebugPort = 0
    if ($ClickAt) {
        # 本张图要切视图：挑一个空闲回环端口，让 WebView2 开出 CDP 调试端口。
        $ln = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), 0
        $ln.Start()
        $fwDebugPort = ([System.Net.IPEndPoint]$ln.LocalEndpoint).Port
        $ln.Stop()
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$fwDebugPort"
    }
    $proc = Start-Process -FilePath $FwExe -PassThru
    Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
    $h = [IntPtr]::Zero
    for ($i = 0; $i -lt 60 -and $h -eq [IntPtr]::Zero; $i++) {
        Start-Sleep -Milliseconds 250
        $h = [FwWin]::Largest([uint32]$proc.Id)
    }
    if ($h -eq [IntPtr]::Zero) { throw "窗口没起来：$Name" }

    # 进程里除主窗还有极小的置顶条，把小的都藏掉，避免截进“更新就绪”提示。
    foreach ($w in [FwWin]::Windows([uint32]$proc.Id)) {
        if ($w -ne $h) { [void][FwWin]::ShowWindow($w, 0) }
    }

    $scale = [FwWin]::GetDpiForWindow($h) / 96.0
    # decorations:false 也带不可见的缩放边框，窗口矩形 ≠ 客户区；按差值换算，保证 CSS 视口正好是目标宽度。
    $r0 = New-Object FwWin+RECT
    $c0 = New-Object FwWin+RECT
    [void][FwWin]::GetWindowRect($h, [ref]$r0)
    [void][FwWin]::GetClientRect($h, [ref]$c0)
    $dW = ($r0.Right - $r0.Left) - ($c0.Right - $c0.Left)
    $dH = ($r0.Bottom - $r0.Top) - ($c0.Bottom - $c0.Top)
    $w = [int]($LogicalW * $scale) + $dW
    $hh = [int]($LogicalH * $scale) + $dH
    [void][FwWin]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, $w, $hh, 0x0004)  # SWP_NOZORDER：只改尺寸，不动 Z 序、不抬前台
    Start-Sleep -Milliseconds 1800   # 等 WebView2 重排 + 字体落位

    $c = New-Object FwWin+RECT
    [void][FwWin]::GetClientRect($h, [ref]$c)
    [void][FwWin]::GetWindowRect($h, [ref]$r0)

    # 需要切到别的视图（设置页）时，用 CDP 在页面里点元素。
    # 不开远程调试端口时无法切视图；这里只在本张图需要点击时才开，且只绑 127.0.0.1。
    if ($ClickAt) {
        & node (Join-Path $PSScriptRoot 'Click-FwUi.mjs') $fwDebugPort $ClickAt | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "点击 $ClickAt 失败（CDP）" }
        Start-Sleep -Milliseconds 900
    }
    $pw = $c.Right - $c.Left
    $ph = $c.Bottom - $c.Top
    # PrintWindow 只问目标窗口要内容：被别的窗口挡住也能截、不需要前台。
    # WebView2 需 PW_RENDERFULLCONTENT；它画的是整个窗口矩形，客户区居中偏移，截完裁掉边框。
    $fwW = $r0.Right - $r0.Left
    $fwH = $r0.Bottom - $r0.Top
    $full = New-Object System.Drawing.Bitmap $fwW, $fwH
    $g = [System.Drawing.Graphics]::FromImage($full)
    $hdc = $g.GetHdc()
    [void][FwWin]::PrintWindow($h, $hdc, 2)
    $g.ReleaseHdc($hdc)
    $g.Dispose()
    $crop = New-Object System.Drawing.Rectangle ([int](($fwW - $pw) / 2)), ([int](($fwH - $ph) / 2)), $pw, $ph
    $bmp = $full.Clone($crop, $full.PixelFormat)
    $full.Dispose()
    $path = Join-Path $fwOutDir ($Name + '.png')
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("{0}  {1}x{2} 逻辑 → {3}x{4} 物理  scale {5}" -f $Name, $LogicalW, $LogicalH, $pw, $ph, $scale)
}

try {
    # 明暗 × 三档宽度
    Save-FwShot -Name 'main-1440-dark-violet'  -LogicalW 1440 -LogicalH 900 -Theme 'dark'  -Color 'violet'
    Save-FwShot -Name 'main-1440-light-violet' -LogicalW 1440 -LogicalH 900 -Theme 'light' -Color 'violet'
    Save-FwShot -Name 'main-960-dark-violet'   -LogicalW 960  -LogicalH 760 -Theme 'dark'  -Color 'violet'
    Save-FwShot -Name 'main-960-light-violet'  -LogicalW 960  -LogicalH 760 -Theme 'light' -Color 'violet'
    Save-FwShot -Name 'main-760-dark-violet'   -LogicalW 760  -LogicalH 680 -Theme 'dark'  -Color 'violet'
    Save-FwShot -Name 'main-760-light-violet'  -LogicalW 760  -LogicalH 680 -Theme 'light' -Color 'violet'
    # 四套配色各一张（默认 1180×760 暗色）
    Save-FwShot -Name 'theme-violet-1180'      -LogicalW 1180 -LogicalH 760 -Theme 'dark'  -Color 'violet'
    Save-FwShot -Name 'theme-azure-1180'       -LogicalW 1180 -LogicalH 760 -Theme 'dark'  -Color 'azure'
    Save-FwShot -Name 'theme-emerald-1180'     -LogicalW 1180 -LogicalH 760 -Theme 'dark'  -Color 'emerald'
    Save-FwShot -Name 'theme-amber-1180'       -LogicalW 1180 -LogicalH 760 -Theme 'dark'  -Color 'amber'
    # 明色四套：v2 为过 4.5:1 调过 --fg-3 / --err / --info / 缩略图前景，必须逐套看淡底效果
    Save-FwShot -Name 'theme-violet-light-1180'  -LogicalW 1180 -LogicalH 760 -Theme 'light' -Color 'violet'
    Save-FwShot -Name 'theme-azure-light-1180'   -LogicalW 1180 -LogicalH 760 -Theme 'light' -Color 'azure'
    Save-FwShot -Name 'theme-emerald-light-1180' -LogicalW 1180 -LogicalH 760 -Theme 'light' -Color 'emerald'
    Save-FwShot -Name 'theme-amber-light-1180'   -LogicalW 1180 -LogicalH 760 -Theme 'light' -Color 'amber'
    # 设置页：开关、色卡、输入框、导航项都在这里，单独补两张极端宽度
    Save-FwShot -Name 'settings-1440-dark-violet' -LogicalW 1440 -LogicalH 900 -Theme 'dark'  -Color 'violet' -ClickAt '#navSettings'
    Save-FwShot -Name 'settings-760-light-violet' -LogicalW 760  -LogicalH 680 -Theme 'light' -Color 'violet' -ClickAt '#navSettings'
}
finally {
    Stop-FwApp
    foreach ($name in 'settings.json', 'tasks.json') {
        $p = Join-Path $fwData $name
        if ($fwBackups.ContainsKey($name)) { [IO.File]::WriteAllText($p, $fwBackups[$name], $fwUtf8) }
        elseif (Test-Path $p) { Remove-Item $p }
    }
}
