/**
 * Main application entry point
 */

import * as fileSystem from './services/fileSystem.js';
import * as storage from './services/storage.js';
import * as studyIndex from './services/studyIndex.js';
import { createChart, destroyChart, updateChartTheme } from './charts/chartFactory.js';
import { calculateStats, formatNumber, formatDecimal, calculateReportStatistics, aggregateDaily, aggregateHourly } from './utils/stats.js';
import { formatDateRange, formatDate } from './utils/dateUtils.js';
import { MARKER_COLORS, MAP_CENTER, VOLUME_STUDY_TYPES, DATA_TABLE_TYPES, CHART_COLORS, CHART_TYPES } from './config.js';
import * as pdfGen from './pdf/pdfGenerator.js';

// ============ Utilities ============

// Debounce function - must be defined early as it's used in setupEventListeners
function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

// ============ State ============
let currentStudy = null;
let currentStudyData = null;
let filteredStudyData = null;
let extractedPercentiles = null; // For Radar studies - extracted from raw file
let map = null;
let markersLayer = null;
let streetLayer = null;
let satelliteLayer = null;
let isSatelliteView = false;
let studyMarkers = new Map(); // Map study_id to marker for zooming
let expandedLinkGroup = null; // Currently expanded linked group markers
let expandedMarkers = []; // Temporary markers for expanded linked studies
let skipMapFitBounds = false; // Flag to prevent fitBounds when clearing selection
let isDarkTheme = false;
let expandedGroups = new Set();

// ============ DOM Elements ============
const elements = {
    // Screens
    folderScreen: document.getElementById('folder-screen'),
    appScreen: document.getElementById('app-screen'),
    browserWarning: document.getElementById('browser-warning'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingMessage: document.getElementById('loading-message'),

    // Folder picker
    selectFolderBtn: document.getElementById('select-folder-btn'),
    clearFolderBtn: document.getElementById('clear-folder-btn'),
    changeFolderBtn: document.getElementById('change-folder-btn'),
    folderStatus: document.getElementById('folder-status'),

    // Header
    themeToggleBtn: document.getElementById('theme-toggle-btn'),

    // Sidebar
    searchInput: document.getElementById('search-input'),
    filterType: document.getElementById('filter-type'),
    filterDate: document.getElementById('filter-date'),
    studyList: document.getElementById('study-list'),

    // Tabs
    tabs: document.querySelectorAll('.tab'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Charts
    chartPlaceholder: document.getElementById('chart-placeholder'),
    chartContainer: document.getElementById('chart-container'),
    chartCanvas: document.getElementById('main-chart'),
    chartTypeSelect: document.getElementById('chart-type-select'),
    timeAggSelect: document.getElementById('time-agg-select'),
    chartStartDate: document.getElementById('chart-start-date'),
    chartEndDate: document.getElementById('chart-end-date'),
    resetDateRangeBtn: document.getElementById('reset-date-range-btn'),
    chartWarning: document.getElementById('chart-warning'),

    // Study info
    studyTitle: document.getElementById('study-title'),
    studyTypeBadge: document.getElementById('study-type-badge'),
    studyCounterNumber: document.getElementById('study-counter-number'),
    studyDirection: document.getElementById('study-direction'),
    studyDates: document.getElementById('study-dates'),
    studySpeedLimit: document.getElementById('study-speed-limit'),

    // Stats
    statTotal: document.getElementById('stat-total'),
    statViolators: document.getElementById('stat-violators'),
    statPct: document.getElementById('stat-pct'),
    statAvgSpeed: document.getElementById('stat-avg-speed'),
    stat85th: document.getElementById('stat-85th'),
    statPeak: document.getElementById('stat-peak'),

    // Map
    mapContainer: document.getElementById('map-container'),

    // Reports - Advanced Builder
    reportTitle: document.getElementById('report-title'),
    addChartBtn: document.getElementById('add-chart-btn'),
    reportItemsList: document.getElementById('report-items-list'),
    reportChartsPerPage: document.getElementById('report-charts-per-page'),
    pageCountDisplay: document.getElementById('page-count-display'),
    generateReportBtn: document.getElementById('generate-report-btn'),
    reportStatus: document.getElementById('report-status'),

    // Chart Modal
    chartModal: document.getElementById('chart-modal'),
    chartModalTitle: document.getElementById('chart-modal-title'),
    closeChartModal: document.getElementById('close-chart-modal'),
    cancelChartModal: document.getElementById('cancel-chart-modal'),
    saveChartModal: document.getElementById('save-chart-modal'),
    chartStudySearch: document.getElementById('chart-study-search'),
    chartStudyList: document.getElementById('chart-study-list'),
    chartSelectedStudy: document.getElementById('chart-selected-study'),
    chartModalType: document.getElementById('chart-modal-type'),
    chartModalTimeAgg: document.getElementById('chart-modal-time-agg'),
    chartModalFullRange: document.getElementById('chart-modal-full-range'),
    chartModalDateRange: document.getElementById('chart-modal-date-range'),
    chartModalStartDate: document.getElementById('chart-modal-start-date'),
    chartModalStartTime: document.getElementById('chart-modal-start-time'),
    chartModalEndDate: document.getElementById('chart-modal-end-date'),
    chartModalEndTime: document.getElementById('chart-modal-end-time'),
    chartModalShowLabels: document.getElementById('chart-modal-show-labels'),
    chartModalEachDay: document.getElementById('chart-modal-each-day'),

    // Presets
    presetSelect: document.getElementById('preset-select'),
    applyPresetBtn: document.getElementById('apply-preset-btn'),
    savePresetBtn: document.getElementById('save-preset-btn'),
    managePresetsBtn: document.getElementById('manage-presets-btn'),
    clearReportBtn: document.getElementById('clear-report-btn'),

    // Preset Modal
    presetModal: document.getElementById('preset-modal'),
    closePresetModal: document.getElementById('close-preset-modal'),
    closePresetModalBtn: document.getElementById('close-preset-modal-btn'),
    presetList: document.getElementById('preset-list'),

    // Save Preset Modal
    savePresetModal: document.getElementById('save-preset-modal'),
    savePresetModalTitle: document.getElementById('save-preset-modal-title'),
    closeSavePresetModal: document.getElementById('close-save-preset-modal'),
    cancelSavePreset: document.getElementById('cancel-save-preset'),
    confirmSavePreset: document.getElementById('confirm-save-preset'),
    presetNameInput: document.getElementById('preset-name-input'),

    // Data Table Modal
    addTableBtn: document.getElementById('add-table-btn'),
    tableModal: document.getElementById('table-modal'),
    tableModalTitle: document.getElementById('table-modal-title'),
    closeTableModal: document.getElementById('close-table-modal'),
    cancelTableModal: document.getElementById('cancel-table-modal'),
    saveTableModal: document.getElementById('save-table-modal'),
    tableStudySearch: document.getElementById('table-study-search'),
    tableStudyList: document.getElementById('table-study-list'),
    tableSelectedStudy: document.getElementById('table-selected-study'),
    tableModalType: document.getElementById('table-modal-type'),
    tableModalStartDate: document.getElementById('table-modal-start-date'),
    tableModalEndDate: document.getElementById('table-modal-end-date'),
    tableFullRangeBtn: document.getElementById('table-full-range-btn'),
    tablePageCount: document.getElementById('table-page-count'),

    // Pending Studies
    addPendingBtn: document.getElementById('add-pending-btn'),
    pendingList: document.getElementById('pending-list'),
    pendingFilters: document.querySelectorAll('.pending-filters .filter-btn'),
    pendingModal: document.getElementById('pending-modal'),
    pendingModalTitle: document.getElementById('pending-modal-title'),
    closePendingModal: document.getElementById('close-pending-modal'),
    cancelPendingModal: document.getElementById('cancel-pending-modal'),
    savePendingModal: document.getElementById('save-pending-modal'),
    deletePendingBtn: document.getElementById('delete-pending-btn'),
    pendingLocation: document.getElementById('pending-location'),
    pendingTypeGroup: document.getElementById('pending-type-group'),
    pendingRequestedBy: document.getElementById('pending-requested-by'),
    pendingDate: document.getElementById('pending-date'),
    pendingPriorityGroup: document.getElementById('pending-priority-group'),
    pendingStatusGroup: document.getElementById('pending-status-group'),
    pendingNotes: document.getElementById('pending-notes')
};

// Report items state
let reportItems = [];
let editingItemIndex = -1;
let modalSelectedStudyId = null;
let modalSelectedStudyMeta = null;

// Presets state
let presets = [];
let editingPresetId = null;

// Table modal state
let tableModalSelectedStudyId = null;
let tableModalSelectedStudyMeta = null;
let editingTableItemIndex = -1;

// Pending studies state
let pendingStudies = [];
let editingPendingId = null;
let pendingFilter = 'all';
const PENDING_FILE = 'pending_studies.json';
const PRESETS_FILE = 'report_presets.json';

// ============ Initialization ============

async function init() {
    if (!fileSystem.isSupported()) {
        elements.browserWarning.style.display = 'flex';
        elements.folderScreen.style.display = 'none';
        return;
    }

    const savedTheme = await storage.get('theme');
    if (savedTheme === 'dark') {
        setTheme(true);
    }

    setupEventListeners();

    showLoading('Checking for saved folder...');
    const hasHandle = await fileSystem.hasStoredHandle();

    if (hasHandle) {
        elements.folderStatus.textContent = '';
        elements.folderStatus.className = 'folder-status';
        elements.selectFolderBtn.textContent = 'Connect';
        elements.selectFolderBtn.classList.add('btn-success');
        elements.clearFolderBtn.style.display = 'inline-block';
    }

    hideLoading();
}

function setupEventListeners() {
    elements.selectFolderBtn.addEventListener('click', handleFolderSelect);
    elements.clearFolderBtn.addEventListener('click', handleClearAndSelectFolder);
    elements.changeFolderBtn.addEventListener('click', handleChangeFolder);
    elements.themeToggleBtn.addEventListener('click', () => setTheme(!isDarkTheme));

    elements.searchInput.addEventListener('input', debounce(updateStudyList, 300));
    elements.filterType.addEventListener('change', updateStudyList);
    elements.filterDate.addEventListener('change', updateStudyList);

    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    elements.chartTypeSelect.addEventListener('change', updateChart);
    elements.timeAggSelect.addEventListener('change', updateChart);
    elements.chartStartDate.addEventListener('change', handleDateRangeChange);
    elements.chartEndDate.addEventListener('change', handleDateRangeChange);
    elements.resetDateRangeBtn.addEventListener('click', () => {
        setDateRangeFromData();
        handleDateRangeChange();
    });

    // Report Builder
    elements.addChartBtn.addEventListener('click', openAddChartModal);
    elements.closeChartModal.addEventListener('click', closeChartModal);
    elements.cancelChartModal.addEventListener('click', closeChartModal);
    elements.saveChartModal.addEventListener('click', saveChartItem);
    elements.generateReportBtn.addEventListener('click', generateReport);
    elements.reportChartsPerPage.addEventListener('change', updatePageCount);

    // Chart Modal interactions
    elements.chartStudySearch.addEventListener('input', debounce(filterStudyDropdown, 200));
    elements.chartStudySearch.addEventListener('focus', filterStudyDropdown);
    elements.chartModalFullRange.addEventListener('change', toggleDateRange);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.study-selector')) {
            elements.chartStudyList.classList.remove('show');
            if (elements.tableStudyList) {
                elements.tableStudyList.classList.remove('show');
            }
        }
    });

    // Data Table Modal
    if (elements.addTableBtn) {
        elements.addTableBtn.addEventListener('click', openAddTableModal);
    }
    if (elements.closeTableModal) {
        elements.closeTableModal.addEventListener('click', closeTableModal);
    }
    if (elements.cancelTableModal) {
        elements.cancelTableModal.addEventListener('click', closeTableModal);
    }
    if (elements.saveTableModal) {
        elements.saveTableModal.addEventListener('click', saveTableItem);
    }
    if (elements.tableStudySearch) {
        elements.tableStudySearch.addEventListener('input', debounce(filterTableStudyDropdown, 200));
        elements.tableStudySearch.addEventListener('focus', filterTableStudyDropdown);
    }
    if (elements.tableFullRangeBtn) {
        elements.tableFullRangeBtn.addEventListener('click', setTableFullRange);
    }
    if (elements.tableModalStartDate) {
        elements.tableModalStartDate.addEventListener('change', updateTablePageCount);
    }
    if (elements.tableModalEndDate) {
        elements.tableModalEndDate.addEventListener('change', updateTablePageCount);
    }
    if (elements.tableModalType) {
        elements.tableModalType.addEventListener('change', onTableTypeChange);
    }

    // Report Presets
    if (elements.presetSelect) {
        elements.presetSelect.addEventListener('change', onPresetSelectChange);
    }
    if (elements.applyPresetBtn) {
        elements.applyPresetBtn.addEventListener('click', applyPreset);
    }
    if (elements.savePresetBtn) {
        elements.savePresetBtn.addEventListener('click', openSavePresetModal);
    }
    if (elements.managePresetsBtn) {
        elements.managePresetsBtn.addEventListener('click', openPresetModal);
    }
    if (elements.clearReportBtn) {
        elements.clearReportBtn.addEventListener('click', clearReportItems);
    }

    // Preset Modal
    if (elements.closePresetModal) {
        elements.closePresetModal.addEventListener('click', closePresetModal);
    }
    if (elements.closePresetModalBtn) {
        elements.closePresetModalBtn.addEventListener('click', closePresetModal);
    }

    // Save Preset Modal
    if (elements.closeSavePresetModal) {
        elements.closeSavePresetModal.addEventListener('click', closeSavePresetModal);
    }
    if (elements.cancelSavePreset) {
        elements.cancelSavePreset.addEventListener('click', closeSavePresetModal);
    }
    if (elements.confirmSavePreset) {
        elements.confirmSavePreset.addEventListener('click', confirmSavePreset);
    }
    if (elements.presetNameInput) {
        elements.presetNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') confirmSavePreset();
        });
    }

    // Pending Studies
    if (elements.addPendingBtn) {
        elements.addPendingBtn.addEventListener('click', openAddPendingModal);
    }
    if (elements.closePendingModal) {
        elements.closePendingModal.addEventListener('click', closePendingModal);
    }
    if (elements.cancelPendingModal) {
        elements.cancelPendingModal.addEventListener('click', closePendingModal);
    }
    if (elements.savePendingModal) {
        elements.savePendingModal.addEventListener('click', savePendingStudy);
    }
    if (elements.deletePendingBtn) {
        elements.deletePendingBtn.addEventListener('click', deletePendingStudy);
    }

    // Pending filter buttons
    elements.pendingFilters.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.pendingFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            pendingFilter = btn.dataset.filter;
            renderPendingList();
        });
    });

    // Button group toggle handlers (type, priority, status)
    setupButtonGroupToggles();
}

