/**
 * Vector-based PDF Generator for Traffic Study Reports
 * Uses jsPDF's native drawing methods for clean, small PDFs
 */

import { CHART_COLORS, TABLE_COLORS } from '../config.js';
import {
    aggregateDaily,
    aggregateHourly,
    aggregateBy24Hour,
    calculateReportStatistics,
    SPEED_BINS_8,
    SPEED_BINS_12,
    calculate85thFromBins,
    calculate50thFromBins
} from '../utils/stats.js';

// PDF Colors (RGB 0-255)
const COLORS = {
    lawAbiding: [84, 112, 198],      // Blue
    violators: [238, 102, 102],       // Red
    pctSpeeders: [154, 96, 180],      // Purple
    avgSpeed: [84, 112, 198],         // Blue
    peakSpeed: [238, 102, 102],       // Red
    percentile85: [154, 96, 180],     // Purple
    speedLimit: [0, 0, 0],            // Black
    volume: [84, 112, 198],           // Blue
    gridLine: [220, 220, 220],        // Light gray
    axisLine: [100, 100, 100],        // Dark gray
    text: [0, 0, 0],                  // Black
    textGray: [100, 100, 100],        // Gray
    headerBg: [68, 114, 196],         // Blue
    headerText: [255, 255, 255],      // White
    totalsBg: [217, 226, 243],        // Light blue
    altRowBg: [245, 247, 250],        // Very light gray
    white: [255, 255, 255]
};

// ============ Header Drawing ============

/**
 * Draw report header on PDF page
 */
export function drawHeader(doc, options = {}) {
    const {
        logoDataUrl = null,
        title = 'Traffic Study Report',
        location = '',
        direction = '',
        dateRange = '',
        counter = '',
        speedLimit = '',
        stats = null,
        isFirstPage = true,
        isContinuation = false
    } = options;

    const pageWidth = doc.internal.pageSize.getWidth();
    const logoSize = 18;
    const leftMargin = 10;
    const textStartX = logoDataUrl ? leftMargin + logoSize + 5 : leftMargin;

    // Draw logo if available
    if (logoDataUrl) {
        try {
            doc.addImage(logoDataUrl, 'PNG', leftMargin, 6, logoSize, logoSize);
        } catch (e) {
            console.warn('Failed to add logo:', e);
        }
    }

    // Title
    let titleText = title;
    if (location) {
        titleText = `Traffic Study Report: ${location}`;
        if (direction) titleText += ` - ${direction}`;
    }
    if (isContinuation) titleText += ' (continued)';

    doc.setFontSize(14);
    doc.setTextColor(...COLORS.text);
    doc.setFont(undefined, 'bold');
    doc.text(titleText, textStartX, 14);
    doc.setFont(undefined, 'normal');

    if (isFirstPage && !isContinuation) {
        // Details line
        if (dateRange || counter || speedLimit) {
            doc.setFontSize(9);
            doc.setTextColor(...COLORS.textGray);
            let details = [];
            if (dateRange) details.push(`Date Range: ${dateRange}`);
            if (counter) details.push(`Counter: ${counter}`);
            if (speedLimit) details.push(`Speed Limit: ${speedLimit} mph`);
            doc.text(details.join('   •   '), textStartX, 20);
        }

        // Stats line
        if (stats) {
            doc.setFontSize(9);
            doc.setTextColor(44, 82, 130);
            doc.setFont(undefined, 'bold');
            let statsLine = `Study Totals:  Vehicles: ${stats.totalVehicles.toLocaleString()}`;
            statsLine += `   •   Violators: ${stats.totalViolators.toLocaleString()} (${stats.violationRate.toFixed(1)}%)`;
            if (stats.avgSpeed > 0) {
                statsLine += `   •   Avg Speed: ${stats.avgSpeed.toFixed(1)} mph`;
            }
            if (stats.p85Speed) {
                statsLine += `   •   85th Percentile: ${Math.round(stats.p85Speed)} mph`;
            }
            doc.text(statsLine, textStartX, 26);
            doc.setFont(undefined, 'normal');
        }

        // Separator line
        doc.setDrawColor(170, 170, 170);
        doc.setLineWidth(0.4);
        doc.line(leftMargin, 30, pageWidth - leftMargin, 30);

        return 34; // Return Y position after header
    } else {
        // Continuation page - just separator
        doc.setDrawColor(170, 170, 170);
        doc.setLineWidth(0.4);
        doc.line(leftMargin, 18, pageWidth - leftMargin, 18);

        return 22;
    }
}

