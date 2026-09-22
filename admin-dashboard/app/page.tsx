"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { database, errorMessage, supabase } from "./lib/supabase";
import { PastUIDashboard } from "./past-ui-dashboard";
import { ChevronRight, Eye, EyeOff, KeyRound, LockKeyhole, Sparkles } from "lucide-react";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingRole, setCheckingRole] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAccessError("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in admin-dashboard/.env.local, then restart.");
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setIsAdmin(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session) return;
    setCheckingRole(true);
    void (async () => {
      try {
        const { data, error } = await database().rpc("has_role", { required_role: "admin" });
        if (error) throw error;
        if (!cancelled) {
          setIsAdmin(data === true);
          setAccessError(data ? "" : "This account is not an active staff administrator.");
        }
      } catch (error) {
        if (!cancelled) setAccessError(errorMessage(error));
      } finally {
        if (!cancelled) setCheckingRole(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id]);

  if (checkingRole) return <main className="grid min-h-screen place-items-center bg-[#28140d] text-[#fff9ef]">Checking staff access…</main>;
  if (!isAdmin) return <LockScreen accessError={accessError} onSignedIn={setSession} />;
  return <PastUIDashboard />;
}

function LockScreen({accessError,onSignedIn}:{accessError:string;onSignedIn:(session:Session)=>void}) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [showPassword, setShowPassword] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error } = await database().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!data.session) throw new Error("Your sign-in session could not be established. Please try again.");
      onSignedIn(data.session);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return <main className="lock-screen relative min-h-screen overflow-hidden bg-[#28140d] text-[#fff9ef]">
    <div className="lock-noise" aria-hidden="true" />
    <div className="lock-orbit lock-orbit-one" aria-hidden="true" />
    <div className="lock-orbit lock-orbit-two" aria-hidden="true" />
    <div className="lock-glow lock-glow-one" aria-hidden="true" />
    <div className="lock-glow lock-glow-two" aria-hidden="true" />
    <div className="page-particles" aria-hidden="true">{Array.from({length: 12}, (_, index) => <span key={index} style={{"--i":index} as React.CSSProperties}>✦</span>)}</div>
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-7 sm:px-10 lg:px-14">
      <header className="flex items-center justify-between"><OfficialLogo lockup="lock"/><div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#e8c9ad]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f5c822]"/>Station 01 · secure</div></header>
      <div className="flex flex-1 items-center justify-center py-12"><div className="grid w-full items-center gap-14 lg:grid-cols-[1fr_430px] lg:gap-24">
        <section className="hidden lg:block"><p className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.3em] text-[#f5c822]"><Sparkles size={14}/> Welcome back, librarian</p><h1 className="max-w-xl font-serif text-6xl font-semibold leading-[.98] tracking-tight xl:text-7xl">Every story<br/><span className="text-[#e69b62]">has a place.</span></h1><p className="mt-7 max-w-md text-sm leading-7 text-[#d9bea0]">The reading room is ready for its next chapter. Unlock the terminal to continue organizing today’s adventure.</p><div className="mt-10 flex items-center gap-4 text-xs text-[#bb9576]"><span className="h-px w-12 bg-[#a83d12]"/>A quiet space for big stories</div></section>
        <section className={`lock-card rounded-[2rem] border border-white/15 p-7 shadow-2xl sm:p-9 ${error ? "lock-shake" : ""}`}><div className="mb-8 text-center"><div className="lock-emblem mx-auto mb-5"><LockKeyhole size={25} strokeWidth={1.7}/></div><p className="text-[10px] font-bold uppercase tracking-[.27em] text-[#e69b62]">Admin terminal</p><h2 className="mt-3 font-serif text-3xl font-semibold">The reading room awaits</h2><p className="mt-2 text-xs leading-5 text-[#d9bea0]">Sign in with your staff email and password.</p></div><form onSubmit={submit}><label htmlFor="staff-email" className="mb-2 block text-[10px] font-bold uppercase tracking-[.16em] text-[#e8c9ad]">Staff email</label><input id="staff-email" required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="mb-4 h-14 w-full rounded-2xl border border-white/15 bg-black/20 px-4 text-base text-white outline-none focus:border-[#f5c822] focus:ring-4 focus:ring-[#f5c822]/10" placeholder="admin@example.com"/><label htmlFor="terminal-password" className="mb-2 block text-[10px] font-bold uppercase tracking-[.16em] text-[#e8c9ad]">Password</label><div className="relative"><KeyRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#bb9576]"/><input id="terminal-password" required autoFocus type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => {setPassword(event.target.value);setError("")}} placeholder="Enter password" className="h-14 w-full rounded-2xl border border-white/15 bg-black/20 pl-12 pr-12 text-base text-white outline-none transition placeholder:text-[#a98268] focus:border-[#f5c822] focus:ring-4 focus:ring-[#f5c822]/10"/><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-[#bb9576] transition hover:bg-white/10 hover:text-white">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div>{(error || accessError) && <p role="alert" className="mt-3 text-xs font-semibold text-[#ffb38d]">{error || accessError}</p>}<button disabled={busy} type="submit" className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#f5c822] text-sm font-extrabold text-[#42200f] shadow-[0_8px_25px_rgba(245,200,34,.18)] transition hover:-translate-y-0.5 hover:bg-[#ffda3d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5c822] disabled:opacity-60">{busy ? "Signing in…" : "Unlock reading room"} <ChevronRight size={17}/></button></form><div className="mt-7 flex items-center justify-center gap-2 text-[10px] text-[#a98268]"><LockKeyhole size={12}/> Protected library terminal <span className="text-[#70452f]">•</span> Staff access only</div></section>
      </div></div><footer className="flex items-center justify-between text-[10px] text-[#8f654c]"><span>© Tanakobonbon Manga Library</span><span className="hidden sm:block">Read deeply · organize joyfully</span></footer>
    </div>
  </main>;
}

function OfficialLogo({lockup}:{lockup:"lock"|"sidebar"|"mark"}) {
  const mark = <span className={`official-logo-mark ${lockup === "mark" ? "official-logo-mark-only" : ""}`} aria-hidden="true"><svg viewBox="0 0 52 52" fill="none"><path d="M7 13.5c6.6-2.9 13.1-1.7 19 3.5v23c-5.9-5.2-12.4-6.4-19-3.5v-23Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/><path d="M45 13.5c-6.6-2.9-13.1-1.7-19 3.5v23c5.9-5.2 12.4-6.4 19-3.5v-23Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/><path d="M26 17v23M10.5 18.2h8M33.5 18.2h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>;
  if (lockup === "mark") return mark;
  return <div className={`official-logo official-logo-${lockup}`}>{mark}<div className="official-logo-type"><span>Tanakobonbon</span><small>Manga Library</small></div></div>;
}


