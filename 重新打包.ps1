# ============================================================
#  作业小管家 - 一键重新打包 APK
#  用法：改了网页代码后，右键本脚本 -> 使用 PowerShell 运行
#  产物：当前目录下的 作业小管家.apk
#  说明：aapt2 对中文路径支持差，构建统一在 C:\hwbuild 临时目录进行
# ============================================================
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$hw = 'C:\hwbuild'
$jdkDir = Join-Path $root 'android-build\jdk'
$sdk = Join-Path $root 'android-build\sdk'
$app = Join-Path $root 'android-build\app'
$env:JAVA_HOME = $jdkDir
$env:PATH = "$jdkDir\bin;$env:PATH"

Write-Host "== 1/8 同步网页资源到 assets =="
$www = Join-Path $app 'assets\www'
foreach ($d in @('css','js','icons','knowledge')) {
    $t = Join-Path $www $d
    if (Test-Path $t) { Remove-Item $t -Recurse -Force }
}
Copy-Item (Join-Path $root 'index.html') $www -Force
Copy-Item (Join-Path $root 'manifest.webmanifest') $www -Force
Copy-Item (Join-Path $root 'sw.js') $www -Force
Copy-Item (Join-Path $root 'knowledge-data.js') $www -Force
Copy-Item (Join-Path $root 'css') (Join-Path $www 'css') -Recurse -Force
Copy-Item (Join-Path $root 'js') (Join-Path $www 'js') -Recurse -Force
Copy-Item (Join-Path $root 'icons') (Join-Path $www 'icons') -Recurse -Force
if (Test-Path (Join-Path $root 'knowledge')) {
    Copy-Item (Join-Path $root 'knowledge') (Join-Path $www 'knowledge') -Recurse -Force
}

Write-Host "== 2/8 准备构建目录 C:\hwbuild =="
if (Test-Path $hw) { Remove-Item $hw -Recurse -Force }
New-Item -ItemType Directory -Force -Path $hw | Out-Null
Copy-Item (Join-Path $sdk 'platforms\android-34\android.jar') (Join-Path $hw 'android.jar')
Copy-Item (Join-Path $sdk 'build-tools\34.0.0') (Join-Path $hw 'bt') -Recurse -Force
Copy-Item (Join-Path $app 'AndroidManifest.xml') (Join-Path $hw 'AndroidManifest.xml')
Copy-Item (Join-Path $app 'res') (Join-Path $hw 'res') -Recurse -Force
Copy-Item (Join-Path $app 'assets') (Join-Path $hw 'assets') -Recurse -Force
Copy-Item (Join-Path $root 'android-build\hw.keystore') (Join-Path $hw 'hw.keystore')

Write-Host "== 3/8 javac 编译 =="
$clsDir = Join-Path $hw 'classes'
New-Item -ItemType Directory -Force -Path $clsDir | Out-Null
Copy-Item (Join-Path $app 'src') (Join-Path $hw 'src') -Recurse -Force
& (Join-Path $jdkDir 'bin\javac.exe') -encoding UTF-8 -classpath (Join-Path $hw 'android.jar') -d $clsDir (Join-Path $hw 'src\com\hw\homework\MainActivity.java')
if ($LASTEXITCODE -ne 0) { throw 'javac 失败' }

Write-Host "== 4/8 d8 转 dex =="
$dexDir = Join-Path $hw 'dex'
New-Item -ItemType Directory -Force -Path $dexDir | Out-Null
$classFiles = @(Get-ChildItem $clsDir -Recurse -Filter '*.class' | ForEach-Object { $_.FullName })
& (Join-Path $hw 'bt\d8.bat') --release --lib (Join-Path $hw 'android.jar') --min-api 24 --output $dexDir $classFiles
if ($LASTEXITCODE -ne 0) { throw 'd8 失败' }

Write-Host "== 5/8 aapt2 打包资源 =="
& (Join-Path $hw 'bt\aapt2.exe') compile --dir (Join-Path $hw 'res') -o (Join-Path $hw 'res.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile 失败' }
& (Join-Path $hw 'bt\aapt2.exe') link -o (Join-Path $hw 'base.apk') -I (Join-Path $hw 'android.jar') --manifest (Join-Path $hw 'AndroidManifest.xml') --min-sdk-version 24 --target-sdk-version 34 --version-code 1 --version-name 1.0 (Join-Path $hw 'res.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link 失败' }

Write-Host "== 6/8 写入 assets（正斜杠路径，安卓才能识别）与 classes.dex =="
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open((Join-Path $hw 'base.apk'), [System.IO.Compression.ZipArchiveMode]::Update)
# assets：遍历 C:\hwbuild\assets 下所有文件，条目名统一用正斜杠（assets/www/...）
$assetRoot = Join-Path $hw 'assets'
foreach ($file in @(Get-ChildItem $assetRoot -Recurse -File)) {
    $rel = $file.FullName.Substring($assetRoot.Length).TrimStart('\','/').Replace('\','/')
    $entryName = 'assets/' + $rel
    $old = $zip.GetEntry($entryName)
    if ($old) { $old.Delete() }
    $en = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $st = $en.Open()
    $b = [System.IO.File]::ReadAllBytes($file.FullName)
    $st.Write($b, 0, $b.Length); $st.Close()
}
# classes.dex
$ex = $zip.GetEntry('classes.dex'); if ($ex) { $ex.Delete() }
$en = $zip.CreateEntry('classes.dex', [System.IO.Compression.CompressionLevel]::Optimal)
$st = $en.Open()
$b = [System.IO.File]::ReadAllBytes((Join-Path $dexDir 'classes.dex'))
$st.Write($b, 0, $b.Length); $st.Close(); $zip.Dispose()

Write-Host "== 7/8 zipalign 对齐 =="
& (Join-Path $hw 'bt\zipalign.exe') -f -p 4 (Join-Path $hw 'base.apk') (Join-Path $hw 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'zipalign 失败' }

Write-Host "== 8/8 签名 =="
& (Join-Path $jdkDir 'bin\java.exe') -jar (Join-Path $hw 'bt\lib\apksigner.jar') sign --ks (Join-Path $hw 'hw.keystore') --ks-key-alias hw --ks-pass pass:hw123456 --key-pass pass:hw123456 --out (Join-Path $hw 'final.apk') (Join-Path $hw 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'apksigner 失败' }

Copy-Item (Join-Path $hw 'final.apk') (Join-Path $root '作业小管家.apk') -Force
$size = [math]::Round((Get-Item (Join-Path $root '作业小管家.apk')).Length / 1KB, 1)
Write-Host ""
Write-Host "打包完成！→ $(Join-Path $root '作业小管家.apk')（${size} KB）" -ForegroundColor Green
Write-Host "把这个文件发到手机安装即可（需允许安装未知来源应用）" -ForegroundColor Green
