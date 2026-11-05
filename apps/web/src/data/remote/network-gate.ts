import { NetworkError } from '../../application/ports/remote-api';

let blocked = false;

/**
 * While the demo is open nothing may reach the server (CAP-03, QA-03). Every request the app
 * makes goes through `http()` or the files remote, and both stop here first, so a feature that
 * forgot to check for demo mode still cannot send anything: it just looks offline.
 */
export function blockNetwork(on: boolean): void {
  blocked = on;
}

export function assertNetworkAllowed(): void {
  if (blocked) throw new NetworkError('demo mode');
}
