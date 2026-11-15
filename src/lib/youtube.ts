import type { NoteVideo } from '../types/note';

export const MAX_NOTE_VIDEOS = 3;
export const MAX_VIDEO_LABEL = 60;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Parses "90", "90s", "1m30s", "1h2m3s" into seconds. */
export function parseYouTubeTime(value: string): number | undefined {
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/**
 * Extracts a YouTube video id and optional start time from a share URL.
 * Supports youtu.be, youtube.com/watch?v=, /shorts/, /embed/, /live/.
 * Returns null for anything that is not a valid YouTube video link.
 */
export function parseYouTubeUrl(raw: string): Pick<NoteVideo, 'id' | 'start'> | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') {
      id = url.searchParams.get('v');
    } else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      id = parts[1] ?? null;
    }
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const timeParam = url.searchParams.get('t') ?? url.searchParams.get('start');
  const start = timeParam ? parseYouTubeTime(timeParam) : undefined;
  return start && start > 0 ? { id, start } : { id };
}

export function youtubeWatchUrl(video: Pick<NoteVideo, 'id' | 'start'>): string {
  const base = `https://www.youtube.com/watch?v=${video.id}`;
  return video.start && video.start > 0 ? `${base}&t=${video.start}s` : base;
}

export function youtubeEmbedUrl(video: Pick<NoteVideo, 'id' | 'start'>): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
  if (video.start && video.start > 0) params.set('start', String(Math.floor(video.start)));
  return `https://www.youtube-nocookie.com/embed/${video.id}?${params.toString()}`;
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

/** Validates and normalizes videos coming from the cloud or local storage. */
export function sanitizeNoteVideos(value: unknown): NoteVideo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const videos: NoteVideo[] = [];
  for (const item of value.slice(0, MAX_NOTE_VIDEOS)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!YOUTUBE_ID.test(id)) continue;
    const video: NoteVideo = { id };
    if (typeof raw.start === 'number' && Number.isFinite(raw.start) && raw.start > 0) {
      video.start = Math.floor(raw.start);
    }
    if (typeof raw.label === 'string' && raw.label.trim()) {
      video.label = raw.label.trim().slice(0, MAX_VIDEO_LABEL);
    }
    videos.push(video);
  }
  return videos;
}
