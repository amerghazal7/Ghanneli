import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FieldBaseProps {
  label: string
  error?: string
  hint?: string
}

interface InputFieldProps extends FieldBaseProps, InputHTMLAttributes<HTMLInputElement> {
  as?: 'input'
  id: string
}

interface TextareaFieldProps extends FieldBaseProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  as: 'textarea'
  id: string
}

type FieldProps = InputFieldProps | TextareaFieldProps

export function Field(props: FieldProps) {
  const { label, error, hint, as: As = 'input', ...rest } = props
  const id = rest.id as string
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {As === 'textarea' ? (
        <textarea
          className={`field__input field__textarea${error ? ' field__input--error' : ''}`}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          className={`field__input${error ? ' field__input--error' : ''}`}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {hint && !error && (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
