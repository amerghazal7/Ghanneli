const ar = { 'app.name': 'غنّيلي', 'wizard.title': 'اصنع أغنيتك' } as const
export type MsgKey = keyof typeof ar
export const t = (k: MsgKey): string => ar[k]
