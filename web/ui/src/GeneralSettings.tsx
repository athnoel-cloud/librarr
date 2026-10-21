import { useEffect, useState } from "react";
import { api } from "./api";
import { useTranslation, type TranslationKey } from "./i18n";
import { LANG_LABEL, type LangCode } from "./lang";
import { Button } from "./ui";
type Value = string | number | boolean | null;
type Settings = Record<string, Value>;
interface Result {
  success: boolean;
  error?: string;
}
interface Source {
  name?: string;
  label?: string;
  enabled?: boolean;
  search_tab?: string;
  download_type?: string;
}
const integrations = [
  [
    "annas",
    "Anna’s Archive",
    ["annas_archive_domain", "annas_archive_secret_key"],
  ],
  ["prowlarr", "Prowlarr", ["prowlarr_url", "prowlarr_api_key"]],
  ["qbittorrent", "qBittorrent", ["qb_url", "qb_user", "qb_pass"]],
  [
    "transmission",
    "Transmission",
    [
      "transmission_url",
      "transmission_user",
      "transmission_pass",
      "torrent_client",
    ],
  ],
  [
    "sabnzbd",
    "SABnzbd",
    ["sabnzbd_url", "sabnzbd_api_key", "sabnzbd_category"],
  ],
  ["audiobookshelf", "Audiobookshelf", ["abs_url", "abs_token"]],
  [
    "kavita",
    "Kavita",
    [
      "kavita_url",
      "kavita_user",
      "kavita_pass",
      "kavita_ebook_library_id",
      "kavita_manga_library_id",
    ],
  ],
  ["komga", "Komga", ["komga_url", "komga_user", "komga_pass"]],
  ["calibre", "Calibre", ["calibre_url", "calibre_library_path"]],
] as const;
// Setting key → catalogue key of its label.
const toggles = [
  ["scheduler_enabled", "s_sched_enabled"],
  ["scheduler_auto_download", "s_sched_auto_download"],
  ["auto_upgrade_enabled", "s_auto_upgrade"],
  ["upgrade_keep_old_files", "s_keep_old"],
  ["author_monitor_enabled", "s_authors_enabled"],
] as const;
const numbers = [
  ["scheduler_interval_hours", "s_sched_interval", 1],
  ["scheduler_min_score", "s_sched_min_score", 0],
  ["scheduler_item_delay_seconds", "s_sched_delay", 0],
] as const;
// Human labels for the integration fields; anything unknown falls back to
// the key with its underscores spaced out.
const fieldLabels: Record<string, TranslationKey> = {
  annas_archive_domain: "f_domain",
  annas_archive_secret_key: "f_secret_key",
  prowlarr_url: "f_url",
  prowlarr_api_key: "f_api_key",
  qb_url: "f_url",
  qb_user: "label_username",
  qb_pass: "label_password",
  transmission_url: "f_url",
  transmission_user: "label_username",
  transmission_pass: "label_password",
  torrent_client: "f_torrent_client",
  sabnzbd_url: "f_url",
  sabnzbd_api_key: "f_api_key",
  sabnzbd_category: "f_category",
  abs_url: "f_url",
  abs_token: "f_token",
  kavita_url: "f_url",
  kavita_user: "label_username",
  kavita_pass: "label_password",
  kavita_ebook_library_id: "f_ebook_library_id",
  kavita_manga_library_id: "f_manga_library_id",
  komga_url: "f_url",
  komga_user: "label_username",
  komga_pass: "label_password",
  calibre_url: "f_url",
  calibre_library_path: "f_library_path",
};
const importDescriptions: Record<string, TranslationKey> = {
  move: "import_desc_move",
  hardlink: "import_desc_hardlink",
  copy: "import_desc_copy",
};
// Fixed display order; the CSV sent to the server follows it too.
const languages: readonly LangCode[] = [
  "fr",
  "multi",
  "en",
  "de",
  "es",
  "it",
  "ru",
  "ja",
];
// "French first": FR and MULTi get the bonus, the format still decides,
// nothing is rejected.
const frenchFirst = {
  language_preferred: "fr,multi",
  language_mode: "prefer",
  language_bonus: 30,
} as const;
const box = "bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3";
const input =
  "block w-full min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2";