// ============ Folder Handling ============

async function handleFolderSelect() {
    showLoading('Selecting folder...');

    try {
        const hasHandle = await fileSystem.hasStoredHandle();
        let handle;

        if (hasHandle) {
            handle = await fileSystem.restoreAccess(true);
        }

        if (!handle) {
            handle = await fileSystem.requestFolderAccess();
        }

        if (!handle) {
            hideLoading();
            return;
        }

        await loadAndShowApp();

    } catch (error) {
        console.error('Error selecting folder:', error);
        elements.folderStatus.textContent = `Error: ${error.message}`;
        elements.folderStatus.className = 'folder-status error';
        hideLoading();
    }
}

async function handleClearAndSelectFolder() {
    showLoading('Clearing saved folder...');

    try {
        await fileSystem.clearStoredHandle();

        // Reset UI
        elements.folderStatus.textContent = '';
        elements.folderStatus.className = 'folder-status';
        elements.selectFolderBtn.textContent = 'Select Data Folder';
        elements.clearFolderBtn.style.display = 'none';

        // Now request new folder
        const handle = await fileSystem.requestFolderAccess();

        if (!handle) {
            hideLoading();
            return;
        }

        await loadAndShowApp();

    } catch (error) {
        console.error('Error selecting folder:', error);
        elements.folderStatus.textContent = `Error: ${error.message}`;
        elements.folderStatus.className = 'folder-status error';
        hideLoading();
    }
}

async function handleChangeFolder() {
    showLoading('Selecting new folder...');

    try {
        await fileSystem.clearStoredHandle();
        const handle = await fileSystem.requestFolderAccess();

        if (!handle) {
            // User cancelled - show folder selection screen
            elements.appScreen.style.display = 'none';
            elements.folderScreen.style.display = 'flex';
            elements.folderStatus.textContent = 'Please select a data folder';
            elements.folderStatus.className = 'folder-status info';
            elements.selectFolderBtn.textContent = 'Select Data Folder';
            hideLoading();
            return;
        }

        // Clean up existing map
        if (map) {
            map.remove();
            map = null;
            markersLayer = null;
            studyMarkers.clear();
        }

        await loadAndShowApp();

    } catch (error) {
        console.error('Error changing folder:', error);
        elements.appScreen.style.display = 'none';
        elements.folderScreen.style.display = 'flex';
        elements.folderStatus.textContent = `Error: ${error.message}`;
        elements.folderStatus.className = 'folder-status error';
        hideLoading();
    }
}

async function loadAndShowApp() {
    showLoading('Validating folder structure...');
    const validation = await fileSystem.validateFolder();

    if (!validation.valid) {
        elements.folderStatus.textContent = validation.message;
        elements.folderStatus.className = 'folder-status error';
        elements.folderScreen.style.display = 'flex';
        elements.appScreen.style.display = 'none';
        hideLoading();
        return;
    }

    showLoading('Loading studies...');
    await studyIndex.loadIndex();

    elements.folderScreen.style.display = 'none';
    elements.appScreen.style.display = 'flex';

    updateStudyList();

    // Initialize map immediately since it's the default tab
    setTimeout(() => initMap(), 100);

    // Load pending studies
    await loadPendingStudies();

    // Load report presets
    await loadPresets();

    hideLoading();
}

// ============ Study List with Grouped Linked Studies ============

function updateStudyList() {
    const query = elements.searchInput.value.toLowerCase().trim();
    const filterType = elements.filterType.value;
    const filterDate = elements.filterDate.value;

    let studies = studyIndex.getAll();

    if (query) {
        studies = studies.filter(s => {
            const location = (s.location || '').toLowerCase();
            const counter = String(s.counter_number ?? '').toLowerCase();
            const id = String(s.study_id ?? '').toLowerCase();
            return location.includes(query) || counter.includes(query) || id.includes(query);
        });
    }
    if (filterType) {
        studies = studies.filter(s => s.study_type === filterType);
    }
    // Date filter - show studies that were active on the selected date
    if (filterDate) {
        const targetDate = new Date(filterDate);
        const targetEnd = new Date(filterDate + 'T23:59:59');
        studies = studies.filter(s => {
            const studyStart = s.start_datetime ? new Date(s.start_datetime) : null;
            const studyEnd = s.end_datetime ? new Date(s.end_datetime) : null;

            // If study has no dates, include it
            if (!studyStart && !studyEnd) return true;

            // Check if target date falls within study range
            if (studyStart && targetEnd < studyStart) return false;
            if (studyEnd && targetDate > studyEnd) return false;

            return true;
        });
    }

    if (studies.length === 0) {
        elements.studyList.innerHTML = '<div class="loading">No studies found</div>';
        return;
    }

    const linkGroups = new Map();
    const unlinkedStudies = [];

    studies.forEach(study => {
        const linkGroup = study.link_group ? String(study.link_group).trim() : '';
        if (linkGroup !== '') {
            if (!linkGroups.has(linkGroup)) {
                linkGroups.set(linkGroup, []);
            }
            linkGroups.get(linkGroup).push(study);
        } else {
            unlinkedStudies.push(study);
        }
    });

    let html = '';

    linkGroups.forEach((groupStudies, linkGroup) => {
        if (groupStudies.length === 1) {
            html += createStudyItem(groupStudies[0]);
        } else {
            html += createLinkedGroupItem(linkGroup, groupStudies);
        }
    });

    unlinkedStudies.forEach(study => {
        html += createStudyItem(study);
    });

    elements.studyList.innerHTML = html;

    elements.studyList.querySelectorAll('.study-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectStudy(item.dataset.id);
        });
        // Double-click goes to charts tab
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            selectStudy(item.dataset.id);
            switchTab('charts');
        });
    });

    elements.studyList.querySelectorAll('.linked-group-header').forEach(header => {
        header.addEventListener('click', () => toggleGroup(header.dataset.group));
    });

    // Update map markers to match sidebar filters
    updateMapMarkers();
}

