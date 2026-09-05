# ============================================================
#  知识库构建工具：把学科思维导图 PDF 转成 app 用的知识库数据
#  处理：逐页渲染成高清 JPEG -> Windows 中文 OCR -> 自动生成每页提纲标题
#  输出：knowledge\<科目key>\meta.json（提纲） + pages\NNN.jpg（页面图片）
#  用法：.\build_knowledge.ps1 math   （只处理数学）
#        .\build_knowledge.ps1 all    （处理全部 7 科）
# ============================================================
$ErrorActionPreference = 'Continue'

# ---------- 配置 ----------
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$work = 'C:\pdfwork'
$pdftoppm = 'C:\pdfwork\poppler\poppler-26.07.0\Library\bin\pdftoppm.exe'
$outRoot = Join-Path $root 'knowledge'
$SCALE = 2000          # 渲染最长边像素
$JPEG_QUALITY = 82

$SUBJECTS = [ordered]@{
  math     = @{ file = 'C:\pdfwork\math.pdf';     name = '初中数学' }
  chinese  = @{ file = 'C:\pdfwork\chinese.pdf';  name = '初中语文' }
  english  = @{ file = 'C:\pdfwork\english.pdf';  name = '初中英语' }
  physics  = @{ file = 'C:\pdfwork\physics.pdf';  name = '初中物理' }
  chemistry= @{ file = 'C:\pdfwork\chemistry.pdf'; name = '初中化学' }
  history  = @{ file = 'C:\pdfwork\history.pdf';  name = '初中历史' }
  politics = @{ file = 'C:\pdfwork\politics.pdf'; name = '初中政治' }
}

# ---------- Windows OCR 基础设施 ----------
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $resultType) {
  $m = $asTaskGeneric.MakeGenericMethod($resultType)
  $t = $m.Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  return $t.Result
}
$ocrLang = [Windows.Globalization.Language]::new('zh-Hans-CN')
$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($ocrLang)

function Get-OcrLines($imagePath) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($ocrEngine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @()
  foreach ($line in $result.Lines) {
    $maxH = 0
    foreach ($w in $line.Words) { if ($w.BoundingRect.Height -gt $maxH) { $maxH = $w.BoundingRect.Height } }
    $t = ($line.Text -replace '\s', '').Trim()
    if ($t) { $lines += [pscustomobject]@{ h = [double]$maxH; text = $t } }
  }
  return $lines
}

# ---------- 标题清洗 ----------
function Get-CjkRatio($s) {
  if (-not $s) { return 0 }
  $cjk = ([regex]::Matches($s, '[\u4e00-\u9fa5]')).Count
  return $cjk / $s.Length
}

function Clean-TitleText($s) {
  # 去掉 OCR 常见噪音字符，保留中文/字母/数字/少量符号
  $t = [regex]::Replace($s, '[^\u4e00-\u9fa5A-Za-z0-9（）()、%＋×÷+=\-]', '')
  return $t
}

function Get-CleanTitle($lines) {
  if (-not $lines -or $lines.Count -eq 0) { return '' }
  # 从字号最大的 6 行里挑最像标题的：中文占比高、长度适中
  $sorted = @($lines | Sort-Object -Property h -Descending | Select-Object -First 6)
  $best = $null
  foreach ($c in $sorted) {
    $t = Clean-TitleText $c.text
    $cjk = Get-CjkRatio $t
    if ($cjk -lt 0.4) { continue }
    $len = $t.Length
    if ($len -ge 4 -and $len -le 45) { $best = $t; break }
  }
  if (-not $best) { $best = Clean-TitleText $sorted[0].text }
  # 截短：取最后一个"第X章/节/课/讲"之后的主题词（去掉章节目录前缀）
  $m = [regex]::Match($best, '第[一二三四五六七八九十百0-9]+[章节课讲]')
  if ($m.Success) {
    $tail = $best.Substring($m.Index + $m.Length)
    if ($tail.Length -ge 2) { return $tail }
  }
  if ($best.Length -gt 45) { $best = $best.Substring(0, 45) }
  return $best
}

