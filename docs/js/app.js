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
let studyMarkers = new Map(); // Map study_id to marker for zooming
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
    studyCount: document.getElementById('study-count'),

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

    // Study info
    studyTitle: document.getElementById('study-title'),
    studyTypeBadge: document.getElementById('study-type-badge'),
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
    mapStudyCount: document.getElementById('map-study-count'),

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

// Table modal state
let tableModalSelectedStudyId = null;
let tableModalSelectedStudyMeta = null;
let editingTableItemIndex = -1;

// Pending studies state
let pendingStudies = [];
let editingPendingId = null;
let pendingFilter = 'all';
const PENDING_FILE = 'pending_studies.json';

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

    elements.studyCount.textContent = studies.length;

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
        expandedGroups.add(linkGroup);
    }
    updateStudyList();
}

// ============ Study Selection ============

async function selectStudy(studyId) {
    showLoading('Loading study data...');

    try {
        currentStudy = studyIndex.getById(studyId);
        if (!currentStudy) throw new Error('Study not found');

        currentStudyData = await studyIndex.loadStudyData(studyId);
        filteredStudyData = currentStudyData;

        // For Radar studies, extract 85th percentile from raw file
        extractedPercentiles = null;
        if (currentStudy.study_type === 'Radar') {
            extractedPercentiles = await studyIndex.extractRadarPercentiles(studyId);
        }

        // Set date range inputs based on study data
        setDateRangeFromData();

        updateStudyInfo();
        updateChartTypeOptions();
        updateChart();
        updateStats();

        elements.chartPlaceholder.style.display = 'none';
        elements.chartContainer.style.display = 'flex';
        elements.generateReportBtn.disabled = false;

        updateStudyList();
        updateReportPanel();

        // Zoom to study on map
        zoomToStudy(studyId);

        hideLoading();

    } catch (error) {
        console.error('Error loading study:', error);
        alert(`Error loading study: ${error.message}`);
        hideLoading();
    }
}

function setDateRangeFromData() {
    if (!currentStudyData || currentStudyData.length === 0) return;

    const dates = currentStudyData
        .map(d => d.datetime)
        .filter(d => d)
        .sort((a, b) => a - b);

    if (dates.length > 0) {
        const minDate = dates[0];
        const maxDate = dates[dates.length - 1];

        elements.chartStartDate.value = formatDateForInput(minDate);
        elements.chartEndDate.value = formatDateForInput(maxDate);
    }
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

function initMap() {
    if (map) return;

    map = L.map(elements.mapContainer).setView([MAP_CENTER.lat, MAP_CENTER.lon], MAP_CENTER.zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    updateMapMarkers();

    setTimeout(() => map.invalidateSize(), 100);
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

    elements.mapStudyCount.textContent = `${studies.length} studies (${markerCount} markers)`;

    if (studies.length > 0) {
        const bounds = L.latLngBounds(studies.map(s => [s.lat, s.lon]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function getMarkerColor(studyType) {
    return MARKER_COLORS[studyType] || '#666666';
}

function addLinkedMarker(studies) {
    let totalLat = 0, totalLon = 0;
    studies.forEach(s => { totalLat += s.lat; totalLon += s.lon; });
    const centLat = totalLat / studies.length;
    const centLon = totalLon / studies.length;

    const firstType = studies[0].study_type;
    const allSameType = studies.every(s => s.study_type === firstType);
    const markerColor = allSameType ? getMarkerColor(firstType) : '#9333ea';

    let popupHtml = `<div class="popup-title">🔗 ${escapeHtml(studies[0].location)}</div><hr style="margin:8px 0">`;

    studies.forEach(s => {
        popupHtml += `
            <div style="margin:8px 0;padding:8px;background:var(--bg-secondary, #f5f5f5);border-radius:4px;">
                <strong>${s.direction || 'Unknown'}</strong> (ID: ${s.study_id})<br>
                <small>${s.study_type} | ${formatDateRange(s.start_datetime, s.end_datetime)}</small><br>
                <button class="popup-btn" style="margin-top:5px" onclick="window.viewStudy('${s.study_id}')">View</button>
            </div>
        `;
    });

    const icon = L.divIcon({
        className: 'linked-marker',
        html: `<div style="background:${markerColor};color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);font-size:14px;">🔗</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });

    const marker = L.marker([centLat, centLon], { icon }).bindPopup(popupHtml, { maxWidth: 300, maxHeight: 400 });
    markersLayer.addLayer(marker);

    // Store marker for each study in this group
    studies.forEach(s => studyMarkers.set(s.study_id, marker));
}

function addSingleMarker(study) {
    const color = getMarkerColor(study.study_type);

    const popupHtml = `
        <div class="popup-title">${escapeHtml(study.location)}</div>
        <div class="popup-info">
            <div><strong>Type:</strong> ${study.study_type}</div>
            <div><strong>Direction:</strong> ${study.direction || 'N/A'}</div>
            <div><strong>Dates:</strong> ${formatDateRange(study.start_datetime, study.end_datetime)}</div>
            ${study.speed_limit ? `<div><strong>Speed Limit:</strong> ${study.speed_limit} mph</div>` : ''}
        </div>
        <button class="popup-btn" onclick="window.viewStudy('${study.study_id}')">View Study</button>
    `;

    const icon = L.divIcon({
        className: 'single-marker',
        html: `<div style="background:${color};border-radius:50%;width:24px;height:24px;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const marker = L.marker([study.lat, study.lon], { icon }).bindPopup(popupHtml);
    markersLayer.addLayer(marker);

    studyMarkers.set(study.study_id, marker);
}

function zoomToStudy(studyId) {
    if (!map) return;

    const study = studyIndex.getById(studyId);
    if (!study || !study.lat || !study.lon) return;

    // Zoom to the study location
    map.setView([study.lat, study.lon], 15, { animate: true });

    // Open the popup for this study's marker
    const marker = studyMarkers.get(studyId);
    if (marker) {
        marker.openPopup();
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
        showLabels: elements.chartModalShowLabels.checked
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

// ============ Pending Studies ============

function setupButtonGroupToggles() {
    // Type buttons
    if (elements.pendingTypeGroup) {
        elements.pendingTypeGroup.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.pendingTypeGroup.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // Priority buttons
    if (elements.pendingPriorityGroup) {
        elements.pendingPriorityGroup.querySelectorAll('.priority-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.pendingPriorityGroup.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // Status buttons
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
        const dateA = a.dateRequested ? new Date(a.dateRequested) : new Date('9999-12-31');
        const dateB = b.dateRequested ? new Date(b.dateRequested) : new Date('9999-12-31');
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
        const statusLabel = study.status === 'in-progress' ? 'In Progress'
            : study.status.charAt(0).toUpperCase() + study.status.slice(1);

        const typeClass = study.type.toLowerCase().replace(/\s+/g, '-');
        const dateStr = study.dateRequested
            ? new Date(study.dateRequested).toLocaleDateString()
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
                        <span class="pending-type-badge ${typeClass}">${study.type}</span>
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

    // Set button groups
    resetButtonGroup(elements.pendingTypeGroup, study.type);
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
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (activeValue && btn.dataset.value === activeValue) {
            btn.classList.add('active');
        }
    });
}

function getButtonGroupValue(groupEl) {
    if (!groupEl) return null;
    const activeBtn = groupEl.querySelector('.active');
    return activeBtn ? activeBtn.dataset.value : null;
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

    const type = getButtonGroupValue(elements.pendingTypeGroup);
    if (!type) {
        alert('Please select a study type');
        return;
    }

    const studyData = {
        location,
        type,
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
