/**
 * Updates the distribution lookback count
 * Call this function when user changes the lookback input
 * @param {number} count - Number of ticks to analyze (default: 1000)
 */
function setDistributionLookback(count) {
    const newCount = parseInt(count);
    if (isNaN(newCount) || newCount < 100) {
        console.warn('Invalid lookback count. Must be >= 100');
        return false;
    }

    distributionLookbackCount = newCount;
    console.log(`✅ Distribution lookback updated to ${distributionLookbackCount} ticks`);

    // Refresh current distribution display
    const distributionMarketSelector = document.getElementById('distributionMarketSelector');
    if (distributionMarketSelector) {
        refreshDistributionData();
    }

    return true;
}

// Expose globally for UI access
window.setDistributionLookback = setDistributionLookback;
