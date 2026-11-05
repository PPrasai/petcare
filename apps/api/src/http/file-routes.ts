import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { AppError, invalid } from '../services/app-error';
import type { FileService } from '../services/file-service';
import { requireActor } from './actor';
import { uuidParam } from './params';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };
const OVERHEAD_BYTES = 1_048_576;

/** uploadFile and downloadFile (CON-petcare-001 tag `files`). */
export async function registerFileRoutes(
  app: FastifyInstance,
  files: FileService,
  options: { maxFileBytes: number },
): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: options.maxFileBytes, files: 1, fields: 4, fieldSize: 200 },
  });

  app.post(
    '/api/files',
    { ...limited, bodyLimit: options.maxFileBytes + OVERHEAD_BYTES },
    async (request, reply) => {
      const actor = requireActor(request);
      if (!request.isMultipart()) throw invalid('multipart/form-data is required');
      let householdId = '';
      let upload: { bytes: Buffer; name: string | null } | null = null;
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'householdId') householdId = String(part.value);
          continue;
        }
        const bytes = await part.toBuffer();
        if (part.file.truncated) throw new AppError('tooLarge', 413);
        upload = { bytes, name: part.filename || null };
      }
      if (!upload) throw invalid('file is required', '/file');
      const row = await files.upload(actor.userId, {
        householdId,
        bytes: upload.bytes,
        originalName: upload.name,
      });
      return reply.code(201).send({
        id: row.id,
        householdId: row.householdId,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        originalName: row.originalName,
        createdAt: row.createdAt.toISOString(),
      });
    },
  );

  app.get('/api/files/:fileId', limited, async (request, reply) => {
    const download = await files.download(
      requireActor(request).userId,
      uuidParam(request, 'fileId'),
    );
    const inline = download.mimeType !== 'application/pdf';
    return reply
      .header('content-type', download.mimeType)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', 'sandbox')
      .header('content-disposition', inline ? 'inline' : 'attachment')
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(download.bytes);
  });
}
