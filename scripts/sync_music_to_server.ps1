# Sync Music from PC (C:\Users\HP\Music) directly to Termux Home Server over Wi-Fi
param(
    [string]$ServerIP = "192.168.31.178",
    [int]$Port = 7777,
    [string]$MusicSource = "C:\Users\HP\Music",
    [int]$Limit = 0 # 0 = upload all songs
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    📻 KHURE / PEPPY RADIO : Wi-Fi Music Sync to Phone   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Server: http://${ServerIP}:${Port}"
Write-Host "Source Folder: $MusicSource"

if (-not (Test-Path $MusicSource)) {
    Write-Host "❌ Music source directory not found: $MusicSource" -ForegroundColor Red
    exit 1
}

$files = Get-ChildItem -Path $MusicSource -Filter "*.mp3" -Recurse
if ($Limit -gt 0) {
    $files = $files | Select-Object -First $Limit
}

Write-Host "Found $($files.Count) MP3 files ready to sync." -ForegroundColor Green
Write-Host "Uploading directly to KHURE Home Hub File Drop & Radio rotation..." -ForegroundColor Yellow

$uploaded = 0
$failed = 0

foreach ($file in $files) {
    $safeName = $file.Name
    $url = "http://${ServerIP}:${Port}/api/upload?filename=$([uri]::EscapeDataString($safeName))"
    
    try {
        Write-Host "Uploading [$($uploaded + 1)/$($files.Count)]: $safeName ... " -NoNewline
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.Method = "POST"
        $req.Timeout = 30000
        $req.ContentLength = $bytes.Length
        $stream = $req.GetRequestStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
        $resp = $req.GetResponse()
        $resp.Close()
        Write-Host "OK" -ForegroundColor Green
        $uploaded++
    } catch {
        Write-Host "FAILED ($($_.Exception.Message))" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Sync Complete! Uploaded: $uploaded, Failed: $failed" -ForegroundColor Green
Write-Host "Songs are automatically in rotation on Peppy Radio!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