function createStudyItem(study) {
    const typeClass = study.study_type.toLowerCase().replace(/\s+/g, '-');
    const isSelected = currentStudy && currentStudy.study_id === study.study_id;

    return `
        <div class="study-item ${isSelected ? 'selected' : ''}" data-id="${study.study_id}">
            <div class="study-item-title">${escapeHtml(study.location)}</div>
            <div class="study-item-meta">
                <span class="type-badge ${typeClass}">${study.study_type}</span>
                ${study.counter_number ? `<span>#${study.counter_number}</span>` : ''}
                ${study.direction ? `<span>${study.direction}</span>` : ''}
                <span>${formatDateRange(study.start_datetime, study.end_datetime)}</span>
            </div>
        </div>
    `;
}

function createLinkedGroupItem(linkGroup, studies) {
    const isExpanded = expandedGroups.has(linkGroup);
    const firstStudy = studies[0];
    const arrow = isExpanded ? '▼' : '▶';

    let html = `
        <div class="linked-group">
            <div class="linked-group-header" data-group="${linkGroup}">
                <span class="group-arrow">${arrow}</span>
                <span class="group-icon">🔗</span>
                <span class="group-title">${escapeHtml(firstStudy.location)}</span>
                <span class="group-count">${studies.length}</span>
            </div>
            <div class="linked-group-items" style="display: ${isExpanded ? 'block' : 'none'}">
    `;

    studies.forEach(study => {
        const typeClass = study.study_type.toLowerCase().replace(/\s+/g, '-');
        const isSelected = currentStudy && currentStudy.study_id === study.study_id;

        html += `
            <div class="study-item linked-child ${isSelected ? 'selected' : ''}" data-id="${study.study_id}">
                <div class="study-item-title">${study.direction || 'Unknown Direction'}</div>
                <div class="study-item-meta">
                    <span class="type-badge ${typeClass}">${study.study_type}</span>
                    ${study.counter_number ? `<span>#${study.counter_number}</span>` : ''}
                    <span>${formatDateRange(study.start_datetime, study.end_datetime)}</span>
                </div>
            </div>
        `;
    });

    html += '</div></div>';
    return html;
}

function toggleGroup(linkGroup) {
    if (expandedGroups.has(linkGroup)) {
        expandedGroups.delete(linkGroup);
    } else {
        // Accordion behavior: collapse all other groups when expanding a new one
        expandedGroups.clear();
        expandedGroups.add(linkGroup);
    }
    updateStudyList();
}

// ============ Study Selection ============

async function selectStudy(studyId) {
    try {
        // Check if we're switching from another study (to preserve settings)
        const hadPreviousStudy = currentStudy !== null;

        currentStudy = studyIndex.getById(studyId);
        if (!currentStudy) throw new Error('Study not found');

        currentStudyData = await studyIndex.loadStudyData(studyId);
        filteredStudyData = currentStudyData;

        // For Radar studies, extract 85th percentile from raw file
        extractedPercentiles = null;
        if (currentStudy.study_type === 'Radar') {
            extractedPercentiles = await studyIndex.extractRadarPercentiles(studyId);
        }

        // Set date range - preserve if switching between studies and ranges overlap
        setDateRangeFromData(hadPreviousStudy);

        updateStudyInfo();
        updateChartTypeOptions();

        // Re-filter data based on (potentially preserved) date range
        // This also calls updateChart() and updateStats()
        handleDateRangeChange();

        elements.chartPlaceholder.style.display = 'none';
        elements.chartContainer.style.display = 'flex';
        elements.generateReportBtn.disabled = false;

        updateStudyList();
        updateReportPanel();

        // When selecting from sidebar, collapse any expanded map markers first
        // This ensures the previously expanded group returns to its combined marker
        forceCollapseExpandedMarkers();

        // Zoom to study on map (may expand new linked group)
        zoomToStudy(studyId);

    } catch (error) {
        console.error('Error loading study:', error);
        alert(`Error loading study: ${error.message}`);
    }
}

function clearStudySelection() {
    if (!currentStudy) return;

    currentStudy = null;
    currentStudyData = null;
    filteredStudyData = null;
    extractedPercentiles = null;

    // Reset UI
    elements.chartContainer.style.display = 'none';
    elements.chartPlaceholder.style.display = 'flex';
    elements.generateReportBtn.disabled = true;

    // Clear study info
    elements.studyTitle.textContent = '';
    elements.studyTypeBadge.textContent = '';
    elements.studyTypeBadge.className = 'type-badge';
    elements.studyCounterNumber.textContent = '';
    elements.studyDirection.textContent = '';
    elements.studyDates.textContent = '';
    elements.studySpeedLimit.textContent = '';

    // Clear date range inputs
    elements.chartStartDate.value = '';
    elements.chartEndDate.value = '';

    // Update sidebar to remove selection highlight (skip map zoom)
    skipMapFitBounds = true;
    updateStudyList();
    skipMapFitBounds = false;

    // Clear marker selection on map
    updateSingleMarkerSelection(null);
    updateExpandedMarkerSelection(null);

    // Collapse any expanded markers
    collapseExpandedMarkers();
}

function setDateRangeFromData(preserveIfOverlaps = false) {
    if (!currentStudyData || currentStudyData.length === 0) return;

    const dates = currentStudyData
        .map(d => d.datetime)
        .filter(d => d)
        .sort((a, b) => a - b);

    if (dates.length === 0) return;

    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    // If we should try to preserve and there's an existing range, check for overlap
    if (preserveIfOverlaps && elements.chartStartDate.value && elements.chartEndDate.value) {
        const currentStart = new Date(elements.chartStartDate.value + 'T00:00:00');
        const currentEnd = new Date(elements.chartEndDate.value + 'T23:59:59');

        // Check if current range overlaps with new study data range
        const overlaps = currentStart <= maxDate && currentEnd >= minDate;

        if (overlaps) {
            // Keep existing range - no changes needed
            return;
        }
    }

    // Reset to full study range
    elements.chartStartDate.value = formatDateForInput(minDate);
    elements.chartEndDate.value = formatDateForInput(maxDate);
}

function formatDateForInput(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function handleDateRangeChange() {
    if (!currentStudyData) return;

    const startDate = elements.chartStartDate.value ? new Date(elements.chartStartDate.value + 'T00:00:00') : null;
    const endDate = elements.chartEndDate.value ? new Date(elements.chartEndDate.value + 'T23:59:59') : null;

    filteredStudyData = currentStudyData.filter(d => {
        if (!d.datetime) return false;
        const dt = new Date(d.datetime);
        if (startDate && dt < startDate) return false;
        if (endDate && dt > endDate) return false;
        return true;
    });

    updateChart();
    updateStats();
}

function updateStudyInfo() {
    if (!currentStudy) return;

    elements.studyTitle.textContent = currentStudy.location;

    const typeClass = currentStudy.study_type.toLowerCase().replace(/\s+/g, '-');
    elements.studyTypeBadge.textContent = currentStudy.study_type;
    elements.studyTypeBadge.className = `type-badge ${typeClass}`;

    elements.studyCounterNumber.textContent = currentStudy.counter_number ? `Counter #${currentStudy.counter_number}` : '';
    elements.studyDirection.textContent = currentStudy.direction || 'N/A';
    elements.studyDates.textContent = formatDateRange(currentStudy.start_datetime, currentStudy.end_datetime);
    elements.studySpeedLimit.textContent = currentStudy.speed_limit ? `${currentStudy.speed_limit} mph` : 'N/A';
}

function updateChartTypeOptions() {
    if (!currentStudy) return;

    const isVolumeOnly = VOLUME_STUDY_TYPES.includes(currentStudy.study_type);
    const select = elements.chartTypeSelect;

    Array.from(select.options).forEach(option => {
        option.disabled = option.value !== 'volume-only' && isVolumeOnly;
    });

    if (isVolumeOnly) {
        select.value = 'volume-only';
    } else if (select.value === 'volume-only') {
        select.value = 'vehicles-violators';
    }
}

// ============ Charts ============

function updateChart() {
    if (!currentStudy || !filteredStudyData) return;

    const chartType = elements.chartTypeSelect.value;
    const timeAgg = elements.timeAggSelect.value;

    // Show warning for 85th percentile chart on hourly view for Radar studies
    const showWarning = chartType === 'avg-vs-85th' &&
                        timeAgg === 'hourly' &&
                        currentStudy.study_type === 'Radar';
    elements.chartWarning.style.display = showWarning ? 'flex' : 'none';

    createChart(
        elements.chartCanvas,
        chartType,
        filteredStudyData,
        timeAgg,
        {
            showLabels: true,
            speedLimit: currentStudy.speed_limit || 0,
            extractedPercentiles: extractedPercentiles
        }
    );
}

function updateStats() {
    if (!filteredStudyData) {
        elements.statTotal.textContent = '-';
        elements.statViolators.textContent = '-';
        elements.statPct.textContent = '-';
        elements.statAvgSpeed.textContent = '-';
        elements.stat85th.textContent = '-';
        elements.statPeak.textContent = '-';
        return;
    }

    // Pass extracted percentiles for Radar studies
    const stats = calculateStats(filteredStudyData, null, extractedPercentiles);

    elements.statTotal.textContent = formatNumber(stats.totalVehicles);
    elements.statViolators.textContent = formatNumber(stats.totalViolators);
    elements.statPct.textContent = stats.totalVehicles > 0 ? formatDecimal(stats.pctSpeeders) + '%' : '-';
    elements.statAvgSpeed.textContent = stats.avgSpeed > 0 ? formatDecimal(stats.avgSpeed) + ' mph' : '-';
    elements.stat85th.textContent = stats.p85 ? formatDecimal(stats.p85) + ' mph' : 'N/A';
    elements.statPeak.textContent = stats.peakSpeed > 0 ? formatDecimal(stats.peakSpeed) + ' mph' : '-';
}

// ============ Tabs ============

function switchTab(tabId) {
    elements.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    elements.tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabId}-tab`);
    });

    if (tabId === 'map' && !map) {
        initMap();
    }
    if (tabId === 'map' && map) {
        setTimeout(() => map.invalidateSize(), 100);
    }
}

// ============ Map with Linked Study Grouping ============

let satelliteControl = null;

function initMap() {
    if (map) return;

    map = L.map(elements.mapContainer).setView([MAP_CENTER.lat, MAP_CENTER.lon], MAP_CENTER.zoom);

    // Street layer (default)
    streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });

    // Satellite layer (Esri World Imagery)
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    });

    // Add default layer
    streetLayer.addTo(map);

    // Add satellite toggle control to map (top-left, below zoom)
    const SatelliteControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function() {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control satellite-control');
            const button = L.DomUtil.create('a', 'satellite-toggle-btn', container);
            button.href = '#';
            button.title = 'Toggle satellite view';
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
            `;

            L.DomEvent.on(button, 'click', function(e) {
                L.DomEvent.preventDefault(e);
                L.DomEvent.stopPropagation(e);
                toggleSatelliteView();
            });

            return container;
        }
    });

    satelliteControl = new SatelliteControl();
    satelliteControl.addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    // Clear selection and collapse markers when clicking on map background
    map.on('click', (e) => {
        // Check if clicked on a marker - if not, clear selection
        if (!e.originalEvent.target.closest('.leaflet-marker-icon')) {
            clearStudySelection();
        }
    });

    updateMapMarkers();

    setTimeout(() => map.invalidateSize(), 100);
}

function toggleSatelliteView() {
    isSatelliteView = !isSatelliteView;

    const button = document.querySelector('.satellite-control .satellite-toggle-btn');
    const tilePane = map.getPane('tilePane');
    if (!button) return;

    if (isSatelliteView) {
        map.removeLayer(streetLayer);
        map.addLayer(satelliteLayer);
        button.classList.add('active');
        if (tilePane) tilePane.classList.add('satellite-active');
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
        `;
        button.title = 'Switch to street view';
    } else {
        map.removeLayer(satelliteLayer);
        map.addLayer(streetLayer);
        button.classList.remove('active');
        if (tilePane) tilePane.classList.remove('satellite-active');
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
        `;
        button.title = 'Switch to satellite view';
    }
}

