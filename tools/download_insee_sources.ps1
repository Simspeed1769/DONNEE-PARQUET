param(
    [string]$Root = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = "Stop"
$rawRoot = Join-Path $Root "raw"

$sources = @(
    @{ Year = 2015; File = "RP2015_INDREG_dbase.zip"; Url = "https://www.insee.fr/fr/statistiques/fichier/3565914/RP2015_INDREG_dbase.zip"; Minimum = 590000000 },
    @{ Year = 2016; File = "RP2016_INDREG_csv.zip"; Url = "https://www.insee.fr/fr/statistiques/fichier/4171523/RP2016_INDREG_csv.zip"; Minimum = 680000000 },
    @{ Year = 2017; File = "RP2017_INDREG_csv.zip"; Url = "https://www.insee.fr/fr/statistiques/fichier/4507685/RP2017_INDREG_csv.zip"; Minimum = 695000000 },
    @{ Year = 2018; File = "RP2018_indreg_csv.zip"; Url = "https://www.insee.fr/fr/statistiques/fichier/5395740/RP2018_indreg_csv.zip"; Minimum = 700000000 },
    @{ Year = 2019; File = "RP2019_INDREG_csv.zip"; Url = "https://www.insee.fr/fr/statistiques/fichier/6456040/RP2019_INDREG_csv.zip"; Minimum = 700000000 },
    @{ Year = 2020; File = "RP2020_INDREG_csv.zip"; Url = "https://www.insee.fr/fr/statistiques/fichier/7637653/RP2020_INDREG_csv.zip"; Minimum = 720000000 },
    @{ Year = 2022; File = "RP2022_indreg.parquet"; Url = "https://www.insee.fr/fr/statistiques/fichier/8590183/RP2022_indreg.parquet"; Minimum = 600000000 }
)

Write-Output "$(Get-Date -Format o) | Démarrage"
foreach ($source in $sources) {
    $yearDirectory = Join-Path $rawRoot ([string]$source.Year)
    New-Item -ItemType Directory -Path $yearDirectory -Force | Out-Null
    $target = Join-Path $yearDirectory $source.File
    $temporary = "$target.download"
    if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -ge $source.Minimum) {
        Write-Output "$(Get-Date -Format o) | $($source.Year) | déjà présent"
        continue
    }
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Force
    }
    Write-Output "$(Get-Date -Format o) | $($source.Year) | téléchargement"
    & curl.exe --fail --location --retry 4 --retry-delay 5 --silent --show-error --output $temporary $source.Url
    if ($LASTEXITCODE -ne 0) {
        throw "Échec du téléchargement $($source.Year), code curl $LASTEXITCODE"
    }
    $size = (Get-Item -LiteralPath $temporary).Length
    if ($size -lt $source.Minimum) {
        throw "Téléchargement $($source.Year) incomplet : $size octets"
    }
    Move-Item -LiteralPath $temporary -Destination $target -Force
    Write-Output "$(Get-Date -Format o) | $($source.Year) | terminé | $size octets"
}
Write-Output "$(Get-Date -Format o) | Tous les téléchargements sont terminés"
