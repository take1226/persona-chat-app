export interface PersonaCard {
  style: {
    first_person: string
    calls_user: string
    sentence_endings: string[]
    kanji_ratio: 'low' | 'medium' | 'high'
    emoji_usage: 'none' | 'rare' | 'moderate' | 'heavy'
    frequent_emojis: string[]
    laugh_style: string
    punctuation: string
    msg_length: 'short' | 'medium' | 'long'
  }
  personality: {
    traits: string[]
    values: string[]
    catchphrases: string[]
  }
  topics: {
    likes: string[]
    dislikes: string[]
    proper_nouns: string[]
  }
  behavior: {
    reply_tempo: 'fast' | 'normal' | 'slow'
    burst: boolean
    question_freq: 'low' | 'medium' | 'high'
    backchannel: string[]
  }
  memory: {
    shared_events: string[]
    inside_jokes: string[]
    ongoing: string[]
  }
  ng: {
    never_says: string[]
    sensitive: string[]
  }
  examples: Array<{ user: string; persona: string }>
  meta: {
    source: string
    period: string
    message_count: number
    confidence: number
  }
}

export function emptyCard(): PersonaCard {
  return {
    style: {
      first_person: '私',
      calls_user: 'あなた',
      sentence_endings: [],
      kanji_ratio: 'medium',
      emoji_usage: 'moderate',
      frequent_emojis: [],
      laugh_style: 'w',
      punctuation: 'なし',
      msg_length: 'short',
    },
    personality: { traits: [], values: [], catchphrases: [] },
    topics: { likes: [], dislikes: [], proper_nouns: [] },
    behavior: { reply_tempo: 'normal', burst: false, question_freq: 'medium', backchannel: [] },
    memory: { shared_events: [], inside_jokes: [], ongoing: [] },
    ng: { never_says: [], sensitive: [] },
    examples: [],
    meta: { source: '', period: '', message_count: 0, confidence: 0 },
  }
}

export function validatePersonaCard(obj: unknown): PersonaCard {
  const d = emptyCard()
  if (!obj || typeof obj !== 'object') return d
  const o = obj as Record<string, unknown>

  const s = (o.style as Record<string, unknown>) ?? {}
  const p = (o.personality as Record<string, unknown>) ?? {}
  const t = (o.topics as Record<string, unknown>) ?? {}
  const b = (o.behavior as Record<string, unknown>) ?? {}
  const m = (o.memory as Record<string, unknown>) ?? {}
  const ng = (o.ng as Record<string, unknown>) ?? {}
  const meta = (o.meta as Record<string, unknown>) ?? {}

  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def)
  const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def)
  const num = (v: unknown, def: number): number => (typeof v === 'number' ? v : def)
  const oneOf = <T extends string>(v: unknown, opts: T[], def: T): T =>
    opts.includes(v as T) ? (v as T) : def

  return {
    style: {
      first_person: str(s.first_person, d.style.first_person),
      calls_user: str(s.calls_user, d.style.calls_user),
      sentence_endings: arr(s.sentence_endings),
      kanji_ratio: oneOf(s.kanji_ratio, ['low', 'medium', 'high'], d.style.kanji_ratio),
      emoji_usage: oneOf(s.emoji_usage, ['none', 'rare', 'moderate', 'heavy'], d.style.emoji_usage),
      frequent_emojis: arr(s.frequent_emojis),
      laugh_style: str(s.laugh_style, d.style.laugh_style),
      punctuation: str(s.punctuation, d.style.punctuation),
      msg_length: oneOf(s.msg_length, ['short', 'medium', 'long'], d.style.msg_length),
    },
    personality: {
      traits: arr(p.traits),
      values: arr(p.values),
      catchphrases: arr(p.catchphrases),
    },
    topics: {
      likes: arr(t.likes),
      dislikes: arr(t.dislikes),
      proper_nouns: arr(t.proper_nouns),
    },
    behavior: {
      reply_tempo: oneOf(b.reply_tempo, ['fast', 'normal', 'slow'], d.behavior.reply_tempo),
      burst: bool(b.burst, d.behavior.burst),
      question_freq: oneOf(b.question_freq, ['low', 'medium', 'high'], d.behavior.question_freq),
      backchannel: arr(b.backchannel),
    },
    memory: {
      shared_events: arr(m.shared_events),
      inside_jokes: arr(m.inside_jokes),
      ongoing: arr(m.ongoing),
    },
    ng: {
      never_says: arr(ng.never_says),
      sensitive: arr(ng.sensitive),
    },
    examples: Array.isArray(o.examples)
      ? o.examples.filter(
          (e): e is { user: string; persona: string } =>
            !!e &&
            typeof e === 'object' &&
            typeof (e as Record<string, unknown>).user === 'string' &&
            typeof (e as Record<string, unknown>).persona === 'string',
        )
      : [],
    meta: {
      source: str(meta.source, ''),
      period: str(meta.period, ''),
      message_count: num(meta.message_count, 0),
      confidence: num(meta.confidence, 0),
    },
  }
}
