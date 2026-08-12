import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://hn.algolia.com';
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildApiUrl({ nowMs = Date.now(), query = 'AI', limit = 100 } = {}) {
  const url = new URL('/api/v1/search', API_ORIGIN);
  url.searchParams.set('query', query);
  url.searchParams.set('tags', 'story');
  url.searchParams.set(
    'numericFilters',
    `created_at_i>=${Math.floor((nowMs - 7 * DAY_MS) / 1000)}`,
  );
  url.searchParams.set('hitsPerPage', String(limit));
  return url.toString();
}

export function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  url.hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.toString();
}

export function normalizeStories(hits, { nowMs = Date.now(), maxStories = 20 } = {}) {
  const oldestAllowed = nowMs - 7 * DAY_MS;
  const seenIds = new Set();
  const seenUrls = new Set();
  const stories = [];

  for (const hit of Array.isArray(hits) ? hits : []) {
    const objectID = String(hit?.objectID ?? '').trim();
    const title = String(hit?.title ?? '').trim();
    const publishedMs = Date.parse(hit?.created_at ?? '');

    if (!objectID || !title || !Number.isFinite(publishedMs)) continue;
    if (publishedMs < oldestAllowed || publishedMs > nowMs) continue;

    const sourceUrl = String(hit?.url ?? '').trim()
      || `https://news.ycombinator.com/item?id=${encodeURIComponent(objectID)}`;

    let normalizedUrl;
    let domain;
    try {
      normalizedUrl = normalizeUrl(sourceUrl);
      domain = new URL(sourceUrl).hostname.replace(/^www\./i, '');
    } catch {
      continue;
    }

    if (seenIds.has(objectID) || seenUrls.has(normalizedUrl)) continue;
    seenIds.add(objectID);
    seenUrls.add(normalizedUrl);

    const numericPoints = Number(hit?.points);
    stories.push({
      objectID,
      title,
      url: sourceUrl,
      domain,
      publishedAt: new Date(publishedMs).toISOString(),
      points: Number.isFinite(numericPoints) ? numericPoints : 0,
    });

    if (stories.length >= maxStories) break;
  }

  return stories;
}

export async function fetchStories({ fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const endpoint = buildApiUrl({ nowMs, query: 'AI', limit: 100 });
  const response = await fetchImpl(endpoint, {
    headers: { accept: 'application/json' },
  });

  if (!response?.ok) {
    const status = response?.status ?? 'unknown';
    const statusText = response?.statusText ? ` ${response.statusText}` : '';
    throw new Error(`Algolia endpoint failed: HTTP ${status}${statusText}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.hits)) {
    throw new Error('Algolia response did not contain a hits array');
  }

  const stories = normalizeStories(payload.hits, { nowMs, maxStories: 20 });
  if (stories.length === 0) {
    throw new Error('Algolia returned no eligible stories from the latest seven days');
  }

  return {
    fetchedAt: new Date(nowMs).toISOString(),
    stories,
    stats: {
      candidates: payload.hits.length,
      output: stories.length,
      removed: payload.hits.length - stories.length,
    },
  };
}

export async function writeJsonAtomic(outputPath, payload) {
  const directory = path.dirname(outputPath);
  const temporaryPath = path.join(
    directory,
    `${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    await writeFile(temporaryPath, json, 'utf8');
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function runCli({
  fetchImpl = fetch,
  nowMs = Date.now(),
  outputPath = fileURLToPath(new URL('../data/news.json', import.meta.url)),
  logger = console,
} = {}) {
  try {
    const { stats, ...payload } = await fetchStories({ fetchImpl, nowMs });
    await writeJsonAtomic(outputPath, payload);
    logger.log(
      `Fetched ${stats.candidates} candidates; removed ${stats.removed}; wrote ${stats.output} stories to ${outputPath}`,
    );
    return 0;
  } catch (error) {
    logger.error(`AI news update failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  process.exitCode = await runCli();
}
