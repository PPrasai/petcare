import { ZipArchive } from 'archiver';
import type { Archiver } from 'archiver';
import type { UnitOfWork } from '../repositories';
import { AppError } from './app-error';
import type { HouseholdFiles } from './ports';

export interface ExportServiceDeps {
  unitOfWork: UnitOfWork;
  files: HouseholdFiles;
  clock: () => Date;
}

/** Keeps a client file name safe as a path inside the ZIP. */
function safeName(name: string | null): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100);
  return cleaned === '' || /^\.+$/.test(cleaned) ? 'file' : cleaned;
}

/**
 * A ZIP of everything the user can see: `data.json` (records of all their households in
 * envelope format, plus file metadata) and `files/<household>/<file id>-<name>` (CAP-19, AS 4.8).
 */
export function createExportService(deps: ExportServiceDeps) {
  const { unitOfWork, files, clock } = deps;

  return {
    async build(userId: string): Promise<Archiver> {
      const repos = unitOfWork.repositories;
      const user = await repos.accounts.findUser(userId);
      if (!user) throw new AppError('unauthenticated', 401);
      const [preferences, households] = await Promise.all([
        repos.preferences.get(userId),
        repos.households.listForUser(userId),
      ]);

      const records = [];
      const fileEntries: { path: string; id: string; householdId: string }[] = [];
      const fileInfo = [];
      for (const household of households) {
        records.push(...(await repos.export.records(household.id)));
        for (const file of await repos.export.files(household.id)) {
          const path = `files/${household.id}/${file.id}-${safeName(file.originalName)}`;
          fileEntries.push({ path, id: file.id, householdId: household.id });
          fileInfo.push({
            id: file.id,
            householdId: household.id,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            originalName: file.originalName,
            path,
          });
        }
      }

      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.append(
        JSON.stringify(
          {
            exportedAt: clock().toISOString(),
            user: { id: user.id, email: user.email, name: user.name },
            preferences,
            households: households.map((h) => ({ id: h.id, name: h.name, role: h.role })),
            records,
            files: fileInfo,
          },
          null,
          2,
        ),
        { name: 'data.json' },
      );
      // Files are read and added one at a time, in the background, so a big export streams.
      void (async () => {
        try {
          for (const entry of fileEntries) {
            const bytes = await files.read(entry.householdId, entry.id);
            if (bytes) archive.append(bytes, { name: entry.path });
          }
          await archive.finalize();
        } catch (error) {
          archive.destroy(error as Error);
        }
      })();
      return archive;
    },
  };
}
export type ExportService = ReturnType<typeof createExportService>;