// ============ Chart Drawing ============

/**
 * Draw a simple bar chart
 */
export function drawBarChart(doc, data, options = {}) {
    const {
        x = 15,
        y = 40,
        width = 180,
        height = 100,
        title = '',
        yAxisLabel = '',
        color = COLORS.volume,
        showValues = true,
        valueKey = 'value'
    } = options;

    if (!data || data.length === 0) return;

    const values = data.map(d => d[valueKey] || 0);
    const maxValue = Math.max(...values, 1);
    const barCount = data.length;
    const barWidth = (width * 0.8) / barCount;
    const barGap = (width * 0.2) / (barCount + 1);
    const chartBottom = y + height;
    const chartLeft = x + 15;
    const chartWidth = width - 20;
    const chartHeight = height - 25;

    // Title
    if (title) {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...COLORS.text);
        doc.text(title, x + width / 2, y - 5, { align: 'center' });
        doc.setFont(undefined, 'normal');
    }

    // Y-axis
    doc.setDrawColor(...COLORS.axisLine);
    doc.setLineWidth(0.3);
    doc.line(chartLeft, y + 5, chartLeft, chartBottom - 15);

    // Y-axis label
    if (yAxisLabel) {
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.textGray);
        doc.text(yAxisLabel, x, y + chartHeight / 2, { angle: 90 });
    }

    // Y-axis ticks and grid lines
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
        const tickY = chartBottom - 15 - (i / yTicks) * chartHeight;
        const tickValue = Math.round((i / yTicks) * maxValue);

        // Grid line
        doc.setDrawColor(...COLORS.gridLine);
        doc.setLineWidth(0.2);
        doc.line(chartLeft, tickY, chartLeft + chartWidth, tickY);

        // Tick label
        doc.setFontSize(6);
        doc.setTextColor(...COLORS.textGray);
        doc.text(tickValue.toLocaleString(), chartLeft - 2, tickY + 1, { align: 'right' });
    }

    // X-axis
    doc.setDrawColor(...COLORS.axisLine);
    doc.setLineWidth(0.3);
    doc.line(chartLeft, chartBottom - 15, chartLeft + chartWidth, chartBottom - 15);

    // Bars
    const effectiveBarWidth = chartWidth / barCount * 0.7;
    const effectiveGap = chartWidth / barCount * 0.3;

    data.forEach((d, i) => {
        const value = d[valueKey] || 0;
        const barHeight = (value / maxValue) * chartHeight;
        const barX = chartLeft + (i * chartWidth / barCount) + effectiveGap / 2;
        const barY = chartBottom - 15 - barHeight;

        // Bar
        doc.setFillColor(...color);
        doc.rect(barX, barY, effectiveBarWidth, barHeight, 'F');

        // Value on top
        if (showValues && value > 0) {
            doc.setFontSize(5);
            doc.setTextColor(...COLORS.text);
            doc.text(value.toLocaleString(), barX + effectiveBarWidth / 2, barY - 1, { align: 'center' });
        }

        // X-axis label
        doc.setFontSize(5);
        doc.setTextColor(...COLORS.textGray);
        const label = d.label || '';
        doc.text(label, barX + effectiveBarWidth / 2, chartBottom - 10, { align: 'center', maxWidth: effectiveBarWidth + 2 });
    });
}

/**
 * Draw a grouped bar chart (two series)
 */
