# gps-server.ps1
Add-Type -AssemblyName System.Device

# Määritellään portti
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://*:$port/")
$listener.Start()

Write-Host "GPS HTTP Server käynnissä portissa $port. Keskeytä Ctrl+C"

# Luodaan GPS-watcher
$watcher = New-Object System.Device.Location.GeoCoordinateWatcher
$watcher.MovementThreshold = 1
$watcher.Start()

# Funktio NaN/null -arvojen turvalliseen JSON:iin
function SafeValue($v) {
    if ($v -eq $null -or [double]::IsNaN($v)) { return $null } else { return $v }
}

# Ctrl+C käsittely
$cancelEvent = {
    Write-Host "`nPysäytetään GPS-serveri..."
    $listener.Stop()
    $listener.Close()
    $watcher.Stop()
    exit
}
Register-EngineEvent PowerShell.Exiting -Action $cancelEvent

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $coord = $watcher.Position.Location

        if (-not $coord.IsUnknown) {
            $source = if ($coord.HorizontalAccuracy -and $coord.HorizontalAccuracy -lt 100) {
                "Todellinen GPS"
            } else {
                "IP/verkko fallback"
            }

            $data = [PSCustomObject]@{
                Latitude           = SafeValue($coord.Latitude)
                Longitude          = SafeValue($coord.Longitude)
                Altitude           = SafeValue($coord.Altitude)
                HorizontalAccuracy = SafeValue($coord.HorizontalAccuracy)
                VerticalAccuracy   = SafeValue($coord.VerticalAccuracy)
                Speed              = SafeValue($coord.Speed)
                Course             = SafeValue($coord.Course)
                Timestamp          = $watcher.Position.Timestamp
                Source             = $source
            }
        } else {
            $data = [PSCustomObject]@{
                error = "GPS not available yet"
            }
        }

        $json = $data | ConvertTo-Json

        # Vastauksen kirjoitus
        $response.ContentType = "application/json"
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
    $watcher.Stop()
}
