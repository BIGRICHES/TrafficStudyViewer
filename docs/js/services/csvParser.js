/**
 * CSV parsing service using Papa Parse
 */

/**
 * Parse CSV content
 * @param {string} csvContent - Raw CSV text
 * @param {Object} options - Papa Parse options
 * @returns {Promise<Object>} Parsed result with data and meta
 */
export function parseCSV(csvContent, options = {}) {
    return new Promise((resolve, reject) => {
        const defaultOptions = {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
            ...options
        };

        const result = Papa.parse(csvContent, defaultOptions);

        if (result.errors.length > 0) {
            console.warn('CSV parsing warnings:', result.errors);
        }

        resolve(result);
    });
}

/**
 * Parse study index CSV
 * @param {string} csvContent - Raw CSV text
 * @returns {Promise<Array>} Array of study objects
 */
export async function parseStudyIndex(csvContent) {
    const result = await parseCSV(csvContent, {
        transformHeader: (header) => header.trim()
    });

    // Process each row
    return result.data.map(row => ({
        study_id: String(row.study_id ?? ''),
        file_path: row.file_path || '',
        study_type: row.study_type || '',
        counter_number: String(row.counter_number ?? ''),
        location: row.location || '',
        direction: normalizeDirection(row.direction || ''),
        speed_limit: parseFloat(row.speed_limit) || 0,
        start_datetime: row.start_datetime || '',
        end_datetime: row.end_datetime || '',
        lat: parseCoordinate(row.lat),
        lon: parseCoordinate(row.lon),
        link_group: row.link_group || ''
    }));
}

/**
 * Parse clean data CSV for a study
 * @param {string} csvContent - Raw CSV text
 * @param {string} studyType - Type of study
 * @param {number} speedLimit - Speed limit for calculating violators (for per-vehicle data)
 * @returns {Promise<Array>} Array of data rows
 */
export async function parseCleanData(csvContent, studyType, speedLimit = 0) {
    const result = await parseCSV(csvContent);

    if (result.data.length === 0) {
        return [];
    }

    const firstRow = result.data[0];
    const isPerVehicleData = firstRow.speed !== undefined && firstRow.vehicles === undefined;

    if (isPerVehicleData) {
        return aggregatePerVehicleData(result.data, speedLimit);
    }

    // Process interval-aggregated data (Radar, JAMAR, etc.)
    const processedRows = result.data.map(row => {
        const rowData = {
            datetime: parseDateTime(row.datetime),
            vehicles: parseInt(row.vehicles) || 0
        };

        // Speed study fields
        if (row.violators !== undefined) {
            rowData.violators = parseInt(row.violators) || 0;
        }
        if (row.avg_speed !== undefined) {
            rowData.avg_speed = parseFloat(row.avg_speed) || 0;
        }
        if (row.peak_speed !== undefined) {
            rowData.peak_speed = parseFloat(row.peak_speed) || 0;
        }
        if (row.pct_speeders !== undefined) {
            rowData.pct_speeders = parseFloat(row.pct_speeders) || 0;
        }
        if (row.sum_avg_speeds !== undefined) {
            rowData.sum_avg_speeds = parseFloat(row.sum_avg_speeds) || 0;
        }
        if (row.p85 !== undefined) {
            rowData.p85 = parseFloat(row.p85) || 0;
        }

        // Volume fields
        if (row.direction !== undefined) {
            rowData.direction = row.direction;
        }

        return rowData;
    });

    return processedRows.filter(row => row.datetime !== null);
}

/**
 * Aggregate per-vehicle data into hourly intervals
 * @param {Array} rawData - Per-vehicle data rows
 * @param {number} speedLimit - Speed limit for determining violators
 * @returns {Array} Aggregated interval data
 */
function aggregatePerVehicleData(rawData, speedLimit) {
    const hourlyBuckets = new Map();

    for (const row of rawData) {
        const datetime = parseDateTime(row.datetime);
        if (!datetime) continue;

        const speed = parseFloat(row.speed) || 0;
        if (speed <= 0) continue;

        // Create hourly bucket key
        const dt = new Date(datetime);
        const hourKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}`;

        if (!hourlyBuckets.has(hourKey)) {
            hourlyBuckets.set(hourKey, {
                datetime: new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours()),
                speeds: [],
                violatorCount: 0
            });
        }

        const bucket = hourlyBuckets.get(hourKey);
        bucket.speeds.push(speed);
        if (speedLimit > 0 && speed > speedLimit) {
            bucket.violatorCount++;
        }
    }

    // Convert buckets to interval format
    const intervals = [];
    for (const [key, bucket] of hourlyBuckets) {
        const vehicles = bucket.speeds.length;
        const violators = bucket.violatorCount;
        const avgSpeed = bucket.speeds.reduce((a, b) => a + b, 0) / vehicles;
        const peakSpeed = Math.max(...bucket.speeds);

        // Calculate 85th percentile
        const sortedSpeeds = [...bucket.speeds].sort((a, b) => a - b);
        const p85Index = Math.ceil(0.85 * sortedSpeeds.length) - 1;
        const p85 = sortedSpeeds[Math.max(0, p85Index)];

        intervals.push({
            datetime: bucket.datetime,
            vehicles,
            violators,
            avg_speed: avgSpeed,
            peak_speed: peakSpeed,
            pct_speeders: vehicles > 0 ? (violators / vehicles) * 100 : 0,
            p85
        });
    }

    // Sort by datetime
    intervals.sort((a, b) => a.datetime - b.datetime);

    return intervals;
}

/**
 * Parse per-vehicle data (for TimeMark Speed)
 * @param {string} csvContent - Raw CSV text
 * @returns {Promise<Array>} Array of per-vehicle records
 */
export async function parsePerVehicleData(csvContent) {
    const result = await parseCSV(csvContent);

    return result.data.map(row => ({
        datetime: parseDateTime(row.datetime || row['date/time']),
        speed: parseFloat(row.speed) || 0,
        axles: parseInt(row.axles) || 0,
        vehicle_class: parseInt(row.vehicle_class || row.class) || 0,
        channel: row.channel || '',
        direction: row.direction || ''
    })).filter(row => row.datetime !== null && row.speed > 0);
}

/**
 * Normalize direction string
 * @param {string} direction - Raw direction string
 * @returns {string} Normalized direction
 */
function normalizeDirection(direction) {
    if (!direction) return '';

    const dir = direction.toLowerCase().trim();

    if (dir.includes('north')) return 'Northbound';
    if (dir.includes('south')) return 'Southbound';
    if (dir.includes('east')) return 'Eastbound';
    if (dir.includes('west')) return 'Westbound';

    // Return original with first letter capitalized
    return direction.charAt(0).toUpperCase() + direction.slice(1);
}

/**
 * Parse coordinate value
 * @param {any} value - Raw coordinate value
 * @returns {number|null}
 */
function parseCoordinate(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value);
    if (isNaN(num) || num === 0) return null;
    return num;
}

/**
 * Parse datetime string
 * @param {string} value - DateTime string
 * @returns {Date|null}
 */
function parseDateTime(value) {
    if (!value) return null;

    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return null;
        return date;
    } catch {
        return null;
    }
}