export function drawGroupedBarChart(doc, data, options = {}) {
    const {
        x = 15,
        y = 40,
        width = 180,
        height = 100,
        title = '',
        yAxisLabel = '',
        series1Key = 'value1',
        series2Key = 'value2',
        series1Label = 'Series 1',
        series2Label = 'Series 2',
        series1Color = COLORS.lawAbiding,
        series2Color = COLORS.violators,
        showValues = true
    } = options;

    if (!data || data.length === 0) return;

    const values1 = data.map(d => d[series1Key] || 0);
    const values2 = data.map(d => d[series2Key] || 0);
    const maxValue = Math.max(...values1, ...values2, 1);
    const barCount = data.length;
    const chartBottom = y + height;
    const chartLeft = x + 15;
    const chartWidth = width - 20;
    const chartHeight = height - 30;

    // Title
    if (title) {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...COLORS.text);
        doc.text(title, x + width / 2, y - 5, { align: 'center' });
        doc.setFont(undefined, 'normal');
    }

    // Legend
    const legendY = y + 2;
    const legendX = x + width - 60;
    doc.setFillColor(...series1Color);
    doc.rect(legendX, legendY - 3, 4, 4, 'F');
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.text);
    doc.text(series1Label, legendX + 6, legendY);

    doc.setFillColor(...series2Color);
    doc.rect(legendX + 35, legendY - 3, 4, 4, 'F');
    doc.text(series2Label, legendX + 41, legendY);

    // Y-axis
    doc.setDrawColor(...COLORS.axisLine);
    doc.setLineWidth(0.3);
    doc.line(chartLeft, y + 10, chartLeft, chartBottom - 15);

    // Y-axis ticks and grid lines
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
        const tickY = chartBottom - 15 - (i / yTicks) * chartHeight;
        const tickValue = Math.round((i / yTicks) * maxValue);

        doc.setDrawColor(...COLORS.gridLine);
        doc.setLineWidth(0.2);
        doc.line(chartLeft, tickY, chartLeft + chartWidth, tickY);

        doc.setFontSize(6);
        doc.setTextColor(...COLORS.textGray);
        doc.text(tickValue.toLocaleString(), chartLeft - 2, tickY + 1, { align: 'right' });
    }

    // X-axis
    doc.setDrawColor(...COLORS.axisLine);
    doc.setLineWidth(0.3);
    doc.line(chartLeft, chartBottom - 15, chartLeft + chartWidth, chartBottom - 15);

    // Grouped bars
    const groupWidth = chartWidth / barCount;
    const barWidth = groupWidth * 0.35;
    const barGap = groupWidth * 0.05;

    data.forEach((d, i) => {
        const value1 = d[series1Key] || 0;
        const value2 = d[series2Key] || 0;
        const groupX = chartLeft + (i * groupWidth);

        // First bar
        const bar1Height = (value1 / maxValue) * chartHeight;
        const bar1X = groupX + barGap;
        const bar1Y = chartBottom - 15 - bar1Height;
        doc.setFillColor(...series1Color);
        doc.rect(bar1X, bar1Y, barWidth, bar1Height, 'F');

        // Second bar
        const bar2Height = (value2 / maxValue) * chartHeight;
        const bar2X = groupX + barGap + barWidth + barGap;
        const bar2Y = chartBottom - 15 - bar2Height;
        doc.setFillColor(...series2Color);
        doc.rect(bar2X, bar2Y, barWidth, bar2Height, 'F');

        // Values on top
        if (showValues) {
            doc.setFontSize(4);
            doc.setTextColor(...COLORS.text);
            if (value1 > 0) doc.text(value1.toLocaleString(), bar1X + barWidth / 2, bar1Y - 1, { align: 'center' });
            if (value2 > 0) doc.text(value2.toLocaleString(), bar2X + barWidth / 2, bar2Y - 1, { align: 'center' });
        }

        // X-axis label
        doc.setFontSize(5);
        doc.setTextColor(...COLORS.textGray);
        doc.text(d.label || '', groupX + groupWidth / 2, chartBottom - 10, { align: 'center', maxWidth: groupWidth });
    });
}

