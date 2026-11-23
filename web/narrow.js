const Narrow = (() => {
    const isRecord = (value) => typeof value === 'object' && value !== null;
    const errorMessage = (error) => isRecord(error) && typeof error['message'] === 'string' ? error['message'] : '';
    const jsonRecord = (raw) => {
        if (typeof raw !== 'string')
            return null;
        try {
            const parsed = JSON.parse(raw);
            return isRecord(parsed) ? parsed : null;
        }
        catch {
            return null;
        }
    };
    return { isRecord, errorMessage, jsonRecord };
})();
if (typeof module !== 'undefined')
    module.exports = Narrow;
