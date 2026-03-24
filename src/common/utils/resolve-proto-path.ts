import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

/** Prefer newer of src vs dist proto so dev never loads a stale compiled copy. */
export function resolveRepoProtoPath(fileName: string): string {
  const cwd = process.cwd();
  const srcPath = resolve(cwd, 'src/proto', fileName);
  const distPath = resolve(cwd, 'dist/proto', fileName);
  const srcExists = existsSync(srcPath);
  const distExists = existsSync(distPath);

  if (srcExists && distExists) {
    return statSync(srcPath).mtimeMs >= statSync(distPath).mtimeMs ? srcPath : distPath;
  }
  if (srcExists) {
    return srcPath;
  }
  if (distExists) {
    return distPath;
  }
  return srcPath;
}
