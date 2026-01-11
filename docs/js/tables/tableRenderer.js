/**
 * Table renderer for PDF report generation
 * Renders data tables to canvas for inclusion in jsPDF
 */

import { TABLE_COLORS } from '../config.js';
import {
    aggregateBy24Hour,
    SPEED_BINS_8,
    SPEED_BINS_12,
    calculateSpeedBins,
    calculate85thFromBins,
    calculate50thFromBins,
    formatNumber,
    formatDecimal
} from '../utils/stats.js';

// Resolution scale for crisp rendering
const SCALE = 2;

// Canvas dimensions - larger for better PDF quality
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2600;

/**
 * Render a Speed Summary (24-Hour) table to a canvas
 */
export function renderSpeedSummaryTable(data, date, speedLimit, studyMeta, logoDataUrl = null) {
    // Filter data for the specific date
    const dateData = data.filter(row => {
        if (!row.datetime) return false;
        const rowDate = new Date(row.datetime).toISOString().split('T')[0];
        return rowDate === date;
    });

    // Aggregate by 24 hours
    const hourlyData = aggregateBy24Hour(dateData);

    // Calculate totals and speed bins - use weighted approach instead of individual speeds
    let totalVehicles = 0;
    let totalViolators = 0;
    let totalSumSpeeds = 0;
    let totalSpeedCount = 0;

    // Calculate speed bins by assigning vehicles to bins based on average speed
    const totalSpeedBins = new Array(8).fill(0);
    const hourlyBins = [];  // Store bins for each hour

    hourlyData.forEach(h => {
        totalVehicles += h.vehicles;
        totalViolators += h.violators || 0;

        // Calculate bin for this hour
        const hourBins = new Array(8).fill(0);
        if (h.avgSpeed !== null && h.vehicles > 0) {
            totalSumSpeeds += h.avgSpeed * h.vehicles;
            totalSpeedCount += h.vehicles;

            // Assign vehicles to the appropriate bin based on average speed
            for (let i = 0; i < SPEED_BINS_8.length; i++) {
                const bin = SPEED_BINS_8[i];
                if (h.avgSpeed >= bin.min && (h.avgSpeed < bin.max || i === SPEED_BINS_8.length - 1)) {
                    hourBins[i] = h.vehicles;
                    totalSpeedBins[i] += h.vehicles;
                    break;
                }
            }
        }
        hourlyBins.push(hourBins);
    });

    const totalAvgSpeed = totalSpeedCount > 0 ? totalSumSpeeds / totalSpeedCount : null;
    const p85 = calculate85thFromBins(totalSpeedBins, SPEED_BINS_8);

    // Create canvas - larger dimensions for better PDF quality
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const WIDTH = CANVAS_WIDTH;
    const HEIGHT = CANVAS_HEIGHT;
    canvas.width = WIDTH * SCALE;
    canvas.height = HEIGHT * SCALE;
    ctx.scale(SCALE, SCALE);

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Format date for display
    const displayDate = new Date(date + 'T12:00:00');
    const dayOfWeek = displayDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = displayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Draw header
    drawTableHeader(ctx, studyMeta, `${formattedDate} (${dayOfWeek})`, '24-Hour Speed Summary', {
        totalVehicles,
        totalViolators,
        avgSpeed: totalAvgSpeed,
        p85Speed: p85 > 0 ? p85 : null
    }, speedLimit, logoDataUrl, WIDTH);

    // Table settings - adjusted for larger canvas
    const tableTop = 300;
    const rowHeight = 80;
    const fontSize = 28;

    // Column definitions matching original program
    const cols = ['Hour', 'Total', '1-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70+', 'Avg\nmph'];
    const colWidths = [130, 110, 100, 100, 100, 100, 100, 100, 100, 100, 110];
    const totalTableWidth = colWidths.reduce((a, b) => a + b, 0);
    const tableLeft = (WIDTH - totalTableWidth) / 2;

    // Draw table header row
    ctx.fillStyle = TABLE_COLORS.headerBg;
    ctx.fillRect(tableLeft, tableTop, totalTableWidth, rowHeight);

    ctx.fillStyle = TABLE_COLORS.headerText;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let x = tableLeft;
    cols.forEach((col, i) => {
        ctx.fillText(col, x + colWidths[i] / 2, tableTop + rowHeight / 2);
        x += colWidths[i];
    });

    // Draw data rows
    ctx.font = `${fontSize - 2}px Arial`;
    for (let hour = 0; hour < 24; hour++) {
        const y = tableTop + rowHeight * (hour + 1);
        const h = hourlyData[hour];

        // Alternate row background
        if (hour % 2 === 0) {
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(tableLeft, y, totalTableWidth, rowHeight);
        }

        // Draw cell border
        ctx.strokeStyle = '#dee2e6';
        ctx.lineWidth = 1;
        ctx.strokeRect(tableLeft, y, totalTableWidth, rowHeight);

        // Use pre-calculated bins for this hour
        const hourBins = hourlyBins[hour];

        // Draw cell values
        ctx.fillStyle = TABLE_COLORS.textNormal;
        x = tableLeft;

        // Hour (00:00 format)
        ctx.textAlign = 'center';
        ctx.fillText(`${hour.toString().padStart(2, '0')}:00`, x + colWidths[0] / 2, y + rowHeight / 2);
        x += colWidths[0];

        // Total
        ctx.fillText(h.vehicles.toString(), x + colWidths[1] / 2, y + rowHeight / 2);
        x += colWidths[1];

        // Speed bins (8 columns)
        for (let i = 0; i < 8; i++) {
            ctx.fillText(hourBins[i].toString(), x + colWidths[2 + i] / 2, y + rowHeight / 2);
            x += colWidths[2 + i];
        }

        // Avg Speed
        ctx.fillText(h.avgSpeed !== null ? h.avgSpeed.toFixed(1) : '-', x + colWidths[10] / 2, y + rowHeight / 2);
    }

    // Draw totals row
    const totalsY = tableTop + rowHeight * 25;
    ctx.fillStyle = TABLE_COLORS.totalsBg;
    ctx.fillRect(tableLeft, totalsY, totalTableWidth, rowHeight);

    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, totalsY, totalTableWidth, rowHeight);

    ctx.font = `bold ${fontSize - 2}px Arial`;
    ctx.fillStyle = TABLE_COLORS.textNormal;
    x = tableLeft;

    ctx.fillText('TOTAL', x + colWidths[0] / 2, totalsY + rowHeight / 2);
    x += colWidths[0];
    ctx.fillText(totalVehicles.toString(), x + colWidths[1] / 2, totalsY + rowHeight / 2);
    x += colWidths[1];

    // Total speed bins - use pre-calculated totals
    for (let i = 0; i < 8; i++) {
        ctx.fillText(totalSpeedBins[i].toString(), x + colWidths[2 + i] / 2, totalsY + rowHeight / 2);
        x += colWidths[2 + i];
    }

    ctx.fillText(totalAvgSpeed !== null ? totalAvgSpeed.toFixed(1) : '-', x + colWidths[10] / 2, totalsY + rowHeight / 2);

    return canvas;
}

