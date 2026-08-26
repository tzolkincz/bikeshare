// API endpoints for Pilsen bike sharing (GBFS v3.0)
const BASE_URL = 'https://pmdpbike.admin.freebike.com/api/gbfs/v30';
const STATION_INFO_URL = `${BASE_URL}/station_information`;
const STATION_STATUS_URL = `${BASE_URL}/station_status`;

// DOM elements
const stationsDiv = document.getElementById('stations');
const modal = document.getElementById('modal');
const addStationBtn = document.getElementById('addStationBtn');
const closeBtn = document.querySelector('.close');
const searchInput = document.getElementById('searchInput');
const stationList = document.getElementById('stationList');
const lastUpdateSpan = document.getElementById('lastUpdate');
const refreshBtn = document.getElementById('refreshBtn');

// State
let allStations = [];
// Guard against corrupted localStorage values so a bad value can't kill the whole app
function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}
// Guard against a stored value that is valid JSON but not an array
const storedFavorites = loadJSON('bikeFavorites', []);
let favorites = (Array.isArray(storedFavorites) ? storedFavorites : []).map(String);
let updateInterval = null;
let map = null;
let markersLayer = null;
let initialMapFit = true;
let lastFetchTime = 0;
let isInitialLoad = true;
let fetchingStations = null;
const MIN_FETCH_INTERVAL = 15000; // Minimum 15s between fetches to avoid spam

// Initialize — map first, then data so markers render on load
async function init() {
  initMap();
  await fetchStations();
  updateFavoriteStats();
  startAutoUpdate();
}

// Initialize Leaflet map centered on Plzeň
function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  // Restore saved map position from localStorage, or use defaults
  const savedView = loadJSON('mapView', null);
  const defaultCenter = [49.7384, 13.3725];
  const defaultZoom = 13;
  const center = savedView?.center || defaultCenter;
  const zoom = savedView?.zoom ?? defaultZoom;

  map = L.map('map').setView(center, zoom);

  // If the user has a saved view, don't let the initial fitBounds clobber it
  if (savedView) initialMapFit = false;

  // OpenStreetMap tiles (no API key needed)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // Save map position when the user moves or zooms (debounced — panning fires many events)
  let viewSaveTimer = null;
  map.on('moveend zoomend', () => {
    clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(() => {
      // getCenter() already returns a LatLng ({lat, lng}); Leaflet accepts that shape on restore
      const view = { center: map.getCenter(), zoom: map.getZoom() };
      localStorage.setItem('mapView', JSON.stringify(view));
    }, 500);
  });
}

// Update map markers when station data changes
function updateMapMarkers() {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();

  const bounds = [];

  allStations.forEach(station => {
    if (station.lat == null || station.lon == null) return;
    bounds.push([station.lat, station.lon]);

    const isFav = favorites.includes(station.id);
    const bikes = station.bikes || 0;
    const docks = station.docks || 0;

    // Color: PMDP blue = default, green = has bikes, red = no bikes, grey = closed
    let color = '#004169';
    if (!station.isInstalled) color = '#999';
    else if (bikes > 0) color = '#34a853';
    else color = '#ea4335';

    // Uniform size for easier tapping
    const radius = 14;
    const weight = 2;

    const marker = L.circleMarker([station.lat, station.lon], {
      radius,
      fillColor: color,
      color: '#fff',
      weight,
      opacity: 1,
      fillOpacity: 0.9
    });

    const cap = station.capacity != null ? ` | Capacity: ${station.capacity}` : '';
    marker.bindPopup(`<b>${escapeHtml(station.name)}</b><br>Bikes: ${bikes} | Docks: ${docks}${cap}`);

    markersLayer.addLayer(marker);
  });

  // Fit map to show all stations — only on initial load
  if (bounds.length > 0 && initialMapFit) {
    map.fitBounds(bounds, { padding: [20, 20] });
    initialMapFit = false;
  }
}

