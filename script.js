// 1. BASIC SETTINGS
var API_KEY = 'rc_live_1396fd10ad924535b3e597bc4610ba53';

var API_URL = 'https://api.restcountries.com/countries/v5';

var STORAGE_KEY = 'countryDashboard.countries.v1';

var PAGE_LIMIT = 100;

var REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Antarctic'];

var PLACEHOLDER_FLAG = 'https://placehold.co/300x200?text=No+Flag';

var laptopQuery = window.matchMedia('(min-width: 1100px) and (max-width: 1599px)');

function getPageSize() {
    return laptopQuery.matches ? 12 : 10;
}


// 2. APP DATA

var countries = [];
var currentPage = 1;
var searchText = '';
var selectedRegion = 'all';
var editingId = null;
var viewingId = null;
var confirmAction = null;
var status = 'ready';
var errorMessage = '';
var isFetching = false;


// 3. HELPER FUNCTIONS

function $(id) {
    return document.getElementById(id);
}

function makeEl(tag, className, text) {
    var element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function makeButton(text, className, label, callback) {
    var button = makeEl('button', className, text);

    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.addEventListener('click', callback);

    return button;
}

function formatNumber(number) {
    return Number(number || 0).toLocaleString('en-US');
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function generateId() {
    return 'c_' + Date.now();
}

function isValidUrl(value) {
    try {
        var url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function findCountry(id) {
    return countries.find(function (country) {
        return country.id === id;
    });
}

function fixRegionName(region) {
    if (region.toLowerCase().indexOf('antarctic') === 0) {
        return 'Antarctic';
    }

    return region;
}


// 4. CLEAN COUNTRY DATA

function cleanCountry(raw) {
    return {
        id: String(raw.id || generateId()),
        name: String(raw.name || '').trim(),
        capital: String(raw.capital || 'N/A').trim() || 'N/A',
        region: fixRegionName(String(raw.region || 'Unknown')),
        population: Math.max(0, Math.floor(Number(raw.population) || 0)),
        flag: String(raw.flag || ''),
        cca3: String(raw.cca3 || '').toUpperCase(),
        source: raw.source === 'custom' ? 'custom' : 'api'
    };
}

function generateCca3(name) {
    var code = name
        .normalize('NFD')
        .replace(/[^A-Za-z]/g, '')
        .toUpperCase()
        .slice(0, 3);

    while (code.length < 3) {
        code += 'X';
    }

    var originalCode = code;
    var count = 1;

    while (countries.some(function (c) {
        return c.cca3 === code;
    })) {
        code = originalCode.slice(0, 2) + count;
        count++;
    }

    return code;
}


// 5. FLAG IMAGE

function createFlagImage(country, className) {
    var img = makeEl('img', className);

    img.src = isValidUrl(country.flag)
        ? country.flag
        : PLACEHOLDER_FLAG;

    img.alt = 'Flag of ' + country.name;
    img.loading = 'lazy';

    img.onerror = function () {
        img.onerror = null;
        img.src = PLACEHOLDER_FLAG;
    };

    return img;
}


// 6. LOCAL STORAGE

function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(countries));
        return true;
    } catch (error) {
        showToast('Unable to save data.', 'error');
        return false;
    }
}

function loadFromLocalStorage() {
    try {
        var savedData = localStorage.getItem(STORAGE_KEY);

        if (savedData === null) {
            return false;
        }

        var data = JSON.parse(savedData);

        if (!Array.isArray(data)) {
            return false;
        }

        countries = data.map(cleanCountry).filter(function (c) {
            return c.name !== '';
        });

        return true;

    } catch (error) {
        return false;
    }
}


// 7. FETCH COUNTRIES FROM API

// async function fetchCountriesFromAPI() {

    // if (!API_KEY || API_KEY === 'PASTE_YOUR_NEW_API_KEY_HERE') {
    //     throw new Error('Please add your API key.');
    // }

    // var allCountries = [];
    // var offset = 0;
    // var more = true;

    // while (more) {

    //     var url = API_URL +
    //         '?response_fields=names.common,capitals,region,population,flag.url_svg,flag.url_png,codes.alpha_3' +
    //         '&limit=' + PAGE_LIMIT +
    //         '&offset=' + offset;

//         var response = await fetch(url, {
//             headers: {
//                 'Authorization': 'Bearer ' + API_KEY
//             }
//         });

//         if (!response.ok) {
//             throw new Error('API Error: ' + response.status);
//         }

//         var result = await response.json();

//         var data = result.data;

//         if (!data || !Array.isArray(data.objects)) {
//             throw new Error('Invalid API response.');
//         }

//         allCountries = allCountries.concat(data.objects);

//         more = data.meta && data.meta.more === true;

//         offset += PAGE_LIMIT;

//         if (data.objects.length === 0) {
//             more = false;
//         }
//     }

//     return allCountries;
// }




// 7. FETCH COUNTRIES FROM API - AJAX

function fetchCountriesFromAPI(callback) {

    if (!API_KEY || API_KEY === '') {
        callback(new Error('Please add your API key.'));
        return;
    }

    var allCountries = [];
    var offset = 0;

    function loadNextPage() {

        var url = API_URL +
            '?response_fields=names.common,capitals,region,population,flag.url_svg,flag.url_png,codes.alpha_3' +
            '&limit=' + PAGE_LIMIT +
            '&offset=' + offset;

        var xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);

        xhr.setRequestHeader(
            'Authorization',
            'Bearer ' + API_KEY
        );

        xhr.onload = function () {

            if (xhr.status < 200 || xhr.status >= 300) {
                callback(new Error('API Error: ' + xhr.status));
                return;
            }

            try {

                var result = JSON.parse(xhr.responseText);
                var data = result.data;

                if (!data || !Array.isArray(data.objects)) {
                    callback(new Error('Invalid API response.'));
                    return;
                }

                allCountries = allCountries.concat(data.objects);

                var more = data.meta && data.meta.more === true;

                if (more && data.objects.length > 0) {

                    offset += PAGE_LIMIT;
                    loadNextPage();

                } else {

                    callback(null, allCountries);
                }

            } catch (error) {
                callback(error);
            }
        };

        xhr.onerror = function () { 
            callback(new Error('Network error. Please try again.'));
        };

        xhr.send();
    }

    loadNextPage();
}


