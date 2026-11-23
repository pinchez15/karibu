// The model provider sits behind this interface (spec §8: keep the provider
// abstracted). OpenAI is the platform default (docs/platform-contract.md §6).
import 'server-only'
import OpenAI from 'openai'

export interface VisionImage { mime: string; base64: string }

export interface VisionProvider {
  /** Returns the model's JSON object for a prompt plus images. Throws on failure. */
  extractJson(args: { system: string; user: string; images: VisionImage[] }): Promise<unknown>
}

let client: OpenAI | null = null

export const openAiVision: VisionProvider = {
  async extractJson({ system, user, images }) {
    client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const res = await client.chat.completions.create({
      model: process.env.OPENAI_OFFICE_VISION_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: user },
            ...images.map((img) => ({
              type: 'image_url' as const,
              image_url: { url: `data:${img.mime};base64,${img.base64}`, detail: 'high' as const },
            })),
          ],
        },
      ],
    })
    return JSON.parse(res.choices[0]?.message?.content ?? '{}')
  },
}
