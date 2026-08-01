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
}

// NIENTE pagine prerenderizzate in cache (Luca 01/08, caso "reset password
// vecchio"): le route statiche uscivano con Cache-Control s-maxage=1 ANNO
// dalla full-route cache di Next — dopo un deploy gli utenti potevano
// continuare a ricevere l'HTML della build PRECEDENTE (x-nextjs-cache: HIT).
// Con force-dynamic ogni richiesta rende l'HTML fresco della build corrente:
// per una SPA autenticata come questa il costo e' irrilevante, la coerenza no.
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
      <body className="antialiased font-sans bg-[#0f111a] text-white">
        {/* TEMA (Luca 29/07): applicato PRIMA del primo paint — senza questo
            script chi usa il tema chiaro vedrebbe un lampo scuro a ogni pagina. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("crm_theme")==="chiaro")document.documentElement.classList.add("light");var f=(localStorage.getItem("tf_fs")||"").split(",");if(f[0]&&f[0]!=="0")document.documentElement.setAttribute("data-fs-sm",f[0]);if(f[1]&&f[1]!=="0")document.documentElement.setAttribute("data-fs-lg",f[1])}catch(e){}` }} />
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
