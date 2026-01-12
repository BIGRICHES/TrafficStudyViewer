/**
 * Study index service for loading and querying studies
 */

import * as fileSystem from './fileSystem.js';
import { parseStudyIndex, parseCleanData, parsePerVehicleData } from './csvParser.js';
import { VOLUME_STUDY_TYPES } from '../config.js';

let studyIndex = [];
let studyDataCache = new Map();

/**
 * Load the study index from CSV
 * @returns {Promise<Array>} Array of studies
 */
export async function loadIndex() {
    const csvContent = await fileSystem.readFile('study_index.csv');
    studyIndex = await parseStudyIndex(csvContent);

    // Sort by start date descending (newest first)
    studyIndex.sort((a, b) => {
        const dateA = new Date(a.start_datetime);
        const dateB = new Date(b.start_datetime);
        return dateB - dateA;
    });

    return studyIndex;
}

/**
 * Get all studies
 * @returns {Array}
 */
export function getAll() {
    return studyIndex;
}

/**
 * Get a study by ID
 * @param {string} studyId
 * @returns {Object|undefined}
 */
export function getById(studyId) {
    return studyIndex.find(s => s.study_id === studyId);
}

/**
 * Search and filter studies
 * @param {Object} filters - Filter criteria
 * @returns {Array}
 */
export function search(filters = {}) {
    let results = [...studyIndex];

    // Text search
    if (filters.query) {
        const query = filters.query.toLowerCase();
        results = results.filter(s =>
            s.location.toLowerCase().includes(query) ||
            s.counter_number.toLowerCase().includes(query) ||
            s.study_id.includes(query)
        );
    }

    // Type filter
    if (filters.type) {
        results = results.filter(s => s.study_type === filters.type);
    }

    // Direction filter
    if (filters.direction) {
        results = results.filter(s => s.direction === filters.direction);
    }

    // Date range filter
    if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        results = results.filter(s => new Date(s.start_datetime) >= startDate);
    }
    if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        results = results.filter(s => new Date(s.end_datetime) <= endDate);
    }

    return results;
}

/**
 * Get studies with valid coordinates for map
 * @returns {Array}
 */
export function getWithCoordinates() {
    return studyIndex.filter(s => s.lat !== null && s.lon !== null);
}

/**
 * Get linked studies (same link_group)
 * @param {string} linkGroup
 * @returns {Array}
 */
export function getLinkedStudies(linkGroup) {
    if (!linkGroup) return [];
    const normalizedGroup = String(linkGroup).trim();
    return studyIndex.filter(s => {
        const studyGroup = s.link_group ? String(s.link_group).trim() : '';
        return studyGroup === normalizedGroup;
    });
}

/**
 * Load clean data for a study
 * @param {string} studyId
 * @returns {Promise<Array>}
 */
export async function loadStudyData(studyId) {
    // Check cache first
    if (studyDataCache.has(studyId)) {
        return studyDataCache.get(studyId);
    }

    const study = getById(studyId);
    if (!study) {
        throw new Error(`Study not found: ${studyId}`);
    }

    const filePath = `clean/${studyId}_clean.csv`;
    const csvContent = await fileSystem.readFile(filePath);
    const data = await parseCleanData(csvContent, study.study_type);

    // Cache the result
    studyDataCache.set(studyId, data);

    return data;
}

/**
 * Load raw per-vehicle data for 85th percentile calculation
 * @param {string} studyId
 * @returns {Promise<Array|null>}
 */
export async function loadRawData(studyId) {
    const study = getById(studyId);
    if (!study) return null;

    // Only load raw data for TimeMark Speed studies
    if (study.study_type !== 'TimeMark Speed') return null;

    try {
        // Try to find the raw file
        const files = await fileSystem.listFiles('raw');
        const rawFile = files.find(f => f.startsWith(`${studyId}_`));

        if (!rawFile) return null;

        const csvContent = await fileSystem.readFile(`raw/${rawFile}`);
        return await parsePerVehicleData(csvContent);
    } catch (error) {
        console.warn(`Could not load raw data for study ${studyId}:`, error);
        return null;
    }
}

