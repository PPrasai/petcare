import type { FileApi, UploadedFile } from '../../application/ports/file-api';
import { NetworkError, RemoteError } from '../../application/ports/remote-api';
import { problemCode } from './http';
import { assertNetworkAllowed } from './network-gate';

async function problemOf(response: Response): Promise<string> {
  try {
    return problemCode(await response.json());
  } catch {
    return 'error';
  }
}

/** POST /api/files and GET /api/files/{id} over HTTP. */
export function createFilesRemote(): FileApi {
  return {
    async upload(householdId, blob, name): Promise<UploadedFile> {
      const form = new FormData();
      form.append('householdId', householdId);
      form.append('file', blob, name);
      assertNetworkAllowed();
      let response: Response;
      try {
        response = await fetch('/api/files', {
          method: 'POST',
          credentials: 'same-origin',
          body: form,
        });
      } catch {
        throw new NetworkError();
      }
      if (response.status >= 500) throw new NetworkError(`HTTP ${response.status}`);
      if (response.status !== 201) {
        throw new RemoteError(response.status, await problemOf(response));
      }
      return (await response.json()) as UploadedFile;
    },

    async download(fileId): Promise<Blob | null> {
      let response: Response;
      try {
        response = await fetch(`/api/files/${fileId}`, { credentials: 'same-origin' });
      } catch {
        throw new NetworkError();
      }
      if (response.status === 404) return null;
      if (response.status >= 500) throw new NetworkError(`HTTP ${response.status}`);
      if (!response.ok) throw new RemoteError(response.status, await problemOf(response));
      return response.blob();
    },
  };
}
