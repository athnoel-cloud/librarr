// Language detection from a release name. Pure, no dependency.
// Whole-token match only (never a substring: "Frank" or "from" must not become
// French). Returns undefined when nothing is recognised: the UI then shows no
// badge rather than a guess — a C411 release without a tag is not "EN".

export type LangCode = "fr" | "multi" | "en" | "de" | "es" | "it" | "ru" | "ja";

export interface DetectedLang {
  code: LangCode;
  /** The token (or ISO code) that decided it, for the badge tooltip. */
  evidence: string;
  source: "api" | "title";
}

const TOKENS: Record<LangCode, readonly string[]> = {
  fr: ["FRENCH", "TRUEFRENCH", "VFF", "VFQ", "VF", "VF2", "FR", "FRA", "FRE"],
  multi: ["MULTI", "MULTI3", "MULTI4"],
  // VOSTFR = original audio with French subtitles: for a book, treat as English.
  en: ["ENGLISH", "ENG", "VO", "VOSTFR"],
  de: ["GERMAN", "DE", "GER"],
  es: ["SPANISH", "ES", "SPA"],
  it: ["ITALIAN", "ITA"],
  ru: ["RUSSIAN", "RUS"],
  ja: ["JAPANESE", "JAP", "JPN"],
};

// ISO 639-1/639-2 codes as the API reports them (Anna's Archive, Gutenberg).
const ISO: Record<string, LangCode> = {
  fr: "fr",
  fre: "fr",
  fra: "fr",
  en: "en",
  eng: "en",
  de: "de",
  ger: "de",
  deu: "de",
  es: "es",
  spa: "es",
  it: "it",
  ita: "it",
  ru: "ru",
  rus: "ru",
  ja: "ja",
  jpn: "ja",
};

// MULTi is scanned first so a "MULTi FRENCH" name is not reported as FR only.
const ORDER: readonly LangCode[] = [
  "multi",
  "fr",
  "en",
  "de",
  "es",
  "it",
  "ru",
  "ja",
];

const SPLIT = /[.\s_\-[\]()]+/;

/** Priority: ISO language from the API > whole tokens of the title > nothing. */
export function detectLang(
  title: string,
  apiLanguage?: string,
): DetectedLang | undefined {
  const iso = apiLanguage?.trim().toLowerCase();
  if (iso) {
    const code = ISO[iso];
    if (code) return { code, evidence: iso, source: "api" };
  }
  const tokens = (title || "").toUpperCase().split(SPLIT).filter(Boolean);
  for (const code of ORDER)
    for (const token of tokens)
      if (TOKENS[code].includes(token))
        return { code, evidence: token, source: "title" };
  return undefined;
}

export const LANG_LABEL: Record<LangCode, string> = {
  fr: "FR",
  multi: "MULTi",
  en: "EN",
  de: "DE",
  es: "ES",
  it: "IT",
  ru: "RU",
  ja: "JA",
};

/** Badge label for a language code coming either from detection or a filter. */
export function langLabel(code: string): string {
  return (LANG_LABEL as Record<string, string>)[code] ?? code.toUpperCase();
}
