import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html dir="rtl" lang="ar">
      <body>{children}</body>
    </html>
  )
}