/**
 * Draw a line chart (one or two series)
 */
export function drawLineChart(doc, data, options = {}) {
    const {
        x = 15,
        y = 40,
        width = 180,
        height = 100,
        title = '',
        yAxisLabel = '',
        series1Key = 'value1',
        series2Key = null,
        series1Label = 'Series 1',
        series2Label = 'Series 2',
        series1Color = COLORS.avgSpeed,
        series2Color = COLORS.peakSpeed,
        referenceLine = null,
        referenceLabel = '',
        showPoints = true
    } = options;

    if (!data || data.length === 0) return;

    const values1 = data.map(d => d[series1Key] || 0);
    const values2 = series2Key ? data.map(d => d[series2Key] || 0) : [];
    const allValues = [...values1, ...values2];
    if (referenceLine) allValues.push(referenceLine);
    const maxValue = Math.max(...allValues, 1);
    const minValue = Math.min(...allValues.filter(v => v > 0), 0);

    const chartBottom = y + height;
    const chartLeft = x + 15;
    const chartWidth = width - 20;
    const chartHeight = height - 30;

    // Title
    if (title) {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...COLORS.text);
        doc.text(title, x + width / 2, y - 5, { align: 'center' });
        doc.setFont(undefined, 'normal');
    }

    // Legend
    const legendY = y + 2;
    let legendX = x + width - 80;

    doc.setDrawColor(...series1Color);
    doc.setLineWidth(0.8);
    doc.line(legendX, legendY - 1, legendX + 8, legendY - 1);
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.text);
    doc.text(series1Label, legendX + 10, legendY);

    if (series2Key) {
        legendX += 35;
        doc.setDrawColor(...series2Color);
        doc.line(legendX, legendY - 1, legendX + 8, legendY - 1);
        doc.text(series2Label, legendX + 10, legendY);
    }

    // Y-axis
    doc.setDrawColor(...COLORS.axisLine);
    doc.setLineWidth(0.3);
    doc.line(chartLeft, y + 10, chartLeft, chartBottom - 15);

    // Y-axis ticks and grid
    const yTicks = 5;
    const yRange = maxValue - minValue || 1;
    for (let i = 0; i <= yTicks; i++) {
        const tickY = chartBottom - 15 - (i / yTicks) * chartHeight;
        const tickValue = Math.round(minValue + (i / yTicks) * yRange);

        doc.setDrawColor(...COLORS.gridLine);
        doc.setLineWidth(0.2);
        doc.line(chartLeft, tickY, chartLeft + chartWidth, tickY);

        doc.setFontSize(6);
        doc.setTextColor(...COLORS.textGray);
        doc.text(tickValue.toString(), chartLeft - 2, tickY + 1, { align: 'right' });
    }

    // Reference line (e.g., speed limit)
    if (referenceLine !== null) {
        const refY = chartBottom - 15 - ((referenceLine - minValue) / yRange) * chartHeight;
        doc.setDrawColor(...COLORS.speedLimit);
        doc.setLineWidth(0.5);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(chartLeft, refY, chartLeft + chartWidth, refY);
        doc.setLineDashPattern([], 0);

        if (referenceLabel) {
            doc.setFontSize(5);
            doc.setTextColor(...COLORS.textGray);
            doc.text(referenceLabel, chartLeft + chartWidth + 1, refY + 1);
        }
    }

    // X-axis
    doc.setDrawColor(...COLORS.axisLine);
    doc.setLineWidth(0.3);
    doc.line(chartLeft, chartBottom - 15, chartLeft + chartWidth, chartBottom - 15);

    // Helper to calculate point position
    const getPoint = (index, value) => {
        const px = chartLeft + (index / (data.length - 1 || 1)) * chartWidth;
        const py = chartBottom - 15 - ((value - minValue) / yRange) * chartHeight;
        return { x: px, y: py };
    };

    // Draw lines
    const drawSeries = (values, color) => {
        doc.setDrawColor(...color);
        doc.setLineWidth(0.8);

        let lastPoint = null;
        values.forEach((value, i) => {
            if (value > 0) {
                const point = getPoint(i, value);
                if (lastPoint) {
                    doc.line(lastPoint.x, lastPoint.y, point.x, point.y);
                }
                lastPoint = point;
            }
        });

        // Draw points
        if (showPoints) {
            values.forEach((value, i) => {
                if (value > 0) {
                    const point = getPoint(i, value);
                    doc.setFillColor(...color);
                    doc.circle(point.x, point.y, 1, 'F');
                }
            });
        }
    };

    drawSeries(values1, series1Color);
    if (series2Key) {
        drawSeries(values2, series2Color);
    }

    // X-axis labels (show subset if too many)
    const maxLabels = 12;
    const step = Math.ceil(data.length / maxLabels);
    data.forEach((d, i) => {
        if (i % step === 0 || i === data.length - 1) {
            const px = chartLeft + (i / (data.length - 1 || 1)) * chartWidth;
            doc.setFontSize(5);
            doc.setTextColor(...COLORS.textGray);
            doc.text(d.label || '', px, chartBottom - 10, { align: 'center', maxWidth: chartWidth / maxLabels });
        }
    });
}

