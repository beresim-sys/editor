Add-Type -AssemblyName System.IO.Compression.FileSystem
$file = Resolve-Path "סצנות לספר.xlsx"
$zip = [System.IO.Compression.ZipFile]::OpenRead($file)

# Parse sharedStrings.xml
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

# Parse sheet1.xml
$sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")
$sheetReader = New-Object System.IO.StreamReader($sheetEntry.Open(), [System.Text.Encoding]::UTF8)
$sheetXml = [xml]$sheetReader.ReadToEnd()
$sheetReader.Dispose()
$zip.Dispose()

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
    $pov = $rowCells['E']
    $summary = $rowCells['F']
    $revealed = $rowCells['G']
    $source = $rowCells['H']

    # Stop if row is empty
    if (-not $id -and -not $title -and -not $summary) {
        continue
    }

    $sceneObj = [ordered]@{
        id = if ($id) { $id.Trim() } else { "SC-$i" }
        title = if ($title) { $title.Trim() } else { "סצנה $i" }
        time = if ($time) { $time.Trim() } else { "" }
        location = if ($location) { $location.Trim() } else { "" }
        pov = if ($pov) { $pov.Trim() } else { "" }
        summary = if ($summary) { $summary.Trim() } else { "" }
        revealedInfo = if ($revealed) { $revealed.Trim() } else { "" }
        source = if ($source) { $source.Trim() } else { "" }
    }
    $scenes.Add($sceneObj)
}

"Parsed scenes count: " + $scenes.Count
$json = $scenes | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes.json"), $json, [System.Text.Encoding]::UTF8)

# Now write scenes-data.js
$jsContent = "/**`r`n * scenes-data.js`r`n * נתוני סצנות מלאים שחולצו מקובץ 'סצנות לספר.xlsx'`r`n * סה`"כ סצנות: " + $scenes.Count + "`r`n */`r`n`r`nconst DEFAULT_SCENES = " + $json + ";`r`n"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "scenes-data.js"), $jsContent, [System.Text.Encoding]::UTF8)
"scenes-data.js written successfully!"
