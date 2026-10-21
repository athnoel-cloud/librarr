import {
  FormEvent,
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  api,
  authStatus,
  setUnauthorizedHandler,
  type Author,
  type AuthorCheckResult,
  type AuthStatus,
  type DownloadJob,
  type MediaType,
  type Profile,
  type WantedOutcome,
  type WishlistItem,
} from "./api";
import { Library } from "./Library";
import { Downloads, activeStatuses } from "./Downloads";
import { AuthSettings } from "./AuthSettings";
import { AccountSettings } from "./AccountSettings";
import { GeneralSettings } from "./GeneralSettings";
import { LOCALES, useTranslation, type Locale } from "./i18n";
import { langLabel } from "./lang";
import { translateReason } from "./reasons";
import { Search, type SearchIntent } from "./Search";
import {
  Badge,
  Button,
  EmptyState,
  ListRow,
  PageHeader,
  StatusBadge,
  Toasts,
  type ToastItem,
  type Tone,
} from "./ui";
import "./style.css";

type Tab = "search" | "library" | "downloads" | "wishlist" | "settings";
type AuthView = "login" | "register" | "totp";
const tabs: readonly Tab[] = [
  "search",
  "library",
  "downloads",
  "wishlist",
  "settings",
];

interface LoginResponse {
  success?: boolean;
  username?: string;
  role?: "admin" | "user";
  needs_totp?: boolean;
  session_pending?: string;
  backup_code_used?: boolean;
  error?: string;
}
interface RegisterResponse {
  success?: boolean;
  token?: string;
  username?: string;
  role?: "admin" | "user";
  error?: string;
}

