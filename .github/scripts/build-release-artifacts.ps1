<#
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 构建 Steam Buff Release 与 SourceCode 压缩包
 * @File          : build-release-artifacts.ps1
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
#>

param(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][string]$Version,
  [ValidateSet("beta", "formal")][string]$Channel = "beta",
  [string]$ChromePath = "",
  [string]$PemBase64 = ""
)

$ErrorActionPreference = "Stop"

function Ensure-File($path, $name) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "$name 不存在：$path"
  }
}

function Copy-ExtensionTree($source, $destination) {
  if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path $destination -Force | Out-Null

  $excludeDirs = @(".git", ".githooks", "node_modules", ".temp")
  $excludeFiles = @("*.pem", "*.crx", "*.zip", "*.log", "*.tmp")
  foreach ($item in @(Get-ChildItem -LiteralPath $source -Force)) {
    if ($item.PSIsContainer -and ($excludeDirs -contains $item.Name)) {
      continue
    }
    $skip = $false
    foreach ($pattern in $excludeFiles) {
      if ($item.Name -like $pattern) {
        $skip = $true
        break
      }
    }
    if ($skip) {
      continue
    }
    Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $destination $item.Name) -Recurse -Force
  }
}

function Resolve-Chrome($requestedPath) {
  if ($requestedPath) {
    Ensure-File $requestedPath "Chrome 浏览器"
    return $requestedPath
  }
  $candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }
  throw "找不到 Chrome 或 Edge，请通过 -ChromePath 指定。"
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifestVersion = ([string]$manifest.version).Trim()
if ($manifestVersion -ne $Version.Trim()) {
  throw "传入版本与 manifest.json 不一致：$Version / $manifestVersion"
}

if (Test-Path -LiteralPath $OutputDirectory) {
  Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$buildRoot = Join-Path $OutputDirectory "build"
$sourceRoot = Join-Path $buildRoot "extension"
Copy-ExtensionTree $root $sourceRoot

$sourceName = "SteamBuff_${Version}_SourceCode.zip"
$releaseName = "SteamBuff_${Version}_Release.zip"
$sourceZipPath = Join-Path $OutputDirectory $sourceName
$releaseZipPath = Join-Path $OutputDirectory $releaseName
Compress-Archive -Path (Join-Path $sourceRoot "*") -DestinationPath $sourceZipPath -Force

if (-not $PemBase64) {
  $PemBase64 = ([string]$env:STEAM_BUFF_PEM_BASE64).Trim()
}
if (-not $PemBase64) {
  throw "缺少 STEAM_BUFF_PEM_BASE64，不能生成保持扩展 ID 的 CRX。"
}

try {
  $pemBytes = [Convert]::FromBase64String($PemBase64)
} catch {
  throw "STEAM_BUFF_PEM_BASE64 不是有效的 Base64。"
}
$pemPath = Join-Path $buildRoot "Steam-Buff.pem"
[System.IO.File]::WriteAllBytes($pemPath, $pemBytes)
$browser = Resolve-Chrome $ChromePath

$packedCrxPath = "$sourceRoot.crx"
& $browser "--pack-extension=$sourceRoot" "--pack-extension-key=$pemPath" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "浏览器 CRX 打包失败。"
}
Ensure-File $packedCrxPath "打包后的 CRX"
$releaseCrxPath = Join-Path $buildRoot "SteamBuff_${Version}.crx"
Move-Item -LiteralPath $packedCrxPath -Destination $releaseCrxPath -Force
Compress-Archive -LiteralPath $releaseCrxPath -DestinationPath $releaseZipPath -Force

Write-Output "已生成：$sourceZipPath"
Write-Output "已生成：$releaseZipPath"
