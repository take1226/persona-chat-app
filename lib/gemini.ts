import { GoogleGenAI } from '@google/genai'

let _ai: GoogleGenAI | null = null

export function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  }
  return _ai
}

export const MODEL = 'gemini-2.0-flash'
export const VISION_MODEL = 'gemini-2.0-flash'
