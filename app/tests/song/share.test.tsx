// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SharePageContent } from '../../src/app/song/[slug]/share-content'

describe('SharePageContent', () => {
  it('renders preview player and CTA for a ready song', () => {
    render(
      <SharePageContent
        status="ready"
        previewUri="https://cdn.example.com/preview.mp3"
      />,
    )

    // Preview audio element should be present
    const audio = document.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio!.src).toContain('preview.mp3')

    // CTA link to /create
    const cta = screen.getByRole('link', { name: /اصنع أغنيتك/i })
    expect(cta).toBeDefined()
    expect(cta.getAttribute('href')).toBe('/create')
  })

  it('does NOT render full audio or download link for a ready song', () => {
    render(
      <SharePageContent
        status="ready"
        previewUri="https://cdn.example.com/preview.mp3"
        fullUri="https://cdn.example.com/full.mp3"
      />,
    )

    // Full URI must not appear in DOM
    const html = document.body.innerHTML
    expect(html).not.toContain('full.mp3')

    // No <a download> element
    const downloadLinks = document.querySelectorAll('[download]')
    expect(downloadLinks).toHaveLength(0)
  })

  it('renders pending state when song is not ready', () => {
    render(<SharePageContent status="generating" />)

    // No audio player
    const audio = document.querySelector('audio')
    expect(audio).toBeNull()

    // Shows processing message
    expect(screen.getByText(/جاري/i)).toBeDefined()
  })

  it('renders failed state gracefully', () => {
    render(<SharePageContent status="failed" />)
    const audio = document.querySelector('audio')
    expect(audio).toBeNull()
  })
})
