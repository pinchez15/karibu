// KaribuLearn web pack loader. Mirrors the Android LearnRepository: a manifest
// of packs, a bundled core pack, and on-demand downloadable packs. On web,
// "downloading" just fetches the .kpack and records it in localStorage, so the
// pack model (and its versioning/sharing story) carries across surfaces.

import type { CasePack, LearnCase, PackInfo, PackManifest } from './types';

const INSTALLED_KEY = 'kl-installed-packs';

function packUrl(info: PackInfo): string {
  if (info.bundled && info.asset_path) return `/${info.asset_path}`;
  const url = info.download_url ?? '';
  // The bundled-remote:// dev scheme maps to a public asset on web.
  if (url.startsWith('bundled-remote://')) return `/${url.replace('bundled-remote://', '')}`;
  return url;
}

export async function loadManifest(): Promise<PackInfo[]> {
  const res = await fetch('/learn/manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const data = (await res.json()) as PackManifest;
  return data.packs ?? [];
}

function installedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(INSTALLED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function isInstalled(info: PackInfo): boolean {
  return Boolean(info.bundled) || installedSet().has(info.id);
}

export async function downloadPack(info: PackInfo): Promise<void> {
  const res = await fetch(packUrl(info), { cache: 'no-store' });
  if (!res.ok) throw new Error(`pack ${info.id} ${res.status}`);
  await res.json(); // validate it parses before marking installed
  const set = installedSet();
  set.add(info.id);
  window.localStorage.setItem(INSTALLED_KEY, JSON.stringify([...set]));
}

export function removePack(info: PackInfo): void {
  const set = installedSet();
  set.delete(info.id);
  window.localStorage.setItem(INSTALLED_KEY, JSON.stringify([...set]));
}

export async function loadPack(info: PackInfo): Promise<CasePack> {
  const res = await fetch(packUrl(info), { cache: 'no-store' });
  if (!res.ok) throw new Error(`pack ${info.id} ${res.status}`);
  const pack = (await res.json()) as CasePack;
  return { ...pack, cases: pack.cases.map((c) => ({ ...c, packId: pack.id })) };
}

export async function loadInstalledCases(packs: PackInfo[]): Promise<LearnCase[]> {
  const installed = packs.filter(isInstalled);
  const results = await Promise.all(
    installed.map((p) => loadPack(p).then((pk) => pk.cases).catch(() => [] as LearnCase[])),
  );
  return results.flat();
}
