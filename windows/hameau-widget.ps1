# Hameau · le chrono sur le bureau Windows : une petite fenêtre flottante, sans rien à installer (PowerShell et WPF
# sont fournis avec Windows).
#
# Elle demande à Hameau où en est le chrono (le même appel que les raccourcis de l'iPhone : action « etat », avec ton
# jeton) toutes les 15 secondes, et fait défiler le temps à la seconde entre deux demandes. On la déplace en la
# glissant ; clic droit : démarrer, pause, reprendre, ouvrir Hameau, premier plan, lancement avec Windows, jeton.
#
# Le jeton est demandé au premier lancement et gardé dans %APPDATA%\Hameau\widget.json, jamais dans ce fichier.
# L'adresse et la clé publiable ci-dessous sont celles que tout navigateur reçoit en ouvrant Hameau.
#
# -Essai : charge seulement les fonctions, sans fenêtre (les tests s'en servent sur Linux, où WPF n'existe pas).
param([switch]$Essai)

$URL_RPC = 'https://nisjysdlyryyrsgwmcaa.supabase.co/rest/v1/rpc/hameau_raccourci'
$CLE_PUBLIQUE = 'sb_publishable_06uV9QEJP7WmyV31tKe9pQ_yvGjTp-c'
$ADRESSE_HAMEAU = 'https://maeljoly68-art.github.io/hameau/'
# Le chemin du script, retenu dès le départ : dans un clic de menu, $PSCommandPath peut être vide.
$cheminScript = $PSCommandPath

# ── Ce qu'on affiche (pur : testé) ──

function Format-Duree([int]$secondes) {
  if ($secondes -lt 0) { $secondes = 0 }
  $h = [math]::Floor($secondes / 3600)
  $m = [math]::Floor(($secondes % 3600) / 60)
  $s = $secondes % 60
  if ($h -gt 0) { return ('{0}:{1:00}:{2:00}' -f $h, $m, $s) }
  return ('{0}:{1:00}' -f $m, $s)
}

