import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Suggest personality-trait ideas (Arabic) for the wizard's "✨ اقترح لي" button.
// Best-effort: uses Gemini when GEMINI_API_KEY is set, otherwise returns a
// curated static fallback so the button always produces useful chips.

const bodySchema = z.object({
  occasion: z.string().optional(),
  relationship: z.string().optional(),
})

const outputSchema = z.object({
  traits: z.array(z.string()).min(4).max(8),
})

const FALLBACK_TRAITS = [
  'طموح ومثابر',
  'قلبه كبير',
  'دائم الابتسامة',
  'شغوف بالموسيقى',
  'يحب العائلة',
  'مبدع',
]

export async function POST(request: Request): Promise<Response> {
  const json = (await request.json().catch(() => ({}))) as unknown
  const parsed = bodySchema.safeParse(json)
  const { occasion, relationship } = parsed.success ? parsed.data : {}

  const apiKey = process.env['GEMINI_API_KEY']
  if (!apiKey) {
    return NextResponse.json({ traits: FALLBACK_TRAITS })
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey })
    const context = [
      occasion ? `المناسبة: ${occasion}` : null,
      relationship ? `العلاقة: ${relationship}` : null,
    ]
      .filter(Boolean)
      .join('، ')

    const { object } = await generateObject({
      model: google(process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash'),
      schema: outputSchema,
      prompt: `اقترح 6 صفات شخصية قصيرة (كلمتان إلى ثلاث كلمات لكل صفة) باللغة العربية تصف شخصاً تُكتب له أغنية إهداء.
${context ? `السياق: ${context}.` : ''}
اجعلها متنوعة ودافئة وملائمة لأغنية شخصية. أعد فقط قائمة الصفات.`,
    })

    return NextResponse.json({ traits: object.traits })
  } catch {
    return NextResponse.json({ traits: FALLBACK_TRAITS })
  }
}
