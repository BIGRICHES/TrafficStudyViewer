/**
 * Chart.js factory for creating and updating charts
 */

import { CHART_COLORS } from '../config.js';
import { aggregateDaily, aggregateHourly } from '../utils/stats.js';

let currentChart = null;

/**
 * Get Chart.js configuration based on chart type
 * @param {string} chartType
 * @param {Array} data - Aggregated data
 * @param {Object} options - Additional options (showLabels, speedLimit)
 * @returns {Object} Chart.js configuration
 */
function getChartConfig(chartType, data, options = {}) {
    const { showLabels = true, speedLimit = 0 } = options;
    const labels = data.map(d => d.label);

    const baseConfig = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 15
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false
            }
        }
    };

    switch (chartType) {
        case 'vehicles-violators':
            return {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Law-Abiding',
                            data: data.map(d => Math.round(d.non_speeders || 0)),
                            backgroundColor: CHART_COLORS.lawAbiding,
                            borderRadius: 4
                        },
                        {
                            label: 'Violators',
                            data: data.map(d => Math.round(d.violators || 0)),
                            backgroundColor: CHART_COLORS.violators,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Vehicles' },
                            ticks: { callback: v => Math.round(v).toLocaleString() }
                        }
                    },
                    plugins: {
                        ...baseConfig.plugins,
                        datalabels: showLabels ? {
                            display: true,
                            formatter: (value) => Math.round(value).toLocaleString()
                        } : { display: false }
                    }
                }
            };

        case 'pct-speeders':
            return {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: '% Speeders',
                            data: data.map(d => d.pct_speeders),
                            borderColor: CHART_COLORS.violators,
                            backgroundColor: CHART_COLORS.violators + '40',
                            fill: false,
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            max: 100,
                            title: { display: true, text: 'Percentage' },
                            ticks: { callback: v => v + '%' }
                        }
                    },
                    plugins: {
                        ...baseConfig.plugins,
                        datalabels: showLabels ? {
                            display: true,
                            align: 'top',
                            formatter: (value) => value?.toFixed(1) + '%'
                        } : { display: false }
                    }
                }
            };

        case 'avg-peak-speeds':
            const datasets = [
                {
                    label: 'Average Speed',
                    data: data.map(d => Math.round(d.avg_speed || 0)),
                    borderColor: CHART_COLORS.avgSpeed,
                    backgroundColor: CHART_COLORS.avgSpeed + '40',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Peak Speed',
                    data: data.map(d => Math.round(d.peak_speed || 0)),
                    borderColor: CHART_COLORS.peakSpeed,
                    backgroundColor: CHART_COLORS.peakSpeed + '40',
                    fill: false,
                    tension: 0.3
                }
            ];

            // Add speed limit line if provided
            if (speedLimit > 0) {
                datasets.push({
                    label: 'Speed Limit',
                    data: data.map(() => speedLimit),
                    borderColor: CHART_COLORS.speedLimit,
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                });
            }

            // Calculate axis range for better detail
            const avgPeakValues = data.flatMap(d => [d.avg_speed, d.peak_speed]).filter(v => v > 0);
            if (speedLimit > 0) avgPeakValues.push(speedLimit);
            const avgPeakMin = Math.min(...avgPeakValues);
            const avgPeakMax = Math.max(...avgPeakValues);
            const avgPeakRange = avgPeakMax - avgPeakMin;
            const avgPeakPadding = avgPeakRange * 0.15 || 5;
            const suggestedMinAvgPeak = Math.max(0, Math.floor((avgPeakMin - avgPeakPadding) / 5) * 5);
            const suggestedMaxAvgPeak = Math.ceil((avgPeakMax + avgPeakPadding) / 5) * 5;

            return {
                type: 'line',
                data: { labels, datasets },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: false,
                            suggestedMin: suggestedMinAvgPeak,
                            suggestedMax: suggestedMaxAvgPeak,
                            title: { display: true, text: 'Speed (mph)' },
                            ticks: { callback: v => Math.round(v) }
                        }
                    },
                    plugins: {
                        ...baseConfig.plugins,
                        datalabels: showLabels ? {
                            display: true,
                            align: 'top',
                            formatter: (value) => Math.round(value)
                        } : { display: false }
                    }
                }
            };

        case 'avg-vs-85th':
            const avgVs85thDatasets = [
                {
                    label: 'Average Speed',
                    data: data.map(d => Math.round(d.avg_speed || 0)),
                    backgroundColor: CHART_COLORS.avgSpeed,
                    borderRadius: 4
                }
            ];

            // Only add 85th percentile if we have data
            const has85th = data.some(d => d.p85 !== null && d.p85 > 0);
            if (has85th) {
                avgVs85thDatasets.push({
                    label: '85th Percentile',
                    data: data.map(d => Math.round(d.p85 || 0)),
                    backgroundColor: CHART_COLORS.percentile85,
                    borderRadius: 4
                });
            }

            // Calculate axis range for better detail
            const speedValues = data.flatMap(d => [d.avg_speed, d.p85]).filter(v => v > 0);
            const speedMin = Math.min(...speedValues);
            const speedMax = Math.max(...speedValues);
            const speedRange = speedMax - speedMin;
            const speedPadding = speedRange * 0.3 || 5;
            const suggestedMin85th = Math.max(0, Math.floor((speedMin - speedPadding) / 5) * 5);
            const suggestedMax85th = Math.ceil((speedMax + speedPadding) / 5) * 5;

            return {
                type: 'bar',
                data: { labels, datasets: avgVs85thDatasets },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: false,
                            suggestedMin: suggestedMin85th,
                            suggestedMax: suggestedMax85th,
                            title: { display: true, text: 'Speed (mph)' },
                            ticks: { callback: v => Math.round(v) }
                        }
                    },
                    plugins: {
                        ...baseConfig.plugins,
                        datalabels: showLabels ? {
                            display: true,
                            align: 'top',
                            formatter: (value) => Math.round(value)
                        } : { display: false }
                    }
                }
            };

        case 'volume-only':
            return {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Vehicles',
                            data: data.map(d => Math.round(d.vehicles || 0)),
                            backgroundColor: CHART_COLORS.volume,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Vehicle Count' },
                            ticks: { callback: v => Math.round(v).toLocaleString() }
                        }
                    },
                    plugins: {
                        ...baseConfig.plugins,
                        datalabels: showLabels ? {
                            display: true,
                            formatter: (value) => Math.round(value).toLocaleString()
                        } : { display: false }
                    }
                }
            };

        default:
            throw new Error(`Unknown chart type: ${chartType}`);
    }
}