# L'heure de départ sans les pauses. PowerShell 7 change déjà les dates du JSON en [datetime], PowerShell 5 les
# laisse en texte : les deux sont acceptés.
function ConvertTo-Depart($valeur) {
  if ($null -eq $valeur) { return $null }
  if ($valeur -is [datetime]) { return [datetimeoffset]$valeur.ToUniversalTime() }
  $d = [datetimeoffset]::MinValue
  if ([datetimeoffset]::TryParse([string]$valeur, [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal, [ref]$d)) { return $d }
  return $null
}

# Ce que montre la fenêtre pour un état du chrono, à un instant donné : le temps, la ligne d'état, la part de
# l'objectif (0 à 1, ou -1 sans objectif), et ce que propose le menu.
function Get-Affichage($etat, [datetimeoffset]$maintenant) {
  # Avant la première réponse : on attend, on n'annonce pas une panne.
  if ($null -eq $etat) { return @{ Temps = '—'; Statut = 'Connexion…'; Part = -1; Action = 'aucune' } }
  $objectif = if ($etat.objectif -is [int] -or $etat.objectif -is [long] -or $etat.objectif -is [double] -or $etat.objectif -is [decimal]) { [int]$etat.objectif } else { 0 }
  if ($etat.erreur -eq 'jeton') { return @{ Temps = '—'; Statut = 'Jeton à mettre (clic droit)'; Part = -1; Action = 'jeton' } }
  if ($etat.erreur) { return @{ Temps = '—'; Statut = 'Hors ligne'; Part = -1; Action = 'aucune' } }
  if ($etat.etat -eq 'en_cours') {
    # [math]::Min(1.0, …) et non (1, …) : avec un entier en premier, PowerShell choisit Min(int, int) et 0,2 devient 0.
    $depart = ConvertTo-Depart $etat.depuis
    $secondes = if ($null -ne $depart) { [int][math]::Floor(($maintenant - $depart).TotalSeconds) } else { [int]$etat.secondes }
    $statut = 'En cours'
    if ($objectif -gt 0) { $statut = "En cours · objectif $objectif min" }
    $part = if ($objectif -gt 0) { [math]::Min(1.0, $secondes / ($objectif * 60)) } else { -1 }
    return @{ Temps = (Format-Duree $secondes); Statut = $statut; Part = $part; Action = 'pause' }
  }
  if ($etat.etat -eq 'en_pause') {
    $secondes = if ($null -ne $etat.secondes) { [int]$etat.secondes } else { [int]$etat.minutes * 60 }
    $part = if ($objectif -gt 0) { [math]::Min(1.0, $secondes / ($objectif * 60)) } else { -1 }
    return @{ Temps = (Format-Duree $secondes); Statut = 'En pause'; Part = $part; Action = 'reprendre' }
  }
  return @{ Temps = '—'; Statut = 'Pas de chrono'; Part = -1; Action = 'demarrer' }
}

# La réponse de Hameau (code HTTP et texte) devenue un état, ou { erreur }.
function ConvertFrom-Reponse([int]$code, [string]$texte) {
  if ($code -ge 400) {
    if ($texte -match 'jeton') { return [pscustomobject]@{ erreur = 'jeton' } }
    return [pscustomobject]@{ erreur = 'serveur' }
  }
  try { return ($texte | ConvertFrom-Json) } catch { return [pscustomobject]@{ erreur = 'serveur' } }
}

if ($Essai) { return }

# ── La fenêtre ──

# Une seule fenêtre à la fois : relancer le widget (raccourci de démarrage + double-clic) n'en ouvre pas une deuxième.
$verrou = [System.Threading.Mutex]::new($false, 'Local\HameauWidget')
if (-not $verrou.WaitOne(0)) { exit }

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Net.Http, Microsoft.VisualBasic
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dossier = Join-Path $env:APPDATA 'Hameau'
$fichierReglages = Join-Path $dossier 'widget.json'
New-Item -ItemType Directory -Force -Path $dossier | Out-Null
$reglages = [pscustomobject]@{ jeton = ''; gauche = $null; haut = $null; premierPlan = $true }
if (Test-Path $fichierReglages) {
  try {
    $lu = Get-Content -Raw -Encoding UTF8 $fichierReglages | ConvertFrom-Json
    foreach ($p in $lu.PSObject.Properties) { $reglages | Add-Member -Force -NotePropertyName $p.Name -NotePropertyValue $p.Value }
  } catch { }
}
function Save-Reglages { $reglages | ConvertTo-Json | Set-Content -Encoding UTF8 $fichierReglages }

function Request-Jeton {
  $j = [Microsoft.VisualBasic.Interaction]::InputBox("Colle ton jeton des raccourcis.`n`nHameau → Réglages → Raccourcis iPhone / iPad → « Créer un nouveau jeton » (ou celui que tu utilises déjà dans tes raccourcis).", 'Hameau · widget', [string]$reglages.jeton)
  if ($j.Trim()) { $reglages.jeton = $j.Trim(); Save-Reglages }
}
if (-not $reglages.jeton) { Request-Jeton }

# Les couleurs de Hameau, claires ou sombres comme les applications de Windows.
$clair = $false
try { $clair = (Get-ItemPropertyValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'AppsUseLightTheme') -eq 1 } catch { }
$c = if ($clair) { @{ Fond = '#F2F5EFE3'; Bord = '#22000000'; Encre = '#2B2620'; Doux = '#7A7064'; Accent = '#B0561C'; Piste = '#1A000000' } }
     else { @{ Fond = '#F213201C'; Bord = '#33FFFFFF'; Encre = '#EFE9DC'; Doux = '#9FB0A6'; Accent = '#F0B44A'; Piste = '#22FFFFFF' } }

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Hameau" WindowStyle="None" AllowsTransparency="True" Background="Transparent" ResizeMode="NoResize"
        SizeToContent="WidthAndHeight" ShowInTaskbar="False" Topmost="True">
  <Border CornerRadius="14" Padding="16,12,16,14" Background="$($c.Fond)" BorderBrush="$($c.Bord)" BorderThickness="1">
    <StackPanel MinWidth="176">
      <TextBlock Text="HAMEAU" FontSize="11" FontWeight="SemiBold" Foreground="$($c.Accent)"/>
      <TextBlock x:Name="Temps" Text="—" FontSize="34" FontWeight="Bold" Foreground="$($c.Encre)" FontFamily="Segoe UI Variable Display, Segoe UI"/>
      <TextBlock x:Name="Statut" Text="…" FontSize="12" Foreground="$($c.Doux)"/>
      <Grid x:Name="Piste" Height="3" Margin="0,8,0,0" Background="$($c.Piste)">
        <Border x:Name="Jauge" HorizontalAlignment="Left" Width="0" Background="$($c.Accent)" CornerRadius="2"/>
      </Grid>
    </StackPanel>
  </Border>
</Window>
"@
$fenetre = [Windows.Markup.XamlReader]::Load([System.Xml.XmlNodeReader]::new($xaml))
$temps = $fenetre.FindName('Temps')
$statut = $fenetre.FindName('Statut')
$piste = $fenetre.FindName('Piste')
$jauge = $fenetre.FindName('Jauge')
$fenetre.Topmost = [bool]$reglages.premierPlan

# Là où on l'a laissée, si c'est encore sur un écran ; sinon en bas à droite.
$ecran = [System.Windows.SystemParameters]::WorkArea
$virtuel = [System.Windows.Rect]::new([System.Windows.SystemParameters]::VirtualScreenLeft, [System.Windows.SystemParameters]::VirtualScreenTop, [System.Windows.SystemParameters]::VirtualScreenWidth, [System.Windows.SystemParameters]::VirtualScreenHeight)
if ($null -ne $reglages.gauche -and $virtuel.Contains([double]$reglages.gauche + 20, [double]$reglages.haut + 20)) {
  $fenetre.Left = [double]$reglages.gauche; $fenetre.Top = [double]$reglages.haut
} else {
  $fenetre.WindowStartupLocation = 'Manual'; $fenetre.Left = $ecran.Right - 230; $fenetre.Top = $ecran.Bottom - 140
}

# ── Parler à Hameau sans figer la fenêtre : la demande part, on lit la réponse quand elle est arrivée ──

$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [timespan]::FromSeconds(10)
$script:demande = $null
$script:etat = $null
$script:derniere = [datetime]::MinValue
function Send-Hameau([string]$action) {
  if (-not $reglages.jeton) { $script:etat = [pscustomobject]@{ erreur = 'jeton' }; return }
  $corps = @{ p_jeton = [string]$reglages.jeton; p_action = $action } | ConvertTo-Json -Compress
  $requete = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $URL_RPC)
  $requete.Headers.Add('apikey', $CLE_PUBLIQUE)
  $requete.Content = [System.Net.Http.StringContent]::new($corps, [System.Text.Encoding]::UTF8, 'application/json')
  $script:demande = $client.SendAsync($requete)
  $script:action = $action
  $script:derniere = Get-Date
}
function Receive-Hameau {
  if ($null -eq $script:demande -or -not $script:demande.IsCompleted) { return }
  $t = $script:demande
  $script:demande = $null
  if ($t.IsFaulted -or $t.IsCanceled) { $script:etat = [pscustomobject]@{ erreur = 'reseau' }; return }
  $r = ConvertFrom-Reponse ([int]$t.Result.StatusCode) ($t.Result.Content.ReadAsStringAsync().Result)
  # Après « démarrer », « pause » ou « reprendre », on relit l'état complet (avec l'heure de départ).
  if ($script:action -ne 'etat' -and -not $r.erreur) { Send-Hameau 'etat'; return }
  $script:etat = $r
}

