const Narrow = (() => {
    const isRecord = (value) => typeof value === 'object' && value !== null;
    const errorMessage = (error) => isRecord(error) && typeof error['message'] === 'string' ? error['message'] : '';
    return { isRecord, errorMessage };
})();
if (typeof module !== 'undefined')
    module.exports = Narrow;
