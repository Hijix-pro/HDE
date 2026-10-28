import type { Metadata } from 'next'
import '../src/style.css'

export const metadata: Metadata = {
  title: 'HDE-Inventaire — Inventaire partagé',
  description: 'Un inventaire partagé, chaleureux et à jour pour toute votre équipe.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>
}
