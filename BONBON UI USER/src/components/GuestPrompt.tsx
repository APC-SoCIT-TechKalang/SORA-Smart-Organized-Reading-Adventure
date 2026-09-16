import { LogInIcon } from 'lucide-react';

interface GuestPromptProps { title: string; detail: string; action?: string; }

/** A consistent, actionable signed-out state for member-only areas. */
export function GuestPrompt({ title, detail, action = 'Sign in to continue' }: GuestPromptProps) {
  return <section className="tb-surface tb-cut-lg px-6 py-12 text-center">
    <p className="tb-eyebrow">Tankobonbon account</p>
    <h2 className="mt-2 font-display text-2xl font-900 text-umber">{title}</h2>
    <p className="mx-auto mt-3 max-w-md text-sm font-600 leading-6 text-umber/60">{detail}</p>
    <button type="button" onClick={() => window.dispatchEvent(new Event('tankobonbon:open-auth'))} className="tb-button-primary tb-cut-sm mt-6 px-5 py-3 font-display text-xs uppercase tracking-[0.11em]">
      <LogInIcon aria-hidden="true" className="h-4 w-4" />{action}
    </button>
  </section>;
}
