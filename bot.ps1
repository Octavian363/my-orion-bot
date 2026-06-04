# ==========================================
# CONFIGURARE ȘI ÎNCĂRCARE MEDIU (bot.env)
# ==========================================
Clear-Host
Write-Host "Mod local detectat: Se incarca variabilele din bot.env..." -ForegroundColor Cyan

$EnvFile = Join-Path $PSScriptRoot "bot.env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | Where-Object { $_ -match '=' -and $_ -notmatch '^#' } | ForEach-Object {
        $Name, $Value = $_ -split '=', 2
        [System.Environment]::SetEnvironmentVariable($Name.Trim(), $Value.Trim(), "Process")
    }
} else {
    Write-Host "[EROARE] Nu s-a gasit fisierul bot.env!" -ForegroundColor Red
    Exit
}

$BotToken = $env:DISCORD_TOKEN
if (-not $BotToken) {
    Write-Host "[EROARE] DISCORD_TOKEN nu este setat in bot.env!" -ForegroundColor Red
    Exit
}

# ==========================================
# INIȚIALIZARE WEBSOCKET CLIENT
# ==========================================
Write-Host "Se initializeaza conexiunea la Discord Gateway..." -ForegroundColor Cyan

$WebSocket = New-Object System.Net.WebSockets.ClientWebSocket
$CancellationToken = New-Object System.Threading.CancellationToken

# Discord Gateway URL (folosim API v10)
$GatewayUri = New-Object System.Uri("wss://gateway.discord.gg/?v=10&encoding=json")

try {
    $ConnectTask = $WebSocket.ConnectAsync($GatewayUri, $CancellationToken)
    $ConnectTask.Wait()
} catch {
    Write-Host "[EROARE] Nu s-a putut conecta la Discord Gateway: $_" -ForegroundColor Red
    Exit
}

Write-Host "OrionAI este online in terminalul PowerShell!" -ForegroundColor Green

# ==========================================
# FUNCȚIE PENTRU TRIMITERE DATE (IDENTIFY / HEARTBEAT)
# ==========================================
function Send-WebSocketMessage ($Payload) {
    $Json = ConvertTo-Json $Payload -Compress -Depth 10
    $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
    $ArraySegment = New-Object ArraySegment[Byte] @($Bytes, 0, $Bytes.Length)
    
    $SendTask = $WebSocket.SendAsync($ArraySegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $CancellationToken)
    $SendTask.Wait()
}

# ==========================================
# STRUCTURĂ DE RECEPȚIE A DATELOR (FĂRĂ FRAGMENTARE)
# ==========================================
function Receive-WebSocketMessage {
    $BufferSize = 4096
    $Buffer = New-Object Byte[] $BufferSize
    $CapturedText = New-Object System.Text.StringBuilder

    do {
        $ArraySegment = New-Object ArraySegment[Byte] @($Buffer, 0, $Buffer.Length)
        $ReceiveTask = $WebSocket.ReceiveAsync($ArraySegment, $CancellationToken)
        $ReceiveTask.Wait()
        $Result = $ReceiveTask.Result

        # Conversie fragment curent în text
        $Chunk = [System.Text.Encoding]::UTF8.GetString($Buffer, 0, $Result.Count)
        [void]$CapturedText.Append($Chunk)

    } while (-not $Result.EndOfMessage) # BUCLA CONTINUĂ PÂNĂ CÂND CONEXIUNEA SPUNE CĂ MESAJUL E COMPLET

    return $CapturedText.ToString()
}

# ==========================================
# INIȚIERE SESIUNE (IDENTIFY PAYLOAD)
# ==========================================
# Nota: Pentru a primi mesaje/interacțiuni, avem nevoie de Intents (3276799 = All Intents)
$IdentifyPayload = @{
    op = 2
    d = @{
        token = $BotToken
        intents = 3276799 
        properties = @{
            os = "windows"
            browser = "powershell"
            device = "powershell"
        }
    }
}
Send-WebSocketMessage $IdentifyPayload

