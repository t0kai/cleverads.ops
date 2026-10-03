import { googleFetch } from '@/adapters/google/http';

/** Google Drive REST v3: file new reports into the Results folder. */
const BASE = 'https://www.googleapis.com/drive/v3/files';
const SHARED = 'supportsAllDrives=true';

/** Moves a file into a folder (out of wherever it was created). */
export async function moveToFolder(token: string, fileId: string, folderId: string): Promise<void> {
  const file = await googleFetch<{ parents?: string[] }>(`${BASE}/${encodeURIComponent(fileId)}?fields=parents&${SHARED}`, token);
  const params = new URLSearchParams({ addParents: folderId, fields: 'id', supportsAllDrives: 'true' });
  const remove = (file.parents ?? []).filter((p) => p !== folderId).join(',');
  if (remove) params.set('removeParents', remove);
  await googleFetch<unknown>(`${BASE}/${encodeURIComponent(fileId)}?${params.toString()}`, token, { method: 'PATCH', body: {} });
}
