import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import type { UnitOfWork } from '../repositories';
import type { FileRow } from '../repositories/file-repository';
import { AppError, forbidden, invalid, notFound } from './app-error';
import type { createMembershipDirectory } from './membership-directory';
import type { HouseholdFiles } from './ports';

export const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface FileServiceDeps {
  unitOfWork: UnitOfWork;
  directory: ReturnType<typeof createMembershipDirectory>;
  files: HouseholdFiles;
  newId: () => string;
  quotaBytes: number;
}

export interface Upload {
  householdId: string;
  bytes: Buffer;
  originalName: string | null;
}

export interface Download {
  bytes: Buffer;
  mimeType: AllowedType;
  originalName: string | null;
}

/** Cleans a client file name for display only: no path parts, no control characters, 200 chars. */
function displayName(name: string | null): string | null {
  if (!name) return null;
  const base = (name.split(/[\\/]/).pop() ?? '')
    .split('')
    .filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return base ? base.slice(0, 200) : null;
}

/** Uploads and downloads (CON-petcare-001 tag `files`; AS 4.6). */
export function createFileService(deps: FileServiceDeps) {
  const { unitOfWork, directory, files, newId, quotaBytes } = deps;

  return {
    /** The type is sniffed from the bytes; the client's content type and name are not trusted. */
    async upload(userId: string, upload: Upload): Promise<FileRow> {
      if (!UUID.test(upload.householdId)) {
        throw invalid('householdId must be a uuid', '/householdId');
      }
      const role = await directory.requireMember(userId, upload.householdId);
      if (role === 'viewer') throw forbidden();
      if (upload.bytes.length === 0) throw invalid('the file is empty', '/file');

      const sniffed = await fileTypeFromBuffer(upload.bytes);
      const mime = ALLOWED_TYPES.find((type) => type === sniffed?.mime);
      if (!mime) throw new AppError('unsupportedType', 415);

      const id = newId();
      const row = await unitOfWork.run(async (repos) => {
        const used = await repos.files.usedBytes(upload.householdId);
        if (used + upload.bytes.length > quotaBytes) throw new AppError('quotaExceeded', 409);
        return repos.files.insert({
          id,
          householdId: upload.householdId,
          mimeType: mime,
          sizeBytes: upload.bytes.length,
          sha256: createHash('sha256').update(upload.bytes).digest(),
          originalName: displayName(upload.originalName),
          createdBy: userId,
        });
      });
      try {
        await files.write(upload.householdId, id, upload.bytes);
      } catch (error) {
        await unitOfWork.run((repos) => repos.files.markDeleted(id));
        throw error;
      }
      return row;
    },

    /** Members of the household that owns the file; anyone else gets 404. */
    async download(userId: string, fileId: string): Promise<Download> {
      const row = await unitOfWork.repositories.files.find(fileId);
      if (!row) throw notFound();
      await directory.requireMember(userId, row.householdId);
      const bytes = await files.read(row.householdId, row.id);
      if (!bytes) throw notFound();
      const mimeType = ALLOWED_TYPES.find((type) => type === row.mimeType);
      if (!mimeType) throw notFound();
      return { bytes, mimeType, originalName: row.originalName };
    },
  };
}
export type FileService = ReturnType<typeof createFileService>;
