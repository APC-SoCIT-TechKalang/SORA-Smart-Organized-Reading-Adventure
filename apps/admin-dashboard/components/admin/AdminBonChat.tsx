"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit3, LoaderCircle, MessageCircle, RefreshCw, Send, Trash2, X } from "lucide-react";
import { database } from "../../lib/supabase";
import type { DashboardData } from "./dashboard-data";
import { AdminBonWidgets, friendlyAdminBonError, isAdminBonWidget, type AdminBonWidget } from "./AdminBonWidgets";

type ChatData = Pick<DashboardData, "books" | "copies" | "readers" | "memberAccounts" | "visits" | "logs" | "quests" | "enrollments">;
type QuestDraft = { title: string; description: string; requirement: string; difficulty: "Easy" | "Medium" | "Hard"; objectiveType: "BOOKS_READ"; targetValue: number; targetGenre: string; points: number; timeLimitDays: number; rationale: string; selected?: boolean; editing?: boolean; status?: "draft" | "approved" | "discarded" };
type Message = { id: number; from: "bon" | "admin"; text: string; drafts?: QuestDraft[]; source?: "ai" | "template"; ranking?: RankingMode; rankingShown?: number; widgets?: AdminBonWidget[] };
type RankingMode = "most" | "least";
type RankedBook = { id: number; title: string; sessions: number; hasCopies: boolean };

const BUTTON = 62;
const MARGIN = 10;
const manilaDateKey = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const questStarters = [
  "Generate balanced Easy, Medium, and Hard quests using our available catalog.",
  "Create quests that encourage readers to explore less popular available genres.",
  "Draft varied manga and light-novel quests for different reader difficulty levels.",
];
const regenerationPrompts = [
  "Create a materially different alternative quest. Change its concept and wording while keeping the same difficulty.",
  "Generate a fresh replacement quest with a different catalog genre or objective framing at the same difficulty.",
  "Replace this with a clearly distinct quest. Do not reuse its title, description, or genre unless the catalog offers no alternative.",
];

