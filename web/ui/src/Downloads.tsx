import { useCallback, useEffect, useState } from "react";
import { api, type DownloadJob, type ImportStateName } from "./api";
import { useTranslation, type TranslationKey } from "./i18n";
import { translateReason } from "./reasons";
import {
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
  type Tone,
} from "./ui";

// Shared with the header indicator in main.tsx.
export const activeStatuses = new Set([
  "queued",
  "searching",
  "downloading",
  "organizing",
  "importing",
  "retry_wait",
]);
// Statuses with a status_* entry in the catalogue; others show as-is.
const known = new Set([
  ...activeStatuses,
  "completed",
  "error",
  "dead_letter",
]);
// A torrent the client calls "completed" is only a success once the watcher
// imported it: while the import is pending or failed, the status badge is
// amber/red so a stalled torrent never looks done.
const tone = (status: string, importState?: string): Tone =>
  status === "completed"
    ? importState === "failed"
      ? "danger"
      : importState === "pending"
        ? "warn"
        : importState === "importing"
          ? "info"
          : "ok"
    : status === "error" || status === "dead_letter"
      ? "danger"
      : status === "retry_wait"
        ? "warn"
        : activeStatuses.has(status)
          ? "info"
          : "neutral";
const importTone: Record<ImportStateName, Tone> = {
  pending: "warn",
  importing: "info",
  imported: "ok",
  failed: "danger",
};
const isImportState = (value: unknown): value is ImportStateName =>
  value === "pending" ||
  value === "importing" ||
  value === "imported" ||
  value === "failed";

