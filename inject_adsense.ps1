$adsenseScript = '  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9129456058305887" crossorigin="anonymous"></script>'

# Pages to skip (authenticated/app pages)
$skipPages = @("login.html", "register.html", "dashboard.html")

$htmlFiles = Get-ChildItem -Path "c:\DEVELOPER\ANTIGRAVITY\QR_GEN_PLUS\public" -Filter "*.html" -Recurse

$updated = 0
$skipped = 0

foreach ($file in $htmlFiles) {
    # Skip auth pages
    if ($skipPages -contains $file.Name) {
        Write-Host "SKIP (auth page): $($file.Name)" -ForegroundColor Yellow
        $skipped++
        continue
    }

    $content = Get-Content $file.FullName -Raw -Encoding UTF8

    # Skip if already has AdSense
    if ($content -match "ca-pub-9129456058305887") {
        Write-Host "SKIP (already has AdSense): $($file.Name)" -ForegroundColor Cyan
        $skipped++
        continue
    }

    # Add AdSense script before </head>
    $content = $content -replace "</head>", "$adsenseScript`n</head>"
    Set-Content $file.FullName $content -Encoding UTF8 -NoNewline
    Write-Host "UPDATED: $($file.Name)" -ForegroundColor Green
    $updated++
}

Write-Host ""
Write-Host "Done! Updated: $updated | Skipped: $skipped" -ForegroundColor White
