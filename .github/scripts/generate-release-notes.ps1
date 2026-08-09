<#
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 生成 Beta 与正式版更新日志
 * @File          : generate-release-notes.ps1
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
#>

param(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][string]$BaseRef,
  [Parameter(Mandatory = $true)][string]$HeadRef,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$Version,
  [ValidateSet("beta", "formal")][string]$Channel = "beta"
)

$ErrorActionPreference = "Stop"

function Invoke-Git([string[]]$Arguments) {
  $output = & git -C $RepositoryRoot @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Git 命令失败：git -C $RepositoryRoot $($Arguments -join ' ')`n$($output -join "`n")"
  }
  return @($output | ForEach-Object { [string]$_ })
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$headCommit = ([string](Invoke-Git @("rev-parse", $HeadRef) | Select-Object -First 1)).Trim()
$baseCommit = ([string](Invoke-Git @("merge-base", $BaseRef, $HeadRef) | Select-Object -First 1)).Trim()
$manifest = Get-Content -LiteralPath (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$manifestVersion = ([string]$manifest.version).Trim()
if ($manifestVersion -ne $Version.Trim()) {
  throw "传入版本与 manifest.json 不一致：$Version / $manifestVersion"
}

function Get-CommitTitle([string]$subject) {
  $text = $subject.Trim()
  if ($text -match '^(?<title>[^\s:：]{1,3})\s*[:：]') {
    return $Matches.title
  }
  if ($text -match '^(?<title>修复|fix)(?:\s+|$)') {
    return $Matches.title
  }
  if ($text -match '^(?<title>新增|功能|完善|重构|优化|移除|调整|文档)(?:\s+|$)') {
    return $Matches.title
  }
  return ""
}

function Get-CommitCategory([string]$title) {
  switch ($title) {
    "新增" { return "新增" }
    "功能" { return "新增" }
    "完善" { return "新增" }
    "重构" { return "重构" }
    "优化" { return "优化" }
    "修复" { return "修复" }
    "fix" { return "修复" }
    "移除" { return "移除" }
    "调整" { return "调整" }
    "文档" { return "文档" }
    "其他" { return "其他" }
    default {
      if ($title) {
        return $title
      }
      return "其他"
    }
  }
}

function Get-CommitDetail([string]$subject, [string]$title) {
  $text = $subject.Trim()
  if (-not $title) {
    return $text
  }
  if ($text -match '^[^\s:：]{1,3}\s*[:：]\s*') {
    return ($text -replace '^[^\s:：]{1,3}\s*[:：]\s*', '').Trim()
  }
  if ($text -match '^(?:修复|fix|新增|功能|完善|重构|优化|移除|调整|文档)(?:\s+|$)') {
    return ($text -replace '^(?:修复|fix|新增|功能|完善|重构|优化|移除|调整|文档)\s*', '').Trim()
  }
  return $text
}

$range = "$baseCommit..$headCommit"
$commits = @(Invoke-Git @("log", "--first-parent", "--reverse", "--format=%h%x09%s", $range))
$title = if ($Channel -eq "beta") { "Beta 更新日志" } else { "v$Version 更新日志" }
$categoryOrder = @("新增", "重构", "优化", "修复", "移除", "调整")
$dynamicCategories = [System.Collections.Generic.List[string]]::new()
$groups = @{}
foreach ($category in @($categoryOrder + @("文档", "其他"))) {
  $groups[$category] = [System.Collections.Generic.List[string]]::new()
}

foreach ($commit in $commits) {
  $parts = $commit -split "`t", 2
  $subject = if ($parts.Count -gt 1) { $parts[1].Trim() } else { "未读取到提交标题" }
  $commitTitle = Get-CommitTitle $subject
  $category = Get-CommitCategory $commitTitle
  if (-not $groups.ContainsKey($category)) {
    $groups[$category] = [System.Collections.Generic.List[string]]::new()
    if (-not $dynamicCategories.Contains($category)) {
      $dynamicCategories.Add($category)
    }
  }
  $groups[$category].Add((Get-CommitDetail $subject $commitTitle))
}

$renderOrder = @($categoryOrder + $dynamicCategories.ToArray() + @("文档", "其他"))
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("**$title**")
$lines.Add("")
$lines.Add("版本：$Version  ")
$lines.Add("构建提交：$headCommit  ")
$lines.Add("生成时间：$((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) UTC")
$lines.Add("")
$lines.Add("---")
$lines.Add("")

$hasChanges = $false
foreach ($category in $renderOrder) {
  if ($groups[$category].Count -eq 0) {
    continue
  }
  $hasChanges = $true
  $lines.Add("## $category")
  $lines.Add("")
  foreach ($subject in $groups[$category]) {
    $lines.Add("- $subject")
  }
  $lines.Add("")
}

if (-not $hasChanges) {
  $lines.Add("## 其他")
  $lines.Add("")
  $lines.Add("- 本次范围内没有新的提交记录")
}

$outputParent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputParent)) {
  New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, (($lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
Write-Output "更新日志已生成：$OutputPath"
