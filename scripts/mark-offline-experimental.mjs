import { readFile, writeFile } from 'node:fs/promises';

const declarationPath = new URL('../dist/kit/types/rdlabo-ionic-angular-kit-offline.d.ts', import.meta.url);
const marker = '@rdlabo/ionic-angular-kit/offline is experimental.';
const banner = `/**
 * ${marker}
 *
 * This entry point is not covered by the package's SemVer compatibility guarantee. Its public
 * APIs, persistence schema, and synchronization behavior may change incompatibly in a minor or
 * patch release before stabilization.
 *
 * @packageDocumentation
 * @experimental
 */
`;

const declaration = await readFile(declarationPath, 'utf8');

if (!declaration.includes(marker)) {
  await writeFile(declarationPath, `${banner}${declaration}`);
}
