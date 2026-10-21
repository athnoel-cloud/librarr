// French rendering of the English reasons the server writes into
// last_result, wanted outcomes, decisions and import_detail (scheduler.go,
// quality.go, watcher.go). Only recognisable shapes are translated; anything
// else comes back untouched so a new server message is never hidden, and the
// other locales always get the raw text. Profile names are shown as sent.
import type { Locale } from "./i18n";

type Rule = [RegExp, (groups: string[]) => string];

const group = (m: RegExpMatchArray) => m.slice(1).map((g) => g ?? "");

const french: Rule[] = [
  [/^no results$/, () => "aucun résultat"],
  [/^search is not available$/, () => "recherche indisponible"],
  [/^wrong volume$/, () => "mauvais tome"],
  [/^below minimum score$/, () => "sous le score minimal"],
  [/^highest ranked format$/, () => "format le mieux classé"],
  [/^best acceptable release$/, () => "meilleure release acceptable"],
  [
    /^no format detected on the release$/,
    () => "aucun format détecté sur la release",
  ],
  [
    /^(\d+) results, none acceptable$/,
    ([n]) => `${n} résultats, aucun acceptable`,
  ],
  [
    /^(\d+) results, none acceptable: ([^]+)$/,
    ([n, why]) => `${n} résultats, aucune version acceptable : ${fr(why!)}`,
  ],
  [
    /^none acceptable: ([^]+)$/,
    ([why]) => `aucune version acceptable : ${fr(why!)}`,
  ],
  [
    /^(\S+) is not allowed by profile "(.+)"$/,
    ([format, profile]) => `${format} refusé par le profil « ${profile} »`,
  ],
  [
    /^already have (\S+) and profile "(.+)" does not upgrade$/,
    ([format, profile]) =>
      `${format} déjà présent et le profil « ${profile} » ne remplace pas`,
  ],
  [
    /^cutoff met: (\S+) satisfies profile "(.+)"$/,
    ([format, profile]) =>
      `seuil atteint : ${format} satisfait le profil « ${profile} »`,
  ],
  [/^cutoff met \((.+)\)$/, ([format]) => `seuil atteint (${format})`],
  [/^upgrade (\S+) → (\S+)$/, ([from, to]) => `remplacement ${from} → ${to}`],
  [
    /^(\S+) is not an upgrade over (\S+)$/,
    ([cand, cur]) => `${cand} n'améliore pas ${cur}`,
  ],
  [
    /^grabbed (\S+) from ([^]+)$/,
    ([format, source]) => `récupéré ${format} depuis ${source}`,
  ],
  [/^grabbed ([^]+)$/, ([why]) => `récupéré : ${fr(why!)}`],
  [/^grab failed: ([^]+)$/, ([why]) => `échec de la récupération : ${why}`],
  [
    /^delivered (\S+): ([^]+)$/,
    ([format, why]) => `livré ${format} : ${fr(why!)}`,
  ],
  [
    /^language (\S+) \(preferred: (.+)\)$/,
    ([code, preferred]) => `langue ${code} (préférée : ${preferred})`,
  ],
  [
    /^download folder not visible to librarr: ([^]+)$/,
    ([path]) => `dossier de téléchargement invisible pour Librarr : ${path}`,
  ],
];

function fr(text: string): string {
  for (const [pattern, render] of french) {
    const m = text.match(pattern);
    if (m) return render(group(m));
  }
  return text;
}

/** The reason in the user's language when its shape is known, else as-is. */
export function translateReason(locale: Locale, text?: string): string {
  if (!text) return "";
  return locale === "fr" ? fr(text.trim()) : text;
}
