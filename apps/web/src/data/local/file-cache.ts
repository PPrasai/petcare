/** Name of the Cache API cache that holds a user's downloaded files (slice 12 fills it). */
export const fileCacheName = (userId: string): string => `petcare-files-${userId}`;

/** Deletes every file cache on this device (sign-out wipe, QA-22). */
export async function clearFileCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith('petcare-files-')).map((n) => caches.delete(n)),
  );
}
