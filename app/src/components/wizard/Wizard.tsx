'use client'

import { useState } from 'react'

const DIALECTS = ['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi'] as const
type Dialect = (typeof DIALECTS)[number]

interface State {
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

const initial: State = {
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

export function Wizard() {
  const [step, setStep] = useState(1)
  const [state, setState] = useState<State>(initial)
  const [submitted, setSubmitted] = useState(false)

  function set<K extends keyof State>(key: K, value: State[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  async function handleSubmit() {
    const body = {
      occasion: state.occasion,
      recipient: state.recipient,
      sender: state.sender,
      relationship: state.relationship,
      details: state.details.split('\n').filter(Boolean),
      mood: state.mood,
      dialect: state.dialect,
      genre: state.genre,
      voiceGender: state.voiceGender,
      lengthHint: state.lengthHint,
    }
    await fetch('/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitted(true)
  }

  if (submitted) {
    return <p>تم إرسال طلبك بنجاح!</p>
  }

  return (
    <div>
      <h1>اصنع أغنيتك</h1>
      {step === 1 && (
        <div>
          <label htmlFor="occasion">المناسبة</label>
          <input
            id="occasion"
            value={state.occasion}
            onChange={(e) => set('occasion', e.target.value)}
          />
          <button onClick={() => setStep(2)}>التالي</button>
        </div>
      )}
      {step === 2 && (
        <div>
          <label htmlFor="recipient">المُهدى إليه</label>
          <input
            id="recipient"
            value={state.recipient}
            onChange={(e) => set('recipient', e.target.value)}
          />
          <label htmlFor="sender">المُرسِل</label>
          <input
            id="sender"
            value={state.sender}
            onChange={(e) => set('sender', e.target.value)}
          />
          <label htmlFor="relationship">العلاقة</label>
          <input
            id="relationship"
            value={state.relationship}
            onChange={(e) => set('relationship', e.target.value)}
          />
          <label htmlFor="details">تفاصيل</label>
          <textarea
            id="details"
            value={state.details}
            onChange={(e) => set('details', e.target.value)}
          />
          <label htmlFor="mood">المزاج</label>
          <input
            id="mood"
            value={state.mood}
            onChange={(e) => set('mood', e.target.value)}
          />
          <button onClick={() => setStep(1)}>السابق</button>
          <button onClick={() => setStep(3)}>التالي</button>
        </div>
      )}
      {step === 3 && (
        <div>
          <label htmlFor="dialect">اللهجة</label>
          <select
            id="dialect"
            value={state.dialect}
            onChange={(e) => set('dialect', e.target.value as Dialect)}
          >
            {DIALECTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <label htmlFor="genre">النوع الموسيقي</label>
          <input
            id="genre"
            value={state.genre}
            onChange={(e) => set('genre', e.target.value)}
          />
          <label htmlFor="voiceGender">جنس الصوت</label>
          <select
            id="voiceGender"
            value={state.voiceGender}
            onChange={(e) => set('voiceGender', e.target.value as 'male' | 'female')}
          >
            <option value="female">أنثى</option>
            <option value="male">ذكر</option>
          </select>
          <label htmlFor="lengthHint">الطول</label>
          <select
            id="lengthHint"
            value={state.lengthHint}
            onChange={(e) => set('lengthHint', e.target.value as 'short' | 'standard')}
          >
            <option value="standard">عادي</option>
            <option value="short">قصير</option>
          </select>
          <button onClick={() => setStep(2)}>السابق</button>
          <button onClick={handleSubmit}>إرسال</button>
        </div>
      )}
    </div>
  )
}
