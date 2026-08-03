# ─────────────────────────────────────────────────────────────────────────────
# SONDA Custom (SOLA LETTURA) — apre il driver OPOS "Custom Fiscal Printer" che
# usa gia' SuiteMobile e ne legge lo stato. NON stampa e NON tocca il fiscale.
# Serve a provare che possiamo pilotare la cassa Custom con lo stesso driver.
#
# IMPORTANTE:
#  - va eseguita in PowerShell a 32 bit (il driver OPOS Custom e' a 32 bit);
#  - il server fiscale di SuiteMobile (MIRA_FP_SERVER) deve essere CHIUSO
#    (una sola connessione alla volta verso la cassa).
# ─────────────────────────────────────────────────────────────────────────────
$fpnet = "C:\mirasolutions\SuiteMobile\PDV\fpnet"
$ref = Join-Path $fpnet "Microsoft.PointOfService.dll"
Write-Host ""
Write-Host ("PowerShell a {0} bit  (serve 32)" -f ([IntPtr]::Size * 8)) -ForegroundColor Cyan
if ([IntPtr]::Size -ne 4) {
  Write-Host "Sei a 64 bit. Riesegui con la PowerShell a 32 bit:" -ForegroundColor Yellow
  Write-Host '  C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File ' + $PSCommandPath -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path $ref)) { Write-Host "Non trovo $ref" -ForegroundColor Red; exit 1 }

$code = @"
using System;
using System.IO;
using System.Reflection;
using Microsoft.PointOfService;
public class CustProbe {
  public static void Run() {
    // le dipendenze del driver stanno nella cartella fpnet: risolvile da li'.
    string dir = @"C:\mirasolutions\SuiteMobile\PDV\fpnet\";
    AppDomain.CurrentDomain.AssemblyResolve += delegate(object s, ResolveEventArgs a) {
      string f = dir + new AssemblyName(a.Name).Name + ".dll";
      return File.Exists(f) ? Assembly.LoadFrom(f) : null;
    };
    PosExplorer ex = new PosExplorer();
    Console.WriteLine("== dispositivi visti da POS for .NET ==");
    foreach (DeviceInfo di in ex.GetDevices()) {
      Console.WriteLine("  type=" + di.Type + " so=" + di.ServiceObjectName + " nomi=" + string.Join("|", di.LogicalNames));
    }
    DeviceInfo target = null;
    foreach (DeviceInfo di in ex.GetDevices(DeviceType.FiscalPrinter)) {
      if (target == null) target = di;
      foreach (string ln in di.LogicalNames)
        if (ln.IndexOf("Custom", StringComparison.OrdinalIgnoreCase) >= 0) target = di;
    }
    if (target == null) { Console.WriteLine(">> NESSUN FiscalPrinter registrato in POS for .NET"); return; }
    Console.WriteLine(">> Apro: " + string.Join("|", target.LogicalNames));
    FiscalPrinter fp = (FiscalPrinter)ex.CreateInstance(target);
    fp.Open();
    fp.Claim(4000);
    fp.DeviceEnabled = true;
    Console.WriteLine(">> APERTO. Enabled=" + fp.DeviceEnabled + " State=" + fp.State);
    try { Console.WriteLine(">> PrinterState=" + fp.PrinterState); } catch (Exception e1) { Console.WriteLine("   (PrinterState n/d: " + e1.Message + ")"); }
    try { string h = fp.CheckHealth(HealthCheckLevel.Internal); Console.WriteLine(">> Health=" + h); } catch (Exception e2) { Console.WriteLine("   (CheckHealth: " + e2.Message + ")"); }
    fp.DeviceEnabled = false; fp.Release(); fp.Close();
    Console.WriteLine(">> FATTO OK — il driver Custom risponde.");
  }
}
"@

try {
  Add-Type -TypeDefinition $code -ReferencedAssemblies $ref -ErrorAction Stop
  [CustProbe]::Run()
} catch {
  Write-Host ("ERRORE: " + $_.Exception.Message) -ForegroundColor Red
  $inner = $_.Exception.InnerException
  while ($inner) { Write-Host ("  causa: " + $inner.Message) -ForegroundColor Red; $inner = $inner.InnerException }
}
