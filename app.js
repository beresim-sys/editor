/**
 * app.js
 * לוח עריכה וסידור סצנות לספר - לוגיקה מרכזית
 * מבוסס על קובץ המקור: 'סצנות לספר.xlsx' (124 סצנות)
 */

(function () {
  'use strict';

  // --- Storage Key (bumped to v2 to ensure clean load from 'סצנות לספר.xlsx') ---
  const STORAGE_KEY = 'book_scenes_editor_file_v2';

  // Top characters for quick POV filter pills
  const PRIMARY_CHARACTERS = [
    'שרה',
    'רפאל שאול',
    'רפאל אלטרס',
    'מאיר דסה',
    'סלווטור',
    'סולטנה',
    'ניסים',
    'מלכה',
    'לואיזה',
    'סוזט'
  ];

  // --- Application State ---
  let state = {
    scenes: [],
    originalScenes: [],
    viewMode: 'grid', // 'grid' | 'timeline' | 'compact'
    filters: {
      search: '',
      povChar: 'all', // Character pill filter (contains character)
      exactPov: 'all', // Exact dropdown POV
      location: 'all',
      time: 'all'
    },
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
    povFilterSelect: document.getElementById('povFilterSelect'),
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
    btnReloadOriginalFile: document.getElementById('btnReloadOriginalFile'),
    btnUploadXlsx: document.getElementById('btnUploadXlsx'),
    xlsxFileInput: document.getElementById('xlsxFileInput'),
    btnAddScene: document.getElementById('btnAddScene'),
    btnExport: document.getElementById('btnExport'),

    // Scene Edit Modal
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

    // Export Modal
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
    loadScenesData();
    setupEventListeners();
    renderApp();
  }

  function loadScenesData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        state.scenes = JSON.parse(saved);
      } else if (typeof DEFAULT_SCENES !== 'undefined' && Array.isArray(DEFAULT_SCENES)) {
        state.scenes = JSON.parse(JSON.stringify(DEFAULT_SCENES));
      } else {
        state.scenes = [];
      }
      state.originalScenes = (typeof DEFAULT_SCENES !== 'undefined') ? JSON.parse(JSON.stringify(DEFAULT_SCENES)) : JSON.parse(JSON.stringify(state.scenes));
    } catch (e) {
      console.error('Error loading scenes:', e);
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
  // Filtering & Rendering
  // ==========================================================================
  function getFilteredScenes() {
    const query = state.filters.search.trim().toLowerCase();
    const povChar = state.filters.povChar;
    const exactPov = state.filters.exactPov;
    const locationFilter = state.filters.location;
    const timeFilter = state.filters.time;

    return state.scenes.filter((scene) => {
      // Free text search
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

      // POV Character pill filter (checks if character is part of POV)
      if (povChar !== 'all') {
        if (!scene.pov || !scene.pov.includes(povChar)) {
          return false;
        }
      }

      // Exact POV dropdown filter
      if (exactPov !== 'all' && scene.pov !== exactPov) {
        return false;
      }

      // Location filter
      if (locationFilter !== 'all' && scene.location !== locationFilter) {
        return false;
      }

      // Time filter
      if (timeFilter !== 'all' && scene.time !== timeFilter) {
        return false;
      }

      return true;
    });
  }

  function renderApp() {
    updateFilterOptions();
    renderScenes();
    updateStats();
  }

  function renderScenes() {
    const filteredScenes = getFilteredScenes();
    const container = elements.scenesContainer;
    container.innerHTML = '';

    container.className = `scenes-container ${state.viewMode}-view`;

    if (filteredScenes.length === 0) {
      elements.emptyState.style.display = 'block';
      container.style.display = 'none';
      return;
    }

    elements.emptyState.style.display = 'none';
    container.style.display = (state.viewMode === 'grid') ? 'grid' : 'flex';

    // Fragment for fast DOM insertion with 124 cards
    const fragment = document.createDocumentFragment();

    filteredScenes.forEach((scene) => {
      const globalIndex = state.scenes.findIndex(s => s.id === scene.id) + 1;
      const card = createSceneCardElement(scene, globalIndex);
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
    attachDragAndDropHandlers();
  }

  function getPovStyleClass(povText) {
    if (!povText) return 'pov-generic';
    if (povText.includes('שרה')) return 'pov-shara';
    if (povText.includes('רפאל שאול')) return 'pov-raphael-shaul';
    if (povText.includes('רפאל אלטרס')) return 'pov-raphael-altras';
    if (povText.includes('מאיר')) return 'pov-meir';
    if (povText.includes('סלווטור')) return 'pov-salvatore';
    if (povText.includes('סולטנה')) return 'pov-sultana';
    if (povText.includes('ניסים')) return 'pov-nissim';
    if (povText.includes('מלכה')) return 'pov-malka';
    if (povText.includes('לואיזה')) return 'pov-louisa';
    if (povText.includes('סוזט')) return 'pov-souzette';
    return 'pov-generic';
  }

  function createSceneCardElement(scene, sequenceNum) {
    const card = document.createElement('article');
    card.className = 'scene-card';
    card.setAttribute('draggable', 'true');
    card.dataset.id = scene.id;

    const timelineNodeHtml = state.viewMode === 'timeline' 
      ? `<div class="timeline-node" title="סצנה #${sequenceNum}">${sequenceNum}</div>` 
      : '';

    const povClass = getPovStyleClass(scene.pov);

    card.innerHTML = `
      ${timelineNodeHtml}
      <div class="card-top-row">
        <div class="card-identity">
          <span class="drag-handle" title="גרור כדי לסדר מחדש" aria-label="גרירה">
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
          <span class="meta-pill pov-pill ${povClass}" title="נקודת מבט (POV)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${escapeHtml(scene.pov)}
          </span>` : ''}

        ${scene.location ? `
          <span class="meta-pill location-pill" title="מיקום">
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
        <div class="scene-source-footer" title="מקור">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          <span>מקור: ${escapeHtml(scene.source)}</span>
        </div>
      ` : ''}
    `;

    // Action button listeners
    card.querySelector('.edit-scene-btn').addEventListener('click', (e) => { e.stopPropagation(); openEditModal(scene.id); });
    card.querySelector('.delete-scene-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteScene(scene.id); });
    card.querySelector('.move-up-btn').addEventListener('click', (e) => { e.stopPropagation(); moveSceneRelative(scene.id, -1); });
    card.querySelector('.move-down-btn').addEventListener('click', (e) => { e.stopPropagation(); moveSceneRelative(scene.id, 1); });

    return card;
  }

  // ==========================================================================
  // Drag and Drop Logic
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

    const isFiltered = state.filters.search || state.filters.povChar !== 'all' || 
                       state.filters.exactPov !== 'all' || state.filters.location !== 'all' || state.filters.time !== 'all';
    if (isFiltered) {
      showToast('שים לב: הסידור מחדש משפיע על הרצף המלא של הספר', 'info');
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
  // Filter Options & Stats
  // ==========================================================================
  function updateFilterOptions() {
    // 1. Quick POV Character Pills
    const povChipsHtml = [`
      <button class="pov-chip ${state.filters.povChar === 'all' ? 'active' : ''}" data-char="all">
        הכל <span class="chip-count">${state.scenes.length}</span>
      </button>
    `];

    PRIMARY_CHARACTERS.forEach(char => {
      const count = state.scenes.filter(s => s.pov && s.pov.includes(char)).length;
      if (count > 0) {
        povChipsHtml.push(`
          <button class="pov-chip ${state.filters.povChar === char ? 'active' : ''}" data-char="${escapeHtml(char)}">
            ${escapeHtml(char)} <span class="chip-count">${count}</span>
          </button>
        `);
      }
    });

    elements.povChipsContainer.innerHTML = povChipsHtml.join('');
    elements.povChipsContainer.querySelectorAll('.pov-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filters.povChar = btn.dataset.char;
        renderApp();
      });
    });

    // 2. Exact POV Dropdown
    if (elements.povFilterSelect) {
      const currentExact = state.filters.exactPov;
      const allPovs = Array.from(new Set(state.scenes.map(s => s.pov).filter(Boolean))).sort();
      elements.povFilterSelect.innerHTML = '<option value="all">כל הרכבי ה-POV</option>' +
        allPovs.map(p => `<option value="${escapeHtml(p)}" ${p === currentExact ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');
    }

    // 3. Location Dropdown
    const currentLoc = state.filters.location;
    const locations = Array.from(new Set(state.scenes.map(s => s.location).filter(Boolean))).sort();
    elements.locationFilterSelect.innerHTML = '<option value="all">כל המיקומים</option>' +
      locations.map(loc => `<option value="${escapeHtml(loc)}" ${loc === currentLoc ? 'selected' : ''}>${escapeHtml(loc)}</option>`).join('');

    // 4. Time Dropdown
    const currentTime = state.filters.time;
    const times = Array.from(new Set(state.scenes.map(s => s.time).filter(Boolean))).sort();
    elements.timeFilterSelect.innerHTML = '<option value="all">כל הזמנים העלילתיים</option>' +
      times.map(t => `<option value="${escapeHtml(t)}" ${t === currentTime ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
  }

  function updateStats() {
    const total = state.scenes.length;
    const filtered = getFilteredScenes().length;

    elements.totalScenesCount.textContent = total;
    
    const isFiltered = state.filters.search || state.filters.povChar !== 'all' || 
                       state.filters.exactPov !== 'all' || state.filters.location !== 'all' || state.filters.time !== 'all';

    if (isFiltered) {
      elements.filteredCountDisplay.textContent = `(מוצגות ${filtered})`;
      elements.activeFilterBadge.style.display = 'inline-flex';
      
      let filterDesc = [];
      if (state.filters.search) filterDesc.push(`חיפוש: "${state.filters.search}"`);
      if (state.filters.povChar !== 'all') filterDesc.push(`דמות: ${state.filters.povChar}`);
      if (state.filters.exactPov !== 'all') filterDesc.push(`POV: ${state.filters.exactPov}`);
      if (state.filters.location !== 'all') filterDesc.push(`מיקום: ${state.filters.location}`);
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
    state.filters.povChar = 'all';
    state.filters.exactPov = 'all';
    state.filters.location = 'all';
    state.filters.time = 'all';
    elements.searchInput.value = '';
    if (elements.povFilterSelect) elements.povFilterSelect.value = 'all';
    renderApp();
  }

  // ==========================================================================
  // Excel File (.xlsx) Parsing & Reload
  // ==========================================================================
  function reloadOriginalScenesFile() {
    if (confirm("האם לאפס את כל השינויים ולטעון מחדש את 124 הסצנות מקובץ המקור 'סצנות לספר.xlsx'?")) {
      if (typeof DEFAULT_SCENES !== 'undefined') {
        state.scenes = JSON.parse(JSON.stringify(DEFAULT_SCENES));
        saveData();
        clearAllFilters();
        showToast("נטענו מחדש 124 הסצנות מקובץ 'סצנות לספר.xlsx'", 'success');
      }
    }
  }

  function handleXlsxFileUpload(file) {
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      showToast('ספריית קריאת האקסל נטענת... נסה שנית בעוד רגע', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!jsonRows || jsonRows.length < 2) {
          showToast('הקובץ אינו מכיל נתונים מספקים', 'warning');
          return;
        }

        const headers = jsonRows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));
        
        const mapKey = (headerName) => {
          const h = headerName.toLowerCase();
          if (h.includes('מזהה') || h.includes('קוד') || h.includes('מספר') || h === 'id' || h.includes('scene_id')) return 'id';
          if (h.includes('כותרת') || h.includes('שם סצנה') || h === 'title') return 'title';
          if (h.includes('מבט') || h.includes('דמות') || h === 'pov') return 'pov';
          if (h.includes('מקום') || h.includes('מיקום') || h.includes('אתר') || h === 'location') return 'location';
          if (h.includes('זמן') || h.includes('תאריך') || h === 'time') return 'time';
          if (h.includes('תקציר') || h.includes('עלילה') || h === 'summary') return 'summary';
          if (h.includes('נחשף') || h.includes('מידע') || h === 'revealed') return 'revealedInfo';
          if (h.includes('מקור') || h.includes('הערה') || h === 'source') return 'source';
          return null;
        };

        const headerMap = {};
        headers.forEach((h, idx) => {
          const field = mapKey(h);
          if (field) headerMap[field] = idx;
        });

        const parsedScenes = [];
        for (let i = 1; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || row.length === 0) continue;

          const id = headerMap.id !== undefined && row[headerMap.id] ? String(row[headerMap.id]).trim() : `scene_${i}`;
          const title = headerMap.title !== undefined && row[headerMap.title] ? String(row[headerMap.title]).trim() : `סצנה ${i}`;
          const pov = headerMap.pov !== undefined && row[headerMap.pov] ? String(row[headerMap.pov]).trim() : '';
          const location = headerMap.location !== undefined && row[headerMap.location] ? String(row[headerMap.location]).trim() : '';
          const time = headerMap.time !== undefined && row[headerMap.time] ? String(row[headerMap.time]).trim() : '';
          const summary = headerMap.summary !== undefined && row[headerMap.summary] ? String(row[headerMap.summary]).trim() : '';
          const revealedInfo = headerMap.revealedInfo !== undefined && row[headerMap.revealedInfo] ? String(row[headerMap.revealedInfo]).trim() : '';
          const source = headerMap.source !== undefined && row[headerMap.source] ? String(row[headerMap.source]).trim() : '';

          if (id || title || summary) {
            parsedScenes.push({ id, title, pov, location, time, summary, revealedInfo, source });
          }
        }

        if (parsedScenes.length > 0) {
          state.scenes = parsedScenes;
          saveData();
          renderApp();
          showToast(`נטענו בהצלחה ${parsedScenes.length} סצנות מקובץ האקסל המעודכן!`, 'success');
        } else {
          showToast('לא זוהו סצנות תקינות בקובץ', 'warning');
        }
      } catch (err) {
        console.error('Error parsing xlsx:', err);
        showToast('שגיאה בפענוח קובץ האקסל', 'warning');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ==========================================================================
  // Scene Editing & Managing
  // ==========================================================================
  function openAddModal() {
    state.editingSceneId = null;
    elements.sceneModalTitle.textContent = 'הוספת סצנה חדשה';
    elements.sceneForm.reset();
    
    const nextNum = state.scenes.length + 1;
    elements.inputSceneId.value = `scene_${nextNum}`;
    
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
      id: elements.inputSceneId.value.trim() || `scene_${Date.now().toString().slice(-4)}`,
      title: elements.inputSceneTitle.value.trim() || 'ללא כותרת',
      pov: elements.inputScenePov.value.trim(),
      location: elements.inputSceneLocation.value.trim(),
      time: elements.inputSceneTime.value.trim(),
      summary: elements.inputSceneSummary.value.trim(),
      revealedInfo: elements.inputSceneRevealed.value.trim(),
      source: elements.inputSceneSource.value.trim()
    };

    if (state.editingSceneId) {
      const index = state.scenes.findIndex(s => s.id === state.editingSceneId);
      if (index !== -1) {
        state.scenes[index] = { ...state.scenes[index], ...sceneData };
        showToast('הסצנה עודכנה בהצלחה', 'success');
      }
    } else {
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
      if (scene.location) meta.push(`מיקום: ${scene.location}`);
      if (scene.time) meta.push(`זמן עלילתי: ${scene.time}`);
      if (meta.length) parts.push(meta.join(' | '));

      if (scene.summary) parts.push(`\nתקציר:\n${scene.summary}`);
      if (scene.revealedInfo) parts.push(`\nמידע שנחשף:\n${scene.revealedInfo}`);
      if (scene.source) parts.push(`\nמקור: ${scene.source}`);

      return parts.join('\n');
    }).join('\n\n========================================\n\n');
  }

  function generateCsvContent() {
    const headers = ['סדר חדש', 'מזהה סצנה', 'כותרת הסצנה', 'זמן עלילתי', 'מיקום', 'נקודת מבט (POV)', 'תקציר העלילה', 'מידע שנחשף', 'מקור'];
    
    const escapeCsv = (str) => {
      if (!str) return '""';
      return `"${str.toString().replace(/"/g, '""')}"`;
    };

    const rows = state.scenes.map((s, idx) => [
      idx + 1,
      escapeCsv(s.id),
      escapeCsv(s.title),
      escapeCsv(s.time),
      escapeCsv(s.location),
      escapeCsv(s.pov),
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
      }).catch(() => {
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
    // Add UTF-8 BOM (\uFEFF) for CSV so Excel displays Hebrew perfectly
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

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }

  // ==========================================================================
  // Event Listeners
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
    if (elements.povFilterSelect) {
      elements.povFilterSelect.addEventListener('change', (e) => {
        state.filters.exactPov = e.target.value;
        renderApp();
      });
    }

    elements.locationFilterSelect.addEventListener('change', (e) => {
      state.filters.location = e.target.value;
      renderApp();
    });

    elements.timeFilterSelect.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      renderApp();
    });

    elements.clearFiltersBtn.addEventListener('click', clearAllFilters);

    // View Switcher
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
    elements.btnReloadOriginalFile.addEventListener('click', reloadOriginalScenesFile);
    
    elements.btnUploadXlsx.addEventListener('click', () => {
      elements.xlsxFileInput.click();
    });

    elements.xlsxFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleXlsxFileUpload(file);
    });

    elements.btnAddScene.addEventListener('click', openAddModal);
    elements.btnExport.addEventListener('click', openExportModal);

    // Modal Close
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAllModals();
      });
    });

    // Scene Form Submit
    elements.sceneForm.addEventListener('submit', handleSceneFormSubmit);

    // Export Actions
    elements.btnCopyFormatted.addEventListener('click', () => {
      copyToClipboard(elements.exportPreviewText.value, 'התקציר המסודר הועתק ללוח!');
    });

    elements.btnCopyCsv.addEventListener('click', () => {
      const csv = generateCsvContent();
      copyToClipboard(csv, 'טבלת ה-CSV הועתקה ללוח!');
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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
