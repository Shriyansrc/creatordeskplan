/** Scripts must never contain hyphens, en dashes or em dashes (owner rule). */
export function removeScriptDashes(text: string): string {
  return text
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\s+-+\s+/g, ", ")
    .replace(/(\p{L})-(?=\p{L})/gu, "$1 ")
    .replace(/(\d)-(?=\d)/g, "$1 to ")
    .replace(/(^|\n)\s*-\s*/g, "$1")
    .replace(/-/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ,/g, ",");
}

/** Applies removeScriptDashes to every string in a script result except hashtags. */
export function cleanScript(value: unknown, key = ""): unknown {
  if (key === "hashtags") return value;
  if (typeof value === "string") return removeScriptDashes(value);
  if (Array.isArray(value)) return value.map((v) => cleanScript(v, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanScript(v, k)]));
  return value;
}

/** About 2.5 spoken words per second keeps one version within 30 seconds. */
export const MAX_SCRIPT_WORDS = 75;

export const SCRIPT_VOICE_RULES = "VOICE (owner rules, follow all): 1) Write like someone explaining an idea to a real person, with familiar words and natural contractions, never essay language or a sales pitch. 2) Use complete, connected sentences and keep the small words that make speech flow; never break an explanation into fragments to sound punchy. 3) Vary sentence length naturally: give an idea room to make sense, use a shorter sentence only for emphasis, and do not force every sentence onto its own line. 4) Each thought follows logically from the last; use and, but, because and so when they show the connection. 5) Explain the idea instead of just stating it, with the reason, consequence or a relatable example when needed, and never skip an essential step to fit more points. 6) No fancy vocabulary, corporate jargon, generic motivational lines or forced drama; replace phrases like 'unlock your potential' or 'game changer' with the specific thing you mean. 7) NEVER use hyphens, en dashes or em dashes anywhere in the script, title or caption; rewrite with normal words, commas and full stops (write 'follow up' not 'follow-up', 'five to ten' not '5-10'). 8) Follow the selected language naturally; for Hinglish use the Hindi and English mix people actually speak, never literal translation, formal Hindi or switching languages to sound sophisticated. 9) Open with a specific, honest reason to watch, deliver the promised explanation and finish with one relevant next step; never invent facts, results or personal experiences. 10) Before returning, read every line as spoken dialogue and rewrite anything awkward, rushed or repetitive; if it is too long, drop a less useful point rather than cutting necessary words. 11) For video, one version (hook+problem+solution+cta read aloud) must take no more than 30 seconds, about " + MAX_SCRIPT_WORDS + " words at most. Return only the finished script in the requested format.";
