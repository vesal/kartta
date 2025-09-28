Add-Type -AssemblyName System.Device

$watcher = New-Object System.Device.Location.GeoCoordinateWatcher
$watcher.MovementThreshold = 1
$watcher.Start()

$timeout = 10
$elapsed = 0
while (($watcher.Position.Location.IsUnknown) -and ($elapsed -lt $timeout)) {
    Start-Sleep -Seconds 1
    $elapsed++
}

if ($watcher.Position.Location.IsUnknown) {
    Write-Host "Sijaintia ei saatu"
    exit
}

Write-Host "Aloitetaan jatkuva GPS-luku. Keskeytä Ctrl+C"

while ($true) {
    $coord = $watcher.Position.Location
    if (-not $coord.IsUnknown) {
        # Arvioidaan datan lähde
        $source = if ($coord.HorizontalAccuracy -and $coord.HorizontalAccuracy -lt 100) {
            "Todellinen GPS"
        } else {
            "IP/verkko fallback"
        }

        Write-Host ("`nLatitude:  {0}" -f $coord.Latitude)
        Write-Host ("Longitude: {0}" -f $coord.Longitude)
        Write-Host ("Altitude:  {0}" -f $coord.Altitude)
        Write-Host ("HorizontalAccuracy (m): {0}" -f $coord.HorizontalAccuracy)
        Write-Host ("VerticalAccuracy (m):   {0}" -f $coord.VerticalAccuracy)
        Write-Host ("Speed (m/s):            {0}" -f $coord.Speed)
        Write-Host ("Course (deg):           {0}" -f $coord.Course)
        Write-Host ("Timestamp: {0}" -f $watcher.Position.Timestamp)
        Write-Host ("Source: {0}" -f $source)
    } else {
        Write-Host "`nSijaintia ei saatu tällä hetkellä"
    }
    Start-Sleep -Seconds 1
}
