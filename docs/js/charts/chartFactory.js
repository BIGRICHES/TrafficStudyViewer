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
                            data: data.map(d => d.non_speeders),
                            backgroundColor: CHART_COLORS.lawAbiding,
                            borderRadius: 4
                        },
                        {
                            label: 'Violators',
                            data: data.map(d => d.violators),
                            backgroundColor: CHART_COLORS.violators,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, title: { display: true, text: 'Vehicles' } }
                    },
                    plugins: {
                        ...baseConfig.plugins,
                        datalabels: showLabels ? { display: true } : { display: false }
                    }
                }
            };

        case 'pct-speeders':
            return {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: '% Speeders',
                            data: data.map(d => d.pct_speeders),
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
                            max: 100,
                            title: { display: true, text: 'Percentage' },
                            ticks: { callback: v => v + '%' }
                        }
                    }
                }
            };

        case 'avg-peak-speeds':
            const datasets = [
                {
                    label: 'Average Speed',
                    data: data.map(d => d.avg_speed),
                    borderColor: CHART_COLORS.avgSpeed,
                    backgroundColor: CHART_COLORS.avgSpeed + '40',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Peak Speed',
                    data: data.map(d => d.peak_speed),
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

            return {
                type: 'line',
                data: { labels, datasets },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: false,
                            title: { display: true, text: 'Speed (mph)' }
                        }
                    }
                }
            };

        case 'avg-vs-85th':
            const avgVs85thDatasets = [
                {
                    label: 'Average Speed',
                    data: data.map(d => d.avg_speed),
                    backgroundColor: CHART_COLORS.avgSpeed,
                    borderRadius: 4
                }
            ];

            // Only add 85th percentile if we have data
            const has85th = data.some(d => d.p85 !== null && d.p85 > 0);
            if (has85th) {
                avgVs85thDatasets.push({
                    label: '85th Percentile',
                    data: data.map(d => d.p85 || 0),
                    backgroundColor: CHART_COLORS.percentile85,
                    borderRadius: 4
                });
            }

            return {
                type: 'bar',
                data: { labels, datasets: avgVs85thDatasets },
                options: {
                    ...baseConfig,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: false,
                            title: { display: true, text: 'Speed (mph)' }
                        }
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
                            data: data.map(d => d.vehicles),
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
                            title: { display: true, text: 'Vehicle Count' }
                        }
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
 * @param {Object} options - Additional options
 */
export function createChart(canvas, chartType, rawData, timeAgg = 'daily', options = {}) {
    // Aggregate data
    const aggregatedData = timeAgg === 'hourly'
        ? aggregateHourly(rawData)
        : aggregateDaily(rawData);

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
