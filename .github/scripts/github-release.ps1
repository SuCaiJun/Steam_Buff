<#
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : GitHub Release 创建、更新、读取与清理
 * @File          : github-release.ps1
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
#>

param(
  [Parameter(Mandatory = $true)][ValidateSet("Publish", "ExportNotes", "Delete")][string]$Action,
  [Parameter(Mandatory = $true)][string]$Tag,
  [string]$Name = "",
  [string]$BodyPath = "",
  [string]$OutputBodyPath = "",
  [string]$Title = "",
  [string]$AssetDirectory = "",
  [string]$TargetCommit = "",
  [switch]$Prerelease
)

$ErrorActionPreference = "Stop"

$token = ([string]$env:GITHUB_TOKEN).Trim()
if (-not $token) {
  $token = ([string]$env:GH_TOKEN).Trim()
}
if (-not $token) {
  throw "缺少 GITHUB_TOKEN。"
}
$repository = ([string]$env:GITHUB_REPOSITORY).Trim()
if (-not $repository) {
  throw "缺少 GITHUB_REPOSITORY。"
}

$apiRoot = "https://api.github.com/repos/$repository"
$headers = @{
  Authorization = "Bearer $token"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent" = "Steam-Buff-Release-Automation"
}

function Invoke-GitHub($method, $path, $body = $null, $inFile = "", $contentType = "application/json") {
  $params = @{
    Method = $method
    Uri = if ($path -match '^https?://') { $path } else { "$apiRoot/$path" }
    Headers = $headers
  }
  if ($body -ne $null) {
    $params.Body = ($body | ConvertTo-Json -Depth 10 -Compress)
    $params.ContentType = "application/json"
  }
  if ($inFile) {
    $params.InFile = $inFile
    $params.ContentType = $contentType
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $status = 0
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -eq 404) {
      return $null
    }
    throw "GitHub API $method $path 失败：$($_.Exception.Message)"
  }
}

function Get-Release($tag) {
  return Invoke-GitHub "GET" "releases/tags/$([uri]::EscapeDataString($tag))"
}

function Ensure-Tag($tag, $target, $allowMove) {
  if (-not $target) {
    throw "发布 $tag 缺少目标提交。"
  }
  $ref = Invoke-GitHub "GET" "git/ref/tags/$([uri]::EscapeDataString($tag))"
  if (-not $ref) {
    Invoke-GitHub "POST" "git/refs" @{ ref = "refs/tags/$tag"; sha = $target } | Out-Null
    return
  }
  $currentSha = [string]$ref.object.sha
  if ($currentSha -eq $target) {
    return
  }
  if (-not $allowMove) {
    throw "正式标签 $tag 已存在且指向其他提交，拒绝覆盖。"
  }
  Invoke-GitHub "PATCH" "git/refs/tags/$([uri]::EscapeDataString($tag))" @{ sha = $target; force = $true } | Out-Null
}

function Publish-Release {
  if (-not $Name -or -not $BodyPath -or -not $AssetDirectory -or -not $TargetCommit) {
    throw "Publish 需要 Name、BodyPath、AssetDirectory 和 TargetCommit。"
  }
  if (-not (Test-Path -LiteralPath $BodyPath -PathType Leaf)) {
    throw "Release 正文不存在：$BodyPath"
  }
  if (-not (Test-Path -LiteralPath $AssetDirectory -PathType Container)) {
    throw "Release 资产目录不存在：$AssetDirectory"
  }
  $assets = @(Get-ChildItem -LiteralPath $AssetDirectory -File -Filter "*.zip" | Sort-Object Name)
  if ($assets.Count -ne 2) {
    throw "Release 资产必须恰好包含两个 zip 文件，当前为 $($assets.Count) 个。"
  }

  $allowMove = $Tag -eq "beta"
  Ensure-Tag $Tag $TargetCommit $allowMove
  $body = Get-Content -LiteralPath $BodyPath -Raw
  $payload = @{
    tag_name = $Tag
    target_commitish = $TargetCommit
    name = $Name
    body = $body
    draft = $false
    prerelease = [bool]$Prerelease
  }
  $release = Get-Release $Tag
  if ($release) {
    $release = Invoke-GitHub "PATCH" "releases/$($release.id)" $payload
  } else {
    $release = Invoke-GitHub "POST" "releases" $payload
  }
  if (-not $release.id) {
    throw "GitHub Release 创建或更新后没有返回 Release ID。"
  }

  $existingAssets = @(Invoke-GitHub "GET" "releases/$($release.id)/assets?per_page=100")
  foreach ($existing in $existingAssets) {
    if ($Tag -eq "beta" -or ($assets.Name -contains [string]$existing.name)) {
      Invoke-GitHub "DELETE" "releases/assets/$($existing.id)" | Out-Null
    }
  }
  foreach ($asset in $assets) {
    $uploadPath = "https://uploads.github.com/repos/$repository/releases/$($release.id)/assets?name=$([uri]::EscapeDataString($asset.Name))"
    Invoke-GitHub "POST" $uploadPath $null $asset.FullName "application/zip" | Out-Null
  }
  Write-Output "GitHub Release 已更新：$Tag"
}

function Export-ReleaseNotes {
  if (-not $OutputBodyPath) {
    throw "ExportNotes 需要 OutputBodyPath。"
  }
  $release = Get-Release $Tag
  if (-not $release) {
    throw "找不到 GitHub Release：$Tag"
  }
  if ($Tag -eq "beta" -and -not [bool]$release.prerelease) {
    throw "beta Release 不是预发布状态，拒绝作为正式日志来源。"
  }
  $body = [string]$release.body
  if ($Title) {
    $bodyLines = @($body -split "`r?`n")
    $firstContentIndex = -1
    for ($index = 0; $index -lt $bodyLines.Count; $index++) {
      if (-not [string]::IsNullOrWhiteSpace($bodyLines[$index])) {
        $firstContentIndex = $index
        break
      }
    }
    $hasRecognizedTitle = $firstContentIndex -ge 0 -and $bodyLines[$firstContentIndex] -match '^\s*(?:#\s+.+|\*\*.+\*\*)\s*$'
    if ($hasRecognizedTitle) {
      $bodyLines[$firstContentIndex] = "**$Title**"
      $body = (($bodyLines -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine)
    } else {
      $fallbackLines = @(
        "**$Title**",
        "",
        "---",
        "",
        "## 其他",
        ""
      ) + $bodyLines
      $body = (($fallbackLines -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine)
    }
  }
  $parent = Split-Path -Parent $OutputBodyPath
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($OutputBodyPath, $body, $utf8NoBom)
  Write-Output "已导出 Release 日志：$OutputBodyPath"
}

function Delete-Release {
  $release = Get-Release $Tag
  if ($release) {
    Invoke-GitHub "DELETE" "releases/$($release.id)" | Out-Null
  }
  $ref = Invoke-GitHub "GET" "git/ref/tags/$([uri]::EscapeDataString($Tag))"
  if ($ref) {
    Invoke-GitHub "DELETE" "git/refs/tags/$([uri]::EscapeDataString($Tag))" | Out-Null
  }
  Write-Output "GitHub Release 与标签已清理：$Tag"
}

switch ($Action) {
  "Publish" { Publish-Release }
  "ExportNotes" { Export-ReleaseNotes }
  "Delete" { Delete-Release }
}
