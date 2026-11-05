/**
 * OpenAPI operations whose routes are not built yet. Each slice removes its own.
 * routes-coverage.test.ts fails if a pending operation already has a route, or if a route is
 * missing for an operation that is not listed here. Slice 18 requires this list to be empty.
 */
export const PENDING_OPERATIONS: string[] = ['relayBrowserTraces'];
