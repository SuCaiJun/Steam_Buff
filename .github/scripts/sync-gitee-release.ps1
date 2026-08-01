param(
  [Parameter(Mandatory = $true)][string]$EventPath,
  [Parameter(Mandatory = $true)][string]$AssetDirectory
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

  $payload = @{
    tag_name = $tag
    target_commitish = ([string]$githubRelease.target_commitish).Trim()
    name = [string]$githubRelease.name
    body = [string]$githubRelease.body
    prerelease = ([bool]$githubRelease.prerelease).ToString().ToLowerInvariant()
  }

  $giteeRelease = Find-GiteeRelease $api $token $tag
  if ($giteeRelease) {
    Write-Host "Updating Gitee Release: $tag"
    $giteeRelease = Invoke-GiteeApi "PATCH" "$api/releases/$($giteeRelease.id)" $token $payload
  } else {
    Write-Host "Creating Gitee Release: $tag"
    $giteeRelease = Invoke-GiteeApi "POST" "$api/releases" $token $payload
  }

  $existingNames = @($giteeRelease.assets | ForEach-Object { [string]$_.name })
  if (Test-Path -LiteralPath $AssetDirectory) {
    foreach ($asset in @(Get-ChildItem -LiteralPath $AssetDirectory -File | Sort-Object Name)) {
      if ($existingNames -contains $asset.Name) {
        Write-Host "Gitee Release asset already exists: $($asset.Name)"
        continue
      }
      Upload-GiteeReleaseAsset $api $token $giteeRelease.id $asset.FullName
    }
  }
} catch {
  $message = [string]$_.Exception.Message
  if ($token) {
    $message = $message.Replace($token, "***")
    $message = $message.Replace([uri]::EscapeDataString($token), "***")
  }
  throw $message
}