// ============ Table Drawing ============

/**
 * Draw a data table
 */
export function drawTable(doc, options = {}) {
    const {
        x = 10,
        y = 35,
        headers = [],
        rows = [],
        columnWidths = [],
        title = '',
        subtitle = '',
        highlightColumn = -1,
        totalsRow = null
    } = options;

    const pageWidth = doc.internal.pageSize.getWidth();
    const tableWidth = pageWidth - 2 * x;
    const rowHeight = 6;
    const headerHeight = 8;

    // Calculate column widths if not provided
    const colWidths = columnWidths.length === headers.length
        ? columnWidths
        : headers.map(() => tableWidth / headers.length);

    let currentY = y;

    // Title
    if (title) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...COLORS.text);
        doc.text(title, pageWidth / 2, currentY, { align: 'center' });
        currentY += 6;
        doc.setFont(undefined, 'normal');
    }

    // Subtitle
    if (subtitle) {
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.textGray);
        doc.text(subtitle, pageWidth / 2, currentY, { align: 'center' });
        currentY += 5;
    }

    // Header row
    doc.setFillColor(...COLORS.headerBg);
    doc.rect(x, currentY, tableWidth, headerHeight, 'F');

    doc.setFontSize(7);
    doc.setTextColor(...COLORS.headerText);
    doc.setFont(undefined, 'bold');

    let colX = x;
    headers.forEach((header, i) => {
        doc.text(header, colX + colWidths[i] / 2, currentY + headerHeight / 2 + 1.5, { align: 'center', maxWidth: colWidths[i] - 2 });
        colX += colWidths[i];
    });

    currentY += headerHeight;
    doc.setFont(undefined, 'normal');

    // Data rows
    rows.forEach((row, rowIndex) => {
        // Alternate row background
        if (rowIndex % 2 === 1) {
            doc.setFillColor(...COLORS.altRowBg);
            doc.rect(x, currentY, tableWidth, rowHeight, 'F');
        }

        doc.setFontSize(6);
        doc.setTextColor(...COLORS.text);

        colX = x;
        row.forEach((cell, colIndex) => {
            // Highlight column (e.g., speed limit violation)
            if (colIndex === highlightColumn && cell && parseFloat(cell) > 0) {
                doc.setFillColor(255, 224, 224);
                doc.rect(colX, currentY, colWidths[colIndex], rowHeight, 'F');
            }

            const cellText = cell !== null && cell !== undefined ? String(cell) : '-';
            doc.text(cellText, colX + colWidths[colIndex] / 2, currentY + rowHeight / 2 + 1.5, { align: 'center', maxWidth: colWidths[colIndex] - 2 });
            colX += colWidths[colIndex];
        });

        currentY += rowHeight;
    });

    // Totals row
    if (totalsRow) {
        doc.setFillColor(...COLORS.totalsBg);
        doc.rect(x, currentY, tableWidth, rowHeight + 1, 'F');

        doc.setFontSize(6);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...COLORS.text);

        colX = x;
        totalsRow.forEach((cell, colIndex) => {
            const cellText = cell !== null && cell !== undefined ? String(cell) : '';
            doc.text(cellText, colX + colWidths[colIndex] / 2, currentY + rowHeight / 2 + 2, { align: 'center', maxWidth: colWidths[colIndex] - 2 });
            colX += colWidths[colIndex];
        });

        doc.setFont(undefined, 'normal');
        currentY += rowHeight + 1;
    }

    // Table border
    doc.setDrawColor(...COLORS.axisLine);
    doc.setLineWidth(0.3);
    doc.rect(x, y + (title ? 6 : 0) + (subtitle ? 5 : 0), tableWidth, currentY - y - (title ? 6 : 0) - (subtitle ? 5 : 0));

    return currentY;
}