# ---------- 处理单个科目 ----------
function Build-Subject($key) {
  $cfg = $SUBJECTS[$key]
  if (-not $cfg) { Write-Host "未知科目: $key"; return }
  Write-Host "========== 处理 $($cfg.name) ==========" -ForegroundColor Cyan
  $outDir = Join-Path $outRoot $key
  $pagesDir = Join-Path $outDir 'pages'
  New-Item -ItemType Directory -Force -Path $pagesDir | Out-Null
  $tmpDir = Join-Path $work "tmp_$key"
  if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

  # 0) 自动从源 PDF 文件夹复制（若 C:\pdfwork 下还没有）
  if (-not (Test-Path $cfg.file)) {
    $srcDir = Join-Path $root '初中学科思维导图PDF'
    $pdf = Get-ChildItem (Join-Path $srcDir "*$($cfg.name)*.pdf") | Select-Object -First 1
    if (-not $pdf) { Write-Host "找不到 $($cfg.name) 的源 PDF"; return }
    Copy-Item $pdf.FullName $cfg.file -Force
    Write-Host "已复制源 PDF: $($pdf.Name)"
  }

  # 1) 渲染所有页
  Write-Host "渲染页面（最长边 ${SCALE}px）..."
  & $pdftoppm -jpeg -jpegopt "quality=$JPEG_QUALITY" -scale-to $SCALE $cfg.file (Join-Path $tmpDir 'p') 2>$null
  $jpgs = @(Get-ChildItem $tmpDir -Filter 'p-*.jpg' | Sort-Object Name)
  Write-Host "共 $($jpgs.Count) 页"

  # 2) 逐页 OCR 出标题
  $pages = @()
  $review = New-Object System.Collections.Generic.List[string]
  $n = 0
  foreach ($jpg in $jpgs) {
    $n++
    $lines = Get-OcrLines $jpg.FullName
    $title = Get-CleanTitle $lines
    # 页号从 1 开始，文件名统一 3 位
    $pageNum = [int]($jpg.Name -replace 'p-(\d+)\.jpg', '$1')
    Copy-Item $jpg.FullName (Join-Path $pagesDir ('{0:000}.jpg' -f $pageNum)) -Force
    $pages += [pscustomobject]@{ n = $pageNum; title = $title }
    Write-Host ("  第 {0,2} 页: {1}" -f $pageNum, $title)
    # 复核文本：该页前 12 行文字
    $review.Add("===== 第 $pageNum 页 =====")
    $review.Add("【标题】$title")
    $i = 0
    foreach ($ln in @($lines | Sort-Object -Property h -Descending)) {
      if ($i -ge 12) { break }
      $s = $ln.text; if ($s.Length -gt 55) { $s = $s.Substring(0, 55) }
      $review.Add("  [$([math]::Round($ln.h))px] $s")
      $i++
    }
    $review.Add('')
  }
  [System.IO.File]::WriteAllLines((Join-Path $outDir 'review.txt'), $review, (New-Object System.Text.UTF8Encoding($false)))

  # 3) 写 meta.json
  $meta = [ordered]@{
    id = $key
    name = $cfg.name
    pageCount = $pages.Count
    pages = @($pages | Sort-Object n | ForEach-Object { [ordered]@{ n = $_.n; title = $_.title } })
  }
  $metaJson = $meta | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText((Join-Path $outDir 'meta.json'), $metaJson, (New-Object System.Text.UTF8Encoding($false)))
  Remove-Item $tmpDir -Recurse -Force
  $sizeMB = [math]::Round(((Get-ChildItem $pagesDir -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
  Write-Host "完成 → knowledge\$key （图片共 $sizeMB MB）" -ForegroundColor Green
}

# ---------- 主流程 ----------
$target = if ($args.Count -gt 0) { $args[0] } else { 'all' }
if ($target -eq 'all') {
  foreach ($k in $SUBJECTS.Keys) { Build-Subject $k }
} else {
  Build-Subject $target
}
Write-Host ""
Write-Host "全部完成！知识库数据位于 knowledge\ 目录" -ForegroundColor Green