export function AdminBonChat({ data, onOpenAnalytics }: { data: ChatData; onOpenAnalytics?: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"books" | "analytics" | null>(null);
  const [messages, setMessages] = useState<Message[]>([{ id: 1, from: "bon", text: "Hi, librarian! Ask me about Tankobonbon analytics, catalog activity, readers, memberships, sessions, or quests." }]);
  const logRef = useRef<HTMLDivElement>(null);
  const pendingScrollMessageId = useRef<number | null>(null);
  const requestLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false });
  const starterIndex = useRef(0);
  const regenerationIndex = useRef(0);

  const context = useMemo(() => {
    const counts = new Map<number, number>();
    data.logs.forEach(log => counts.set(log.book_id, (counts.get(log.book_id) || 0) + 1));
    const completed = data.logs.filter(log => Boolean(log.returned_at));
    const totalMinutes = completed.reduce((sum, log) => sum + (log.total_reading_minutes ?? 0), 0);
    const booksById = new Map(data.books.map(book => [book.book_id, book]));
    const titleFor = (bookId: number) => booksById.get(bookId);
    const leastUsedBooks = data.books.map(book => ({ title: book.title, sessions: counts.get(book.book_id) ?? 0 })).sort((a, b) => a.sessions - b.sessions || a.title.localeCompare(b.title)).slice(0, 5);
    const genreCounts = new Map<string, { genre: string; sessions: number }>();
    data.logs.forEach(log => {
      const book = titleFor(log.book_id);
      const genres = book?.book_genres.flatMap(item => String(item.genre ?? "").split(/[,;/|]+/)).map(genre => genre.trim().replace(/\s+/g, " ")).filter(Boolean) ?? [];
      (genres.length ? genres : ["Uncategorized"]).forEach(genre => {
        const key = genre.toLocaleLowerCase();
        const current = genreCounts.get(key) ?? { genre, sessions: 0 };
        genreCounts.set(key, { ...current, sessions: current.sessions + 1 });
      });
    });
    const genreStats = [...genreCounts.values()].sort((a, b) => b.sessions - a.sessions || a.genre.localeCompare(b.genre)).slice(0, 10);
    const dailyCounts = new Map<string, { sessions: number; minutes: number }>();
    data.logs.forEach(log => { const day = log.started_at.slice(0, 10); const item = dailyCounts.get(day) ?? { sessions: 0, minutes: 0 }; item.sessions += 1; item.minutes += log.total_reading_minutes ?? 0; dailyCounts.set(day, item); });
    return {
      totalTitles: data.books.length,
      totalCopies: data.copies.length,
      availableCopies: data.copies.filter(copy => copy.status === "IN_SHELF" || copy.status === "AVAILABLE").length,
      copiesWithReaders: data.copies.filter(copy => copy.status === "WITH_READER").length,
      copiesInReturnCart: data.copies.filter(copy => copy.status === "RETURN_CART").length,
      readerProfiles: data.readers.filter(reader => reader.roles?.name === "reader").length,
      activeReaderAccounts: data.readers.filter(reader => reader.roles?.name === "reader" && reader.is_active).length,
      activeSessions: data.visits.filter(visit => visit.status === "ACTIVE").length,
      completedSessions: completed.length,
      totalReadingMinutes: totalMinutes,
      averageReadingMinutes: completed.length ? Math.round(totalMinutes / completed.length) : 0,
      activeMemberships: data.memberAccounts.filter(account => account.status === "ACTIVE").length,
      activeQuests: data.quests.filter(quest => quest.status === "ACTIVE").length,
      questEnrollments: data.enrollments.length,
      topBooks: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).flatMap(([bookId, sessions]) => {
        const book = booksById.get(bookId);
        return book ? [{ title: book.title, sessions }] : [];
      }),
      leastUsedBooks,
      genreStats,
      dailyActivity: [...dailyCounts].sort(([a], [b]) => a.localeCompare(b)).slice(-31).map(([day, values]) => ({ day, ...values })),
      reportingPeriod: 'current dashboard data',
      questCompletionRate: data.enrollments.length ? Math.round(data.enrollments.filter(item => item.status === 'COMPLETED').length / data.enrollments.length * 100) : 0,
    };
  }, [data]);

  const rankedBooks = useMemo<Record<RankingMode, RankedBook[]>>(() => {
    const counts = new Map<number, number>();
    data.logs.forEach(log => counts.set(log.book_id, (counts.get(log.book_id) ?? 0) + 1));
    const books = data.books.map(book => ({ id: book.book_id, title: book.title, sessions: counts.get(book.book_id) ?? 0, hasCopies: book.book_copies.length > 0 }));
    return {
      most: [...books].sort((a, b) => b.sessions - a.sessions || a.title.localeCompare(b.title)),
      least: [...books].sort((a, b) => a.sessions - b.sessions || a.title.localeCompare(b.title)),
    };
  }, [data]);

  function append(message: Message) {
    setMessages(current => [...current, message]);
  }

  const updateCard = (messageId: number, index: number, patch: Partial<QuestDraft>) => setMessages(current => current.map(message => message.id === messageId ? { ...message, drafts: message.drafts?.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } : message));
  const latestDrafts = () => [...messages].reverse().find(message => message.drafts?.some(item => item.status !== "discarded"))?.drafts?.filter(item => item.status !== "discarded") ?? [];

  async function saveQuest(item: QuestDraft, approve: boolean, source: "ai"|"template" = "ai") {
    const created = await database().schema("sora_v2").rpc("admin_create_quest_draft", { p_name:item.title,p_difficulty:item.difficulty,p_description:item.description,p_objective_type:item.objectiveType,p_target_value:item.targetValue,p_points:item.points,p_days:item.timeLimitDays,p_target_genre:item.targetGenre||null,p_source:source.toUpperCase(),p_feasibility:item.rationale,p_feedback_context:"Approved or edited in BON conversation" });
    if (created.error) throw created.error;
    if (approve) { const reviewed = await database().schema("sora_v2").rpc("admin_review_quest", { p_quest_id:Number(created.data),p_decision:"VERIFIED",p_note:"Approved from BON quest review" }); if (reviewed.error) throw reviewed.error; }
  }

  async function approveCards(messageId: number, indexes: number[]) {
    if (busy || !indexes.length) return; const message = messages.find(item => item.id === messageId); if (!message?.drafts) return;
    setBusy(true);
    try { for (const index of indexes) await saveQuest(message.drafts[index], true, message.source ?? "ai"); setMessages(current => current.map(item => item.id === messageId ? { ...item, drafts:item.drafts?.map((draft,index)=>indexes.includes(index)?{...draft,status:"approved",selected:false}:draft) } : item)); window.dispatchEvent(new Event("quest-data-changed")); append({ id:Date.now(),from:"bon",text:`Approved ${indexes.length} quest${indexes.length===1?"":"s"} into the level-based quest pool.` }); }
    catch (cause) { append({ id:Date.now(),from:"bon",text:friendlyAdminBonError(cause) }); } finally { setBusy(false); }
  }

  useEffect(() => {
    requestAnimationFrame(() => {
      const log = logRef.current;
      if (!log) return;
      const messageId = pendingScrollMessageId.current;
      if (messageId !== null) {
        const target = log.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
        if (target) {
          const top = log.scrollTop + target.getBoundingClientRect().top - log.getBoundingClientRect().top - 8;
          log.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        }
        pendingScrollMessageId.current = null;
        return;
      }
      log.scrollTop = log.scrollHeight;
    });
  }, [messages.length, busy, open]);

  async function answer(question: string, refinementDrafts?: QuestDraft[]) {
    if (busy || requestLockRef.current) return;
    requestLockRef.current = true;
    const isRegeneration = Boolean(refinementDrafts?.length) && /\b(?:regenerate|alternative)\b/i.test(question);
    const effectiveQuestion = isRegeneration ? regenerationPrompts[regenerationIndex.current++ % regenerationPrompts.length] : question;
    const normalizedQuestion = effectiveQuestion.toLowerCase();
    const currentDrafts = refinementDrafts ?? latestDrafts();
    const questRequest = (/\b(?:quests?|challenges?)\b/i.test(effectiveQuestion) && /\b(?:generate|create|draft|regenerate|refine|increase|decrease|adjust|change|make|read|reading|replace)\b/i.test(effectiveQuestion)) || Boolean(currentDrafts.length && /\b(?:regenerate|alternative|refine|increase|decrease|adjust|change|make it|same difficulty|replace|different|distinct)\b/i.test(effectiveQuestion));
    const isBookRanking = /\b(?:books?|titles?|catalog(?:ue)?)\b/.test(normalizedQuestion);
    const isZeroSessionBookQuery = /\b(?:zero|no) reading sessions?\b/.test(normalizedQuestion) && /\b(?:books?|titles?|physical copies)\b/.test(normalizedQuestion);
    const requestedRanking: RankingMode | undefined = isZeroSessionBookQuery || (isBookRanking && /\b(?:least[- ]used|least read|underused)\b/.test(normalizedQuestion))
      ? "least"
      : isBookRanking && /\b(?:most[- ]used|most[- ]read|most popular|top books?|popular books?)\b/.test(normalizedQuestion) ? "most" : undefined;
    if (requestedRanking && !questRequest) {
      const adminId = Date.now();
      const bonId = adminId + 1;
      const label = requestedRanking === "most" ? "most-used" : "least-used";
      setMessages(current => [...current, { id: adminId, from: "admin", text: effectiveQuestion }]);
      setDraft("");
      setLoadingMode("books");
      setBusy(true);
      await new Promise(resolve => window.setTimeout(resolve, 500));
      pendingScrollMessageId.current = bonId;
      setMessages(current => [...current, { id: bonId, from: "bon", text: `These are the ${label} books for current dashboard data, ranked by recorded reading sessions.`, ranking: requestedRanking, rankingShown: 5 }]);
      setLoadingMode(null);
      setBusy(false);
      requestLockRef.current = false;
      return;
    }
    const summaryRequest = /\b(?:analytics|activity|operations|dashboard) summary\b|\bsummar(?:y|ize)\b|\bhow are we doing\b/.test(normalizedQuestion);
    const genreRequest = /\bgenre\b/.test(normalizedQuestion) && /\b(?:most|top|popular|read|activity)\b/.test(normalizedQuestion);
    const questAnalyticsRequest = /\bquest\b/.test(normalizedQuestion) && /\b(?:participation|completion|analytics|progress|how)\b/.test(normalizedQuestion);
    if (!questRequest && (summaryRequest || genreRequest || questAnalyticsRequest)) {
      const adminId = Date.now();
      const bonId = adminId + 1;
      const todayRequest = /\btoday(?:'s|s)?\b/.test(normalizedQuestion);
      const todayKey = manilaDateKey(new Date());
      const periodLogs = todayRequest ? data.logs.filter(log => manilaDateKey(log.started_at) === todayKey) : data.logs;
      const completedPeriodLogs = periodLogs.filter(log => Boolean(log.returned_at));
      const periodMinutes = completedPeriodLogs.reduce((sum, log) => sum + (log.total_reading_minutes ?? 0), 0);
      const summaryPeriod = todayRequest ? "Today, Philippine time" : context.reportingPeriod;
      const periodGenreStats = todayRequest ? (() => {
        const books = new Map(data.books.map(book => [book.book_id, book]));
        const counts = new Map<string, { label: string; sessions: number }>();
        periodLogs.forEach(log => {
          const genres = books.get(log.book_id)?.book_genres.flatMap(item => item.genre.split(/[,;/|]+/)).map(item => item.trim()).filter(Boolean) ?? [];
          (genres.length ? genres : ["Uncategorized"]).forEach(label => {
            const key = label.toLocaleLowerCase();
            const current = counts.get(key) ?? { label, sessions: 0 };
            counts.set(key, { ...current, sessions: current.sessions + 1 });
          });
        });
        return [...counts.values()].sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label)).slice(0, 5);
      })() : context.genreStats.slice(0, 5).map(item => ({ label: item.genre, sessions: item.sessions }));
      const widgets: AdminBonWidget[] = summaryRequest
        ? [{ type: "summary", period: summaryPeriod, completedSessions: todayRequest ? completedPeriodLogs.length : context.completedSessions, activeSessions: context.activeSessions, totalMinutes: todayRequest ? periodMinutes : context.totalReadingMinutes, averageMinutes: todayRequest && completedPeriodLogs.length ? Math.round(periodMinutes / completedPeriodLogs.length) : todayRequest ? 0 : context.averageReadingMinutes, availableCopies: context.availableCopies, activeReaders: context.activeReaderAccounts, totalReaders: context.readerProfiles, questCompletionRate: context.questCompletionRate }]
        : genreRequest
          ? [{ type: "genres", period: summaryPeriod, items: periodGenreStats }]
          : [{ type: "quests", activeQuests: context.activeQuests, enrollments: context.questEnrollments, completionRate: context.questCompletionRate }];
      const text = summaryRequest
        ? "Here is a verified overview of the library's recorded activity."
        : genreRequest
          ? (periodGenreStats.length ? "Here are the most active genres based on recorded reading sessions." : "No genre activity is recorded for this period.")
          : todayRequest ? "Quest records do not include dated completion history, so this card shows the current participation overview." : "Here is the current quest participation overview.";
      setMessages(current => [...current, { id: adminId, from: "admin", text: effectiveQuestion }]);
      setDraft("");
      setLoadingMode("analytics");
      setBusy(true);
      await new Promise(resolve => window.setTimeout(resolve, 450));
      pendingScrollMessageId.current = bonId;
      setMessages(current => [...current, { id: bonId, from: "bon", text, widgets }]);
      setLoadingMode(null);
      setBusy(false);
      requestLockRef.current = false;
      return;
    }
    const prior = messages.slice(-4).map(message => ({ role: message.from === "admin" ? "user" : "assistant", content: message.text }));
    setMessages(current => [...current, { id: Date.now(), from: "admin", text: effectiveQuestion }]);
    setDraft("");
    setBusy(true);
    try {
      const { data: sessionData } = await database().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Librarian sign-in is required.");
      const response = await fetch(questRequest ? "/api/quest-suggestion" : "/api/admin-bon-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(questRequest ? { prompt:effectiveQuestion,existingDrafts:currentDrafts } : { message: effectiveQuestion, history: prior, context }),
      });
      const payload = await response.json() as { message?: string; drafts?: QuestDraft[]; source?: "ai"|"template"; widgets?: unknown; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error || "BON could not answer right now.");
      const widgets = Array.isArray(payload.widgets) ? payload.widgets.filter(isAdminBonWidget).slice(0, 3) : undefined;
      append({ id: Date.now() + 1, from: "bon", text: payload.message, drafts:payload.drafts?.map(item=>({...item,selected:true,status:"draft"})), source:payload.source, widgets });
    } catch (cause) {
      append({ id: Date.now() + 1, from: "bon", text: friendlyAdminBonError(cause) });
    } finally { setBusy(false); requestLockRef.current = false; }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (draft.trim() && !busy) void answer(draft.trim()); }
  const suggestions = ["Today's analytics summary", "Which genre is most read?", "Show the least-used books", "How is quest participation?"];

  useEffect(() => { const openQuest = () => { const prompt=questStarters[starterIndex.current++%questStarters.length]; setOpen(true); window.setTimeout(()=>void answer(prompt),0); }; window.addEventListener("open-bon-quest",openQuest); return()=>window.removeEventListener("open-bon-quest",openQuest); });

  useEffect(() => {
    if (!dragging || pos === null) return;
    const clamp = (value: number, max: number) => Math.min(Math.max(value, MARGIN), max);
    const onMove = (event: PointerEvent) => {
      const { startX, startY, baseX, baseY } = dragState.current;
      if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 6) dragState.current.moved = true;
      setPos({ x: clamp(baseX + event.clientX - startX, window.innerWidth - BUTTON - MARGIN), y: clamp(baseY + event.clientY - startY, window.innerHeight - BUTTON - MARGIN) });
    };
    const onUp = () => {
      setDragging(false);
      setPos(current => current ? {
        x: current.x + BUTTON / 2 < window.innerWidth / 2 ? MARGIN : window.innerWidth - BUTTON - MARGIN,
        y: Math.min(Math.max(current.y, MARGIN), window.innerHeight - BUTTON - MARGIN),
      } : current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [dragging, pos]);

  function startDrag(event: React.PointerEvent) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = { x: rect.left, y: rect.top };
    if (!pos) setPos(next);
    dragState.current = { startX: event.clientX, startY: event.clientY, baseX: next.x, baseY: next.y, moved: false };
    setDragging(true);
  }

  useEffect(() => {
    const onResize = () => setPos(current => current ? {
      x: current.x + BUTTON / 2 < window.innerWidth / 2 ? MARGIN : window.innerWidth - BUTTON - MARGIN,
      y: Math.min(Math.max(current.y, MARGIN), window.innerHeight - BUTTON - MARGIN),
    } : current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggle() { if (!dragState.current.moved) setOpen(value => !value); }
  const anchoredLeft = pos ? pos.x + BUTTON / 2 < window.innerWidth / 2 : false;
  const panelBelow = pos ? pos.y > window.innerHeight / 2 : true;

  return <div ref={wrapRef} onPointerDown={startDrag} style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", width: BUTTON } : undefined} className={`assistive-wrap fixed bottom-5 right-5 z-50 ${dragging ? "is-dragging" : ""} ${panelBelow ? "" : "panel-below"}`}>
    {open && <section className={`analytics-panel assistive-panel flex h-[min(680px,calc(100dvh-5rem))] w-[min(560px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-[#e4d4c3] bg-[#fffdf9] shadow-[0_24px_70px_rgba(57,36,20,.25)] [&>div:first-of-type]:min-h-0 [&>form]:shrink-0 [&>header]:shrink-0 ${anchoredLeft ? "assistive-panel-left" : ""}`} role="dialog" aria-label="Chat with BON">
      <header className="flex items-center gap-3 bg-[#59351e] px-4 py-3.5 text-[#fff9ef]"><div className="insights-message-avatar h-10 w-10 rounded-xl border border-[#f5c822] bg-[#f8eddc]"><img src="/ai-mascot.png" alt="BON" /></div><div className="min-w-0"><b className="block text-sm">BON Analytics</b><small className="block truncate text-[11px] text-[#e8c9ad]">Library data assistant · online</small></div><button className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close chat"><X size={18}/></button></header>
      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 text-[13px]">{messages.map(message => <div key={message.id} data-message-id={message.id} className={message.from==="admin"?"ml-auto w-fit max-w-[86%]":"max-w-full"}><p className={`w-fit max-w-full rounded-2xl px-3.5 py-2.5 leading-5 shadow-sm ${message.from === "bon" ? "border border-[#eadfd3] bg-[#fff7eb] text-[#59351e]" : "ml-auto bg-[#a83d12] text-white"}`}>{message.text}</p>{message.from === "bon" && message.widgets?.length ? <AdminBonWidgets widgets={message.widgets}/> : null}{message.drafts?.length ? <div className="mt-2 space-y-2">{message.drafts.map((item,index)=><article key={`${message.id}-${index}`} className={`rounded-xl border p-3 ${item.status==="approved"?"border-emerald-300 bg-emerald-50":item.status==="discarded"?"hidden":"border-[#dfc49d] bg-white"}`}><div className="flex items-start gap-2"><input type="checkbox" checked={Boolean(item.selected)} onChange={event=>updateCard(message.id,index,{selected:event.target.checked})} aria-label={`Select ${item.title}`}/><div className="min-w-0 flex-1">{item.editing?<div className="space-y-2"><label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-[#59351e]">Quest title</span><input value={item.title} onChange={event=>updateCard(message.id,index,{title:event.target.value})} className="w-full rounded border p-2 font-bold"/></label><label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-[#59351e]">Quest description</span><textarea value={item.description} onChange={event=>updateCard(message.id,index,{description:event.target.value})} className="w-full rounded border p-2"/></label><div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-[9px] font-bold uppercase text-[#71543d]">Difficulty</span><select value={item.difficulty} onChange={event=>updateCard(message.id,index,{difficulty:event.target.value as QuestDraft["difficulty"]})} className="w-full rounded border p-2"><option>Easy</option><option>Medium</option><option>Hard</option></select></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-[#71543d]">Books required</span><input value={item.targetValue} type="number" min="1" onChange={event=>updateCard(message.id,index,{targetValue:Number(event.target.value)})} className="w-full min-w-0 rounded border p-2"/></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-[#71543d]">Reward points</span><input value={item.points} type="number" min="1" onChange={event=>updateCard(message.id,index,{points:Number(event.target.value)})} className="w-full min-w-0 rounded border p-2"/></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-[#71543d]">Time limit (days)</span><input value={item.timeLimitDays} type="number" min="1" onChange={event=>updateCard(message.id,index,{timeLimitDays:Number(event.target.value)})} className="w-full min-w-0 rounded border p-2"/></label></div><label className="block"><span className="mb-1 block text-[9px] font-bold uppercase text-[#71543d]">Genre</span><input value={item.targetGenre} onChange={event=>updateCard(message.id,index,{targetGenre:event.target.value})} placeholder="Leave blank for any genre" className="w-full rounded border p-2"/></label></div>:<><b className="block text-[#59351e]">{item.title}</b><span className="text-[10px] font-bold uppercase text-[#a65b1e]">{item.difficulty} · {item.targetValue} books · {item.points} points · {item.timeLimitDays} days</span><p className="mt-1 text-xs leading-4 text-[#71543d]">{item.description}</p><p className="mt-1 text-[10px] text-emerald-700">{item.rationale}</p></>}</div></div><div className="mt-2 flex flex-wrap gap-1"><button onClick={()=>void approveCards(message.id,[index])} className="rounded bg-[#a83d12] px-2 py-1 text-[10px] font-bold text-white"><Check size={11} className="inline"/> Approve</button><button onClick={()=>{updateCard(message.id,index,{editing:!item.editing});}} className="rounded border px-2 py-1 text-[10px]"><Edit3 size={11} className="inline"/> Edit manually</button><button onClick={()=>{setDraft(`Refine \"${item.title}\": `);}} className="rounded border px-2 py-1 text-[10px]">Refine</button><button onClick={()=>void answer(`Regenerate an alternative to \"${item.title}\" with the same difficulty.`,[item])} className="rounded border px-2 py-1 text-[10px]"><RefreshCw size={11} className="inline"/> Regenerate</button><button onClick={()=>updateCard(message.id,index,{status:"discarded",selected:false})} className="rounded border px-2 py-1 text-[10px] text-rose-700"><Trash2 size={11} className="inline"/> Discard</button></div></article>)}{message.drafts.some(item=>item.status==="draft")&&<button onClick={()=>void approveCards(message.id,message.drafts!.map((item,index)=>item.selected&&item.status==="draft"?index:-1).filter(index=>index>=0))} className="w-full rounded-lg bg-[#59351e] px-3 py-2 text-xs font-bold text-white">Approve selected</button>}</div>:null}{message.ranking ? <AdminRankingPanel mode={message.ranking} books={rankedBooks[message.ranking]} shown={message.rankingShown ?? 5} setShown={value => setMessages(current => current.map(item => item.id === message.id ? { ...item, rankingShown: value } : item))} onOpenAnalytics={onOpenAnalytics} /> : null}</div>)}{busy && <p role="status" className="flex w-fit items-center gap-2 rounded-2xl border border-[#eadfd3] bg-[#fff7eb] px-3.5 py-2.5 leading-5 text-[#59351e]"><LoaderCircle className="animate-spin" size={14}/>{loadingMode === "books" ? "Loading book usage data..." : loadingMode === "analytics" ? "Preparing verified analytics..." : "Analyzing Tankobonbon data..."}</p>}</div>
      {messages.some(message=>message.drafts?.length)&&<div className="border-t border-[#eadfd3] bg-[#fffaf3] px-3 pt-2.5"><button type="button" disabled={busy} onClick={()=>{setDraft("");window.setTimeout(()=>inputRef.current?.focus(),0);}} className="w-full rounded-xl border border-[#a83d12] bg-white px-3 py-2 text-xs font-bold text-[#a83d12] transition hover:bg-[#fff4e8] disabled:opacity-50">Want a different quest? Write your own AI prompt</button></div>}
      <div className="flex gap-2 overflow-x-auto border-t border-[#eadfd3] bg-[#fffaf3] px-3 py-2.5">{suggestions.map(suggestion => <button key={suggestion} disabled={busy} onClick={() => void answer(suggestion)} className="max-w-[220px] shrink-0 whitespace-normal rounded-full border border-[#d6b58f] bg-white px-3 py-1.5 text-left text-[10px] font-semibold leading-4 text-[#804916] transition hover:bg-[#fff2df] disabled:opacity-50">{suggestion}</button>)}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[#eadfd3] bg-white p-3"><input ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} maxLength={800} disabled={busy} placeholder={messages.some(message=>message.drafts?.length) ? "Ask BON to refine or create a quest..." : "Ask BON about library analytics..."} className="min-w-0 flex-1 rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-2.5 text-[13px] outline-none transition focus:border-[#a83d12] focus:ring-2 focus:ring-[#a83d12]/10 disabled:opacity-60"/><button disabled={busy || !draft.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#a83d12] text-white transition hover:bg-[#8f320d] disabled:opacity-50" aria-label="Send message"><Send size={16}/></button></form>
    </section>}
    <button onClick={toggle} onPointerDown={startDrag} aria-label={open ? "Close BON chat" : "Open BON chat"} className="assistive-button" aria-expanded={open}>
      <span className="assistive-ring" aria-hidden="true"/><img src="/ai-mascot.png" alt="" draggable={false} className="assistive-avatar"/><span className="assistive-badge" aria-hidden="true"><MessageCircle size={11}/></span>
    </button>
  </div>;
}

function AdminRankingPanel({ mode, books, shown, setShown, onOpenAnalytics }: { mode: RankingMode; books: RankedBook[]; shown: number; setShown: (value: number) => void; onOpenAnalytics?: () => void }) {
  const visible = books.slice(0, shown);
  const max = Math.max(1, ...books.map(book => book.sessions));
  const title = mode === "most" ? "Most-used books" : "Least-used books";
  const remaining = Math.max(0, books.length - shown);
  return <section onPointerDown={event => event.stopPropagation()} className="mt-2 rounded-2xl border border-[#eadfd3] bg-[#fffaf3] p-4 text-[#59351e] shadow-sm" aria-label={title}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-[#8d735e]">{mode === "most" ? "Highest reading activity first" : "Lowest reading activity first"} · current recorded activity</p></div><span className="rounded-full bg-[#f3e6d2] px-2 py-1 text-[10px] font-bold uppercase tracking-wider">{books.length} titles</span></div>
    <div className="mt-4 space-y-3">{visible.map((book, index) => <div key={book.id}><div className="flex items-center gap-2 text-sm"><b className="w-5 text-[#8d735e]">{index + 1}.</b><span className="min-w-0 flex-1 truncate font-semibold">{book.title}</span><span className="shrink-0 text-xs text-[#71543d]">{book.sessions} {book.sessions === 1 ? "session" : "sessions"}</span></div><div className="ml-7 mt-1 h-2 overflow-hidden rounded-full bg-[#eadfce]"><span className="block h-full rounded-full bg-[#b88945]" style={{ width: `${book.sessions ? Math.max(3, (book.sessions / max) * 100) : 0}%` }} /></div>{mode === "least" && !book.hasCopies ? <span className="ml-7 mt-1 block text-[10px] text-[#a65b1e]">No physical copies recorded</span> : null}</div>)}</div>
    <div className="mt-4 border-t border-[#dfc49d] pt-3 text-center"><p className="text-xs text-[#71543d]">Showing {visible.length} of {books.length} titles.</p>{remaining > 0 ? <button type="button" onClick={() => setShown(Math.min(books.length, shown + 5))} className="mt-2 w-full rounded-xl border border-[#d6b58f] bg-white px-3 py-2 text-xs font-bold text-[#804916] hover:bg-[#fff2df]">View more books</button> : null}<button type="button" onClick={onOpenAnalytics} className="mt-2 w-full rounded-xl bg-[#59351e] px-3 py-2 text-xs font-bold text-white hover:bg-[#7a4928]">View full analytics</button></div>
  </section>;
}