// Convert API country into our format

function mapApiCountry(item) {

    var names = item.names || {};
    var codes = item.codes || {};
    var flag = item.flag || {};

    var capital = 'N/A';

    if (Array.isArray(item.capitals) && item.capitals.length > 0) {

        var firstCapital = item.capitals[0];

        capital = typeof firstCapital === 'string'
            ? firstCapital
            : firstCapital.name || 'N/A';
    }

    return cleanCountry({
        id: codes.alpha_3,
        name: names.common,
        capital: capital,
        region: item.region,
        population: item.population,
        flag: flag.url_svg || flag.url_png || '',
        cca3: codes.alpha_3,
        source: 'api'
    });
}


// Main AJAX function

function fetchCountries() {

    if (isFetching) return;

    isFetching = true;

    var hadData = countries.length > 0;

    status = 'loading';
    renderCountries();

    fetchCountriesFromAPI(function (error, data) {

        isFetching = false;

        if (error) {

            errorMessage = error.message || 'Something went wrong.';

            status = hadData ? 'ready' : 'error';

            renderCountries();

            showToast('Unable to fetch countries.', 'error');

            console.error('API Error:', error);

            return;
        }

        countries = data
            .map(mapApiCountry)
            .filter(function (country) {
                return country.name !== '';
            })
            .sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });

        saveToLocalStorage();

        resetFilterValues();

        status = 'ready';

        renderCountries();

        showToast('Countries loaded successfully.', 'success');
    });
}


