export function pathWithoutQuery(urlOrPath: string | undefined): string {
  if (!urlOrPath) {
    return '';
  }
  const q = urlOrPath.indexOf('?');
  return q >= 0 ? urlOrPath.slice(0, q) : urlOrPath;
}
