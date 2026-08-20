import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { NotificationCenter } from '@/components/NotificationCenter'
import { ComunicazioniPopup } from '@/components/ComunicazioniPopup'

export const metadata: Metadata = {
  title: 'Telefutura - CRM',
  description: 'Rebuild of test.gestionedoc.it',
  // MARKER DI BUILD (14/08, verifica giro deploy sul box 204): esce come
  // <meta name="tf-build-check"> in ogni pagina — per verificare che la
  // produzione serva la build di un certo push basta aggiornare il valore
  // e cercarlo nell'HTML del dominio. Aggiornarlo quando serve un test.
  other: { 'tf-build-check': 'hw-20260821-master' },
}

// NIENTE pagine prerenderizzate in cache (Luca 01/08, caso "reset password
// vecchio"): le route statiche uscivano con Cache-Control s-maxage=1 ANNO
// dalla full-route cache di Next — dopo un deploy gli utenti potevano
// continuare a ricevere l'HTML della build PRECEDENTE (x-nextjs-cache: HIT).
// Con force-dynamic ogni richiesta rende l'HTML fresco della build corrente:
// per una SPA autenticata come questa il costo e' irrilevante, la coerenza no.
// NOTA SEC-01: force-dynamic fa gia' uscire l'HTML con Cache-Control no-store,
// quindi niente header aggiuntivi; il "tasto Indietro dopo il logout" e' chiuso
// dal logout hard + handler pageshow in AuthContext (la bfcache ignora
// parzialmente no-store nei browser recenti).
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className="antialiased font-sans bg-[#0f111a] text-white" suppressHydrationWarning>
        {/* TEMA (Luca 29/07): applicato PRIMA del primo paint — senza questo
            script chi usa il tema chiaro vedrebbe un lampo scuro a ogni pagina. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("crm_theme")==="chiaro")document.documentElement.classList.add("light");var f=(localStorage.getItem("tf_fs")||"").split(",");if(f[0]&&f[0]!=="0")document.documentElement.setAttribute("data-fs-sm",f[0]);if(f[1]&&f[1]!=="0")document.documentElement.setAttribute("data-fs-lg",f[1])}catch(e){}` }} />
        {/* GUARD ANTI-SKEW (03/08): dopo un deploy i pezzi dell'app cambiano
            nome — una tab rimasta aperta sulla versione vecchia esplodeva con
            "Application error: a client-side exception…". Se fallisce il
            caricamento di un chunk, la pagina si RICARICA da sola (al massimo
            una volta ogni 60s, per non ciclare se la rete e' giu'). */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){function ric(m){try{var t=Number(sessionStorage.getItem("crm_skew_ric")||0);if(Date.now()-t<60000)return;sessionStorage.setItem("crm_skew_ric",String(Date.now()));location.reload();}catch(e){}}function eChunk(x){x=String(x||"");return x.indexOf("ChunkLoadError")>-1||x.indexOf("Loading chunk")>-1||x.indexOf("Failed to fetch dynamically imported module")>-1||x.indexOf("Importing a module script failed")>-1}window.addEventListener("error",function(e){if(eChunk(e&&e.message))ric(e.message)},true);window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;if(eChunk(r&&(r.name+" "+r.message)))ric(r.message)})})();` }} />
        <AuthProvider>
          <NotificationCenter />
          {/* Pop-up comunicazioni con conferma: sopra tutto, per gli utenti loggati */}
          <ComunicazioniPopup />
          <div className="flex min-h-screen">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