function App(): React.JSX.Element {
  const { t, locale, setLanguage } = useTranslation();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [tab, setTab] = useState<Tab>("search");
  const [mobileNav, setMobileNav] = useState(false);
  const [navVersion, setNavVersion] = useState(0);
  const [searchIntent, setSearchIntent] = useState<SearchIntent>();
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setTab("search");
        requestAnimationFrame(() =>
          document.getElementById("search-input")?.focus(),
        );
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  // Notices stack (three at most), close on click or after 6 s; the same
  // text twice refreshes the existing toast instead of doubling it. Children
  // keep the plain `setNotice(text)` call they always had.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const dismiss = useCallback(
    (id: number) => setToasts((old) => old.filter((item) => item.id !== id)),
    [],
  );
  const setNotice = useCallback(
    (text: string) => {
      if (!text) return;
      const id = ++toastId.current;
      setToasts((old) =>
        [...old.filter((item) => item.text !== text), { id, text }].slice(-3),
      );
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const notice = toasts[toasts.length - 1]?.text ?? "";
  const refreshAuth = async (): Promise<void> =>
    setAuth(await authStatus());
  useEffect(() => {
    void refreshAuth().catch((e: unknown) =>
      setNotice(e instanceof Error ? e.message : t("app_unreachable")),
    );
  }, []);
  useEffect(() => {
    setUnauthorizedHandler(() =>
      setAuth((previous) => ({
        ...previous,
        has_users: previous?.has_users ?? true,
        oidc_enabled: previous?.oidc_enabled ?? false,
        authenticated: false,
      })),
    );
    return () => setUnauthorizedHandler(undefined);
  }, []);
  // Header activity pill: a 15 s poll of /api/downloads, paused while hidden.
  // There is no job stream server-side, so nothing here claims to be live.
  const [activeDownloads, setActiveDownloads] = useState(0);
  const authenticated = auth?.authenticated === true;
  useEffect(() => {
    if (!authenticated) return;
    let dead = false;
    async function poll() {
      if (dead || document.hidden) return;
      try {
        const data = await api<{
          downloads?: DownloadJob[];
          jobs?: DownloadJob[];
        }>("/api/downloads");
        if (!dead)
          setActiveDownloads(
            (data.downloads ?? data.jobs ?? []).filter((job) =>
              activeStatuses.has(job.status),
            ).length,
          );
      } catch {
        /* The Downloads tab reports its own errors; the pill just keeps its value. */
      }
    }
    void poll();
    const interval = window.setInterval(() => void poll(), 15000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      dead = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [authenticated]);
  if (auth === null)
    return (
      <main className="p-8 text-slate-200" aria-busy="true">
        {notice ? (
          <>
            <p role="alert">{notice}</p>
            <button
              onClick={() => {
                setToasts([]);
                void refreshAuth().catch((e) => setNotice(String(e)));
              }}
            >
              {t("retry")}
            </button>
          </>
        ) : (
          t("app_loading")
        )}
      </main>
    );
  if (!auth.authenticated)
    return (
      <AuthScreen
        auth={auth}
        onAuthenticated={refreshAuth}
        toasts={toasts}
        onDismiss={dismiss}
        setNotice={setNotice}
      />
    );
  return (
    <div
      id="app"
      className="min-h-screen bg-slate-950 text-slate-200 font-sans"
    >
      <Toasts items={toasts} closeLabel={t("close")} onClose={dismiss} />
      <header className="relative bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between">
          <div className="flex items-center gap-2">
            <button
              className="hamburger-btn"
              data-action="toggleMobileNav"
              aria-label={t("nav_menu")}
              aria-expanded={mobileNav}
              aria-controls="main-nav"
              onClick={() => setMobileNav(!mobileNav)}
            >
              ☰
            </button>
            <img src="/static/logo.svg" alt="" aria-hidden="true" className="h-7 w-7" />
            <h1 className="text-lg font-bold text-white">Librarr</h1>
          </div>
          <div className="flex gap-3 items-center">
            {activeDownloads > 0 && (
              <button
                type="button"
                id="header-active-downloads"
                data-action="openDownloads"
                title={t("active_downloads_title", { n: activeDownloads })}
                aria-label={t("active_downloads_title", { n: activeDownloads })}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 min-h-[1.75rem] text-xs font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                onClick={() => {
                  setTab("downloads");
                  setNavVersion((x) => x + 1);
                  setMobileNav(false);
                }}
              >
                <span aria-hidden="true">⬇</span>
                {activeDownloads}
              </button>
            )}
            <select
              id="language-select"
              data-action="selectLanguage"
              aria-label={t("language_select")}
              value={locale}
              onChange={(e) => setLanguage(e.target.value as Locale)}
              className="bg-slate-800 text-slate-100 border border-slate-600 rounded px-2 py-1 text-sm"
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()}
                </option>
              ))}
            </select>
            <span id="header-username">{auth.username}</span>
            <span id="header-role">{auth.role}</span>
            <button
              data-action="doLogout"
              className="text-sm text-slate-300 hover:text-white"
              onClick={() =>
                void api("/api/logout", { method: "POST" })
                  .then(() => setAuth({ ...auth, authenticated: false }))
                  .catch((e) => setNotice(String(e)))
              }
            >
              {t("sign_out")}
            </button>
          </div>
        </div>
        <nav
          id="main-nav"
          aria-label={t("nav_primary")}
          className={`max-w-7xl mx-auto px-2 flex flex-wrap gap-1 ${mobileNav ? "mobile-open" : ""}`}
        >
          {tabs.map((item) => (
            <button
              key={item}
              data-action="switchTab"
              data-arg={item}
              data-tab={item}
              onClick={() => {
                setTab(item);
                setNavVersion((x) => x + 1);
                setMobileNav(false);
              }}
              aria-current={tab === item ? "page" : undefined}
              className={`nav-tab px-2 py-2 ${tab === item ? "active" : ""}`}
            >
              {t(
                (
                  {
                    search: "nav_search",
                    library: "nav_library",
                    downloads: "nav_downloads",
                    wishlist: "nav_wishlist",
                    settings: "nav_settings",
                  } as const
                )[item],
              )}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto p-4">
        <Search
          setNotice={setNotice}
          intent={searchIntent}
          active={tab === "search"}
          admin={auth.role === "admin"}
        />
        {tab === "wishlist" && (
          <Wanted
            key={navVersion}
            admin={auth.role === "admin"}
            setNotice={setNotice}
            onSearch={(query, media) => {
              setSearchIntent({ query, media, sequence: Date.now() });
              setTab("search");
            }}
          />
        )}
        {tab === "settings" && (
          <Settings admin={auth.role === "admin"} setNotice={setNotice} />
        )}
        {tab === "library" && <Library setNotice={setNotice} />}
        {tab === "downloads" && <Downloads setNotice={setNotice} />}
      </main>
    </div>
  );
}

function AuthScreen({
  auth,
  onAuthenticated,
  toasts,
  onDismiss,
  setNotice,
}: {
  auth: AuthStatus;
  onAuthenticated: () => Promise<void>;
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
  setNotice: (message: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [view, setView] = useState<AuthView>(
    auth.has_users ? "login" : "register",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () => setView(auth.has_users ? "login" : "register"),
    [auth.has_users],
  );
  async function login(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!username.trim() || !password)
      return setNotice(t("err_credentials_required"));
    setBusy(true);
    try {
      const result = await api<LoginResponse>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!result.success)
        return setNotice(result.error ?? t("err_invalid_credentials"));
      if (result.needs_totp) {
        setPending(result.session_pending ?? "");
        setCode("");
        setView("totp");
        return;
      }
      await onAuthenticated();
      setNotice(t("signed_in"));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("err_connection"));
    } finally {
      setBusy(false);
    }
  }
  async function register(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!username.trim() || !password)
      return setNotice(t("err_credentials_required"));
    setBusy(true);
    try {
      const result = await api<RegisterResponse>("/api/register", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
          ...(invite.trim() ? { invite_code: invite.trim() } : {}),
        }),
      });
      if (!result.success)
        return setNotice(result.error ?? t("registration_failed"));
      if (result.token) {
        await onAuthenticated();
        setNotice(t("admin_created"));
      } else {
        setPassword("");
        setInvite("");
        setView("login");
        setNotice(t("account_created"));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("err_connection"));
    } finally {
      setBusy(false);
    }
  }
  async function verifyTOTP(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!code.trim()) return setNotice(t("totp_enter_any"));
    setBusy(true);
    try {
      const result = await api<LoginResponse>("/api/login/totp", {
        method: "POST",
        body: JSON.stringify({ session_pending: pending, code: code.trim() }),
      });
      if (!result.success)
        return setNotice(result.error ?? t("err_invalid_code"));
      await onAuthenticated();
      setNotice(
        result.backup_code_used ? t("backup_code_used") : t("signed_in"),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("err_connection"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      id="login-modal"
      className="min-h-screen bg-slate-950 flex items-center justify-center p-4"
    >
      <Toasts items={toasts} closeLabel={t("close")} onClose={onDismiss} />
      <section
        className="bg-slate-900 border border-slate-700 rounded-xl p-8 w-full max-w-md shadow-2xl"
        aria-labelledby="auth-title"
      >
        <h1 id="auth-title" className="text-xl font-bold text-white">
          Librarr
        </h1>
        <p id="login-subtitle" className="text-sm text-slate-400 mb-5">
          {view === "register"
            ? auth.has_users
              ? t("create_your_account")
              : t("create_admin_account")
            : view === "totp"
              ? t("s_totp_title")
              : t("login_subtitle")}
        </p>
        {!auth.has_users && (
          <p id="first-run-banner" className="mb-4 text-sm text-indigo-200">
            {t("first_run_banner")}
          </p>
        )}
        {view === "login" && (
          <form id="login-form" onSubmit={login} className="space-y-4">
            <Field
              id="login-username"
              label={t("label_username")}
              value={username}
              onChange={setUsername}
              autoComplete="username"
            />
            <Field
              id="login-password"
              label={t("label_password")}
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="current-password"
            />
            <button type="submit" disabled={busy}>
              {busy ? t("signing_in") : t("login_sign_in")}
            </button>
            {auth.oidc_enabled && (
              <a
                id="oidc-login-link"
                href="/auth/oidc/login"
                className="block text-center"
              >
                {t("login_with", {
                  provider: auth.oidc_provider_name || "SSO",
                })}
              </a>
            )}
            <p id="login-register-link">
              {t("login_no_account_text")}{" "}
              <button
                type="button"
                data-action="showRegisterForm"
                onClick={() => setView("register")}
              >
                {t("login_register")}
              </button>
            </p>
          </form>
        )}
        {view === "register" && (
          <form id="register-form" onSubmit={register} className="space-y-4">
            <Field
              id="register-username"
              label={t("label_username")}
              value={username}
              onChange={setUsername}
              autoComplete="username"
            />
            <Field
              id="register-password"
              label={t("label_password")}
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="new-password"
            />
            <Field
              id="register-invite-code"
              label={t("label_invite_code")}
              value={invite}
              onChange={setInvite}
              hidden={!auth.has_users}
            />
            <button type="submit" disabled={busy}>
              {busy ? t("creating") : t("create_account")}
            </button>
            {auth.has_users && (
              <button
                type="button"
                data-action="showLoginForm"
                onClick={() => setView("login")}
              >
                {t("back_to_login")}
              </button>
            )}
          </form>
        )}
        {view === "totp" && (
          <form id="totp-form" onSubmit={verifyTOTP} className="space-y-4">
            <Field
              id="totp-code"
              label={t("totp_code_any_label")}
              value={code}
              onChange={setCode}
              autoComplete="one-time-code"
            />
            <button type="submit" disabled={busy}>
              {busy ? t("verifying") : t("totp_verify")}
            </button>
            <button
              type="button"
              data-action="showLoginForm"
              onClick={() => {
                setPending("");
                setView("login");
              }}
            >
              {t("back_to_login")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hidden = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  hidden?: boolean;
}): React.JSX.Element {
  if (hidden) return <></>;
  return (
    <label className="block">
      <span className="block text-sm mb-1">{label}</span>
      <input
        id={id}
        type={type}
        required
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2"
      />
    </label>
  );
}

function WantedOutcomeTable({
  outcome,
  dryRun,
  onClose,
}: {
  outcome: WantedOutcome;
  dryRun: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { locale, t } = useTranslation();
  const decisions = outcome.decisions ?? [];
  return (
    <div
      data-wanted-outcome
      className="mt-1 border-t border-slate-800 pt-3 space-y-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-slate-300">
          <strong className="text-slate-100">{outcome.action ?? ""}</strong> —{" "}
          <span title={outcome.reason ?? ""}>
            {translateReason(locale, outcome.reason)}
          </span>
          {outcome.candidate && (
            <span className="text-slate-400"> ({outcome.candidate})</span>
          )}
          {dryRun && <span className="text-slate-400"> {t("dry_run")}</span>}
        </p>
        <Button
          size="sm"
          variant="ghost"
          data-action="closeWantedOutcome"
          onClick={onClose}
        >
          {t("close")}
        </Button>
      </div>
      {decisions.length > 0 && (
        <div className="overflow-x-auto">
          <table
            className="text-sm w-full"
            data-wanted-decisions={decisions.length}
          >
            <thead className="text-slate-400 text-left">
              <tr>
                <th aria-label={t("wanted_th_accepted")} className="pr-2 py-1" />
                <th className="pr-3 py-1 font-medium">{t("wanted_th_format")}</th>
                <th className="pr-3 py-1 font-medium">{t("wanted_th_score")}</th>
                <th className="pr-3 py-1 font-medium">
                  {t("wanted_th_release")}
                </th>
                <th className="py-1 font-medium">{t("wanted_th_decision")}</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {decisions.map((decision, index) => (
                <tr
                  key={`${decision.title ?? ""}:${decision.format ?? ""}:${index}`}
                  className={
                    decision.accepted ? "text-emerald-300" : "text-slate-400"
                  }
                >
                  <td className="pr-2 py-1">
                    {decision.accepted ? (decision.upgrade ? "↑" : "✓") : "✗"}
                  </td>
                  <td className="pr-3 py-1 font-mono">
                    {(decision.format ?? "?").toUpperCase()}
                  </td>
                  <td className="pr-3 py-1 tabular-nums">
                    {Math.round(decision.score ?? 0)}
                  </td>
                  <td
                    className="pr-3 py-1 whitespace-normal [overflow-wrap:anywhere]"
                    title={decision.title ?? ""}
                  >
                    {decision.title ?? ""}{" "}
                    <span className="text-slate-400">
                      {decision.source ?? ""}
                    </span>
                  </td>
                  <td
                    className="py-1 whitespace-normal"
                    title={decision.reason ?? ""}
                  >
                    {translateReason(locale, decision.reason)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const wantedStates = [
  "missing",
  "upgrade",
  "downloading",
  "satisfied",
  "unmonitored",
] as const;
type WantedState = (typeof wantedStates)[number];
const isWantedState = (value: string): value is WantedState =>
  (wantedStates as readonly string[]).includes(value);
const wantedTone: Record<WantedState, Tone> = {
  missing: "danger",
  upgrade: "warn",
  downloading: "info",
  satisfied: "ok",
  unmonitored: "neutral",
};

function Wanted({
  onSearch,
  admin,
  setNotice,
}: {
  admin: boolean;
  onSearch: (query: string, media: MediaType) => void;
  setNotice: (s: string) => void;
}): React.JSX.Element {
  const { locale, t } = useTranslation();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [media, setMedia] = useState<MediaType>("ebook");
  const [profileID, setProfileID] = useState(0);
  useEffect(() => {
    if (!form) return;
    function close(e: KeyboardEvent) {
      if (e.key === "Escape") setForm(false);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [form]);
  const [details, setDetails] = useState<
    Record<number, { outcome: WantedOutcome; dryRun: boolean }>
  >({});
  const [upgrades, setUpgrades] = useState(true);
  // Reminder of the active language preference. /api/settings is admin-only
  // and older servers do not expose the keys: the reminder is simply absent.
  const [langPref, setLangPref] = useState<{
    preferred: string[];
    mode: "prefer" | "require";
  }>();
  useEffect(() => {
    if (!admin) return;
    let active = true;
    void api<{ language_preferred?: string; language_mode?: string }>(
      "/api/settings",
    )
      .then((settings) => {
        if (!active) return;
        setLangPref({
          preferred: String(settings.language_preferred ?? "")
            .split(",")
            .map((code) => code.trim().toLowerCase())
            .filter(Boolean),
          mode: settings.language_mode === "require" ? "require" : "prefer",
        });
      })
      .catch(() => {
        /* Optional hint: the list works without it. */
      });
    return () => {
      active = false;
    };
  }, [admin]);
  const load = async () => {
    try {
      const [wanted, quality] = await Promise.all([
        api<{
          items?: WishlistItem[];
          counts?: Record<string, number>;
          upgrades_enabled?: boolean;
        }>("/api/wishlist"),
        api<Profile[]>("/api/quality-profiles"),
      ]);
      setItems(wanted.items ?? []);
      setCounts(wanted.counts ?? {});
      setUpgrades(wanted.upgrades_enabled !== false);
      setProfiles(quality);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("load_failed"));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const patch = async (id: number, body: Partial<WishlistItem>) => {
    setItems((old) =>
      old.map((item) => (item.id === id ? { ...item, ...body } : item)),
    );
    try {
      await api(`/api/wishlist/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("update_failed"));
      await load();
    }
  };
  const run = async (id: number, dryRun: boolean) => {
    try {
      const response = await api<{ outcome?: WantedOutcome }>(
        `/api/wishlist/${id}/search`,
        { method: "POST", body: JSON.stringify({ dry_run: dryRun }) },
      );
      const outcome = response.outcome ?? {};
      setDetails((previous) => ({ ...previous, [id]: { outcome, dryRun } }));
      setNotice(
        t("wanted_search_started", {
          reason: translateReason(locale, outcome.reason ?? outcome.action),
        }),
      );
      await load();
    } catch (e) {
      setNotice(
        t("search_failed", { msg: e instanceof Error ? e.message : String(e) }),
      );
    }
  };
  const shown = items.filter((item) => !filter || item.state === filter);
  const summary = items.length
    ? wantedStates
        .filter((state) => counts[state])
        .map(
          (state) =>
            `${counts[state]} ${t(`wanted_state_${state}`).toLowerCase()}`,
        )
        .join(" · ")
    : t("wanted_intro");
  const field = "grid gap-1 text-sm text-slate-300";
  return (
    <section id="tab-wishlist" className="tab-content active">
      <PageHeader
        title={t("wishlist_title")}
        subtitle={
          <>
            <span id="wanted-summary">{summary}</span>
            {langPref && langPref.preferred.length > 0 && (
              <span id="wanted-language" className="text-slate-400">
                {" · "}
                {t("wanted_language_hint", {
                  langs: langPref.preferred.map(langLabel).join(", "),
                  mode: t(
                    langPref.mode === "require"
                      ? "s_language_mode_require"
                      : "s_language_mode_prefer",
                  ).toLowerCase(),
                })}
              </span>
            )}
          </>
        }
      >
        <select
          id="wanted-filter"
          aria-label={t("wanted_filter_label")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">{t("wanted_filter_all")}</option>
          {wantedStates.map((state) => (
            <option key={state} value={state}>
              {t(`wanted_state_${state}`)}
            </option>
          ))}
        </select>
        {admin && (
          <Button
            id="wanted-search-all"
            variant="secondary"
            data-action="runSchedulerNow"
            onClick={() =>
              void api("/api/scheduler/run?wait=1", { method: "POST" })
                .then(load)
                .catch((e) => setNotice(String(e)))
            }
          >
            {t("wanted_search_all")}
          </Button>
        )}
        <Button
          variant="primary"
          data-action="showWishlistForm"
          onClick={() => setForm(true)}
        >
          {t("wishlist_add_book")}
        </Button>
      </PageHeader>
      {!upgrades && items.length > 0 && (
        <p
          id="wanted-upgrades-off"
          className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
        >
          {t("wanted_upgrades_off")}
        </p>
      )}
      {form && (
        <form
          id="wishlist-form"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void api("/api/wishlist", {
              method: "POST",
              body: JSON.stringify({
                title,
                author,
                media_type: media,
                quality_profile_id: profileID,
              }),
            })
              .then(() => {
                setForm(false);
                setTitle("");
                return load();
              })
              .catch((e) => setNotice(String(e)));
          }}
        >
          <label className={field}>
            <span>{t("ph_wishlist_title")}</span>
            <input
              id="wl-title"
              placeholder={t("ph_wishlist_title")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className={field}>
            <span>{t("ph_wishlist_author")}</span>
            <input
              id="wl-author"
              placeholder={t("ph_wishlist_author")}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          <label className={field}>
            <span>{t("wanted_label_type")}</span>
            <select
              id="wl-type"
              value={media}
              onChange={(e) => setMedia(e.target.value as MediaType)}
            >
              {(["ebook", "audiobook", "manga"] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`opt_${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            <span>{t("wanted_label_profile")}</span>
            <select
              id="wl-profile"
              value={profileID}
              onChange={(e) => setProfileID(Number(e.target.value))}
            >
              <option value="0">{t("wanted_profile_default")}</option>
              {profiles
                .filter((p) => p.media_type === media)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" data-action="addWishlistItem">
              {t("add")}
            </Button>
            <Button variant="ghost" onClick={() => setForm(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}
      {!items.length && (
        <EmptyState
          id="wishlist-empty"
          title={t("wishlist_empty")}
          hint={t("wanted_intro")}
        />
      )}
      <div id="wishlist-list">
        {shown.map((item) => {
          const raw = item.state ?? "missing";
          const state = isWantedState(raw) ? raw : undefined;
          const detail = details[item.id];
          const manual = (
            <Button
              size="sm"
              variant={admin ? "ghost" : "primary"}
              data-action="searchWishlistItem"
              onClick={() => onSearch(item.title, item.media_type)}
            >
              {t("wanted_search_manual")}
            </Button>
          );
          return (
            <ListRow
              key={item.id}
              data-wanted-id={item.id}
              className="p-4"
              leading={
                <StatusBadge
                  tone={state ? wantedTone[state] : "neutral"}
                  pulse={state === "downloading"}
                  data-wanted-state={raw}
                >
                  {state ? t(`wanted_state_${state}`) : raw}
                </StatusBadge>
              }
              actions={
                <>
                  {admin && (
                    <Button
                      size="sm"
                      variant="primary"
                      data-action="searchWantedNow"
                      onClick={() => void run(item.id, false)}
                    >
                      {t("wanted_search_now")}
                    </Button>
                  )}
                  {manual}
                  {admin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      data-action="explainWanted"
                      onClick={() => void run(item.id, true)}
                    >
                      {t("wanted_explain")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    data-action="deleteWishlistItem"
                    className="ml-auto sm:ml-2"
                    onClick={() => {
                      if (
                        !window.confirm(
                          t("wanted_confirm_delete", { title: item.title }),
                        )
                      )
                        return;
                      void api(`/api/wishlist/${item.id}`, {
                        method: "DELETE",
                      })
                        .then(load)
                        .catch((e) => setNotice(String(e)));
                    }}
                  >
                    {t("delete")}
                  </Button>
                </>
              }
              footer={
                detail ? (
                  <WantedOutcomeTable
                    {...detail}
                    onClose={() =>
                      setDetails((previous) => {
                        const next = { ...previous };
                        delete next[item.id];
                        return next;
                      })
                    }
                  />
                ) : undefined
              }
            >
              <h4 className="text-sm font-semibold text-white [overflow-wrap:anywhere]">
                {item.title}
              </h4>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                {item.author && <span>{item.author}</span>}
                {item.current_format && (
                  <Badge tone="format">
                    {t("wanted_on_disk", {
                      format: item.current_format.toUpperCase(),
                    })}
                  </Badge>
                )}
                <label className="inline-flex items-center gap-1.5 text-slate-300">
                  <input
                    data-action-change="toggleWantedMonitored"
                    type="checkbox"
                    checked={item.monitored ?? true}
                    onChange={(e) =>
                      void patch(item.id, { monitored: e.target.checked })
                    }
                  />
                  {t("wanted_monitored")}
                </label>
                <select
                  data-action-change="setWantedProfile"
                  aria-label={t("wanted_label_profile")}
                  value={item.quality_profile_id ?? 0}
                  onChange={(e) =>
                    void patch(item.id, {
                      quality_profile_id: Number(e.target.value),
                    })
                  }
                >
                  <option value="0">
                    {!item.quality_profile_id && item.profile_name
                      ? item.profile_name
                      : t("wanted_profile_default")}
                  </option>
                  {profiles
                    .filter((p) => p.media_type === item.media_type)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
              {item.last_result && (
                <p
                  className="mt-1 text-sm text-slate-300"
                  title={item.last_result}
                >
                  {t("wanted_last", {
                    result: translateReason(locale, item.last_result),
                  })}
                </p>
              )}
            </ListRow>
          );
        })}
      </div>
    </section>
  );
}

function Settings({
  admin,
  setNotice,
}: {
  admin: boolean;
  setNotice: (message: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [formats, setFormats] = useState<Record<string, string[]>>({});
  const [authors, setAuthors] = useState<Author[]>([]);
  const [authorInterval, setAuthorInterval] = useState(7);
  const [authorAutoAdd, setAuthorAutoAdd] = useState(true);
  const [name, setName] = useState("");
  const [media, setMedia] = useState<MediaType>("ebook");
  const load = async () => {
    if (!admin) return;
    try {
      const [quality, known, monitored] = await Promise.all([
        api<Profile[]>("/api/quality-profiles"),
        api<{ formats: Record<string, string[]> }>(
          "/api/quality-profiles/formats",
        ),
        api<{ authors?: Author[] }>("/api/authors"),
      ]);
      setProfiles(quality);
      setFormats(known.formats);
      setAuthors(monitored.authors ?? []);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("settings_failed"));
    }
  };
  useEffect(() => {
    void load();
  }, [admin]);
  if (!admin)
    return (
      <section id="tab-settings" className="tab-content active">
        <AuthSettings />
        <AccountSettings />
      </section>
    );
  const saveProfile = async (profile: Profile) => {
    try {
      await api(
        typeof profile.id === "string"
          ? "/api/quality-profiles"
          : `/api/quality-profiles/${profile.id}`,
        {
          method: typeof profile.id === "string" ? "POST" : "PUT",
          body: JSON.stringify({ ...profile, id: undefined }),
        },
      );
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("profile_save_failed"));
    }
  };
  const edit = (id: Profile["id"], fn: (profile: Profile) => Profile) =>
    setProfiles((rows) => rows.map((row) => (row.id === id ? fn(row) : row)));
  const checkAuthor = async (id: number) => {
    try {
      const data = await api<{ result?: AuthorCheckResult }>(
        `/api/authors/${id}/check`,
        { method: "POST" },
      );
      const result = data.result ?? {};
      const summary = result.error
        ? result.error
        : result.baseline
          ? t("author_baseline", { seen: result.seen ?? 0 })
          : [
              t("author_new", { count: result.new?.length ?? 0 }),
              result.added ? t("author_added", { count: result.added }) : "",
            ]
              .filter(Boolean)
              .join(", ");
      setNotice(
        t("author_checked", { author: result.author ?? "", summary }),
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("failed_save"));
    }
  };
  return (
    <section id="tab-settings" className="tab-content active">
      <AuthSettings />
      <AccountSettings />
      <GeneralSettings />
      <div>
        <button
          data-action="qpNew"
          data-arg={media}
          onClick={() =>
            setProfiles((rows) => [
              ...rows,
              {
                id: `new-${Date.now()}`,
                name: "",
                media_type: media,
                format_ranking: [...(formats[media] ?? [])].slice(0, 2),
                upgrade_allowed: true,
              },
            ])
          }
        >
          {t("profile_new")}
        </button>
        <select
          aria-label={t("media_type_label")}
          value={media}
          onChange={(e) => setMedia(e.target.value as MediaType)}
        >
          {(["ebook", "audiobook", "manga"] as const).map((x) => (
            <option key={x} value={x}>
              {t(`opt_${x}`)}
            </option>
          ))}
        </select>
      </div>
      <div id="quality-profiles-list">
        {profiles.map((profile) => (
          <article data-qp={profile.id} key={profile.id}>
            <input
              data-field="name"
              value={profile.name}
              onChange={(e) =>
                edit(profile.id, (p) => ({ ...p, name: e.target.value }))
              }
            />
            {profile.builtin && <span>{t("profile_builtin")}</span>}
            <div data-qp-ranking>
              {profile.format_ranking.map((format, index) => (
                <div data-qp-row={format} key={format}>
                  <input
                    data-action-change="qpToggleFormat"
                    data-format={format}
                    type="checkbox"
                    checked
                    onChange={() =>
                      edit(profile.id, (p) => {
                        const ranking = p.format_ranking.filter(
                          (x) => x !== format,
                        );
                        return {
                          ...p,
                          format_ranking: ranking,
                          cutoff_format: ranking.includes(p.cutoff_format || "")
                            ? p.cutoff_format
                            : ranking[0] || "",
                        };
                      })
                    }
                  />
                  {format}
                  <button
                    data-action="qpMove"
                    data-format={format}
                    data-dir="-1"
                    disabled={index === 0}
                    onClick={() =>
                      edit(profile.id, (p) => {
                        const r = [...p.format_ranking];
                        [r[index - 1]!, r[index]!] = [r[index]!, r[index - 1]!];
                        return { ...p, format_ranking: r };
                      })
                    }
                  >
                    ▲
                  </button>
                  <button
                    data-action="qpMove"
                    data-format={format}
                    data-dir="1"
                    disabled={index === profile.format_ranking.length - 1}
                    onClick={() =>
                      edit(profile.id, (p) => {
                        const r = [...p.format_ranking];
                        [r[index]!, r[index + 1]!] = [r[index + 1]!, r[index]!];
                        return { ...p, format_ranking: r };
                      })
                    }
                  >
                    ▼
                  </button>
                </div>
              ))}
            </div>
            {(formats[profile.media_type] || [])
              .filter((format) => !profile.format_ranking.includes(format))
              .map((format) => (
                <label className="block" key={format}>
                  <input
                    data-action-change="qpToggleFormat"
                    data-format={format}
                    type="checkbox"
                    checked={false}
                    onChange={() =>
                      edit(profile.id, (p) => ({
                        ...p,
                        format_ranking: [...p.format_ranking, format],
                        cutoff_format: p.cutoff_format || format,
                      }))
                    }
                  />
                  {t("profile_format_not_grabbed", {
                    format: format.toUpperCase(),
                  })}
                </label>
              ))}
            <select
              data-field="cutoff_format"
              value={profile.cutoff_format ?? ""}
              onChange={(e) =>
                edit(profile.id, (p) => ({
                  ...p,
                  cutoff_format: e.target.value,
                }))
              }
            >
              {profile.format_ranking.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={profile.upgrade_allowed ?? false}
                onChange={(e) =>
                  edit(profile.id, (p) => ({
                    ...p,
                    upgrade_allowed: e.target.checked,
                  }))
                }
              />
              {t("profile_upgrades")}
            </label>
            <label>
              {t("profile_size_range")}{" "}
              <input
                data-field="preferred_size_min"
                type="number"
                min="0"
                value={Math.round((profile.preferred_size_min ?? 0) / 1048576)}
                onChange={(e) =>
                  edit(profile.id, (p) => ({
                    ...p,
                    preferred_size_min:
                      Math.max(0, Number(e.target.value) || 0) * 1048576,
                  }))
                }
              />
              <span>{t("size_to")}</span>
              <input
                data-field="preferred_size_max"
                type="number"
                min="0"
                value={Math.round((profile.preferred_size_max ?? 0) / 1048576)}
                onChange={(e) =>
                  edit(profile.id, (p) => ({
                    ...p,
                    preferred_size_max:
                      Math.max(0, Number(e.target.value) || 0) * 1048576,
                  }))
                }
              />
            </label>
            <button
              data-action="qpSave"
              onClick={() => void saveProfile(profile)}
            >
              {t("save")}
            </button>
            {!profile.builtin && (
              <button
                data-action="qpDelete"
                onClick={() => {
                  if (
                    !window.confirm(
                      t("confirm_delete_profile", { name: profile.name }),
                    )
                  )
                    return;
                  if (typeof profile.id === "string") {
                    setProfiles((old) =>
                      old.filter((p) => p.id !== profile.id),
                    );
                    return;
                  }
                  void api(`/api/quality-profiles/${profile.id}`, {
                    method: "DELETE",
                  })
                    .then(load)
                    .catch((e) => setNotice(String(e)));
                }}
              >
                {t("delete")}
              </button>
            )}
          </article>
        ))}
      </div>
      <div>
        <input
          id="author-name"
          aria-label={t("s_author_name")}
          placeholder={t("s_author_name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label>
          {t("s_author_interval")}
          <input
            id="author-interval"
            type="number"
            min="1"
            value={authorInterval}
            onChange={(e) => setAuthorInterval(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            id="author-auto-add"
            type="checkbox"
            checked={authorAutoAdd}
            onChange={(e) => setAuthorAutoAdd(e.target.checked)}
          />{" "}
          {t("s_author_auto_add")}
        </label>
        <button
          data-action="addAuthor"
          onClick={() =>
            void api("/api/authors/monitor", {
              method: "POST",
              body: JSON.stringify({
                name,
                check_interval_days: authorInterval,
                auto_add: authorAutoAdd,
              }),
            })
              .then(() => {
                setName("");
                return load();
              })
              .catch((e) => setNotice(String(e)))
          }
        >
          {t("s_author_follow")}
        </button>
        {authors.map((a) => (
          <article data-author-id={a.id} key={a.id}>
            <strong>{a.name}</strong>
            <p className="text-xs text-slate-400">
              {a.seen_works
                ? `${t("author_works_known", { n: a.seen_works })} · ${a.last_checked && !a.last_checked.startsWith("0001") ? new Date(a.last_checked).toLocaleString() : t("never").toLowerCase()}`
                : t("author_never_checked")}
            </p>
            <input
              data-action-change="authorInterval"
              type="number"
              value={a.check_interval_days}
              onChange={(e) =>
                void api(`/api/authors/${a.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    check_interval_days: Number(e.target.value),
                  }),
                })
                  .then(load)
                  .catch((e) => setNotice(String(e)))
              }
            />
            <label>
              <input
                data-action-change="authorAutoAdd"
                type="checkbox"
                checked={a.auto_add}
                onChange={(e) => {
                  const auto_add = e.target.checked;
                  setAuthors((old) =>
                    old.map((row) =>
                      row.id === a.id ? { ...row, auto_add } : row,
                    ),
                  );
                  void api(`/api/authors/${a.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ auto_add }),
                  })
                    .then(load)
                    .catch((e) => {
                      setNotice(String(e));
                      void load();
                    });
                }}
              />
              {t("author_auto_add_short")}
            </label>
            <button
              data-action="checkAuthor"
              onClick={() => void checkAuthor(a.id)}
            >
              {t("author_check_now")}
            </button>
            <button
              data-action="deleteAuthor"
              onClick={() => {
                if (window.confirm(t("confirm_unfollow", { name: a.name })))
                  void api(`/api/authors/${a.id}`, { method: "DELETE" })
                    .then(load)
                    .catch((e) => setNotice(String(e)));
              }}
            >
              {t("author_unfollow")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
const root = document.getElementById("root");
if (root === null) throw new Error("Missing root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
