Add-Type -AssemblyName System.IO.Compression.FileSystem
$xlsx = (Get-ChildItem -Filter "*.xlsx" | Select-Object -First 1).FullName
$zip = [System.IO.Compression.ZipFile]::OpenRead($xlsx)
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

# Load backup for POV lookup
$povMap = @{}
$bkFile = Join-Path (Get-Location) "scenes-backup.json"
if (Test-Path $bkFile) {
    $bk = Get-Content $bkFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($s in $bk) {
        if ($s.id -and $s.pov) {
            $povMap[$s.id] = $s.pov
        }
    }
}

# Load new POV defaults if present
$newPovsFile = Join-Path (Get-Location) "new_povs.json"
if (Test-Path $newPovsFile) {
    $newPovs = Get-Content $newPovsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($prop in $newPovs.PSObject.Properties) {
        $povMap[$prop.Name] = $prop.Value
    }
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

    $id = $rowCells['A']
    $title = $rowCells['B']
    $time = $rowCells['C']
    $location = $rowCells['D']
    $summary = $rowCells['E']
    $revealed = $rowCells['F']
    $source = $rowCells['G']

    if (-not $id -and -not $title -and -not $summary) {
        continue
    }

    $cleanId = if ($id) { $id.Trim() } else { "scene_$i" }
    
    $pov = ""
    if ($povMap.ContainsKey($cleanId)) {
        $pov = $povMap[$cleanId]
    }

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
$json = $scenes | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes.json"), $json, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes-saved.json"), $json, [System.Text.Encoding]::UTF8)

$jsContent = "// scenes-data.js`r`n// Total scenes: $($scenes.Count)`r`nconst DEFAULT_SCENES = $json;`r`n"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes-data.js"), $jsContent, [System.Text.Encoding]::UTF8)
Write-Host "Updated scenes.json, scenes-saved.json, and scenes-data.js!"
