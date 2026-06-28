/**
 * Credit pack catalog.
 *
 * All prices are in AED (UAE Dirham) minor units (fils, 100 fils = 1 AED).
 * amountMinor is always an integer — never a float.
 *
 * Pack tiers:
 *   pack_3  →  3 credits  →  AED 15.00  (1500 fils)
 *   pack_10 → 10 credits  →  AED 45.00  (4500 fils)
 *   pack_25 → 25 credits  →  AED 99.00  (9900 fils)
 */

export interface Pack {
  id: string
  credits: number
  amountMinor: number // integer minor units (fils)
  currency: string   // 'aed'
}

export const PACKS: Pack[] = [
  { id: 'pack_3',  credits: 3,  amountMinor: 1500, currency: 'aed' },
  { id: 'pack_10', credits: 10, amountMinor: 4500, currency: 'aed' },
  { id: 'pack_25', credits: 25, amountMinor: 9900, currency: 'aed' },
]

const PACK_MAP = new Map(PACKS.map((p) => [p.id, p]))

export function getPack(packId: string): Pack | undefined {
  return PACK_MAP.get(packId)
}
