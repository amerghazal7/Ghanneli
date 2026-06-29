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

  it('fills all five steps and submits the personalized payload', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    // Step 1 — recipient
    await user.type(screen.getByLabelText(/اسم المُهدى إليه/), 'أحمد')
    await user.click(screen.getByRole('button', { name: /التالي/ }))

    // Step 2 — relationship (chip) + sender
    await user.click(screen.getByRole('button', { name: 'صديق مقرّب' }))
    await user.type(screen.getByLabelText(/اسمك/), 'سارة')
    await user.click(screen.getByRole('button', { name: /التالي/ }))

    // Step 3 — occasion (chip)
    await user.click(screen.getByRole('button', { name: 'عيد ميلاد' }))
    await user.click(screen.getByRole('button', { name: /التالي/ }))

    // Step 4 — genre + vibe (chips)
    await user.click(screen.getByRole('button', { name: 'بوب عربي' }))
    await user.click(screen.getByRole('button', { name: 'فرِح' }))
    await user.click(screen.getByRole('button', { name: /التالي/ }))

    // Step 5 — pick a trait chip, then submit
    await user.click(screen.getByRole('button', { name: 'طموح' }))
    await user.click(screen.getByRole('button', { name: /اصنع الأغنية/ }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/songs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/api/songs',
    )!
    const body = JSON.parse(call[1].body)
    expect(body.recipient).toBe('أحمد')
    expect(body.sender).toBe('سارة')
    expect(body.relationship).toBe('صديق مقرّب')
    expect(body.occasion).toBe('عيد ميلاد')
    expect(body.genre).toBe('بوب عربي')
    expect(body.mood).toBe('فرِح')
    expect(['slow', 'medium', 'fast']).toContain(body.tempo)
    expect(typeof body.includeName).toBe('boolean')
    expect(typeof body.mentionOccasion).toBe('boolean')
    expect(body.traits).toContain('طموح')
    expect(['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi']).toContain(body.dialect)
    expect(['male', 'female']).toContain(body.voiceGender)
  })
})