/**
 * Render a Volume Summary (24-Hour) table to a canvas
 */
export function renderVolumeSummaryTable(data, date, studyMeta, logoDataUrl = null) {
    // Filter data for the specific date
    const dateData = data.filter(row => {
        if (!row.datetime) return false;
        const rowDate = new Date(row.datetime).toISOString().split('T')[0];
        return rowDate === date;
    });

    // Aggregate by 24 hours
    const hourlyData = aggregateBy24Hour(dateData);

    // Calculate total
    const totalVehicles = hourlyData.reduce((sum, h) => sum + h.vehicles, 0);

    // Create canvas - larger dimensions
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const WIDTH = CANVAS_WIDTH;
    const HEIGHT = CANVAS_HEIGHT;
    canvas.width = WIDTH * SCALE;
    canvas.height = HEIGHT * SCALE;
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Format date for display
    const displayDate = new Date(date + 'T12:00:00');
    const dayOfWeek = displayDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = displayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Draw header
    drawTableHeader(ctx, studyMeta, `${formattedDate} (${dayOfWeek})`, '24-Hour Volume Summary', {
        totalVehicles
    }, null, logoDataUrl, WIDTH);

    // Table settings - adjusted for larger canvas
    const tableTop = 300;
    const rowHeight = 80;
    const fontSize = 30;
    const cols = ['Hour', 'Volume'];
    const colWidths = [250, 250];
    const tableLeft = (WIDTH - colWidths.reduce((a, b) => a + b, 0)) / 2;

    // Draw table header
    ctx.fillStyle = TABLE_COLORS.headerBg;
    ctx.fillRect(tableLeft, tableTop, colWidths.reduce((a, b) => a + b, 0), rowHeight);

    ctx.fillStyle = TABLE_COLORS.headerText;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let x = tableLeft;
    cols.forEach((col, i) => {
        ctx.fillText(col, x + colWidths[i] / 2, tableTop + rowHeight / 2);
        x += colWidths[i];
    });

    // Draw data rows
    ctx.font = `${fontSize - 2}px Arial`;
    for (let hour = 0; hour < 24; hour++) {
        const y = tableTop + rowHeight * (hour + 1);
        const h = hourlyData[hour];

        if (hour % 2 === 0) {
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(tableLeft, y, colWidths.reduce((a, b) => a + b, 0), rowHeight);
        }

        ctx.strokeStyle = '#dee2e6';
        ctx.lineWidth = 1;
        ctx.strokeRect(tableLeft, y, colWidths.reduce((a, b) => a + b, 0), rowHeight);

        ctx.fillStyle = TABLE_COLORS.textNormal;
        x = tableLeft;

        ctx.fillText(`${hour.toString().padStart(2, '0')}:00`, x + colWidths[0] / 2, y + rowHeight / 2);
        x += colWidths[0];
        ctx.fillText(h.vehicles.toString(), x + colWidths[1] / 2, y + rowHeight / 2);
    }

    // Draw totals row
    const totalsY = tableTop + rowHeight * 25;
    ctx.fillStyle = TABLE_COLORS.totalsBg;
    ctx.fillRect(tableLeft, totalsY, colWidths.reduce((a, b) => a + b, 0), rowHeight);

    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, totalsY, colWidths.reduce((a, b) => a + b, 0), rowHeight);

    ctx.font = `bold ${fontSize - 2}px Arial`;
    ctx.fillStyle = TABLE_COLORS.textNormal;
    x = tableLeft;

    ctx.fillText('TOTAL', x + colWidths[0] / 2, totalsY + rowHeight / 2);
    x += colWidths[0];
    ctx.fillText(totalVehicles.toString(), x + colWidths[1] / 2, totalsY + rowHeight / 2);

    return canvas;
}