export function Downloads({
  setNotice,
}: {
  setNotice: (message: string) => void;
}): React.JSX.Element {
  const { locale, t } = useTranslation();
  const [jobs, setJobs] = useState<DownloadJob[]>([]),
    [refreshing, setRefreshing] = useState(false),
    [clearing, setClearing] = useState(false),
    [pending, setPending] = useState<Set<string>>(new Set());
  const load = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const data = await api<{
          downloads?: DownloadJob[];
          jobs?: DownloadJob[];
        }>("/api/downloads");
        setJobs(data.downloads ?? data.jobs ?? []);
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : t("failed_load_downloads"),
        );
      } finally {
        if (manual) setRefreshing(false);
      }
    },
    [setNotice],
  );
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  const retry = async (job: DownloadJob) => {
    const id = job.job_id;
    if (!id || pending.has(id)) return;
    setPending((old) => new Set(old).add(id));
    try {
      await api(`/api/downloads/jobs/${id}/retry`, { method: "POST" });
      setNotice(t("retrying_download"));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("retry_failed"));
    } finally {
      setPending((old) => {
        const next = new Set(old);
        next.delete(id);
        return next;
      });
    }
  };
  const cancel = async (job: DownloadJob) => {
    const path = job.hash
      ? `/api/downloads/torrent/${job.hash}`
      : job.job_id
        ? `/api/downloads/novel/${job.job_id}`
        : "";
    if (
      !path ||
      !window.confirm(
        t("confirm_cancel_download", {
          title: job.title || t("unknown_title"),
        }),
      )
    )
      return;
    try {
      await api(path, { method: "DELETE" });
      setNotice(t("download_cancelled"));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("cancel_failed"));
    }
  };
  const clear = async () => {
    setClearing(true);
    try {
      await api("/api/downloads/clear", { method: "POST" });
      setNotice(t("cleared_completed"));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("failed_clear"));
    } finally {
      setClearing(false);
    }
  };
  const running = jobs.filter((job) => activeStatuses.has(job.status)).length;
  return (
    <section id="tab-downloads" className="tab-content active space-y-4">
      <PageHeader
        title={
          <>
            {t("downloads_title")}
            <span
              id="dl-badge"
              className={
                running
                  ? "inline-flex items-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white"
                  : ""
              }
            >
              {running || ""}
            </span>
          </>
        }
      >
        <Button
          id="downloads-refresh-btn"
          variant="secondary"
          data-action="refreshDownloads"
          disabled={refreshing}
          aria-busy={refreshing || undefined}
          onClick={() => void load(true)}
        >
          {t("refresh")}
        </Button>
        <Button
          id="downloads-clear-btn"
          variant="secondary"
          data-action="clearCompleted"
          disabled={clearing}
          aria-busy={clearing || undefined}
          onClick={() => void clear()}
        >
          {t("clear_completed")}
        </Button>
      </PageHeader>
      {jobs.length === 0 && (
        <EmptyState
          id="downloads-empty"
          title={t("no_active_downloads")}
          hint={t("no_downloads_hint")}
        />
      )}
      <div id="downloads-list" className="space-y-3">
        {jobs.map((job, index) => {
          const progress = job.progress ?? 0,
            id = job.job_id ?? job.hash ?? String(index),
            retrying = pending.has(job.job_id ?? ""),
            importState = isImportState(job.import_state)
              ? job.import_state
              : undefined;
          return (
            <article
              data-download-id={id}
              key={id}
              className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={tone(job.status, importState)}
                  pulse={job.status === "downloading"}
                  data-download-status={job.status}
                >
                  {known.has(job.status)
                    ? t(`status_${job.status}` as TranslationKey)
                    : job.status}
                </StatusBadge>
                {importState && (
                  <StatusBadge
                    tone={importTone[importState]}
                    pulse={importState === "importing"}
                    data-import-state={importState}
                    title={job.import_detail || undefined}
                  >
                    {t(`import_state_${importState}`)}
                  </StatusBadge>
                )}
                {job.source && (
                  <span className="text-sm text-slate-400">{job.source}</span>
                )}
              </div>
              <h4
                title={job.title ?? ""}
                className="text-sm font-medium text-slate-100 [overflow-wrap:anywhere]"
              >
                {job.title || t("unknown_title")}
              </h4>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-400">
                {job.import_detail && (
                  <span
                    data-import-detail
                    className="[overflow-wrap:anywhere]"
                    title={job.import_detail}
                  >
                    {translateReason(locale, job.import_detail)}
                  </span>
                )}
                {job.detail && <span title={job.detail}>{job.detail}</span>}
                {(job.max_retries ?? 0) > 0 && (job.retry_count ?? 0) > 0 && (
                  <span>
                    {t("attempt_of", {
                      n: Math.min(
                        (job.retry_count ?? 0) + 1,
                        (job.max_retries ?? 0) + 1,
                      ),
                      m: (job.max_retries ?? 0) + 1,
                    })}
                  </span>
                )}
                {job.size && <span>{job.size}</span>}
                {job.speed && <span>{job.speed}</span>}
              </div>
              {job.error && (
                <p className="text-sm text-red-300 [overflow-wrap:anywhere]">
                  {job.error}
                </p>
              )}
              {job.status === "downloading" && progress > 0 && (
                <div className="flex items-center gap-3">
                  <div
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"
                  >
                    <div
                      className="progress-bar h-full rounded-full bg-indigo-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-300 tabular-nums">
                    {progress.toFixed(1)}%
                  </span>
                </div>
              )}
              {((job.status === "error" || job.status === "dead_letter") ||
                (activeStatuses.has(job.status) && (job.hash || job.job_id))) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(job.status === "error" || job.status === "dead_letter") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      data-action="retryDownload"
                      disabled={retrying}
                      aria-busy={retrying || undefined}
                      onClick={() => void retry(job)}
                    >
                      {retrying ? t("loading") : t("retry")}
                    </Button>
                  )}
                  {activeStatuses.has(job.status) && (job.hash || job.job_id) && (
                    <Button
                      size="sm"
                      variant="danger"
                      data-action="cancelDownload"
                      onClick={() => void cancel(job)}
                    >
                      {t("cancel")}
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
