import { useGame } from '../contexts/GameContext';
import { CommissionCard } from '../components/CommissionCard';
import { SectionHeading } from '../components/OrnatePanel';
import { GuestPrompt } from '../components/GuestPrompt';
export function Commissions() {
  const { commissions, session } = useGame();
  return <div className="space-y-6"><SectionHeading title="Quest Board" meta="Rewards verified by staff"/>
    {!session ? <GuestPrompt title="Your quests await" detail="Sign in to join reading quests, follow staff verification, and claim library points." /> : <>
      <p className="max-w-2xl text-sm leading-6 text-umber/65">Join a quest and complete its requirements. Staff will verify completion before you can claim points.</p>
      {!commissions.length ? <div className="tb-state tb-cut-sm text-sm text-umber/60">No quests are available for your account yet. Check back after your next library visit.</div> : <div className="grid gap-4 lg:grid-cols-2">{commissions.map(q => <CommissionCard key={q.id} commission={q}/>)}</div>}
    </>}</div>;
}

