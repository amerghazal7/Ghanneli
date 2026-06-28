import type { ReactNode } from 'react'
import { Aref_Ruqaa, Reem_Kufi, Tajawal } from 'next/font/google'
import { AuthProvider } from '../lib/auth/AuthProvider'
import './globals.css'

const arefRuqaa = Aref_Ruqaa({
  weight: ['400', '700'],
  subsets: ['arabic'],
  variable: '--font-aref-ruqaa',
  display: 'swap',
})

const reemKufi = Reem_Kufi({
  weight: ['400', '500', '600', '700'],
  subsets: ['arabic'],
  variable: '--font-reem-kufi',
  display: 'swap',
})

const tajawal = Tajawal({
  weight: ['400', '500', '700'],
  subsets: ['arabic'],
  variable: '--font-tajawal',
  display: 'swap',
})

export const metadata = {
  title: 'غنّيلي — أغنية مخصصة لك',
  description: 'اصنع أغنية عربية مخصصة بالذكاء الاصطناعي',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      dir="rtl"
      lang="ar"
      className={`${arefRuqaa.variable} ${reemKufi.variable} ${tajawal.variable}`}
    >
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
