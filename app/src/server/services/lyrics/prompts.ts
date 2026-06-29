import type { LyricsRequest } from './types'
import type { AgeBand, Dialect, Tempo } from '../music/types'

const lengthGuide = { short: '2 verses and 1 chorus', standard: '3 verses and 2 choruses' }

const tempoGuide: Record<Tempo, string> = {
  slow: 'a slow, tender pace',
  medium: 'a moderate, steady pace',
  fast: 'an upbeat, energetic pace',
}

const ageDescriptions: Record<AgeBand, string> = {
  child: 'a young child',
  youth: 'a young person (teens to twenties)',
  adult: 'an adult',
  senior: 'an older person',
}

const dialectDescriptions: Record<Dialect, string> = {
  khaleeji: `Gulf Arabic dialect. Use characteristic Gulf phonology, vocabulary, and poetic style.
Favour a melodic, flowing cadence typical of the Gulf musical tradition.
Incorporate rhythmic patterns and expressive forms associated with the Gulf region's rich oral poetry heritage.`,

  egyptian: `Egyptian Arabic dialect. Use the warmth and expressiveness characteristic of Egyptian colloquial Arabic.
Draw on the energetic, emotionally resonant style of Egyptian popular music.
Employ the accessible vocabulary and natural flow that makes Egyptian dialect widely understood across the Arabic-speaking world.`,

  levantine: `Levantine Arabic dialect (Syrian, Lebanese, Palestinian, or Jordanian registers).
Use the soft consonants, lilting rhythm, and poetic vocabulary characteristic of the Levant.
Favour imagery rooted in Mediterranean landscapes—cedar, jasmine, sea breeze—and the heartfelt lyrical tradition of Levantine song.`,

  maghrebi: `Maghrebi Arabic dialect (Darija — the colloquial Arabic of Morocco, Algeria, and Tunisia).
Blend Arabic roots with the distinctive Maghrebi phonology and vocabulary, including Berber and French loanwords where they feel natural.
Use the passionate, percussive rhythmic character and imagery of North African musical tradition.`,

  iraqi: `Iraqi Arabic dialect (Baghdadi or Southern Iraqi register).
Use the deep, resonant tones and distinctive Iraqi phonology—qaf, emphatic consonants, unique vocabulary.
Draw on the rich tradition of Iraqi maqam poetry and the expressive warmth of the Iraqi musical heritage.`,
}

export function buildPrompt(r: LyricsRequest): string {
  // Safe defaults so older callers/tests that omit the new fields still work.
  const includeName = r.includeName ?? true
  const mentionOccasion = r.mentionOccasion ?? true
  const traits = r.traits ?? []
  const tempo: Tempo = r.tempo ?? 'medium'

  const lengthInstruction = lengthGuide[r.lengthHint]
  const dialectDesc = dialectDescriptions[r.dialect]
  const traitsList = traits.length > 0 ? traits.map(t => `- ${t}`).join('\n') : '- (none provided)'

  const recipientAbout = [
    r.recipientGender ? `gender: ${r.recipientGender}` : null,
    r.recipientAge ? `age: ${ageDescriptions[r.recipientAge]}` : null,
  ].filter(Boolean).join(', ')
  const senderAbout = [
    r.senderGender ? `gender: ${r.senderGender}` : null,
    r.senderAge ? `age: ${ageDescriptions[r.senderAge]}` : null,
  ].filter(Boolean).join(', ')

  const nameRule = includeName
    ? `Weave the recipient's name ("${r.recipient}") naturally into the lyrics.`
    : `Do NOT state the recipient's literal name; address them warmly through the relationship and their qualities.`
  const occasionRule = mentionOccasion
    ? `Name or clearly evoke the occasion ("${r.occasion}") within the lyrics.`
    : `Let the occasion ("${r.occasion}") set the theme, but do NOT name it explicitly.`

  return `You are a gifted Arabic lyricist. Write original gift-song lyrics in Arabic for a personal celebration.

DIALECT & STYLE
${dialectDesc}
Match ${tempoGuide[tempo]} and a "${r.mood}" emotional atmosphere.

SONG CONTEXT
- Occasion: ${r.occasion}
- Recipient: ${r.recipient}${recipientAbout ? ` (${recipientAbout})` : ''}
- Written by: ${r.sender}${senderAbout ? ` (${senderAbout})` : ''}
- Perspective: the sender is the recipient's ${r.relationship}; write in the sender's first-person voice.
- Vibe / mood: ${r.mood}
- Qualities that define the recipient:
${traitsList}
${r.story ? `- In the sender's own words: ${r.story}\n` : ''}
PERSONALIZATION RULES
- ${nameRule}
- ${occasionRule}
- Use any demographic hints only to shape tone, forms of address, and imagery — never quote them literally.

STRUCTURE
Write ${lengthInstruction}. Use these section tags exactly:
[verse] — placed before each verse
[chorus] — placed before each chorus

OUTPUT RULES
1. taggedLyricsArabic: the complete lyrics in Arabic script, with [verse] and [chorus] tags inline.
2. transliteration: a romanised (Latin-script) phonetic transliteration of the same lyrics, preserving the section tags.
3. language: always the string "ar".
4. Do NOT include any explanatory text outside the JSON — return only the structured object.
5. Do NOT reference any real singer, musician, or band by name anywhere in the lyrics or transliteration.
6. Keep the lyrics personal, warm, and authentic to the dialect.`
}
