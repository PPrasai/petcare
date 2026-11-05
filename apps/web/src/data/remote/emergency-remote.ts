import { EmergencyError } from '../../application/ports/emergency-api';
import type {
  EmergencyApi,
  EmergencyLink,
  PublicEmergencyCard,
} from '../../application/ports/emergency-api';
import { NetworkError } from '../../application/ports/remote-api';
import { http } from './http';

async function call(method: string, path: string, ok: number[]) {
  try {
    const result = await http(method, path);
    if (ok.includes(result.status)) return result;
    if (result.status === 404) throw new EmergencyError('notFound');
    if (result.status === 403) throw new EmergencyError('forbidden');
    if (result.status === 429) throw new EmergencyError('rateLimited');
    throw new EmergencyError('other');
  } catch (error) {
    if (error instanceof NetworkError) throw new EmergencyError('offline');
    throw error;
  }
}

/** The emergency link and public page endpoints over HTTP. */
export function createEmergencyRemote(): EmergencyApi {
  return {
    async createLink(cardId) {
      const { body } = await call('POST', `/api/emergency/${cardId}/link`, [201]);
      return body as EmergencyLink;
    },
    async revokeLink(cardId) {
      await call('DELETE', `/api/emergency/${cardId}/link`, [204]);
    },
    async publicCard(token) {
      try {
        const { body } = await call('GET', `/api/public/emergency/${token}`, [200]);
        return body as PublicEmergencyCard;
      } catch (error) {
        if (error instanceof EmergencyError && error.kind === 'notFound') return null;
        throw error;
      }
    },
  };
}
