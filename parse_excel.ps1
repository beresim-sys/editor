Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$xlsx = (Get-ChildItem -Filter "*.xlsx" | Where-Object { $_.Name -notlike "~$*" } | Select-Object -First 1).FullName

$tempXlsx = Join-Path $env:TEMP "temp_scenes_parse.xlsx"
try {
    $fs = New-Object System.IO.FileStream($xlsx, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
    $ms = New-Object System.IO.MemoryStream
    $fs.CopyTo($ms)
    $fs.Dispose()
} catch {
    cmd /c copy /y "`"$xlsx`"" "`"$tempXlsx`"" | Out-Null
    $bytes = [System.IO.File]::ReadAllBytes($tempXlsx)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
}
$excelBytes = $ms.ToArray()
$ms.Position = 0

$zip = New-Object System.IO.Compression.ZipArchive($ms, [System.IO.Compression.ZipArchiveMode]::Read)
$entry = $zip.GetEntry("xl/sharedStrings.xml")
$reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
$xmlDoc = [xml]$reader.ReadToEnd()
$reader.Dispose()
$strings = [System.Collections.Generic.List[string]]::new()
$ns = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$ns.AddNamespace("d", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
foreach ($si in $xmlDoc.SelectNodes("//d:si", $ns)) {
    $textNodes = $si.SelectNodes(".//d:t", $ns)
    $sb = ""
    foreach ($tn in $textNodes) { $sb += $tn.InnerText }
    $strings.Add($sb)
}
$sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")
$sheetReader = New-Object System.IO.StreamReader($sheetEntry.Open(), [System.Text.Encoding]::UTF8)
$sheetXml = [xml]$sheetReader.ReadToEnd()
$sheetReader.Dispose()
$zip.Dispose()
$ms.Dispose()

$w_id = [char]0x05DE + [char]0x05D6
$w_pov = "pov"
$w_title = [char]0x05DB + [char]0x05D5
$w_time = [char]0x05D6 + [char]0x05DE
$w_loc = [char]0x05DE + [char]0x05D9 + [char]0x05E7
$w_sum = [char]0x05EA + [char]0x05E7
$w_rev = [char]0x05E0 + [char]0x05D7
$w_src = [char]0x05DE + [char]0x05E7 + [char]0x05D5 + [char]0x05E8

$row1 = $sheetXml.SelectSingleNode("//d:sheetData/d:row[1]", $ns)
$colMap = @{}
foreach ($c in $row1.SelectNodes("d:c", $ns)) {
    $colLetter = ($c.r -replace '\d+', '')
    $headerVal = ""
    $vNode = $c.SelectSingleNode("d:v", $ns)
    if ($vNode) {
        $rawVal = $vNode.InnerText
        if ($c.t -eq "s") {
            $idx = [int]$rawVal
            if ($idx -ge 0 -and $idx -lt $strings.Count) {
                $headerVal = $strings[$idx].Trim()
            }
        } else {
            $headerVal = $rawVal.Trim()
        }
    }
    
    $h = $headerVal.ToLower()
    if ($h.Contains($w_id) -or $h -eq "id") { $colMap['id'] = $colLetter }
    elseif ($h.Contains($w_pov) -or $h.Contains([char]0x05DE + [char]0x05D1 + [char]0x05D8) -or $h.Contains([char]0x05E1 + [char]0x05D8 + [char]0x05D8 + [char]0x05D5 + [char]0x05E1) -or $h -eq "status") { $colMap['pov'] = $colLetter }
    elseif ($h.Contains($w_title) -or $h -eq "title") { $colMap['title'] = $colLetter }
    elseif ($h.Contains($w_time) -or $h -eq "time") { $colMap['time'] = $colLetter }
    elseif ($h.Contains($w_loc) -or $h -eq "location") { $colMap['location'] = $colLetter }
    elseif ($h.Contains($w_sum) -or $h -eq "summary") { $colMap['summary'] = $colLetter }
    elseif ($h.Contains($w_rev) -or $h -eq "revealed") { $colMap['revealed'] = $colLetter }
    elseif ($h.Contains($w_src) -or $h -eq "source") { $colMap['source'] = $colLetter }
}

$rows = $sheetXml.SelectNodes("//d:sheetData/d:row", $ns)
$scenes = [System.Collections.Generic.List[object]]::new()

for ($i = 1; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    $rowCells = @{}
    foreach ($c in $row.SelectNodes("d:c", $ns)) {
        $colLetter = ($c.r -replace '\d+', '')
        $val = ""
        $vNode = $c.SelectSingleNode("d:v", $ns)
        if ($vNode) {
            $rawVal = $vNode.InnerText
            if ($c.t -eq "s") {
                $idx = [int]$rawVal
                if ($idx -ge 0 -and $idx -lt $strings.Count) {
                    $val = $strings[$idx]
                }
            } else {
                $val = $rawVal
            }
        }
        $rowCells[$colLetter] = $val
    }

    $id = if ($colMap.ContainsKey('id')) { $rowCells[$colMap['id']] } else { $rowCells['A'] }
    $pov = if ($colMap.ContainsKey('pov') -and $rowCells.ContainsKey($colMap['pov'])) { $rowCells[$colMap['pov']].Trim() } else { "" }
    $title = if ($colMap.ContainsKey('title')) { $rowCells[$colMap['title']] } else { $rowCells['C'] }
    $time = if ($colMap.ContainsKey('time')) { $rowCells[$colMap['time']] } else { $rowCells['D'] }
    $location = if ($colMap.ContainsKey('location')) { $rowCells[$colMap['location']] } else { $rowCells['E'] }
    $summary = if ($colMap.ContainsKey('summary')) { $rowCells[$colMap['summary']] } else { $rowCells['F'] }
    $revealed = if ($colMap.ContainsKey('revealed')) { $rowCells[$colMap['revealed']] } else { $rowCells['G'] }
    $source = if ($colMap.ContainsKey('source')) { $rowCells[$colMap['source']] } else { $rowCells['H'] }

    if (-not $id -and -not $title -and -not $summary) {
        continue
    }

    $cleanId = if ($id) { $id.Trim() } else { "scene_$i" }

    $sceneObj = [ordered]@{
        id = $cleanId
        title = if ($title) { $title.Trim() } else { "Scene $i" }
        time = if ($time) { $time.Trim() } else { "" }
        location = if ($location) { $location.Trim() } else { "" }
        pov = $pov
        summary = if ($summary) { $summary.Trim() } else { "" }
        revealedInfo = if ($revealed) { $revealed.Trim() } else { "" }
        source = if ($source) { $source.Trim() } else { "" }
    }
    $scenes.Add($sceneObj)
}

Write-Host "Parsed scenes: $($scenes.Count)"
if ($scenes.Count -eq 0) {
    Write-Error "No scenes parsed! Aborting write."
    exit 1
}
$json = $scenes | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes.json"), $json, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes-saved.json"), $json, [System.Text.Encoding]::UTF8)

$jsContent = "// scenes-data.js`r`n// Total scenes: $($scenes.Count)`r`nconst DEFAULT_SCENES = $json;`r`n"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes-data.js"), $jsContent, [System.Text.Encoding]::UTF8)

$b64 = [System.Convert]::ToBase64String($excelBytes)
$excelDataJs = "// excel-data.js`r`nconst EMBEDDED_EXCEL_B64 = `"$b64`";`r`n"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "excel-data.js"), $excelDataJs, [System.Text.Encoding]::UTF8)

Write-Host "Updated scenes.json, scenes-saved.json, scenes-data.js, and excel-data.js!"