/**
 * Extract daily 50th and 85th percentiles from raw Radar CSV file.
 *
 * The raw file encodes percentiles in the "Summary" column (column index 7)
 * at fixed row offsets from the header row:
 * - Row +6 from "Time" header = 50th percentile
 * - Row +7 from "Time" header = 85th percentile
 *
 * These values are pre-calculated by the radar device firmware.
 *
 * @param {string} studyId
 * @returns {Promise<Object>} Dict mapping date string -> {p50, p85}
 */
export async function extractRadarPercentiles(studyId) {
    const study = getById(studyId);
    if (!study) return {};

    // Only for Radar studies
    if (study.study_type !== 'Radar') return {};

    try {
        // Try to find the raw file
        const files = await fileSystem.listFiles('raw');
        const rawFile = files.find(f => f.startsWith(`${studyId}_`));

        if (!rawFile) {
            console.log(`No raw file found for Radar study ${studyId}`);
            return {};
        }

        const csvContent = await fileSystem.readFile(`raw/${rawFile}`);
        return parseRadarPercentiles(csvContent);
    } catch (error) {
        console.warn(`Could not extract percentiles for study ${studyId}:`, error);
        return {};
    }
}

/**
 * Parse raw Radar CSV content to extract percentiles
 * @param {string} csvContent
 * @returns {Object} Dict mapping date string -> {p50, p85}
 */
function parseRadarPercentiles(csvContent) {
    const dailyPercentiles = {};
    const lines = csvContent.split('\n');

    let currentDate = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const parts = line.split(',').map(p => p.trim());

        // Check for date line (e.g., "1/6/2025" or "01/06/2025")
        // Date lines typically have the date in the first cell and may have other content
        if (parts[0] && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parts[0])) {
            currentDate = parts[0];
        }

        // Look for the "Time" header row (first column is "Time" or "time")
        if (currentDate && parts[0] && parts[0].toLowerCase() === 'time') {
            // Found header row - extract percentiles at fixed offsets
            let p50 = null;
            let p85 = null;

            // Row +6 from header = 50th percentile (column 7)
            const p50RowIdx = i + 6;
            if (p50RowIdx < lines.length) {
                const p50Parts = lines[p50RowIdx].split(',').map(p => p.trim());
                if (p50Parts.length > 7) {
                    const val = parseFloat(p50Parts[7]);
                    // Sanity check: should be a reasonable speed (1-100 mph)
                    if (!isNaN(val) && val >= 1 && val <= 100) {
                        p50 = val;
                    }
                }
            }

            // Row +7 from header = 85th percentile (column 6)
            const p85RowIdx = i + 7;
            if (p85RowIdx < lines.length) {
                const p85Parts = lines[p85RowIdx].split(',').map(p => p.trim());
                if (p85Parts.length > 6) {
                    const val = parseFloat(p85Parts[6]);
                    // Sanity check: should be a reasonable speed (1-100 mph)
                    if (!isNaN(val) && val >= 1 && val <= 100) {
                        p85 = val;
                    }
                }
            }

            // Store the percentiles for this date
            if (p50 !== null || p85 !== null) {
                // Normalize date to YYYY-MM-DD format for consistency
                const dateParts = currentDate.split('/');
                const normalizedDate = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;

                dailyPercentiles[normalizedDate] = {
                    p50: p50 || 0,
                    p85: p85 || 0
                };
            }

            // Reset for next day
            currentDate = null;
        }
    }

    console.log(`Extracted percentiles for ${Object.keys(dailyPercentiles).length} days`);
    return dailyPercentiles;
}

/**
 * Check if a study is volume-only (no speed data)
 * @param {string} studyType
 * @returns {boolean}
 */
export function isVolumeOnly(studyType) {
    return VOLUME_STUDY_TYPES.includes(studyType);
}

/**
 * Get filter options based on current data
 * @returns {Object}
 */
export function getFilterOptions() {
    const types = [...new Set(studyIndex.map(s => s.study_type))].sort();
    const directions = [...new Set(studyIndex.map(s => s.direction).filter(d => d))].sort();

    return { types, directions };
}

/**
 * Clear the data cache
 */
export function clearCache() {
    studyDataCache.clear();
}

/**
 * Get study count
 * @returns {number}
 */
export function getCount() {
    return studyIndex.length;
}
