<#
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : GitHub 正式 Release 到 Gitee 的同步与 Beta 清理
 * @File          : sync-gitee-release.ps1
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
#>

param(
  [Parameter(Mandatory = $true)][string]$EventPath,
  [Parameter(Mandatory = $true)][string]$AssetDirectory,
  [string]$EventAction = ""
)

$ErrorActionPreference = "Stop"

function Invoke-GiteeApi($method, $uri, $token, $body = $null) {
  $params = @{
    Method = $method
    Uri = $uri
  }
  if ($body -eq $null) {
    $separator = if ($uri.Contains("?")) { "&" } else { "?" }
    $params.Uri = "$uri${separator}access_token=$([uri]::EscapeDataString($token))"
    return Invoke-RestMethod @params
  }

  $payload = @{}
  foreach ($key in $body.Keys) {
    $payload[$key] = $body[$key]
  }
  $payload.access_token = $token
  $params.Body = $payload
  $params.ContentType = "application/x-www-form-urlencoded"
  return Invoke-RestMethod @params
}

function Find-GiteeRelease($api, $token, $tag) {
  $releases = @(Invoke-GiteeApi "GET" "$api/releases" $token)
  foreach ($release in $releases) {
    if ([string]$release.tag_name -eq $tag) {
      return $release
    }
  }
  return $null
}

function Upload-GiteeReleaseAsset($api, $token, $releaseId, $asset) {
  $name = Split-Path $asset -Leaf
  Write-Host "Uploading Gitee Release asset: $name"
  $output = & curl -sS -X POST "$api/releases/$releaseId/attach_files" -F "access_token=$token" -F "file=@$asset" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload Gitee Release asset: $name`n$output"
  }
  $output | ConvertFrom-Json | Out-Null
}

function Remove-GiteeReleaseAsset($api, $token, $releaseId, $asset) {
  $name = [string]$asset.name
  $assetId = [string]$asset.id
  if (-not $assetId) {
    throw "Gitee Release asset ID is missing: $name"
  }
  Invoke-GiteeApi "DELETE" "$api/releases/$releaseId/attach_files/$assetId" $token | Out-Null
  Write-Host "Removed Gitee Release asset: $name"
}

function Remove-GiteeRelease($api, $token, $release) {
  if ($release) {
    Invoke-GiteeApi "DELETE" "$api/releases/$($release.id)" $token | Out-Null
    Write-Host "Removed Gitee Release: $($release.tag_name)"
  }
}

$token = ([string]$env:GITEE_TOKEN).Trim()
if (-not $token) {
  throw "GITEE_TOKEN is not configured."
}

try {
  $event = Get-Content -LiteralPath $EventPath -Raw | ConvertFrom-Json
  $githubRelease = $event.release
  if (-not $githubRelease) {
    throw "GitHub event does not contain release data."
  }

  $owner = "sys1em"
  $repo = "Steam_Buff"
  $api = "https://gitee.com/api/v5/repos/$owner/$repo"
  $tag = ([string]$githubRelease.tag_name).Trim()
  if (-not $tag) {
    throw "GitHub Release tag is empty."
  }

  $giteeRelease = Find-GiteeRelease $api $token $tag
  $isBeta = $tag -eq "beta-release" -or [bool]$githubRelease.prerelease
  if ($EventAction -eq "deleted" -or $isBeta) {
    Remove-GiteeRelease $api $token $giteeRelease
    Write-Host "Skipped Gitee Release for non-formal tag: $tag"
    exit 0
  }

  $payload = @{
    tag_name = $tag
    target_commitish = ([string]$githubRelease.target_commitish).Trim()
    name = [string]$githubRelease.name
    body = [string]$githubRelease.body
    prerelease = ([bool]$githubRelease.prerelease).ToString().ToLowerInvariant()
  }

  if ($giteeRelease) {
    Write-Host "Updating Gitee Release: $tag"
    $giteeRelease = Invoke-GiteeApi "PATCH" "$api/releases/$($giteeRelease.id)" $token $payload
  } else {
    Write-Host "Creating Gitee Release: $tag"
    $giteeRelease = Invoke-GiteeApi "POST" "$api/releases" $token $payload
  }

  $existingAssets = @(Invoke-GiteeApi "GET" "$api/releases/$($giteeRelease.id)/attach_files" $token)
  if (-not (Test-Path -LiteralPath $AssetDirectory -PathType Container)) {
    throw "正式 Release 附件目录不存在：$AssetDirectory"
  }
  $assets = @(Get-ChildItem -LiteralPath $AssetDirectory -File -Filter "*.zip" | Sort-Object Name)
  $version = $tag -replace '^v', ''
  $expectedAssetNames = @(
    "SteamBuff_${version}_Release.zip",
    "SteamBuff_${version}_SourceCode.zip"
  ) | Sort-Object
  $actualAssetNames = @($assets | ForEach-Object { [string]$_.Name } | Sort-Object)
  if ($assets.Count -ne 2) {
    throw "正式 Release 必须包含两个 zip 附件，当前为 $($assets.Count) 个。"
  }
  if ((Compare-Object -ReferenceObject $expectedAssetNames -DifferenceObject $actualAssetNames).Count -ne 0) {
    throw "正式 Release 附件名称不符合版本契约，必须为：$($expectedAssetNames -join '、')。"
  }
  foreach ($asset in $assets) {
    $matchingAssets = @($existingAssets | Where-Object { [string]$_.name -eq $asset.Name })
    if ($matchingAssets.Count -gt 1) {
      throw "Gitee Release 存在多个同名附件，拒绝自动替换：$($asset.Name)"
    }
    if ($matchingAssets.Count -eq 1) {
      Remove-GiteeReleaseAsset $api $token $giteeRelease.id $matchingAssets[0]
    }
    Upload-GiteeReleaseAsset $api $token $giteeRelease.id $asset.FullName
  }
} catch {
  $message = [string]$_.Exception.Message
  if ($token) {
    $message = $message.Replace($token, "***")
    $message = $message.Replace([uri]::EscapeDataString($token), "***")
  }
  throw $message
}
