'use strict';

const MAX_TIMER_DELAY = 2_147_400_000; // < 2^31-1 ms pour éviter TimeoutOverflowWarning

/**
 * setTimeout sécurisé qui découpe les longues durées en segments inférieurs
 * à 2^31-1 ms (sinon Node lève TimeoutOverflowWarning et force 1 ms).
 */
function safeSetTimeout(fn, delayMs, ...args) {
    if (!delayMs || delayMs <= 0) return setTimeout(fn, 0, ...args);
    if (delayMs <= MAX_TIMER_DELAY) return setTimeout(fn, delayMs, ...args);

    const token = { cancelled: false };
    const step = (remaining) => {
        if (token.cancelled) return;
        const chunk = Math.min(remaining, MAX_TIMER_DELAY);
        setTimeout(() => {
            if (token.cancelled) return;
            const rest = remaining - chunk;
            if (rest > 0) { step(rest); return; }
            fn(...args);
        }, chunk);
    };
    step(delayMs);
    return {
        ref: null,
        get cancelled() { return token.cancelled; },
        set cancelled(v) { token.cancelled = v; },
        get hasRef() { return !token.cancelled; },
        cancel() { token.cancelled = true; },
        refresh() {},
        unref() {},
        [Symbol.toPrimitive]() { return this.hasRef() ? 1 : 0; },
    };
}

function safeClearTimeout(handle) {
    if (handle && typeof handle.cancel === 'function') handle.cancel();
    if (handle && handle.cancelled !== undefined) handle.cancelled = true;
}

module.exports = { safeSetTimeout, safeClearTimeout, MAX_TIMER_DELAY };