/**
 * Create or update the main chart
 * @param {HTMLCanvasElement} canvas
 * @param {string} chartType
 * @param {Array} rawData - Raw study data
 * @param {string} timeAgg - 'daily' or 'hourly'
 * @param {Object} options - Additional options (showLabels, speedLimit, extractedPercentiles)
 */
export function createChart(canvas, chartType, rawData, timeAgg = 'daily', options = {}) {
    const { extractedPercentiles = null } = options;

    // Aggregate data with extracted percentiles for accurate p85
    const aggregatedData = timeAgg === 'hourly'
        ? aggregateHourly(rawData, extractedPercentiles)
        : aggregateDaily(rawData, extractedPercentiles);

    // Get chart configuration
    const config = getChartConfig(chartType, aggregatedData, options);

    // Destroy existing chart
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }

    // Create new chart
    const ctx = canvas.getContext('2d');
    currentChart = new Chart(ctx, config);

    return currentChart;
}

/**
 * Destroy the current chart
 */
export function destroyChart() {
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}

/**
 * Get the current chart instance
 * @returns {Chart|null}
 */
export function getCurrentChart() {
    return currentChart;
}

/**
 * Update chart colors for theme
 * @param {boolean} isDark
 */
export function updateChartTheme(isDark) {
    if (!currentChart) return;

    const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
    const gridColor = isDark ? '#404040' : '#e0e0e0';

    currentChart.options.scales.x.ticks = { color: textColor };
    currentChart.options.scales.y.ticks = { color: textColor };
    currentChart.options.scales.x.grid = { color: gridColor };
    currentChart.options.scales.y.grid = { color: gridColor };
    currentChart.options.plugins.legend.labels.color = textColor;

    currentChart.update();
}