// 8. SEARCH AND FILTER

function getFilteredCountries() {

    return countries.filter(function (country) {

        var search = normalizeText(searchText);

        var matchesSearch =
            normalizeText(country.name).includes(search) ||
            normalizeText(country.capital).includes(search);

        var matchesRegion =
            selectedRegion === 'all' ||
            country.region === selectedRegion;

        return matchesSearch && matchesRegion;
    });
}

function searchCountries(value) {
    searchText = value.trim();
    currentPage = 1;
    renderCountries();
}

function filterCountries(region) {
    selectedRegion = region;
    currentPage = 1;
    renderCountries();
}

function resetFilterValues() {
    searchText = '';
    selectedRegion = 'all';
    currentPage = 1;

    $('searchInput').value = '';
    $('regionFilter').value = 'all';
}

function resetFilters() {
    resetFilterValues();
    renderCountries();
    showToast('Filters reset successfully.', 'info');
}


// 9. DASHBOARD STATISTICS

function updateDashboardStats(filteredCount) {

    var regions = [];

    var totalPopulation = 0;

    countries.forEach(function (country) {

        if (regions.indexOf(country.region) === -1) {
            regions.push(country.region);
        }

        totalPopulation += country.population;
    });

    $('statTotal').textContent = formatNumber(countries.length);

    $('statRegions').textContent = formatNumber(regions.length);

    $('statShowing').textContent = formatNumber(filteredCount);

    $('statPopulation').textContent =
        (totalPopulation / 1000000000).toFixed(2) + ' B';
}


// 10. COUNTRY CARD

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

    info.appendChild(createInfoRow(
        'Population',
        formatNumber(country.population)
    ));

    info.appendChild(createInfoRow('Code', country.cca3 || 'N/A'));

    var actions = makeEl('div', 'card-actions');

    actions.appendChild(makeButton('View', 'btn btn-outline btn-sm',
        'View ' + country.name, function () {
            viewCountryDetails(country.id);
        }));

    actions.appendChild(makeButton('Edit', 'btn btn-light btn-sm',
        'Edit ' + country.name, function () {
            openCountryForm('edit', country.id);
        }));

    actions.appendChild(makeButton('Delete', 'btn btn-danger-outline btn-sm',
        'Delete ' + country.name, function () {
            requestDeleteCountry(country.id);
        }));

    body.appendChild(titleRow);
    body.appendChild(info);
    body.appendChild(actions);

    card.appendChild(flagBox);
    card.appendChild(body);

    return card;
}


// 11. PAGINATION

