// =====================================================
// Country Management Dashboard - plain JavaScript
// =====================================================

var API_KEY = 'rc_live_1396fd10ad924535b3e597bc4610ba53';
var API_URL = 'https://api.restcountries.com/countries/v5' +
  '?response_fields=names.common,capitals,region,population,flag.url_svg,flag.url_png,codes.alpha_3';
var PAGE_LIMIT = 100;  
var STORAGE_KEY = 'countryDashboard.countries.v1';
var REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Antarctic'];
var PLACEHOLDER_FLAG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">' +
  '<rect width="300" height="200" fill="#e5e7eb"/>' +
  '<text x="150" y="108" font-family="Arial" font-size="16" fill="#6b7280" text-anchor="middle">No Flag</text>' +
  '</svg>'
);

// Cards per page: 12 on laptop screens (3 columns x 4 rows), 10 everywhere else
var laptopQuery = window.matchMedia('(min-width: 1100px) and (max-width: 1599px)');

function getPageSize() {
  return laptopQuery.matches ? 12 : 10;
}

// ---------- App data ----------
var countries = [];
var currentPage = 1;
var searchText = '';
var selectedRegion = 'all';
var editingId = null;
var viewingId = null;
var confirmAction = null;
var status = 'ready';      // 'loading' | 'error' | 'ready'
var errorMessage = '';
var isFetching = false;
var wasEmpty = false;

// ---------- Small helpers ----------
function $(id) {
  return document.getElementById(id);
}

function makeEl(tag, className, text) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;   // textContent keeps user input safe
  return el;
}

function makeButton(text, className, label, onClick) {
  var btn = makeEl('button', className, text);
  btn.type = 'button';
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', onClick);
  return btn;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}
//custom add id u
function generateId() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

//img

function isValidUrl(value) {
  try {
    var url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}


function findCountry(id) {
  return countries.find(function (c) { return c.id === id; });
}

function createFlagImage(country, className) {
  var img = makeEl('img', className);
  img.src = isValidUrl(country.flag) ? country.flag : PLACEHOLDER_FLAG;
  img.alt = 'Flag of ' + country.name;
  img.loading = 'lazy';
  img.onerror = function () {
    img.onerror = null;
    img.src = PLACEHOLDER_FLAG;
  };
  return img;
}

function fixRegionName(region) {
  // v5 may say "Antarctica"; our dropdown uses "Antarctic"
  return region.toLowerCase().indexOf('antarctic') === 0 ? 'Antarctic' : region;
}

function cleanCountry(raw) {
  var pop = Number(raw.population);
  return {
    id: String(raw.id || generateId()),
    name: String(raw.name || '').trim(),
    capital: String(raw.capital || 'N/A').trim() || 'N/A',
    region: fixRegionName(String(raw.region || 'Unknown').trim() || 'Unknown'),
    population: isFinite(pop) && pop >= 0 ? Math.floor(pop) : 0,
    flag: String(raw.flag || ''),
    cca3: String(raw.cca3 || '').toUpperCase(),
    source: raw.source === 'custom' ? 'custom' : 'api'
  };
}

function generateCca3(name) {
  var taken = countries.map(function (c) { return c.cca3; });
  var base = name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  while (base.length < 3) base += 'X';
  base = base.slice(0, 3);
  if (taken.indexOf(base) === -1) return base;

  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (var i = 0; i < chars.length; i++) {
    var candidate = base.slice(0, 2) + chars.charAt(i);
    if (taken.indexOf(candidate) === -1) return candidate;
  }
  return base;
}

// =====================================================
// LocalStorage
// =====================================================



function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(countries));
    return true;
  } catch (e) {
    showToast('Could not save changes to browser storage.', 'error');
    return false;
  }
}

// Returns true only if a saved list exists (even an empty one)

function loadFromLocalStorage() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    countries = parsed.map(cleanCountry).filter(function (c) { return c.name !== ''; });
    return true;
  } catch (e) {
    return false;
  }
}