function updateMapMarkers() {
    if (!markersLayer) return;

    markersLayer.clearLayers();
    studyMarkers.clear();

    // Use same filters as sidebar
    const query = elements.searchInput.value.toLowerCase().trim();
    const filterType = elements.filterType.value;
    const filterDate = elements.filterDate.value;

    let studies = studyIndex.getWithCoordinates();

    // Apply search filter
    if (query) {
        studies = studies.filter(s => {
            const location = (s.location || '').toLowerCase();
            const counter = String(s.counter_number ?? '').toLowerCase();
            const id = String(s.study_id ?? '').toLowerCase();
            return location.includes(query) || counter.includes(query) || id.includes(query);
        });
    }

    // Apply type filter
    if (filterType) {
        studies = studies.filter(s => s.study_type === filterType);
    }

    // Apply date filter - show studies that were active on the selected date
    if (filterDate) {
        const targetDate = new Date(filterDate);
        const targetEnd = new Date(filterDate + 'T23:59:59');
        studies = studies.filter(s => {
            const studyStart = s.start_datetime ? new Date(s.start_datetime) : null;
            const studyEnd = s.end_datetime ? new Date(s.end_datetime) : null;

            if (!studyStart && !studyEnd) return true;
            if (studyStart && targetEnd < studyStart) return false;
            if (studyEnd && targetDate > studyEnd) return false;

            return true;
        });
    }

    const linkGroups = new Map();
    const unlinkedStudies = [];

    studies.forEach(study => {
        const linkGroup = study.link_group ? String(study.link_group).trim() : '';
        if (linkGroup !== '') {
            if (!linkGroups.has(linkGroup)) {
                linkGroups.set(linkGroup, []);
            }
            linkGroups.get(linkGroup).push(study);
        } else {
            unlinkedStudies.push(study);
        }
    });

    let markerCount = 0;

    linkGroups.forEach((groupStudies) => {
        addLinkedMarker(groupStudies);
        markerCount++;
    });

    unlinkedStudies.forEach(study => {
        addSingleMarker(study);
        markerCount++;
    });

    // Only fit bounds on initial load (when no study is selected), never after
    // Skip if clearing selection (skipMapFitBounds flag)
    if (studies.length > 0 && !currentStudy && !skipMapFitBounds) {
        const bounds = L.latLngBounds(studies.map(s => [s.lat, s.lon]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    // If a linked study is selected, make sure link node is hidden and markers are expanded
    if (currentStudy) {
        const markerData = studyMarkers.get(currentStudy.study_id);
        if (markerData && markerData.linkGroup && markerData.studies && markerData.studies.length > 1) {
            // Hide the combined marker
            markerData.marker.setOpacity(0);

            // If not already expanded, expand the markers
            if (expandedLinkGroup !== markerData.linkGroup) {
                expandedLinkGroup = markerData.linkGroup;

                // Calculate offset coordinates for overlapping studies
                const offsetCoords = getOffsetCoordinates(markerData.studies);

                // Create individual markers at coordinates (with offsets for overlapping ones)
                markerData.studies.forEach((s) => {
                    const color = getMarkerColor(s.study_type);
                    const isSelected = s.study_id === currentStudy.study_id;
                    const coords = offsetCoords.get(s.study_id);
                    const expandedIcon = L.divIcon({
                        className: 'expanded-marker',
                        html: `<div style="background:${color};border-radius:50%;width:24px;height:24px;border:2px solid white;box-shadow:${isSelected ? '0 0 0 3px #fff, 0 0 0 6px #5470C6' : '0 2px 5px rgba(0,0,0,0.3)'};transform:${isSelected ? 'scale(1.2)' : 'scale(1)'};transition:all 0.2s;"></div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });

                    const expandedMarker = L.marker([coords.lat, coords.lon], { icon: expandedIcon })
                        .addTo(map);

                    expandedMarker.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        selectStudyFromMap(s.study_id);
                    });

                    expandedMarker.on('dblclick', (e) => {
                        L.DomEvent.stopPropagation(e);
                        selectStudyFromMap(s.study_id);
                        switchTab('charts');
                    });

                    expandedMarkers.push({ marker: expandedMarker, studyId: s.study_id });
                });
            }
        }
    }
}

function getMarkerColor(studyType) {
    return MARKER_COLORS[studyType] || '#666666';
}

// Select a study from the map (without switching to charts tab)
async function selectStudyFromMap(studyId, skipZoom = false) {
    // If same study is already selected, don't reload
    if (currentStudy && currentStudy.study_id === studyId) {
        // Just update marker visuals
        updateExpandedMarkerSelection(studyId);
        return;
    }

    try {
        // Check if we're switching from another study (to preserve settings)
        const hadPreviousStudy = currentStudy !== null;

        currentStudy = studyIndex.getById(studyId);
        if (!currentStudy) throw new Error('Study not found');

        currentStudyData = await studyIndex.loadStudyData(studyId);
        filteredStudyData = currentStudyData;

        // For Radar studies, extract 85th percentile from raw file
        extractedPercentiles = null;
        if (currentStudy.study_type === 'Radar') {
            extractedPercentiles = await studyIndex.extractRadarPercentiles(studyId);
        }

        // Set date range - preserve if switching between studies and ranges overlap
        setDateRangeFromData(hadPreviousStudy);

        updateStudyInfo();
        updateChartTypeOptions();

        // Re-filter data based on (potentially preserved) date range
        // This also calls updateChart() and updateStats()
        handleDateRangeChange();

        elements.chartPlaceholder.style.display = 'none';
        elements.chartContainer.style.display = 'flex';
        elements.generateReportBtn.disabled = false;

        // Update sidebar to show selected state
        updateStudyList();
        updateReportPanel();

        // Scroll sidebar to show selected study
        scrollSidebarToStudy(studyId);

        // Update expanded marker selection visuals
        updateExpandedMarkerSelection(studyId);

    } catch (error) {
        console.error('Error loading study:', error);
    }
}

// Scroll sidebar to show the selected study
function scrollSidebarToStudy(studyId) {
    const studyItem = elements.studyList.querySelector(`.study-item[data-id="${studyId}"]`);
    if (studyItem) {
        // Expand the linked group if needed
        const linkedGroup = studyItem.closest('.linked-group');
        if (linkedGroup) {
            const header = linkedGroup.querySelector('.linked-group-header');
            if (header) {
                const groupId = header.dataset.group;
                if (!expandedGroups.has(groupId)) {
                    expandedGroups.add(groupId);
                    updateStudyList();
                    // Re-find the element after updating
                    const newStudyItem = elements.studyList.querySelector(`.study-item[data-id="${studyId}"]`);
                    if (newStudyItem) {
                        newStudyItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    return;
                }
            }
        }
        studyItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Update the visual selection state of expanded markers
function updateExpandedMarkerSelection(selectedStudyId) {
    expandedMarkers.forEach(({ marker, studyId }) => {
        const isSelected = studyId === selectedStudyId;
        const markerEl = marker.getElement();
        if (markerEl) {
            const innerDiv = markerEl.querySelector('div');
            if (innerDiv) {
                if (isSelected) {
                    innerDiv.style.boxShadow = '0 0 0 3px #fff, 0 0 0 6px #5470C6';
                    innerDiv.style.transform = 'scale(1.2)';
                } else {
                    innerDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
                    innerDiv.style.transform = 'scale(1)';
                }
            }
        }
    });
}

// Calculate offset coordinates for studies with identical positions
// Returns a Map of study_id -> { lat, lon } with offsets applied
function getOffsetCoordinates(studies) {
    const coords = new Map();
    const OFFSET = 0.0003; // ~30 meters, enough to separate markers visually

    // Group studies by their coordinate string
    const coordGroups = new Map();
    studies.forEach(s => {
        const key = `${s.lat},${s.lon}`;
        if (!coordGroups.has(key)) {
            coordGroups.set(key, []);
        }
        coordGroups.get(key).push(s);
    });

    // Apply offsets to overlapping studies
    coordGroups.forEach((group) => {
        if (group.length === 1) {
            // No overlap, use original coordinates
            coords.set(group[0].study_id, { lat: group[0].lat, lon: group[0].lon });
        } else if (group.length === 2) {
            // Two studies - spread horizontally (left and right)
            coords.set(group[0].study_id, { lat: group[0].lat, lon: group[0].lon - OFFSET / 2 });
            coords.set(group[1].study_id, { lat: group[1].lat, lon: group[1].lon + OFFSET / 2 });
        } else {
            // Three or more studies - arrange in a radial pattern
            const centerLat = group[0].lat;
            const centerLon = group[0].lon;
            group.forEach((s, i) => {
                const angle = (2 * Math.PI * i) / group.length - Math.PI / 2; // Start from top
                const offsetLat = OFFSET * Math.sin(angle);
                const offsetLon = OFFSET * Math.cos(angle);
                coords.set(s.study_id, { lat: centerLat + offsetLat, lon: centerLon + offsetLon });
            });
        }
    });

    return coords;
}

function addLinkedMarker(studies) {
    let totalLat = 0, totalLon = 0;
    studies.forEach(s => { totalLat += s.lat; totalLon += s.lon; });
    const centLat = totalLat / studies.length;
    const centLon = totalLon / studies.length;

    const firstType = studies[0].study_type;
    const allSameType = studies.every(s => s.study_type === firstType);
    const markerColor = allSameType ? getMarkerColor(firstType) : '#9333ea';
    const linkGroup = studies[0].link_group;

    const icon = L.divIcon({
        className: 'linked-marker',
        html: `<div style="background:${markerColor};color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);font-size:14px;">🔗</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });

    const marker = L.marker([centLat, centLon], { icon });

    // On marker click, expand linked studies to their actual coordinates
    marker.on('click', (e) => {
        // Collapse any previously expanded group first
        collapseExpandedMarkers();

        // Store the link group for this expansion
        expandedLinkGroup = linkGroup;

        // Hide the combined marker
        marker.setOpacity(0);

        // Zoom in close to the linked studies
        map.flyTo([centLat, centLon], 17, { animate: true });

        // Calculate offset coordinates for overlapping studies
        const offsetCoords = getOffsetCoordinates(studies);

        // Create individual markers at coordinates (with offsets for overlapping ones)
        studies.forEach((s, index) => {
            const color = getMarkerColor(s.study_type);
            const isFirstStudy = index === 0;
            const coords = offsetCoords.get(s.study_id);
            const expandedIcon = L.divIcon({
                className: 'expanded-marker',
                html: `<div style="background:${color};border-radius:50%;width:24px;height:24px;border:2px solid white;box-shadow:${isFirstStudy ? '0 0 0 3px #fff, 0 0 0 6px #5470C6' : '0 2px 5px rgba(0,0,0,0.3)'};transform:${isFirstStudy ? 'scale(1.2)' : 'scale(1)'};transition:all 0.2s;"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const expandedMarker = L.marker([coords.lat, coords.lon], { icon: expandedIcon })
                .addTo(map);

            // Click on expanded marker selects that study (keeps group expanded)
            expandedMarker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                selectStudyFromMap(s.study_id);
            });

            // Double-click goes to charts tab
            expandedMarker.on('dblclick', (e) => {
                L.DomEvent.stopPropagation(e);
                selectStudyFromMap(s.study_id);
                switchTab('charts');
            });

            expandedMarkers.push({ marker: expandedMarker, studyId: s.study_id });
        });

        // Auto-select the first study in the group
        selectStudyFromMap(studies[0].study_id);
    });

    markersLayer.addLayer(marker);

    // Store marker for each study in this group
    studies.forEach(s => studyMarkers.set(s.study_id, { marker, linkGroup, studies }));
}

function collapseExpandedMarkers() {
    if (expandedMarkers.length === 0) return;

    // Check if the currently selected study is in the expanded link group
    const selectedStudyInExpandedGroup = currentStudy && expandedLinkGroup &&
        studyMarkers.get(currentStudy.study_id)?.linkGroup === expandedLinkGroup;

    // Remove expanded markers from map
    expandedMarkers.forEach(({ marker }) => {
        map.removeLayer(marker);
    });
    expandedMarkers = [];

    // Only restore the combined marker if no study from this group is selected
    if (expandedLinkGroup && !selectedStudyInExpandedGroup) {
        // Find the combined marker and restore it
        studyMarkers.forEach((value) => {
            if (value.linkGroup === expandedLinkGroup && value.marker) {
                value.marker.setOpacity(1);
            }
        });
    }

    expandedLinkGroup = null;
}

// Force collapse expanded markers and always restore combined marker
// Used when selecting from sidebar to ensure clean state before zooming
function forceCollapseExpandedMarkers() {
    if (expandedMarkers.length === 0) return;

    // Remove expanded markers from map
    expandedMarkers.forEach(({ marker }) => {
        map.removeLayer(marker);
    });
    expandedMarkers = [];

    // Always restore the combined marker
    if (expandedLinkGroup) {
        studyMarkers.forEach((value) => {
            if (value.linkGroup === expandedLinkGroup && value.marker) {
                value.marker.setOpacity(1);
            }
        });
    }

    expandedLinkGroup = null;
}

// Check if link marker should be shown (only if no study in that group is selected)
function shouldShowLinkMarker(linkGroup) {
    if (!currentStudy) return true;
    const selectedLinkGroup = studyMarkers.get(currentStudy.study_id)?.linkGroup;
    return selectedLinkGroup !== linkGroup;
}

function addSingleMarker(study) {
    const color = getMarkerColor(study.study_type);
    const isSelected = currentStudy && currentStudy.study_id === study.study_id;

    const icon = L.divIcon({
        className: 'single-marker',
        html: `<div style="background:${color};border-radius:50%;width:24px;height:24px;border:2px solid white;box-shadow:${isSelected ? '0 0 0 3px #fff, 0 0 0 6px #5470C6' : '0 2px 5px rgba(0,0,0,0.3)'};transform:${isSelected ? 'scale(1.2)' : 'scale(1)'};transition:all 0.2s;"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const marker = L.marker([study.lat, study.lon], { icon });

    // Click on single marker selects the study
    marker.on('click', () => {
        collapseExpandedMarkers();
        selectStudyFromMap(study.study_id);
        // Update this marker's visual to show selected
        updateSingleMarkerSelection(study.study_id);
    });

    // Double-click goes to charts tab
    marker.on('dblclick', () => {
        selectStudyFromMap(study.study_id);
        switchTab('charts');
    });

    markersLayer.addLayer(marker);

    // Store as object for consistency with linked markers
    studyMarkers.set(study.study_id, { marker, linkGroup: null, studies: null, studyType: study.study_type });
}

// Update single marker selection visual
function updateSingleMarkerSelection(selectedStudyId) {
    studyMarkers.forEach((value, studyId) => {
        if (!value.linkGroup && value.marker) {
            const isSelected = studyId === selectedStudyId;
            const markerEl = value.marker.getElement();
            if (markerEl) {
                const innerDiv = markerEl.querySelector('div');
                if (innerDiv) {
                    if (isSelected) {
                        innerDiv.style.boxShadow = '0 0 0 3px #fff, 0 0 0 6px #5470C6';
                        innerDiv.style.transform = 'scale(1.2)';
                    } else {
                        innerDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
                        innerDiv.style.transform = 'scale(1)';
                    }
                }
            }
        }
    });
}

function zoomToStudy(studyId) {
    if (!map) return;

    const study = studyIndex.getById(studyId);
    if (!study || !study.lat || !study.lon) return;

    const markerData = studyMarkers.get(studyId);
    if (!markerData) return;

    // Check if this is a linked study
    if (markerData.linkGroup && markerData.studies && markerData.studies.length > 1) {
        // Check if this link group is already expanded
        const alreadyExpanded = expandedLinkGroup === markerData.linkGroup;

        if (!alreadyExpanded) {
            // Collapse any previously expanded group
            collapseExpandedMarkers();

            // Store the link group for this expansion
            expandedLinkGroup = markerData.linkGroup;

            // Hide the combined marker
            markerData.marker.setOpacity(0);

            // Calculate bounds for all studies in group and zoom to fit all markers
            const bounds = L.latLngBounds(markerData.studies.map(s => [s.lat, s.lon]));
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17, animate: true });

            // Calculate offset coordinates for overlapping studies
            const offsetCoords = getOffsetCoordinates(markerData.studies);

            // Create individual markers at coordinates (with offsets for overlapping ones)
            markerData.studies.forEach((s) => {
                const color = getMarkerColor(s.study_type);
                const isSelected = s.study_id === studyId;
                const coords = offsetCoords.get(s.study_id);
                const expandedIcon = L.divIcon({
                    className: 'expanded-marker',
                    html: `<div style="background:${color};border-radius:50%;width:24px;height:24px;border:2px solid white;box-shadow:${isSelected ? '0 0 0 3px #fff, 0 0 0 6px #5470C6' : '0 2px 5px rgba(0,0,0,0.3)'};transform:${isSelected ? 'scale(1.2)' : 'scale(1)'};transition:all 0.2s;"></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });

                const expandedMarker = L.marker([coords.lat, coords.lon], { icon: expandedIcon })
                    .addTo(map);

                // Click on expanded marker selects that study (keeps group expanded)
                expandedMarker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    selectStudyFromMap(s.study_id);
                });

                // Double-click goes to charts tab
                expandedMarker.on('dblclick', (e) => {
                    L.DomEvent.stopPropagation(e);
                    selectStudyFromMap(s.study_id);
                    switchTab('charts');
                });

                expandedMarkers.push({ marker: expandedMarker, studyId: s.study_id });
            });
        } else {
            // Already expanded - just update selection visual
            updateExpandedMarkerSelection(studyId);
        }
    } else {
        // Single study - zoom to location with reasonable zoom level
        collapseExpandedMarkers();
        map.flyTo([study.lat, study.lon], 17, { animate: true });

        // Update single marker selection visual
        updateSingleMarkerSelection(studyId);
    }
}

window.viewStudy = function(studyId) {
    switchTab('charts');
    selectStudy(studyId);
};

// ============ Advanced Report Builder ============

// Chart type display names
const CHART_TYPE_NAMES = {
    'vehicles-violators': 'Vehicles & Violators',
    'pct-speeders': '% Speeders',
    'avg-peak-speeds': 'Average & Peak Speeds',
    'avg-vs-85th': 'Avg vs 85th Percentile',
    'volume-only': 'Volume Only'
};

function openAddChartModal() {
    editingItemIndex = -1;
    elements.chartModalTitle.textContent = 'Add Chart';
    elements.saveChartModal.textContent = 'Add Chart';

    // Reset form
    resetChartModal();

    // If we have a current study, pre-select it
    if (currentStudy) {
        modalSelectedStudyId = currentStudy.study_id;
        modalSelectedStudyMeta = currentStudy;
        updateSelectedStudyDisplay();
    }

    elements.chartModal.style.display = 'flex';
}

window.openEditChartModal = function(index) {
    editingItemIndex = index;
    const item = reportItems[index];

    elements.chartModalTitle.textContent = 'Edit Chart';
    elements.saveChartModal.textContent = 'Save Changes';

    // Populate form with item data
    modalSelectedStudyId = item.studyId;
    modalSelectedStudyMeta = item.studyMeta;
    updateSelectedStudyDisplay();

    elements.chartModalType.value = item.chartType;
    elements.chartModalTimeAgg.value = item.timeAgg;
    elements.chartModalFullRange.checked = item.fullRange;
    elements.chartModalDateRange.style.display = item.fullRange ? 'none' : 'flex';
    elements.chartModalStartDate.value = item.startDate || '';
    elements.chartModalStartTime.value = item.startTime || '00:00';
    elements.chartModalEndDate.value = item.endDate || '';
    elements.chartModalEndTime.value = item.endTime || '23:59';
    elements.chartModalShowLabels.checked = item.showLabels;
    elements.chartModalEachDay.checked = item.eachDay || false;

    elements.chartModal.style.display = 'flex';
}

function closeChartModal() {
    elements.chartModal.style.display = 'none';
    elements.chartStudyList.classList.remove('show');
}

function resetChartModal() {
    modalSelectedStudyId = null;
    modalSelectedStudyMeta = null;
    elements.chartSelectedStudy.textContent = 'No study selected';
    elements.chartStudySearch.value = '';
    elements.chartModalType.value = 'vehicles-violators';
    elements.chartModalTimeAgg.value = 'daily';
    elements.chartModalFullRange.checked = true;
    elements.chartModalDateRange.style.display = 'none';
    elements.chartModalStartDate.value = '';
    elements.chartModalStartTime.value = '00:00';
    elements.chartModalEndDate.value = '';
    elements.chartModalEndTime.value = '23:59';
    elements.chartModalShowLabels.checked = true;
    elements.chartModalEachDay.checked = false;
}

function toggleDateRange() {
    elements.chartModalDateRange.style.display = elements.chartModalFullRange.checked ? 'none' : 'flex';
}

function filterStudyDropdown() {
    const query = elements.chartStudySearch.value.toLowerCase().trim();
    let studies = studyIndex.getAll();

    if (query) {
        studies = studies.filter(s => {
            const location = (s.location || '').toLowerCase();
            const counter = String(s.counter_number ?? '').toLowerCase();
            const id = String(s.study_id ?? '').toLowerCase();
            return location.includes(query) || counter.includes(query) || id.includes(query);
        });
    }

    // Limit to 20 results
    studies = studies.slice(0, 20);

    elements.chartStudyList.innerHTML = studies.map(s => `
        <div class="study-dropdown-item" onclick="selectModalStudy('${s.study_id}')">
            <div class="location">${escapeHtml(s.location)}</div>
            <div class="meta">${s.direction || ''} | ${s.study_type}</div>
        </div>
    `).join('');

    elements.chartStudyList.classList.add('show');
}

window.selectModalStudy = function(studyId) {
    const study = studyIndex.getById(studyId);
    if (study) {
        modalSelectedStudyId = studyId;
        modalSelectedStudyMeta = study;
        updateSelectedStudyDisplay();

        // Set date range from study
        if (study.start_datetime) {
            elements.chartModalStartDate.value = formatDateForInput(new Date(study.start_datetime));
        }
        if (study.end_datetime) {
            elements.chartModalEndDate.value = formatDateForInput(new Date(study.end_datetime));
        }
    }
    elements.chartStudyList.classList.remove('show');
    elements.chartStudySearch.value = '';
};

function updateSelectedStudyDisplay() {
    if (modalSelectedStudyMeta) {
        elements.chartSelectedStudy.innerHTML = `
            <strong>${escapeHtml(modalSelectedStudyMeta.location)}</strong>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">
                ${modalSelectedStudyMeta.direction || ''} | ${modalSelectedStudyMeta.study_type}
            </span>
        `;
    } else {
        elements.chartSelectedStudy.textContent = 'No study selected';
    }
}

function saveChartItem() {
    if (!modalSelectedStudyId || !modalSelectedStudyMeta) {
        alert('Please select a study');
        return;
    }

    const item = {
        studyId: modalSelectedStudyId,
        studyMeta: modalSelectedStudyMeta,
        chartType: elements.chartModalType.value,
        timeAgg: elements.chartModalTimeAgg.value,
        fullRange: elements.chartModalFullRange.checked,
        startDate: elements.chartModalStartDate.value,
        startTime: elements.chartModalStartTime.value,
        endDate: elements.chartModalEndDate.value,
        endTime: elements.chartModalEndTime.value,
        showLabels: elements.chartModalShowLabels.checked,
        eachDay: elements.chartModalEachDay.checked
    };

    if (editingItemIndex >= 0) {
        reportItems[editingItemIndex] = item;
    } else {
        reportItems.push(item);
    }

    closeChartModal();
    renderReportItems();
    updatePageCount();
}

// Table type display names
const TABLE_TYPE_NAMES = {
    'speed-summary': 'Speed Summary (24-Hour)',
    'volume-summary': 'Volume Summary (24-Hour)',
    'daily-speed-bins': 'Daily Speed Bins'
};

function renderReportItems() {
    if (reportItems.length === 0) {
        elements.reportItemsList.innerHTML = '<p class="empty-list-message">No items added. Click "Add Chart" or "Add Data Table" to begin.</p>';
        elements.generateReportBtn.disabled = true;
        return;
    }

    elements.reportItemsList.innerHTML = reportItems.map((item, index) => {
        const location = item.studyMeta?.location || 'Unknown';
        const direction = item.studyMeta?.direction || '';

        // Check if this is a table or chart item
        const isTable = item.type === 'table';
        const itemTypeName = isTable
            ? TABLE_TYPE_NAMES[item.tableType] || item.tableType
            : CHART_TYPE_NAMES[item.chartType] || item.chartType;

        // Build description line
        let metaStr = itemTypeName;
        if (!isTable) {
            metaStr += ` | ${item.timeAgg}`;
            if (item.eachDay) {
                metaStr += ' | per-day';
            }
        }

        // Build filter description
        let filters = [];
        if (isTable) {
            if (item.startDate && item.endDate) {
                filters.push(`${item.startDate} to ${item.endDate}`);
            }
        } else {
            if (!item.fullRange && item.startDate) {
                filters.push(`${item.startDate} to ${item.endDate}`);
            }
        }
        const filterStr = filters.length > 0 ? ` (${filters.join(', ')})` : '';

        // Different edit handler for tables vs charts
        const editHandler = isTable ? `openEditTableModal(${index})` : `openEditChartModal(${index})`;
        const itemIcon = isTable ? '📋' : '📊';

        return `
            <div class="report-item ${isTable ? 'report-item-table' : ''}">
                <span class="report-item-number">${itemIcon} ${index + 1}</span>
                <div class="report-item-info">
                    <div class="report-item-title">${escapeHtml(location)}${direction ? ' - ' + direction : ''}</div>
                    <div class="report-item-meta">${metaStr}${filterStr}</div>
                </div>
                <div class="report-item-actions">
                    <button onclick="moveReportItem(${index}, -1)" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button onclick="moveReportItem(${index}, 1)" title="Move down" ${index === reportItems.length - 1 ? 'disabled' : ''}>↓</button>
                    <button onclick="${editHandler}" title="Edit">✎</button>
                    <button onclick="duplicateReportItem(${index})" title="Duplicate">⧉</button>
                    <button class="delete" onclick="deleteReportItem(${index})" title="Delete">✕</button>
                </div>
            </div>
        `;
    }).join('');

    elements.generateReportBtn.disabled = false;
}

window.moveReportItem = function(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= reportItems.length) return;

    [reportItems[index], reportItems[newIndex]] = [reportItems[newIndex], reportItems[index]];
    renderReportItems();
};

window.duplicateReportItem = function(index) {
    const copy = { ...reportItems[index], studyMeta: { ...reportItems[index].studyMeta } };
    reportItems.splice(index + 1, 0, copy);
    renderReportItems();
    updatePageCount();
};

window.deleteReportItem = function(index) {
    reportItems.splice(index, 1);
    renderReportItems();
    updatePageCount();
};

function updatePageCount() {
    const chartsPerPage = parseInt(elements.reportChartsPerPage.value);

    // Separate charts and tables
    const charts = reportItems.filter(item => item.type !== 'table');
    const tables = reportItems.filter(item => item.type === 'table');

    // Calculate chart pages
    const chartPages = charts.length > 0 ? Math.ceil(charts.length / chartsPerPage) : 0;

    // Calculate table pages
    let tablePages = 0;
    tables.forEach(table => {
        if (table.tableType === 'daily-speed-bins') {
            // Daily Speed Bins is always 1 page
            tablePages += 1;
        } else {
            // Speed Summary and Volume Summary: 1 page per day
            const days = calculateDayCount(table.startDate, table.endDate);
            tablePages += days;
        }
    });

    const totalPages = chartPages + tablePages;
    const chartCount = charts.length;
    const tableCount = tables.length;

    let description = [];
    if (chartCount > 0) description.push(`${chartCount} chart${chartCount !== 1 ? 's' : ''}`);
    if (tableCount > 0) description.push(`${tableCount} table${tableCount !== 1 ? 's' : ''}`);

    elements.pageCountDisplay.textContent = `Total pages: ${totalPages} (${description.join(', ')})`;
}

function calculateDayCount(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
}

// ============ Data Table Modal Functions ============

function openAddTableModal() {
    editingTableItemIndex = -1;
    elements.tableModalTitle.textContent = 'Add Data Table';
    elements.saveTableModal.textContent = 'Add Table';

    // Reset form
    resetTableModal();

    // If we have a current study, pre-select it
    if (currentStudy) {
        tableModalSelectedStudyId = currentStudy.study_id;
        tableModalSelectedStudyMeta = currentStudy;
        updateTableSelectedStudyDisplay();
        updateTableTypeOptions();
        setTableFullRange();
    }

    elements.tableModal.style.display = 'flex';
}

window.openEditTableModal = function(index) {
    editingTableItemIndex = index;
    const item = reportItems[index];

    elements.tableModalTitle.textContent = 'Edit Data Table';
    elements.saveTableModal.textContent = 'Save Changes';

    // Populate form with item data
    tableModalSelectedStudyId = item.studyId;
    tableModalSelectedStudyMeta = item.studyMeta;
    updateTableSelectedStudyDisplay();
    updateTableTypeOptions();

    elements.tableModalType.value = item.tableType;
    elements.tableModalStartDate.value = item.startDate || '';
    elements.tableModalEndDate.value = item.endDate || '';

    updateTablePageCount();

    elements.tableModal.style.display = 'flex';
};

function closeTableModal() {
    elements.tableModal.style.display = 'none';
    if (elements.tableStudyList) {
        elements.tableStudyList.classList.remove('show');
    }
}

function resetTableModal() {
    tableModalSelectedStudyId = null;
    tableModalSelectedStudyMeta = null;
    elements.tableSelectedStudy.textContent = 'No study selected';
    elements.tableStudySearch.value = '';
    elements.tableModalType.value = 'speed-summary';
    elements.tableModalStartDate.value = '';
    elements.tableModalEndDate.value = '';
    elements.tablePageCount.textContent = '(0 pages)';
}

function updateTableSelectedStudyDisplay() {
    if (tableModalSelectedStudyMeta) {
        elements.tableSelectedStudy.innerHTML = `
            <strong>${escapeHtml(tableModalSelectedStudyMeta.location)}</strong>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">
                ${tableModalSelectedStudyMeta.direction || ''} | ${tableModalSelectedStudyMeta.study_type}
            </span>
        `;
    } else {
        elements.tableSelectedStudy.textContent = 'No study selected';
    }
}

function updateTableTypeOptions() {
    if (!tableModalSelectedStudyMeta) return;

    const studyType = tableModalSelectedStudyMeta.study_type;
    const select = elements.tableModalType;

    // Enable/disable options based on study type
    Array.from(select.options).forEach(option => {
        const tableType = DATA_TABLE_TYPES[option.value];
        if (tableType) {
            option.disabled = !tableType.allowedStudyTypes.includes(studyType);
        }
    });

    // If current selection is disabled, select first enabled option
    if (select.selectedOptions[0]?.disabled) {
        const firstEnabled = Array.from(select.options).find(opt => !opt.disabled);
        if (firstEnabled) select.value = firstEnabled.value;
    }
}

function filterTableStudyDropdown() {
    const query = elements.tableStudySearch.value.toLowerCase().trim();
    let studies = studyIndex.getAll();

    if (query) {
        studies = studies.filter(s => {
            const location = (s.location || '').toLowerCase();
            const counter = String(s.counter_number ?? '').toLowerCase();
            const id = String(s.study_id ?? '').toLowerCase();
            return location.includes(query) || counter.includes(query) || id.includes(query);
        });
    }

    // Limit to 20 results
    studies = studies.slice(0, 20);

    elements.tableStudyList.innerHTML = studies.map(s => `
        <div class="study-dropdown-item" onclick="selectTableModalStudy('${s.study_id}')">
            <div class="location">${escapeHtml(s.location)}</div>
            <div class="meta">${s.direction || ''} | ${s.study_type}</div>
        </div>
    `).join('');

    elements.tableStudyList.classList.add('show');
}

window.selectTableModalStudy = function(studyId) {
    const study = studyIndex.getById(studyId);
    if (study) {
        tableModalSelectedStudyId = studyId;
        tableModalSelectedStudyMeta = study;
        updateTableSelectedStudyDisplay();
        updateTableTypeOptions();
        setTableFullRange();
    }
    elements.tableStudyList.classList.remove('show');
    elements.tableStudySearch.value = '';
};

function setTableFullRange() {
    if (!tableModalSelectedStudyMeta) return;

    if (tableModalSelectedStudyMeta.start_datetime) {
        elements.tableModalStartDate.value = formatDateForInput(new Date(tableModalSelectedStudyMeta.start_datetime));
    }
    if (tableModalSelectedStudyMeta.end_datetime) {
        elements.tableModalEndDate.value = formatDateForInput(new Date(tableModalSelectedStudyMeta.end_datetime));
    }
    updateTablePageCount();
}

function onTableTypeChange() {
    updateTablePageCount();
}

function updateTablePageCount() {
    const tableType = elements.tableModalType.value;
    const startDate = elements.tableModalStartDate.value;
    const endDate = elements.tableModalEndDate.value;

    let pages = 0;
    if (tableType === 'daily-speed-bins') {
        pages = 1; // Always 1 page
    } else {
        pages = calculateDayCount(startDate, endDate);
    }

    elements.tablePageCount.textContent = `(${pages} page${pages !== 1 ? 's' : ''})`;
}

function saveTableItem() {
    if (!tableModalSelectedStudyId || !tableModalSelectedStudyMeta) {
        alert('Please select a study');
        return;
    }

    const startDate = elements.tableModalStartDate.value;
    const endDate = elements.tableModalEndDate.value;

    if (!startDate || !endDate) {
        alert('Please select a date range');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        alert('Start date must be before end date');
        return;
    }

    const item = {
        type: 'table',
        studyId: tableModalSelectedStudyId,
        studyMeta: tableModalSelectedStudyMeta,
        tableType: elements.tableModalType.value,
        startDate: startDate,
        endDate: endDate
    };

    if (editingTableItemIndex >= 0) {
        reportItems[editingTableItemIndex] = item;
    } else {
        reportItems.push(item);
    }

    closeTableModal();
    renderReportItems();
    updatePageCount();
}

function filterDataForItem(data, item) {
    return data.filter(d => {
        if (!d.datetime) return false;
        const dt = new Date(d.datetime);

        // Date range filter (with optional time)
        if (!item.fullRange) {
            if (item.startDate) {
                const startTime = item.startTime || '00:00';
                const start = new Date(item.startDate + 'T' + startTime + ':00');
                if (dt < start) return false;
            }
            if (item.endDate) {
                const endTime = item.endTime || '23:59';
                const end = new Date(item.endDate + 'T' + endTime + ':59');
                if (dt > end) return false;
            }
        }

        return true;
    });
}

async function generateReport() {
    if (reportItems.length === 0) {
        alert('Please add at least one item to the report');
        return;
    }

    elements.reportStatus.textContent = 'Loading resources...';
    elements.generateReportBtn.disabled = true;

    // Try to load logo from data folder
    let logoDataUrl = null;
    try {
        const logoFile = await fileSystem.getFileInFolder('montgomery_logo.png');
        if (logoFile) {
            const blob = await logoFile.getFile();
            logoDataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }
    } catch (e) {
        console.log('Logo not found in data folder, continuing without logo');
    }

    elements.reportStatus.textContent = 'Generating report...';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const chartsPerPage = parseInt(elements.reportChartsPerPage.value);

        // Separate charts and tables
        const chartItems = reportItems.filter(item => item.type !== 'table');
        const tableItems = reportItems.filter(item => item.type === 'table');

        // Get first study info for header
        let firstStudy = null;
        let overallStats = null;
        let firstItem = null;

        if (chartItems.length > 0) {
            firstStudy = chartItems[0].studyMeta;
            firstItem = chartItems[0];
            const firstData = await studyIndex.loadStudyData(chartItems[0].studyId);
            const firstFiltered = filterDataForItem(firstData, chartItems[0]);

            // Extract percentiles for Radar studies
            let firstPercentiles = null;
            if (firstStudy?.study_type === 'Radar') {
                firstPercentiles = await studyIndex.extractRadarPercentiles(chartItems[0].studyId);
            }
            overallStats = pdfGen.calculateReportStatistics(firstFiltered, firstPercentiles);
        }

        // Calculate date range for header - only show if all items share the same range
        let dateRangeStr = '';
        if (reportItems.length > 0) {
            // Get effective date range for each item (either from dates or study range if fullRange)
            const getEffectiveDates = (item) => {
                if (item.fullRange && item.studyMeta) {
                    // Handle different date formats: "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS", "MM/DD/YYYY", etc.
                    const extractDate = (dateStr) => {
                        if (!dateStr) return '';
                        // If it contains T or space, split and take first part
                        let datePart = dateStr.split('T')[0].split(' ')[0];
                        // If it's MM/DD/YYYY format, convert to YYYY-MM-DD
                        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(datePart)) {
                            const parts = datePart.split('/');
                            datePart = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                        }
                        return datePart;
                    };
                    return {
                        start: extractDate(item.studyMeta.start_datetime),
                        end: extractDate(item.studyMeta.end_datetime)
                    };
                }
                return { start: item.startDate || '', end: item.endDate || '' };
            };

            const firstDates = getEffectiveDates(reportItems[0]);
            const allSameRange = reportItems.every(item => {
                const dates = getEffectiveDates(item);
                return dates.start === firstDates.start && dates.end === firstDates.end;
            });

            if (allSameRange && firstDates.start && firstDates.end) {
                const start = new Date(firstDates.start + 'T12:00:00');
                const end = new Date(firstDates.end + 'T12:00:00');
                // Only set date range if dates are valid
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    dateRangeStr = `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
                }
            }
        }

        let chartsOnPage = 0;
        let chartY = 0;

        // Draw header on first page and get dynamic Y position
        if (chartItems.length > 0) {
            const headerEndY = pdfGen.drawHeader(doc, {
                logoDataUrl,
                location: firstStudy?.location,
                direction: firstStudy?.direction,
                dateRange: dateRangeStr,
                counter: firstStudy?.counter_number,
                speedLimit: firstStudy?.speed_limit,
                stats: overallStats,
                isFirstPage: true
            });
            chartY = headerEndY + 12; // Add spacing after header for chart title
        } else {
            chartY = 40;
        }

        // Process chart items
        for (let i = 0; i < chartItems.length; i++) {
            const item = chartItems[i];
            elements.reportStatus.textContent = `Generating chart ${i + 1} of ${chartItems.length}...`;

            const studyData = await studyIndex.loadStudyData(item.studyId);
            const filteredData = filterDataForItem(studyData, item);

            if (filteredData.length === 0) {
                console.warn(`No data for chart ${i + 1}`);
                continue;
            }

            // Extract percentiles for Radar studies
            let itemPercentiles = null;
            if (item.studyMeta?.study_type === 'Radar') {
                itemPercentiles = await studyIndex.extractRadarPercentiles(item.studyId);
            }

            // Aggregate data with extracted percentiles for accurate p85
            const aggregatedData = item.timeAgg === 'hourly'
                ? pdfGen.aggregateHourly(filteredData, itemPercentiles)
                : pdfGen.aggregateDaily(filteredData, itemPercentiles);

            if (aggregatedData.length === 0) continue;

            // Larger chart sizes for better readability
            const chartHeight = chartsPerPage === 1 ? 180 : 100;
            const chartSpacing = chartsPerPage === 1 ? 190 : 115;

            // Check if need new page
            if (chartsOnPage >= chartsPerPage) {
                doc.addPage();
                chartsOnPage = 0;

                // Continuation header - use dynamic Y position
                const headerEndY = pdfGen.drawHeader(doc, {
                    logoDataUrl,
                    location: item.studyMeta?.location,
                    direction: item.studyMeta?.direction,
                    isContinuation: true
                });
                chartY = headerEndY + 12; // Add spacing for chart title
            }

            // Build chart title
            const chartTitle = `${item.studyMeta.location}${item.studyMeta.direction ? ' (' + item.studyMeta.direction + ')' : ''} - ${CHART_TYPE_NAMES[item.chartType]}`;

            // Draw chart using vector graphics
            pdfGen.drawChartByType(doc, item.chartType, aggregatedData, {
                x: 10,
                y: chartY,
                width: pageWidth - 20,
                height: chartHeight,
                title: chartTitle,
                speedLimit: item.studyMeta.speed_limit || 0,
                showLabels: item.showLabels
            });

            chartY += chartSpacing;
            chartsOnPage++;
        }

        // Process table items
        for (let i = 0; i < tableItems.length; i++) {
            const item = tableItems[i];
            const tableType = item.tableType;

            elements.reportStatus.textContent = `Generating table ${i + 1} of ${tableItems.length}...`;

            const studyData = await studyIndex.loadStudyData(item.studyId);

            if (tableType === 'daily-speed-bins') {
                doc.addPage();
                pdfGen.generateDailySpeedBinsTable(
                    doc,
                    studyData,
                    item.startDate,
                    item.endDate,
                    item.studyMeta.speed_limit || 25,
                    item.studyMeta,
                    logoDataUrl
                );
            } else {
                const startDate = new Date(item.startDate);
                const endDate = new Date(item.endDate);

                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    doc.addPage();

                    if (tableType === 'speed-summary') {
                        pdfGen.generateSpeedSummaryTable(
                            doc,
                            studyData,
                            dateStr,
                            item.studyMeta.speed_limit || 25,
                            item.studyMeta,
                            logoDataUrl
                        );
                    } else {
                        pdfGen.generateVolumeSummaryTable(
                            doc,
                            studyData,
                            dateStr,
                            item.studyMeta,
                            logoDataUrl
                        );
                    }
                }
            }
        }

        // Restore chart view if a study is selected
        if (currentStudy && currentStudyData) {
            updateChart();
        }

        // Page numbers on all pages
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Page ${i} of ${pageCount}`,
                pageWidth / 2, pageHeight - 8, { align: 'center' }
            );
        }

        // Filename with date prefix
        const dateStr = new Date().toISOString().slice(0, 10);
        const reportTitle = elements.reportTitle.value || 'Traffic Study Report';
        const fileName = `(${dateStr}) ${reportTitle.replace(/[^a-z0-9 ]/gi, '').substring(0, 50)}.pdf`;

        doc.save(fileName);
        elements.reportStatus.textContent = `Report saved as ${fileName}`;

    } catch (error) {
        console.error('Error generating report:', error);
        elements.reportStatus.textContent = `Error: ${error.message}`;
    } finally {
        elements.generateReportBtn.disabled = reportItems.length === 0;
    }
}

// Auto-add current study chart when switching to reports tab
function updateReportPanel() {
    // If no items and we have a current study, suggest adding it
    if (reportItems.length === 0 && currentStudy) {
        // Don't auto-add, just let user know they can add
    }
}

// ============ Report Presets ============

async function loadPresets() {
    try {
        const content = await fileSystem.readFileIfExists(PRESETS_FILE);
        if (content) {
            const data = JSON.parse(content);
            presets = data.presets || [];
        } else {
            presets = [];
        }
    } catch (error) {
        console.error('Error loading presets:', error);
        presets = [];
    }
    renderPresetSelect();
}

async function savePresetsToFile() {
    try {
        const content = JSON.stringify({ presets }, null, 2);
        await fileSystem.writeFile(PRESETS_FILE, content);
    } catch (error) {
        console.error('Error saving presets:', error);
        alert('Failed to save presets: ' + error.message);
    }
}

function renderPresetSelect() {
    if (!elements.presetSelect) return;

    elements.presetSelect.innerHTML = '<option value="">Select a preset...</option>' +
        presets.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

    if (elements.applyPresetBtn) {
        elements.applyPresetBtn.disabled = true;
    }
}

function onPresetSelectChange() {
    if (elements.applyPresetBtn && elements.presetSelect) {
        elements.applyPresetBtn.disabled = !elements.presetSelect.value;
    }
}

function getStudyDays(study) {
    const start = new Date(study.start_datetime);
    const end = new Date(study.end_datetime);
    const days = [];

    // Normalize to start of day
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
    }
    return days;
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function applyPreset() {
    const presetId = elements.presetSelect.value;
    if (!presetId) {
        alert('Please select a preset');
        return;
    }

    if (!currentStudy) {
        alert('Please select a study from the sidebar first');
        return;
    }

    const preset = presets.find(p => p.id === presetId);
    if (!preset) {
        alert('Preset not found');
        return;
    }

    const studyDays = getStudyDays(currentStudy);

    for (const presetItem of preset.items) {
        if (presetItem.eachDay && studyDays.length > 0) {
            // Create one chart per day
            for (const day of studyDays) {
                const dateStr = formatDateForInput(day);
                const item = {
                    studyId: currentStudy.study_id,
                    studyMeta: { ...currentStudy },
                    chartType: presetItem.chartType,
                    timeAgg: presetItem.timeAgg,
                    fullRange: false,
                    startDate: dateStr,
                    startTime: '00:00',
                    endDate: dateStr,
                    endTime: '23:59',
                    showLabels: presetItem.showLabels,
                    eachDay: false // Already expanded
                };
                reportItems.push(item);
            }
        } else {
            // Single chart for full study range
            const item = {
                studyId: currentStudy.study_id,
                studyMeta: { ...currentStudy },
                chartType: presetItem.chartType,
                timeAgg: presetItem.timeAgg,
                fullRange: true,
                startDate: '',
                startTime: '00:00',
                endDate: '',
                endTime: '23:59',
                showLabels: presetItem.showLabels,
                eachDay: false
            };
            reportItems.push(item);
        }
    }

    renderReportItems();
    updatePageCount();
    elements.presetSelect.value = '';
    elements.applyPresetBtn.disabled = true;
}

function openSavePresetModal() {
    if (reportItems.length === 0) {
        alert('No charts to save. Add some charts first.');
        return;
    }

    editingPresetId = null;
    elements.savePresetModalTitle.textContent = 'Save Preset';
    elements.presetNameInput.value = '';
    elements.savePresetModal.style.display = 'flex';
    elements.presetNameInput.focus();
}

function closeSavePresetModal() {
    elements.savePresetModal.style.display = 'none';
    editingPresetId = null;
}

async function confirmSavePreset() {
    const name = elements.presetNameInput.value.trim();
    if (!name) {
        alert('Please enter a preset name');
        return;
    }

    if (editingPresetId) {
        // Renaming existing preset
        const preset = presets.find(p => p.id === editingPresetId);
        if (preset) {
            preset.name = name;
        }
    } else {
        // Creating new preset from current reportItems
        const presetItems = reportItems
            .filter(item => item.type !== 'table') // Only charts, not tables
            .map(item => ({
                chartType: item.chartType,
                timeAgg: item.timeAgg,
                showLabels: item.showLabels,
                eachDay: item.eachDay || false
            }));

        if (presetItems.length === 0) {
            alert('No charts to save. Tables are not included in presets.');
            return;
        }

        const newPreset = {
            id: 'preset-' + Date.now(),
            name: name,
            items: presetItems
        };

        presets.push(newPreset);
    }

    await savePresetsToFile();
    renderPresetSelect();
    closeSavePresetModal();
}

function openPresetModal() {
    renderPresetList();
    elements.presetModal.style.display = 'flex';
}

function closePresetModal() {
    elements.presetModal.style.display = 'none';
}

function renderPresetList() {
    if (!elements.presetList) return;

    if (presets.length === 0) {
        elements.presetList.innerHTML = '<p class="empty-list-message">No presets saved yet.</p>';
        return;
    }

    elements.presetList.innerHTML = presets.map(preset => {
        const chartCount = preset.items.length;
        const eachDayCount = preset.items.filter(i => i.eachDay).length;
        let meta = `${chartCount} chart${chartCount !== 1 ? 's' : ''}`;
        if (eachDayCount > 0) {
            meta += ` (${eachDayCount} per-day)`;
        }

        return `
            <div class="preset-item">
                <div class="preset-item-info">
                    <div class="preset-item-name">${escapeHtml(preset.name)}</div>
                    <div class="preset-item-meta">${meta}</div>
                </div>
                <div class="preset-item-actions">
                    <button onclick="renamePreset('${preset.id}')" title="Rename">✎</button>
                    <button class="delete" onclick="deletePreset('${preset.id}')" title="Delete">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

window.renamePreset = function(presetId) {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    editingPresetId = presetId;
    elements.savePresetModalTitle.textContent = 'Rename Preset';
    elements.presetNameInput.value = preset.name;
    elements.savePresetModal.style.display = 'flex';
    elements.presetNameInput.focus();
};

window.deletePreset = async function(presetId) {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    if (!confirm(`Delete preset "${preset.name}"?`)) return;

    presets = presets.filter(p => p.id !== presetId);
    await savePresetsToFile();
    renderPresetSelect();
    renderPresetList();
};

function clearReportItems() {
    if (reportItems.length === 0) return;

    if (!confirm('Clear all items from the report?')) return;

    reportItems = [];
    renderReportItems();
    updatePageCount();
}

// ============ Pending Studies ============

function setupButtonGroupToggles() {
    // Type buttons - MULTI-SELECT (toggle behavior)
    if (elements.pendingTypeGroup) {
        elements.pendingTypeGroup.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Toggle this button
                btn.classList.toggle('active');

                // If "Any" is clicked and now active, deselect all others
                if (btn.dataset.value === 'Any' && btn.classList.contains('active')) {
                    elements.pendingTypeGroup.querySelectorAll('.type-btn').forEach(b => {
                        if (b !== btn) b.classList.remove('active');
                    });
                }
                // If a non-Any button is clicked, deselect "Any"
                else if (btn.dataset.value !== 'Any' && btn.classList.contains('active')) {
                    const anyBtn = elements.pendingTypeGroup.querySelector('[data-value="Any"]');
                    if (anyBtn) anyBtn.classList.remove('active');
                }
            });
        });
    }

    // Priority buttons - single select
    if (elements.pendingPriorityGroup) {
        elements.pendingPriorityGroup.querySelectorAll('.priority-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.pendingPriorityGroup.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // Status buttons - single select
    if (elements.pendingStatusGroup) {
        elements.pendingStatusGroup.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.pendingStatusGroup.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
}

async function loadPendingStudies() {
    try {
        const content = await fileSystem.readFileIfExists(PENDING_FILE);
        if (content) {
            pendingStudies = JSON.parse(content);
        } else {
            pendingStudies = [];
        }
    } catch (error) {
        console.error('Error loading pending studies:', error);
        pendingStudies = [];
    }
    renderPendingList();
}

async function savePendingStudiesToFile() {
    try {
        const content = JSON.stringify(pendingStudies, null, 2);
        await fileSystem.writeFile(PENDING_FILE, content);
    } catch (error) {
        console.error('Error saving pending studies:', error);
        alert('Failed to save pending studies: ' + error.message);
    }
}

function renderPendingList() {
    if (!elements.pendingList) return;

    // Filter and sort studies
    let filtered = [...pendingStudies];

    // Apply status filter
    if (pendingFilter !== 'all') {
        filtered = filtered.filter(s => s.status === pendingFilter);
    }

    // Sort: non-complete first by priority (high, normal, low), then by date (earliest first), then complete at bottom
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    filtered.sort((a, b) => {
        // Complete items go to bottom
        if (a.status === 'complete' && b.status !== 'complete') return 1;
        if (b.status === 'complete' && a.status !== 'complete') return -1;

        // Sort by priority first
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Within same priority, sort by date requested (earliest first)
        const dateA = a.dateRequested ? new Date(a.dateRequested + 'T12:00:00') : new Date('9999-12-31');
        const dateB = b.dateRequested ? new Date(b.dateRequested + 'T12:00:00') : new Date('9999-12-31');
        return dateA - dateB;
    });

    if (filtered.length === 0) {
        const emptyMessage = pendingFilter === 'all'
            ? 'No pending studies yet.'
            : `No ${pendingFilter.replace('-', ' ')} studies.`;
        elements.pendingList.innerHTML = `
            <div class="pending-empty">
                <p>${emptyMessage}</p>
                <p class="help-text">Click "Add Study" to track a new study request.</p>
            </div>
        `;
        return;
    }

    elements.pendingList.innerHTML = filtered.map(study => {
        const statusClass = study.status;
        const statusLabels = {
            'pending': 'Pending',
            'sent': 'Sent',
            'in-progress': 'In Progress',
            'complete': 'Complete'
        };
        const statusLabel = statusLabels[study.status] || study.status;

        // Handle type as array or string (backwards compatibility)
        const types = Array.isArray(study.type) ? study.type : (study.type ? [study.type] : []);
        const typeBadges = types.map(t => {
            const typeClass = t.toLowerCase().replace(/\s+/g, '-');
            return `<span class="pending-type-badge ${typeClass}">${t}</span>`;
        }).join(' ');

        // Fix timezone issue: add time component to prevent date shift
        const dateStr = study.dateRequested
            ? new Date(study.dateRequested + 'T12:00:00').toLocaleDateString()
            : '';

        return `
            <div class="pending-item ${study.status === 'complete' ? 'complete' : ''}" data-id="${study.id}">
                <div class="pending-item-priority ${study.priority}"></div>
                <div class="pending-item-content">
                    <div class="pending-item-header">
                        <span class="pending-item-location">${escapeHtml(study.location)}</span>
                        <span class="pending-item-status ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="pending-item-meta">
                        ${typeBadges}
                        ${study.requestedBy ? `<span>By: ${escapeHtml(study.requestedBy)}</span>` : ''}
                        ${dateStr ? `<span>Requested: ${dateStr}</span>` : ''}
                    </div>
                    ${study.notes ? `<div class="pending-item-notes">${escapeHtml(study.notes)}</div>` : ''}
                </div>
                <div class="pending-item-actions">
                    <button onclick="window.editPendingStudy('${study.id}')" title="Edit">&#9998;</button>
                    ${study.status !== 'complete'
                        ? `<button class="complete" onclick="window.markPendingComplete('${study.id}')" title="Mark Complete">&#10003;</button>`
                        : `<button class="undo" onclick="window.markPendingPending('${study.id}')" title="Mark Pending">&#8634;</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

function openAddPendingModal() {
    editingPendingId = null;
    elements.pendingModalTitle.textContent = 'Add Pending Study';
    elements.deletePendingBtn.style.display = 'none';
    elements.savePendingModal.textContent = 'Add Study';

    // Reset form
    elements.pendingLocation.value = '';
    elements.pendingRequestedBy.value = '';
    elements.pendingDate.value = new Date().toISOString().slice(0, 10);
    elements.pendingNotes.value = '';

    // Reset button groups
    resetButtonGroup(elements.pendingTypeGroup, null);
    resetButtonGroup(elements.pendingPriorityGroup, 'normal');
    resetButtonGroup(elements.pendingStatusGroup, 'pending');

    elements.pendingModal.style.display = 'flex';
}

window.editPendingStudy = function(id) {
    const study = pendingStudies.find(s => s.id === id);
    if (!study) return;

    editingPendingId = id;
    elements.pendingModalTitle.textContent = 'Edit Pending Study';
    elements.deletePendingBtn.style.display = 'inline-block';
    elements.savePendingModal.textContent = 'Save Changes';

    // Fill form
    elements.pendingLocation.value = study.location;
    elements.pendingRequestedBy.value = study.requestedBy || '';
    elements.pendingDate.value = study.dateRequested || '';
    elements.pendingNotes.value = study.notes || '';

    // Set button groups - type can be array or string (for backwards compatibility)
    const typeValue = Array.isArray(study.type) ? study.type : (study.type ? [study.type] : []);
    resetButtonGroup(elements.pendingTypeGroup, typeValue);
    resetButtonGroup(elements.pendingPriorityGroup, study.priority);
    resetButtonGroup(elements.pendingStatusGroup, study.status);

    elements.pendingModal.style.display = 'flex';
};

window.markPendingComplete = function(id) {
    const study = pendingStudies.find(s => s.id === id);
    if (study) {
        study.status = 'complete';
        savePendingStudiesToFile();
        renderPendingList();
    }
};

window.markPendingPending = function(id) {
    const study = pendingStudies.find(s => s.id === id);
    if (study) {
        study.status = 'pending';
        savePendingStudiesToFile();
        renderPendingList();
    }
};

function resetButtonGroup(groupEl, activeValue) {
    if (!groupEl) return;
    const buttons = groupEl.querySelectorAll('button');

    // Handle array of values for multi-select
    const activeValues = Array.isArray(activeValue) ? activeValue : (activeValue ? [activeValue] : []);

    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (activeValues.includes(btn.dataset.value)) {
            btn.classList.add('active');
        }
    });
}

function getButtonGroupValue(groupEl, multiSelect = false) {
    if (!groupEl) return multiSelect ? [] : null;

    if (multiSelect) {
        const activeBtns = groupEl.querySelectorAll('.active');
        return Array.from(activeBtns).map(btn => btn.dataset.value);
    } else {
        const activeBtn = groupEl.querySelector('.active');
        return activeBtn ? activeBtn.dataset.value : null;
    }
}

function closePendingModal() {
    elements.pendingModal.style.display = 'none';
    editingPendingId = null;
}

async function savePendingStudy() {
    const location = elements.pendingLocation.value.trim();
    if (!location) {
        alert('Location is required');
        return;
    }

    // Get types as array (multi-select)
    const types = getButtonGroupValue(elements.pendingTypeGroup, true);
    if (types.length === 0) {
        alert('Please select at least one study type');
        return;
    }

    const studyData = {
        location,
        type: types, // Now stored as array
        requestedBy: elements.pendingRequestedBy.value.trim(),
        dateRequested: elements.pendingDate.value,
        priority: getButtonGroupValue(elements.pendingPriorityGroup) || 'normal',
        status: getButtonGroupValue(elements.pendingStatusGroup) || 'pending',
        notes: elements.pendingNotes.value.trim()
    };

    if (editingPendingId) {
        // Update existing
        const index = pendingStudies.findIndex(s => s.id === editingPendingId);
        if (index !== -1) {
            pendingStudies[index] = { ...pendingStudies[index], ...studyData };
        }
    } else {
        // Create new
        studyData.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        studyData.createdAt = new Date().toISOString();
        pendingStudies.push(studyData);
    }

    await savePendingStudiesToFile();
    renderPendingList();
    closePendingModal();
}

async function deletePendingStudy() {
    if (!editingPendingId) return;

    if (confirm('Are you sure you want to delete this pending study?')) {
        pendingStudies = pendingStudies.filter(s => s.id !== editingPendingId);
        await savePendingStudiesToFile();
        renderPendingList();
        closePendingModal();
    }
}

// ============ Theme ============

function setTheme(dark) {
    isDarkTheme = dark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    storage.set('theme', dark ? 'dark' : 'light');
    updateChartTheme(dark);
}

// ============ Utilities ============

function showLoading(message = 'Loading...') {
    elements.loadingMessage.textContent = message;
    elements.loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ Start ============
init();
