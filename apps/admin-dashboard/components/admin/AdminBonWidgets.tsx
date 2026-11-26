"use client";

import { BookOpen, Clock3, LibraryBig, Target, Users } from "lucide-react";

export type AdminBonWidget =
  | { type: "summary"; period: string; completedSessions: number; activeSessions: number; totalMinutes: number; averageMinutes: number; availableCopies: number; activeReaders: number; totalReaders: number; questCompletionRate: number }
  | { type: "genres"; period: string; items: { label: string; sessions: number }[] }
  | { type: "quests"; activeQuests: number; enrollments: number; completionRate: number };

export function isAdminBonWidget(value: unknown): value is AdminBonWidget {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const safeNumber = (key: string, max = 100_000_000) => typeof item[key] === "number" && Number.isFinite(item[key]) && item[key] >= 0 && item[key] <= max;
  if (item.type === "summary") return typeof item.period === "string" && item.period.length <= 120 && ["completedSessions", "activeSessions", "totalMinutes", "averageMinutes", "availableCopies", "activeReaders", "totalReaders"].every(key => safeNumber(key)) && safeNumber("questCompletionRate", 100);
  if (item.type === "genres") return typeof item.period === "string" && item.period.length <= 120 && Array.isArray(item.items) && item.items.length <= 10 && item.items.every(entry => Boolean(entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).label === "string" && ((entry as Record<string, unknown>).label as string).length <= 100 && typeof (entry as Record<string, unknown>).sessions === "number" && Number.isFinite((entry as Record<string, unknown>).sessions) && Number((entry as Record<string, unknown>).sessions) >= 0));
  if (item.type === "quests") return safeNumber("activeQuests") && safeNumber("enrollments") && safeNumber("completionRate", 100);
  return false;
}

export function friendlyAdminBonError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (message === "Librarian sign-in is required." || message === "Librarian access is required.") return message;
  if (/rate|rest|429/i.test(message)) return "BON is handling several requests right now. Please wait a moment and try again.";
  return "BON could not reach the analytics service. Your dashboard data is safe. Please check your connection and try again.";
}

export function AdminBonWidgets({ widgets }: { widgets: AdminBonWidget[] }) {
  return <div className="mt-2 space-y-2">{widgets.map((widget, index) => {
    if (widget.type === "summary") return <SummaryWidget key={`${widget.type}-${index}`} widget={widget}/>;
    if (widget.type === "genres") return <GenreWidget key={`${widget.type}-${index}`} widget={widget}/>;
    return <QuestWidget key={`${widget.type}-${index}`} widget={widget}/>;
  })}</div>;
}

function SummaryWidget({ widget }: { widget: Extract<AdminBonWidget, { type: "summary" }> }) {
  const metrics = [
    { icon: BookOpen, value: widget.completedSessions, label: "Completed sessions" },
    { icon: Users, value: widget.activeSessions, label: "Active sessions" },
    { icon: Clock3, value: `${widget.totalMinutes.toLocaleString()} min`, label: "Reading time" },
    { icon: Clock3, value: `${widget.averageMinutes.toLocaleString()} min`, label: "Average session" },
    { icon: LibraryBig, value: widget.availableCopies, label: "Available copies" },
    { icon: Users, value: `${widget.activeReaders} / ${widget.totalReaders}`, label: "Active reader accounts" },
  ];
  return <section className="rounded-2xl border border-[#dfc49d] bg-[#fffaf3] p-3.5 text-[#59351e] shadow-sm" aria-label="Library analytics summary">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg font-semibold">Library activity summary</h3><p className="mt-0.5 text-[10px] text-[#8d735e]">{widget.period}</p></div><span className="rounded-full bg-[#f3e6d2] px-2 py-1 text-[9px] font-bold uppercase tracking-wider">Verified data</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2">{metrics.map(metric => <div key={metric.label} className="rounded-xl bg-[#f5ead8] p-2.5"><metric.icon size={13} className="text-[#a65b1e]"/><strong className="mt-1 block text-lg leading-none">{metric.value}</strong><span className="mt-1 block text-[9px] leading-3 text-[#71543d]">{metric.label}</span></div>)}</div>
    <div className="mt-3 flex items-center justify-between text-xs"><span className="font-semibold">Quest completion</span><strong>{widget.questCompletionRate}%</strong></div>
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#eadfce]"><span className="block h-full rounded-full bg-[#b88945]" style={{ width: `${Math.max(0, Math.min(100, widget.questCompletionRate))}%` }}/></div>
  </section>;
}

function GenreWidget({ widget }: { widget: Extract<AdminBonWidget, { type: "genres" }> }) {
  const max = Math.max(1, ...widget.items.map(item => item.sessions));
  return <section className="rounded-2xl border border-[#dfc49d] bg-[#fffaf3] p-3.5 text-[#59351e] shadow-sm"><h3 className="font-serif text-lg font-semibold">Genre activity</h3><p className="text-[10px] text-[#8d735e]">{widget.period}</p><div className="mt-3 space-y-2.5">{widget.items.slice(0, 5).map((item, index) => <div key={item.label}><div className="flex gap-2 text-xs"><b className="w-4 text-[#8d735e]">{index + 1}.</b><span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span><span>{item.sessions} sessions</span></div><div className="ml-6 mt-1 h-2 overflow-hidden rounded-full bg-[#eadfce]"><span className="block h-full rounded-full bg-[#b88945]" style={{ width: `${(item.sessions / max) * 100}%` }}/></div></div>)}</div></section>;
}

function QuestWidget({ widget }: { widget: Extract<AdminBonWidget, { type: "quests" }> }) {
  return <section className="rounded-2xl border border-[#dfc49d] bg-[#fffaf3] p-3.5 text-[#59351e] shadow-sm"><div className="flex items-center gap-2"><Target size={16} className="text-[#a65b1e]"/><h3 className="font-serif text-lg font-semibold">Quest participation</h3></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#f5ead8] p-3"><strong className="text-xl">{widget.activeQuests}</strong><span className="block text-[9px] text-[#71543d]">Active quests</span></div><div className="rounded-xl bg-[#f5ead8] p-3"><strong className="text-xl">{widget.enrollments}</strong><span className="block text-[9px] text-[#71543d]">Enrollments</span></div></div><div className="mt-3 flex justify-between text-xs"><span>Completion rate</span><strong>{widget.completionRate}%</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#eadfce]"><span className="block h-full rounded-full bg-[#b88945]" style={{ width: `${Math.max(0, Math.min(100, widget.completionRate))}%` }}/></div></section>;
}
