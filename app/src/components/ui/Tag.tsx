import type { ReactNode } from 'react'

export type TagColor = 'gold' | 'rose' | 'muted'

interface TagProps {
  children: ReactNode
  color?: TagColor
  className?: string
}

export function Tag({ children, color = 'muted', className = '' }: TagProps) {
  return (
    <span className={`tag tag--${color} ${className}`.trim()}>
      {children}
    </span>
  )
}
