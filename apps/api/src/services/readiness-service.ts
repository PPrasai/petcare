export interface ReadinessDeps {
  pingDatabase: () => Promise<boolean>;
  pingCache: () => Promise<boolean>;
}

export interface Readiness {
  status: 'ok' | 'degraded' | 'down';
  postgres: 'ok' | 'down';
  redis: 'ok' | 'degraded';
}

/** Redis failure is "degraded" (still HTTP 200). Postgres failure is "down" (HTTP 503). */
export async function checkReadiness(deps: ReadinessDeps): Promise<Readiness> {
  const [postgresUp, redisUp] = await Promise.all([deps.pingDatabase(), deps.pingCache()]);
  const postgres = postgresUp ? 'ok' : 'down';
  const redis = redisUp ? 'ok' : 'degraded';
  const status = postgres === 'down' ? 'down' : redis === 'degraded' ? 'degraded' : 'ok';
  return { status, postgres, redis };
}
