# server.ps1 - שרת מקומי קל משקל להפעלת עורך הסצנות
$port = 8765
$prefix = "http://localhost:$port/"
$root = (Get-Location).Path

# Kill any lingering powershell process listening on port 8765 to avoid port switching
try {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($p -and $p.Id -ne $PID -and $p.ProcessName -like "*powershell*") {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 400
            }
        }
    }
} catch {}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    $port = 8766
    $prefix = "http://localhost:$port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "Editor running at: $prefix" -ForegroundColor Cyan

# Prefer launching in Google Chrome if available, matching user workflow
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) {
    Start-Process $chrome -ArgumentList $prefix
} else {
    Start-Process $prefix
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    # CORS headers
    $res.AddHeader("Access-Control-Allow-Origin", "*")
    $res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.AddHeader("Access-Control-Allow-Headers", "Content-Type")

    if ($req.HttpMethod -eq "OPTIONS") {
        $res.StatusCode = 200
        $res.Close()
        continue
    }

    $urlPath = $req.Url.LocalPath
    if ($urlPath -eq "/" -or [string]::IsNullOrEmpty($urlPath)) {
        $urlPath = "/index.html"
    }

    # API Endpoint: Save scenes directly to disk
    if ($req.HttpMethod -eq "POST" -and $urlPath -eq "/api/save") {
        try {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            if (-not [string]::IsNullOrWhiteSpace($body)) {
                $savedJsonPath = Join-Path $root "scenes-saved.json"
                $scenesJsonPath = Join-Path $root "scenes.json"
                $scenesDataJsPath = Join-Path $root "scenes-data.js"

                [System.IO.File]::WriteAllText($savedJsonPath, $body, [System.Text.Encoding]::UTF8)
                [System.IO.File]::WriteAllText($scenesJsonPath, $body, [System.Text.Encoding]::UTF8)

                $jsCode = "// Auto-saved scenes`nconst DEFAULT_SCENES = $body;`n"
                [System.IO.File]::WriteAllText($scenesDataJsPath, $jsCode, [System.Text.Encoding]::UTF8)

                $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true,"message":"Saved to disk"}')
                $res.ContentType = "application/json; charset=utf-8"
                $res.ContentLength64 = $respBytes.Length
                $res.OutputStream.Write($respBytes, 0, $respBytes.Length)
                $res.StatusCode = 200
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Scenes permanently saved to disk files!" -ForegroundColor Green
            } else {
                $res.StatusCode = 400
            }
        } catch {
            Write-Host "Error saving via /api/save: $_" -ForegroundColor Red
            $res.StatusCode = 500
        }
        $res.Close()
        continue
    }

    $subPath = $urlPath.Substring(1)
    $targetFile = Join-Path $root $subPath

    if (Test-Path -LiteralPath $targetFile -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($targetFile).ToLower()
        switch ($ext) {
            ".html" { $res.ContentType = "text/html; charset=utf-8" }
            ".css"  { $res.ContentType = "text/css; charset=utf-8" }
            ".js"   { $res.ContentType = "application/javascript; charset=utf-8" }
            ".xlsx" { $res.ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
            ".json" { $res.ContentType = "application/json; charset=utf-8" }
            default { $res.ContentType = "application/octet-stream" }
        }

        $bytes = [System.IO.File]::ReadAllBytes($targetFile)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.StatusCode = 200
    } else {
        $res.StatusCode = 404
    }
    $res.Close()
}
