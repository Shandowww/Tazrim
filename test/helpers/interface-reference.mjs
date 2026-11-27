import {existsSync,readFileSync} from 'node:fs';

export function readInterfaceReference(name) {
  const fixture = new URL('../fixtures/retired-interface/' + name, import.meta.url);
  const file = existsSync(fixture) ? fixture : new URL('../../src/' + name, import.meta.url);
  return readFileSync(file, 'utf8');
}
