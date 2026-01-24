/**
 * Ghost Recorder - Statistical Utilities
 * Handles calculation of market percentages and patterns
 */

function calculateStats(digits, lookback = 1000) {
    if (!digits || digits.length === 0) return null;

    const last100 = digits.slice(-100);
    const customLookback = digits.slice(-lookback);
    const last1000 = digits.slice(-1000);

    return {
        timestamp: Date.now(),
        last_digit: digits[digits.length - 1],
        lookback_count: Math.min(lookback, digits.length),

        // 1. Even/Odd Analysis
        even_odd: {
            last100: getEvenOddPct(last100),
            custom: getEvenOddPct(customLookback),
            last1000: getEvenOddPct(last1000)
        },

        // 2. Over/Under Analysis
        over_under: {
            last100: getOverUnderPct(last100),
            custom: getOverUnderPct(customLookback),
            last1000: getOverUnderPct(last1000)
        },

        // 3. Digit Distribution (Last 1000 and 100)
        distribution: {
            last1000: getDistribution(last1000),
            last100: getDistribution(last100),
            custom: getDistribution(customLookback)
        },

        // 4. Current Streak
        streak: getCurrentStreak(digits),

        // 5. Speed Bot Specifics (Hot/Cold)
        analysis: analyzeDigits(customLookback)
    };
}

function analyzeDigits(arr) {
    const counts = Array(10).fill(0);
    arr.forEach(d => counts[d]++);

    // Find Hot and Cold
    const max = Math.max(...counts);
    const min = Math.min(...counts);

    return {
        hot: counts.map((c, i) => c === max ? i : -1).filter(d => d !== -1),
        cold: counts.map((c, i) => c === min ? i : -1).filter(d => d !== -1),
        counts: counts
    };
}

function getEvenOddPct(arr) {
    if (arr.length === 0) return { even: 0, odd: 0 };
    const evens = arr.filter(d => d % 2 === 0).length;
    return {
        even: ((evens / arr.length) * 100).toFixed(1),
        odd: (((arr.length - evens) / arr.length) * 100).toFixed(1)
    };
}

function getOverUnderPct(arr) {
    if (arr.length === 0) return {};

    // Calculate for standard pivot points (Over 2, Over 4, Over 5, Over 7)
    const stats = {};
    [2, 3, 4, 5, 6, 7].forEach(pivot => {
        const over = arr.filter(d => d > pivot).length;
        const under = arr.filter(d => d < pivot).length; // Strictly under? Or <=? Usually Deriv is > and <. 
        // Deriv "Over 2" means 3,4,5,6,7,8,9. "Under 2" means 0,1.
        // Let's stick to standard percentages.
        stats[`over_${pivot}`] = ((over / arr.length) * 100).toFixed(1);
        stats[`under_${pivot}`] = ((under / arr.length) * 100).toFixed(1);
    });
    return stats;
}

function getDistribution(arr) {
    const counts = Array(10).fill(0);
    arr.forEach(d => counts[d]++);

    const total = arr.length;
    return counts.map(count => ((count / total) * 100).toFixed(1));
}

function getCurrentStreak(arr) {
    if (arr.length < 2) return { type: 'none', count: 0 };

    const last = arr[arr.length - 1];
    const type = last % 2 === 0 ? 'EVEN' : 'ODD';
    let count = 0;

    for (let i = arr.length - 1; i >= 0; i--) {
        const currentType = arr[i] % 2 === 0 ? 'EVEN' : 'ODD';
        if (currentType === type) {
            count++;
        } else {
            break;
        }
    }

    return { type, count };
}

module.exports = { calculateStats };
