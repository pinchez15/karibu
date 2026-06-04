import type { Metadata } from 'next';

// KaribuLearn is a distinct, public, free product — no dashboard chrome, no
// auth. It fills the viewport and supplies its own coral chrome.
export const metadata: Metadata = {
  title: 'KaribuLearn — free clinical CME for Uganda',
  description: 'Realistic HC III cases with guideline-backed feedback. Free, no login, generated cases only.',
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '100dvh', overflow: 'hidden' }}>{children}</div>;
}
