import type { Metadata } from 'next';

// KaribuLearn is a distinct, public, free product — no dashboard chrome, no
// auth. It fills the viewport and supplies its own coral chrome.
export const metadata: Metadata = {
  title: 'Karibu Learn — coming soon',
  description: 'Free clinical CME for Uganda. Try the demo case while we finish the full app.',
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '100dvh', overflow: 'hidden' }}>{children}</div>;
}