function goToPage(page) {
    currentPage = page;
    renderCountries();

    $('countriesSection').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

function addPageButton(container, page, totalPages) {

    var button = makeButton(
        String(page),
        'page-btn' + (page === currentPage ? ' active' : ''),
        'Page ' + page,
        function () {
            goToPage(page);
        }
    );

    if (page === currentPage) {
        button.setAttribute('aria-current', 'page');
    }

    container.appendChild(button);
}

function renderPagination(totalPages) {

    var box = $('pagination');

    box.innerHTML = '';

    if (totalPages <= 1) return;

    var previous = makeButton('‹ Prev', 'page-btn', 'Previous page',
        function () {
            goToPage(currentPage - 1);
        });

    previous.disabled = currentPage === 1;

    box.appendChild(previous);

    var lastShown = 0;

    for (var page = 1; page <= totalPages; page++) {

        var showPage =
            page === 1 ||
            page === totalPages ||
            Math.abs(page - currentPage) <= 1;

        if (showPage) {

            if (page - lastShown > 1) {
                box.appendChild(makeEl('span', 'page-ellipsis', '…'));
            }

            addPageButton(box, page, totalPages);

            lastShown = page;
        }
    }

    var next = makeButton('Next ›', 'page-btn', 'Next page',
        function () {
            goToPage(currentPage + 1);
        });

    next.disabled = currentPage === totalPages;

    box.appendChild(next);
}


// 12. RENDER COUNTRIES

function renderCountries() {

    var grid = $('countryGrid');

    var isLoading = status === 'loading';

    var isError = status === 'error';

    $('loadingState').hidden = !isLoading;

    $('errorState').hidden = !isError;

    if (isError) {
        $('errorMessage').textContent = errorMessage;
    }

    if (isLoading || isError) {

        grid.innerHTML = '';

        $('pagination').innerHTML = '';

        $('emptyState').hidden = true;

        $('resultInfo').textContent = '';

        updateDashboardStats(0);

        return;
    }

    var filtered = getFilteredCountries();

    var pageSize = getPageSize();

    var totalPages = Math.max(
        1,
        Math.ceil(filtered.length / pageSize)
    );

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    var start = (currentPage - 1) * pageSize;

    var pageItems = filtered.slice(start, start + pageSize);

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

        $('emptyText').textContent =
            'Add a country or reload data from API.';

        $('emptyResetBtn').hidden = true;

    } else if (noMatches) {

        $('emptyTitle').textContent = 'No countries found';

        $('emptyText').textContent =
            'No country matches your search or filter.';

        $('emptyResetBtn').hidden = false;
    }

    // Result information

    if (filtered.length === 0) {

        $('resultInfo').textContent = '0 countries';

    } else {

        var end = Math.min(start + pageSize, filtered.length);

        $('resultInfo').textContent =
            'Showing ' + (start + 1) + '–' + end +
            ' of ' + filtered.length +
            ' countries (page ' + currentPage +
            ' of ' + totalPages + ')';
    }

    renderPagination(totalPages);

    updateDashboardStats(filtered.length);
}


// 13. MODALS

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

function openConfirm(title, message, buttonText, action) {

    $('confirmTitle').textContent = title;

    $('confirmMessage').textContent = message;

    $('confirmOkBtn').textContent = buttonText;

    confirmAction = action;

    openModal($('confirmModal'));
}


// 14. FORM VALIDATION

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

        var error = document.querySelector(
            '[data-error-for="' + key + '"]'
        );

        if (error) {
            error.textContent = '';
        }
    }
}

function showFormErrors(errors) {

    for (var key in errors) {

        $(FIELD_IDS[key]).classList.add('invalid');

        document.querySelector(
            '[data-error-for="' + key + '"]'
        ).textContent = errors[key];
    }
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

    if (data.name.length < 2) {
        errors.name = 'Enter a valid country name.';
    }

    var duplicate = countries.some(function (country) {
        return country.id !== ignoreId &&
            normalizeText(country.name) === normalizeText(data.name);
    });

    if (data.name && duplicate) {
        errors.name = 'Country already exists.';
    }

    if (!data.capital) {
        errors.capital = 'Capital is required.';
    }

    if (REGIONS.indexOf(data.region) === -1) {
        errors.region = 'Select a valid region.';
    }

    var population = data.population.replace(/[,\s]/g, '');

    if (!/^\d+$/.test(population)) {
        errors.population = 'Enter a valid population.';
    } else if (Number(population) > 20000000000) {
        errors.population = 'Population is too large.';
    }

    if (!isValidUrl(data.flag)) {
        errors.flag = 'Enter a valid image URL.';
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors: errors
    };
}


// 15. OPEN ADD / EDIT FORM

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

        $('fieldRegion').value = country.region;

        $('fieldPopulation').value = country.population;

        $('fieldFlag').value = country.flag;

    } else {

        editingId = null;

        $('formTitle').textContent = 'Add Country';

        $('formSubmitBtn').textContent = 'Add Country';
    }

    openModal($('formModal'));

    $('fieldName').focus();
}


// 16. FORM SUBMIT

function handleFormSubmit(event) {

    event.preventDefault();

    clearFormErrors();

    var data = readFormData();

    var result = validateForm(data, editingId);

    if (!result.valid) {

        showFormErrors(result.errors);

        showToast('Please correct the form errors.', 'error');

        return;
    }

    if (editingId) {
        editCountry(editingId, data);
    } else {
        addCountry(data);
    }
}


