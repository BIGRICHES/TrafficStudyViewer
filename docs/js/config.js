/**
 * Application configuration and constants
 */

// Study types
export const STUDY_TYPES = [
    'Radar',
    'TimeMark Speed',
    'TimeMark Volume',
    'JAMAR Tube'
];

// Study types that have speed data
export const SPEED_STUDY_TYPES = ['Radar', 'TimeMark Speed', 'JAMAR Tube'];

// Study types that are volume-only
export const VOLUME_STUDY_TYPES = ['TimeMark Volume'];

// Chart types
export const CHART_TYPES = {
    'vehicles-violators': {
        label: 'Vehicles & Violators',
        requiresSpeed: true
    },
    'pct-speeders': {
        label: '% Speeders',
        requiresSpeed: true
    },
    'avg-peak-speeds': {
        label: 'Average & Peak Speeds',
        requiresSpeed: true
    },
    'avg-vs-85th': {
        label: 'Avg vs 85th Percentile',
        requiresSpeed: true
    },
    'volume-only': {
        label: 'Volume Only',
        requiresSpeed: false
    }
};

// Data table types for report builder
export const DATA_TABLE_TYPES = {
    'speed-summary': {
        label: 'Speed Summary (24-Hour)',
        requiresSpeed: true,
        allowedStudyTypes: ['Radar', 'TimeMark Speed', 'JAMAR Tube'],
        pagesPerDay: 1
    },
    'volume-summary': {
        label: 'Volume Summary (24-Hour)',
        requiresSpeed: false,
        allowedStudyTypes: ['Radar', 'TimeMark Speed', 'TimeMark Volume', 'JAMAR Tube'],
        pagesPerDay: 1
    },
    'daily-speed-bins': {
        label: 'Daily Speed Bins',
        requiresSpeed: true,
        allowedStudyTypes: ['Radar'],  // Radar only - has pre-binned data
        pagesPerDay: 0  // Always 1 page regardless of date range
    }
};

// Chart colors (matching desktop app exactly)
export const CHART_COLORS = {
    lawAbiding: '#5470C6',    // Blue - law-abiding vehicles
    violators: '#EE6666',      // Red - speeders/violators
    pctSpeeders: '#9A60B4',    // Purple - % speeders line/area
    avgSpeed: '#5470C6',       // Blue - average speed
    peakSpeed: '#EE6666',      // Red - peak speed
    percentile85: '#9A60B4',   // Purple - 85th percentile
    speedLimit: '#000000',     // Black - speed limit line (dashed)
    volume: '#5470C6'          // Blue - volume bars
};

// Table colors for PDF report tables
export const TABLE_COLORS = {
    headerBg: '#4472C4',       // Dark blue - table header background
    headerText: '#FFFFFF',     // White - table header text
    totalsBg: '#D9E2F3',       // Light blue - totals row background
    violationBg: '#FFE0E0',    // Light red - speed limit violation highlight
    textNormal: '#000000',     // Black - normal text
    textGray: '#444444',       // Gray - details text
    textBlue: '#2c5282',       // Dark blue - statistics text
    separator: '#aaaaaa'       // Light gray - separator lines
};

// Marker colors by study type
export const MARKER_COLORS = {
    'Radar': '#5470C6',
    'TimeMark Speed': '#91CC75',
    'TimeMark Volume': '#FAC858',
    'JAMAR Tube': '#EE6666'
};

// Default map center (Montgomery, AL)
export const MAP_CENTER = {
    lat: 32.3668,
    lon: -86.3000,
    zoom: 11
};

// Index fields
export const INDEX_FIELDS = [
    'study_id',
    'file_path',
    'study_type',
    'counter_number',
    'location',
    'direction',
    'speed_limit',
    'start_datetime',
    'end_datetime',
    'lat',
    'lon',
    'link_group'
];

// IndexedDB configuration
export const DB_NAME = 'TrafficStudyViewer';
export const DB_VERSION = 1;
export const STORE_NAME = 'appData';
