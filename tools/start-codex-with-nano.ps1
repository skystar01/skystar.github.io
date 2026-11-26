param(
    [ValidateRange(1, 65535)]
    [int]$ProxyPort = 65532,
    [string]$NanoPath = 'D:\Program Files\Nano\nano.exe'
)

$ErrorActionPreference = 'Stop'
$desktop = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like '*OpenAI.Codex*' }
if ($desktop) {
    throw 'Exit Codex from its tray/menu first, then run this script again. No process was stopped.'
}

$package = Get-AppxPackage -Name OpenAI.Codex |
    Sort-Object Version -Descending | Select-Object -First 1
if (!$package) { throw 'The OpenAI.Codex desktop package was not found.' }
$executable = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
if (!(Test-Path -LiteralPath $executable)) { throw 'Codex desktop executable was not found.' }

if (!(Get-Process -Name nano -ErrorAction SilentlyContinue)) {
    if (!(Test-Path -LiteralPath $NanoPath)) { throw "Nano was not found at $NanoPath." }
    Start-Process -FilePath $NanoPath -WindowStyle Hidden
}
$ready = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $pending = $client.ConnectAsync('127.0.0.1', $ProxyPort)
        if ($pending.Wait(1000) -and $client.Connected) { $ready = $true }
    } catch {
        $ready = $false
    } finally {
        $client.Dispose()
    }
    if ($ready) { break }
    Start-Sleep -Seconds 1
}
if (!$ready) { throw "Nano proxy port $ProxyPort is unavailable. Codex was not launched." }

$proxy = "http://127.0.0.1:$ProxyPort"
$probeHeaders = & curl.exe --proxy $proxy --connect-timeout 5 --max-time 15 --silent --show-error `
    --output NUL --dump-header - 'https://codex-cloud-backend.chatgpt.com'
if ($LASTEXITCODE -ne 0) {
    throw "Nano proxy $proxy could not reach the Codex cloud host. Check Nano before launching."
}
$statusLines = @($probeHeaders | Where-Object { $_ -match '^HTTP/\S+\s+\d{3}' })
if (!$statusLines.Count) { throw 'The proxy probe returned no HTTP status.' }
$probe = ($statusLines[-1] -split '\s+')[1]
if ($probe -eq '403' -or ($probeHeaders -match '^cf-mitigated:\s*challenge')) {
    throw 'The unauthenticated cloud probe was blocked (HTTP 403 / challenge). Select a fixed Nano route and retry. This does not establish the cause of authenticated Codex failures. Codex was not launched.'
}
if ([int]$probe -ge 500) { throw "Cloud probe returned HTTP $probe. Codex was not launched." }
Write-Host "Cloud host returned HTTP $probe. This tests reachability, not authenticated WebSocket health."

# Environment changes exist only in this shell and its new child process.
$names = @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY')
$previous = @{}
foreach ($name in $names) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    foreach ($name in @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY')) {
        [Environment]::SetEnvironmentVariable($name, $proxy, 'Process')
    }
    [Environment]::SetEnvironmentVariable('NO_PROXY', 'localhost,127.0.0.1,::1', 'Process')
    Start-Process -FilePath $executable -WindowStyle Hidden -ArgumentList @(
        "--proxy-server=$proxy",
        '--disable-quic',
        '--proxy-bypass-list=localhost;127.0.0.1;[::1]'
    )
    Write-Host "Codex launched with Nano proxy $proxy. Verify reconnection behavior in Codex."
} finally {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
