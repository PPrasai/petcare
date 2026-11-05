import { afterEach } from 'vitest';
import { responseFailures } from './support/response-validator';

// QA-10: a test fails if any response it produced does not validate against openapi.yaml.
afterEach(() => {
  if (responseFailures.length > 0) {
    const failures = responseFailures.splice(0).join('\n');
    throw new Error(`responses violate the contract:\n${failures}`);
  }
});