# ==========================================
# BUCLA PRINCIPALĂ DE EVENIMENTE (EVENT LOOP)
# ==========================================
$SequenceNumber = $null
$HeartbeatInterval = 45000 # Default fallback, se va updata din Hello

# Task separat pentru Heartbeat la intervalul cerut de Discord
$LastHeartbeat = [DateTime]::MinValue

while ($WebSocket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    
    # 1. Gestionare Heartbeat (Trimitere semnal de viață la Discord) - REPARAT FĂRĂ -SUB
    if (((Get-Date) - $LastHeartbeat).TotalMilliseconds -gt $HeartbeatInterval) {
        $HeartbeatPayload = @{ op = 1; d = $SequenceNumber }
        Send-WebSocketMessage $HeartbeatPayload
        $LastHeartbeat = Get-Date
    }

    # 2. Citire mesaj primit de la Discord (Folosind funcția stabilizată)
    $RawJson = Receive-WebSocketMessage

    if (-not [string]::IsNullOrEmpty($RawJson)) {
        $Event = ConvertFrom-Json $RawJson -ErrorAction SilentlyContinue
        
        if ($null -eq $Event) {
            continue # Dacă totuși a fost un pachet gol sau corupt, trecem peste
        }

        # Actualizăm numărul de secvență dacă există
        if ($Event.s) { $SequenceNumber = $Event.s }

        # --- OP 10: HELLO (Discord ne spune cât de des vrea Heartbeat) ---
        if ($Event.op -eq 10) {
            $HeartbeatInterval = $Event.d.heartbeat_interval
            Write-Host "[Gateway] S-a stabilit intervalul Heartbeat la $HeartbeatInterval ms." -ForegroundColor Yellow
        }

        # --- OP 0: DISPATCH (Evenimente din servere: mesaje, comenzi slash) ---
        if ($Event.op -eq 0) {
            
            # Eveniment: Când cineva folosește o comandă de tip Slash (ex: /ask)
            if ($Event.t -eq "INTERACTION_CREATE") {
                $InteractionName = $Event.d.data.name
                $InteractionId = $Event.d.id
                $InteractionToken = $Event.d.token

                if ($InteractionName -eq "ask") {
                    # Extrage întrebarea utilizatorului din opțiunile comenzii
                    $UserQuery = $Event.d.data.options[0].value
                    $UserGlobalName = $Event.d.member.user.global_name

                    Write-Host "[Comanda /ask] $UserGlobalName a intrebat: $UserQuery" -ForegroundColor Magenta

                    # Răspunsul static temporar
                    $ReplyText = "Salut $UserGlobalName! Am primit intrebarea ta despre '$UserQuery'. Procesez prin OrionAI..."

                    # Trimitem răspunsul înapoi în Discord (Acknowledge / Răspuns la interacțiune)
                    $InteractionResponse = @{
                        type = 4 # 4 = Respond Channel Message With Source
                        data = @{
                            content = $ReplyText
                        }
                    }

                    # Răspunsul se trimite prin API-ul HTTP al Discord, nu prin WebSocket
                    $ResponseJson = ConvertTo-Json $InteractionResponse -Compress -Depth 10
                    $Headers = @{ "Authorization" = "Bot $BotToken" }
                    
                    try {
                        $Uri = "https://discord.com/api/v10/interactions/$InteractionId/$InteractionToken/callback"
                        $SendReply = Invoke-RestMethod -Uri $Uri -Method Post -Body $ResponseJson -ContentType "application/json" -Headers $Headers
                    } catch {
                        Write-Host "[EROARE RASPUNS] Nu s-a putut trimite raspunsul la comanda: $_" -ForegroundColor Red
                    }
                }
            }
        }
    }

    # Pauză scurtă pentru a nu consuma 100% procesor în buclă infinită
    Start-Sleep -Milliseconds 50
}

Write-Host "Conexiunea WebSocket s-a inchis." -ForegroundColor Red