// Fetch stations from API (merges info + status).
// Guarded so concurrent triggers (interval, focus, scroll, manual) share one request.
async function fetchStations(options = {}) {
  if (fetchingStations) return fetchingStations;
  fetchingStations = doFetchStations(options).finally(() => { fetchingStations = null; });
  return fetchingStations;
}

async function doFetchStations({ silent = false } = {}) {
  try {
    const [infoRes, statusRes] = await Promise.all([
      fetch(STATION_INFO_URL),
      fetch(STATION_STATUS_URL)
    ]);
    
    if (!infoRes.ok || !statusRes.ok) throw new Error('API request failed');
    
    const infoData = await infoRes.json();
    const statusData = await statusRes.json();
    
    // Build a map of status by station_id
    const statusMap = {};
    (statusData.data?.stations || []).forEach(s => {
      statusMap[String(s.station_id)] = s;
    });
    
    // Merge info with status
    allStations = (infoData.data?.stations || []).map(station => {
      const status = statusMap[String(station.station_id)];
      return {
        id: String(station.station_id),
        name: getName(station.name),
        lat: station.lat,
        lon: station.lon,
        capacity: station.capacity,
        bikes: status ? status.num_vehicles_available : 0,
        docks: status ? status.num_docks_available : 0,
        isInstalled: status ? status.is_installed : true,
        isRenting: status ? status.is_renting : true,
        isReturning: status ? status.is_returning : true
      };
    });
    
    lastFetchTime = Date.now();
    updateFavoriteStats();
    updateMapMarkers();
    updateLastUpdate();

    // Gently confirm the refresh (skip on initial page load and background updates)
    const wasInitial = isInitialLoad;
    isInitialLoad = false;
    if (!wasInitial && !silent && !document.hidden) showToast('✓ Data updated');
  } catch (error) {
    console.error('Error fetching stations:', error);
    showError('Failed to load station data. Retrying...');
  }
}

// Extract name from multilingual array (prefer Czech, fallback to English)
function getName(nameArray) {
  if (!Array.isArray(nameArray)) return '';
  const cs = nameArray.find(n => n.language === 'cs');
  if (cs) return cs.text;
  const en = nameArray.find(n => n.language === 'en');
  if (en) return en.text;
  return nameArray[0]?.text || '';
}

// Update stats for favorite stations
function updateFavoriteStats() {
  stationsDiv.innerHTML = '';
  
  if (favorites.length === 0) {
    stationsDiv.innerHTML = `
      <div class="empty-state">
        <p>No favorite stations yet</p>
        <p>Use the button above or tap a marker on the map to add stations</p>
      </div>
    `;
    return;
  }
  
  favorites.forEach(favId => {
    const station = allStations.find(s => String(s.id) === String(favId));
    if (!station) return;
    
    const card = createStationCard(station);
    stationsDiv.appendChild(card);
  });
}

// Create a station card element
function createStationCard(station) {
  const card = document.createElement('div');
  card.className = 'station-card';
  
  const bikes = station.bikes || 0;
  const docks = station.docks || 0;
  const capacity = station.capacity != null ? station.capacity : '';
  const name = station.name || `Station ${station.id}`;
  
  // Visual status indicator
  if (!station.isInstalled) card.classList.add('closed');
  else if (bikes === 0 && docks === 0) card.classList.add('no-bikes');
  else if (docks === 0) card.classList.add('full');
  
  // Color each part: bikes green/red, docks green/red, capacity neutral
  const bikesColor = bikes === 0 ? '#ea4335' : '#34a853';
  const docksColor = docks === 0 ? '#ea4335' : '#34a853';
  
  // Show as bikes/docks/capacity with separate colors
  const display = capacity
    ? `<span style="color:${bikesColor}">${bikes}</span>/<span style="color:${docksColor}">${docks}</span>/<span>${capacity}</span>`
    : `<span style="color:${bikesColor}">${bikes}</span>/<span style="color:${docksColor}">${docks}</span>`;
  
  const tooltipText = `🚲 Bikes: ${bikes}/${capacity} | 🅿️ Free docks: ${docks}/${capacity}${docks === 0 ? ' — ⚠ Full' : ' — ✅ Can return'}`;

  card.innerHTML = `
    <div class="drag-handle" title="Drag to reorder">⠿</div>
    <div class="info">
      <div class="name">${escapeHtml(name)}</div>
    </div>
    <div class="stats">
      <div class="stat">
        <div class="number">${display}</div>
      </div>
      <button class="remove-btn" data-id="${station.id}" title="Remove">×</button>
    </div>
  `;

  // Tap to show tooltip (not on drag handle)
  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn') || e.target.classList.contains('drag-handle')) return;
    showTooltip(card, tooltipText);
  });

  card.querySelector('.remove-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    removeFavorite(station.id);
  });

  // Drag to reorder
  makeDraggable(card, station.id);

  return card;
}

