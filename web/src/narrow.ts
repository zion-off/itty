const Narrow = (() => {
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

  const errorMessage = (error: unknown): string =>
    isRecord(error) && typeof error['message'] === 'string' ? error['message'] : '';

  const jsonRecord = (raw: unknown): Record<string, unknown> | null => {
    if (typeof raw !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  return { isRecord, errorMessage, jsonRecord };
})();

if (typeof module !== 'undefined') module.exports = Narrow;
