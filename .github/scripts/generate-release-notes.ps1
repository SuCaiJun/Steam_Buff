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

$range = "$baseCommit..$headCommit"
$commits = @(Invoke-Git @("log", "--first-parent", "--reverse", "--format=%h%x09%s", $range))
$title = if ($Channel -eq "beta") { "Steam Buff Beta 更新日志" } else { "Steam Buff v$Version 更新日志" }
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# $title")
$lines.Add("")
$lines.Add("- 版本：$Version")
$lines.Add("- 构建提交：$headCommit")
$lines.Add("- 生成时间：$((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) UTC")
$lines.Add("")
$lines.Add("## 累计变更")
$lines.Add("")

if ($commits.Count -eq 0) {
  $lines.Add("- 本次范围内没有新的提交记录")
} else {
  foreach ($commit in $commits) {
    $parts = $commit -split "`t", 2
    $shortHash = $parts[0].Trim()
    $subject = if ($parts.Count -gt 1) { $parts[1].Trim() } else { "未读取到提交标题" }
    $lines.Add(('- ' + '`' + $shortHash + '` ' + $subject))
  }
}

$outputParent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputParent)) {
  New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, (($lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
Write-Output "更新日志已生成：$OutputPath"
