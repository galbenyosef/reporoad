/** Shared browser/server validation. Never treats arbitrary URLs as repositories. */
export function repositoryName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 250) return null;
  const name = value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/^github\.com\//i, '').replace(/\/$/, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(name) || ['.', '..'].includes(name.split('/')[1])) return null;
  return name.toLowerCase();
}