/**
 * Generate Speed Summary Table (24-hour)
 */
export function generateSpeedSummaryTable(doc, data, date, speedLimit, studyMeta, logoDataUrl, startY = 8) {
    const pageWidth = doc.internal.pageSize.getWidth();

    // Filter data for specific date
    const dateData = data.filter(row => {
        if (!row.datetime) return false;
        const rowDate = new Date(row.datetime).toISOString().split('T')[0];
        return rowDate === date;
    });

    const hourlyData = aggregateBy24Hour(dateData);

    // Calculate totals
    let totalVehicles = 0;
    let totalViolators = 0;
    let totalSumSpeeds = 0;
    let totalSpeedCount = 0;
    const totalSpeedBins = new Array(8).fill(0);

    hourlyData.forEach(h => {
        totalVehicles += h.vehicles;
        totalViolators += h.violators || 0;
        if (h.avgSpeed !== null && h.vehicles > 0) {
            totalSumSpeeds += h.avgSpeed * h.vehicles;
            totalSpeedCount += h.vehicles;

            // Assign to bin
            for (let i = 0; i < SPEED_BINS_8.length; i++) {
                const bin = SPEED_BINS_8[i];
                if (h.avgSpeed >= bin.min && (h.avgSpeed < bin.max || i === SPEED_BINS_8.length - 1)) {
                    totalSpeedBins[i] += h.vehicles;
                    break;
                }
            }
        }
    });

    const totalAvgSpeed = totalSpeedCount > 0 ? totalSumSpeeds / totalSpeedCount : null;
    const p85 = calculate85thFromBins(totalSpeedBins, SPEED_BINS_8);

    // Format date
    const displayDate = new Date(date + 'T12:00:00');
    const dayOfWeek = displayDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = displayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Header
    drawHeader(doc, {
        logoDataUrl,
        location: studyMeta.location,
        direction: studyMeta.direction,
        dateRange: `${formattedDate} (${dayOfWeek})`,
        counter: studyMeta.counter_number,
        speedLimit: studyMeta.speed_limit,
        stats: {
            totalVehicles,
            totalViolators,
            violationRate: totalVehicles > 0 ? (totalViolators / totalVehicles) * 100 : 0,
            avgSpeed: totalAvgSpeed,
            p85Speed: p85
        },
        isFirstPage: true
    });

    // Build table data
    const headers = ['Hour', 'Vehicles', 'Violators', '%', 'Avg Speed', ...SPEED_BINS_8.map(b => b.label)];
    const colWidths = [18, 18, 18, 12, 18, ...SPEED_BINS_8.map(() => 14.5)];

    const rows = hourlyData.map(h => {
        const pct = h.vehicles > 0 ? ((h.violators / h.vehicles) * 100).toFixed(1) : '-';
        const avg = h.avgSpeed ? h.avgSpeed.toFixed(1) : '-';

        // Calculate bins for this hour
        const hourBins = new Array(8).fill(0);
        if (h.avgSpeed !== null && h.vehicles > 0) {
            for (let i = 0; i < SPEED_BINS_8.length; i++) {
                const bin = SPEED_BINS_8[i];
                if (h.avgSpeed >= bin.min && (h.avgSpeed < bin.max || i === SPEED_BINS_8.length - 1)) {
                    hourBins[i] = h.vehicles;
                    break;
                }
            }
        }

        return [h.label, h.vehicles.toLocaleString(), h.violators.toLocaleString(), pct, avg, ...hourBins.map(b => b || '-')];
    });

    const totalsRow = [
        'TOTAL',
        totalVehicles.toLocaleString(),
        totalViolators.toLocaleString(),
        totalVehicles > 0 ? ((totalViolators / totalVehicles) * 100).toFixed(1) : '-',
        totalAvgSpeed ? totalAvgSpeed.toFixed(1) : '-',
        ...totalSpeedBins.map(b => b || '-')
    ];

    drawTable(doc, {
        y: 36,
        headers,
        rows,
        columnWidths: colWidths,
        title: '24-Hour Speed Summary',
        totalsRow
    });
}

