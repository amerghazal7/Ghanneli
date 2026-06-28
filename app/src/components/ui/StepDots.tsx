interface StepDotsProps {
  total: number
  current: number // 1-indexed
}

export function StepDots({ total, current }: StepDotsProps) {
  return (
    <div className="step-dots" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total} aria-label={`الخطوة ${current} من ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`step-dots__dot${i + 1 === current ? ' step-dots__dot--active' : i + 1 < current ? ' step-dots__dot--done' : ''}`}
        />
      ))}
    </div>
  )
}
