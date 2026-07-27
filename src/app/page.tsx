"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { LogIn, KeyRound } from "lucide-react";

export default function LoginPage() {
  const { login, completeFirstLogin } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"login" | "change" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ── RESET PASSWORD (richiesta Luca 28/07): dal login si manda la richiesta
  //    all'amministrazione (⚡ admin_tasks). L'admin genera la password
  //    temporanea dal pannello Utenti (admin_set_password, hash a DB) e la
  //    comunica all'utente, che al primo accesso DEVE cambiarla (flusso
  //    must_change_password gia' esistente). Risposta volutamente neutra:
  //    non si rivela se un'email esiste oppure no.
  const [resetInviata, setResetInviata] = useState(false);
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const em = email.trim().toLowerCase();
      const { data: u } = await supabase.from("app_users").select("id, full_name").ilike("email", em).limit(1).maybeSingle();
      if (u) {
        // niente doppioni: se c'e' gia' una richiesta aperta per questa email, non se ne aggiunge un'altra
        const { data: gia } = await supabase.from("admin_tasks").select("id").eq("tipo", "reset_password").eq("done", false).ilike("titolo", `%${em}%`).limit(1);
        if (!gia || !gia.length) {
          await supabase.from("admin_tasks").insert({
            tipo: "reset_password",
            titolo: `🔑 Reset password: ${u.full_name} (${em})`,
            dettaglio: "Richiesta dalla schermata di login. Da Utenti apri la scheda dell'utente e usa 'Reset password': genera la temporanea e comunicagliela — al primo accesso dovrà cambiarla.",
            link: "/amministrazione?sez=utenti",
            target_role: "admin",
            created_by: "login",
          });
        }
      }
      setResetInviata(true);
    } finally { setIsLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const res = await login(email, password);
    setIsLoading(false);
    if (!res.ok) { setError(res.error || "Accesso non riuscito"); return; }
    if (res.mustChange) { setStep("change"); return; }
    router.push("/dashboard");
  };

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPw.length < 8) { setError("La nuova password deve avere almeno 8 caratteri."); return; }
    if (newPw !== confirmPw) { setError("Le due password non coincidono."); return; }
    setIsLoading(true);
    const res = await completeFirstLogin(email, password, newPw);
    setIsLoading(false);
    if (!res.ok) { setError(res.error || "Cambio password non riuscito"); return; }
    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#0f111a]">
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
              {step === "login" ? "Accedi al tuo account" : step === "reset" ? "Recupero password" : "Imposta una nuova password"}
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
                onClick={() => { setError(""); setResetInviata(false); setStep("reset"); }}
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
            resetInviata ? (
              <div className="space-y-6">
                <p className="text-sm text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-4 py-3">
                  Richiesta inviata. Se l&apos;email è tra gli utenti del CRM, l&apos;amministrazione
                  riceverà la segnalazione e ti comunicherà una <b>password temporanea</b>:
                  al primo accesso ti verrà chiesto di cambiarla.
                </p>
                <button type="button" onClick={() => setStep("login")} className="primary-btn w-full flex items-center justify-center gap-2">
                  <LogIn className="w-5 h-5" /> Torna al login
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-6">
                <p className="text-xs text-slate-400 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-3">
                  Inserisci la tua email: la richiesta arriva all&apos;amministrazione, che ti
                  comunicherà una password temporanea da cambiare al primo accesso.
                </p>
                <div>
                  <label htmlFor="resetEmail" className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    id="resetEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="glass-input w-full"
                    placeholder="nome@telefutura.it"
                    autoComplete="username"
                    required
                  />
                </div>
                <button type="submit" disabled={isLoading} className="primary-btn w-full flex items-center justify-center gap-2">
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><KeyRound className="w-5 h-5" /> Richiedi il reset</>
                  )}
                </button>
                <button type="button" onClick={() => setStep("login")} className="w-full text-center text-sm text-slate-400 hover:text-indigo-300 transition-colors">
                  Torna al login
                </button>
              </form>
            )
          )}
        </div>
      </div>
    </main>
  );
}
