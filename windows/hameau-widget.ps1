# Hameau · le chrono sur le bureau Windows : une petite fenêtre flottante, sans rien à installer (PowerShell et WPF
# sont fournis avec Windows).
#
# Elle demande à Hameau où en est le chrono (le même appel que les raccourcis de l'iPhone : action « etat », avec ton
# jeton) toutes les 15 secondes, et fait défiler le temps à la seconde entre deux demandes. On la déplace en la
# glissant ; clic droit : ouvrir Hameau, premier plan, lancement avec Windows, jeton.
#
# Permanente : au premier lancement, elle s'inscrit au démarrage de Windows (on peut le retirer d'un clic droit), et
# elle se pose sur le bureau, sous les fenêtres, comme un gadget : « Afficher le bureau » (Win+D) la laisse en place.
#
# Deux boutons, pour ne jamais confondre la pause et l'arrêt :
#   - le ROND fait ce qu'il montre, en un clic : ▶ lancer ou reprendre, ⏸ mettre en pause. Une pause garde la session
#     ouverte et fige le temps ; elle se défait d'un clic, elle n'a donc pas besoin de confirmation.
#   - le CARRÉ ■ termine et enregistre la session, en DEUX clics : le premier l'arme (il rougit 4 s), le second arrête.
#     Une session close ne se rouvre pas : un clic de trop ne doit pas couper une heure de travail en deux.
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
  if ($null -eq $etat) { return @{ Temps = '—'; Statut = 'Connexion…'; Part = -1; Action = 'aucune'; Fin = $false } }
  $objectif = if ($etat.objectif -is [int] -or $etat.objectif -is [long] -or $etat.objectif -is [double] -or $etat.objectif -is [decimal]) { [int]$etat.objectif } else { 0 }
  if ($etat.erreur -eq 'jeton') { return @{ Temps = '—'; Statut = 'Jeton à mettre (clic droit)'; Part = -1; Action = 'jeton'; Fin = $false } }
  if ($etat.erreur) { return @{ Temps = '—'; Statut = 'Hors ligne'; Part = -1; Action = 'aucune'; Fin = $false } }
  if ($etat.etat -eq 'en_cours') {
    # [math]::Min(1.0, …) et non (1, …) : avec un entier en premier, PowerShell choisit Min(int, int) et 0,2 devient 0.
    $depart = ConvertTo-Depart $etat.depuis
    $secondes = if ($null -ne $depart) { [int][math]::Floor(($maintenant - $depart).TotalSeconds) } else { [int]$etat.secondes }
    $statut = 'En cours'
    if ($objectif -gt 0) { $statut = "En cours · objectif $objectif min" }
    $part = if ($objectif -gt 0) { [math]::Min(1.0, $secondes / ($objectif * 60)) } else { -1 }
    return @{ Temps = (Format-Duree $secondes); Statut = $statut; Part = $part; Action = 'pause'; Fin = $true }
  }
  if ($etat.etat -eq 'en_pause') {
    $secondes = if ($null -ne $etat.secondes) { [int]$etat.secondes } else { [int]$etat.minutes * 60 }
    $part = if ($objectif -gt 0) { [math]::Min(1.0, $secondes / ($objectif * 60)) } else { -1 }
    return @{ Temps = (Format-Duree $secondes); Statut = 'En pause · temps figé'; Part = $part; Action = 'reprendre'; Fin = $true }
  }
  return @{ Temps = '—'; Statut = 'Pas de chrono'; Part = -1; Action = 'demarrer'; Fin = $false }
}

# Terminer en deux clics : le premier arme le bouton pour 4 secondes, le second, dans ce délai, arrête la session.
# Passé le délai, le clic suivant ne fait que réarmer.
function Step-Terminer($armeJusqua, [datetime]$maintenant) {
  if ($null -ne $armeJusqua -and $maintenant -lt $armeJusqua) { return @{ Arreter = $true; ArmeJusqua = $null } }
  return @{ Arreter = $false; ArmeJusqua = $maintenant.AddSeconds(4) }
}

# Ce que dit la fenêtre juste après « Terminer » : la durée enregistrée, pauses déduites.
function Get-Note($reponse) {
  if ($reponse.etat -eq 'terminee' -and $null -ne $reponse.minutes) { return "Enregistrée · $([int]$reponse.minutes) min" }
  if ($reponse.etat -eq 'aucune') { return 'Aucune session à terminer' }
  return $null
}

