/** Name of the Cache API cache that holds a user's downloaded files (AS 4.6). */
export const fileCacheName = (userId: string): string => `petcare-files-${userId}`;

const keyOf = (fileId: string): string => `/api/files/${fileId}`;

const available = (): boolean => typeof caches !== 'undefined';

/** Keeps a file's bytes on this device so it opens offline. Failures are not fatal. */
export async function cacheFile(userId: string, fileId: string, blob: Blob): Promise<void> {
  if (!available()) return;
  try {
    const cache = await caches.open(fileCacheName(userId));
    await cache.put(keyOf(fileId), new Response(blob, { headers: { 'content-type': blob.type } }));
  } catch {
    // Storage may be full or blocked; the file can still be downloaded again.
  }
}

/** A cached file, or null. */
export async function cachedFile(userId: string, fileId: string): Promise<Blob | null> {
  if (!available()) return null;
  try {
    const hit = await (await caches.open(fileCacheName(userId))).match(keyOf(fileId));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

/** Deletes every file cache on this device (sign-out wipe, QA-22). */
export async function clearFileCaches(): Promise<void> {
  if (!available()) return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith('petcare-files-')).map((n) => caches.delete(n)),
  );
}
