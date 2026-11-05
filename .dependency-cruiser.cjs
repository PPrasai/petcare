/** Layering rules from AS-petcare-001 §3. Run: pnpm lint:deps */
const clientLayer = (name) => `^apps/web/src/${name}/`;
const forbid = (name, from, to, comment) => ({
  name,
  severity: 'error',
  comment,
  from: { path: from },
  to: { path: to },
});

module.exports = {
  forbidden: [
    // Client
    forbid(
      'client-ui-isolated',
      clientLayer('ui'),
      '^apps/web/src/(features|application|data|state|app)/',
      'ui imports nothing from other layers',
    ),
    forbid(
      'client-features-no-data',
      clientLayer('features'),
      '^apps/web/src/(data|app)/',
      'features must not import data or app',
    ),
    forbid(
      'client-application-pure',
      clientLayer('application'),
      '^apps/web/src/(ui|features|data|state|app)/',
      'application depends on ports, domain, lib only',
    ),
    forbid(
      'client-data-limits',
      clientLayer('data'),
      '^apps/web/src/(ui|features|state|app)/',
      'data depends on ports, domain, contracts, lib only',
    ),
    forbid(
      'client-data-no-application-impl',
      clientLayer('data'),
      '^apps/web/src/application/(?!ports/)',
      'data may import application/ports only',
    ),
    forbid(
      'client-lib-leaf',
      clientLayer('lib'),
      '^apps/web/src/(ui|features|application|data|state|app)/',
      'lib is a leaf',
    ),
    forbid(
      'client-state-limits',
      clientLayer('state'),
      '^apps/web/src/(ui|features|application|data|app)/',
      'state is a leaf',
    ),
    // Server
    forbid(
      'server-http-only-down',
      '^apps/api/src/(services|repositories|db|infra|jobs|config)/',
      '^apps/api/src/http/',
      'nothing imports http',
    ),
    forbid(
      'server-services-no-db',
      '^apps/api/src/services/',
      '^apps/api/src/(db|http|jobs)/',
      'services use repositories, not db or http',
    ),
    forbid(
      'server-repos-db-only',
      '^apps/api/src/repositories/',
      '^apps/api/src/(services|http|infra|jobs)/',
      'repositories depend on db only',
    ),
    forbid(
      'server-http-no-db',
      '^apps/api/src/http/',
      '^apps/api/src/(db|repositories)/',
      'http calls services',
    ),
    forbid(
      'server-jobs-via-services',
      '^apps/api/src/jobs/',
      '^apps/api/src/(http|repositories|db)/',
      'jobs call services',
    ),
    {
      name: 'services-no-fastify',
      severity: 'error',
      comment: 'services never import Fastify types',
      from: { path: '^apps/api/src/services/' },
      to: { path: 'node_modules/fastify|node_modules/@fastify/' },
    },
    // Domain is pure
    forbid('domain-pure', '^packages/domain/src/', '^(apps|tests)/', 'domain imports no app code'),
    {
      name: 'domain-no-node-core',
      severity: 'error',
      comment: 'domain uses no Node APIs',
      from: { path: '^packages/domain/src/' },
      to: { dependencyTypes: ['core'] },
    },
    // Apps do not import each other
    forbid('web-no-api', '^apps/web/src/', '^apps/api/', 'web must not import api'),
    forbid('api-no-web', '^apps/api/src/', '^apps/web/', 'api must not import web'),
    forbid('no-import-tests', '^(apps|packages)/[^/]+/src/', '^tests/', 'no app imports tests'),
    {
      name: 'system-tests-entry-points',
      severity: 'error',
      comment: 'tests/system may import only the two declared public entry points',
      from: { path: '^tests/system/' },
      to: { path: '^apps/', pathNot: '^apps/(api/src/server[.]ts|web/src/data/sync/index[.]ts)$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    exclude: { path: '/dist/' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
