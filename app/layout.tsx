import type { Metadata } from 'next'
import '../src/style.css'

export const metadata: Metadata = {
  title: 'Stocke — Inventaire partagé',
  description: 'Un inventaire partagé, clair et à jour pour toute votre équipe.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>
}
