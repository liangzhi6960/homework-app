# 作业小管家 - 启动服务
# 用途：让手机和电脑通过网址访问「作业小管家」，并支持安装到手机桌面
# 用法：右键 -> 使用 PowerShell 运行（本机可用）
#       想让手机也能访问时：右键 -> 以管理员身份运行（自动放行防火墙，可局域网访问）
$ErrorActionPreference = 'SilentlyContinue'
$port = 8080
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

function Test-Cmd($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# 1) 有 Node.js 就用 Node（体验最好）
if (Test-Cmd node) { node "$root\server.js"; exit }

# 2) 有 Python 就用 Python
if (Test-Cmd python) {
    Write-Host "使用 Python 启动..." -ForegroundColor Green
    python -m http.server $port --directory $root
    exit
}

# 3) 都没有？用 Windows 自带的 PowerShell 内置服务器（不需要装任何东西）
Write-Host "使用 Windows 内置服务器..." -ForegroundColor Green

$lanIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { $_.IPAddress })

$listener = $null
$lanBound = $false
foreach ($cand in @("http://+:${port}/", "http://localhost:${port}/")) {
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add($cand)
        $l.Start()
        $listener = $l
        if ($cand -like 'http://+*') { $lanBound = $true }
        break
    } catch {
        if ($cand -like 'http://+*') {
            Write-Host "（未以管理员身份运行，手机无法访问；仅本机可用。想用手机访问请关闭后右键「以管理员身份运行」）" -ForegroundColor Yellow
        }
    }
}
if (-not $listener) {
    Write-Host "启动失败：端口 $port 可能被占用。" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

# 尝试放行防火墙（需要管理员；失败不影响本机使用）
netsh advfirewall firewall add rule name="作业小管家$port" dir=in action=allow protocol=TCP localport=$port | Out-Null

Write-Host ""
Write-Host "======== 作业小管家已启动 ========" -ForegroundColor Cyan
Write-Host "  本机访问:    http://localhost:$port"
if ($lanBound) {
    foreach ($ip in $lanIps) { Write-Host "  手机访问(同一WiFi): http://$ip`:$port" }
} else {
    Write-Host "  手机访问:    请以管理员身份重新运行本脚本（会自动放行防火墙）" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  手机浏览器打开上面的地址 -> 点菜单「添加到主屏幕」即可"
Write-Host "  按 Ctrl+C 停止服务"
Write-Host ""

$types = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'; '.png' = 'image/png'
    '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
}
while ($listener.IsListening) {
    $ctx = $null
    try {
        $ctx = $listener.GetContext()
        $u = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
        if ($u -eq '/') { $u = '/index.html' }
        $fp = Join-Path $root ($u.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not $fp.StartsWith($root)) { $ctx.Response.StatusCode = 403 }
        elseif (Test-Path $fp -PathType Leaf) {
            $ext = [IO.Path]::GetExtension($fp).ToLower()
            if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] }
            $bytes = [IO.File]::ReadAllBytes($fp)
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else { $ctx.Response.StatusCode = 404 }
    } catch { }
    if ($ctx) { try { $ctx.Response.Close() } catch { } }
}
