# server.ps1 - שרת מקומי קל משקל להפעלת עורך הסצנות וטעינה ישירה של קבצי אקסל
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$port = 8765
$prefix = "http://localhost:$port/"
$root = Get-Location

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    # Port might be in use, try alternate port
    $port = 8766
    $prefix = "http://localhost:$port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " לוח עריכת סצנות לספר פועל בכתובת:" -ForegroundColor Green
Write-Host " $prefix" -ForegroundColor Yellow
Write-Host " כל שינוי בקובץ 'סצנות לספר.xlsx' נטען אוטומטית ברענון הדף" -ForegroundColor Gray
Write-Host " לחץ Ctrl+C לסגירת השרת" -ForegroundColor Gray
Write-Host "=================================================" -ForegroundColor Cyan

# Open browser
Start-Process $prefix

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".xlsx" = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ($rawUrl -eq "/" -or [string]::IsNullOrWhiteSpace($rawUrl)) {
            $rawUrl = "/index.html"
        }

        # Normalize relative path
        $relPath = $rawUrl.TrimStart("/\").Replace("/", "\")
        $filePath = Join-Path $root $relPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            
            $response.ContentType = $contentType
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
            
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawUrl")
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    } catch {
        # Continue listening
    }
}
