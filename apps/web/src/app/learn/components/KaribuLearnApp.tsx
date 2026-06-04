'use client';

import React from 'react';
import { KL } from '../lib/tokens';
import * as data from '../lib/data';
import type { LearnCase, PackInfo } from '../lib/types';
import { Shell, Welcome, type Tab } from './Shell';
import { Walkthrough } from './Walkthrough';
import {
  CaseComplete, CaseLanding, ScreenAbout, ScreenHome, ScreenLibrary, ScreenProgress,
} from './screens';

type View =
  | { k: 'welcome' }
  | { k: 'tab'; tab: Tab }
  | { k: 'landing'; c: LearnCase }
  | { k: 'walk'; c: LearnCase }
  | { k: 'complete'; c: LearnCase; score: number; total: number };

const TAB_TITLES: Record<Tab, { title: string; subtitle?: string }> = {
  home: { title: 'KaribuLearn', subtitle: 'Continuing education' },
  library: { title: 'Case library' },
  progress: { title: 'My progress' },
  about: { title: 'About KaribuLearn' },
};

export function KaribuLearnApp() {
  const [view, setView] = React.useState<View>({ k: 'welcome' });
  const [packs, setPacks] = React.useState<PackInfo[]>([]);
  const [cases, setCases] = React.useState<LearnCase[]>([]);
  const [downloading, setDownloading] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const manifest = await data.loadManifest();
    setPacks(manifest);
    setCases(await data.loadInstalledCases(manifest));
  }, []);

  React.useEffect(() => {
    refresh().catch(() => {/* surfaced as empty state */}).finally(() => setLoading(false));
  }, [refresh]);

  const onDownload = async (p: PackInfo) => {
    setDownloading((s) => new Set(s).add(p.id));
    try {
      await data.downloadPack(p);
      await refresh();
    } finally {
      setDownloading((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  };

  const available = packs.filter((p) => !data.isInstalled(p));

  if (view.k === 'welcome') {
    return (
      <Welcome
        caseCount={cases.length}
        topicCount={new Set(cases.map((c) => c.topic)).size}
        onEnter={() => setView({ k: 'tab', tab: 'home' })}
      />
    );
  }

  if (view.k === 'walk') {
    return (
      <Walkthrough
        c={view.c}
        onExit={() => setView({ k: 'landing', c: view.c })}
        onComplete={(score, total) => setView({ k: 'complete', c: view.c, score, total })}
      />
    );
  }

  // Everything else renders inside the coral shell.
  const activeTab: Tab = view.k === 'tab' ? view.tab : 'library';
  const header = view.k === 'tab' ? TAB_TITLES[view.tab] : { title: undefined as string | undefined };
  return (
    <Shell active={activeTab} onNav={(t) => setView({ k: 'tab', tab: t })} title={header.title} subtitle={view.k === 'tab' ? TAB_TITLES[view.tab].subtitle : undefined}>
      {loading ? (
        <div style={{ color: KL.muted, padding: 40, textAlign: 'center' }}>Loading cases…</div>
      ) : view.k === 'tab' ? (
        view.tab === 'home' ? <ScreenHome cases={cases} onOpen={(c) => setView({ k: 'landing', c })} onAll={() => setView({ k: 'tab', tab: 'library' })} />
          : view.tab === 'library' ? <ScreenLibrary cases={cases} packs={available} downloading={downloading} onOpen={(c) => setView({ k: 'landing', c })} onDownload={onDownload} />
            : view.tab === 'progress' ? <ScreenProgress cases={cases} />
              : <ScreenAbout />
      ) : view.k === 'landing' ? (
        <CaseLanding c={view.c} onBegin={(c) => setView({ k: 'walk', c })} onBack={() => setView({ k: 'tab', tab: 'library' })} />
      ) : view.k === 'complete' ? (
        <CaseComplete c={view.c} score={view.score} total={view.total} onLibrary={() => setView({ k: 'tab', tab: 'library' })} />
      ) : null}
    </Shell>
  );
}