const button =
  "px-3 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50";
export function GeneralSettings() {
  const { t } = useTranslation();
  const [data, setData] = useState<Settings>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [scheduler, setScheduler] = useState<{
    last_run?: string;
    last_result?: string;
  }>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tests, setTests] = useState<Record<string, string>>({});
  async function load() {
    setData(await api<Settings>("/api/settings"));
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
    void api<Source[] | { sources: Source[] }>("/api/sources")
      .then((d) => setSources(Array.isArray(d) ? d : d.sources || []))
      .catch((e) => setError(String(e)));
    void api<Record<string, unknown>>("/api/config")
      .then(setConfig)
      .catch((e) => setError(String(e)));
    void api<{ status: { last_run?: string; last_result?: string } }>(
      "/api/scheduler/status",
    )
      .then((d) => setScheduler(d.status || {}))
      .catch((e) => setError(String(e)));
  }, []);
  function edit(key: string, value: Value) {
    setData((old) => ({ ...old, [key]: value }));
  }
  async function save(name: string, payload: Settings, reload = false) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      const result = await api<Result>("/api/settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!result.success) throw new Error(result.error || t("failed_save"));
      if (reload) {
        const fresh = await api<Settings>("/api/settings");
        setData((old) => ({
          ...old,
          ...Object.fromEntries(
            Object.keys(payload).map((key) => [
              key,
              fresh[key] ?? payload[key],
            ]),
          ),
          effective_import_mode: fresh.effective_import_mode ?? null,
        }));
      }
      setNotice(
        name === "integration"
          ? t("settings_saved_restart")
          : name === "language-preset"
            ? t("s_language_preset_applied")
            : t("settings_saved"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function test(name: string) {
    setTests((old) => ({ ...old, [name]: t("testing") }));
    try {
      const result = await api<Result>(`/api/test/${name}`, { method: "POST" });
      setTests((old) => ({
        ...old,
        [name]: result.success
          ? t("connected")
          : result.error || t("conn_error"),
      }));
    } catch (e) {
      setTests((old) => ({
        ...old,
        [name]: e instanceof Error ? e.message : String(e),
      }));
    }
  }
  // Language preference (GET/POST /api/settings: language_preferred CSV,
  // language_mode prefer|require, language_bonus number). Absent keys — an
  // older server — fall back to "nothing preferred".
  const preferred = languages.filter((code) =>
    String(data.language_preferred ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .includes(code),
  );
  const languageMode = data.language_mode === "require" ? "require" : "prefer";
  const languageBonus = Number(data.language_bonus ?? frenchFirst.language_bonus);
  const languagePayload = () => ({
    language_preferred: preferred.join(","),
    language_mode: languageMode,
    language_bonus: Number.isFinite(languageBonus) ? languageBonus : 0,
  });
  function togglePreferred(code: LangCode, on: boolean) {
    const next = languages.filter((item) =>
      item === code ? on : preferred.includes(item),
    );
    edit("language_preferred", next.join(","));
  }
  async function applyFrenchFirst() {
    setData((old) => ({ ...old, ...frenchFirst }));
    await save("language-preset", { ...frenchFirst }, true);
  }
  const effective = String(data.effective_import_mode || "");
  const effectiveDescription = importDescriptions[effective];
  const fieldLabel = (key: string) => {
    const label = fieldLabels[key];
    return label ? t(label) : key.replaceAll("_", " ");
  };
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-400">
          {notice}
        </p>
      )}
      <section className={box}>
        <h3 className="text-lg font-semibold">{t("s_downloads_title")}</h3>
        <label className="block">
          {t("import_mode")}
          <select
            id="setting-import_mode"
            className={input}
            value={String(data.import_mode ?? "")}
            disabled={!!busy}
            onChange={(e) =>
              void save("import", { import_mode: e.target.value }, true)
            }
          >
            <option value="">{t("import_mode_auto")}</option>
            <option value="move">{t("import_mode_move")}</option>
            <option value="hardlink">{t("import_mode_hardlink")}</option>
            <option value="copy">{t("import_mode_copy")}</option>
          </select>
        </label>
        <p
          id="import-mode-effective"
          className={
            effective === "move" && data.remove_torrent_after_import === false
              ? "text-amber-400"
              : "text-indigo-300"
          }
        >
          {data.import_mode === "" && effective
            ? `${t("import_mode_auto_effective", { mode: effective })} `
            : ""}
          {effectiveDescription ? t(effectiveDescription) : ""}
          {effective === "move" && data.remove_torrent_after_import === false
            ? ` ${t("import_pick_hardlink")}`
            : ""}
        </p>
        <label className="block">
          <input
            id="remove-torrent-toggle"
            type="checkbox"
            checked={data.remove_torrent_after_import === true}
            disabled={!!busy}
            onChange={(e) =>
              void save(
                "remove",
                { remove_torrent_after_import: e.target.checked },
                true,
              )
            }
          />{" "}
          {t("remove_torrent_after_import")}
        </label>
        <label className="block">
          <input
            id="foreign-lang-filter-toggle"
            type="checkbox"
            checked={data.foreign_lang_filter === true}
            disabled={!!busy}
            onChange={(e) =>
              void save(
                "filter",
                { foreign_lang_filter: e.target.checked },
                true,
              )
            }
          />{" "}
          {t("filter_non_english_desc")}
        </label>
      </section>
      <section id="wanted-settings" className={box}>
        <h3 className="text-lg font-semibold">{t("s_wanted_title")}</h3>
        {toggles.map(([key, label]) => (
          <label key={key} className="block">
            <input
              id={`setting-${key}`}
              type="checkbox"
              checked={data[key] === true}
              onChange={(e) => edit(key, e.target.checked)}
            />{" "}
            {t(label)}
          </label>
        ))}
        <div className="grid gap-3 sm:grid-cols-3">
          {numbers.map(([key, label, min]) => (
            <label key={key}>
              {t(label)}
              <input
                id={`setting-${key}`}
                className={input}
                type="number"
                min={min}
                value={Number(data[key] ?? min)}
                onChange={(e) => edit(key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <button
          disabled={!!busy}
          data-action="saveWantedSettings"
          className={button}
          onClick={() =>
            void save(
              "wanted",
              Object.fromEntries(
                [...toggles, ...numbers].map(([key]) => [
                  key,
                  data[key] ??
                    (toggles.some(([toggle]) => toggle === key) ? false : 0),
                ]),
              ),
            )
          }
        >
          {t("save")}
        </button>
        <p id="scheduler-status" className="text-sm text-slate-400">
          {scheduler.last_run
            ? `${new Date(scheduler.last_run).toLocaleString()} — ${scheduler.last_result || ""}`
            : ""}
        </p>
      </section>
      <section id="language-settings" className={box}>
        <h3 className="text-lg font-semibold">{t("s_language_title")}</h3>
        <p className="text-sm text-slate-400 max-w-prose">
          {t("s_language_desc")}
        </p>
        <fieldset>
          <legend className="text-sm text-slate-300 mb-1">
            {t("s_language_preferred")}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {languages.map((code) => (
              <label
                key={code}
                className="inline-flex items-center min-h-[2.75rem] sm:min-h-0 text-sm cursor-pointer"
              >
                <input
                  id={`setting-language-${code}`}
                  type="checkbox"
                  checked={preferred.includes(code)}
                  disabled={!!busy}
                  onChange={(e) => togglePreferred(code, e.target.checked)}
                />
                <span className="font-medium">{LANG_LABEL[code]}</span>
                <span className="text-slate-400">
                  &nbsp;· {t(`lang_name_${code}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            {t("s_language_mode")}
            <select
              id="setting-language_mode"
              className={input}
              value={languageMode}
              disabled={!!busy}
              onChange={(e) => edit("language_mode", e.target.value)}
            >
              <option value="prefer">{t("s_language_mode_prefer")}</option>
              <option value="require">{t("s_language_mode_require")}</option>
            </select>
          </label>
          <label className="block text-sm">
            {t("s_language_bonus")}
            <input
              id="setting-language_bonus"
              className={input}
              type="number"
              min={0}
              max={100}
              value={Number.isFinite(languageBonus) ? languageBonus : 0}
              disabled={!!busy}
              onChange={(e) => edit("language_bonus", Number(e.target.value))}
            />
          </label>
        </div>
        <p
          id="language-mode-help"
          className="text-sm text-slate-400 max-w-prose"
        >
          {preferred.length
            ? t(
                languageMode === "require"
                  ? "s_language_mode_require_help"
                  : "s_language_mode_prefer_help",
              )
            : t("s_language_none_help")}{" "}
          {t("s_language_bonus_help")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            data-action="saveLanguageSettings"
            disabled={!!busy}
            onClick={() => void save("language", languagePayload(), true)}
          >
            {t("save")}
          </Button>
          <Button
            variant="secondary"
            data-action="languagePresetFrench"
            disabled={!!busy}
            title={t("s_language_preset_french_help")}
            onClick={() => void applyFrenchFirst()}
          >
            {t("s_language_preset_french")}
          </Button>
        </div>
      </section>
      <section className={box}>
        <h3 className="text-lg font-semibold">{t("s_integrations")}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map(([name, label, fields]) => (
            <form
              key={name}
              className="border border-slate-700 rounded-lg p-4 space-y-3 min-w-0"
              onSubmit={(e) => {
                e.preventDefault();
                void save(
                  "integration",
                  Object.fromEntries(
                    fields
                      .filter((key) => data[key] !== "--------")
                      .map((key) => [key, data[key] ?? ""]),
                  ),
                );
              }}
            >
              <h4 className="font-semibold">{label}</h4>
              {fields.map((key) => (
                <label key={key} className="block text-sm">
                  {fieldLabel(key)}
                  {key === "torrent_client" ? (
                    <select
                      id={`setting-${key}`}
                      className={input}
                      value={String(data[key] ?? "qbittorrent")}
                      onChange={(e) => edit(key, e.target.value)}
                    >
                      <option value="qbittorrent">qBittorrent</option>
                      <option value="transmission">Transmission</option>
                    </select>
                  ) : (
                    <input
                      id={`setting-${key}`}
                      className={input}
                      type={
                        /pass|token|secret|api_key/.test(key)
                          ? "password"
                          : "text"
                      }
                      autoComplete="off"
                      value={String(data[key] ?? "")}
                      onChange={(e) => edit(key, e.target.value)}
                    />
                  )}
                </label>
              ))}
              <div className="flex gap-2">
                <button
                  disabled={!!busy}
                  className={button}
                  data-action="saveIntegration"
                  data-arg={name}
                >
                  {t("save")}
                </button>
                {!["annas", "komga", "calibre"].includes(name) && (
                  <button
                    type="button"
                    className={button}
                    data-action="testConnection"
                    data-arg={name}
                    onClick={() => void test(name)}
                  >
                    {t("test_connection")}
                  </button>
                )}
              </div>
              <p role="status" id={`test-${name}-status`}>
                {tests[name]}
              </p>
            </form>
          ))}
        </div>
      </section>
      <section className={box}>
        <h3 className="text-lg font-semibold">{t("s_search_sources")}</h3>
        <div id="sources-list" className="space-y-2">
          {sources.map((source, index) => (
            <div
              key={source.name || index}
              className="flex gap-2 justify-between"
            >
              <span>
                {source.label || source.name}{" "}
                <small>{source.search_tab || source.download_type}</small>
              </span>
              <span>
                {source.enabled === false ? t("disabled") : t("enabled")}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className={box}>
        <h3 className="text-lg font-semibold">{t("s_configuration")}</h3>
        <div id="config-info">
          {Object.entries(config)
            .filter(
              ([key, value]) =>
                (key.endsWith("_url") && typeof value === "string") ||
                (typeof value === "object" && value !== null && "url" in value),
            )
            .map(([key, value]) => (
              <p className="flex flex-wrap justify-between gap-2" key={key}>
                <span>{key.replaceAll("_", " ")}</span>
                <span className="text-slate-400 break-all">
                  {typeof value === "string"
                    ? value
                    : String(
                        (value as { url: unknown }).url || t("not_configured"),
                      )}
                </span>
              </p>
            ))}
        </div>
      </section>
    </div>
  );
}