/**
 * Generate Volume Summary Table (24-hour)
 */
export function generateVolumeSummaryTable(doc, data, date, studyMeta, logoDataUrl, startY = 8) {
    const pageWidth = doc.internal.pageSize.getWidth();

    // Filter data for specific date
    const dateData = data.filter(row => {
        if (!row.datetime) return false;
        const rowDate = new Date(row.datetime).toISOString().split('T')[0];
        return rowDate === date;
    });

    const hourlyData = aggregateBy24Hour(dateData);
    const totalVehicles = hourlyData.reduce((sum, h) => sum + h.vehicles, 0);

    // Format date
    const displayDate = new Date(date + 'T12:00:00');
    const dayOfWeek = displayDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = displayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Header
    drawHeader(doc, {
        logoDataUrl,
        location: studyMeta.location,
        direction: studyMeta.direction,
        dateRange: `${formattedDate} (${dayOfWeek})`,
        counter: studyMeta.counter_number,
        stats: {
            totalVehicles,
            totalViolators: 0,
            violationRate: 0,
            avgSpeed: 0,
            p85Speed: null
        },
        isFirstPage: true
    });

    // Build table
    const headers = ['Hour', 'Vehicles', '% of Total'];
    const colWidths = [40, 60, 60];

    const rows = hourlyData.map(h => {
        const pct = totalVehicles > 0 ? ((h.vehicles / totalVehicles) * 100).toFixed(1) : '-';
        return [h.label, h.vehicles.toLocaleString(), pct + '%'];
    });

    const totalsRow = ['TOTAL', totalVehicles.toLocaleString(), '100%'];

    drawTable(doc, {
        x: 30,
        y: 36,
        headers,
        rows,
        columnWidths: colWidths,
        title: '24-Hour Volume Summary',
        totalsRow
    });
}

/**
 * Generate Daily Speed Bins Table
 */
