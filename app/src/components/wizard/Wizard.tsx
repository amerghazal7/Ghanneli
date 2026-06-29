'use client'

import { useState } from 'react'
import { StepDots } from '../ui/StepDots'
import { Card } from '../ui/Card'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { ApiError } from '../../lib/api/client'
import { getFirebaseAuth } from '../../lib/firebase/client'

// ---- Curated option sets (Arabic-first) -------------------------------------

const DIALECTS = ['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi'] as const
type Dialect = (typeof DIALECTS)[number]
const DIALECT_LABELS: Record<Dialect, string> = {
  khaleeji: 'خليجي',
  egyptian: 'مصري',
  levantine: 'شامي',
  maghrebi: 'مغربي',
  iraqi: 'عراقي',
}

type Gender = 'male' | 'female'
const GENDER_LABELS: Record<Gender, string> = { female: 'أنثى', male: 'ذكر' }

type AgeBand = 'child' | 'youth' | 'adult' | 'senior'
const AGE_LABELS: Record<AgeBand, string> = {
  child: 'طفل',
  youth: 'شاب',
  adult: 'بالغ',
  senior: 'كبير',
}

type Tempo = 'slow' | 'medium' | 'fast'
const TEMPO_LABELS: Record<Tempo, string> = { slow: 'بطيء', medium: 'متوسط', fast: 'سريع' }

type Length = 'short' | 'standard'
const LENGTH_LABELS: Record<Length, string> = { standard: 'عادي', short: 'قصير' }

const RELATIONSHIPS = [
  'أب/أم', 'ابن/ابنة', 'أخ/أخت', 'زوج/زوجة', 'خطيب/خطيبة', 'حبيب/حبيبة',
  'صديق مقرّب', 'جدّ/جدّة', 'زميل', 'قريب', 'أخرى',
] as const

const OCCASIONS = [
  'عيد ميلاد', 'زواج', 'عقد قِران', 'تخرّج', 'نجاح وتفوّق', 'عيد الأم', 'عيد الأب',
  'مولود جديد', 'شفاء وسلامة', 'ترقية / عمل جديد', 'ذكرى سنوية', 'اشتياق',
  'اعتذار', 'شكر وتقدير', 'العيد', 'وداع', 'حبّ بلا مناسبة', 'أخرى',
] as const

const GENRES = [
  'طرب أصيل', 'خليجي', 'شعبي مصري', 'شامي', 'بوب عربي',
  'راب عربي', 'أكوستيك هادئ', 'روك', 'جاز', 'كلاسيكي',
] as const

const VIBES = ['رومانسي', 'فرِح', 'شجيّ', 'حماسي', 'روحاني', 'مرِح'] as const

const TRAITS = [
  'طيّب القلب', 'مرِح', 'طموح', 'حنون', 'كريم', 'مغامر',
  'هادئ وداعم', 'وفيّ', 'رومانسي', 'عنيد بطريقة محبوبة',
] as const

// ---- State ------------------------------------------------------------------

interface WizardState {
  // 1 — recipient
  recipient: string
  includeName: boolean
  recipientGender?: Gender
  recipientAge?: AgeBand
  // 2 — relationship
  relationship: string
  sender: string
  senderGender?: Gender
  senderAge?: AgeBand
  // 3 — occasion
  occasion: string
  mentionOccasion: boolean
  // 4 — style
  dialect: Dialect
  voiceGender: Gender
  genre: string
  tempo: Tempo
  mood: string
  lengthHint: Length
  // 5 — personal
  traits: string[]
  story: string
}

const initial: WizardState = {
  recipient: '',
  includeName: true,
  relationship: '',
  sender: '',
  occasion: '',
  mentionOccasion: true,
  dialect: 'egyptian',
  voiceGender: 'female',
  genre: '',
  tempo: 'medium',
  mood: '',
  lengthHint: 'standard',
  traits: [],
  story: '',
}

const TOTAL_STEPS = 5

// ---- Small presentational helpers -------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="wizard__field-label">{children}</div>
}

/** Single-select chip group over a value union or string list. */
function ChipSelect<T extends string>({
  options,
  labels,
  value,
  onChange,
  groupLabel,
}: {
  options: readonly T[]
  labels?: Record<string, string>
  value: T | ''
  onChange: (v: T) => void
  groupLabel: string
}) {
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
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  )
}