// =====================================================
// Fetch data from REST Countries API
// =====================================================
function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// One request with a 20 second timeout and the API key header
async function fetchJson(url) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 20000);
  try {
    var response = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + API_KEY },
      signal: controller.signal
    });

    if (!response.ok) {
      var message = 'Server responded with status ' + response.status + '.';
      if (response.status === 401) message = 'Invalid or missing API key (401). Check API_KEY in script.js.';
      if (response.status === 403) message = 'Access forbidden (403). Check your account status and allowed origins.';
      if (response.status === 410) message = 'This API version is no longer active (410).';
      if (response.status === 429) message = 'Too many requests (429). Wait a few seconds and try again.';
      var err = new Error(message);
      // Do not retry client errors (wrong key, forbidden...) - retrying will not help
      err.noRetry = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw err;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, tries) {
  var lastError = null;
  for (var i = 1; i <= tries; i++) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
      if (error.noRetry) throw error;
      if (i < tries) await wait(1000 * i);
    }
  }
  throw lastError;
}

// v5 returns max 100 countries per request, so load page by page (offset 0, 100, 200...)
async function getCountriesFromApi() {
  if (!API_KEY || API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    throw new Error('API key is missing. Open script.js and paste your REST Countries API key into API_KEY.');
  }

  var all = [];
  var offset = 0;
  var more = true;

  while (more) {
    var json = await fetchWithRetry(API_URL + '&limit=' + PAGE_LIMIT + '&offset=' + offset, 3);
    var data = json && json.data;
    if (!data || !Array.isArray(data.objects)) {
      throw new Error('Unexpected API response format.');
    }
    all = all.concat(data.objects);
    more = !!(data.meta && data.meta.more === true) && data.objects.length > 0;
    offset += PAGE_LIMIT;
  }

  if (all.length === 0) throw new Error('The API returned no data.');
  return all;
}

// Convert one v5 country object into our simple format
function mapApiCountry(item) {
  var names = item.names || {};
  var codes = item.codes || {};
  var flag = item.flag || {};

  var capitalNames = [];
  if (Array.isArray(item.capitals)) {
    item.capitals.forEach(function (cap) {
      var capName = typeof cap === 'string' ? cap : (cap && cap.name);
      if (capName) capitalNames.push(capName);
    });
  }

  return cleanCountry({
    id: codes.alpha_3,
    name: names.common,
    capital: capitalNames.length > 0 ? capitalNames.join(', ') : 'N/A',
    region: item.region,
    population: item.population,
    flag: flag.url_svg || flag.url_png || '',
    cca3: codes.alpha_3,
    source: 'api'
  });
}

async function fetchCountries() {
  if (isFetching) return;
  isFetching = true;

  var hadData = countries.length > 0;
  status = 'loading';
  renderCountries();

  try {
    var data = await getCountriesFromApi();

    countries = data.map(mapApiCountry).filter(function (c) {
      return c.name !== '';
    }).sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    saveToLocalStorage();
    resetFilterValues();
    status = 'ready';
    renderCountries();
    showToast(countries.length + ' countries fetched successfully.', 'success');
  } catch (error) {
    if (error.name === 'AbortError') {
      errorMessage = 'The request timed out. Please try again.';
    } else if (error instanceof TypeError) {
      // fetch() throws TypeError for network problems and CORS blocks
      errorMessage = 'The browser blocked the request. On restcountries.com open "API Keys" and add ' +
        '127.0.0.1 and localhost to your key\'s Allowed Origins, then reload this page.';
    } else {
      errorMessage = error.message || 'Something went wrong.';
    }
    status = hadData ? 'ready' : 'error';
    renderCountries();
    showToast('API fetching failed. Please try again.', 'error');
  }

  isFetching = false;
}

// =====================================================
// Search and filter
// =====================================================
function getFilteredCountries() {
  var query = normalizeText(searchText);
  return countries.filter(function (c) {
    var regionOk = selectedRegion === 'all' || c.region === selectedRegion;
    var searchOk = query === '' ||
      normalizeText(c.name).indexOf(query) !== -1 ||
      normalizeText(c.capital).indexOf(query) !== -1;
    return regionOk && searchOk;
  });
}

function searchCountries(query) {
  searchText = String(query || '').trim();
  currentPage = 1;
  applyFilters();
}

function filterCountries(region) {
  selectedRegion = region || 'all';
  currentPage = 1;
  applyFilters();
}

function applyFilters() {
  renderCountries();
  var isEmpty = countries.length > 0 && getFilteredCountries().length === 0;
  if (isEmpty && !wasEmpty) {
    showToast('No countries found for your search or filter.', 'warning');
  }
  wasEmpty = isEmpty;
}

function resetFilterValues() {
  searchText = '';
  selectedRegion = 'all';
  currentPage = 1;
  wasEmpty = false;
  $('searchInput').value = '';
  $('regionFilter').value = 'all';
}