/**
 * Render a Daily Speed Bins table to a canvas
 * All days fit on one page with 12 speed bins
 */
export function renderDailySpeedBinsTable(data, startDate, endDate, speedLimit, studyMeta, logoDataUrl = null) {
    // Parse dates carefully to avoid timezone issues
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');

    // Group data by date - use weighted bin calculation instead of individual speeds
    const dateGroups = new Map();

    // Initialize all dates in range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dateGroups.set(dateStr, {
            date: dateStr,
            dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
            vehicles: 0,
            violators: 0,
            // Store weighted speed data for bin estimation
            speedSum: 0,
            speedCount: 0,
            // Pre-calculated bins (approximation based on average speeds)
            bins: new Array(12).fill(0)
        });
    }

    // Populate with actual data - estimate bin distribution from avg_speed
    for (const row of data) {
        if (!row.datetime) continue;
        const rowDate = new Date(row.datetime).toISOString().split('T')[0];
        if (dateGroups.has(rowDate)) {
            const group = dateGroups.get(rowDate);
            const vehicles = row.vehicles || 0;
            group.vehicles += vehicles;
            group.violators += row.violators || 0;

            if (row.avg_speed && vehicles > 0) {
                group.speedSum += row.avg_speed * vehicles;
                group.speedCount += vehicles;

                // Assign all vehicles from this interval to the appropriate bin
                // This is an approximation since we only have the average speed
                const avgSpeed = row.avg_speed;
                for (let i = 0; i < SPEED_BINS_12.length; i++) {
                    const bin = SPEED_BINS_12[i];
                    if (avgSpeed >= bin.min && (avgSpeed < bin.max || i === SPEED_BINS_12.length - 1)) {
                        group.bins[i] += vehicles;
                        break;
                    }
                }
            }
        }
    }

    const days = Array.from(dateGroups.values());
    const numDays = days.length;

    // Create canvas - wider for the many columns, larger for better quality
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const WIDTH = 2400;
    const HEIGHT = 1800;
    canvas.width = WIDTH * SCALE;
    canvas.height = HEIGHT * SCALE;
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Calculate totals
    const totalVehicles = days.reduce((sum, d) => sum + d.vehicles, 0);
    const totalViolators = days.reduce((sum, d) => sum + d.violators, 0);

    // Draw header
    const startFormatted = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const endFormatted = end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    drawTableHeader(ctx, studyMeta, `${startFormatted} - ${endFormatted}`, 'Daily Speed Bins', {
        totalVehicles,
        totalViolators,
        violationRate: totalVehicles > 0 ? (totalViolators / totalVehicles) * 100 : 0
    }, speedLimit, logoDataUrl, WIDTH);

    // Table settings - dynamic based on number of days
    const tableTop = 220;
    const availableHeight = HEIGHT - tableTop - 60;
    const rowHeight = Math.min(50, Math.max(30, availableHeight / (numDays + 2)));
    const fontSize = rowHeight > 40 ? 18 : (rowHeight > 32 ? 16 : 14);

    // Column widths for 12 speed bins plus other columns
    const dateColWidth = 70;
    const dayColWidth = 50;
    const binColWidth = 55;
    const totalColWidth = 65;
    const violatorsColWidth = 75;
    const p50ColWidth = 45;
    const p85ColWidth = 45;

    const totalTableWidth = dateColWidth + dayColWidth + (binColWidth * 12) + totalColWidth + violatorsColWidth + p50ColWidth + p85ColWidth;
    const tableLeft = (WIDTH - totalTableWidth) / 2;

    // Draw table header row
    ctx.fillStyle = TABLE_COLORS.headerBg;
    ctx.fillRect(tableLeft, tableTop, totalTableWidth, rowHeight);

    ctx.fillStyle = TABLE_COLORS.headerText;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let x = tableLeft;
    ctx.fillText('Date', x + dateColWidth / 2, tableTop + rowHeight / 2);
    x += dateColWidth;
    ctx.fillText('Day', x + dayColWidth / 2, tableTop + rowHeight / 2);
    x += dayColWidth;

    // Speed bin headers - highlight violations
    SPEED_BINS_12.forEach((bin, i) => {
        const isViolation = bin.min > speedLimit;
        if (isViolation) {
            ctx.fillStyle = TABLE_COLORS.violationBg;
            ctx.fillRect(x, tableTop, binColWidth, rowHeight);
            ctx.fillStyle = TABLE_COLORS.headerBg;
            ctx.fillRect(x, tableTop, binColWidth, 3); // Top border
        }
        ctx.fillStyle = TABLE_COLORS.headerText;
        ctx.fillText(bin.label, x + binColWidth / 2, tableTop + rowHeight / 2);
        x += binColWidth;
    });

    ctx.fillText('Total', x + totalColWidth / 2, tableTop + rowHeight / 2);
    x += totalColWidth;
    ctx.fillText('Viol.', x + violatorsColWidth / 2, tableTop + rowHeight / 2);
    x += violatorsColWidth;
    ctx.fillText('50th', x + p50ColWidth / 2, tableTop + rowHeight / 2);
    x += p50ColWidth;
    ctx.fillText('85th', x + p85ColWidth / 2, tableTop + rowHeight / 2);

    // Draw data rows
    ctx.font = `${fontSize}px Arial`;
    days.forEach((day, rowIndex) => {
        const y = tableTop + rowHeight * (rowIndex + 1);

        // Alternate row background
        if (rowIndex % 2 === 0) {
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(tableLeft, y, totalTableWidth, rowHeight);
        }

        // Use pre-calculated bins from data aggregation
        const bins = day.bins;
        const p50 = day.vehicles > 0 ? calculate50thFromBins(bins, SPEED_BINS_12) : 0;
        const p85 = day.vehicles > 0 ? calculate85thFromBins(bins, SPEED_BINS_12) : 0;

        // Draw cell values
        ctx.fillStyle = TABLE_COLORS.textNormal;
        x = tableLeft;

        // Date (MM/DD format)
        const dateParts = day.date.split('-');
        ctx.fillText(`${dateParts[1]}/${dateParts[2]}`, x + dateColWidth / 2, y + rowHeight / 2);
        x += dateColWidth;

        // Day name
        ctx.fillText(day.dayName, x + dayColWidth / 2, y + rowHeight / 2);
        x += dayColWidth;

        // Speed bins with violation highlighting
        bins.forEach((count, i) => {
            const isViolation = SPEED_BINS_12[i].min > speedLimit;
            if (isViolation) {
                ctx.fillStyle = TABLE_COLORS.violationBg;
                ctx.fillRect(x, y, binColWidth, rowHeight);
            }
            ctx.fillStyle = TABLE_COLORS.textNormal;
            ctx.fillText(count.toString(), x + binColWidth / 2, y + rowHeight / 2);
            x += binColWidth;
        });

        // Total
        ctx.fillText(day.vehicles.toString(), x + totalColWidth / 2, y + rowHeight / 2);
        x += totalColWidth;

        // Violators
        ctx.fillText(day.violators.toString(), x + violatorsColWidth / 2, y + rowHeight / 2);
        x += violatorsColWidth;

        // 50th percentile
        ctx.fillText(day.vehicles > 0 ? p50.toString() : '-', x + p50ColWidth / 2, y + rowHeight / 2);
        x += p50ColWidth;

        // 85th percentile
        ctx.fillText(day.vehicles > 0 ? p85.toString() : '-', x + p85ColWidth / 2, y + rowHeight / 2);

        // Draw row border
        ctx.strokeStyle = '#dee2e6';
        ctx.lineWidth = 1;
        ctx.strokeRect(tableLeft, y, totalTableWidth, rowHeight);
    });

    // Draw totals row
    const totalsY = tableTop + rowHeight * (numDays + 1);
    ctx.fillStyle = TABLE_COLORS.totalsBg;
    ctx.fillRect(tableLeft, totalsY, totalTableWidth, rowHeight);

    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, totalsY, totalTableWidth, rowHeight);

    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = TABLE_COLORS.textNormal;
    x = tableLeft;

    ctx.fillText('TOTAL', x + dateColWidth / 2, totalsY + rowHeight / 2);
    x += dateColWidth + dayColWidth;

    // Total bins across all days - use pre-calculated bins
    const totalBins = new Array(12).fill(0);
    days.forEach(day => {
        day.bins.forEach((count, i) => totalBins[i] += count);
    });

    totalBins.forEach((count, i) => {
        const isViolation = SPEED_BINS_12[i].min > speedLimit;
        if (isViolation) {
            ctx.fillStyle = TABLE_COLORS.violationBg;
            ctx.fillRect(x, totalsY, binColWidth, rowHeight);
        }
        ctx.fillStyle = TABLE_COLORS.textNormal;
        ctx.fillText(count.toString(), x + binColWidth / 2, totalsY + rowHeight / 2);
        x += binColWidth;
    });

    ctx.fillText(totalVehicles.toString(), x + totalColWidth / 2, totalsY + rowHeight / 2);
    x += totalColWidth;
    ctx.fillText(totalViolators.toString(), x + violatorsColWidth / 2, totalsY + rowHeight / 2);
    x += violatorsColWidth;
    ctx.fillText('--', x + p50ColWidth / 2, totalsY + rowHeight / 2);
    x += p50ColWidth;
    ctx.fillText('--', x + p85ColWidth / 2, totalsY + rowHeight / 2);

    return canvas;
}

