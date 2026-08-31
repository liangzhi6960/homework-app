# ============================================================
#  作业小管家 - 推送到 GitHub（请双击「推送到GitHub.bat」运行）
#  首次运行会打开浏览器登录你的 GitHub 账号（只需一次），
#  然后自动创建私有仓库 homework-app 并上传全部代码。
#  本脚本已做兜底：任何出错都会停住窗口显示原因，不会一闪而过。
# ============================================================
# 注意：不能用 'Stop' —— PowerShell 5.1 会把外部命令的 stderr 输出当致命错误，
# 导致 gh 的“未登录”提示直接终止脚本（窗口一闪而过）。这里用 Continue，
# 流程统一靠 $LASTEXITCODE 判断（脚本已对所有外部命令做了检查）。
$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$git = Join-Path $root 'android-build\tools\mingit\cmd\git.exe'
$gh = Join-Path $root 'android-build\tools\gh\bin\gh.exe'
$repoName = 'homework-app'

# gh 内部会调用 git，需要把 MinGit 加进 PATH
$env:PATH = "$(Join-Path $root 'android-build\tools\mingit\cmd');$env:PATH"

try {
    if (-not (Test-Path $git) -or -not (Test-Path $gh)) {
        Write-Host "找不到 GitHub 工具：" -ForegroundColor Yellow
        Write-Host "  $git" -ForegroundColor Yellow
        Write-Host "  $gh" -ForegroundColor Yellow
        Write-Host "请确认 android-build\tools 目录完整，然后重新运行。" -ForegroundColor Yellow
        Read-Host "按回车退出"
        exit 1
    }

    Write-Host ""
    Write-Host "======== 推送到 GitHub ========" -ForegroundColor Cyan

    # 1) 登录 GitHub（已登录则跳过）
    & $gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "首次使用，需要登录你的 GitHub 账号：" -ForegroundColor Green
        Write-Host " 1) 浏览器会自动打开授权页面（若没打开，手动复制窗口里显示的网址）"
        Write-Host " 2) 在网页里输入窗口中显示的「一次性代码」，点 Authorize 授权"
        Write-Host " 3) 回到本窗口等待提示成功"
        Write-Host ""
        "y" | & $gh auth login --web --git-protocol https --hostname github.com
        if ($LASTEXITCODE -ne 0) {
            Write-Host "登录失败（退出码 $LASTEXITCODE），请重新运行本脚本再试。" -ForegroundColor Yellow
            Read-Host "按回车退出"
            exit 1
        }
        Write-Host "登录成功！" -ForegroundColor Green
    }

    # 2) 让 git 复用 gh 的登录凭证（免去输入密码/令牌）
    & $gh auth setup-git
    if ($LASTEXITCODE -ne 0) {
        Write-Host "配置登录凭证失败，请截图反馈。" -ForegroundColor Yellow
        Read-Host "按回车退出"
        exit 1
    }

    # 3) 创建私有仓库并推送（已创建过则直接推送更新）
    Push-Location $root
    try {
        $remote = & $git remote get-url origin 2>$null
        if (-not $remote) {
            Write-Host "正在创建私有仓库 $repoName 并上传，请稍候..." -ForegroundColor Green
            & $gh repo create $repoName --private --source . --remote origin --push
        } else {
            Write-Host "仓库已存在，直接推送最新代码..." -ForegroundColor Green
            & $git push -u origin main
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "上传成功！🎉" -ForegroundColor Green
            $url = (& $gh repo view $repoName --json url -q .url 2>$null)
            if ($url) { Write-Host "打开查看：$url" -ForegroundColor Green }
            else { Write-Host "打开 https://github.com/<你的用户名>/$repoName 查看" -ForegroundColor Green }
        } else {
            Write-Host "推送失败（退出码 $LASTEXITCODE），请把窗口内容截图反馈。" -ForegroundColor Yellow
        }
    } finally {
        Pop-Location
    }
} catch {
    Write-Host ""
    Write-Host "出错了：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "请把这个窗口的内容截图发给我排查。" -ForegroundColor Yellow
}

Read-Host "按回车退出"