function resetFilters() {
  resetFilterValues();
  renderCountries();
  showToast('Filters have been reset.', 'info');
}

// =====================================================
// Rendering
// =====================================================
function updateDashboardStats(filteredCount) {
  var regions = [];
  var totalPopulation = 0;

  countries.forEach(function (c) {
    if (c.region && regions.indexOf(c.region) === -1) regions.push(c.region);
    totalPopulation += c.population;
  });

  $('statTotal').textContent = formatNumber(countries.length);
  $('statRegions').textContent = formatNumber(regions.length);
  $('statShowing').textContent = formatNumber(filteredCount);
  $('statPopulation').textContent = (totalPopulation / 1000000000).toFixed(2) + ' B';
}

function createInfoRow(label, value) {
  var row = makeEl('div', 'info-row');
  row.appendChild(makeEl('span', 'info-label', label));
  row.appendChild(makeEl('span', 'info-value', value));
  return row;
}

function createCountryCard(country) {
  var card = makeEl('article', 'card');

  var flagBox = makeEl('div', 'card-flag');
  flagBox.appendChild(createFlagImage(country, ''));

  var body = makeEl('div', 'card-body');

  var titleRow = makeEl('div', 'card-title-row');
  titleRow.appendChild(makeEl('h3', 'card-title', country.name));
  titleRow.appendChild(makeEl('span', 'badge', country.region));

  var info = makeEl('div', 'info-list');
  info.appendChild(createInfoRow('Capital', country.capital));
  info.appendChild(createInfoRow('Population', formatNumber(country.population)));
  info.appendChild(createInfoRow('Code', country.cca3 || 'N/A'));

  var actions = makeEl('div', 'card-actions');
  actions.appendChild(makeButton('View', 'btn btn-outline btn-sm', 'View details of ' + country.name, function () {
    viewCountryDetails(country.id);
  }));
  actions.appendChild(makeButton('Edit', 'btn btn-light btn-sm', 'Edit ' + country.name, function () {
    openCountryForm('edit', country.id);
  }));
  actions.appendChild(makeButton('Delete', 'btn btn-danger-outline btn-sm', 'Delete ' + country.name, function () {
    requestDeleteCountry(country.id);
  }));

  body.appendChild(titleRow);
  body.appendChild(info);
  body.appendChild(actions);
  card.appendChild(flagBox);
  card.appendChild(body);
  return card;
}

