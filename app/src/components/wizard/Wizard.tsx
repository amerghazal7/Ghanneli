'use client'

import { useState } from 'react'
import { StepDots } from '../ui/StepDots'
import { Card } from '../ui/Card'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { ApiError } from '../../lib/api/client'
import { getFirebaseAuth } from '../../lib/firebase/client'

// ---- Types ------------------------------------------------------------------

const DIALECTS = ['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi'] as const
type Dialect = (typeof DIALECTS)[number]

const DIALECT_LABELS: Record<Dialect, string> = {
  khaleeji:  'خليجي',
  egyptian:  'مصري',
  levantine: 'شامي',
  maghrebi:  'مغربي',
  iraqi:     'عراقي',
}

interface WizardState {
  occasion: string
  recipient: string
  sender: string
  relationship: string
  details: string
  mood: string
  dialect: Dialect
  genre: string
  voiceGender: 'male' | 'female'
  lengthHint: 'short' | 'standard'
}

const initial: WizardState = {
  occasion: '',
  recipient: '',
  sender: '',
  relationship: '',
  details: '',
  mood: '',
  dialect: 'egyptian',
  genre: '',
  voiceGender: 'female',
  lengthHint: 'standard',
}

// ---- ChipGroup (dialect, voiceGender, lengthHint) ---------------------------

interface ChipGroupProps<T extends string> {
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (v: T) => void
  groupLabel: string
}

function ChipGroup<T extends string>({
  options,
  labels,
  value,
  onChange,
  groupLabel,
}: ChipGroupProps<T>) {
  return (
    <div className="chip-group" role="group" aria-label={groupLabel}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`chip${value === opt ? ' chip--active' : ''}`}
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  )
}

// ---- Wizard -----------------------------------------------------------------

export function Wizard() {
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const body = {
        occasion: state.occasion,
        recipient: state.recipient,
        sender: state.sender,
        relationship: state.relationship,
        details: state.details.split('\n').filter(Boolean),
        mood: state.mood || 'happy',
        dialect: state.dialect,
        genre: state.genre || 'pop',
        voiceGender: state.voiceGender,
        lengthHint: state.lengthHint,
      }
      // Get token if available; fall back to no auth header (API will return 401)
      let token: string | null = null
      try {
        const auth = getFirebaseAuth()
        token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      } catch {
        // Firebase not available in test environment — proceed without token
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch('/api/songs', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        throw new ApiError(res.status, errBody.error ?? res.statusText)
      }
      const data = (await res.json()) as { songId: string; shareSlug: string }
      window.location.href = `/song/${data.shareSlug}`
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          window.location.href = '/signin'
          return
        }
        setError(`خطأ (${err.status}): ${err.message}`)
      } else {
        setError('حدث خطأ. يرجى المحاولة مجدداً.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="wizard">
      <StepDots total={3} current={step} />

      {/* Step 1 — المناسبة */}
      {step === 1 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">ما المناسبة؟</h2>
          <Field
            id="occasion"
            label="المناسبة"
            placeholder="مثال: عيد ميلاد، حفل زفاف، تخرج…"
            value={state.occasion}
            onChange={(e) => set('occasion', e.target.value)}
          />
          <div className="wizard__nav">
            <Button
              variant="primary"
              size="md"
              onClick={() => setStep(2)}
              disabled={!state.occasion.trim()}
            >
              التالي
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2 — من هو المُهدى إليه */}
      {step === 2 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">أخبرنا عن المُهدى إليه</h2>
          <Field
            id="recipient"
            label="المُهدى إليه"
            placeholder="مثال: أحمد"
            value={state.recipient}
            onChange={(e) => set('recipient', e.target.value)}
          />
          <Field
            id="sender"
            label="المُرسِل"
            placeholder="اسمك"
            value={state.sender}
            onChange={(e) => set('sender', e.target.value)}
          />
          <Field
            id="relationship"
            label="العلاقة"
            placeholder="مثال: صديق، أخ، زوج…"
            value={state.relationship}
            onChange={(e) => set('relationship', e.target.value)}
          />
          <Field
            id="details"
            as="textarea"
            label="تفاصيل (كل تفصيل في سطر)"
            placeholder="مثال: يحب الموسيقى الكلاسيكية"
            value={state.details}
            onChange={(e) => set('details', e.target.value)}
            rows={3}
          />
          <Field
            id="mood"
            label="المزاج"
            placeholder="مثال: سعيد، رومانسي، حنيني…"
            value={state.mood}
            onChange={(e) => set('mood', e.target.value)}
          />
          <div className="wizard__nav wizard__nav--between">
            <Button variant="ghost" size="md" onClick={() => setStep(1)}>
              السابق
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => setStep(3)}
              disabled={!state.recipient.trim() || !state.sender.trim()}
            >
              التالي
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3 — اللهجة والنوع والصوت */}
      {step === 3 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">الطابع الموسيقي</h2>

          <div>
            <div className="wizard__field-label">اللهجة</div>
            <ChipGroup
              options={DIALECTS}
              labels={DIALECT_LABELS}
              value={state.dialect}
              onChange={(v) => set('dialect', v)}
              groupLabel="اللهجة"
            />
          </div>

          <Field
            id="genre"
            label="النوع الموسيقي"
            placeholder="مثال: بوب، خليجي، جاز…"
            value={state.genre}
            onChange={(e) => set('genre', e.target.value)}
          />

          <div>
            <div className="wizard__field-label">جنس الصوت</div>
            <ChipGroup
              options={['female', 'male'] as const}
              labels={{ female: 'أنثى', male: 'ذكر' }}
              value={state.voiceGender}
              onChange={(v) => set('voiceGender', v)}
              groupLabel="جنس الصوت"
            />
          </div>

          <div>
            <div className="wizard__field-label">طول الأغنية</div>
            <ChipGroup
              options={['standard', 'short'] as const}
              labels={{ standard: 'عادي', short: 'قصير' }}
              value={state.lengthHint}
              onChange={(v) => set('lengthHint', v)}
              groupLabel="طول الأغنية"
            />
          </div>

          {error && (
            <p className="wizard__error" role="alert">{error}</p>
          )}

          <div className="wizard__nav wizard__nav--between">
            <Button variant="ghost" size="md" onClick={() => setStep(2)}>
              السابق
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => { void handleSubmit() }}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'جاري الإرسال…' : 'إرسال'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
