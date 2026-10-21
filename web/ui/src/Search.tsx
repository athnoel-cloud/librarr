import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  api,
  request,
  type DownloadJob,
  type SearchResult,
  type MediaType,
} from "./api";
import { useTranslation, type TranslationKey } from "./i18n";
import { detectLang, langLabel, type DetectedLang } from "./lang";
import {
  Badge,
  Button,
  DetailPanel,
  EmptyState,
  ListRow,
  Menu,
  Score,
  Toolbar,
  type MenuItem,
} from "./ui";
type Sort = "relevance" | "seeders" | "size";
type View = "list" | "cards";
interface Filters {
  lang: string;
  format: string;
  indexer: string;
  hideOwned: boolean;
}
interface Outcome {
  state: "loading" | "success" | "error";
  detail?: string;
  jobId?: string;
  manualURL?: string;
}
interface DownloadResult {
  success?: boolean;
  job_id?: string;
  error?: string;
  in_library?: boolean;
  library_title?: string;
  library_item_id?: number;
}
export interface SearchIntent {
  query: string;
  media: MediaType;
  sequence: number;
}
const endpoints: Record<MediaType, string> = {
  ebook: "/api/search",
  audiobook: "/api/search/audiobooks",
  manga: "/api/search/manga",
};
// View and filters survive a reload, like librarr_lang.
const VIEW_KEY = "librarr_view";
const FILTERS_KEY = "librarr_search_filters";
const defaultFilters: Filters = {
  lang: "",
  format: "",
  indexer: "",
  hideOwned: false,
};
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}
function readFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return defaultFilters;
    const parsed = JSON.parse(raw) as Partial<Filters>;
    return {
      lang: typeof parsed.lang === "string" ? parsed.lang : "",
      format: typeof parsed.format === "string" ? parsed.format : "",
      indexer: typeof parsed.indexer === "string" ? parsed.indexer : "",
      hideOwned: parsed.hideOwned === true,
    };
  } catch {
    return defaultFilters;
  }
}
function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private mode: the choice simply does not survive a reload. */
  }
}
function keyOf(result: SearchResult) {
  return [
    result.source,
    result.download_url,
    result.url,
    result.abb_url,
    result.info_hash,
    result.magnet_url,
    result.magnet,
    result.md5,
    result.source_id,
    result.title,
    result.author,
  ].join("|");
}
function size(value?: number | string) {
  if (typeof value === "number") return value;
  const match = value?.toUpperCase().match(/([\d.]+)\s*(GB|MB|KB|B)?/);
  return match
    ? Number(match[1]) *
        ({ B: 1, KB: 1024, MB: 1048576, GB: 1073741824 }[match[2] as "B"] || 1)
    : 0;
}
function formatSize(value?: number | string) {
  if (typeof value === "string") return value;
  if (!value) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = value,
    i = 0;
  while (n >= 1024 && i < 3) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
const isHttp = (value?: string) => !!value && /^https?:\/\//.test(value);
const formatOf = (result: SearchResult) => (result.format || "").toLowerCase();
const indexerOf = (result: SearchResult) =>
  result.indexer || result.source || "";
const sizeText = (result: SearchResult) =>
  formatSize(result.size) || result.size_human || result.sizeHuman || "";
type Translate = ReturnType<typeof useTranslation>["t"];
function confidenceKey(value?: string): TranslationKey | undefined {
  return value === "high"
    ? "confidence_high"
    : value === "medium"
      ? "confidence_medium"
      : value === "low"
        ? "confidence_low"
        : undefined;
}
function scoreTitle(result: SearchResult, t: Translate) {
  if (result.score === undefined) return t("score_unknown");
  const confidence = confidenceKey(result.score_breakdown?.confidence);
  return (
    t("score_of_100", { score: Math.round(result.score) }) +
    (confidence
      ? ` · ${t("confidence_label", { level: t(confidence) })}`
      : "")
  );
}
function Cover({ result }: { result: SearchResult }) {
  const [failed, setFailed] = useState(false);
  return result.cover_url && !failed ? (
    <img
      src={result.cover_url}
      className="w-full h-32 object-cover"
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`cover-placeholder w-full ${result.cover_url ? "h-32" : "h-20"} bg-gradient-to-br from-indigo-600 to-purple-700`}
    >
      {result.title.charAt(0).toUpperCase()}
    </div>
  );
}
// 48×64 thumbnail for the list view, rendered only when the source gives a
// cover: a row without one keeps the score in its first column, no blank.
// On error it falls back to the same coloured initial as the cards.
function Thumb({ result }: { result: SearchResult }) {
  const [failed, setFailed] = useState(false);
  const box = "h-16 w-12 shrink-0 rounded";
  return !failed ? (
    <img
      src={result.cover_url}
      className={`${box} object-cover bg-slate-800`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      aria-hidden="true"
      className={`${box} bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-base font-bold text-white/70`}
    >
      {result.title.charAt(0).toUpperCase()}
    </div>
  );
}
// Items separated by " · ", skipping the empty ones.
function Dots({ items }: { items: ReactNode[] }) {
  const shown = items.filter(
    (item) =>
      typeof item !== "boolean" && item != null && item !== "" && item !== 0,
  );
  return (
    <>
      {shown.map((item, index) => (
        <span key={index} className="inline-flex items-center gap-1.5 min-w-0">
          {index > 0 && (
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
          )}
          {item}
        </span>
      ))}
    </>
  );
}
function LangBadge({
  lang,
  className = "",
}: {
  lang: DetectedLang;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      tone={
        lang.code === "fr"
          ? "lang"
          : lang.code === "multi"
            ? "multi"
            : lang.code === "en"
              ? "neutral"
              : "info"
      }
      className={className}
      title={
        lang.source === "api"
          ? t("lang_from_source", { code: lang.evidence })
          : t("lang_detected", { token: lang.evidence })
      }
    >
      {langLabel(lang.code)}
    </Badge>
  );
}
// Fixed order: author · badges · indexer · size · peers · year · publisher · copies.
function Meta({ result, lang }: { result: SearchResult; lang?: DetectedLang }) {
  const { t } = useTranslation();
  const text = sizeText(result);
  return (
    <p className="text-sm text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Dots
        items={[
          result.author && (
            <span className="text-slate-300 [overflow-wrap:anywhere]">
              {result.author}
            </span>
          ),
          (lang || result.format || result.download_protocol) && (
            <span className="inline-flex flex-wrap gap-1">
              {lang && <LangBadge lang={lang} className="result-language" />}
              {result.format && (
                <Badge tone="format">{result.format.toUpperCase()}</Badge>
              )}
              {result.download_protocol && (
                <Badge>{result.download_protocol}</Badge>
              )}
            </span>
          ),
          result.indexer && <span>{result.indexer}</span>,
          text && <span className="whitespace-nowrap">{text}</span>,
          (!!result.seeders || !!result.leechers) && (
            <span className="tabular-nums whitespace-nowrap">
              {!!result.seeders && (
                <span title={t("n_seeds", { n: result.seeders })}>
                  ↑{result.seeders}
                </span>
              )}
              {!!result.seeders && !!result.leechers && " "}
              {!!result.leechers && (
                <span title={t("n_leech", { n: result.leechers })}>
                  ↓{result.leechers}
                </span>
              )}
            </span>
          ),
          result.year && <span className="result-year">{result.year}</span>,
          result.publisher && (
            <span
              className="result-publisher truncate max-w-[12rem]"
              title={result.publisher}
            >
              {result.publisher}
            </span>
          ),
          (result.copies || 0) > 1 && (
            <span
              className="result-copies"
              title={t("n_copies_title", { n: result.copies! })}
            >
              {t("n_copies", { n: result.copies! })}
            </span>
          ),
        ]}
      />
    </p>
  );
}
// One state machine for the list, the cards and the detail drawer.
function DownloadButton({
  result,
  index,
  outcome,
  onClick,
  action = "startDownload",
  className = "",
}: {
  result: SearchResult;
  index?: number;
  outcome?: Outcome;
  onClick: () => void;
  action?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const state = outcome?.state;
  const colour =
    state === "error"
      ? "bg-red-700 hover:bg-red-800"
      : state === "success"
        ? "bg-emerald-700"
        : result.in_library
          ? "bg-amber-700 hover:bg-amber-800"
          : "bg-indigo-600 hover:bg-indigo-700";
  return (
    <button
      type="button"
      data-action={action}
      data-idx={index}
      className={`rounded-lg px-3 py-2 text-sm font-medium text-white min-h-[2.25rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:opacity-70 ${colour} ${className}`}
      disabled={state === "loading" || state === "success"}
      aria-busy={state === "loading"}
      onClick={onClick}
    >
      {state === "loading"
        ? outcome?.detail || t("loading")
        : state === "success"
          ? t("download_added")
          : state === "error"
            ? t("download_failed_state")
            : result.in_library
              ? t("download_anyway")
              : t("download")}
    </button>
  );
}
function OutcomeError({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-red-300 [overflow-wrap:anywhere]">
      {outcome.detail}
      {outcome.manualURL && isHttp(outcome.manualURL) && (
        <a
          className="block underline"
          href={outcome.manualURL}
          target="_blank"
          rel="noreferrer"
        >
          {t("download_failed_anna_no_match_action")}
        </a>
      )}
    </p>
  );
}
function InLibrary({
  result,
  className = "",
}: {
  result: SearchResult;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={`result-in-library inline-flex items-center rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-medium text-white whitespace-nowrap ${className}`}
      title={t("in_library_title", {
        title: result.library_title || result.title,
      })}
    >
      {t("in_library")}
    </span>
  );
}
interface RowProps {
  result: SearchResult;
  index: number;
  outcome?: Outcome;
  lang?: DetectedLang;
  blocked: boolean;
  admin: boolean;
  onDownload: () => void;
  onDetails: () => void;
  onCopy: () => void;
  onBlock: () => void;
}
function releaseMenu(p: RowProps, t: Translate): MenuItem[] {
  const items: MenuItem[] = [
    { key: "details", label: t("details"), onSelect: p.onDetails },
  ];
  if (isHttp(p.result.url))
    items.push({
      key: "source",
      label: t("open_source_page"),
      href: p.result.url,
    });
  items.push({ key: "copy", label: t("copy_name"), onSelect: p.onCopy });
  if (p.admin && (p.result.download_url || p.result.info_hash))
    items.push({
      key: "block",
      label: t("block_release"),
      onSelect: p.onBlock,
      danger: true,
      disabled: p.blocked,
    });
  return items;
}
// The whole release name is the information (language, format, group live in
// it), so it wraps as far as it must: no clamp, no fixed height, dotted names
// break anywhere. style.css repeats the rule by id in case the runtime
// Tailwind skips an arbitrary property.
const titleButton =
  "block w-full text-left min-h-0 rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 whitespace-normal break-words [overflow-wrap:anywhere]";
function ResultRow(p: RowProps) {
  const { t } = useTranslation();
  const { result } = p;
  const confidence = confidenceKey(result.score_breakdown?.confidence);
  const score = (
    <Score
      value={result.score}
      label={confidence ? t(confidence) : undefined}
      title={scoreTitle(result, t)}
    />
  );
  return (
    <ListRow
      className={`book-card result-row cursor-pointer hover:border-slate-600 ${p.blocked ? "opacity-60" : ""}`}
      onClick={(e: MouseEvent<HTMLElement>) => {
        if (
          (e.target as HTMLElement).closest(
            "button, a, select, input, label, [role='menu']",
          )
        )
          return;
        p.onDetails();
      }}
      leading={
        result.cover_url ? (
          <div className="flex items-start gap-2">
            <Thumb result={result} />
            {score}
          </div>
        ) : (
          score
        )
      }
      actions={
        <>
          <DownloadButton
            result={result}
            index={p.index}
            outcome={p.outcome}
            onClick={p.onDownload}
            className="flex-1 sm:flex-none"
          />
          <Menu
            label={t("more_actions")}
            items={releaseMenu(p, t)}
            size="sm"
            data-action="resultMenu"
          />
        </>
      }
      footer={
        p.outcome?.state === "error" ? (
          <OutcomeError outcome={p.outcome} />
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3
          title={result.title}
          className="text-sm font-medium text-slate-100 min-w-0 [overflow-wrap:anywhere]"
        >
          <button
            type="button"
            data-action="showResultDetails"
            className={titleButton}
            onClick={p.onDetails}
          >
            {result.title}
          </button>
        </h3>
        {result.in_library && <InLibrary result={result} />}
        {p.blocked && <Badge tone="danger">{t("blocked")}</Badge>}
      </div>
      <Meta result={result} lang={p.lang} />
    </ListRow>
  );
}
function ResultCard(p: RowProps) {
  const { t } = useTranslation();
  const { result } = p;
  const confidence = confidenceKey(result.score_breakdown?.confidence);
  return (
    <article
      className={`book-card bg-slate-900 border border-slate-700 rounded-xl flex flex-col ${p.blocked ? "opacity-60" : ""}`}
    >
      {/* Only the cover clips: the card itself grows with its title and lets the ⋯ menu overhang. */}
      <div className="relative overflow-hidden rounded-t-xl">
        <Cover result={result} />
        <span className="absolute top-2 left-2 bg-slate-800 text-white text-xs px-2 py-1 rounded">
          {result.source}
        </span>
        {result.in_library && (
          <InLibrary result={result} className="absolute top-2 right-2" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <h3
            title={result.title}
            className="text-sm font-medium text-slate-100 flex-1 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]"
          >
            <button
              type="button"
              data-action="showResultDetails"
              className={titleButton}
              onClick={p.onDetails}
            >
              {result.title}
            </button>
          </h3>
          <Score
            value={result.score}
            label={confidence ? t(confidence) : undefined}
            title={scoreTitle(result, t)}
          />
        </div>
        {p.blocked && (
          <Badge tone="danger" className="self-start">
            {t("blocked")}
          </Badge>
        )}
        <div className="mt-auto">
          <Meta result={result} lang={p.lang} />
        </div>
        <div className="flex gap-2">
          <DownloadButton
            result={result}
            index={p.index}
            outcome={p.outcome}
            onClick={p.onDownload}
            className="flex-1"
          />
          <Menu
            label={t("more_actions")}
            items={releaseMenu(p, t)}
            data-action="resultMenu"
          />
        </div>
        {p.outcome?.state === "error" && <OutcomeError outcome={p.outcome} />}
      </div>
    </article>
  );
}
const linkButton =
  "inline-flex items-center justify-center rounded-lg min-h-[2.5rem] px-4 py-2 text-sm font-medium bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400";
function ResultDetail({
  result,
  lang,
  outcome,
  blocked,
  admin,
  onClose,
  onDownload,
  onCopy,
  onBlock,
}: {
  result: SearchResult;
  lang?: DetectedLang;
  outcome?: Outcome;
  blocked: boolean;
  admin: boolean;
  onClose: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onBlock: () => void;
}) {
  const { t } = useTranslation();
  const breakdown = result.score_breakdown;
  const confidence = confidenceKey(breakdown?.confidence);
  const rows: [string, ReactNode][] = [
    [t("d_indexer"), result.indexer || result.source],
    [t("d_size"), sizeText(result) || "—"],
    [
      t("d_peers"),
      result.seeders || result.leechers
        ? t("d_seeders_leechers", {
            s: result.seeders || 0,
            l: result.leechers || 0,
          })
        : "—",
    ],
    [t("d_year"), result.year || "—"],
    [t("d_publisher"), result.publisher || "—"],
    [
      t("d_library"),
      result.in_library
        ? t("in_library_title", {
            title: result.library_title || result.title,
          })
        : t("not_in_library"),
    ],
    [
      t("d_copies"),
      (result.copies || 0) > 1
        ? t("n_copies_title", { n: result.copies! })
        : "—",
    ],
    [
      t("d_hash"),
      result.info_hash || result.md5 ? (
        <span className="font-mono text-xs">
          {result.info_hash || result.md5}
        </span>
      ) : (
        "—"
      ),
    ],
    [t("d_source"), result.source],
    [t("d_protocol"), result.download_protocol || "—"],
  ];
  return (
    <DetailPanel
      title={t("release_details")}
      closeLabel={t("close")}
      onClose={onClose}
      footer={
        <>
          <DownloadButton
            result={result}
            outcome={outcome}
            onClick={onDownload}
            action="detailDownload"
            className="min-h-[2.5rem] px-4"
          />
          {isHttp(result.url) && (
            <a
              className={linkButton}
              href={result.url}
              target="_blank"
              rel="noreferrer"
            >
              {t("open_source_page")}
            </a>
          )}
          {admin && (result.download_url || result.info_hash) && (
            <Button variant="danger" onClick={onBlock} disabled={blocked}>
              {t("block_release")}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-2">
        <p
          className="font-mono text-xs text-slate-100 break-all select-all"
          data-release-name
        >
          {result.title}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onCopy}>
            {t("copy_name")}
          </Button>
          {result.in_library && <Badge tone="ok">{t("in_library")}</Badge>}
          {blocked && <Badge tone="danger">{t("blocked")}</Badge>}
        </div>
        {result.author && (
          <p className="text-sm text-slate-300">{result.author}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {lang && <LangBadge lang={lang} />}
          {lang && (
            <span className="text-xs text-slate-400">
              {lang.source === "api"
                ? t("lang_from_source", { code: lang.evidence })
                : t("lang_detected", { token: lang.evidence })}
            </span>
          )}
          {result.format && (
            <Badge tone="format">{result.format.toUpperCase()}</Badge>
          )}
          {result.download_protocol && <Badge>{result.download_protocol}</Badge>}
        </div>
      </div>
      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-1">
        <p className="text-sm font-medium text-slate-100">
          {result.score === undefined
            ? t("score_unknown")
            : t("score_of_100", { score: Math.round(result.score) })}
          {confidence && (
            <span className="font-normal text-slate-400">
              {" "}
              · {t("confidence_label", { level: t(confidence) })}
            </span>
          )}
        </p>
        {breakdown && (
          <p className="text-sm text-slate-400 flex flex-wrap gap-x-1.5 gap-y-1">
            <Dots
              items={[
                `${t("score_title")} ${Math.round(breakdown.title_match)}`,
                `${t("score_author")} ${Math.round(breakdown.author_match)}`,
                `${t("score_format")} ${Math.round(breakdown.format_score)}`,
                `${t("score_seeders")} ${Math.round(breakdown.seeder_score)}`,
                `${t("score_size")} ${Math.round(breakdown.size_score)}`,
              ]}
            />
          </p>
        )}
      </section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className="text-slate-100 min-w-0 [overflow-wrap:anywhere]">
              {value}
            </dd>
          </Fragment>
        ))}
      </dl>
    </DetailPanel>
  );
}
function FilterSelect({
  id,
  label,
  all,
  value,
  options,
  render = (option) => option,
  onChange,
}: {
  id: string;
  label: string;
  all: string;
  value: string;
  options: Map<string, number>;
  render?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  if (!options.size && !value) return null;
  const entries = [...options.entries()];
  // A persisted choice absent from this answer stays visible, with its zero.
  if (value && !options.has(value)) entries.push([value, 0]);
  return (
    <select
      id={id}
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-100 min-h-[2.25rem] max-w-[11rem]"
    >
      <option value="">{all}</option>
      {entries.map(([option, n]) => (
        <option key={option} value={option}>
          {render(option)} ({n})
        </option>
      ))}
    </select>
  );
}
const chip =
  "px-3 py-1.5 rounded-lg text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400";
const chipOn = "bg-indigo-600 text-white";
const chipOff = "bg-slate-800 text-slate-200 hover:bg-slate-700";
export function Search({
  setNotice,
  intent,
  active = true,
  admin = false,
}: {
  active?: boolean;
  admin?: boolean;
  setNotice: (message: string) => void;
  intent?: SearchIntent;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [media, setMedia] = useState<MediaType>("ebook");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sort, setSort] = useState<Sort>("relevance");
  const [view, setView] = useState<View>(readView);
  const [filters, setFilters] = useState<Filters>(readFilters);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState<SearchResult | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const pending = useRef(new Set<string>());
  const annotated = useMemo(
    () =>
      results.map((result) => ({
        result,
        lang: detectLang(result.title, result.language),
      })),
    [results],
  );
  // Filter values come from the answer itself, never from a fixed list.
  const options = useMemo(() => {
    const lang = new Map<string, number>(),
      format = new Map<string, number>(),
      indexer = new Map<string, number>();
    const bump = (map: Map<string, number>, key: string) => {
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    };
    for (const entry of annotated) {
      bump(lang, entry.lang?.code ?? "");
      bump(format, formatOf(entry.result));
      bump(indexer, indexerOf(entry.result));
    }
    const sorted = (map: Map<string, number>) =>
      new Map(
        [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      );
    return { lang: sorted(lang), format: sorted(format), indexer: sorted(indexer) };
  }, [annotated]);
  const rendered = useMemo(
    () =>
      annotated
        .filter(
          ({ result, lang }) =>
            (!filters.lang || lang?.code === filters.lang) &&
            (!filters.format || formatOf(result) === filters.format) &&
            (!filters.indexer || indexerOf(result) === filters.indexer) &&
            !(filters.hideOwned && result.in_library),
        )
        .sort((a, b) =>
          sort === "seeders"
            ? (b.result.seeders || 0) - (a.result.seeders || 0)
            : sort === "size"
              ? size(b.result.size || b.result.size_human) -
                size(a.result.size || a.result.size_human)
              : 0,
        ),
    [annotated, filters, sort],
  );
  const filtersActive =
    !!filters.lang ||
    !!filters.format ||
    !!filters.indexer ||
    filters.hideOwned;
  const setFilter = (patch: Partial<Filters>) =>
    setFilters((old) => {
      const next = { ...old, ...patch };
      persist(FILTERS_KEY, JSON.stringify(next));
      return next;
    });
  const switchView = (next: View) => {
    setView(next);
    persist(VIEW_KEY, next);
  };
  const tracked = Object.entries(outcomes)
    .filter(([, outcome]) => outcome.state === "loading" && outcome.jobId)
    .map(([key, outcome]) => [key, outcome.jobId!] as const);
  const trackingKey = JSON.stringify(tracked);
  useEffect(() => {
    if (!tracked.length) return;
    let dead = false;
    let controller: AbortController | undefined;
    let inFlight = false;
    const pairs: readonly (readonly [string, string])[] =
      JSON.parse(trackingKey);
    async function poll() {
      if (dead || document.hidden || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        const data = await api<{ downloads?: DownloadJob[] }>(
          "/api/downloads",
          { signal: controller.signal },
        );
        if (dead) return;
        setOutcomes((old) => {
          const next = { ...old };
          for (const [key, id] of pairs) {
            const job = data.downloads?.find(
              (job) => String(job.job_id) === id,
            );
            if (!job) continue;
            if (job.status === "completed")
              next[key] = { state: "success", detail: job.detail };
            else if (
              ["error", "dead_letter", "interrupted"].includes(job.status)
            )
              next[key] = {
                state: "error",
                detail: job.error || job.detail,
                manualURL: old[key]?.manualURL,
              };
            else next[key] = { ...old[key]!, detail: job.detail };
          }
          return next;
        });
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight = false;
      }
    }
    void poll();
    const interval = window.setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      dead = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [trackingKey]);
  const completedKeys = JSON.stringify(
    Object.entries(outcomes)
      .filter(([, value]) => value.state === "success")
      .map(([key]) => key),
  );
  useEffect(() => {
    const keys: string[] = JSON.parse(completedKeys);
    if (!keys.length) return;
    const timer = window.setTimeout(
      () =>
        setOutcomes((old) => {
          const next = { ...old };
          for (const key of keys)
            if (next[key]?.state === "success") delete next[key];
          return next;
        }),
      2500,
    );
    return () => window.clearTimeout(timer);
  }, [completedKeys]);
  useEffect(() => () => abort.current?.abort(), []);
  // The drawer belongs to this tab: leaving the tab closes it.
  useEffect(() => {
    if (!active) setDetail(null);
  }, [active]);
  async function search(value: string, kind: MediaType) {
    if (!value.trim()) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++generation.current;
    setLoading(true);
    setSearched(true);
    setResults([]);
    setDetail(null);
    setError("");
    const endpoint = endpoints[kind];
    const apply = (rows: SearchResult[]) => {
      if (id === generation.current && !controller.signal.aborted)
        setResults(rows);
    };
    try {
      const response = await request(
        `${endpoint}/stream?q=${encodeURIComponent(value)}`,
        { signal: controller.signal, headers: { Accept: "text/event-stream" } },
      );
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get("content-type")?.includes("text/event-stream")
      )
        throw new Error("Streaming search unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const frame = (text: string) => {
        let event = "message";
        const lines: string[] = [];
        for (const line of text.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
        }
        if (event === "results" || event === "complete") {
          try {
            const data = JSON.parse(lines.join("\n")) as {
              results?: SearchResult[];
            };
            apply(data.results || []);
          } catch {
            /* A malformed partial source event must not discard other results. */
          }
        }
      };
      try {
        while (true) {
          const chunk = await reader.read();
          buffer = (
            buffer +
            (chunk.done
              ? decoder.decode()
              : decoder.decode(chunk.value, { stream: true }))
          ).replaceAll("\r\n", "\n");
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            frame(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
          }
          if (chunk.done) {
            if (buffer.trim()) frame(buffer);
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      try {
        const data = await api<{ results?: SearchResult[] }>(
          `${endpoint}?q=${encodeURIComponent(value)}`,
          { signal: controller.signal },
        );
        apply(data.results || []);
      } catch (failure) {
        if (!controller.signal.aborted && id === generation.current)
          setError(
            t("search_failed", {
              msg: failure instanceof Error ? failure.message : String(failure),
            }),
          );
      }
    } finally {
      if (id === generation.current && !controller.signal.aborted)
        setLoading(false);
    }
  }
  useEffect(() => {
    if (intent) {
      setQuery(intent.query);
      setMedia(intent.media);
      void search(intent.query, intent.media);
    }
  }, [intent?.sequence]);
  async function download(result: SearchResult) {
    const key = keyOf(result);
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setOutcomes((old) => ({ ...old, [key]: { state: "loading" } }));
    try {
      const response = await request("/api/download", {
        method: "POST",
        body: JSON.stringify({
          title: result.title,
          download_url:
            result.download_url || result.url || result.epub_url || "",
          abb_url: result.abb_url || "",
          source: result.source,
          source_id: result.source_id || "",
          md5: result.md5 || "",
          author: result.author || "",
          info_hash: result.info_hash || "",
          // The server reads magnet_url (models.DownloadRequest); `magnet` is
          // kept so fixtures written against the old client name still match.
          magnet_url: result.magnet_url || result.magnet || "",
          magnet: result.magnet || result.magnet_url || "",
          media_type: result.media_type || "",
          download_protocol: result.download_protocol || "",
          force: !!result.in_library,
        }),
      });
      const data = (await response.json()) as DownloadResult;
      if (response.status === 409 && data.in_library) {
        setResults((old) =>
          old.map((row) =>
            keyOf(row) === key
              ? {
                  ...row,
                  in_library: true,
                  library_title: data.library_title,
                  library_item_id: data.library_item_id,
                }
              : row,
          ),
        );
        setOutcomes((old) => {
          const next = { ...old };
          delete next[key];
          return next;
        });
        setNotice(
          t("already_in_library", {
            title: data.library_title || result.title,
          }),
        );
        return;
      }
      if (!response.ok || (!data.success && !data.job_id))
        throw new Error(data.error || `API error: ${response.status}`);
      setOutcomes((old) => ({
        ...old,
        [key]: {
          state: data.job_id ? "loading" : "success",
          jobId: data.job_id ? String(data.job_id) : undefined,
          manualURL:
            result.source === "annas"
              ? result.download_url || result.url
              : undefined,
        },
      }));
      setNotice(t("download_started", { title: result.title }));
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setOutcomes((old) => ({
        ...old,
        [key]: {
          state: "error",
          detail,
          manualURL:
            result.source === "annas"
              ? result.download_url || result.url
              : undefined,
        },
      }));
      setNotice(t("download_failed", { msg: detail }));
    } finally {
      pending.current.delete(key);
    }
  }
  async function copyName(result: SearchResult) {
    try {
      await navigator.clipboard.writeText(result.title);
      setNotice(t("name_copied"));
    } catch {
      setNotice(t("copy_failed"));
    }
  }
  // POST /api/blocklist (admin): the scheduler skips the release from then on.
  async function block(result: SearchResult) {
    if (!window.confirm(t("block_confirm", { title: result.title }))) return;
    try {
      const response = await request("/api/blocklist", {
        method: "POST",
        body: JSON.stringify({
          title: result.title,
          source: result.source,
          download_url: result.download_url || result.url || "",
          info_hash: result.info_hash || "",
          reason: "blocked manually from the search results",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || data.success === false)
        throw new Error(data.error || `API error: ${response.status}`);
      setBlocked((old) => new Set(old).add(keyOf(result)));
      setNotice(t("release_blocked", { title: result.title }));
    } catch (e) {
      setNotice(
        t("block_failed", { msg: e instanceof Error ? e.message : String(e) }),
      );
    }
  }
  // The drawer follows the live row (ownership can change after a 409).
  const shown = detail
    ? (annotated.find(({ result }) => keyOf(result) === keyOf(detail)) ?? {
        result: detail,
        lang: detectLang(detail.title, detail.language),
      })
    : null;
  const countText =
    rendered.length === results.length
      ? t("n_results", { n: results.length })
      : t("n_of_m_results", { shown: rendered.length, n: results.length });
  return (
    <section
      id="tab-search"
      hidden={!active}
      className={`tab-content ${active ? "active" : ""} space-y-4`}
    >
      <div
        className="library-categories"
        role="group"
        aria-label={t("media_type_label")}
      >
        {(["ebook", "audiobook", "manga"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className="library-category"
            data-action="switchSearchTab"
            data-arg={kind === "manga" ? "manga" : `${kind}s`}
            aria-pressed={media === kind}
            onClick={() => {
              setMedia(kind);
              if (query.trim()) void search(query, kind);
            }}
          >
            {t(
              kind === "ebook"
                ? "tab_ebooks"
                : kind === "audiobook"
                  ? "tab_audiobooks"
                  : "tab_manga",
            )}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query, media);
        }}
      >
        <input
          id="search-input"
          className="min-w-0 flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3"
          aria-label={t("nav_search")}
          placeholder={t(
            media === "ebook"
              ? "search_placeholder"
              : media === "audiobook"
                ? "search_placeholder_ab"
                : "search_placeholder_manga",
          )}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400">
          {t("nav_search")}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {loading && (
        <p id="search-spinner" role="status" className="text-sm text-slate-400">
          {results.length ? t("still_searching") : t("searching")}
        </p>
      )}
      {loading && !results.length && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      )}
      {!searched && (
        <EmptyState
          id="search-empty"
          title={t("search_empty_title")}
          hint={t("search_empty_hint")}
        />
      )}
      {searched && !loading && !results.length && !error && (
        <EmptyState
          id="search-no-results"
          title={t("no_results")}
          hint={t("no_results_hint")}
        />
      )}
      {results.length > 0 && (
        <Toolbar
          id="search-sort-bar"
          start={
            <>
              <span id="search-result-count" className="text-sm text-slate-300">
                {countText}
              </span>
              <div
                role="group"
                aria-label={t("sort_label")}
                className="flex flex-wrap gap-1"
              >
                {(["relevance", "seeders", "size"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${chip} ${sort === mode ? chipOn : chipOff}`}
                    data-action="setSortMode"
                    data-arg={mode}
                    aria-pressed={sort === mode}
                    onClick={() => setSort(mode)}
                  >
                    {t(`sort_${mode}`)}
                  </button>
                ))}
              </div>
            </>
          }
          end={
            <>
              <FilterSelect
                id="search-filter-lang"
                label={t("filter_language")}
                all={t("filter_all_languages")}
                value={filters.lang}
                options={options.lang}
                render={langLabel}
                onChange={(lang) => setFilter({ lang })}
              />
              <FilterSelect
                id="search-filter-format"
                label={t("filter_format")}
                all={t("filter_all_formats")}
                value={filters.format}
                options={options.format}
                render={(option) => option.toUpperCase()}
                onChange={(format) => setFilter({ format })}
              />
              <FilterSelect
                id="search-filter-indexer"
                label={t("filter_indexer")}
                all={t("filter_all_indexers")}
                value={filters.indexer}
                options={options.indexer}
                onChange={(indexer) => setFilter({ indexer })}
              />
              <label className="inline-flex items-center gap-1.5 text-sm text-slate-200 min-h-[2.25rem] cursor-pointer">
                <input
                  id="search-hide-owned"
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={filters.hideOwned}
                  onChange={(e) => setFilter({ hideOwned: e.target.checked })}
                />
                {t("filter_hide_owned")}
              </label>
              {filtersActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  data-action="resetSearchFilters"
                  onClick={() => {
                    setFilters(defaultFilters);
                    persist(FILTERS_KEY, JSON.stringify(defaultFilters));
                  }}
                >
                  {t("filter_reset")}
                </Button>
              )}
              <div
                role="group"
                aria-label={t("view_label")}
                className="flex gap-1"
              >
                {(["list", "cards"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${chip} px-2.5 ${view === mode ? chipOn : chipOff}`}
                    data-action="setResultsView"
                    data-arg={mode}
                    aria-pressed={view === mode}
                    aria-label={t(mode === "list" ? "view_list" : "view_cards")}
                    title={t(mode === "list" ? "view_list" : "view_cards")}
                    onClick={() => switchView(mode)}
                  >
                    <span aria-hidden="true">{mode === "list" ? "≡" : "▦"}</span>
                  </button>
                ))}
              </div>
            </>
          }
        />
      )}
      {results.length > 0 && !rendered.length && (
        <EmptyState
          id="search-filtered-out"
          title={t("no_results_filters")}
          hint={t("no_results_filters_hint")}
          action={
            <Button
              variant="secondary"
              data-action="resetSearchFilters"
              onClick={() => {
                setFilters(defaultFilters);
                persist(FILTERS_KEY, JSON.stringify(defaultFilters));
              }}
            >
              {t("filter_reset")}
            </Button>
          }
        />
      )}
      <div
        id="search-results"
        className={
          view === "cards"
            ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
            : "flex flex-col gap-3"
        }
      >
        {rendered.map(({ result, lang }, index) => {
          const key = keyOf(result);
          const props: RowProps = {
            result,
            index,
            lang,
            outcome: outcomes[key],
            blocked: blocked.has(key),
            admin,
            onDownload: () => void download(result),
            onDetails: () => setDetail(result),
            onCopy: () => void copyName(result),
            onBlock: () => void block(result),
          };
          return view === "cards" ? (
            <ResultCard key={`${key}:${index}`} {...props} />
          ) : (
            <ResultRow key={`${key}:${index}`} {...props} />
          );
        })}
      </div>
      {shown && (
        <ResultDetail
          result={shown.result}
          lang={shown.lang}
          outcome={outcomes[keyOf(shown.result)]}
          blocked={blocked.has(keyOf(shown.result))}
          admin={admin}
          onClose={() => setDetail(null)}
          onDownload={() => void download(shown.result)}
          onCopy={() => void copyName(shown.result)}
          onBlock={() => void block(shown.result)}
        />
      )}
    </section>
  );
}
