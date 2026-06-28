// Client-safe re-export of credit pack catalog.
// Keeps the same Pack type and PACKS array as the server original
// but lives outside server/ so 'use client' components can import it.

export interface Pack {
  id: string
  credits: number
  amountMinor: number
  currency: string
}

export const PACKS: Pack[] = [
  { id: 'pack_3',  credits: 3,  amountMinor: 1500, currency: 'aed' },
  { id: 'pack_10', credits: 10, amountMinor: 4500, currency: 'aed' },
  { id: 'pack_25', credits: 25, amountMinor: 9900, currency: 'aed' },
]
