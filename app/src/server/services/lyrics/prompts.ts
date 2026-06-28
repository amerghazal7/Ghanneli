import type { LyricsRequest } from './types'
import type { Dialect } from '../music/types'

const lengthGuide = { short: '2 verses and 1 chorus', standard: '3 verses and 2 choruses' }

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
  const detailsList = r.details.length > 0 ? r.details.map(d => `- ${d}`).join('\n') : '- (no additional details)'
  const lengthInstruction = lengthGuide[r.lengthHint]
  const dialectDesc = dialectDescriptions[r.dialect]

  return `You are a gifted Arabic lyricist. Write original gift-song lyrics in Arabic for a personal celebration.

DIALECT & STYLE
${dialectDesc}

SONG CONTEXT
- Occasion: ${r.occasion}
- Recipient name: ${r.recipient}
- Sender name: ${r.sender}
- Relationship: ${r.relationship} (the sender's relationship to the recipient)
- Mood: ${r.mood}
- Personal details about the recipient:
${detailsList}

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
