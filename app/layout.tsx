import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Urban Navigator', description: 'Agente de navegación urbana · A* + Yen\'s K' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
