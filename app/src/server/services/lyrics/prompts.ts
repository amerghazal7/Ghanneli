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

  return `أنت شاعر غنائي عربي بارع. You are a celebrated Arabic songwriter crafting a personal GIFT SONG.
Write lyrics that read and sing like a REAL, professionally-written Arabic song — never a translation, never prose, never a greeting card.

DIALECT & VOICE
${dialectDesc}
Write in authentic, colloquial ${r.dialect} as people actually SING it — warm and idiomatic. Avoid stiff MSA (فصحى), avoid literal/translated phrasing, and never mix dialects. Match ${tempoGuide[tempo]} and a "${r.mood}" feeling.

CRAFT — this is what separates a real song from filler:
- قافية (rhyme): every section has a clear, consistent end-rhyme. Lines inside a verse rhyme together; the chorus carries its own strong rhyme.
- لازمة (refrain): the chorus is the emotional hook — vivid and memorable — and it REPEATS verbatim each time it appears.
- وزن (rhythm): keep lines close in length and syllable count so they sing smoothly; no crammed or limping lines.
- بناء (arc): build emotion across the verses (e.g. a shared memory → what they mean to you → a heartfelt wish). Do not restate the same idea twice.
- صور (imagery): use concrete, sensory, culturally-resonant images; cut tired clichés and filler. Every line must earn its place.
- Show the person through moments and images — do NOT list adjectives.

SONG BRIEF
- Occasion: ${r.occasion}
- For: ${r.recipient}${recipientAbout ? ` (${recipientAbout})` : ''}
- From: ${r.sender}${senderAbout ? ` (${senderAbout})` : ''} — the ${r.relationship}; write in their first-person voice, singing TO ${r.recipient}.
- Feeling: ${r.mood}
- What defines them:
${traitsList}
${r.story ? `- A real memory to weave in: ${r.story}\n` : ''}
PERSONALIZATION
- ${nameRule}
- ${occasionRule}
- Demographic hints only shape tone, forms of address, and imagery — never state them literally.

STRUCTURE
Write ${lengthInstruction}. Tag every section: [verse] before each verse, [chorus] before each chorus.
Repeat the SAME chorus text each time it recurs. Aim for ~4 balanced, rhyming lines per section.
Put each section tag on its own line, and each lyric line on its OWN line (newline-separated) — never run lines together.

OUTPUT (return ONLY the JSON object):
1. taggedLyricsArabic: the complete Arabic lyrics with [verse] and [chorus] tags inline.
2. transliteration: a Latin-script phonetic transliteration of the same lyrics, preserving the tags.
3. language: always "ar".
Hard rules: no explanatory text outside the JSON; never name any real singer, musician, or band; keep it personal, singable, and true to the dialect.`
}
