// ─────────────────────────────────────────────────────────────────────────────
// Telefutura Cassa — pannello di controllo per il PC negozio.
// Mostra lo stato locale (agente, registratore, cassa contanti, CRM) che il cloud
// NON puo' vedere, e da' allo staff pochi pulsanti sicuri: riavvia agente, libera
// registratore (chiude MIRA_FP_SERVER), ricontrolla, segnala problema. Ogni minuto
// invia lo stato al CRM (/api/agent/report) -> il supporto ha una bacheca live.
// Autoportante (net9 self-contained single-file): nessun runtime da installare.
// ─────────────────────────────────────────────────────────────────────────────
using System;
using System.Diagnostics;
using System.Drawing;
using System.Management;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace TelefuturaCassa
{
    internal static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form
    {
        // Config — token uguale all'agente (vive gia' nella chiave Run di ogni PC).
        const string TOKEN = "24f0dc1200e36d5ff8a098a88c75e805d37b07038e0dedbc";
        const string CRM = "https://crm.telefuturasrl.com";
        const string RUNKEY = @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run";

        static readonly HttpClient http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

        string negozio = "";
        string cashIp = "";
        string fiscalUrl = "";

        // stato corrente (per il report)
        bool agentOk, registerFree, cashOk, crmOk;

        // UI
        Label lblStore, dotAgent, txtAgent, dotReg, txtReg, dotCash, txtCash, dotCrm, txtCrm, lblFooter;
        Button btnRestart, btnFree, btnRecheck, btnReport, btnTest;
        System.Windows.Forms.Timer reportTimer;

        static readonly Color BG = Color.FromArgb(13, 17, 23);
        static readonly Color CARD = Color.FromArgb(22, 27, 34);
        static readonly Color TXT = Color.FromArgb(230, 237, 243);
        static readonly Color MUT = Color.FromArgb(139, 148, 158);
        static readonly Color GREEN = Color.FromArgb(63, 185, 80);
        static readonly Color RED = Color.FromArgb(248, 81, 73);
        static readonly Color AMBER = Color.FromArgb(210, 153, 34);

        public MainForm()
        {
            LoadConfig();
            BuildUi();
            RefreshStatus();

            reportTimer = new System.Windows.Forms.Timer { Interval = 60000 }; // 60s
            reportTimer.Tick += async (s, e) => { RefreshStatus(); await SendReport("status", null); };
            reportTimer.Start();
            // primo invio subito
            _ = SendReport("status", null);
        }

        void LoadConfig()
        {
            try
            {
                var o = (Registry.GetValue(RUNKEY, "TelefuturaPosAgent", "") as string) ?? "";
                negozio = Match(o, "-Negozio\\s+\"([^\"]+)\"");
                cashIp = Match(o, "-CashIp\\s+\"([^\"]*)\"");
                fiscalUrl = Match(o, "-FiscalUrl\\s+\"([^\"]*)\"");
            }
            catch { }
            if (string.IsNullOrEmpty(negozio)) negozio = Environment.MachineName;
        }

        static string Match(string s, string pat)
        {
            var m = Regex.Match(s ?? "", pat);
            return m.Success ? m.Groups[1].Value : "";
        }

        // ── UI ──────────────────────────────────────────────────────────────────
        void BuildUi()
        {
            Text = "Telefutura Cassa";
            BackColor = BG;
            ForeColor = TXT;
            Font = new Font("Segoe UI", 10.5f);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(430, 478);

            var title = new Label { Text = "TELEFUTURA — Stato Cassa", ForeColor = TXT, Font = new Font("Segoe UI", 13f, FontStyle.Bold), Location = new Point(18, 14), AutoSize = true };
            lblStore = new Label { Text = negozio, ForeColor = MUT, Font = new Font("Segoe UI", 11f, FontStyle.Bold), Location = new Point(20, 44), AutoSize = true };
            Controls.Add(title); Controls.Add(lblStore);

            var card = new Panel { BackColor = CARD, Location = new Point(16, 74), Size = new Size(398, 150) };
            Controls.Add(card);

            int y = 16;
            (dotAgent, txtAgent) = Row(card, ref y, "Agente");
            (dotReg, txtReg) = Row(card, ref y, "Registratore");
            (dotCash, txtCash) = Row(card, ref y, "Cassa contanti");
            (dotCrm, txtCrm) = Row(card, ref y, "Collegamento CRM");

            btnRestart = MakeBtn("Riavvia agente", new Point(16, 238), Color.FromArgb(35, 134, 54));
            btnFree = MakeBtn("Libera registratore", new Point(222, 238), Color.FromArgb(56, 78, 126));
            btnRecheck = MakeBtn("Ricontrolla", new Point(16, 296), Color.FromArgb(48, 54, 61));
            btnReport = MakeBtn("Segnala problema", new Point(222, 296), Color.FromArgb(158, 106, 3));
            // STAMPA DI PROVA: documento NON fiscale, tutta larghezza, colore distinto.
            // Testa stampante + agente SENZA emettere scontrini fiscali veri (evita i
            // casi tipo "PROVA REPARTO" 03/09: 9 documenti fiscali reali solo per prova).
            btnTest = new Button { Text = "Stampa di prova (non fiscale)", Location = new Point(16, 354), Size = new Size(398, 48), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(28, 104, 122), ForeColor = Color.White, Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), Cursor = Cursors.Hand };
            btnTest.FlatAppearance.BorderSize = 0;
            btnRestart.Click += async (s, e) => await OnRestart();
            btnFree.Click += (s, e) => OnFree();
            btnRecheck.Click += (s, e) => RefreshStatus();
            btnReport.Click += async (s, e) => await OnReport();
            btnTest.Click += async (s, e) => await OnTestPrint();
            Controls.Add(btnRestart); Controls.Add(btnFree); Controls.Add(btnRecheck); Controls.Add(btnReport); Controls.Add(btnTest);

            lblFooter = new Label { Text = "", ForeColor = MUT, Font = new Font("Segoe UI", 9f), Location = new Point(18, 414), Size = new Size(396, 46) };
            Controls.Add(lblFooter);
        }

        (Label dot, Label txt) Row(Panel card, ref int y, string name)
        {
            var dot = new Label { Text = "●", ForeColor = MUT, Font = new Font("Segoe UI", 12f), Location = new Point(14, y), AutoSize = true };
            var nm = new Label { Text = name, ForeColor = TXT, Location = new Point(40, y + 2), Size = new Size(150, 22) };
            var txt = new Label { Text = "…", ForeColor = MUT, Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), Location = new Point(196, y + 2), Size = new Size(190, 22) };
            card.Controls.Add(dot); card.Controls.Add(nm); card.Controls.Add(txt);
            y += 33;
            return (dot, txt);
        }

        Button MakeBtn(string text, Point p, Color c)
        {
            var b = new Button { Text = text, Location = p, Size = new Size(192, 48), FlatStyle = FlatStyle.Flat, BackColor = c, ForeColor = Color.White, Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), Cursor = Cursors.Hand };
            b.FlatAppearance.BorderSize = 0;
            return b;
        }

        // ── Controlli locali ──────────────────────────────────────────────────────
        void RefreshStatus()
        {
            SetBusy(true);
            Task.Run(() =>
            {
                bool a = CheckAgent();
                bool mira = CheckMira();     // true = MIRA_FP_SERVER attivo (registratore occupato)
                bool custom = string.IsNullOrEmpty(fiscalUrl); // Custom = niente FiscalUrl http
                bool cash = string.IsNullOrEmpty(cashIp) ? false : CheckTcp(cashIp, 9100, 1500);
                bool crm = CheckCrm();

                agentOk = a; registerFree = !mira; cashOk = cash; crmOk = crm;

                BeginInvoke((Action)(() =>
                {
                    SetRow(dotAgent, txtAgent, a, a ? "ATTIVO" : "NON attivo");
                    if (custom) SetRow(dotReg, txtReg, !mira, mira ? "OCCUPATO (SuiteMobile)" : "LIBERO");
                    else SetRow(dotReg, txtReg, true, "Epson (ok)");
                    if (string.IsNullOrEmpty(cashIp)) { dotCash.ForeColor = MUT; txtCash.ForeColor = MUT; txtCash.Text = "non configurata"; }
                    else SetRow(dotCash, txtCash, cash, cash ? "RAGGIUNGIBILE" : "NON raggiungibile");
                    SetRow(dotCrm, txtCrm, crm, crm ? "OK" : "NON raggiungibile");
                    lblFooter.Text = "Ultimo controllo: " + DateTime.Now.ToString("HH:mm:ss");
                    SetBusy(false);
                }));
            });
        }

        void SetRow(Label dot, Label txt, bool ok, string s)
        {
            dot.ForeColor = ok ? GREEN : RED;
            txt.ForeColor = ok ? GREEN : RED;
            txt.Text = s;
        }

        bool CheckAgent()
        {
            try
            {
                using (var sr = new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE Name='powershell.exe'"))
                    foreach (ManagementObject o in sr.Get())
                    {
                        var cl = (o["CommandLine"] as string) ?? "";
                        if (cl.IndexOf("TelefuturaPosAgent", StringComparison.OrdinalIgnoreCase) >= 0 &&
                            cl.IndexOf("agent", StringComparison.OrdinalIgnoreCase) >= 0)
                            return true;
                    }
            }
            catch { }
            return false;
        }

        bool CheckMira()
        {
            try { return Process.GetProcessesByName("MIRA_FP_SERVER").Length > 0; }
            catch { return false; }
        }

        bool CheckTcp(string host, int port, int msTimeout)
        {
            try
            {
                using (var c = new TcpClient())
                {
                    var ar = c.BeginConnect(host, port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(msTimeout);
                    if (ok) { try { c.EndConnect(ar); } catch { return false; } }
                    return ok && c.Connected;
                }
            }
            catch { return false; }
        }

        bool CheckCrm()
        {
            try
            {
                var r = http.GetAsync(CRM + "/api/print/health?token=" + TOKEN).GetAwaiter().GetResult();
                return r.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        // ── Azioni ────────────────────────────────────────────────────────────────
        async Task OnRestart()
        {
            SetBusy(true);
            btnRestart.Text = "Riavvio in corso…";
            try
            {
                string ps = BuildRestartCommand();
                var psi = new ProcessStartInfo("powershell.exe", ps) { WindowStyle = ProcessWindowStyle.Hidden, CreateNoWindow = true, UseShellExecute = false };
                var p = Process.Start(psi);
                await Task.Run(() => p.WaitForExit(60000));
                await Task.Delay(2500);
                await SendReport("azione", "riavvio agente eseguito dallo staff");
            }
            catch (Exception ex) { MessageBox.Show("Errore riavvio: " + ex.Message); }
            btnRestart.Text = "Riavvia agente";
            RefreshStatus();
        }

        string BuildRestartCommand()
        {
            var sb = new StringBuilder();
            sb.Append("-ExecutionPolicy Bypass -Command \"");
            sb.Append("iwr ").Append(CRM).Append("/print-agent.ps1 -OutFile $env:TEMP\\pa.ps1 -UseBasicParsing; ");
            sb.Append("$p=@{Install=$true; Token='").Append(TOKEN).Append("'; Negozio='").Append(negozio.Replace("'", "''")).Append("'}; ");
            if (!string.IsNullOrEmpty(fiscalUrl)) sb.Append("$p.FiscalUrl='").Append(fiscalUrl.Replace("'", "''")).Append("'; ");
            if (!string.IsNullOrEmpty(cashIp)) sb.Append("$p.CashIp='").Append(cashIp.Replace("'", "''")).Append("'; ");
            sb.Append("& $env:TEMP\\pa.ps1 @p\"");
            return sb.ToString();
        }

        void OnFree()
        {
            try
            {
                var procs = Process.GetProcessesByName("MIRA_FP_SERVER");
                if (procs.Length == 0) { MessageBox.Show("Il registratore e' gia' libero (MIRA_FP_SERVER non e' in esecuzione)."); RefreshStatus(); return; }
                foreach (var p in procs) { try { p.Kill(); } catch { } }
                Thread.Sleep(1500);
                _ = SendReport("azione", "registratore liberato (MIRA_FP_SERVER chiuso) dallo staff");
                MessageBox.Show("Registratore liberato. Ora rifai lo scontrino dal CRM.");
            }
            catch (Exception ex) { MessageBox.Show("Errore: " + ex.Message); }
            RefreshStatus();
        }

        async Task OnReport()
        {
            string note = Prompt.Show("Segnala un problema", "Scrivi cosa non funziona (es. 'la cassa non prende i contanti'):");
            if (string.IsNullOrWhiteSpace(note)) return;
            bool ok = await SendReport("problema", note.Trim());
            MessageBox.Show(ok ? "Segnalazione inviata al supporto. Grazie!" : "Non sono riuscito a inviare (controlla il collegamento CRM).");
        }

        // STAMPA DI PROVA — chiede al CRM di mettere in coda un documento NON fiscale;
        // l'agente locale lo stampa. Niente Agenzia Entrate, niente chiusura Z.
        async Task OnTestPrint()
        {
            SetBusy(true);
            btnTest.Enabled = false;
            btnTest.Text = "Stampa in corso…";
            try
            {
                string json = "{"
                    + "\"token\":\"" + TOKEN + "\","
                    + "\"negozio\":" + JStr(negozio) + ","
                    + "\"deviceUrl\":" + JStr(fiscalUrl ?? "")
                    + "}";
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var r = await http.PostAsync(CRM + "/api/agent/test-print", content);
                if (r.IsSuccessStatusCode)
                    MessageBox.Show("Stampa di prova inviata (documento NON fiscale). Tra pochi secondi esce dalla stampante.\n\nSe non esce: controlla che 'Agente' sia ATTIVO e riprova.", "Stampa di prova");
                else
                    MessageBox.Show("Non riuscita (HTTP " + (int)r.StatusCode + "). Controlla il collegamento CRM.", "Stampa di prova");
            }
            catch (Exception ex) { MessageBox.Show("Errore: " + ex.Message); }
            btnTest.Text = "Stampa di prova (non fiscale)";
            btnTest.Enabled = true;
            SetBusy(false);
        }

        // ── Report al CRM ───────────────────────────────────────────────────────
        async Task<bool> SendReport(string tipo, string note)
        {
            try
            {
                string json = "{"
                    + "\"token\":\"" + TOKEN + "\","
                    + "\"negozio\":" + JStr(negozio) + ","
                    + "\"tipo\":" + JStr(tipo) + ","
                    + "\"agente\":" + (agentOk ? "true" : "false") + ","
                    + "\"registratoreLibero\":" + (registerFree ? "true" : "false") + ","
                    + "\"cassa\":" + (cashOk ? "true" : "false") + ","
                    + "\"crm\":" + (crmOk ? "true" : "false") + ","
                    + "\"nota\":" + JStr(note ?? "") + ","
                    + "\"pc\":" + JStr(Environment.MachineName) + ","
                    + "\"versione\":\"1.0.0\""
                    + "}";
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var r = await http.PostAsync(CRM + "/api/agent/report", content);
                return r.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        static string JStr(string s)
        {
            if (s == null) return "\"\"";
            var sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c == '\n') sb.Append("\\n");
                else if (c == '\r') sb.Append("\\r");
                else if (c == '\t') sb.Append("\\t");
                else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            sb.Append('"');
            return sb.ToString();
        }

        void SetBusy(bool b)
        {
            if (btnRestart == null) return;
            btnRecheck.Enabled = !b;
        }
    }

    // Piccola finestra di input (WinForms non ne ha una nativa).
    static class Prompt
    {
        public static string Show(string title, string label)
        {
            var f = new Form { Width = 460, Height = 210, FormBorderStyle = FormBorderStyle.FixedDialog, Text = title, StartPosition = FormStartPosition.CenterScreen, MaximizeBox = false, MinimizeBox = false, BackColor = Color.FromArgb(13, 17, 23), ForeColor = Color.FromArgb(230, 237, 243) };
            var lbl = new Label { Left = 16, Top = 14, Width = 420, Height = 40, Text = label };
            var box = new TextBox { Left = 16, Top = 60, Width = 420, Height = 60, Multiline = true, BackColor = Color.FromArgb(11, 15, 20), ForeColor = Color.White };
            var ok = new Button { Text = "Invia", Left = 250, Top = 132, Width = 90, DialogResult = DialogResult.OK, BackColor = Color.FromArgb(35, 134, 54), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var cancel = new Button { Text = "Annulla", Left = 346, Top = 132, Width = 90, DialogResult = DialogResult.Cancel, BackColor = Color.FromArgb(48, 54, 61), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            f.Controls.Add(lbl); f.Controls.Add(box); f.Controls.Add(ok); f.Controls.Add(cancel);
            f.AcceptButton = ok; f.CancelButton = cancel;
            return f.ShowDialog() == DialogResult.OK ? box.Text : null;
        }
    }
}
