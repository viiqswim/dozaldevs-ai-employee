export function formatGuestName(
  gi: { firstName?: string | null; lastName?: string | null } | undefined,
): string | null {
  if (!gi) return null;
  const parts = [gi.firstName, gi.lastName].filter(
    (p): p is string => typeof p === 'string' && p !== '',
  );
  return parts.length > 0 ? parts.join(' ').trim() : null;
}
