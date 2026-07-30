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
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("crm_theme")==="chiaro")document.documentElement.classList.add("light")}catch(e){}` }} />
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