function Update-Fenetre {
  $a = Get-Affichage $script:etat ([datetimeoffset]::UtcNow)
  $temps.Text = $a.Temps
  $statut.Text = $a.Statut
  if ($a.Part -ge 0) { $piste.Visibility = 'Visible'; $jauge.Width = [math]::Max(2.0, $piste.ActualWidth * $a.Part) } else { $piste.Visibility = 'Collapsed' }
  $script:affichage = $a
}

# ── Le menu (clic droit) ──

$menu = [System.Windows.Controls.ContextMenu]::new()
function Add-Choix([string]$texte, [scriptblock]$faire) {
  $i = [System.Windows.Controls.MenuItem]::new(); $i.Header = $texte; $i.Add_Click($faire); [void]$menu.Items.Add($i); return $i
}
$choixChrono = Add-Choix 'Démarrer le chrono' { if ($script:affichage.Action -in 'demarrer', 'pause', 'reprendre') { Send-Hameau $script:affichage.Action } }
Add-Choix 'Ouvrir Hameau' { Start-Process $ADRESSE_HAMEAU } | Out-Null
[void]$menu.Items.Add([System.Windows.Controls.Separator]::new())
$choixPlan = Add-Choix 'Toujours au premier plan' { $fenetre.Topmost = -not $fenetre.Topmost; $reglages.premierPlan = $fenetre.Topmost; Save-Reglages }
$demarrage = Join-Path ([Environment]::GetFolderPath('Startup')) 'Hameau widget.lnk'
$choixWindows = Add-Choix 'Lancer avec Windows' {
  if (Test-Path $demarrage) { Remove-Item $demarrage }
  else {
    $ws = New-Object -ComObject WScript.Shell
    $lien = $ws.CreateShortcut($demarrage)
    $lien.TargetPath = 'powershell.exe'
    $lien.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File `"$cheminScript`""
    $lien.WindowStyle = 7
    $lien.Save()
  }
}
Add-Choix 'Changer le jeton' { Request-Jeton; Send-Hameau 'etat' } | Out-Null
[void]$menu.Items.Add([System.Windows.Controls.Separator]::new())
Add-Choix 'Fermer le widget' { $fenetre.Close() } | Out-Null
$menu.Add_Opened({
  $choixChrono.Header = switch ($script:affichage.Action) { 'pause' { 'Mettre en pause' } 'reprendre' { 'Reprendre' } 'demarrer' { 'Démarrer le chrono' } default { 'Chrono indisponible' } }
  $choixChrono.IsEnabled = $script:affichage.Action -in 'demarrer', 'pause', 'reprendre'
  $choixPlan.IsCheckable = $true; $choixPlan.IsChecked = $fenetre.Topmost
  $choixWindows.IsCheckable = $true; $choixWindows.IsChecked = Test-Path $demarrage
})
$fenetre.ContextMenu = $menu

# Glisser pour déplacer ; double-clic pour ouvrir Hameau.
$fenetre.Add_MouseLeftButtonDown({
  param($s, $e)
  if ($e.ClickCount -ge 2) { Start-Process $ADRESSE_HAMEAU; return }
  $fenetre.DragMove()
  $reglages.gauche = $fenetre.Left; $reglages.haut = $fenetre.Top; Save-Reglages
})

# Une seconde : on avance le temps, on lit la réponse si elle est là, et toutes les 15 s on redemande l'état.
$horloge = [System.Windows.Threading.DispatcherTimer]::new()
$horloge.Interval = [timespan]::FromSeconds(1)
$horloge.Add_Tick({
  Receive-Hameau
  if ($null -eq $script:demande -and ((Get-Date) - $script:derniere).TotalSeconds -ge 15) { Send-Hameau 'etat' }
  Update-Fenetre
})
$fenetre.Add_Closed({ $horloge.Stop(); $client.Dispose(); $verrou.ReleaseMutex() })

Send-Hameau 'etat'
Update-Fenetre
$horloge.Start()
[void]$fenetre.ShowDialog()