// 17. ADD COUNTRY

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

    countries.unshift(country);

    saveToLocalStorage();

    resetFilterValues();

    closeModal($('formModal'));

    renderCountries();

    showToast('Country added successfully.', 'success');
}


// 18. EDIT COUNTRY

function editCountry(id, data) {

    var country = findCountry(id);

    if (!country) return;

    country.name = data.name;

    country.capital = data.capital;

    country.region = data.region;

    country.population =
        Number(data.population.replace(/[,\s]/g, ''));

    country.flag = data.flag;

    saveToLocalStorage();

    editingId = null;

    closeModal($('formModal'));

    renderCountries();

    showToast('Country updated successfully.', 'success');
}


// 19. VIEW COUNTRY DETAILS

function createDetailItem(label, value, isFull) {

    var item = makeEl(
        'div',
        'detail-item' + (isFull ? ' full' : '')
    );

    item.appendChild(makeEl('div', 'detail-label', label));

    item.appendChild(makeEl('div', 'detail-value', value));

    return item;
}

function viewCountryDetails(id) {

    var country = findCountry(id);

    if (!country) return;

    viewingId = id;

    var body = $('viewBody');

    body.innerHTML = '';

    body.appendChild(createFlagImage(country, 'detail-flag'));

    body.appendChild(makeEl('h3', 'detail-name', country.name));

    var grid = makeEl('div', 'detail-grid');

    grid.appendChild(createDetailItem('Capital', country.capital));

    grid.appendChild(createDetailItem('Region', country.region));

    grid.appendChild(createDetailItem(
        'Population',
        formatNumber(country.population)
    ));

    grid.appendChild(createDetailItem(
        'Country Code',
        country.cca3 || 'N/A'
    ));

    grid.appendChild(createDetailItem(
        'Data Source',
        country.source === 'custom' ? 'Added by you' : 'REST Countries API',
        true
    ));

    body.appendChild(grid);

    openModal($('viewModal'));
}


// 20. DELETE COUNTRY

function requestDeleteCountry(id) {

    var country = findCountry(id);

    if (!country) return;

    openConfirm(
        'Delete Country',
        'Are you sure you want to delete ' + country.name + '?',
        'Delete',
        function () {
            deleteCountry(id);
        }
    );
}

function deleteCountry(id) {

    var country = findCountry(id);

    countries = countries.filter(function (c) {
        return c.id !== id;
    });

    saveToLocalStorage();

    renderCountries();

    showToast(country.name + ' deleted successfully.', 'success');
}


// 21. RELOAD API DATA

function requestReloadFromApi() {

    openConfirm(
        'Reload from API',
        'Your local changes will be replaced with fresh API data. Continue?',
        'Reload',
        function () {
            fetchCountries();
        }
    );
}


// 22. TOAST NOTIFICATION

function showToast(message, type) {

    var icons = {
        success: '✔',
        error: '✖',
        warning: '!',
        info: 'i'
    };

    if (!icons[type]) {
        type = 'info';
    }

    var container = $('toastContainer');

    while (container.children.length >= 5) {
        container.removeChild(container.firstChild);
    }

    var toast = makeEl('div', 'toast toast-' + type);

    toast.setAttribute(
        'role',
        type === 'error' ? 'alert' : 'status'
    );

    var icon = makeEl('span', 'toast-icon', icons[type]);

    var text = makeEl('span', 'toast-message', message);

    var closeButton = makeEl('button', 'toast-close', '✕');

    closeButton.type = 'button';

    closeButton.setAttribute('aria-label', 'Close notification');

    toast.appendChild(icon);

    toast.appendChild(text);

    toast.appendChild(closeButton);

    container.appendChild(toast);

    var timer;

    function removeToast() {

        clearTimeout(timer);

        toast.classList.add('toast-hide');

        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 320);
    }

    closeButton.addEventListener('click', removeToast);

    timer = setTimeout(removeToast, 3000);
}