# La réponse de Hameau (code HTTP et texte) devenue un état, ou { erreur }.
function ConvertFrom-Reponse([int]$code, [string]$texte) {
  if ($code -ge 400) {
    if ($texte -match 'jeton') { return [pscustomobject]@{ erreur = 'jeton' } }
    return [pscustomobject]@{ erreur = 'serveur' }
  }
  try { return ($texte | ConvertFrom-Json) } catch { return [pscustomobject]@{ erreur = 'serveur' } }
}

# Lancement avec Windows : tant qu'on n'a rien choisi, oui (le widget est fait pour rester là) ; un « non » donné dans
# le menu est retenu et respecté.
function Test-DemarrageVoulu($valeur) {
  if ($null -eq $valeur) { return $true }
  return [bool]$valeur
}

# Posé sur le bureau (sous les fenêtres) ou toujours au premier plan. Une valeur inconnue ou absente : le bureau.
function Get-Mode($valeur) {
  if ($valeur -eq 'dessus') { return 'dessus' }
  return 'bureau'
}

# La ligne de commande du raccourci de démarrage : sans console, en STA (WPF l'exige), le chemin entre guillemets
# (un dossier « Mes documents » a des espaces).
function Get-ArgumentsDemarrage([string]$chemin) {
  return "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File `"$chemin`""
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
# « premierPlan », des toutes premières versions, n'est plus lu : il valait « oui » par défaut, et le widget se pose
# désormais sur le bureau.
$reglages = [pscustomobject]@{ jeton = ''; gauche = $null; haut = $null; mode = $null; demarrageAuto = $null }
if (Test-Path $fichierReglages) {
  try {
    $lu = Get-Content -Raw -Encoding UTF8 $fichierReglages | ConvertFrom-Json
    foreach ($p in $lu.PSObject.Properties) { $reglages | Add-Member -Force -NotePropertyName $p.Name -NotePropertyValue $p.Value }
  } catch { }
}
function Save-Reglages { $reglages | ConvertTo-Json | Set-Content -Encoding UTF8 $fichierReglages }

function Request-Jeton {
  $j = [Microsoft.VisualBasic.Interaction]::InputBox("Colle ton jeton des raccourcis.`n`nHameau → Réglages → Raccourcis et widgets → « Créer un nouveau jeton » (ou celui que tu utilises déjà dans tes raccourcis).", 'Hameau · widget', [string]$reglages.jeton)
  if ($j.Trim()) { $reglages.jeton = $j.Trim(); Save-Reglages }
}
if (-not $reglages.jeton) { Request-Jeton }

# Les couleurs de Hameau, claires ou sombres comme les applications de Windows.
$clair = $false
try { $clair = (Get-ItemPropertyValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'AppsUseLightTheme') -eq 1 } catch { }
$c = if ($clair) { @{ Fond = '#F2F5EFE3'; Bord = '#22000000'; Encre = '#2B2620'; Doux = '#7A7064'; Accent = '#B0561C'; Piste = '#1A000000'; Vert = '#2E7D4F'; SurCouleur = '#FFFFFF'; Rouge = '#C8382C' } }
     else { @{ Fond = '#F213201C'; Bord = '#33FFFFFF'; Encre = '#EFE9DC'; Doux = '#9FB0A6'; Accent = '#F0B44A'; Piste = '#22FFFFFF'; Vert = '#6FD39A'; SurCouleur = '#13201C'; Rouge = '#FF6B5E' } }

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Hameau" WindowStyle="None" AllowsTransparency="True" Background="Transparent" ResizeMode="NoResize"
        SizeToContent="WidthAndHeight" ShowInTaskbar="False" Topmost="False" ShowActivated="False">
  <Window.Resources>
    <ControlTemplate x:Key="Rond" TargetType="Button">
      <Border x:Name="Fond" CornerRadius="21" Background="{TemplateBinding Background}">
        <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
      </Border>
      <ControlTemplate.Triggers>
        <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Fond" Property="Opacity" Value="0.85"/></Trigger>
        <Trigger Property="IsEnabled" Value="False"><Setter TargetName="Fond" Property="Opacity" Value="0.45"/></Trigger>
      </ControlTemplate.Triggers>
    </ControlTemplate>
    <ControlTemplate x:Key="Carre" TargetType="Button">
      <Border x:Name="Fond" CornerRadius="9" Background="{TemplateBinding Background}">
        <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
      </Border>
      <ControlTemplate.Triggers>
        <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Fond" Property="Opacity" Value="0.8"/></Trigger>
        <Trigger Property="IsEnabled" Value="False"><Setter TargetName="Fond" Property="Opacity" Value="0.45"/></Trigger>
      </ControlTemplate.Triggers>
    </ControlTemplate>
  </Window.Resources>
  <Border CornerRadius="14" Padding="14,12,12,12" Background="$($c.Fond)" BorderBrush="$($c.Bord)" BorderThickness="1">
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="Auto"/>
        <ColumnDefinition Width="Auto"/>
        <ColumnDefinition Width="Auto"/>
      </Grid.ColumnDefinitions>
      <Button x:Name="Geste" Template="{StaticResource Rond}" Width="42" Height="42" VerticalAlignment="Center" Cursor="Hand" Focusable="False" Background="$($c.Vert)">
        <Path x:Name="IconeGeste" Fill="$($c.SurCouleur)" Data="M 3,0 L 3,16 L 16,8 Z"/>
      </Button>
      <!-- Largeur fixe : la fenêtre ne change pas de taille quand la ligne d'état change. -->
      <StackPanel Grid.Column="1" Width="160" Margin="12,0,10,0" VerticalAlignment="Center">
        <TextBlock Text="HAMEAU" FontSize="11" FontWeight="SemiBold" Foreground="$($c.Accent)"/>
        <TextBlock x:Name="Temps" Text="—" FontSize="30" FontWeight="Bold" Foreground="$($c.Encre)" FontFamily="Segoe UI Variable Display, Segoe UI"/>
        <TextBlock x:Name="Statut" Text="…" FontSize="12" Foreground="$($c.Doux)" TextTrimming="CharacterEllipsis"/>
        <Grid x:Name="Piste" Height="3" Margin="0,8,0,0" Background="$($c.Piste)">
          <Border x:Name="Jauge" HorizontalAlignment="Left" Width="0" Background="$($c.Accent)" CornerRadius="2"/>
        </Grid>
      </StackPanel>
      <Button x:Name="Fin" Grid.Column="2" Template="{StaticResource Carre}" Width="32" Height="32" VerticalAlignment="Center" Cursor="Hand" Focusable="False" Background="$($c.Piste)" Visibility="Hidden">
        <Rectangle x:Name="IconeFin" Width="11" Height="11" RadiusX="2" RadiusY="2" Fill="$($c.Doux)"/>
      </Button>
    </Grid>
  </Border>
</Window>
"@
$fenetre = [Windows.Markup.XamlReader]::Load([System.Xml.XmlNodeReader]::new($xaml))
$temps = $fenetre.FindName('Temps')
$statut = $fenetre.FindName('Statut')
$piste = $fenetre.FindName('Piste')
$jauge = $fenetre.FindName('Jauge')
$geste = $fenetre.FindName('Geste')
$iconeGeste = $fenetre.FindName('IconeGeste')
$fin = $fenetre.FindName('Fin')
$iconeFin = $fenetre.FindName('IconeFin')
$pinceaux = [System.Windows.Media.BrushConverter]::new()
$pVert = $pinceaux.ConvertFromString($c.Vert); $pAccent = $pinceaux.ConvertFromString($c.Accent); $pPiste = $pinceaux.ConvertFromString($c.Piste)
$pRouge = $pinceaux.ConvertFromString($c.Rouge); $pDoux = $pinceaux.ConvertFromString($c.Doux); $pBlanc = $pinceaux.ConvertFromString('#FFFFFF')
$FORME_LECTURE = [System.Windows.Media.Geometry]::Parse('M 3,0 L 3,16 L 16,8 Z')
$FORME_PAUSE = [System.Windows.Media.Geometry]::Parse('M 2,1 H 6 V 15 H 2 Z M 10,1 H 14 V 15 H 10 Z')

# Sur le bureau : la fenêtre appartient au bureau de Windows (Progman). Elle reste sous les autres fenêtres, et
# « Afficher le bureau » (Win+D), qui cache les fenêtres ordinaires, la laisse visible. Si Windows refuse, elle reste
# une fenêtre normale, pas au premier plan : jamais de panne pour ça.
try {
  Add-Type -Namespace Hameau -Name Bureau -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string classe, string titre);'
  $progman = [Hameau.Bureau]::FindWindow('Progman', $null)
  if ($progman -ne [IntPtr]::Zero) { ([System.Windows.Interop.WindowInteropHelper]::new($fenetre)).Owner = $progman }
} catch { }
function Set-Mode([string]$mode) {
  $reglages | Add-Member -Force -NotePropertyName mode -NotePropertyValue $mode
  $fenetre.Topmost = ($mode -eq 'dessus')
}
Set-Mode (Get-Mode $reglages.mode)

# Le raccourci de démarrage, remis à jour à chaque lancement : il suit le dossier si on l'a déplacé.
$demarrage = Join-Path ([Environment]::GetFolderPath('Startup')) 'Hameau widget.lnk'
function Set-Demarrage([bool]$voulu) {
  $reglages | Add-Member -Force -NotePropertyName demarrageAuto -NotePropertyValue $voulu
  Save-Reglages
  if (-not $voulu) { if (Test-Path $demarrage) { Remove-Item $demarrage }; return }
  try {
    $ws = New-Object -ComObject WScript.Shell
    $lien = $ws.CreateShortcut($demarrage)
    $lien.TargetPath = 'powershell.exe'
    $lien.Arguments = Get-ArgumentsDemarrage $cheminScript
    $lien.WorkingDirectory = Split-Path $cheminScript
    $lien.WindowStyle = 7
    $lien.Save()
  } catch { }
}
if ($cheminScript) { Set-Demarrage (Test-DemarrageVoulu $reglages.demarrageAuto) }

# Là où on l'a laissée, si c'est encore sur un écran ; sinon en bas à droite.
$ecran = [System.Windows.SystemParameters]::WorkArea
$virtuel = [System.Windows.Rect]::new([System.Windows.SystemParameters]::VirtualScreenLeft, [System.Windows.SystemParameters]::VirtualScreenTop, [System.Windows.SystemParameters]::VirtualScreenWidth, [System.Windows.SystemParameters]::VirtualScreenHeight)
if ($null -ne $reglages.gauche -and $virtuel.Contains([double]$reglages.gauche + 20, [double]$reglages.haut + 20)) {
  $fenetre.Left = [double]$reglages.gauche; $fenetre.Top = [double]$reglages.haut
} else {
  $fenetre.WindowStartupLocation = 'Manual'; $fenetre.Left = $ecran.Right - 300; $fenetre.Top = $ecran.Bottom - 130
}

# ── Parler à Hameau sans figer la fenêtre : la demande part, on lit la réponse quand elle est arrivée ──

$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [timespan]::FromSeconds(10)
$script:demande = $null
$script:etat = $null
$script:derniere = [datetime]::MinValue
# Occupé : une action (lancer, pause, reprendre, terminer) est partie et l'état qui la suit n'est pas encore revenu.
# Les boutons attendent : un double clic impatient n'envoie pas deux fois la même chose.
$script:occupe = $false
$script:armeJusqua = $null
$script:note = $null
function Send-Hameau([string]$action) {
  if (-not $reglages.jeton) { $script:etat = [pscustomobject]@{ erreur = 'jeton' }; return }
  $corps = @{ p_jeton = [string]$reglages.jeton; p_action = $action } | ConvertTo-Json -Compress
  $requete = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $URL_RPC)
  $requete.Headers.Add('apikey', $CLE_PUBLIQUE)
  $requete.Content = [System.Net.Http.StringContent]::new($corps, [System.Text.Encoding]::UTF8, 'application/json')
  $script:demande = $client.SendAsync($requete)
  $script:action = $action
  $script:derniere = Get-Date
  if ($action -ne 'etat') { $script:occupe = $true }
}
function Receive-Hameau {
  if ($null -eq $script:demande -or -not $script:demande.IsCompleted) { return }
  $t = $script:demande
  $script:demande = $null
  if ($t.IsFaulted -or $t.IsCanceled) { $script:etat = [pscustomobject]@{ erreur = 'reseau' }; $script:occupe = $false; return }
  $r = ConvertFrom-Reponse ([int]$t.Result.StatusCode) ($t.Result.Content.ReadAsStringAsync().Result)
  if ($script:action -eq 'arreter' -and -not $r.erreur) { $script:note = @{ Texte = (Get-Note $r); Jusqua = (Get-Date).AddSeconds(6) } }
  # Après une action, on relit l'état complet (avec l'heure de départ) : c'est lui qui débloque les boutons.
  if ($script:action -ne 'etat' -and -not $r.erreur) { Send-Hameau 'etat'; return }
  $script:etat = $r
  $script:occupe = $false
}

function Update-Fenetre {
  $maintenant = Get-Date
  $a = Get-Affichage $script:etat ([datetimeoffset]::UtcNow)
  $arme = $null -ne $script:armeJusqua -and $maintenant -lt $script:armeJusqua -and $a.Fin
  if (-not $arme) { $script:armeJusqua = $null }
  $temps.Text = $a.Temps
  $statut.Text = if ($arme) { 'Encore un clic : terminer' } elseif ($script:note -and $script:note.Texte -and $maintenant -lt $script:note.Jusqua) { $script:note.Texte } else { $a.Statut }
  if ($a.Part -ge 0) { $piste.Visibility = 'Visible'; $jauge.Width = [math]::Max(2.0, $piste.ActualWidth * $a.Part) } else { $piste.Visibility = 'Collapsed' }
  # Le rond montre ce qu'il fera : ▶ vert pour lancer ou reprendre, ⏸ ambre pour la pause.
  $iconeGeste.Data = if ($a.Action -eq 'pause') { $FORME_PAUSE } else { $FORME_LECTURE }
  $geste.Background = if ($a.Action -eq 'pause') { $pAccent } else { $pVert }
  $geste.IsEnabled = ($a.Action -in 'demarrer', 'pause', 'reprendre', 'jeton') -and -not $script:occupe
  $geste.ToolTip = switch ($a.Action) {
    'pause' { 'Pause : le temps s''arrête, la session reste ouverte' }
    'reprendre' { 'Reprendre la session' }
    'demarrer' { 'Lancer le chrono' }
    'jeton' { 'Mettre ton jeton' }
    default { 'Hameau ne répond pas' }
  }
  # Caché plutôt qu'enlevé : la fenêtre garde sa taille, rien ne bouge sous la souris.
  $fin.Visibility = if ($a.Fin) { 'Visible' } else { 'Hidden' }
  $fin.IsEnabled = -not $script:occupe
  $fin.Background = if ($arme) { $pRouge } else { $pPiste }
  $iconeFin.Fill = if ($arme) { $pBlanc } else { $pDoux }
  $fin.ToolTip = if ($arme) { 'Clique encore pour terminer et enregistrer' } else { 'Terminer et enregistrer la session (deux clics)' }
  $script:affichage = $a
}

$geste.Add_Click({
  if ($script:occupe) { return }
  if ($script:affichage.Action -in 'demarrer', 'pause', 'reprendre') { $script:armeJusqua = $null; Send-Hameau $script:affichage.Action }
  elseif ($script:affichage.Action -eq 'jeton') { Request-Jeton; Send-Hameau 'etat' }
  Update-Fenetre
})
$fin.Add_Click({
  if ($script:occupe -or -not $script:affichage.Fin) { return }
  $pas = Step-Terminer $script:armeJusqua (Get-Date)
  $script:armeJusqua = $pas.ArmeJusqua
  if ($pas.Arreter) { Send-Hameau 'arreter' }
  Update-Fenetre
})

# ── Le menu (clic droit) ──

$menu = [System.Windows.Controls.ContextMenu]::new()
function Add-Choix([string]$texte, [scriptblock]$faire) {
  $i = [System.Windows.Controls.MenuItem]::new(); $i.Header = $texte; $i.Add_Click($faire); [void]$menu.Items.Add($i); return $i
}
$choixChrono = Add-Choix 'Démarrer le chrono' { if ($script:affichage.Action -in 'demarrer', 'pause', 'reprendre') { Send-Hameau $script:affichage.Action } }
# Choisir « Terminer » dans le menu est déjà un geste voulu : un seul clic suffit ici.
$choixFin = Add-Choix 'Terminer la session' { if ($script:affichage.Fin -and -not $script:occupe) { Send-Hameau 'arreter' } }
Add-Choix 'Ouvrir Hameau' { Start-Process $ADRESSE_HAMEAU } | Out-Null
[void]$menu.Items.Add([System.Windows.Controls.Separator]::new())
$choixPlan = Add-Choix 'Toujours au premier plan' { Set-Mode $(if ($fenetre.Topmost) { 'bureau' } else { 'dessus' }); Save-Reglages }
$choixWindows = Add-Choix 'Lancer avec Windows' { Set-Demarrage (-not (Test-Path $demarrage)) }
Add-Choix 'Changer le jeton' { Request-Jeton; Send-Hameau 'etat' } | Out-Null
[void]$menu.Items.Add([System.Windows.Controls.Separator]::new())
Add-Choix 'Fermer le widget' { $fenetre.Close() } | Out-Null
$menu.Add_Opened({
  $choixChrono.Header = switch ($script:affichage.Action) { 'pause' { 'Mettre en pause' } 'reprendre' { 'Reprendre' } 'demarrer' { 'Démarrer le chrono' } default { 'Chrono indisponible' } }
  $choixChrono.IsEnabled = ($script:affichage.Action -in 'demarrer', 'pause', 'reprendre') -and -not $script:occupe
  $choixFin.IsEnabled = $script:affichage.Fin -and -not $script:occupe
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
