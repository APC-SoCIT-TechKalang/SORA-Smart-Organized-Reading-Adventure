import { useGame } from '../contexts/GameContext';
import { CommissionCard } from '../components/CommissionCard';
import { SectionHeading } from '../components/OrnatePanel';
export function Commissions() {
  const { commissions, session } = useGame();
  return <div className="space-y-6"><SectionHeading title="Quest Board" meta="Rewards verified by staff"/>
    <p className="text-sm text-umber/70">{!session ? 'Sign in with an active membership to see quests.' : 'Join a quest and complete its requirements. Staff will verify completion before you can claim points.'}</p>
    {!commissions.length && session && <p>No quests available for your account yet.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{commissions.map(q => <CommissionCard key={q.id} commission={q}/>)}</div></div>;
}

