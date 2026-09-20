/**
 * app.js
 * לוח עריכה וסידור סצנות לספר - לוגיקה מרכזית
 * כולל: Drag & Drop, Google Sheets parser, סינון וחיפוש, ייצוא ואינטראקציות
 */

(function () {
  'use strict';

  // --- Constants & Storage Keys ---
  const STORAGE_KEY = 'book_scenes_editor_data_v1';
  const STORAGE_SHEET_KEY = 'book_scenes_sheet_url_v1';

  // --- Application State ---
  let state = {
    scenes: [],
    originalScenes: [],
    viewMode: 'grid', // 'grid' | 'timeline' | 'compact'
    filters: {
      search: '',
      pov: 'all',
      location: 'all',
      time: 'all'
    },
    sheetUrl: '',
    draggedId: null,
    editingSceneId: null
  };

  // --- DOM Elements ---
  const elements = {
    scenesContainer: document.getElementById('scenesContainer'),
    totalScenesCount: document.getElementById('totalScenesCount'),
    filteredCountDisplay: document.getElementById('filteredCountDisplay'),
    searchInput: document.getElementById('searchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    povChipsContainer: document.getElementById('povChipsContainer'),
    locationFilterSelect: document.getElementById('locationFilterSelect'),
    timeFilterSelect: document.getElementById('timeFilterSelect'),
    activeFilterBadge: document.getElementById('activeFilterBadge'),
    activeFilterText: document.getElementById('activeFilterText'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    emptyState: document.getElementById('emptyState'),
    
    // View Switchers
    viewGridBtn: document.getElementById('viewGridBtn'),
    viewTimelineBtn: document.getElementById('viewTimelineBtn'),
    viewCompactBtn: document.getElementById('viewCompactBtn'),

    // Top action buttons
    btnSyncSheets: document.getElementById('btnSyncSheets'),
    btnAddScene: document.getElementById('btnAddScene'),
    btnResetOrder: document.getElementById('btnResetOrder'),
    btnExport: document.getElementById('btnExport'),

    // Modals
    sheetsModal: document.getElementById('sheetsModal'),
    sheetUrlInput: document.getElementById('sheetUrlInput'),
    btnFetchSheet: document.getElementById('btnFetchSheet'),
    csvFileInput: document.getElementById('csvFileInput'),
    btnLoadDefaultData: document.getElementById('btnLoadDefaultData'),
    
    sceneModal: document.getElementById('sceneModal'),
    sceneModalTitle: document.getElementById('sceneModalTitle'),
    sceneForm: document.getElementById('sceneForm'),
    inputSceneId: document.getElementById('inputSceneId'),
    inputSceneTitle: document.getElementById('inputSceneTitle'),
    inputScenePov: document.getElementById('inputScenePov'),
    inputSceneLocation: document.getElementById('inputSceneLocation'),
    inputSceneTime: document.getElementById('inputSceneTime'),
    inputSceneSummary: document.getElementById('inputSceneSummary'),
    inputSceneRevealed: document.getElementById('inputSceneRevealed'),
    inputSceneSource: document.getElementById('inputSceneSource'),

    exportModal: document.getElementById('exportModal'),
    exportPreviewText: document.getElementById('exportPreviewText'),
    btnCopyFormatted: document.getElementById('btnCopyFormatted'),
    btnCopyCsv: document.getElementById('btnCopyCsv'),
    btnDownloadCsv: document.getElementById('btnDownloadCsv'),
    btnDownloadJson: document.getElementById('btnDownloadJson'),

    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================================================
  // Initialization
  // ==========================================================================
  function init() {
    loadSavedData();
    setupEventListeners();
    renderApp();
  }

  function loadSavedData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        state.scenes = JSON.parse(saved);
      } else if (typeof DEFAULT_SCENES !== 'undefined' && Array.isArray(DEFAULT_SCENES)) {
        state.scenes = JSON.parse(JSON.stringify(DEFAULT_SCENES));
      } else {
        state.scenes = [];
      }
      state.originalScenes = JSON.parse(JSON.stringify(state.scenes));
      state.sheetUrl = localStorage.getItem(STORAGE_SHEET_KEY) || '';
      if (elements.sheetUrlInput) elements.sheetUrlInput.value = state.sheetUrl;
    } catch (e) {
      console.error('Error loading saved scenes:', e);
      state.scenes = (typeof DEFAULT_SCENES !== 'undefined') ? JSON.parse(JSON.stringify(DEFAULT_SCENES)) : [];
      state.originalScenes = JSON.parse(JSON.stringify(state.scenes));
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scenes));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================
  function renderApp() {
    updateFilterOptions();
    renderScenes();
    updateStats();
  }

  function getFilteredScenes() {
    const query = state.filters.search.trim().toLowerCase();
    const povFilter = state.filters.pov;
    const locationFilter = state.filters.location;
    const timeFilter = state.filters.time;

    return state.scenes.filter((scene) => {
      // Search text across all fields
      if (query) {
        const textToSearch = [
          scene.id,
          scene.title,
          scene.pov,
          scene.location,
          scene.time,
          scene.summary,
          scene.revealedInfo,
          scene.source
        ].join(' ').toLowerCase();

        if (!textToSearch.includes(query)) return false;
      }

      // POV Filter
      if (povFilter !== 'all' && scene.pov !== povFilter) {
        return false;
      }

      // Location Filter
      if (locationFilter !== 'all' && scene.location !== locationFilter) {
        return false;
      }

      // Time Filter
      if (timeFilter !== 'all' && scene.time !== timeFilter) {
        return false;
      }

      return true;
    });
  }

  function renderScenes() {
    const filteredScenes = getFilteredScenes();
    const container = elements.scenesContainer;
    container.innerHTML = '';

    // Update container view mode class
    container.className = `scenes-container ${state.viewMode}-view`;

    if (filteredScenes.length === 0) {
      elements.emptyState.style.display = 'block';
      container.style.display = 'none';
      return;
    }

    elements.emptyState.style.display = 'none';
    container.style.display = (state.viewMode === 'grid') ? 'grid' : 'flex';

    filteredScenes.forEach((scene) => {
      // Global sequence index (1-based position in whole scenes array)
      const globalIndex = state.scenes.findIndex(s => s.id === scene.id) + 1;
      const card = createSceneCardElement(scene, globalIndex);
      container.appendChild(card);
    });

    attachDragAndDropHandlers();
  }

  function createSceneCardElement(scene, sequenceNum) {
    const card = document.createElement('article');
    card.className = 'scene-card';
    card.setAttribute('draggable', 'true');
    card.dataset.id = scene.id;

    // Timeline node indicator
    const timelineNodeHtml = state.viewMode === 'timeline' 
      ? `<div class="timeline-node" title="סצנה #${sequenceNum}">${sequenceNum}</div>` 
      : '';

    // POV Class check
    const knownPovs = ['שרה', 'רפאל', 'סלווטור', 'מלכה', 'סוזט', 'מאיר', 'ניסים'];
    const povClass = knownPovs.includes(scene.pov) ? `pov-${scene.pov}` : 'pov-generic';

    card.innerHTML = `
      ${timelineNodeHtml}
      <div class="card-top-row">
        <div class="card-identity">
          <span class="drag-handle" title="גרור כדי לשנות סדר" aria-label="גרירה">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
          </span>
          <span class="scene-seq-badge">#${sequenceNum}</span>
          <span class="scene-id-badge">${escapeHtml(scene.id || 'ללא מזהה')}</span>
        </div>
        <div class="card-actions-menu">
          <button class="card-btn move-up-btn" data-id="${scene.id}" title="הזז קדימה (למעלה)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
          </button>
          <button class="card-btn move-down-btn" data-id="${scene.id}" title="הזז אחורה (למטה)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <button class="card-btn edit-scene-btn" data-id="${scene.id}" title="ערוך סצנה">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="card-btn delete-btn delete-scene-btn" data-id="${scene.id}" title="מחק סצנה">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>

      <h2 class="scene-title">${escapeHtml(scene.title || 'סצנה ללא כותרת')}</h2>

      <div class="scene-meta-row">
        ${scene.pov ? `
          <span class="meta-pill pov-pill ${povClass}" title="נקודת מבט">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${escapeHtml(scene.pov)}
          </span>` : ''}

        ${scene.location ? `
          <span class="meta-pill location-pill" title="מקום">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml(scene.location)}
          </span>` : ''}

        ${scene.time ? `
          <span class="meta-pill time-pill" title="זמן עלילתי">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${escapeHtml(scene.time)}
          </span>` : ''}
      </div>

      ${scene.summary ? `
        <div class="scene-summary">${escapeHtml(scene.summary)}</div>
      ` : ''}

      ${scene.revealedInfo ? `
        <div class="revealed-info-box">
          <div class="revealed-info-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            <span>מידע שנחשף</span>
          </div>
          <div class="revealed-info-body">${escapeHtml(scene.revealedInfo)}</div>
        </div>
      ` : ''}

      ${scene.source ? `
        <div class="scene-source-footer" title="מקור או תיעוד">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          <span>מקור: ${escapeHtml(scene.source)}</span>
        </div>
      ` : ''}
    `;

    // Action button listeners
    const editBtn = card.querySelector('.edit-scene-btn');
    if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(scene.id); });

    const deleteBtn = card.querySelector('.delete-scene-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteScene(scene.id); });

    const moveUpBtn = card.querySelector('.move-up-btn');
    if (moveUpBtn) moveUpBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSceneRelative(scene.id, -1); });

    const moveDownBtn = card.querySelector('.move-down-btn');
    if (moveDownBtn) moveDownBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSceneRelative(scene.id, 1); });

    return card;
  }

  // ==========================================================================
  // Drag and Drop (HTML5 + Reorder Logic)
  // ==========================================================================
  function attachDragAndDropHandlers() {
    const cards = elements.scenesContainer.querySelectorAll('.scene-card');

    cards.forEach(card => {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragenter', handleDragEnter);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('dragleave', handleDragLeave);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);
    });
  }

  function handleDragStart(e) {
    state.draggedId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);

    // If filtering is currently applied, warn that moving will affect global order
    const isFiltered = state.filters.search || state.filters.pov !== 'all' || 
                       state.filters.location !== 'all' || state.filters.time !== 'all';
    if (isFiltered) {
      showToast('שים לב: סידור מחדש בזמן סינון ישנה את המיקום ברצף הכללי של הספר', 'info');
    }
  }

  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  function handleDragEnter() {
    if (this.dataset.id !== state.draggedId) {
      this.classList.add('drag-over');
    }
  }

  function handleDragLeave() {
    this.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove('drag-over');

    const sourceId = state.draggedId;
    const targetId = this.dataset.id;

    if (!sourceId || !targetId || sourceId === targetId) return;

    // Perform reorder in state.scenes
    const fromIndex = state.scenes.findIndex(s => s.id === sourceId);
    const toIndex = state.scenes.findIndex(s => s.id === targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedItem] = state.scenes.splice(fromIndex, 1);
      state.scenes.splice(toIndex, 0, movedItem);

      saveData();
      renderApp();
      showToast(`סצנה "${movedItem.title}" הועברה למיקום #${toIndex + 1}`, 'success');
    }
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    const cards = elements.scenesContainer.querySelectorAll('.scene-card');
    cards.forEach(card => card.classList.remove('drag-over'));
    state.draggedId = null;
  }

  function moveSceneRelative(sceneId, offset) {
    const currentIndex = state.scenes.findIndex(s => s.id === sceneId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + offset;
    if (newIndex < 0 || newIndex >= state.scenes.length) return;

    const [item] = state.scenes.splice(currentIndex, 1);
    state.scenes.splice(newIndex, 0, item);

    saveData();
    renderApp();
  }

  // ==========================================================================
  // Filters & Search
  // ==========================================================================
  function updateFilterOptions() {
    // Collect all unique POVs
    const povCounts = {};
    state.scenes.forEach(s => {
      const p = s.pov ? s.pov.trim() : 'ללא POV';
      povCounts[p] = (povCounts[p] || 0) + 1;
    });

    // Render POV Chips
    const povChipsHtml = [`
      <button class="pov-chip ${state.filters.pov === 'all' ? 'active' : ''}" data-pov="all">
        הכל <span class="chip-count">${state.scenes.length}</span>
      </button>
    `];

    Object.keys(povCounts).sort().forEach(pov => {
      povChipsHtml.push(`
        <button class="pov-chip ${state.filters.pov === pov ? 'active' : ''}" data-pov="${escapeHtml(pov)}">
          ${escapeHtml(pov)} <span class="chip-count">${povCounts[pov]}</span>
        </button>
      `);
    });

    elements.povChipsContainer.innerHTML = povChipsHtml.join('');
    elements.povChipsContainer.querySelectorAll('.pov-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filters.pov = btn.dataset.pov;
        renderApp();
      });
    });

    // Update Location dropdown
    const currentLoc = state.filters.location;
    const locations = Array.from(new Set(state.scenes.map(s => s.location).filter(Boolean))).sort();
    elements.locationFilterSelect.innerHTML = '<option value="all">כל המקומות</option>' +
      locations.map(loc => `<option value="${escapeHtml(loc)}" ${loc === currentLoc ? 'selected' : ''}>${escapeHtml(loc)}</option>`).join('');

    // Update Time dropdown
    const currentTime = state.filters.time;
    const times = Array.from(new Set(state.scenes.map(s => s.time).filter(Boolean))).sort();
    elements.timeFilterSelect.innerHTML = '<option value="all">כל הזמנים העלילתיים</option>' +
      times.map(t => `<option value="${escapeHtml(t)}" ${t === currentTime ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
  }

  function updateStats() {
    const total = state.scenes.length;
    const filtered = getFilteredScenes().length;

    elements.totalScenesCount.textContent = total;
    
    const isFiltered = state.filters.search || state.filters.pov !== 'all' || 
                       state.filters.location !== 'all' || state.filters.time !== 'all';

    if (isFiltered) {
      elements.filteredCountDisplay.textContent = `(מוצגות ${filtered})`;
      elements.activeFilterBadge.style.display = 'inline-flex';
      
      let filterDesc = [];
      if (state.filters.search) filterDesc.push(`חיפוש: "${state.filters.search}"`);
      if (state.filters.pov !== 'all') filterDesc.push(`POV: ${state.filters.pov}`);
      if (state.filters.location !== 'all') filterDesc.push(`מקום: ${state.filters.location}`);
      if (state.filters.time !== 'all') filterDesc.push(`זמן: ${state.filters.time}`);

      elements.activeFilterText.textContent = filterDesc.join(', ');
    } else {
      elements.filteredCountDisplay.textContent = '';
      elements.activeFilterBadge.style.display = 'none';
    }

    elements.searchClearBtn.style.display = state.filters.search ? 'block' : 'none';
  }

  function clearAllFilters() {
    state.filters.search = '';
    state.filters.pov = 'all';
    state.filters.location = 'all';
    state.filters.time = 'all';
    elements.searchInput.value = '';
    renderApp();
  }

  // ==========================================================================
  // Google Sheets & CSV Parser
  // ==========================================================================
  async function fetchGoogleSheet(url) {
    if (!url || !url.trim()) {
      showToast('נא להזין קישור תקין ל-Google Sheets', 'warning');
      return;
    }

    let csvUrl = url.trim();

    // Transform typical Google Sheets URL to exportable CSV URL
    const match = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      const sheetId = match[1];
      const gidMatch = csvUrl.match(/[#&?]gid=([0-9]+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
      csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
    }

    showToast('טוען נתונים מ-Google Sheets...', 'info');

    try {
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`שגיאת רשת (${response.status}): ודא שהטבלה משותפת לצפייה לכל מי שיש לו קישור.`);
      }
      const csvText = await response.text();
      parseAndApplyCsvData(csvText);
      state.sheetUrl = url;
      localStorage.setItem(STORAGE_SHEET_KEY, url);
      closeAllModals();
      showToast('הנתונים נטענו מ-Google Sheets בהצלחה!', 'success');
    } catch (err) {
      console.error('Fetch error:', err);
      // Fallback hint
      showToast(`נכשל בטעינה ישירה: ${err.message}. טיפ: בצע 'קובץ' > 'שיתוף' > 'פרסם באינטרנט' > 'CSV'`, 'warning');
    }
  }

  function parseAndApplyCsvData(csvString) {
    const rows = parseCSV(csvString);
    if (!rows || rows.length < 2) {
      showToast('קובץ ה-CSV אינו מכיל מספיק שורות או כותרות עמודות.', 'warning');
      return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    // Column header mapping dictionary (Hebrew & English variants)
    const mapKey = (headerName) => {
      const h = headerName.toLowerCase();
      if (h.includes('מזהה') || h.includes('קוד') || h.includes('מספר') || h === 'id' || h.includes('scene_id') || h.includes('scene id')) return 'id';
      if (h.includes('כותרת') || h.includes('שם סצנה') || h === 'title' || h === 'name') return 'title';
      if (h.includes('מבט') || h.includes('דמות') || h === 'pov' || h.includes('point of view')) return 'pov';
      if (h.includes('מקום') || h.includes('מיקום') || h.includes('אתר') || h === 'location' || h === 'place') return 'location';
      if (h.includes('זמן') || h.includes('תאריך') || h === 'time' || h === 'timeline' || h === 'date') return 'time';
      if (h.includes('תקציר') || h.includes('עלילה') || h.includes('תיאור') || h === 'summary' || h === 'synopsis' || h === 'description') return 'summary';
      if (h.includes('נחשף') || h.includes('מידע') || h.includes('גילוי') || h.includes('revealed') || h.includes('secrets')) return 'revealedInfo';
      if (h.includes('מקור') || h.includes('הערה') || h.includes('טיוטה') || h === 'source' || h === 'notes' || h === 'reference') return 'source';
      return null;
    };

    const headerMap = {};
    headers.forEach((h, idx) => {
      const field = mapKey(h);
      if (field) headerMap[field] = idx;
    });

    const parsedScenes = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

      const scene = {
        id: headerMap.id !== undefined && row[headerMap.id] ? row[headerMap.id].trim() : `SC-${String(i).padStart(2, '0')}`,
        title: headerMap.title !== undefined && row[headerMap.title] ? row[headerMap.title].trim() : `סצנה ${i}`,
        pov: headerMap.pov !== undefined && row[headerMap.pov] ? row[headerMap.pov].trim() : '',
        location: headerMap.location !== undefined && row[headerMap.location] ? row[headerMap.location].trim() : '',
        time: headerMap.time !== undefined && row[headerMap.time] ? row[headerMap.time].trim() : '',
        summary: headerMap.summary !== undefined && row[headerMap.summary] ? row[headerMap.summary].trim() : '',
        revealedInfo: headerMap.revealedInfo !== undefined && row[headerMap.revealedInfo] ? row[headerMap.revealedInfo].trim() : '',
        source: headerMap.source !== undefined && row[headerMap.source] ? row[headerMap.source].trim() : ''
      };

      parsedScenes.push(scene);
    }

    if (parsedScenes.length > 0) {
      state.scenes = parsedScenes;
      state.originalScenes = JSON.parse(JSON.stringify(parsedScenes));
      saveData();
      renderApp();
      showToast(`נטענו בהצלחה ${parsedScenes.length} סצנות!`, 'success');
    } else {
      showToast('לא זוהו סצנות תקינות בטבלה. בדוק את שמות העמודות.', 'warning');
    }
  }

  // Robust RFC 4180 CSV Parser (handles multiline cells, quotes, commas)
  function parseCSV(text) {
    const p = '', row = [''];
    const ret = [row];
    let i = 0, r = 0, s = !0, l;
    for (l of text) {
      if ('"' === l) {
        if (s && l === p) row[i] += l;
        s = !s;
      } else if (',' === l && s) {
        l = row[++i] = '';
      } else if ('\n' === l && s) {
        if ('\r' === p) row[i] = row[i].slice(0, -1);
        row = ret[++r] = [l = ''];
        i = 0;
      } else {
        row[i] += l;
      }
      p = l;
    }
    // Clean trailing empty rows
    return ret.filter(r => r.some(cell => cell.trim().length > 0));
  }

  // ==========================================================================
  // Scene Editing & Managing
  // ==========================================================================
  function openAddModal() {
    state.editingSceneId = null;
    elements.sceneModalTitle.textContent = 'הוספת סצנה חדשה';
    elements.sceneForm.reset();
    
    // Suggest next ID
    const nextNum = state.scenes.length + 1;
    elements.inputSceneId.value = `SC-${String(nextNum).padStart(2, '0')}`;
    
    openModal(elements.sceneModal);
  }

  function openEditModal(sceneId) {
    const scene = state.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    state.editingSceneId = sceneId;
    elements.sceneModalTitle.textContent = `עריכת סצנה: ${scene.title}`;
    
    elements.inputSceneId.value = scene.id || '';
    elements.inputSceneTitle.value = scene.title || '';
    elements.inputScenePov.value = scene.pov || '';
    elements.inputSceneLocation.value = scene.location || '';
    elements.inputSceneTime.value = scene.time || '';
    elements.inputSceneSummary.value = scene.summary || '';
    elements.inputSceneRevealed.value = scene.revealedInfo || '';
    elements.inputSceneSource.value = scene.source || '';

    openModal(elements.sceneModal);
  }

  function handleSceneFormSubmit(e) {
    e.preventDefault();

    const sceneData = {
      id: elements.inputSceneId.value.trim() || `SC-${Date.now().toString().slice(-4)}`,
      title: elements.inputSceneTitle.value.trim() || 'ללא כותרת',
      pov: elements.inputScenePov.value.trim(),
      location: elements.inputSceneLocation.value.trim(),
      time: elements.inputSceneTime.value.trim(),
      summary: elements.inputSceneSummary.value.trim(),
      revealedInfo: elements.inputSceneRevealed.value.trim(),
      source: elements.inputSceneSource.value.trim()
    };

    if (state.editingSceneId) {
      // Edit existing
      const index = state.scenes.findIndex(s => s.id === state.editingSceneId);
      if (index !== -1) {
        state.scenes[index] = { ...state.scenes[index], ...sceneData };
        showToast('הסצנה עודכנה בהצלחה', 'success');
      }
    } else {
      // Add new to the end
      state.scenes.push(sceneData);
      showToast('סצנה חדשה נוספה לספר', 'success');
    }

    saveData();
    closeAllModals();
    renderApp();
  }

  function deleteScene(sceneId) {
    const scene = state.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    if (confirm(`האם אתה בטוח שברצונך למחוק את הסצנה "${scene.title}"?`)) {
      state.scenes = state.scenes.filter(s => s.id !== sceneId);
      saveData();
      renderApp();
      showToast('הסצנה נמחקה', 'info');
    }
  }

  function resetToOriginalOrder() {
    if (confirm('האם לאפס את סדר כל הסצנות לסדר המקורי שנטען?')) {
      state.scenes = JSON.parse(JSON.stringify(state.originalScenes));
      saveData();
      renderApp();
      showToast('הסדר המקורי שוחזר בהצלחה', 'success');
    }
  }

  // ==========================================================================
  // Export Functions
  // ==========================================================================
  function openExportModal() {
    const formatted = generateFormattedOutline();
    elements.exportPreviewText.value = formatted;
    openModal(elements.exportModal);
  }

  function generateFormattedOutline() {
    return state.scenes.map((scene, idx) => {
      const parts = [
        `סצנה ${idx + 1}: [${scene.id}] ${scene.title}`,
        `----------------------------------------`
      ];

      const meta = [];
      if (scene.pov) meta.push(`נקודת מבט (POV): ${scene.pov}`);
      if (scene.location) meta.push(`מקום: ${scene.location}`);
      if (scene.time) meta.push(`זמן עלילתי: ${scene.time}`);
      if (meta.length) parts.push(meta.join(' | '));

      if (scene.summary) parts.push(`\nתקציר:\n${scene.summary}`);
      if (scene.revealedInfo) parts.push(`\nמידע שנחשף:\n${scene.revealedInfo}`);
      if (scene.source) parts.push(`\nמקור: ${scene.source}`);

      return parts.join('\n');
    }).join('\n\n========================================\n\n');
  }

  function generateCsvContent() {
    const headers = ['סדר חדש', 'מזהה סצנה', 'כותרת הסצנה', 'נקודת מבט (POV)', 'מקום', 'זמן עלילתי', 'תקציר העלילה', 'מידע שנחשף', 'מקור'];
    
    const escapeCsv = (str) => {
      if (!str) return '""';
      return `"${str.toString().replace(/"/g, '""')}"`;
    };

    const rows = state.scenes.map((s, idx) => [
      idx + 1,
      escapeCsv(s.id),
      escapeCsv(s.title),
      escapeCsv(s.pov),
      escapeCsv(s.location),
      escapeCsv(s.time),
      escapeCsv(s.summary),
      escapeCsv(s.revealedInfo),
      escapeCsv(s.source)
    ].join(','));

    return [headers.join(','), ...rows].join('\r\n');
  }

  function copyToClipboard(text, successMessage) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage, 'success');
      }).catch(err => {
        fallbackCopyTextToClipboard(text, successMessage);
      });
    } else {
      fallbackCopyTextToClipboard(text, successMessage);
    }
  }

  function fallbackCopyTextToClipboard(text, successMessage) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(successMessage, 'success');
    } catch (err) {
      showToast('נכשל בהעתקה אוטומטית ללוח', 'warning');
    }
    document.body.removeChild(textArea);
  }

  function downloadFile(content, fileName, mimeType) {
    // Add UTF-8 BOM (\uFEFF) for CSV so Excel displays Hebrew perfectly without gibberish
    const blob = new Blob([mimeType.includes('csv') ? '\uFEFF' + content : content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`הקובץ "${fileName}" הורד בהצלחה`, 'success');
  }

  // ==========================================================================
  // Modal Utilities
  // ==========================================================================
  function openModal(modal) {
    modal.classList.add('active');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  }

  // ==========================================================================
  // Toast Notifications
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
      icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
    } else if (type === 'warning') {
      icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
    } else {
      icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Helper
  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }

  // ==========================================================================
  // Event Listeners Setup
  // ==========================================================================
  function setupEventListeners() {
    // Search
    elements.searchInput.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      renderApp();
    });

    elements.searchClearBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.filters.search = '';
      renderApp();
    });

    // Dropdown Filters
    elements.locationFilterSelect.addEventListener('change', (e) => {
      state.filters.location = e.target.value;
      renderApp();
    });

    elements.timeFilterSelect.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      renderApp();
    });

    elements.clearFiltersBtn.addEventListener('click', clearAllFilters);

    // View Switcher Buttons
    elements.viewGridBtn.addEventListener('click', () => {
      state.viewMode = 'grid';
      updateViewButtons();
      renderScenes();
    });

    elements.viewTimelineBtn.addEventListener('click', () => {
      state.viewMode = 'timeline';
      updateViewButtons();
      renderScenes();
    });

    elements.viewCompactBtn.addEventListener('click', () => {
      state.viewMode = 'compact';
      updateViewButtons();
      renderScenes();
    });

    function updateViewButtons() {
      elements.viewGridBtn.classList.toggle('active', state.viewMode === 'grid');
      elements.viewTimelineBtn.classList.toggle('active', state.viewMode === 'timeline');
      elements.viewCompactBtn.classList.toggle('active', state.viewMode === 'compact');
    }

    // Top action triggers
    elements.btnSyncSheets.addEventListener('click', () => openModal(elements.sheetsModal));
    elements.btnAddScene.addEventListener('click', openAddModal);
    elements.btnResetOrder.addEventListener('click', resetToOriginalOrder);
    elements.btnExport.addEventListener('click', openExportModal);

    // Modal Close buttons (click on close button or click on overlay outside modal)
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAllModals();
      });
    });

    // Sheets Modal Actions
    elements.btnFetchSheet.addEventListener('click', () => {
      fetchGoogleSheet(elements.sheetUrlInput.value);
    });

    elements.btnLoadDefaultData.addEventListener('click', () => {
      if (typeof DEFAULT_SCENES !== 'undefined') {
        state.scenes = JSON.parse(JSON.stringify(DEFAULT_SCENES));
        state.originalScenes = JSON.parse(JSON.stringify(DEFAULT_SCENES));
        saveData();
        closeAllModals();
        renderApp();
        showToast('נטענו נתוני הדוגמה המקוריים', 'success');
      }
    });

    // File input for local CSV upload
    if (elements.csvFileInput) {
      elements.csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          parseAndApplyCsvData(event.target.result);
          closeAllModals();
        };
        reader.readAsText(file, 'UTF-8');
      });
    }

    // Scene Form Submit
    elements.sceneForm.addEventListener('submit', handleSceneFormSubmit);

    // Export Actions
    elements.btnCopyFormatted.addEventListener('click', () => {
      copyToClipboard(elements.exportPreviewText.value, 'התקציר המסודר הועתק ללוח!');
    });

    elements.btnCopyCsv.addEventListener('click', () => {
      const csv = generateCsvContent();
      copyToClipboard(csv, 'טבלת ה-CSV הועתקה ללוח! ניתן להדביק ישירות ל-Google Sheets');
    });

    elements.btnDownloadCsv.addEventListener('click', () => {
      const csv = generateCsvContent();
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(csv, `scenes-sequence-${date}.csv`, 'text/csv;charset=utf-8;');
    });

    elements.btnDownloadJson.addEventListener('click', () => {
      const json = JSON.stringify(state.scenes, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(json, `scenes-backup-${date}.json`, 'application/json;charset=utf-8;');
    });

    // Keyboard shortcuts (Escape to close modals)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  // Start App
  document.addEventListener('DOMContentLoaded', init);
})();
