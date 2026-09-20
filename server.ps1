# server.ps1 - שרת מקומי קל משקל להפעלת עורך הסצנות
$port = 8765
$prefix = "http://localhost:$port/"
$root = (Get-Location).Path

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

Write-Host "Editor running at: $prefix"
Start-Process $prefix

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    $urlPath = $req.Url.LocalPath
    if ($urlPath -eq "/" -or [string]::IsNullOrEmpty($urlPath)) {
        $urlPath = "/index.html"
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
