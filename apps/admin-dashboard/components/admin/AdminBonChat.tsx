"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import type { DashboardData } from "./dashboard-data";

type ChatData = Pick<DashboardData, "books" | "copies" | "readers" | "visits" | "logs">;
type Message = { id: number; from: "bon" | "admin"; text: string };

const BUTTON = 62; // assistive-touch circle size
const MARGIN = 10;

export function AdminBonChat({ data }: { data: ChatData }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: 1, from: "bon", text: "Hi, librarian! Ask me about borrowing trends, popular books, readers, or the reading room today." }]);
  const logRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false });

  function answer(question: string) {
    const q = question.toLowerCase();
    const top = stats[0];
    let text = top?.book ? `${top.book.title} is the most borrowed/read title with ${top.count} recorded reading session${top.count === 1 ? "" : "s"}.` : "There are no reading sessions recorded yet.";
    if (q.includes("active") || q.includes("reader") || q.includes("visit")) text = `${data.visits.filter(visit => visit.status === "ACTIVE").length} reader visit${data.visits.filter(visit => visit.status === "ACTIVE").length === 1 ? " is" : "s are"} active right now, with ${data.readers.length} reader profiles in the archive.`;
    else if (q.includes("available") || q.includes("copy") || q.includes("shelf")) text = `${data.copies.filter(copy => copy.status === "IN_SHELF" || copy.status === "AVAILABLE").length} copies appear available on the shelves out of ${data.copies.length} total copies.`;
    else if (q.includes("return")) text = `${data.logs.filter(log => log.returned_at).length} reading session${data.logs.filter(log => log.returned_at).length === 1 ? " has" : "s have"} been returned. ${data.logs.filter(log => !log.returned_at).length} remain open.`;
    else if (q.includes("top") || q.includes("popular") || q.includes("borrow") || q.includes("most")) text = top?.book ? `${top.book.title} leads the archive with ${top.count} recorded reading session${top.count === 1 ? "" : "s"}.` : text;
    setMessages(current => [...current, { id: Date.now(), from: "admin", text: question }, { id: Date.now() + 1, from: "bon", text }]);
    setDraft("");
    requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });
  }

  function submit(event: FormEvent) { event.preventDefault(); if (draft.trim()) answer(draft.trim()); }
  const suggestions = ["What is the most borrowed book?", "How many readers are active?", "How many copies are available?"];
  const stats = useMemo(() => {
    const counts = new Map<number, number>();
    data.logs.forEach(log => counts.set(log.book_id, (counts.get(log.book_id) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([bookId, count]) => ({ book: data.books.find(book => book.book_id === bookId), count }));
  }, [data]);

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
      setPos(current => {
        if (!current) return current;
        const mid = current.x + BUTTON / 2;
        const snappedX = mid < window.innerWidth / 2 ? MARGIN : window.innerWidth - BUTTON - MARGIN;
        const y = Math.min(Math.max(current.y, MARGIN), window.innerHeight - BUTTON - MARGIN);
        return { x: snappedX, y };
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [dragging]);

  function startDrag(event: React.PointerEvent) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = { x: rect.left, y: rect.top };
    if (!pos) setPos(next);
    dragState.current = { startX: event.clientX, startY: event.clientY, baseX: next.x, baseY: next.y, moved: false };
    setDragging(true);
  }

  // Re-clamp and re-snap when the window is resized (keeps placement responsive)
  useEffect(() => {
    const onResize = () => setPos(current => {
      if (!current) return current;
      const x = current.x + BUTTON / 2 < window.innerWidth / 2 ? MARGIN : window.innerWidth - BUTTON - MARGIN;
      return { x, y: Math.min(Math.max(current.y, MARGIN), window.innerHeight - BUTTON - MARGIN) };
    });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggle() {
    if (dragState.current.moved) return;
    setOpen(value => !value);
  }

  const anchoredLeft = pos ? pos.x + BUTTON / 2 < window.innerWidth / 2 : false;
  const panelBelow = pos ? pos.y > window.innerHeight / 2 : true;
  return <div ref={wrapRef} onPointerDown={startDrag} style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", width: BUTTON } : undefined} className={`assistive-wrap fixed bottom-5 right-5 z-50 ${dragging ? "is-dragging" : ""} ${panelBelow ? "" : "panel-below"}`}>
    {open && <section className={`analytics-panel assistive-panel flex h-[min(480px,calc(100dvh-9rem))] w-[min(370px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#e4d4c3] bg-[#fffdf9] shadow-[0_24px_70px_rgba(57,36,20,.25)] ${anchoredLeft ? "assistive-panel-left" : ""}`} role="dialog" aria-label="Chat with BON">
      <header className="flex items-center gap-3 bg-[#59351e] px-4 py-4 text-[#fff9ef]"><div className="insights-message-avatar h-11 w-11 rounded-2xl border border-[#f5c822] bg-[#f8eddc]"><img src="/ai-mascot.png" alt="BON" /></div><div><b className="block text-sm">BON</b><small className="text-[#e8c9ad]">Admin archive assistant · online</small></div><button className="ml-auto" onClick={() => setOpen(false)} aria-label="Close chat"><X size={19}/></button></header>
      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">{messages.map(message => <p key={message.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${message.from === "bon" ? "border border-[#eadfd3] bg-[#fff5e8] text-[#59351e]" : "ml-auto bg-[#a83d12] text-white"}`}>{message.text}</p>)}</div>
      <div className="flex gap-2 overflow-x-auto border-t border-[#eadfd3] p-3">{suggestions.map(suggestion => <button key={suggestion} onClick={() => answer(suggestion)} className="shrink-0 rounded-full border border-[#d6b58f] px-3 py-1.5 text-[11px] font-semibold text-[#804916]">{suggestion}</button>)}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[#eadfd3] p-3"><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask BON about the archive…" className="min-w-0 flex-1 rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-2.5 text-sm outline-none focus:border-[#a83d12]"/><button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#a83d12] text-white" aria-label="Send message"><Send size={16}/></button></form>
    </section>}
    <button onClick={toggle} onPointerDown={startDrag} aria-label={open ? "Close BON chat" : "Open BON chat"} className="assistive-button" aria-expanded={open}>
      <span className="assistive-ring" aria-hidden="true"/>
      <img src="/ai-mascot.png" alt="" draggable={false} className="assistive-avatar"/>
      <span className="assistive-badge" aria-hidden="true"><MessageCircle size={11}/></span>
    </button>
  </div>;
}
