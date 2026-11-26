"use client";
import { createPortal } from "react-dom";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  Clock3,
  Edit3,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  database,
  errorMessage,
  usesReplacementSchema,
} from "../../lib/supabase";
import {
  emptyDashboardData,
  loadDashboardData,
  type Book,
  type DashboardData,
  type Visit,
} from "./dashboard-data";
import { AdminBonChat } from "./AdminBonChat";
import { CompleteAddVolume } from "./CompleteAddVolume";
import { BulkAddBooks } from "./BulkAddBooks";
import { EditBookCover } from "./EditBookCover";
import { EditCopyLocation } from "./EditCopyLocation";
import { CatalogueEditor } from "./CatalogueEditor";
import { ReaderCheckIn } from "./ReaderCheckIn";
import { AnalyticsWorkspace } from "./AnalyticsWorkspace";
import { CheckoutQueue } from "./CheckoutQueue";
import { QuestManagement } from "./QuestManagement";
import { TopUpTerminal } from "./TopUpTerminal";
import { ReaderCardManagement } from "./ReaderCardManagement";
import { normalizePhysicalCardUid } from "../../lib/card-scanner";

type Page =
  "Overview" | "Analytics" | "Catalogue" | "Challenges" | "Readers" | "Top-up terminal";
type Data = DashboardData;
const nav: { icon: typeof LayoutDashboard; page: Page; label: string }[] = [
  { icon: LayoutDashboard, page: "Overview", label: "Overview" },
  { icon: ChartNoAxesCombined, page: "Analytics", label: "Analytics" },
  { icon: BookOpen, page: "Catalogue", label: "Book Management" },
  { icon: Trophy, page: "Challenges", label: "Quest" },
  { icon: Users, page: "Readers", label: "Readers" },
  { icon: Wallet, page: "Top-up terminal", label: "Top-up terminal" },
];
const statusTone: Record<string, string> = {
  "In Shelf": "bg-emerald-50 text-emerald-700 ring-emerald-100",
  "Being Read": "bg-amber-50 text-amber-800 ring-amber-100",
  "With Reader": "bg-amber-50 text-amber-800 ring-amber-100",
  "On Hold": "bg-amber-50 text-amber-800 ring-amber-100",
  "Damaged": "bg-rose-50 text-rose-700 ring-rose-100",
  "No copies": "bg-stone-50 text-stone-700 ring-stone-100",
  "Return Cart": "bg-rose-50 text-rose-700 ring-rose-100",
};
const replacementDb = () => database().schema("sora_v2");
const liveReadingSeconds = (balance: number, visit: Visit | undefined, now = Date.now()) => {
  if (!visit || visit.session_status !== "READING") return Math.max(0, balance * 60);
  const startedAt = new Date(visit.checked_in_at).getTime();
  if (!Number.isFinite(startedAt)) return Math.max(0, balance * 60);
  return Math.max(0, balance * 60 - Math.max(0, (now - startedAt) / 1000));
};
const formatReadingClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};
const shelveCopy = (copyId: number) =>
  usesReplacementSchema
    ? replacementDb().rpc("admin_shelve", { p_copy_id: copyId })
    : database().rpc("admin_shelve", { p_copy_id: copyId });
const verifyQuest = (progressId: number) =>
  usesReplacementSchema
    ? replacementDb().rpc("admin_complete_quest", {
        p_user_quest_id: progressId,
      })
    : database().rpc("admin_complete_quest", { p_progress_id: progressId });

