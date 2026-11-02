const Narrow = (() => {
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

  const errorMessage = (error: unknown): string =>
    isRecord(error) && typeof error['message'] === 'string' ? error['message'] : '';

  return { isRecord, errorMessage };
})();

if (typeof module !== 'undefined') module.exports = Narrow;