// Add station to favorites
function addFavorite(id) {
  id = String(id);
  if (!favorites.includes(id)) {
    favorites.push(id);
    localStorage.setItem('bikeFavorites', JSON.stringify(favorites));
    updateFavoriteStats();
    updateMapMarkers();
  }
  closeModal();
}

// Remove station from favorites
function removeFavorite(id) {
  id = String(id);
  favorites = favorites.filter(fav => fav !== id);
  localStorage.setItem('bikeFavorites', JSON.stringify(favorites));
  updateFavoriteStats();
  updateMapMarkers();
}

// Show modal with all stations
function openModal() {
  modal.classList.remove('hidden');
  searchInput.value = '';
  renderStationList(allStations);
  searchInput.focus();
}

// Close modal
function closeModal() {
  modal.classList.add('hidden');
}

// Render the list of all stations (for adding)
function renderStationList(stations) {
  stationList.innerHTML = '';
  
  if (stations.length === 0) {
    stationList.innerHTML = '<li>No stations found</li>';
    return;
  }
  
  stations.forEach(station => {
    const li = document.createElement('li');
    const name = station.name || `Station ${station.id}`;
    const capacity = station.capacity || '';
    const isFav = favorites.includes(station.id);
    
    li.innerHTML = `
      <div class="name">${escapeHtml(name)} ${isFav ? '✓' : ''}</div>
      ${capacity ? `<div class="address">Capacity: ${capacity}</div>` : ''}
    `;
    
    li.addEventListener('click', () => addFavorite(station.id));
    stationList.appendChild(li);
  });
}

// Filter stations based on search (fuzzy matching)
function filterStations(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderStationList(allStations);
    return;
  }

  // Fuzzy match: check if all characters of query appear in order in the name
  function fuzzyMatch(text, query) {
    let ti = 0;
    for (let qi = 0; qi < query.length; qi++) {
      const idx = text.indexOf(query[qi], ti);
      if (idx === -1) return false;
      ti = idx + 1;
    }
    return true;
  }

  // Also allow simple substring match as fallback
  const filtered = allStations.filter(s => {
    const name = (s.name || '').toLowerCase();
    return name.includes(q) || fuzzyMatch(name, q);
  });
  renderStationList(filtered);
}

// Auto update
function startAutoUpdate() {
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(() => fetchStations({ silent: true }), 60000); // Every 60 seconds

  // Also refresh when user scrolls to top of page
  window.addEventListener('scroll', () => {
    const now = Date.now();
    if (window.scrollY === 0 && now - lastFetchTime > MIN_FETCH_INTERVAL) {
      fetchStations({ silent: true });
    }
  });

  setupVisibilityRefresh();
}

// Refresh instantly whenever the site is opened or brought back to the foreground,
// even when the page was restored from cache (bfcache) by the browser.
function setupVisibilityRefresh() {
  // Back/forward cache restore — fires when a cached page is re-shown
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && navigator.onLine) {
      showToast('🔄 Updating station data…');
      fetchStations({ silent: true });
    }
  });

  // Tab/app became visible again (resumed from background, screen unlocked)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) maybeRefresh();
  });

  // Window regained focus (e.g. user switched back to the app)
  window.addEventListener('focus', () => maybeRefresh());

  // Network connection restored — refresh immediately
  window.addEventListener('online', () => {
    showToast('📶 Back online — updating…');
    fetchStations({ silent: true });
  });
}