function goToPage(page) {
  currentPage = page;
  renderCountries();
  $('countriesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addPageButton(container, page, totalPages) {
  var btn = makeButton(String(page), 'page-btn' + (page === currentPage ? ' active' : ''), 'Page ' + page, function () {
    goToPage(page);
  });
  if (page === currentPage) btn.setAttribute('aria-current', 'page');
  container.appendChild(btn);
}

function renderPagination(totalPages) {
  var box = $('pagination');
  box.innerHTML = '';                       // clearing only, no user data inserted
  if (totalPages <= 1) return;

  var prev = makeButton('‹ Prev', 'page-btn', 'Previous page', function () { goToPage(currentPage - 1); });
  prev.disabled = currentPage === 1;
  box.appendChild(prev);

  var lastShown = 0;
  for (var p = 1; p <= totalPages; p++) {
    var show = p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1;
    if (show) {
      if (p - lastShown > 1) box.appendChild(makeEl('span', 'page-ellipsis', '…'));
      addPageButton(box, p, totalPages);
      lastShown = p;
    }
  }

  var next = makeButton('Next ›', 'page-btn', 'Next page', function () { goToPage(currentPage + 1); });
  next.disabled = currentPage === totalPages;
  box.appendChild(next);
}

function renderCountries() {
  var grid = $('countryGrid');
  var isLoading = status === 'loading';
  var isError = status === 'error';

  $('loadingState').hidden = !isLoading;
  $('errorState').hidden = !isError;
  if (isError) $('errorMessage').textContent = errorMessage;

  if (isLoading || isError) {
    grid.innerHTML = '';
    $('pagination').innerHTML = '';
    $('emptyState').hidden = true;
    $('resultInfo').textContent = '';
    updateDashboardStats(0);
    return;
  }

  var filtered = getFilteredCountries();
  var totalPages = Math.max(1, Math.ceil(filtered.length / getPageSize()));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  var start = (currentPage - 1) * getPageSize();
  var pageItems = filtered.slice(start, start + getPageSize());

  grid.innerHTML = '';
  pageItems.forEach(function (country) {
    grid.appendChild(createCountryCard(country));
  });

  // Empty state
  var noData = countries.length === 0;
  var noMatches = !noData && filtered.length === 0;
  $('emptyState').hidden = !(noData || noMatches);
  if (noData) {
    $('emptyTitle').textContent = 'No countries available';
    $('emptyText').textContent = 'All records were removed. Add a country or reload the data from the API.';
    $('emptyResetBtn').hidden = true;
  } else if (noMatches) {
    $('emptyTitle').textContent = 'No countries found';
    $('emptyText').textContent = 'No country matches your search or selected region.';
    $('emptyResetBtn').hidden = false;
  }

  // Result text
  if (filtered.length === 0) {
    $('resultInfo').textContent = '0 countries';
  } else {
    var end = Math.min(start + getPageSize(), filtered.length);
    $('resultInfo').textContent = 'Showing ' + (start + 1) + '–' + end + ' of ' + filtered.length +
      ' countries (page ' + currentPage + ' of ' + totalPages + ')';
  }

  renderPagination(totalPages);
  updateDashboardStats(filtered.length);
}

// =====================================================
// Modals
// =====================================================
function openModal(modal) {
  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeModal(modal) {
  modal.classList.remove('open');
  if (document.querySelectorAll('.modal.open').length === 0) {
    document.body.classList.remove('modal-open');
  }
}

function openConfirm(title, message, okText, action) {
  $('confirmTitle').textContent = title;
  $('confirmMessage').textContent = message;
  $('confirmOkBtn').textContent = okText;
  confirmAction = action;
  openModal($('confirmModal'));
}

// =====================================================
// Form: validate, add, edit
// =====================================================
var FIELD_IDS = {
  name: 'fieldName',
  capital: 'fieldCapital',
  region: 'fieldRegion',
  population: 'fieldPopulation',
  flag: 'fieldFlag'
};

function clearFormErrors() {
  for (var key in FIELD_IDS) {
    $(FIELD_IDS[key]).classList.remove('invalid');
    var errorEl = document.querySelector('[data-error-for="' + key + '"]');
    if (errorEl) errorEl.textContent = '';
  }
}

function showFormErrors(errors) {
  var firstKey = null;
  for (var key in FIELD_IDS) {
    if (errors[key]) {
      $(FIELD_IDS[key]).classList.add('invalid');
      document.querySelector('[data-error-for="' + key + '"]').textContent = errors[key];
      if (!firstKey) firstKey = key;
    }
  }
  if (firstKey) $(FIELD_IDS[firstKey]).focus();
}

function readFormData() {
  return {
    name: $('fieldName').value.trim(),
    capital: $('fieldCapital').value.trim(),
    region: $('fieldRegion').value,
    population: $('fieldPopulation').value.trim(),
    flag: $('fieldFlag').value.trim()
  };
}

function validateForm(data, ignoreId) {
  var errors = {};

  if (data.name === '') {
    errors.name = 'Country name is required.';
  } else if (data.name.length < 2) {
    errors.name = 'Country name must be at least 2 characters.';
  } else {
    var duplicate = countries.some(function (c) {
      return c.id !== ignoreId && normalizeText(c.name) === normalizeText(data.name);
    });
    if (duplicate) errors.name = 'A country with this name already exists.';
  }

  if (data.capital === '') {
    errors.capital = 'Capital city is required.';
  }

  if (data.region === '') {
    errors.region = 'Please select a region.';
  } else if (REGIONS.indexOf(data.region) === -1) {
    errors.region = 'Please choose a valid region.';
  }

  var popText = data.population.replace(/[,\s]/g, '');
  if (popText === '') {
    errors.population = 'Population is required.';
  } else if (!/^\d+$/.test(popText)) {
    errors.population = 'Enter a valid whole number (0 or more).';
  } else if (Number(popText) > 20000000000) {
    errors.population = 'Population value is too large.';
  }

  if (data.flag === '') {
    errors.flag = 'Flag image URL is required.';
  } else if (!isValidUrl(data.flag)) {
    errors.flag = 'Enter a valid URL starting with http:// or https://';
  }

  return { valid: Object.keys(errors).length === 0, errors: errors };
}

function openCountryForm(mode, id) {
  clearFormErrors();
  $('countryForm').reset();

  if (mode === 'edit') {
    var country = findCountry(id);
    if (!country) {
      showToast('Country not found.', 'error');
      return;
    }
    editingId = id;
    $('formTitle').textContent = 'Edit ' + country.name;
    $('formSubmitBtn').textContent = 'Save Changes';
    $('fieldName').value = country.name;
    $('fieldCapital').value = country.capital;
    $('fieldRegion').value = REGIONS.indexOf(country.region) !== -1 ? country.region : '';
    $('fieldPopulation').value = String(country.population);
    $('fieldFlag').value = country.flag;
  } else {
    editingId = null;
    $('formTitle').textContent = 'Add Country';
    $('formSubmitBtn').textContent = 'Add Country';
  }

  openModal($('formModal'));
  $('fieldName').focus();
}

function handleFormSubmit(event) {
  event.preventDefault();
  clearFormErrors();

  var data = readFormData();
  var result = validateForm(data, editingId);

  if (!result.valid) {
    showFormErrors(result.errors);
    showToast('Invalid form inputs. Please fix the highlighted fields.', 'error');
    return;
  }

  if (editingId) {
    editCountry(editingId, data);
  } else {
    addCountry(data);
  }
}

function addCountry(data) {
  var country = cleanCountry({
    id: generateId(),
    name: data.name,
    capital: data.capital,
    region: data.region,
    population: Number(data.population.replace(/[,\s]/g, '')),
    flag: data.flag,
    cca3: generateCca3(data.name),
    source: 'custom'
  });

  countries.unshift(country);       // new country appears first
  saveToLocalStorage();

  resetFilterValues();              // so the new country is visible
  status = 'ready';
  closeModal($('formModal'));
  renderCountries();
  showToast(country.name + ' added successfully.', 'success');
}

function editCountry(id, data) {
  var country = findCountry(id);
  if (!country) {
    showToast('Country not found.', 'error');
    return;
  }

  country.name = data.name;
  country.capital = data.capital;
  country.region = data.region;
  country.population = Number(data.population.replace(/[,\s]/g, ''));
  country.flag = data.flag;

  saveToLocalStorage();
  editingId = null;
  closeModal($('formModal'));
  renderCountries();
  showToast(country.name + ' updated successfully.', 'success');
}

// =====================================================
// View details and delete
// =====================================================
function createDetailItem(label, value, isFull) {
  var item = makeEl('div', 'detail-item' + (isFull ? ' full' : ''));
  item.appendChild(makeEl('div', 'detail-label', label));
  item.appendChild(makeEl('div', 'detail-value', value));
  return item;
}

function viewCountryDetails(id) {
  var country = findCountry(id);
  if (!country) {
    showToast('Country not found.', 'error');
    return;
  }
  viewingId = id;

  var body = $('viewBody');
  body.innerHTML = '';
  body.appendChild(createFlagImage(country, 'detail-flag'));
  body.appendChild(makeEl('h3', 'detail-name', country.name));

  var grid = makeEl('div', 'detail-grid');
  grid.appendChild(createDetailItem('Capital', country.capital, false));
  grid.appendChild(createDetailItem('Region', country.region, false));
  grid.appendChild(createDetailItem('Population', formatNumber(country.population), false));
  grid.appendChild(createDetailItem('Country Code (CCA3)', country.cca3 || 'N/A', false));
  grid.appendChild(createDetailItem('Data Source', country.source === 'custom' ? 'Added by you' : 'REST Countries API', true));
  body.appendChild(grid);

  openModal($('viewModal'));
}

function requestDeleteCountry(id) {
  var country = findCountry(id);
  if (!country) {
    showToast('Country not found.', 'error');
    return;
  }
  openConfirm(
    'Delete Country',
    'Are you sure you want to delete "' + country.name + '"? This action cannot be undone.',
    'Delete',
    function () { deleteCountry(id); }
  );
}

function deleteCountry(id) {
  var country = findCountry(id);
  if (!country) {
    showToast('Country not found.', 'error');
    return;
  }

  countries = countries.filter(function (c) { return c.id !== id; });
  saveToLocalStorage();
  renderCountries();
  showToast(country.name + ' deleted successfully.', 'success');
}

function requestReloadFromApi() {
  openConfirm(
    'Reload from API',
    'This will discard all your added, edited and deleted records and fetch a fresh copy from the REST Countries API. Continue?',
    'Reload',
    function () { fetchCountries(); }
  );
}

// =====================================================
// Toast notifications
// =====================================================
function showToast(message, type) {
  var icons = { success: '✔', error: '✖', warning: '!', info: 'i' };
  if (!icons[type]) type = 'info';

  var container = $('toastContainer');
  while (container.children.length >= 5) {
    container.removeChild(container.firstChild);
  }

  var toast = makeEl('div', 'toast toast-' + type);
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  var icon = makeEl('span', 'toast-icon', icons[type]);
  var text = makeEl('span', 'toast-message', message);
  var closeBtn = makeEl('button', 'toast-close', '✕');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close notification');

  toast.appendChild(icon);
  toast.appendChild(text);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  var removed = false;
  var timer = null;

  function removeToast() {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    toast.classList.add('toast-hide');            // fade-out animation
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 320);
  }

  closeBtn.addEventListener('click', removeToast);
  timer = setTimeout(removeToast, 3000);          // auto close after 3 seconds
}

// =====================================================
// Sidebar (responsive navigation)
// =====================================================
function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebarBackdrop').classList.add('show');
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarBackdrop').classList.remove('show');
}