// 23. SIDEBAR

function openSidebar() {
    $('sidebar').classList.add('open');
    $('sidebarBackdrop').classList.add('show');
}

function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebarBackdrop').classList.remove('show');
}


// 24. EVENT LISTENERS

function setupEvents() {

    // Responsive pagination

    laptopQuery.addEventListener('change', function () {
        if (status === 'ready') {
            renderCountries();
        }
    });

    // Sidebar buttons

    $('menuBtn').addEventListener('click', function () {

        if ($('sidebar').classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    $('sidebarBackdrop').addEventListener('click', closeSidebar);

    $('sidebarCloseBtn').addEventListener('click', closeSidebar);

    // Navigation links

    var navLinks = document.querySelectorAll('.nav a.nav-link');

    navLinks.forEach(function (link) {

        link.addEventListener('click', function () {

            navLinks.forEach(function (item) {
                item.classList.remove('active');
            });

            link.classList.add('active');

            closeSidebar();
        });
    });

    $('navAdd').addEventListener('click', function () {
        closeSidebar();
        openCountryForm('add');
    });

    $('navRefetch').addEventListener('click', function () {
        closeSidebar();
        requestReloadFromApi();
    });

    // Main buttons

    $('addCountryBtn').addEventListener('click', function () {
        openCountryForm('add');
    });

    $('emptyAddBtn').addEventListener('click', function () {
        openCountryForm('add');
    });

    $('retryBtn').addEventListener('click', fetchCountries);

    $('resetFiltersBtn').addEventListener('click', resetFilters);

    $('emptyResetBtn').addEventListener('click', resetFilters);

    // Search and filter

    $('searchInput').addEventListener('input', function (event) {
        searchCountries(event.target.value);
    });

    $('regionFilter').addEventListener('change', function (event) {
        filterCountries(event.target.value);
    });

    // Form

    $('countryForm').addEventListener('submit', handleFormSubmit);

    Object.keys(FIELD_IDS).forEach(function (key) {

        var field = $(FIELD_IDS[key]);

        field.addEventListener('input', function () {

            field.classList.remove('invalid');

            var error = document.querySelector(
                '[data-error-for="' + key + '"]'
            );

            if (error) error.textContent = '';
        });
    });

    // View modal edit button

    $('viewEditBtn').addEventListener('click', function () {

        var id = viewingId;

        closeModal($('viewModal'));

        if (id) {
            openCountryForm('edit', id);
        }
    });

    // Confirmation button

    $('confirmOkBtn').addEventListener('click', function () {

        var action = confirmAction;

        confirmAction = null;

        closeModal($('confirmModal'));

        if (typeof action === 'function') {
            action();
        }
    });

    // Close modal buttons

    document.querySelectorAll('[data-close]').forEach(function (button) {

        button.addEventListener('click', function () {
            closeModal(button.closest('.modal'));
        });
    });

    // Click outside modal

    document.querySelectorAll('.modal').forEach(function (modal) {

        modal.addEventListener('mousedown', function (event) {

            if (event.target === modal) {
                closeModal(modal);
            }
        });
    });

    // Escape key

    document.addEventListener('keydown', function (event) {

        if (event.key === 'Escape') {

            var openModals = document.querySelectorAll('.modal.open');

            if (openModals.length > 0) {
                closeModal(openModals[openModals.length - 1]);
            } else {
                closeSidebar();
            }
        }
    });
}


// 25. START APPLICATION

async function init() {

    setupEvents();

    $('searchInput').value = '';

    $('regionFilter').value = 'all';

    if (loadFromLocalStorage()) {

        status = 'ready';

        renderCountries();

    } else {

        await fetchCountries();
    }
}

document.addEventListener('DOMContentLoaded', init);