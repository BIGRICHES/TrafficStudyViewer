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
 * @returns {Promise<Array>} Array of data rows
 */
export async function parseCleanData(csvContent, studyType) {
    const result = await parseCSV(csvContent);

    // Process each row based on study type
    return result.data.map(row => {
        const processed = {
            datetime: parseDateTime(row.datetime),
            vehicles: parseInt(row.vehicles) || 0
        };

        // Speed study fields
        if (row.violators !== undefined) {
            processed.violators = parseInt(row.violators) || 0;
        }
        if (row.avg_speed !== undefined) {
            processed.avg_speed = parseFloat(row.avg_speed) || 0;
        }
        if (row.peak_speed !== undefined) {
            processed.peak_speed = parseFloat(row.peak_speed) || 0;
        }
        if (row.pct_speeders !== undefined) {
            processed.pct_speeders = parseFloat(row.pct_speeders) || 0;
        }
        if (row.sum_avg_speeds !== undefined) {
            processed.sum_avg_speeds = parseFloat(row.sum_avg_speeds) || 0;
        }
        if (row.p85 !== undefined) {
            processed.p85 = parseFloat(row.p85) || 0;
        }

        // Volume fields
        if (row.direction !== undefined) {
            processed.direction = row.direction;
        }

        return processed;
    }).filter(row => row.datetime !== null);
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
