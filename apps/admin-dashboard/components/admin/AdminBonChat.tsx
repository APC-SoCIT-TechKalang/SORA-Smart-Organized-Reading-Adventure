"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, Send, X } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";
import type { DashboardData } from "./dashboard-data";

type ChatData = Pick<DashboardData, "books" | "copies" | "readers" | "memberAccounts" | "visits" | "logs" | "quests" | "enrollments">;
type Message = { id: number; from: "bon" | "admin"; text: string };

const BUTTON = 62;
const MARGIN = 10;

export function AdminBonChat({ data }: { data: ChatData }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: 1, from: "bon", text: "Hi, librarian! Ask me about Tankobonbon analytics, catalog activity, readers, memberships, sessions, or quests." }]);
  const logRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false });

  const context = useMemo(() => {
    const counts = new Map<number, number>();
    data.logs.forEach(log => counts.set(log.book_id, (counts.get(log.book_id) || 0) + 1));
    const completed = data.logs.filter(log => Boolean(log.returned_at));
    const totalMinutes = completed.reduce((sum, log) => sum + (log.total_reading_minutes ?? 0), 0);
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
        const book = data.books.find(item => item.book_id === bookId);
        return book ? [{ title: book.title, sessions }] : [];
      }),
    };
  }, [data]);

  function append(message: Message) {
    setMessages(current => [...current, message]);
    requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });
  }

  async function answer(question: string) {
    if (busy) return;
    const prior = messages.slice(-4).map(message => ({ role: message.from === "admin" ? "user" : "assistant", content: message.text }));
    setMessages(current => [...current, { id: Date.now(), from: "admin", text: question }]);
    setDraft("");
    setBusy(true);
    try {
      const { data: sessionData } = await database().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Librarian sign-in is required.");
      const response = await fetch("/api/admin-bon-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: question, history: prior, context }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error || "BON could not answer right now.");
      append({ id: Date.now() + 1, from: "bon", text: payload.message });
    } catch (cause) {
      append({ id: Date.now() + 1, from: "bon", text: errorMessage(cause) });
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (draft.trim() && !busy) void answer(draft.trim()); }
  const suggestions = ["Give me today's analytics summary", "What is the most-read book?", "How healthy is the catalog?", "What is Tankobonbon?"];

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
    {open && <section className={`analytics-panel assistive-panel flex h-[min(520px,calc(100dvh-9rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#e4d4c3] bg-[#fffdf9] shadow-[0_24px_70px_rgba(57,36,20,.25)] ${anchoredLeft ? "assistive-panel-left" : ""}`} role="dialog" aria-label="Chat with BON">
      <header className="flex items-center gap-3 bg-[#59351e] px-4 py-4 text-[#fff9ef]"><div className="insights-message-avatar h-11 w-11 rounded-2xl border border-[#f5c822] bg-[#f8eddc]"><img src="/ai-mascot.png" alt="BON" /></div><div><b className="block text-sm">BON</b><small className="text-[#e8c9ad]">Tankobonbon analytics assistant · online</small></div><button className="ml-auto" onClick={() => setOpen(false)} aria-label="Close chat"><X size={19}/></button></header>
      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">{messages.map(message => <p key={message.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${message.from === "bon" ? "border border-[#eadfd3] bg-[#fff5e8] text-[#59351e]" : "ml-auto bg-[#a83d12] text-white"}`}>{message.text}</p>)}{busy && <p role="status" className="flex w-fit items-center gap-2 rounded-2xl border border-[#eadfd3] bg-[#fff5e8] px-3.5 py-2.5 text-[#59351e]"><LoaderCircle className="animate-spin" size={14}/>Analyzing Tankobonbon data...</p>}</div>
      <div className="flex gap-2 overflow-x-auto border-t border-[#eadfd3] p-3">{suggestions.map(suggestion => <button key={suggestion} disabled={busy} onClick={() => void answer(suggestion)} className="shrink-0 rounded-full border border-[#d6b58f] px-3 py-1.5 text-[11px] font-semibold text-[#804916] disabled:opacity-50">{suggestion}</button>)}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[#eadfd3] p-3"><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={800} disabled={busy} placeholder="Ask about Tankobonbon analytics..." className="min-w-0 flex-1 rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-2.5 text-sm outline-none focus:border-[#a83d12] disabled:opacity-60"/><button disabled={busy || !draft.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#a83d12] text-white disabled:opacity-50" aria-label="Send message"><Send size={16}/></button></form>
    </section>}
    <button onClick={toggle} onPointerDown={startDrag} aria-label={open ? "Close BON chat" : "Open BON chat"} className="assistive-button" aria-expanded={open}>
      <span className="assistive-ring" aria-hidden="true"/><img src="/ai-mascot.png" alt="" draggable={false} className="assistive-avatar"/><span className="assistive-badge" aria-hidden="true"><MessageCircle size={11}/></span>
    </button>
  </div>;
}