/** Multi-select chip group; toggles membership in an array. */
function ChipMulti({
  options,
  selected,
  onToggle,
  groupLabel,
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (v: string) => void
  groupLabel: string
}) {
  return (
    <div className="chip-group" role="group" aria-label={groupLabel}>
      {options.map((opt) => {
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            className={`chip${active ? ' chip--active' : ''}`}
            onClick={() => onToggle(opt)}
            aria-pressed={active}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

/** Labeled on/off switch. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? ' toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track"><span className="toggle__thumb" /></span>
      <span className="toggle__label">{label}</span>
    </button>
  )
}

/** Optional single-select that can be cleared by re-tapping the active chip. */
function OptionalChips<T extends string>({
  options,
  labels,
  value,
  onChange,
  groupLabel,
}: {
  options: readonly T[]
  labels: Record<string, string>
  value: T | undefined
  onChange: (v: T | undefined) => void
  groupLabel: string
}) {
  return (
    <div className="chip-group" role="group" aria-label={groupLabel}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`chip${value === opt ? ' chip--active' : ''}`}
          onClick={() => onChange(value === opt ? undefined : opt)}
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
  const [suggested, setSuggested] = useState<string[]>([])
  const [suggesting, setSuggesting] = useState(false)

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  function toggleTrait(t: string) {
    setState((s) => ({
      ...s,
      traits: s.traits.includes(t) ? s.traits.filter((x) => x !== t) : [...s.traits, t],
    }))
  }

  async function handleSuggest() {
    setSuggesting(true)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occasion: state.occasion, relationship: state.relationship }),
      })
      if (res.ok) {
        const data = (await res.json()) as { traits?: string[] }
        const fresh = (data.traits ?? []).filter(
          (t) => !TRAITS.includes(t as (typeof TRAITS)[number]) && !suggested.includes(t),
        )
        setSuggested((prev) => [...prev, ...fresh])
      }
    } catch {
      // Suggestion is a nice-to-have; ignore failures silently.
    } finally {
      setSuggesting(false)
    }
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
        mood: state.mood || 'فرِح',
        lengthHint: state.lengthHint,
        tempo: state.tempo,
        dialect: state.dialect,
        genre: state.genre || 'بوب عربي',
        voiceGender: state.voiceGender,
        includeName: state.includeName,
        mentionOccasion: state.mentionOccasion,
        traits: state.traits,
        story: state.story.trim() || undefined,
        recipientGender: state.recipientGender,
        recipientAge: state.recipientAge,
        senderGender: state.senderGender,
        senderAge: state.senderAge,
      }
      let token: string | null = null
      try {
        const auth = getFirebaseAuth()
        token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      } catch {
        // Firebase not available in test environment — proceed without token.
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch('/api/songs', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
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

  // Per-step gate for the "next" button.
  const canNext =
    (step === 1 && state.recipient.trim().length > 0) ||
    (step === 2 && state.relationship.length > 0 && state.sender.trim().length > 0) ||
    (step === 3 && state.occasion.length > 0) ||
    (step === 4 && state.genre.length > 0 && state.mood.length > 0)

  return (
    <div className="wizard">
      <StepDots total={TOTAL_STEPS} current={step} />

      {/* Step 1 — لمن الأغنية؟ */}
      {step === 1 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">لمن هذه الأغنية؟</h2>
          <Field
            id="recipient"
            label="اسم المُهدى إليه"
            placeholder="مثال: أحمد"
            value={state.recipient}
            onChange={(e) => set('recipient', e.target.value)}
          />
          <Toggle
            checked={state.includeName}
            onChange={(v) => set('includeName', v)}
            label="اذكر اسمه في كلمات الأغنية"
          />

          <p className="wizard__hint">نبذة عنه (اختياري) — تساعدنا على ضبط الأغنية ولن تظهر في الكلمات.</p>
          <SectionLabel>الجنس</SectionLabel>
          <OptionalChips
            options={['female', 'male'] as const}
            labels={GENDER_LABELS}
            value={state.recipientGender}
            onChange={(v) => set('recipientGender', v)}
            groupLabel="جنس المُهدى إليه"
          />
          <SectionLabel>الفئة العمرية</SectionLabel>
          <OptionalChips
            options={(['child', 'youth', 'adult', 'senior'] as const)}
            labels={AGE_LABELS}
            value={state.recipientAge}
            onChange={(v) => set('recipientAge', v)}
            groupLabel="عمر المُهدى إليه"
          />

          <div className="wizard__nav">
            <Button variant="primary" size="md" onClick={() => setStep(2)} disabled={!canNext}>
              التالي
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2 — العلاقة */}
      {step === 2 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">ما علاقتك به؟</h2>
          <ChipSelect
            options={RELATIONSHIPS}
            value={state.relationship as (typeof RELATIONSHIPS)[number] | ''}
            onChange={(v) => set('relationship', v)}
            groupLabel="العلاقة"
          />

          <Field
            id="sender"
            label="اسمك (المُرسِل)"
            placeholder="اسمك"
            value={state.sender}
            onChange={(e) => set('sender', e.target.value)}
          />

          <p className="wizard__hint">نبذة عنك (اختياري) — تحدّد منظور الأغنية.</p>
          <SectionLabel>جنسك</SectionLabel>
          <OptionalChips
            options={['female', 'male'] as const}
            labels={GENDER_LABELS}
            value={state.senderGender}
            onChange={(v) => set('senderGender', v)}
            groupLabel="جنس المُرسِل"
          />
          <SectionLabel>فئتك العمرية</SectionLabel>
          <OptionalChips
            options={(['child', 'youth', 'adult', 'senior'] as const)}
            labels={AGE_LABELS}
            value={state.senderAge}
            onChange={(v) => set('senderAge', v)}
            groupLabel="عمر المُرسِل"
          />

          <div className="wizard__nav wizard__nav--between">
            <Button variant="ghost" size="md" onClick={() => setStep(1)}>السابق</Button>
            <Button variant="primary" size="md" onClick={() => setStep(3)} disabled={!canNext}>التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 3 — المناسبة */}
      {step === 3 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">ما المناسبة؟</h2>
          <ChipSelect
            options={OCCASIONS}
            value={state.occasion as (typeof OCCASIONS)[number] | ''}
            onChange={(v) => set('occasion', v)}
            groupLabel="المناسبة"
          />
          <Toggle
            checked={state.mentionOccasion}
            onChange={(v) => set('mentionOccasion', v)}
            label="اذكر المناسبة في كلمات الأغنية"
          />
          <div className="wizard__nav wizard__nav--between">
            <Button variant="ghost" size="md" onClick={() => setStep(2)}>السابق</Button>
            <Button variant="primary" size="md" onClick={() => setStep(4)} disabled={!canNext}>التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 4 — الطابع الموسيقي */}
      {step === 4 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">الطابع الموسيقي</h2>

          <SectionLabel>اللهجة</SectionLabel>
          <ChipSelect options={DIALECTS} labels={DIALECT_LABELS} value={state.dialect} onChange={(v) => set('dialect', v)} groupLabel="اللهجة" />

          <SectionLabel>النوع الموسيقي</SectionLabel>
          <ChipSelect options={GENRES} value={state.genre as (typeof GENRES)[number] | ''} onChange={(v) => set('genre', v)} groupLabel="النوع الموسيقي" />

          <SectionLabel>الأجواء</SectionLabel>
          <ChipSelect options={VIBES} value={state.mood as (typeof VIBES)[number] | ''} onChange={(v) => set('mood', v)} groupLabel="الأجواء" />

          <SectionLabel>جنس الصوت</SectionLabel>
          <ChipSelect options={['female', 'male'] as const} labels={GENDER_LABELS} value={state.voiceGender} onChange={(v) => set('voiceGender', v)} groupLabel="جنس الصوت" />

          <SectionLabel>الإيقاع</SectionLabel>
          <ChipSelect options={['slow', 'medium', 'fast'] as const} labels={TEMPO_LABELS} value={state.tempo} onChange={(v) => set('tempo', v)} groupLabel="الإيقاع" />

          <SectionLabel>طول الأغنية</SectionLabel>
          <ChipSelect options={['standard', 'short'] as const} labels={LENGTH_LABELS} value={state.lengthHint} onChange={(v) => set('lengthHint', v)} groupLabel="طول الأغنية" />

          <div className="wizard__nav wizard__nav--between">
            <Button variant="ghost" size="md" onClick={() => setStep(3)}>السابق</Button>
            <Button variant="primary" size="md" onClick={() => setStep(5)} disabled={!canNext}>التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 5 — لمسة شخصية */}
      {step === 5 && (
        <Card className="wizard__card">
          <h2 className="wizard__step-title">لمسة شخصية</h2>

          <div className="wizard__traits-head">
            <SectionLabel>ما الذي يميّزه؟</SectionLabel>
            <button
              type="button"
              className="suggest-btn"
              onClick={() => void handleSuggest()}
              disabled={suggesting}
              aria-busy={suggesting}
            >
              {suggesting ? '…' : '✨ اقترح لي'}
            </button>
          </div>
          <ChipMulti
            options={[...TRAITS, ...suggested]}
            selected={state.traits}
            onToggle={toggleTrait}
            groupLabel="الصفات"
          />

          <Field
            id="story"
            as="textarea"
            label="قصة أو ذكرى (اختياري)"
            placeholder="أضف قصة أو ذكرى أو تفصيلاً بكلماتك…"
            value={state.story}
            onChange={(e) => set('story', e.target.value)}
            rows={3}
          />

          {error && <p className="wizard__error" role="alert">{error}</p>}

          <div className="wizard__nav wizard__nav--between">
            <Button variant="ghost" size="md" onClick={() => setStep(4)}>السابق</Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => { void handleSubmit() }}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'جاري الإنشاء…' : 'اصنع الأغنية'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
