/**
 * Statistical calculation utilities
 */

import { getDateKey, getHour, formatChartDate, formatHour } from './dateUtils.js';

/**
 * Calculate the 85th percentile of an array of numbers
 * @param {number[]} values
 * @returns {number}
 */
export function calculate85thPercentile(values) {
    if (!values || values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(0.85 * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

/**
 * Calculate sum of array
 * @param {number[]} values
 * @returns {number}
 */
export function sum(values) {
    return values.reduce((acc, val) => acc + (val || 0), 0);
}

/**
 * Calculate average of array
 * @param {number[]} values
 * @returns {number}
 */
export function average(values) {
    if (!values || values.length === 0) return 0;
    return sum(values) / values.length;
}

/**
 * Calculate max of array
 * @param {number[]} values
 * @returns {number}
 */
export function max(values) {
    if (!values || values.length === 0) return 0;
    return Math.max(...values);
}

/**
 * Aggregate data by day
 * @param {Array} data - Array of data rows with datetime field
 * @returns {Array} Aggregated data by date
 */
export function aggregateDaily(data) {
    const grouped = new Map();

    for (const row of data) {
        if (!row.datetime) continue;

        const key = getDateKey(row.datetime);

        if (!grouped.has(key)) {
            grouped.set(key, {
                date: key,
                label: formatChartDate(row.datetime),
                vehicles: 0,
                violators: 0,
                sum_speeds: 0,
                peak_speed: 0,
                speeds: [],
                p85_values: []
            });
        }

        const agg = grouped.get(key);
        agg.vehicles += row.vehicles || 0;
        agg.violators += row.violators || 0;

        if (row.avg_speed) {
            agg.sum_speeds += (row.avg_speed * (row.vehicles || 1));
            agg.speeds.push(row.avg_speed);
        }

        if (row.peak_speed) {
            agg.peak_speed = Math.max(agg.peak_speed, row.peak_speed);
        }

        // Collect p85 if directly available, otherwise use avg_speed for estimation
        if (row.p85 && row.p85 > 0) {
            agg.p85_values.push(row.p85);
        }
    }

    // Calculate derived values
    const results = [];
    for (const agg of grouped.values()) {
        // Calculate p85: use direct values if available, otherwise estimate from avg_speed distribution
        let p85Value = null;
        if (agg.p85_values.length > 0) {
            p85Value = average(agg.p85_values);
        } else if (agg.speeds.length > 0) {
            // Estimate 85th percentile from interval average speeds
            p85Value = calculate85thPercentile(agg.speeds);
        }

        results.push({
            date: agg.date,
            label: agg.label,
            vehicles: agg.vehicles,
            violators: agg.violators,
            non_speeders: agg.vehicles - agg.violators,
            pct_speeders: agg.vehicles > 0 ? (agg.violators / agg.vehicles) * 100 : 0,
            avg_speed: agg.vehicles > 0 ? agg.sum_speeds / agg.vehicles : 0,
            peak_speed: agg.peak_speed,
            p85: p85Value
        });
    }

    // Sort by date
    results.sort((a, b) => a.date.localeCompare(b.date));

    return results;
}

/**
 * Aggregate data by hour (chronological - each hour gets its own entry with date)
 * @param {Array} data - Array of data rows with datetime field
 * @returns {Array} Aggregated data by chronological hour
 */
export function aggregateHourly(data) {
    const grouped = new Map();

    for (const row of data) {
        if (!row.datetime) continue;

        const dt = new Date(row.datetime);
        // Create key that includes date and hour for chronological ordering
        const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const hour = dt.getHours();
        const key = `${dateStr}-${String(hour).padStart(2, '0')}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                datetime: new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), hour),
                label: `${dt.getMonth() + 1}/${dt.getDate()} ${formatHour(hour)}`,
                vehicles: 0,
                violators: 0,
                sum_speeds: 0,
                peak_speed: 0,
                count: 0,
                speeds: [],
                p85_values: []
            });
        }

        const agg = grouped.get(key);
        agg.vehicles += row.vehicles || 0;
        agg.violators += row.violators || 0;
        agg.count++;

        if (row.avg_speed) {
            agg.sum_speeds += (row.avg_speed * (row.vehicles || 1));
            agg.speeds.push(row.avg_speed);
        }

        if (row.peak_speed) {
            agg.peak_speed = Math.max(agg.peak_speed, row.peak_speed);
        }

        if (row.p85 && row.p85 > 0) {
            agg.p85_values.push(row.p85);
        }
    }

    // Sort by datetime and calculate derived values
    const sortedKeys = Array.from(grouped.keys()).sort();
    const results = [];

    for (const key of sortedKeys) {
        const agg = grouped.get(key);

        // Calculate p85: use direct values if available, otherwise estimate from avg_speed
        let p85Value = null;
        if (agg.p85_values.length > 0) {
            p85Value = average(agg.p85_values);
        } else if (agg.speeds.length > 0) {
            p85Value = calculate85thPercentile(agg.speeds);
        }

        results.push({
            datetime: agg.datetime,
            label: agg.label,
            vehicles: agg.vehicles,
            violators: agg.violators,
            non_speeders: agg.vehicles - agg.violators,
            pct_speeders: agg.vehicles > 0 ? (agg.violators / agg.vehicles) * 100 : 0,
            avg_speed: agg.vehicles > 0 ? agg.sum_speeds / agg.vehicles : 0,
            peak_speed: agg.peak_speed,
            p85: p85Value
        });
    }

    return results;
}

/**
 * Calculate overall statistics for a dataset
 * @param {Array} data - Raw data rows
 * @param {Array} perVehicleData - Optional per-vehicle data for 85th percentile
 * @returns {Object} Statistics object
 */
export function calculateStats(data, perVehicleData = null) {
    const stats = {
        totalVehicles: 0,
        totalViolators: 0,
        pctSpeeders: 0,
        avgSpeed: 0,
        peakSpeed: 0,
        p85: null
    };

    if (!data || data.length === 0) return stats;

    // Sum up totals
    let sumSpeeds = 0;
    let speedCount = 0;
    const p85Values = [];
    const avgSpeeds = [];

    for (const row of data) {
        stats.totalVehicles += row.vehicles || 0;
        stats.totalViolators += row.violators || 0;

        if (row.avg_speed) {
            sumSpeeds += row.avg_speed * (row.vehicles || 1);
            speedCount += row.vehicles || 1;
            avgSpeeds.push(row.avg_speed);
        }

        if (row.peak_speed) {
            stats.peakSpeed = Math.max(stats.peakSpeed, row.peak_speed);
        }

        if (row.p85 && row.p85 > 0) {
            p85Values.push(row.p85);
        }
    }

    // Calculate derived values
    if (stats.totalVehicles > 0) {
        stats.pctSpeeders = (stats.totalViolators / stats.totalVehicles) * 100;
    }

    if (speedCount > 0) {
        stats.avgSpeed = sumSpeeds / speedCount;
    }

    // 85th percentile - try multiple sources
    if (perVehicleData && perVehicleData.length > 0) {
        // Best: Calculate from per-vehicle speeds
        const speeds = perVehicleData.map(v => v.speed).filter(s => s > 0);
        stats.p85 = calculate85thPercentile(speeds);
    } else if (p85Values.length > 0) {
        // Good: Use pre-calculated values from clean data
        stats.p85 = average(p85Values);
    } else if (avgSpeeds.length > 0) {
        // Fallback: Estimate from interval average speeds
        stats.p85 = calculate85thPercentile(avgSpeeds);
    }

    return stats;
}

/**
 * Format a number with commas
 * @param {number} num
 * @returns {string}
 */
export function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    return Math.round(num).toLocaleString();
}

/**
 * Format a decimal with fixed precision
 * @param {number} num
 * @param {number} decimals
 * @returns {string}
 */
export function formatDecimal(num, decimals = 1) {
    if (num === null || num === undefined) return '-';
    return num.toFixed(decimals);
}

// ============ Speed Bin Functions for Data Tables ============

/**
 * Speed bin definitions for Speed Summary table (8 bins)
 */
export const SPEED_BINS_8 = [
    { min: 1, max: 10, label: '1-10' },
    { min: 10, max: 20, label: '10-20' },
    { min: 20, max: 30, label: '20-30' },
    { min: 30, max: 40, label: '30-40' },
    { min: 40, max: 50, label: '40-50' },
    { min: 50, max: 60, label: '50-60' },
    { min: 60, max: 70, label: '60-70' },
    { min: 70, max: Infinity, label: '70+' }
];

/**
 * Speed bin definitions for Daily Speed Bins table (12 bins)
 */
export const SPEED_BINS_12 = [
    { min: 5, max: 10, label: '5-10' },
    { min: 11, max: 15, label: '11-15' },
    { min: 16, max: 20, label: '16-20' },
    { min: 21, max: 25, label: '21-25' },
    { min: 26, max: 30, label: '26-30' },
    { min: 31, max: 35, label: '31-35' },
    { min: 36, max: 40, label: '36-40' },
    { min: 41, max: 45, label: '41-45' },
    { min: 46, max: 50, label: '46-50' },
    { min: 51, max: 55, label: '51-55' },
    { min: 56, max: 60, label: '56-60' },
    { min: 61, max: Infinity, label: '61+' }
];

/**
 * Calculate speed distribution into bins
 * @param {number[]} speeds - Array of individual speeds
 * @param {Array} bins - Bin definitions (SPEED_BINS_8 or SPEED_BINS_12)
 * @returns {number[]} Count for each bin
 */
export function calculateSpeedBins(speeds, bins = SPEED_BINS_8) {
    const counts = new Array(bins.length).fill(0);

    for (const speed of speeds) {
        for (let i = 0; i < bins.length; i++) {
            if (speed >= bins[i].min && speed < bins[i].max) {
                counts[i]++;
                break;
            }
            // Handle the last bin (e.g., 70+ or 61+)
            if (i === bins.length - 1 && speed >= bins[i].min) {
                counts[i]++;
            }
        }
    }

    return counts;
}

/**
 * Calculate 85th percentile from pre-binned data
 * Uses linear interpolation within the bin
 * @param {number[]} binCounts - Count for each bin
 * @param {Array} bins - Bin definitions
 * @returns {number} Estimated 85th percentile speed
 */
export function calculate85thFromBins(binCounts, bins = SPEED_BINS_12) {
    const total = binCounts.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const target = total * 0.85;
    let cumulative = 0;

    for (let i = 0; i < binCounts.length; i++) {
        cumulative += binCounts[i];
        if (cumulative >= target) {
            // Linear interpolation within this bin
            const prevCumulative = cumulative - binCounts[i];
            const positionInBin = target - prevCumulative;
            const fraction = binCounts[i] > 0 ? positionInBin / binCounts[i] : 0;
            const binWidth = bins[i].max === Infinity ? 5 : bins[i].max - bins[i].min;
            const interpolated = bins[i].min + (fraction * binWidth);
            return Math.round(interpolated);
        }
    }

    // Fallback: return midpoint of last bin
    return bins[bins.length - 1].min + 2;
}

/**
 * Calculate 50th percentile from pre-binned data
 * @param {number[]} binCounts - Count for each bin
 * @param {Array} bins - Bin definitions
 * @returns {number} Estimated 50th percentile speed
 */
export function calculate50thFromBins(binCounts, bins = SPEED_BINS_12) {
    const total = binCounts.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const target = total * 0.50;
    let cumulative = 0;

    for (let i = 0; i < binCounts.length; i++) {
        cumulative += binCounts[i];
        if (cumulative >= target) {
            const prevCumulative = cumulative - binCounts[i];
            const positionInBin = target - prevCumulative;
            const fraction = binCounts[i] > 0 ? positionInBin / binCounts[i] : 0;
            const binWidth = bins[i].max === Infinity ? 5 : bins[i].max - bins[i].min;
            const interpolated = bins[i].min + (fraction * binWidth);
            return Math.round(interpolated);
        }
    }

    return bins[bins.length - 1].min + 2;
}

/**
 * Aggregate data by hour of day (0-23) for 24-hour summary
 * @param {Array} data - Array of data rows with datetime field
 * @returns {Array} Array of 24 objects, one per hour
 */
export function aggregateBy24Hour(data) {
    // Initialize 24 hour slots
    const hourly = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: formatHour(i),
        vehicles: 0,
        violators: 0,
        sumSpeeds: 0,
        speedCount: 0,
        speeds: []
    }));

    for (const row of data) {
        if (!row.datetime) continue;
        const dt = new Date(row.datetime);
        const hour = dt.getHours();

        hourly[hour].vehicles += row.vehicles || 0;
        hourly[hour].violators += row.violators || 0;

        if (row.avg_speed) {
            hourly[hour].sumSpeeds += row.avg_speed * (row.vehicles || 1);
            hourly[hour].speedCount += row.vehicles || 1;
            hourly[hour].speeds.push(row.avg_speed);
        }
    }

    // Calculate derived values
    return hourly.map(h => ({
        hour: h.hour,
        label: h.label,
        vehicles: h.vehicles,
        violators: h.violators,
        avgSpeed: h.speedCount > 0 ? h.sumSpeeds / h.speedCount : null
    }));
}

/**
 * Calculate report statistics for PDF header
 * @param {Array} data - Filtered study data
 * @returns {Object} Statistics for report header
 */
export function calculateReportStatistics(data) {
    if (!data || data.length === 0) {
        return {
            totalVehicles: 0,
            totalViolators: 0,
            violationRate: 0,
            avgSpeed: 0,
            p85Speed: null
        };
    }

    let totalVehicles = 0;
    let totalViolators = 0;
    let sumSpeeds = 0;
    let speedCount = 0;
    const p85Values = [];
    const avgSpeeds = [];

    for (const row of data) {
        totalVehicles += row.vehicles || 0;
        totalViolators += row.violators || 0;

        if (row.avg_speed) {
            sumSpeeds += row.avg_speed * (row.vehicles || 1);
            speedCount += row.vehicles || 1;
            avgSpeeds.push(row.avg_speed);
        }

        if (row.p85 && row.p85 > 0) {
            p85Values.push(row.p85);
        }
    }

    // Calculate p85 - prefer direct values, fallback to estimation
    let p85Speed = null;
    if (p85Values.length > 0) {
        p85Speed = average(p85Values);
    } else if (avgSpeeds.length > 0) {
        p85Speed = calculate85thPercentile(avgSpeeds);
    }

    return {
        totalVehicles,
        totalViolators,
        violationRate: totalVehicles > 0 ? (totalViolators / totalVehicles) * 100 : 0,
        avgSpeed: speedCount > 0 ? sumSpeeds / speedCount : 0,
        p85Speed
    };
}
