"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { LogIn, KeyRound } from "lucide-react";

export default function LoginPage() {
  const { login, completeFirstLogin } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"login" | "change">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
              {step === "login" ? "Accedi al tuo account" : "Imposta una nuova password"}
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
            </form>
          ) : (
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
          )}
        </div>
      </div>
    </main>
  );
}