export function AdminDashboard() {
  const [data, setData] = useState<Data>(emptyDashboardData);
  const [page, setPage] = useState<Page>("Overview");
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [bulkDrawer, setBulkDrawer] = useState(false);
  const [editingCover, setEditingCover] = useState<Book | null>(null);
  const [editingLocation, setEditingLocation] = useState<Book | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const nextData = await loadDashboardData();
      if (request === generation.current) {
        setData(nextData);
        setError("");
      }
    } catch (cause) {
      if (request === generation.current) setError(errorMessage(cause));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const refreshInterval = page === "Top-up terminal" || page === "Readers" ? 3000 : 30000;
    const timer = window.setInterval(() => void refresh(), refreshInterval);
    const changed = () => void refresh();
    window.addEventListener("quest-data-changed", changed);
    return () => { clearInterval(timer); window.removeEventListener("quest-data-changed", changed); };
  }, [page, refresh]);
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };
  const run = async (
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) => {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await action();
      if (result.error) throw result.error;
      await refresh();
      notify(success);
      return true;
    } catch (cause) {
      notify(errorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const name = (id: string | null) => {
    const reader = data.readers.find((item) => item.user_id === id);
    return reader
      ? `${reader.first_name} ${reader.last_name}`
      : "Walk-in visitor";
  };
  const active = data.visits.filter((visit) => visit.status === "ACTIVE");
  const rows = data.books.filter((book) =>
    [book.title, book.author, ...book.book_genres.map((genre) => genre.genre)]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const noticeIsError =
    /not found|error|failed|denied|forbidden|violates|unable|invalid/i.test(
      notice,
    );
  const content =
    page === "Overview" ? (
      <Overview data={data} setPage={setPage} name={name} run={run} />
    ) : page === "Analytics" ? (
      <AnalyticsWorkspace data={data} />
    ) : page === "Catalogue" ? (
      <CatalogueEditor
        rows={rows}
        data={data}
        query={query}
        setQuery={setQuery}
        setDrawer={setDrawer}
        setBulkDrawer={setBulkDrawer}
        setEditingCover={setEditingCover}
        setEditingLocation={setEditingLocation}
        shelveCopy={(copyId) => run(() => shelveCopy(copyId), "Copy returned to shelf")}
        refreshData={refresh}
      />
    ) : page === "Challenges" ? (
      <QuestManagement data={data} name={name} run={run} />
    ) : page === "Readers" ? (
      <Readers data={data} active={active} name={name} run={run} />
    ) : (
      <TopUpTerminal data={data} name={name} run={run} />
    );
  return (
    <main className="admin-shell min-h-screen text-[#543822]">
      <div className="admin-atmosphere" aria-hidden="true">
        <span className="admin-atmosphere-glow admin-atmosphere-glow-one" />
        <span className="admin-atmosphere-glow admin-atmosphere-glow-two" />
        <span className="admin-atmosphere-orbit admin-atmosphere-orbit-one" />
        <span className="admin-atmosphere-orbit admin-atmosphere-orbit-two" />
        <span className="admin-atmosphere-sweep" />
        <span className="admin-atmosphere-star admin-atmosphere-star-one">✦</span>
        <span className="admin-atmosphere-star admin-atmosphere-star-two">✦</span>
        <span className="admin-atmosphere-star admin-atmosphere-star-three">✦</span>
      </div>
      <div className="relative z-10 flex min-h-screen">
        {navOpen && <button type="button" className="admin-nav-scrim" aria-label="Close navigation menu" onClick={() => setNavOpen(false)} />}
        <aside
          aria-hidden={!navOpen}
          inert={!navOpen}
          className={`admin-drawer sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden text-[#f8eddc] transition-[width] duration-300 ease-in-out ${navOpen ? "w-[264px]" : "w-0"}`}
        >
          <div className="flex h-16 w-[264px] shrink-0 items-center justify-between border-b border-white/10 px-4">
            <Logo />
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation menu"
              className="grid h-9 w-9 place-items-center rounded-xl text-[#543822] transition hover:bg-white/60"
            >
              <X size={18} />
            </button>
          </div>
          <nav
            className="flex-1 space-y-1.5 overflow-y-auto px-4 py-6"
            style={{ width: 264 }}
          >
            <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[.22em] text-[#c9a06f]">
              Workspace
            </p>
            {nav.map(({ icon: Icon, page: itemPage, label }) => (
              <button
                key={itemPage}
                onClick={() => { setPage(itemPage); if (window.innerWidth < 1024) setNavOpen(false); }}
                className={`admin-nav-item group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${page === itemPage ? "is-active bg-[#f9d219] text-[#543822] shadow-[0_6px_18px_rgba(249,210,25,.35)]" : "text-[#543822] hover:bg-white/60"}`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${page === itemPage ? "bg-[#543822]/15 text-[#543822]" : "bg-[#543822]/10 text-[#543822] group-hover:bg-[#543822]/15"}`}
                >
                  <Icon size={16} />
                </span>
                {label}
              </button>
            ))}
          </nav>
          <div className="w-[264px] border-t border-white/10 p-4">
            <button
              onClick={() =>
                void run(() => database().auth.signOut(), "Signed out")
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#543822] transition hover:bg-white/60"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>
        <section className="admin-workspace min-w-0 flex-1">
          <header className="admin-topbar sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#eadfd3] bg-[#fefefd]/85 px-4 backdrop-blur-xl sm:px-6">
            {!navOpen && (
              <>
                <button
                  onClick={() => setNavOpen((value) => !value)}
                  aria-label="Open navigation menu"
                  aria-expanded={navOpen}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#eadfd3] bg-white/70 text-[#543822] transition hover:border-[#c4800c]/40 hover:bg-[#f3d793]/40 active:scale-95"
                >
                  <Menu size={19} />
                </button>
                <Logo />
              </>
            )}
            <div className="admin-command-strip ml-auto flex min-w-0 items-center gap-3">
              <span className="admin-command-copy hidden min-w-0 items-center gap-2 md:flex">
                <Sparkles size={13} aria-hidden="true" />
                <span className="truncate">Library operations</span>
              </span>
              <span className="admin-command-divider hidden md:block" aria-hidden="true" />
              <span className="admin-live-status">
                <span className="admin-live-dot" aria-hidden="true" />
                System live
              </span>
            </div>
          </header>
          <div className="admin-content mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
            <div className="admin-page-heading mb-6 flex flex-col gap-3 border-b border-[#c4800c]/25 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-[#953410]">
                  <span className="h-px w-6 bg-[#c4800c]" />
                  {page === "Catalogue" ? "Book Management" : page === "Challenges" ? "Quest" : page}
                </p>
                <h1 className="font-serif text-2xl font-semibold tracking-tight text-[#543822] sm:text-3xl">
                  {page === "Overview" ? "Reading Room Today" : page === "Challenges" ? "Quest" : page}
                </h1>
                <p className="mt-1 text-xs text-[#806b59]">{page === "Overview" ? "A clear view of today’s library activity." : page === "Analytics" ? "Explore reading trends and verified activity." : page === "Catalogue" ? "Manage titles, copies, and shelf locations." : page === "Challenges" ? "Review quests and reader progress." : page === "Readers" ? "Manage members and library cards." : "Verify cards and add reading time."}</p>
              </div>
            </div>
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
              >
                {error}
              </div>
            )}
            {notice && (
              <div
                role={noticeIsError ? "alert" : "status"}
                aria-live="polite"
                className={`fixed right-5 top-5 z-[70] flex max-w-sm items-center gap-3 rounded-2xl px-5 py-4 text-sm font-bold shadow-[0_18px_50px_rgba(63,35,18,.28)] ${noticeIsError ? "border border-rose-300 bg-rose-50 text-rose-800" : "border border-[#d9b56f] bg-[#fffaf0] text-[#6f3a18]"}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${noticeIsError ? "bg-rose-600" : "bg-emerald-600"}`}
                >
                  {noticeIsError ? "!" : "✓"}
                </span>
                {notice}
              </div>
            )}
            {content}
          </div>
        </section>
        {drawer && (
          <CompleteAddVolume
            data={data}
            close={() => setDrawer(false)}
            run={run}
          />
        )}{" "}
        {bulkDrawer && <BulkAddBooks data={data} close={() => setBulkDrawer(false)} run={run} />}
        {editingCover && (
          <EditBookCover
            book={editingCover}
            close={() => setEditingCover(null)}
            run={run}
          />
        )}
        {editingLocation && <EditCopyLocation book={editingLocation} copies={data.copies.filter(copy => copy.book_id === editingLocation.book_id)} close={() => setEditingLocation(null)} run={run} />}
        <AdminBonChat data={data} onOpenAnalytics={() => setPage("Analytics")} />
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div className="admin-logo">
      <img src="/logo_line_200x@2x.png" alt="Tankobonbon Manga Library" />
    </div>
  );
}
function SectionTitle({ title, copy }: { title: string; copy?: string }) {
  return (
    <div>
      <h2 className="font-serif text-xl font-semibold text-[#543822]">
        {title}
      </h2>
      {copy && <p className="mt-1 text-xs text-[#8d735e]">{copy}</p>}
    </div>
  );
}
function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-[#953410] px-4 py-2.5 text-xs font-bold text-[#fefefd] shadow-[0_4px_14px_rgba(149,52,16,.28)] transition hover:bg-[#7c2b0c] active:scale-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
function bookStatus(book: Book) {
  const statuses = book.book_copies.map((copy) => copy.status);
  if (statuses.includes("IN_SHELF")) return "In Shelf";
  if (statuses.includes("WITH_READER")) return "With Reader";
  if (statuses.includes("On Hold")) return "On Hold";
  if (statuses.includes("RETURN_CART")) return "Return Cart";
  if (statuses.includes("Damaged")) return "Damaged";
  return "No copies";
}

function Overview({
  data,
  setPage,
  name,
  run,
}: {
  data: Data;
  setPage: (page: Page) => void;
  name: (id: string | null) => string;
  run: (
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) => Promise<boolean>;
}) {
  const returned = data.copies.filter((copy) => copy.status === "RETURN_CART");
  const leaders = [...data.books]
    .map((book) => ({
      book,
      reads: data.logs.filter((log) => log.book_id === book.book_id).length,
    }))
    .sort((a, b) => b.reads - a.reads)
    .slice(0, 5);
  return (
    <>
      <div className="admin-overview-lead grid gap-5 xl:grid-cols-[1.35fr_.95fr]">
        <section className="admin-hero-card relative overflow-hidden rounded-3xl p-5 text-[#fefefd] shadow-[0_20px_50px_rgba(84,56,34,.35)] sm:p-6">
          <div
            className="admin-hero-orb admin-hero-orb-one"
            aria-hidden="true"
          />
          <div
            className="admin-hero-orb admin-hero-orb-two"
            aria-hidden="true"
          />
          <div className="admin-hero-sheen" aria-hidden="true" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#f9d219]">
                On the floor
              </p>
              <strong className="mt-2 block font-serif text-5xl leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,.35)]">
                {
                  data.copies.filter((copy) => copy.status === "WITH_READER")
                    .length
                }
              </strong>
              <p className="mt-2 text-sm text-[#efd9bd]">
                volumes in readers’ hands
              </p>
            </div>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold backdrop-blur">
              Live now
            </span>
          </div>
          <div className="relative mt-10 flex h-24 items-end gap-3">
            {leaders.map(({ reads }, index) => (
              <div
                key={index}
                className={`w-8 rounded-t-md shadow-[0_-2px_10px_rgba(0,0,0,.2)] transition-all duration-500 ${index === 0 ? "bg-gradient-to-t from-[#c4800c] to-[#f9d219]" : "bg-gradient-to-t from-[#953410]/70 to-[#efce8e]/80"}`}
                style={{ height: `${Math.max(12, Math.min(96, reads * 12))}%` }}
              />
            ))}
          </div>
        </section>
        <section className="admin-card admin-overview-stats rounded-2xl border border-[#eadfd3] bg-[#fefefd] p-5 shadow-[0_8px_24px_rgba(84,56,34,.07)] sm:p-6">
          <div className="space-y-1">
            {[
              [
                "Active readers",
                data.visits.filter((visit) => visit.status === "ACTIVE").length,
              ],
              ["Return cart", returned.length],
              ["Checkouts", data.logs.length],
            ].map(([label, value]) => (
              <div
                className="flex items-center justify-between border-b border-[#f0e7da] py-4 text-sm text-[#543822]"
                key={String(label)}
              >
                <span>{label}</span>
                <b className="font-serif text-2xl">{value}</b>
              </div>
            ))}
          </div>
          <button
            onClick={() => setPage("Analytics")}
            className="admin-cta group mt-5 flex w-full items-center justify-between overflow-hidden rounded-xl px-4 py-3.5 text-xs font-bold text-[#543822] shadow-[0_8px_20px_rgba(196,128,12,.35)]"
          >
            <span className="relative z-10 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#543822]/15 transition group-hover:rotate-12">
                ✦
              </span>
              View full analytics
            </span>
            <span className="relative z-10 flex items-center gap-1 transition group-hover:translate-x-1">
              Open <span aria-hidden="true">→</span>
            </span>
          </button>
        </section>
      </div>
      <div className="admin-overview-secondary mt-8 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="admin-overview-panel rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
          <SectionTitle
            title="Most read this month"
            copy="Titles generating the most reading sessions."
          />
          <div className="mt-6 space-y-4">
            {leaders.map(({ book, reads }, index) => (
              <div
                className="admin-reading-rank grid grid-cols-[22px_minmax(0,1fr)_100px_35px] items-center gap-3 text-xs"
                key={book.book_id}
              >
                <span className="font-serif text-[#b66a3c]">{index + 1}</span>
                <div className="min-w-0">
                  <b className="block truncate">{book.title}</b>
                  <small className="text-[#9a806b]">
                    {book.author ?? "Unknown author"}
                  </small>
                </div>
                <div className="h-1.5 rounded-full bg-[#f0e5d9]">
                  <div
                    className="h-full rounded-full bg-[#b24419]"
                    style={{
                      width: `${leaders[0]?.reads ? (reads / leaders[0].reads) * 100 : 0}%`,
                    }}
                  />
                </div>
                <b>{reads}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-overview-panel rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
          <SectionTitle
            title="Needs shelving"
            copy="Returned titles awaiting inspection."
          />
          <div className="mt-6 space-y-3">
            {returned.map((copy) => (
              <button
                key={copy.copy_id}
                onClick={() =>
                  void run(
                    () => shelveCopy(copy.copy_id),
                    "Copy returned to shelf",
                  )
                }
                className="admin-shelving-row flex w-full items-center justify-between rounded-xl border border-[#eee2d6] p-3 text-left text-xs hover:border-[#cfac8d]"
              >
                <span>
                  <b className="block">
                    {data.books.find((book) => book.book_id === copy.book_id)
                      ?.title ?? "Book"}
                  </b>
                  <small className="text-[#9a806b]">
                    {copy.identifier_value} · return cart
                  </small>
                </span>
                <Edit3 size={15} className="text-[#a83d12]" />
              </button>
            ))}
          </div>
        </section>
      </div>
      <CheckoutQueue run={run} />
    </>
  );
}

function Catalogue({
  rows,
  data,
  query,
  setQuery,
  setDrawer,
  run,
}: {
  rows: Book[];
  data: Data;
  query: string;
  setQuery: (value: string) => void;
  setDrawer: (value: boolean) => void;
  run: (
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) => Promise<boolean>;
}) {
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Total titles", data.books.length],
          [
            "In shelf",
            data.copies.filter((copy) => copy.status === "IN_SHELF").length,
          ],
          [
            "Needs action",
            data.copies.filter((copy) => copy.status === "RETURN_CART").length,
          ],
        ].map(([label, value]) => (
          <div
            className="rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-4 shadow-sm"
            key={String(label)}
          >
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a806b]">
              {label}
            </p>
            <b className="mt-2 block font-serif text-3xl">{value}</b>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-[#e2d5c8] bg-white px-3 shadow-sm">
          <Search size={16} className="text-[#9a806b]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent py-3 text-sm outline-none"
            placeholder="Search title, author, or genre"
          />
        </label>
        <ActionButton onClick={() => setDrawer(true)}>
          <Plus size={15} />
          Add volume
        </ActionButton>
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] shadow-sm">
        <div className="flex items-center justify-between border-b border-[#eee5dc] px-5 py-4">
          <SectionTitle
            title="Every volume on record"
            copy={`${rows.length} matching record${rows.length === 1 ? "" : "s"}`}
          />
          <span className="hidden rounded-lg bg-[#fff0c9] px-2 py-1 text-[10px] font-bold text-[#804916] sm:block">
            Live inventory
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-[#fcf8f2] text-[10px] font-bold uppercase tracking-[.12em] text-[#9a806b]">
              <tr>
                <th className="px-5 py-3">Volume</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Genre</th>
                <th className="px-4 py-3">Reads</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((book) => {
                const status = bookStatus(book);
                return (
                  <tr
                    key={book.book_id}
                    className="border-t border-[#f0e9e1] hover:bg-[#fffbf5]"
                  >
                    <td className="px-5 py-4">
                      <b className="block">{book.title}</b>
                      <small className="mt-1 block text-[#9a806b]">
                        {book.author ?? "Unknown author"}
                      </small>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusTone[status]}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[#7e6049]">
                      {book.book_genres
                        .map((genre) => genre.genre)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-4 py-4 font-bold">
                      {
                        data.logs.filter((log) => log.book_id === book.book_id)
                          .length
                      }
                    </td>
                    <td className="px-5 py-4 text-right">
                      {status === "Return Cart" && (
                        <button
                          onClick={() => {
                            const copy = book.book_copies.find(
                              (item) => item.status === "RETURN_CART",
                            );
                            if (copy)
                              void run(
                                () => shelveCopy(copy.copy_id),
                                "Copy returned to shelf",
                              );
                          }}
                          className="font-bold text-[#a83d12] hover:underline"
                        >
                          Shelve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AddVolume({
  data,
  close,
  run,
}: {
  data: Data;
  close: () => void;
  run: (
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [barcode, setBarcode] = useState("");
  const [shelf, setShelf] = useState("");
  return (
    <div className="fixed inset-0 z-20 bg-[#2d190c]/30 backdrop-blur-sm">
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 flex h-full w-full max-w-[390px] flex-col bg-[#fffdf9] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#eee2d6] p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#b66a3c]">
              Catalogue
            </p>
            <h2 className="mt-1 font-serif text-2xl">Add a volume</h2>
          </div>
          <button
            onClick={close}
            aria-label="Close add volume panel"
            className="rounded-xl p-2 hover:bg-[#f5ecdf]"
          >
            <X size={18} />
          </button>
        </div>
        <form
          className="flex flex-1 flex-col overflow-y-auto p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const inserted = await run(
              () =>
                database()
                  .from("books")
                  .insert({
                    title,
                    author: author || null,
                    acquisition_status: "IN_LIBRARY",
                  })
                  .select("book_id")
                  .single(),
              "Volume created",
            );
            if (inserted && barcode) {
              const latest = await database()
                .from("books")
                .select("book_id")
                .eq("title", title)
                .order("book_id", { ascending: false })
                .limit(1)
                .single();
              if (!latest.error)
                await run(
                  () =>
                    database()
                      .from("book_copies")
                      .insert({
                        book_id: latest.data.book_id,
                        identifier_value: barcode,
                        identifier_type: "BARCODE",
                        shelf_id: shelf ? Number(shelf) : null,
                      }),
                  "Physical copy added",
                );
            }
            close();
          }}
        >
          <label className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Title
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
            />
          </label>
          <label className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Author
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
            />
          </label>
          <label className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Barcode (optional)
            <input
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
            />
          </label>
          <label className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Shelf
            <select
              value={shelf}
              onChange={(event) => setShelf(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
            >
              <option value="">No shelf</option>
              {data.shelves.map((item) => (
                <option key={item.shelf_id} value={item.shelf_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-auto border-t border-[#eee2d6] pt-6">
            <ActionButton onClick={() => {}}>
              <Plus size={15} />
              Create volume
            </ActionButton>
          </div>
        </form>
      </aside>
    </div>
  );
}

function Challenges({
  data,
  name,
  run,
}: {
  data: Data;
  name: (id: string | null) => string;
  run: (
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) => Promise<boolean>;
}) {
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("0");
  const [targetValue, setTargetValue] = useState("1");
  const [timeLimitDays, setTimeLimitDays] = useState("7");
  const [draftSource, setDraftSource] = useState<"AI" | "TEMPLATE" | "MANUAL">("MANUAL");
  const [difficulty, setDifficulty] = useState("Easy");
  const [targetGenre, setTargetGenre] = useState("");
  const [questFilter, setQuestFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [questSearch, setQuestSearch] = useState("");
  const [refining, setRefining] = useState<number | null>(null);
  const [refineTarget, setRefineTarget] = useState("1");
  const [refineDays, setRefineDays] = useState("7");
  const [refinePoints, setRefinePoints] = useState("50");
  const [feedback, setFeedback] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  async function suggestQuest() {
    setAiBusy(true);
    setAiNote("");
    try {
      const { data: sessionData } = await database().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Librarian sign-in is required.");
      const response = await fetch("/api/quest-suggestion", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ difficulty }) });
      const payload = await response.json() as { draft?: { title: string; description: string; requirement: string; difficulty: string; objectiveType: "BOOKS_READ"; targetValue: number; targetGenre: string; points: number; timeLimitDays: number; rationale: string }; source?: string; error?: string };
      if (!response.ok || !payload.draft) throw new Error(payload.error || "A quest draft could not be generated.");
      setTitle(payload.draft.title); setDescription(payload.draft.requirement); setDifficulty(payload.draft.difficulty); setTargetGenre(payload.draft.targetGenre); setPoints(String(payload.draft.points)); setTargetValue(String(payload.draft.targetValue)); setTimeLimitDays(String(payload.draft.timeLimitDays)); setDraftSource(payload.source === "ai" ? "AI" : "TEMPLATE");
      setAiNote(`${payload.source === "ai" ? "AI draft" : "Safe template"}: ${payload.draft.rationale} Review before saving.`);
    } catch (cause) { setAiNote(errorMessage(cause)); } finally { setAiBusy(false); }
  }
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <p className="text-sm text-[#806b59]">
          Review generated quests, verified activity progress, rules, and generation failures.
        </p>
        <div className="flex flex-wrap gap-2"><input value={questSearch} onChange={event => setQuestSearch(event.target.value)} placeholder="Search quests" className="rounded-xl border border-[#e2d5c8] bg-white px-3 py-2 text-sm"/><select value={questFilter} onChange={(event) => setQuestFilter(event.target.value)} className="rounded-xl border border-[#e2d5c8] bg-white px-3 py-2 text-sm" aria-label="Filter quests by difficulty"><option>All</option><option>Easy</option><option>Medium</option><option>Hard</option></select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-[#e2d5c8] bg-white px-3 py-2 text-sm" aria-label="Filter quests by status"><option>All</option><option>ACTIVE</option><option>PENDING</option><option>REJECTED</option></select><ActionButton onClick={() => setComposer((value) => !value)}><Plus size={15} />Create quest</ActionButton></div>
      </div>
      {composer && (
        <form
          className="mb-6 grid gap-3 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await run(
                () =>
                  usesReplacementSchema
                    ? replacementDb().rpc("admin_create_generated_quest", {
                        p_name: title,
                        p_difficulty: difficulty,
                        p_description: description,
                        p_objective_type: "BOOKS_READ",
                        p_target_value: Number(targetValue),
                        p_points: Number(points),
                        p_days: Number(timeLimitDays),
                        p_target_genre: targetGenre || null,
                        p_source: draftSource,
                      })
                    : database()
                        .from("quests")
                        .insert({
                          name: title,
                          description,
                          quest_type: "SIDE",
                          requirement_type: "STAFF_VERIFIED",
                          points_reward: Number(points),
                          status: "ACTIVE",
                        }),
                "Quest created",
              )
            ) {
              setComposer(false);
              setTitle("");
              setDescription("");
              setDraftSource("MANUAL");
            }
          }}
        >
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Quest title"
            className="rounded-xl border p-3 text-sm"
          />
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="rounded-xl border p-3 text-sm" aria-label="Quest difficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select>
          <input value={targetGenre} onChange={(event) => setTargetGenre(event.target.value)} placeholder="Target genre" className="rounded-xl border p-3 text-sm" />
          <input required type="number" min="1" value={targetValue} onChange={event => setTargetValue(event.target.value)} placeholder="Books" aria-label="Target books" className="rounded-xl border p-3 text-sm" />
          <input required type="number" min="1" max="90" value={timeLimitDays} onChange={event => setTimeLimitDays(event.target.value)} placeholder="Days" aria-label="Time limit days" className="rounded-xl border p-3 text-sm" />
          <input
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Requirements"
            className="rounded-xl border p-3 text-sm"
          />
          <input
            required
            type="number"
            min="0"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder="Points"
            className="rounded-xl border p-3 text-sm"
          />
          <ActionButton onClick={() => {}}>Save quest</ActionButton>
          <button type="button" disabled={aiBusy} onClick={() => void suggestQuest()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#c9863c] bg-[#fff7eb] px-4 py-3 text-sm font-semibold text-[#8f3c12] disabled:opacity-50"><Sparkles size={15}/>{aiBusy ? "Drafting..." : "Draft with AI"}</button>
          {aiNote && <p className="sm:col-span-2 lg:col-span-6 text-xs leading-5 text-[#71543d]" role="status">{aiNote}</p>}
        </form>
      )}
      {data.questGenerations.some(item => item.status === "FAILED") && <div role="status" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Quest generation needs attention.</b> {data.questGenerations.filter(item => item.status === "FAILED").length} failed request(s) are recorded. Readers still receive validated template fallbacks.</div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {data.quests.filter((quest) => (questFilter === "All" || quest.quest_type.toLowerCase() === questFilter.toLowerCase()) && (statusFilter === "All" || quest.status === statusFilter) && `${quest.name} ${quest.description} ${quest.objective_type}`.toLowerCase().includes(questSearch.trim().toLowerCase())).map((quest) => {
          const pending = data.enrollments.filter(
            (item) =>
              item.quest_id === quest.quest_id &&
              ["ACTIVE", "PENDING"].includes(item.status),
          );
          return (
            <article
              className="rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm"
              key={quest.quest_id}
            >
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0c9] text-lg text-[#a65b1e]">
                  ★
                </span>
                {usesReplacementSchema ? <button onClick={() => { setRefining(refining === quest.quest_id ? null : quest.quest_id); setRefineTarget(String(quest.target_value)); setRefineDays(String(quest.time_limit_days)); setRefinePoints(String(quest.points_reward)); setFeedback(""); }} className="rounded-lg p-2 text-[#a83d12] hover:bg-[#fce8d8]" aria-label={`Refine ${quest.name}`}><Edit3 size={15}/></button> : (
                  <button
                    onClick={() =>
                      void run(
                        () =>
                          database()
                            .from("quests")
                            .update({
                              status:
                                quest.status === "ACTIVE"
                                  ? "ARCHIVED"
                                  : "ACTIVE",
                            })
                            .eq("quest_id", quest.quest_id)
                            .select()
                            .single(),
                        `Quest ${quest.status === "ACTIVE" ? "archived" : "activated"}`,
                      )
                    }
                    className="rounded-lg p-2 text-[#a83d12] hover:bg-[#fce8d8]"
                  >
                    <Edit3 size={15} />
                  </button>
                )}
              </div>
              <p className="mt-6 font-serif text-xl font-semibold">
                {quest.name}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[.15em] text-[#b66a3c]">
                {quest.quest_type} · {quest.objective_type.replace('_',' ')} · {quest.status}
              </p>
              <p className="mt-5 text-xs text-[#71543d]">{quest.description}</p>
              <p className="mt-4 text-xs font-bold text-[#a83d12]">Target {quest.target_value} · {quest.points_reward} points · {quest.time_limit_days} days</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-[#8d735e]">{quest.source} · {quest.generation_status}</p>
              {refining === quest.quest_id && <form className="mt-4 space-y-2 rounded-xl border border-[#eadfd3] bg-[#fff7eb] p-3" onSubmit={async event => { event.preventDefault(); if (await run(() => replacementDb().rpc('admin_refine_quest',{p_quest_id:quest.quest_id,p_target_value:Number(refineTarget),p_points:Number(refinePoints),p_days:Number(refineDays),p_feedback:feedback}), 'Quest refined and feedback recorded')) setRefining(null); }}><div className="grid grid-cols-3 gap-2"><input required min="1" type="number" value={refineTarget} onChange={e=>setRefineTarget(e.target.value)} aria-label="Target value" className="min-w-0 rounded-lg border p-2 text-xs"/><input required min="1" max="90" type="number" value={refineDays} onChange={e=>setRefineDays(e.target.value)} aria-label="Days" className="min-w-0 rounded-lg border p-2 text-xs"/><input required min="0" type="number" value={refinePoints} onChange={e=>setRefinePoints(e.target.value)} aria-label="Points" className="min-w-0 rounded-lg border p-2 text-xs"/></div><textarea required minLength={5} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Why is this refinement needed?" className="w-full rounded-lg border p-2 text-xs"/><button disabled={!feedback.trim() || feedback.trim().length<5} className="w-full rounded-lg bg-[#a83d12] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save refinement</button></form>}
              <div className="mt-5 space-y-2">
                {!usesReplacementSchema && pending.map((item) => (
                  <button
                    key={item.quest_progress_id}
                    onClick={() =>
                      void run(
                        () => verifyQuest(item.quest_progress_id),
                        "Quest completion verified",
                      )
                    }
                    className="block w-full rounded-lg border border-[#e2d5c8] px-3 py-2 text-left text-xs hover:bg-[#fff5e8]"
                  >
                    Verify {name(item.user_id)}
                  </button>
                ))}
                {(usesReplacementSchema || !pending.length) && (
                  <small className="text-[#8d735e]">
                    Progress and rewards are verified automatically from physical reading activity.
                  </small>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Readers({
  data,
  active,
  name,
  run,
}: {
  data: Data;
  active: Visit[];
  name: (id: string | null) => string;
  run: (
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [readerFilter, setReaderFilter] = useState<"ALL" | "READING" | "AVAILABLE" | "AWAITING" | "DEACTIVATED">("ALL");
  const [readerPage, setReaderPage] = useState(1);
  const [selectedReaderId, setSelectedReaderId] = useState<string | null>(null);
  const [readerId, setReaderId] = useState("");
  const [planId, setPlanId] = useState("");
  const [membershipNumber, setMembershipNumber] = useState("");
  const [rfid, setRfid] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [now, setNow] = useState(Date.now());
  const [newReader, setNewReader] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    username: "",
    birthdate: "",
    mobileNumber: "",
  });
  const pending = data.readers.filter(
    (reader) =>
      reader.is_active &&
      reader.roles?.name === "reader" &&
      !data.memberAccounts.some(
        (item) => item.user_id === reader.user_id && item.status === "ACTIVE",
      ),
  );
  const plans = usesReplacementSchema
    ? data.plans
    : data.plans.filter((plan) => plan.entry_type !== "WALK_IN");
  const selectedPlan = plans.find(
    (plan) => String(plan.membership_type_id) === planId,
  );
  const readerDirectory = data.readers
    .filter((reader) => reader.roles?.name === "reader")
    .map((reader) => {
      const member = data.memberAccounts.find((item) => item.user_id === reader.user_id && item.status === "ACTIVE");
      const readerCards = data.libraryCards.filter((item) => item.user_id === reader.user_id);
      const libraryCard = readerCards.find((item) => item.is_active && !item.deactivated_at) ?? readerCards[readerCards.length - 1];
      const visit = active.find((item) => item.user_id === reader.user_id);
      const status = !reader.is_active ? "DEACTIVATED" : visit ? "READING" : member ? "AVAILABLE" : "AWAITING";
      return { reader, member, libraryCard, visit, status } as const;
    });
  const normalizedSearch = search.trim().toLowerCase();
  const visibleReaders = readerDirectory.filter(({ reader, member, libraryCard, status }) =>
    (readerFilter === "ALL" || readerFilter === status) &&
    (!normalizedSearch || `${reader.first_name} ${reader.last_name} ${member?.membership_label ?? ""} ${libraryCard?.librarycard_rfid ?? ""}`.toLowerCase().includes(normalizedSearch)),
  );
  const readerFilters = [
    ["ALL", "All readers", readerDirectory.length],
    ["READING", "Reading now", readerDirectory.filter(item => item.status === "READING").length],
    ["AVAILABLE", "Available", readerDirectory.filter(item => item.status === "AVAILABLE").length],
    ["AWAITING", "Awaiting activation", readerDirectory.filter(item => item.status === "AWAITING").length],
    ["DEACTIVATED", "Deactivated", readerDirectory.filter(item => item.status === "DEACTIVATED").length],
  ] as const;
  const readersPerPage = 8;
  const readerPages = Math.max(1, Math.ceil(visibleReaders.length / readersPerPage));
  const pagedReaders = visibleReaders.slice((readerPage - 1) * readersPerPage, readerPage * readersPerPage);
  const selectedReader = readerDirectory.find(item => item.reader.user_id === selectedReaderId) ?? null;
  useEffect(() => { setReaderPage(1); }, [search, readerFilter]);
  useEffect(() => { setReaderPage(page => Math.min(page, readerPages)); }, [readerPages]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <>
      {usesReplacementSchema && <ReaderCheckIn />}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Registered readers",
            data.readers.filter((reader) => reader.roles?.name === "reader")
              .length,
          ],
          ["Awaiting activation", pending.length],
          ["Reading now", active.length],
          [
            "Active memberships",
            data.memberAccounts.filter((item) => item.status === "ACTIVE").length,
          ],
        ].map(([label, value]) => (
          <div
            className="admin-kpi rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm"
            key={String(label)}
          >
            <p className="text-[11px] font-semibold text-[#8d735e]">{label}</p>
            <b className="mt-2 block font-serif text-3xl">{value}</b>
          </div>
        ))}
      </div>
      {usesReplacementSchema && (
        <section className="mb-6 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
          <SectionTitle
            title="Create reader account"
            copy="Create the reader's secure login and exact-ERD user record together."
          />
          <form
            className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(async () => {
                const session = await database().auth.getSession();
                const token = session.data.session?.access_token;
                if (!token)
                  return { error: new Error("Librarian session expired.") };
                const response = await fetch("/api/readers", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify(newReader),
                });
                const result = (await response.json()) as { error?: string };
                return {
                  error: response.ok
                    ? null
                    : new Error(
                        result.error ?? "Reader account could not be created.",
                      ),
                };
              }, "Reader login and profile created");
              if (ok)
                setNewReader({
                  email: "",
                  password: "",
                  firstName: "",
                  lastName: "",
                  username: "",
                  birthdate: "",
                  mobileNumber: "",
                });
            }}
          >
            {(
              [
                ["First name", "firstName", "text"],
                ["Last name", "lastName", "text"],
                ["Username", "username", "text"],
                ["Birthdate", "birthdate", "date"],
                ["Mobile number", "mobileNumber", "tel"],
                ["Email", "email", "email"],
                ["Temporary password", "password", "password"],
              ] as const
            ).map(([label, key, type]) => (
              <label
                key={key}
                className="text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]"
              >
                {label}
                <input
                  required
                  type={type}
                  minLength={key === "password" ? 12 : undefined}
                  value={newReader[key]}
                  onChange={(event) =>
                    setNewReader((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
                />
              </label>
            ))}
            <div className="flex items-end">
              <ActionButton onClick={() => {}}>
                <Plus size={15} />
                Create reader
              </ActionButton>
            </div>
          </form>
        </section>
      )}
      <section className="mb-6 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
        <SectionTitle
          title="Activate reader account"
          copy={usesReplacementSchema
            ? "Verify the reader's identity, then choose their membership and expiry. RFID card linking is managed separately below."
            : "Verify their identity and physical card in person before activation."}
        />
        <form
          aria-label="Activate reader account"
          className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await run(
                () =>
                  usesReplacementSchema
                    ? replacementDb().rpc("admin_activate_membership", {
                        p_user_id: readerId,
                        p_membership_type: selectedPlan?.name,
                        p_membership_rank: "F",
                        p_remaining_minutes: 0,
                        p_expires_at: new Date(expiresAt).toISOString(),
                      })
                    : database().rpc("admin_activate_member", {
                        p_user_id: readerId,
                        p_type_id: Number(planId),
                        p_number: membershipNumber.trim(),
                        p_rfid: rfid.trim(),
                        p_expires_at: new Date(expiresAt).toISOString(),
                      }),
                usesReplacementSchema ? "Reader membership activated" : "Reader membership and physical card activated",
              )
            ) {
              setReaderId("");
              setPlanId("");
              setMembershipNumber("");
              setRfid("");
              setExpiresAt("");
            }
          }}
        >
          <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Reader awaiting activation
            <select
              required
              value={readerId}
              onChange={(event) => setReaderId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
            >
              <option value="">Select reader</option>
              {pending.map((reader) => (
                <option key={reader.user_id} value={reader.user_id}>
                  {reader.first_name} {reader.last_name}
                  {reader.birthday ? "" : " · birthday required"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Membership plan
            <select
              required
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
            >
              <option value="">Select plan</option>
              {plans.map((plan) => (
                <option
                  key={plan.membership_type_id}
                  value={plan.membership_type_id}
                >
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          {!usesReplacementSchema && (
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
              Membership number
              <input
                required
                value={membershipNumber}
                onChange={(event) => setMembershipNumber(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
                placeholder="MEM-000123"
              />
            </label>
          )}
          {!usesReplacementSchema && <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Physical RFID UID
            <input
              required
              value={rfid}
              onChange={(event) => setRfid(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
              placeholder="Scan or enter card UID"
            />
          </label>}
          <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">
            Membership expiry
            <input
              required
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 text-sm font-normal normal-case"
            />
          </label>
          <div className="flex items-end">
            <ActionButton onClick={() => {}}>
              <Plus size={15} />
              Activate reader
            </ActionButton>
          </div>
        </form>
        {!pending.length && (
          <p className="mt-4 text-xs text-[#8d735e]">
            No reader accounts are awaiting membership activation.
          </p>
        )}
      </section>
      {usesReplacementSchema && <ReaderCardManagement data={data} run={run} />}
      <section className="overflow-hidden rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] shadow-sm">
        <div className="border-b border-[#eadfd3] bg-[linear-gradient(135deg,#fffdf9,#fff8ec)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a83d12]">Reader directory</p><h2 className="mt-1 font-serif text-xl font-semibold text-[#543822]">Find and manage readers</h2><p className="mt-1 text-xs text-[#8d735e]">Search by name or membership, then narrow the list by current status.</p></div>
            <p aria-live="polite" className="text-xs font-semibold text-[#8d735e]">Showing {visibleReaders.length} of {readerDirectory.length}</p>
          </div>
          <label className="mt-5 flex min-h-12 items-center gap-3 rounded-xl border border-[#ddcdbd] bg-white px-4 shadow-[0_4px_14px_rgba(84,56,34,.06)] transition focus-within:border-[#c4800c] focus-within:ring-2 focus-within:ring-[#f3d793]/60">
            <Search size={17} aria-hidden="true" className="shrink-0 text-[#a83d12]" />
            <span className="sr-only">Search readers by name or membership</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-[#aa9583]" placeholder="Search reader name or membership…" />
            {search && <button type="button" onClick={() => setSearch("")} className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#9a806b] transition hover:bg-[#f7eee4] hover:text-[#a83d12]">Clear</button>}
          </label>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter readers by status">
            {readerFilters.map(([value, label, count]) => <button key={value} type="button" aria-pressed={readerFilter === value} onClick={() => setReaderFilter(value)} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4800c] ${readerFilter === value ? "border-[#543822] bg-[#543822] text-white shadow-sm" : "border-[#ddcdbd] bg-white/80 text-[#765943] hover:border-[#c49a70] hover:bg-white"}`}><span>{label}</span><span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[9px] ${readerFilter === value ? "bg-white/15 text-[#f7df9c]" : "bg-[#f3e9dc] text-[#8a684e]"}`}>{count}</span></button>)}
          </div>
        </div>
        <div className="grid gap-3 p-4 md:hidden">
          {pagedReaders.map(({ reader, member, visit, status }) => <article key={reader.user_id} className="rounded-xl border border-[#eadfd3] bg-white p-4 shadow-[0_4px_14px_rgba(84,56,34,.05)]">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-[#543822]">{reader.first_name} {reader.last_name}</h3><p className="mt-1 truncate text-[11px] text-[#80634c]">{member?.membership_label ?? "Awaiting activation"}</p></div><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-bold ${status === "READING" ? "border-amber-200 bg-amber-50 text-amber-800" : status === "AVAILABLE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "DEACTIVATED" ? "border-stone-200 bg-stone-100 text-stone-600" : "border-orange-200 bg-orange-50 text-orange-800"}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "READING" ? "animate-pulse bg-amber-500" : status === "AVAILABLE" ? "bg-emerald-500" : status === "DEACTIVATED" ? "bg-stone-400" : "bg-orange-400"}`} />{status === "READING" ? "Reading" : status === "AVAILABLE" ? "Available" : status === "DEACTIVATED" ? "Deactivated" : "Pending"}</span></div>
            <div className="mt-4 flex items-center justify-between border-t border-[#f0e9e1] pt-3"><div><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#9a806b]">Time balance</p><strong className="mt-1 block text-xs">{member?.remaining_minutes == null ? "—" : status === "READING" ? `${formatReadingClock(liveReadingSeconds(member.remaining_minutes, visit, now))} left` : `${member.remaining_minutes} min`}</strong></div><button type="button" onClick={() => setSelectedReaderId(reader.user_id)} className="group inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#d8c3ad] bg-white px-3 py-2 text-[10px] font-bold text-[#704d34]">View details<ChevronRight size={14} /></button></div>
          </article>)}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-[#fcf8f2] text-[10px] font-bold uppercase tracking-[.12em] text-[#9a806b]">
              <tr>
                <th className="px-5 py-3">Reader</th>
                <th className="px-4 py-3">Membership</th>
                <th className="px-4 py-3">Visit state</th>
                <th className="px-4 py-3">Time balance</th>
                <th className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {pagedReaders
                .map(({ reader, member, visit, status }) => {
                  return (
                    <tr
                      className="border-t border-[#f0e9e1] hover:bg-[#fffbf5]"
                      key={reader.user_id}
                    >
                      <td className="px-5 py-4 font-bold">
                        {reader.first_name} {reader.last_name}
                      </td>
                      <td className="px-4 py-4 text-[#80634c]">
                        {member?.membership_label ?? "Awaiting activation"}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status === "READING" ? "border-amber-200 bg-amber-50 text-amber-800" : status === "AVAILABLE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "DEACTIVATED" ? "border-stone-200 bg-stone-100 text-stone-600" : "border-orange-200 bg-orange-50 text-orange-800"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status === "READING" ? "animate-pulse bg-amber-500" : status === "AVAILABLE" ? "bg-emerald-500" : status === "DEACTIVATED" ? "bg-stone-400" : "bg-orange-400"}`} />
                          {status === "READING" ? "Reading now" : status === "AVAILABLE" ? "Available" : status === "DEACTIVATED" ? "Deactivated" : "Awaiting activation"}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-bold">
                        {member?.remaining_minutes == null
                          ? "—"
                          : status === "READING"
                            ? `${formatReadingClock(liveReadingSeconds(member.remaining_minutes, visit, now))} left`
                            : `${member.remaining_minutes} min`}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button type="button" onClick={() => setSelectedReaderId(reader.user_id)} className="group inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8c3ad] bg-white px-3 py-2 text-[10px] font-bold text-[#704d34] transition hover:border-[#a83d12] hover:bg-[#fff5e8] hover:text-[#a83d12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4800c]">View details<ChevronRight size={14} aria-hidden="true" className="transition group-hover:translate-x-0.5" /></button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {visibleReaders.length > readersPerPage && <div className="flex items-center justify-between border-t border-[#eadfd3] bg-[#fcf8f2] px-5 py-3"><p className="text-[10px] font-semibold text-[#8d735e]">Page {readerPage} of {readerPages}</p><div className="flex gap-2"><button type="button" disabled={readerPage === 1} onClick={() => setReaderPage(page => page - 1)} className="rounded-lg border border-[#d8c3ad] bg-white px-3 py-2 text-[10px] font-bold text-[#704d34] disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" disabled={readerPage === readerPages} onClick={() => setReaderPage(page => page + 1)} className="rounded-lg border border-[#d8c3ad] bg-white px-3 py-2 text-[10px] font-bold text-[#704d34] disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>}
        {!visibleReaders.length && <div className="grid min-h-52 place-items-center border-t border-[#f0e9e1] px-6 py-10 text-center"><div><Users className="mx-auto text-[#c9ad92]" aria-hidden="true" /><h3 className="mt-3 font-serif text-lg font-semibold text-[#543822]">No readers found</h3><p className="mt-1 text-xs text-[#8d735e]">Try a different name or choose another status filter.</p><button type="button" onClick={() => { setSearch(""); setReaderFilter("ALL"); }} className="mt-4 rounded-lg border border-[#c8a681] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a83d12] hover:bg-[#fff6e9]">Reset filters</button></div></div>}
      </section>
      {selectedReader && <ReaderDetailsDrawer entry={selectedReader} close={() => setSelectedReaderId(null)} run={run} />}
    </>
  );
}

type ReaderDirectoryEntry = {
  reader: Data["readers"][number];
  member: Data["memberAccounts"][number] | undefined;
  libraryCard: Data["libraryCards"][number] | undefined;
  visit: Visit | undefined;
  status: "DEACTIVATED" | "READING" | "AVAILABLE" | "AWAITING";
};

function ReaderDetailsDrawer({ entry, close, run }: {
  entry: ReaderDirectoryEntry;
  close: () => void;
  run: (action: () => PromiseLike<{ error: unknown }>, success: string) => Promise<boolean>;
}) {
  const { reader, member, libraryCard, visit, status } = entry;
  const [firstName, setFirstName] = useState(reader.first_name);
  const [lastName, setLastName] = useState(reader.last_name);
  const [birthday, setBirthday] = useState(reader.birthday ?? "");
  const [cardUid, setCardUid] = useState(libraryCard?.librarycard_rfid ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [close]);
  const statusText = status === "READING" ? "Reading now" : status === "AVAILABLE" ? "Available" : status === "DEACTIVATED" ? "Deactivated" : "Awaiting activation";
  const statusClass = status === "READING" ? "border-amber-200 bg-amber-50 text-amber-800" : status === "AVAILABLE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "DEACTIVATED" ? "border-stone-200 bg-stone-100 text-stone-600" : "border-orange-200 bg-orange-50 text-orange-800";

  const performPrimaryAction = async () => {
    if (usesReplacementSchema) {
      const ok = await run(() => replacementDb().rpc("admin_set_user_active", { p_user_id: reader.user_id, p_is_active: !reader.is_active }), reader.is_active ? "Reader account deactivated" : "Reader account reactivated");
      if (ok) close();
      return;
    }
    const ok = visit
      ? await run(() => database().rpc("admin_check_out", { p_visit_id: visit.visit_id }), "Reader checked out")
      : await run(() => database().rpc("admin_check_in", { p_user_id: reader.user_id }), "Reader checked in");
    if (ok) close();
  };

  const initials = `${reader.first_name.charAt(0)}${reader.last_name.charAt(0)}`.toUpperCase();
  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-[#2d190c]/45 p-2 backdrop-blur-[3px] sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="reader-details-title" className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#d9c5aa] bg-[#fffdf9] text-[#543822] shadow-[0_30px_100px_rgba(50,27,13,.32)] sm:max-h-[calc(100dvh-2.5rem)]" onSubmit={async event => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      try {
        const normalizedCardUid = normalizePhysicalCardUid(cardUid);
        const previousCardUid = normalizePhysicalCardUid(libraryCard?.librarycard_rfid ?? "");
        const cardChanged = Boolean(normalizedCardUid && normalizedCardUid !== previousCardUid);
        const ok = await run(async () => {
          const profileResult = await replacementDb().rpc("admin_update_reader_profile", { p_user_id: reader.user_id, p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_birthdate: birthday });
          if (profileResult.error || !cardChanged) return profileResult;
          return replacementDb().rpc("admin_assign_library_card", { p_user_id: reader.user_id, p_rfid: normalizedCardUid });
        }, cardChanged ? "Reader profile and library card updated" : "Reader profile updated");
        if (ok) close();
      } finally { setSaving(false); }
    }}>
      <header className="relative shrink-0 overflow-hidden border-b border-[#eadfd3] bg-[#543822] px-5 py-5 text-white sm:px-8 sm:py-7"><div aria-hidden="true" className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-[#f3d793]/15" /><div aria-hidden="true" className="absolute -right-7 -top-7 h-28 w-28 rounded-full border border-[#f3d793]/10" /><div className="relative flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-[#f3d793]/25 bg-white/10 font-serif text-lg font-semibold text-[#f3d793] sm:h-16 sm:w-16">{initials}</span><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#f3d793]">Reader profile</p><h2 id="reader-details-title" className="mt-1 truncate font-serif text-xl font-semibold sm:text-2xl">{reader.first_name} {reader.last_name}</h2><span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass}`}>{statusText}</span></div></div><button type="button" onClick={close} aria-label="Close reader details" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d793]"><X size={18} aria-hidden="true" /></button></div></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
        <div className="grid gap-3 sm:grid-cols-2">
          <ReaderDetail label="Membership" value={member?.membership_label ?? "Not activated"} />
          <ReaderDetail label="Time balance" value={member?.remaining_minutes == null ? "—" : `${member.remaining_minutes} minutes`} />
          <ReaderDetail label="Visit state" value={visit ? "Active reading session" : "Not checked in"} />
          <ReaderDetail label="Birthday" value={reader.birthday ? new Date(reader.birthday).toLocaleDateString() : "Not provided"} />
        </div>
        {usesReplacementSchema && <fieldset disabled={saving} className="mt-6 grid gap-4 rounded-xl border border-[#eadfd3] bg-white p-4 sm:grid-cols-2 sm:p-5"><legend className="px-2 font-serif text-lg font-semibold">Edit reader information</legend><label className="text-xs font-bold">First name<input required maxLength={255} value={firstName} onChange={event => setFirstName(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[#d8c3ad] px-3 text-sm font-normal" /></label><label className="text-xs font-bold">Last name<input required maxLength={255} value={lastName} onChange={event => setLastName(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[#d8c3ad] px-3 text-sm font-normal" /></label><label className="text-xs font-bold sm:col-span-2">Birthday<input required type="date" max={new Date().toISOString().slice(0, 10)} value={birthday} onChange={event => setBirthday(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[#d8c3ad] px-3 text-sm font-normal" /></label></fieldset>}
        <section className="mt-5 rounded-xl border border-[#eadfd3] bg-[#faf6ef] p-4 sm:p-5" aria-labelledby="library-card-information-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="library-card-information-title" className="font-serif text-lg font-semibold text-[#543822]">Library Card Information</h3>
            {libraryCard && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${libraryCard.is_active && !libraryCard.deactivated_at ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-stone-100 text-stone-600"}`}>{libraryCard.is_active && !libraryCard.deactivated_at ? "Active card" : "Inactive card"}</span>}
          </div>
          <label className="mt-4 block text-[9px] font-bold uppercase tracking-[.14em] text-[#9a806b]">Assigned card UID
            <input value={cardUid} onChange={event => setCardUid(event.target.value)} disabled={saving} maxLength={100} autoComplete="off" placeholder="Tap or enter the physical card UID" className="mt-2 min-h-11 w-full rounded-lg border border-[#d8c3ad] bg-white px-3 font-mono text-sm font-semibold normal-case tracking-normal text-[#543822]" />
          </label>
          <p className="mt-2 text-[10px] leading-4 text-[#8d735e]">Saved as text, so leading zeroes are preserved. Spaces and reader separators are normalized automatically.</p>
        </section>
        {visit && usesReplacementSchema && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">This reader has an active session. Finish the session before deactivating the account.</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap gap-2 border-t border-[#eadfd3] bg-[#fcf8f2] px-4 py-4 sm:items-center sm:justify-end sm:px-8"><button type="button" onClick={close} className="min-h-11 flex-1 rounded-xl border border-[#d8c3ad] bg-white px-5 text-xs font-bold text-[#704d34] sm:flex-none">Close</button><button type="button" disabled={saving || (usesReplacementSchema ? Boolean(visit) : !visit && !member)} onClick={() => void performPrimaryAction()} className={`min-h-11 flex-1 rounded-xl border px-5 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none ${usesReplacementSchema && !reader.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-[#e3c1ad] bg-white text-[#a83d12] hover:bg-[#fff1e7]"}`}>{usesReplacementSchema ? visit ? "Reading session in progress" : reader.is_active ? "Deactivate reader" : "Reactivate reader" : visit ? "Check out reader" : "Check in reader"}</button>{usesReplacementSchema && <button type="submit" disabled={saving || !firstName.trim() || !lastName.trim() || !birthday} className="min-h-11 w-full rounded-xl bg-[#a83d12] px-5 text-xs font-bold text-white disabled:opacity-50 sm:w-auto">{saving ? "Saving…" : "Save changes"}</button>}</footer>
    </form>
  </div>, document.body);
}

function ReaderDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#eadfd3] bg-white p-4"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#9a806b]">{label}</p><p className="mt-2 text-sm font-semibold text-[#543822]">{value}</p></div>;
}
