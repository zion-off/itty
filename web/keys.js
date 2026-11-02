const ArrowKey = Object.freeze({ up: 'A', down: 'B', right: 'C', left: 'D' });
const NavigationKey = Object.freeze({ pageUp: 'pageUp', pageDown: 'pageDown', home: 'home', end: 'end' });
const Keys = (() => {
    const ESC = '\x1b';
    const NUL = '\x00';
    const DEL = '\x7f';
    const SPACE = ' ';
    const QUESTION_MARK = '?';
    const CONTROL_FIRST_CODE = 64;
    const CONTROL_LAST_CODE = 95;
    const NORMAL_MODE_INTRODUCER = `${ESC}[`;
    const APPLICATION_MODE_INTRODUCER = `${ESC}O`;
    const ESCAPE = ESC;
    const TAB = '\t';
    const BACKTAB = `${ESC}[Z`;
    const controlByte = (ch) => {
        if (ch.length !== 1)
            return null;
        if (ch === SPACE)
            return NUL;
        if (ch === QUESTION_MARK)
            return DEL;
        const code = ch.toUpperCase().charCodeAt(0);
        return code >= CONTROL_FIRST_CODE && code <= CONTROL_LAST_CODE ? String.fromCharCode(code - CONTROL_FIRST_CODE) : null;
    };
    const introducer = (applicationMode) => (applicationMode ? APPLICATION_MODE_INTRODUCER : NORMAL_MODE_INTRODUCER);
    const arrow = (direction, applicationMode) => `${introducer(applicationMode)}${direction}`;
    const NAVIGATION = {
        pageUp: () => `${NORMAL_MODE_INTRODUCER}5~`,
        pageDown: () => `${NORMAL_MODE_INTRODUCER}6~`,
        home: (applicationMode) => `${introducer(applicationMode)}H`,
        end: (applicationMode) => `${introducer(applicationMode)}F`,
    };
    const navigation = (name, applicationMode) => NAVIGATION[name](applicationMode);
    return { controlByte, arrow, navigation, ESCAPE, TAB, BACKTAB };
})();
if (typeof module !== 'undefined')
    module.exports = Keys;