// Refresh if data is older than MIN_FETCH_INTERVAL, otherwise skip
function maybeRefresh() {
  const now = Date.now();
  if (now - lastFetchTime > MIN_FETCH_INTERVAL) {
    showToast('🔄 Updating station data…');
    fetchStations({ silent: true });
  }
}

// Gently notify the user about background refreshes with a small, auto-hiding toast
let toastEl = null;
let toastTimer = null;

function showToast(message, duration = 2500) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), duration);
}

// Update last update time display
function updateLastUpdate() {
  const now = new Date();
  lastUpdateSpan.textContent = `Updated: ${now.toLocaleTimeString()}`;
}

// Show error message
let errorToken = 0;

function showError(message) {
  const token = ++errorToken;
  let errorDiv = document.getElementById('error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'error';
    errorDiv.className = 'error';
    stationsDiv.parentNode.insertBefore(errorDiv, stationsDiv);
  }
  errorDiv.textContent = message;

  // Auto-remove after 5 seconds (only if no newer error replaced it)
  setTimeout(() => {
    if (token === errorToken && errorDiv.isConnected) errorDiv.remove();
  }, 5000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make a station card draggable for reordering favorites.
// Uses pointer events so mouse and touch share one code path (no double-firing).
function makeDraggable(card, stationId) {
  const handle = card.querySelector('.drag-handle');

  function onStart(e) {
    e.preventDefault();
    card.style.opacity = '0.5';
    // Capture so move/up keep firing on the handle even when the pointer leaves it
    handle.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    const y = e.clientY;
    // Find card we're hovering over
    const target = document.elementFromPoint(e.clientX, y);
    if (!target) return;
    const targetCard = target.closest('.station-card');
    if (targetCard && targetCard !== card) {
      // Insert before or after the target depending on which half is hovered,
      // so cards can be moved both up and down.
      const rect = targetCard.getBoundingClientRect();
      const insertAfter = y > rect.top + rect.height / 2;
      if (insertAfter) targetCard.after(card);
      else stationsDiv.insertBefore(card, targetCard);
    }
  }

  function onEnd() {
    card.style.opacity = '1';
    // Save new order. Favorites that aren't rendered (e.g. station missing from
    // the latest data) are kept at their previous positions so a drag never
    // silently deletes them.
    const domOrder = [];
    stationsDiv.querySelectorAll('.station-card').forEach(c => {
      const id = c.querySelector('.remove-btn')?.dataset.id;
      if (id) domOrder.push(id);
    });
    const missing = favorites.filter(id => !domOrder.includes(id));
    favorites = [...domOrder, ...missing];
    localStorage.setItem('bikeFavorites', JSON.stringify(favorites));
  }

  handle.addEventListener('pointerdown', onStart);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
}

// Show tooltip on card click
let activeTooltip = null;
let tooltipTimer = null;

function showTooltip(card, text) {
  // Remove existing tooltip and cancel its pending auto-hide so it can't hide the new one early
  hideTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = text;
  card.appendChild(tooltip);
  activeTooltip = tooltip;

  // Auto-hide after 3 seconds or on next tap outside
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(hideTooltip, 3000);
}

function hideTooltip() {
  clearTimeout(tooltipTimer);
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

// Event listeners
addStationBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
searchInput.addEventListener('input', (e) => filterStations(e.target.value));
refreshBtn.addEventListener('click', () => fetchStations());

// Close the modal with Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  const swPath = location.pathname.includes('/bikeshare/') ? '/bikeshare/sw.js' : 'sw.js';
  navigator.serviceWorker.register(swPath)
    .then(reg => console.log('Service Worker registered'))
    .catch(err => console.log('Service Worker registration failed:', err));
}

// Start the app
init();