export function generateDailySpeedBinsTable(doc, data, startDate, endDate, speedLimit, studyMeta, logoDataUrl) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Group data by date
    const dateGroups = new Map();

    data.forEach(row => {
        if (!row.datetime) return;
        const dt = new Date(row.datetime);
        if (dt < start || dt > end) return;

        const dateKey = dt.toISOString().split('T')[0];
        if (!dateGroups.has(dateKey)) {
            dateGroups.set(dateKey, {
                date: dateKey,
                vehicles: 0,
                violators: 0,
                bins: new Array(12).fill(0)
            });
        }

        const group = dateGroups.get(dateKey);
        group.vehicles += row.vehicles || 0;
        group.violators += row.violators || 0;

        // Assign to bin based on avg speed
        if (row.avg_speed && row.vehicles) {
            for (let i = 0; i < SPEED_BINS_12.length; i++) {
                const bin = SPEED_BINS_12[i];
                if (row.avg_speed >= bin.min && (row.avg_speed < bin.max || i === SPEED_BINS_12.length - 1)) {
                    group.bins[i] += row.vehicles;
                    break;
                }
            }
        }
    });

    const days = Array.from(dateGroups.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate totals
    const totalVehicles = days.reduce((sum, d) => sum + d.vehicles, 0);
    const totalViolators = days.reduce((sum, d) => sum + d.violators, 0);
    const totalBins = new Array(12).fill(0);
    days.forEach(d => d.bins.forEach((b, i) => totalBins[i] += b));

    // Header
    const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    drawHeader(doc, {
        logoDataUrl,
        location: studyMeta.location,
        direction: studyMeta.direction,
        dateRange: `${startFormatted} - ${endFormatted}`,
        counter: studyMeta.counter_number,
        speedLimit: studyMeta.speed_limit,
        stats: {
            totalVehicles,
            totalViolators,
            violationRate: totalVehicles > 0 ? (totalViolators / totalVehicles) * 100 : 0,
            avgSpeed: 0,
            p85Speed: calculate85thFromBins(totalBins, SPEED_BINS_12)
        },
        isFirstPage: true
    });

    // Build table
    const headers = ['Date', 'Total', 'Violators', ...SPEED_BINS_12.map(b => b.label)];
    const colWidths = [24, 18, 18, ...SPEED_BINS_12.map(() => 11)];

    const rows = days.map(d => {
        const dt = new Date(d.date + 'T12:00:00');
        const dateLabel = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
        return [dateLabel, d.vehicles.toLocaleString(), d.violators.toLocaleString(), ...d.bins.map(b => b || '-')];
    });

    const totalsRow = ['TOTAL', totalVehicles.toLocaleString(), totalViolators.toLocaleString(), ...totalBins.map(b => b || '-')];

    drawTable(doc, {
        y: 36,
        headers,
        rows,
        columnWidths: colWidths,
        title: 'Daily Speed Distribution',
        totalsRow
    });
}

// ============ Chart Type Helpers ============

/**
 * Draw chart based on type
 */
export function drawChartByType(doc, chartType, data, options = {}) {
    const { x = 15, y = 40, width = 180, height = 100, title = '', speedLimit = 0, showLabels = true } = options;

    switch (chartType) {
        case 'vehicles-violators':
            drawGroupedBarChart(doc, data, {
                x, y, width, height, title,
                series1Key: 'non_speeders',
                series2Key: 'violators',
                series1Label: 'Law-Abiding',
                series2Label: 'Violators',
                series1Color: COLORS.lawAbiding,
                series2Color: COLORS.violators,
                showValues: showLabels
            });
            break;

        case 'pct-speeders':
            drawBarChart(doc, data, {
                x, y, width, height, title,
                valueKey: 'pct_speeders',
                yAxisLabel: '% Speeders',
                color: COLORS.pctSpeeders,
                showValues: showLabels
            });
            break;

        case 'avg-peak-speeds':
            drawLineChart(doc, data, {
                x, y, width, height, title,
                series1Key: 'avg_speed',
                series2Key: 'peak_speed',
                series1Label: 'Avg Speed',
                series2Label: 'Peak Speed',
                series1Color: COLORS.avgSpeed,
                series2Color: COLORS.peakSpeed,
                referenceLine: speedLimit > 0 ? speedLimit : null,
                referenceLabel: speedLimit > 0 ? `${speedLimit} mph` : ''
            });
            break;

        case 'avg-vs-85th':
            drawGroupedBarChart(doc, data, {
                x, y, width, height, title,
                series1Key: 'avg_speed',
                series2Key: 'p85',
                series1Label: 'Avg Speed',
                series2Label: '85th %ile',
                series1Color: COLORS.avgSpeed,
                series2Color: COLORS.percentile85,
                showValues: showLabels
            });
            break;

        case 'volume-only':
            drawBarChart(doc, data, {
                x, y, width, height, title,
                valueKey: 'vehicles',
                yAxisLabel: 'Vehicles',
                color: COLORS.volume,
                showValues: showLabels
            });
            break;
    }
}

export { COLORS, aggregateDaily, aggregateHourly, calculateReportStatistics };
