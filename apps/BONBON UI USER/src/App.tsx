import { GameProvider } from './contexts/GameContext';
import { AppShell } from './components/AppShell';

interface AppProps {
  /** BON leans out from the screen edge on her own with an "Ask BON" prompt. */
  bonAutoPeek?: boolean;
  /** Starting catalog presentation. */
  catalogLayout?: 'grid' | 'list';
}

export function App({ bonAutoPeek = true, catalogLayout = 'grid' }: AppProps) {
  return (
    <GameProvider>
      <AppShell bonAutoPeek={bonAutoPeek} catalogLayout={catalogLayout} />
    </GameProvider>);

}