/**
 * Draw table header with logo, study info and statistics
 */
function drawTableHeader(ctx, studyMeta, dateInfo, tableType, stats, speedLimit, logoDataUrl, canvasWidth) {
    const leftMargin = 60;

    // Draw logo if available
    let textStartX = leftMargin;
    if (logoDataUrl) {
        try {
            const logoImg = new Image();
            logoImg.src = logoDataUrl;
            ctx.drawImage(logoImg, leftMargin, 30, 120, 120);
            textStartX = leftMargin + 140;
        } catch (e) {
            console.warn('Could not draw logo:', e);
        }
    }

    // Title - larger font
    ctx.fillStyle = TABLE_COLORS.textNormal;
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const location = studyMeta?.location || 'Unknown Location';
    const direction = studyMeta?.direction ? ` - ${studyMeta.direction}` : '';
    ctx.fillText(`${tableType}: ${location}${direction}`, textStartX, 45);

    // Date and speed limit line - larger font
    ctx.font = '24px Arial';
    ctx.fillStyle = TABLE_COLORS.textGray;
    let detailsLine = `Date: ${dateInfo}`;
    if (speedLimit) {
        detailsLine += `   •   Speed Limit: ${speedLimit} mph`;
    }
    ctx.fillText(detailsLine, textStartX, 100);

    // Statistics line (bold, blue) - larger font
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = TABLE_COLORS.textBlue;

    let statsText = `Total Vehicles: ${stats.totalVehicles?.toLocaleString() || 0}`;
    if (stats.totalViolators !== undefined) {
        const pct = stats.violationRate !== undefined ? stats.violationRate :
            (stats.totalVehicles > 0 ? (stats.totalViolators / stats.totalVehicles) * 100 : 0);
        statsText += `   •   Violators: ${stats.totalViolators.toLocaleString()} (${pct.toFixed(1)}%)`;
    }
    if (stats.avgSpeed !== undefined && stats.avgSpeed !== null) {
        statsText += `   •   Avg Speed: ${stats.avgSpeed.toFixed(1)} mph`;
    }
    if (stats.p85Speed !== undefined && stats.p85Speed !== null) {
        statsText += `   •   85th Percentile: ${Math.round(stats.p85Speed)} mph`;
    }

    ctx.fillText(statsText, textStartX, 145);

    // Separator line
    ctx.strokeStyle = TABLE_COLORS.separator;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftMargin, 200);
    ctx.lineTo(canvasWidth - leftMargin, 200);
    ctx.stroke();
}
