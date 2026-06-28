// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Wizard } from '../../src/components/wizard/Wizard'
import { vi, describe, it, expect, beforeEach } from 'vitest'

describe('Wizard flow', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ songId: 'test-id', shareSlug: 'abc123' }),
    })
  })

  it('fills all steps and submits correct payload', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    // Step 1: occasion
    await user.type(screen.getByLabelText(/المناسبة/), 'عيد ميلاد')
    await user.click(screen.getByRole('button', { name: /التالي/ }))

    // Step 2: recipient/sender/relationship/details/mood
    await user.type(screen.getByLabelText(/المُهدى إليه/), 'أحمد')
    await user.type(screen.getByLabelText(/المُرسِل/), 'سارة')
    await user.type(screen.getByLabelText(/العلاقة/), 'صديق')
    await user.type(screen.getByLabelText(/تفاصيل/), 'يحب الموسيقى')
    await user.type(screen.getByLabelText(/المزاج/), 'سعيد')
    await user.click(screen.getByRole('button', { name: /التالي/ }))

    // Step 3: dialect/genre/voiceGender/lengthHint
    await user.type(screen.getByLabelText(/النوع الموسيقي/), 'pop')
    await user.click(screen.getByRole('button', { name: /إرسال/ }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/songs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.occasion).toBeTruthy()
    expect(body.recipient).toBeTruthy()
    expect(body.sender).toBeTruthy()
    expect(body.relationship).toBeTruthy()
    expect(body.details).toBeInstanceOf(Array)
    expect(body.mood).toBeTruthy()
    expect(['short', 'standard']).toContain(body.lengthHint)
    expect(['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi']).toContain(body.dialect)
    expect(body.genre).toBeTruthy()
    expect(['male', 'female']).toContain(body.voiceGender)
  })
})