// =====================================================
// Event listeners
// =====================================================
function setupEvents() {
  // Switch between 12 and 10 cards per page when the window size changes
  laptopQuery.addEventListener('change', function () {
    if (status === 'ready') renderCountries();
  });

  // Sidebar
  $('menuBtn').addEventListener('click', function () {
    if ($('sidebar').classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  $('sidebarBackdrop').addEventListener('click', closeSidebar);
  $('sidebarCloseBtn').addEventListener('click', closeSidebar);

  var navLinks = document.querySelectorAll('.nav a.nav-link');
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.forEach(function (l) { l.classList.remove('active'); });
      link.classList.add('active');
      closeSidebar();
    });
  });

  $('navAdd').addEventListener('click', function () { closeSidebar(); openCountryForm('add'); });
  $('navRefetch').addEventListener('click', function () { closeSidebar(); requestReloadFromApi(); });

  // Buttons
  $('addCountryBtn').addEventListener('click', function () { openCountryForm('add'); });
  $('emptyAddBtn').addEventListener('click', function () { openCountryForm('add'); });
  $('retryBtn').addEventListener('click', fetchCountries);
  $('resetFiltersBtn').addEventListener('click', resetFilters);
  $('emptyResetBtn').addEventListener('click', resetFilters);

  // Search and region filter
  $('searchInput').addEventListener('input', function (e) { searchCountries(e.target.value); });
  $('regionFilter').addEventListener('change', function (e) { filterCountries(e.target.value); });

  // Form
  $('countryForm').addEventListener('submit', handleFormSubmit);
  Object.keys(FIELD_IDS).forEach(function (key) {
    var field = $(FIELD_IDS[key]);
    function clearError() {
      field.classList.remove('invalid');
      document.querySelector('[data-error-for="' + key + '"]').textContent = '';
    }
    field.addEventListener('input', clearError);
    field.addEventListener('change', clearError);
  });

  // View modal -> Edit button
  $('viewEditBtn').addEventListener('click', function () {
    var id = viewingId;
    closeModal($('viewModal'));
    if (id) openCountryForm('edit', id);
  });

  // Confirm modal
  $('confirmOkBtn').addEventListener('click', function () {
    var action = confirmAction;
    confirmAction = null;
    closeModal($('confirmModal'));
    if (typeof action === 'function') action();
  });

  // Close buttons, click outside, Escape key
  document.querySelectorAll('[data-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModal(btn.closest('.modal')); });
  });
  document.querySelectorAll('.modal').forEach(function (modal) {
    modal.addEventListener('mousedown', function (e) {
      if (e.target === modal) closeModal(modal);
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var open = document.querySelectorAll('.modal.open');
      if (open.length > 0) closeModal(open[open.length - 1]);
      else closeSidebar();
    }
  });
}

// =====================================================
// Start the app
// =====================================================
async function init() {
  $('searchInput').value = '';
  $('regionFilter').value = 'all';
  setupEvents();

  // Call the API only when nothing is saved yet
  if (loadFromLocalStorage()) {
    status = 'ready';
    renderCountries();
  } else {
    await fetchCountries();
  }
}

document.addEventListener('DOMContentLoaded', init);
