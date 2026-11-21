/**
 * "Trades | Alle" in the feed's sticky header. Trades = signal cards only, each tracking
 * its own updates (the cockpit, default); Alle = every post including the desk's chatter.
 */
import { de } from '@/i18n/de';
import { Segmented } from '@/ui/Segmented';

export type FeedView = 'trades' | 'all';

const OPTIONS = [
  { value: 'trades', label: de.trade.views.trades },
  { value: 'all', label: de.trade.views.all },
] as const;

export function ViewToggle({ value, onChange }: { value: FeedView; onChange: (v: FeedView) => void }) {
  return <Segmented options={OPTIONS} value={value} onChange={onChange} label={de.trade.viewsLabel} />;
}
