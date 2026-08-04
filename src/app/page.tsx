"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { LogIn, KeyRound, ShieldCheck, Smartphone } from "lucide-react";

export default function LoginPage() {
  const { login, completeFirstLogin } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"login" | "change" | "reset" | "totp" | "enroll">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // 2FA (verifica in due passaggi)
  const [otpCode, setOtpCode] = useState("");
  const [qr, setQr] = useState("");
  const [otpauth, setOtpauth] = useState("");

  // ── RESET PASSWORD AUTOMATICO (Luca 01/08, seconda direttiva): l'utente
  //    chiede il reset e riceve la PASSWORD PROVVISORIA sulla propria email
  //    (/api/auth/reset-password, mode default) — nessuna richiesta
  //    all'amministrazione. Al primo accesso la cambia (must_change_password).
  //    Via alternativa ISTANTANEA per chi ha l'authenticator (mode "totp").
  //    Risposte volutamente neutre: non si rivela se un'email esiste o no.
  const [resetInviata, setResetInviata] = useState(false);
  const [resetOk, setResetOk] = useState(false);
  const [authInviata, setAuthInviata] = useState(false);
  const [usaTotp, setUsaTotp] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetPw1, setResetPw1] = useState("");
  const [resetPw2, setResetPw2] = useState("");
  const handleResetMail = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!email.trim()) { setError("Scrivi prima la tua email."); return; }
    setIsLoading(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = await r.json();
      if (j.ok) setResetInviata(true);
      else setError(j.error || "Invio non riuscito.");
    } finally { setIsLoading(false); }
  };
  const handleResetSelf = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (resetPw1.length < 8) { setError("La nuova password deve avere almeno 8 caratteri."); return; }
    if (resetPw1 !== resetPw2) { setError("Le due password non coincidono."); return; }
    setIsLoading(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: resetCode.trim(), newPassword: resetPw1, mode: "totp" }),
      });
      const j = await r.json();
      if (j.ok) { setResetOk(true); setPassword(""); setResetCode(""); setResetPw1(""); setResetPw2(""); }
      else if (j.fallback) { setUsaTotp(false); setError(j.error || ""); }
      else setError(j.error || "Reset non riuscito.");
    } finally { setIsLoading(false); }
  };
  // AUTHENTICATOR PERSO (telefono nuovo/smarrito): qui SERVE l'amministrazione
  // — arriva la notifica ⚡ e dalla scheda utente si usa "Reset 2FA"; al
  // prossimo accesso l'utente scansiona un nuovo QR.
  const handleRichiestaAuth = async () => {
    setError("");
    setIsLoading(true);
    try {
      const em = email.trim().toLowerCase();
      if (!em) { setError("Scrivi prima la tua email."); return; }
      const { data: u } = await supabase.from("app_users").select("id, full_name").ilike("email", em).limit(1).maybeSingle();
      if (u) {
        const { data: gia } = await supabase.from("admin_tasks").select("id").eq("tipo", "reset_authenticator").eq("done", false).ilike("titolo", `%${em}%`).limit(1);
        if (!gia || !gia.length) {
          await supabase.from("admin_tasks").insert({
            tipo: "reset_authenticator",
            titolo: `📱 Reset authenticator: ${u.full_name} (${em})`,
            dettaglio: "L'utente ha perso l'accesso all'app di verifica in due passaggi (telefono nuovo o smarrito). Da Utenti apri la sua scheda e usa 'Reset 2FA': al prossimo accesso scansionerà un nuovo QR.",
            link: "/amministrazione?sez=utenti",
            target_role: "admin",
            created_by: "login",
          });
        }
      }
      setStep("reset");
      setAuthInviata(true);
    } finally { setIsLoading(false); }
  };

  // instrada il risultato del login verso lo stadio giusto (2FA compresa)
  const routeResult = (res: Awaited<ReturnType<typeof login>>): boolean => {
    if (res.mustChange) { setStep("change"); return true; }
    if (res.enrollRequired) { setQr(res.qr || ""); setOtpauth(res.otpauth || ""); setOtpCode(""); setError(res.error || ""); setStep("enroll"); return true; }
    if (res.totpRequired) { setOtpCode(""); setError(res.error || ""); setStep("totp"); return true; }
    if (res.ok) { router.push("/dashboard"); return true; }
    return false;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const res = await login(email, password);
    setIsLoading(false);
    if (!routeResult(res)) setError(res.error || "Accesso non riuscito");
  };

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPw.length < 8) { setError("La nuova password deve avere almeno 8 caratteri."); return; }
    if (newPw !== confirmPw) { setError("Le due password non coincidono."); return; }
    setIsLoading(true);
    const res = await completeFirstLogin(email, password, newPw);
    setIsLoading(false);
    // dopo il cambio password la password valida e' quella nuova: aggiorno lo
    // stato cosi' i passi 2FA successivi usano quella giusta.
    if (res.ok || res.totpRequired || res.enrollRequired) setPassword(newPw);
    if (!routeResult(res)) setError(res.error || "Cambio password non riuscito");
  };

  // conferma il codice 2FA (login normale o iscrizione)
  const handleOtp = async (enrolling: boolean) => {
    setError("");
    if (otpCode.replace(/\D/g, "").length < 6) { setError("Inserisci il codice a 6 cifre."); return; }
    setIsLoading(true);
    const res = await login(email, password, { code: otpCode, enrolling });
    setIsLoading(false);
    if (!routeResult(res)) setError(res.error || "Verifica non riuscita");
  };

  return (
    <main id="login-root" className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#0f111a]">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-pink-600/20 rounded-full blur-[100px]" />

      <div className="w-full max-w-md p-8 relative z-10">
        <div className="glass-card p-10 backdrop-blur-2xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              Telefutura CRM
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              {step === "login" ? "Accedi al tuo account"
                : step === "reset" ? "Recupero password"
                : step === "totp" ? "Verifica in due passaggi"
                : step === "enroll" ? "Attiva la verifica in due passaggi"
                : "Imposta una nuova password"}
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {step === "login" ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full"
                  placeholder="nome@telefutura.it"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="primary-btn w-full mt-4 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><LogIn className="w-5 h-5" /> Accedi</>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setError(""); setResetInviata(false); setResetOk(false); setAuthInviata(false); setUsaTotp(false); setStep("reset"); }}
                className="w-full text-center text-sm text-slate-400 hover:text-indigo-300 transition-colors"
              >
                Password dimenticata?
              </button>
            </form>
          ) : step === "change" ? (
            <form onSubmit={handleChange} className="space-y-6">
              <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-3">
                Primo accesso: per sicurezza devi impostare una password personale.
              </p>
              <div>
                <label htmlFor="newPw" className="block text-sm font-medium text-slate-300 mb-2">Nuova password</label>
                <input
                  id="newPw"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="glass-input w-full"
                  placeholder="Almeno 8 caratteri"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <label htmlFor="confirmPw" className="block text-sm font-medium text-slate-300 mb-2">Conferma password</label>
                <input
                  id="confirmPw"
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="glass-input w-full"
                  placeholder="Ripeti la nuova password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="primary-btn w-full mt-4 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><KeyRound className="w-5 h-5" /> Salva e accedi</>
                )}
              </button>
            </form>
          ) : null}

          {step === "reset" && (
            resetOk ? (
              <div className="space-y-6">
                <p className="text-sm text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-4 py-3">
                  ✅ <b>Password cambiata.</b> Accedi subito con la nuova password: nessuna
                  autorizzazione necessaria.
                </p>
                <button type="button" onClick={() => setStep("login")} className="primary-btn w-full flex items-center justify-center gap-2">
                  <LogIn className="w-5 h-5" /> Vai al login
                </button>
              </div>
            ) : authInviata ? (
              <div className="space-y-6">
                <p className="text-sm text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-4 py-3">
                  Richiesta inviata. Se l&apos;email è tra gli utenti del CRM, l&apos;amministrazione
                  riceverà la notifica, azzererà la <b>verifica in due passaggi</b> e ti avviserà:
                  al prossimo accesso scansionerai un nuovo QR con l&apos;authenticator.
                </p>
                <button type="button" onClick={() => setStep("login")} className="primary-btn w-full flex items-center justify-center gap-2">
                  <LogIn className="w-5 h-5" /> Torna al login
                </button>
              </div>
            ) : resetInviata ? (
              <div className="space-y-6">
                <p className="text-sm text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-4 py-3">
                  📧 Fatto. Se l&apos;email è tra gli utenti del CRM, riceverai <b>subito</b> una
                  <b> password provvisoria</b> nella tua casella (controlla anche lo spam):
                  accedi con quella e al primo accesso imposti la tua password personale.
                </p>
                <button type="button" onClick={() => setStep("login")} className="primary-btn w-full flex items-center justify-center gap-2">
                  <LogIn className="w-5 h-5" /> Torna al login
                </button>
              </div>
            ) : usaTotp ? (
              <form onSubmit={handleResetSelf} className="space-y-5">
                <p className="text-xs text-slate-400 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-3">
                  Cambio <b>immediato</b>: email, codice a 6 cifre dell&apos;authenticator e nuova
                  password — senza passare dalla posta.
                </p>
                <div>
                  <label htmlFor="resetEmail2" className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input id="resetEmail2" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="glass-input w-full" placeholder="nome@telefutura.it" autoComplete="username" required />
                </div>
                <div>
                  <label htmlFor="resetCode" className="block text-sm font-medium text-slate-300 mb-2">Codice authenticator</label>
                  <input id="resetCode" inputMode="numeric" value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="glass-input w-full font-mono tracking-[0.4em]" placeholder="123456" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="password" value={resetPw1} onChange={(e) => setResetPw1(e.target.value)}
                    className="glass-input w-full" placeholder="Nuova password (min. 8)" autoComplete="new-password" required />
                  <input type="password" value={resetPw2} onChange={(e) => setResetPw2(e.target.value)}
                    className="glass-input w-full" placeholder="Ripeti la nuova password" autoComplete="new-password" required />
                </div>
                <button type="submit" disabled={isLoading} className="primary-btn w-full flex items-center justify-center gap-2">
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><KeyRound className="w-5 h-5" /> Cambia la password</>
                  )}
                </button>
                <button type="button" onClick={() => { setUsaTotp(false); setError(""); }} className="w-full text-center text-xs text-slate-500 hover:text-indigo-300 transition-colors">
                  ← Preferisci la password provvisoria via email?
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetMail} className="space-y-5">
                <p className="text-xs text-slate-400 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-3">
                  Inserisci la tua email: ricevi <b>subito</b> una <b>password provvisoria</b> nella
                  tua casella, senza attese né autorizzazioni. Al primo accesso la cambi.
                </p>
                <div>
                  <label htmlFor="resetEmail" className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input id="resetEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="glass-input w-full" placeholder="nome@telefutura.it" autoComplete="username" required />
                </div>
                <button type="submit" disabled={isLoading} className="primary-btn w-full flex items-center justify-center gap-2">
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><KeyRound className="w-5 h-5" /> 📧 Inviami la password provvisoria</>
                  )}
                </button>
                <div className="pt-1 space-y-2 text-center">
                  <button type="button" onClick={() => { setUsaTotp(true); setError(""); }} className="w-full text-xs text-slate-500 hover:text-indigo-300 transition-colors">
                    Hai l&apos;authenticator sotto mano? Cambia la password subito, senza email
                  </button>
                  <button type="button" onClick={handleRichiestaAuth} className="w-full text-xs text-slate-500 hover:text-indigo-300 transition-colors">
                    Hai perso l&apos;authenticator (telefono nuovo/smarrito)? Chiedi il reset della verifica
                  </button>
                  <button type="button" onClick={() => setStep("login")} className="w-full text-sm text-slate-400 hover:text-indigo-300 transition-colors">
                    Torna al login
                  </button>
                </div>
              </form>
            )
          )}

          {/* ── 2FA: iscrizione (scansiona il QR) ── */}
          {step === "enroll" && (
            <form onSubmit={(e) => { e.preventDefault(); handleOtp(true); }} className="space-y-5">
              <p className="text-xs text-slate-300 bg-indigo-500/10 border border-indigo-500/25 rounded-lg px-4 py-3 flex items-start gap-2">
                <Smartphone className="w-4 h-4 mt-0.5 shrink-0 text-indigo-300" />
                <span>Da ora l&apos;accesso richiede la verifica in due passaggi. Apri <b>Google Authenticator</b> (o Authy/Microsoft Authenticator), tocca <b>+</b> → <b>Scansiona codice QR</b> e inquadra questo QR. Poi inserisci il codice a 6 cifre che vedi nell&apos;app.</span>
              </p>
              {qr && <img src={qr} alt="QR 2FA" className="w-44 h-44 mx-auto rounded-xl bg-white p-2" />}
              {otpauth && (
                <p className="text-[10px] text-slate-500 text-center break-all">Non riesci a scansionare? Chiave manuale:<br /><span className="text-slate-400 font-mono">{new URLSearchParams(otpauth.split("?")[1] || "").get("secret")}</span></p>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Codice dall&apos;app</label>
                <input inputMode="numeric" autoComplete="one-time-code" value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="glass-input w-full text-center tracking-[0.4em] text-lg" placeholder="000000" autoFocus />
              </div>
              <button type="submit" disabled={isLoading} className="primary-btn w-full flex items-center justify-center gap-2">
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><ShieldCheck className="w-5 h-5" /> Attiva e accedi</>}
              </button>
            </form>
          )}

          {/* ── 2FA: richiesta codice al login ── */}
          {step === "totp" && (
            <form onSubmit={(e) => { e.preventDefault(); handleOtp(false); }} className="space-y-5">
              <p className="text-xs text-slate-300 bg-indigo-500/10 border border-indigo-500/25 rounded-lg px-4 py-3 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-indigo-300" />
                <span>Apri l&apos;app authenticator e inserisci il codice a 6 cifre per <b>{email}</b>.</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Codice di verifica</label>
                <input inputMode="numeric" autoComplete="one-time-code" value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="glass-input w-full text-center tracking-[0.4em] text-lg" placeholder="000000" autoFocus />
              </div>
              <button type="submit" disabled={isLoading} className="primary-btn w-full flex items-center justify-center gap-2">
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><LogIn className="w-5 h-5" /> Verifica e accedi</>}
              </button>
              <button type="button" onClick={handleRichiestaAuth} className="w-full text-center text-xs text-slate-500 hover:text-indigo-300 transition-colors">
                Hai perso l&apos;authenticator (telefono nuovo/smarrito)? Chiedi il reset all&apos;amministrazione
              </button>
              <button type="button" onClick={() => { setStep("login"); setOtpCode(""); setError(""); }} className="w-full text-center text-sm text-slate-400 hover:text-indigo-300 transition-colors">
                Annulla
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
