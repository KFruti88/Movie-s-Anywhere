/**
 * MOVIE LIBRARY SYNC - MASTER VERSION
 * Save as: MovieSync.gs
 * * Fixes:
 * - Discord Link: Updated clickable title link to point to your website.
 * - Auto JustWatch: Automatically populates the "JustWatch" tab using the official TMDB link.
 * - Duplicate Prevention: Only triggers sync when BOTH Name and Year are present.
 * - Slug Logic: Cleans (Year) from Name field to ensure edits update the same entry in Firebase.
 * - Amazon Tag: Set to moviesanywhere02-20.
 * - Source of Truth: Writes to "Movie List" FIRST, then reads that data for Firebase.
 * - Sheet 25 Sync: Automatically pushes Name and Year from Sheet 25 to all platform tabs.
 * - Smart Update: If a movie exists as "Name (Year)" in other tabs, it updates that row instead of adding a new one.
 * - Auto-Sort: Platform tabs (2-24) are automatically sorted A-Z after any update from Sheet 25.
 * - Exclusion: Sheet 25 will NOT add or modify the "Movie List" or "Sheet 1".
 */

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjNWE1MGI5ZGY4ZGU2NTQ5ZDI3ZTkyYjJmMTkxMzliMCIsIm5iZiI6MTc3MzcwNTE5OS4zNTIsInN1YiI6IjY5Yjg5N2VmNjQyZDA4MmRlMzVjYTZmMyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.mZvAC9k_EjWR5JJq6pB1BKoo5Wjmxm8r2ebm_2bVLl8";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1480403461156896860/SLSYQjhng_3F8jjT1uKX9bPgraCbWqDgbvRfiJwsxrPbp3U7SjkpzPvEslpMRDs4E9YQ";
const FIREBASE_URL = "https://werewolf-movie-library-default-rtdb.firebaseio.com/"; 
const FIREBASE_SECRET = "JmWNlfOQX5TFXZZ7BUWa8GrTFG2kuSjAbb307N9y";

// List of all tabs to scan for existing entries and updates
const PLATFORM_TABS = [
  "AMAZON", "GOOGLE", "YOUTUBE", "Movie's Anywhere", "Apple Tv", "Fandango",
  "Netflix", "Hulu / Disney+", "Max (HBO)", "Peacock", "Paramount+", "Tubi", 
  "Pluto TV", "The Roku Channel", "Freevee", "Plex", "Xumo Play", 
  "Shudder / Screambox", "Crunchyroll", "JustWatch"
];

/**
 * Main trigger function. Ensure this is called by an onEdit trigger.
 */
function handleMovieSync(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const row = e.range.getRow();
  const col = e.range.getColumn();

  // Handle Sheet 25 Auto-Fill to all platform tabs (excluding Main list)
  if (sheetName === "Sheet 25") {
    // Check row > 1 and column 1 (Name) or 2 (Year)
    if (row > 1 && (col === 1 || col === 2)) {
      const name = sheet.getRange(row, 1).getValue().toString().trim();
      const year = sheet.getRange(row, 2).getValue().toString().trim();
      
      // We need BOTH to trigger the sync to other tabs
      if (name !== "" && year !== "" && year.length === 4) {
        syncFromSheet25(name, year);
      }
    }
    return; 
  }

  // Handle Movie List Sync (Original Logic - triggered by manual entry on Movie List)
  if (sheetName !== "Movie List") return;
  
  if (row > 1 && (col === 1 || col === 3)) {
    const name = sheet.getRange(row, 1).getValue().toString().trim();
    const year = sheet.getRange(row, 3).getValue().toString().trim();

    if (name !== "" && year !== "" && year.length === 4) {
      processSingleRow(sheet, row);
    }
  }
}

/**
 * Pushes the name and year from Sheet 25 to all platform tabs.
 * Smart Logic: Sniffs out rows even if the year is missing or stuck in the name.
 */
function syncFromSheet25(name, year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cleanNameSearch = name.toLowerCase().trim();
  const cleanYearValue = year.toString().trim();
  
  // Potential variations of the old style name column
  const variations = [
    cleanNameSearch,
    `${cleanNameSearch} (${cleanYearValue})`,
    `${cleanNameSearch} (${cleanYearValue})`.replace(/\s+/g, ' ')
  ];

  PLATFORM_TABS.forEach(tabName => {
    const tab = ss.getSheetByName(tabName);
    if (!tab) return;

    const data = tab.getDataRange().getValues();
    let rowToUpdate = -1;

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const rowNameInTab = data[i][0].toString().toLowerCase().trim();
      const rowYearInTab = data[i][2] ? data[i][2].toString().trim() : "";
      
      // 1. Check variations in the Name column
      const isNameMatch = variations.some(v => rowNameInTab === v || rowNameInTab.includes(v));
      
      // 2. If name matches and Year column is empty OR matches, we found our varmint
      if (isNameMatch && (rowYearInTab === "" || rowYearInTab === cleanYearValue)) {
        rowToUpdate = i + 1;
        break;
      }
    }

    if (rowToUpdate !== -1) {
      // Found it: Update the row with clean Name and proper Year in Col C
      tab.getRange(rowToUpdate, 1).setValue(name);
      tab.getRange(rowToUpdate, 3).setValue(year);
    } else {
      // Not found: Add a fresh row
      tab.appendRow([name, "", year]);
    }

    // Always Sort the tab A-Z by Column A (Name)
    const lastRow = tab.getLastRow();
    if (lastRow > 1) {
      tab.getRange(2, 1, lastRow - 1, tab.getLastColumn()).sort({column: 1, ascending: true});
    }
  });
}

function syncMovieLibrary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Movie List");
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  
  for (let i = 2; i <= lastRow; i++) {
    processSingleRow(sheet, i);
    Utilities.sleep(250); 
  }
  sendDiscordSummary(lastRow - 1);
}

function processSingleRow(sheet, row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawName = sheet.getRange(row, 1).getValue();
  const rawYear = sheet.getRange(row, 3).getValue();
  const lastRow = sheet.getLastRow();
  const totalMovies = lastRow - 1;
  const currentNum = row - 1;
  
  if (!rawName || !rawYear) return;

  const name = rawName.toString().trim();
  const year = rawYear.toString().trim();

  // 1. Fetch TMDB Metadata First
  const tmdb = fetchTMDBMetadata(name, year);
  if (!tmdb) return;

  const usProviders = tmdb["watch/providers"]?.results?.US || {};
  const jwOfficialLink = usProviders.link || "";

  // 2. Auto-Update the JustWatch Tab
  if (jwOfficialLink) {
    updateJustWatchTab(ss, name, year, jwOfficialLink);
  }

  // 3. Gather URLs from existing tabs
  let allTabUrls = {};
  PLATFORM_TABS.forEach(tabName => {
    const url = findUrlInTab(ss, tabName, name, year);
    if (url) allTabUrls[tabName] = url;
  });

  const allStreaming = [...(usProviders.flatrate || []), ...(usProviders.ads || []), ...(usProviders.free || [])];
  const buy = usProviders.buy || [];
  
  const timestamp = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy HH:mm:ss");
  const posterUrl = `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`;

  const storefrontCheck = {
    "AMAZON": "Amazon Video", "GOOGLE": "Google Play Movies", "YOUTUBE": "YouTube",
    "Movie's Anywhere": "Movies Anywhere", "Apple Tv": "Apple TV", "Fandango": "Fandango Now"
  };

  const streamingMap = {
    "Netflix": 14, "Hulu": 15, "Disney Plus": 15, "Max": 16, "Peacock": 17, 
    "Paramount Plus": 18, "Tubi TV": 19, "Pluto TV": 20, "The Roku Channel": 21, 
    "Freevee": 22, "Plex": 23, "Xumo Play": 24, "Shudder": 25, "Screambox": 25, "Crunchyroll": 26
  };

  sheet.getRange(row, 2).setFormula(`=IMAGE("${posterUrl}")`);

  Object.keys(storefrontCheck).forEach((tab, index) => {
    const colIndex = 4 + index;
    const tmdbName = storefrontCheck[tab];
    const isForSale = buy.some(p => p.provider_name === tmdbName);
    if (allTabUrls[tab]) {
      sheet.getRange(row, colIndex).setValue(allTabUrls[tab]);
    } else if (isForSale) {
      sheet.getRange(row, colIndex).setValue("ACTIVE");
    } else {
      sheet.getRange(row, colIndex).clearContent();
    }
  });

  const studio = tmdb.production_companies?.[0]?.name || "N/A";
  const genres = tmdb.genres?.map(g => g.name).join(", ") || "";
  sheet.getRange(row, 10).setValue(timestamp);
  sheet.getRange(row, 11).setValue(studio);
  sheet.getRange(row, 12).setValue(genres);

  sheet.getRange(row, 14, 1, 13).clearContent();
  let activeStreamNames = [];
  allStreaming.forEach(p => {
    const colIdx = streamingMap[p.provider_name];
    if (colIdx) {
      let sourceTab = getTabForProvider(p.provider_name);
      if (sourceTab && allTabUrls[sourceTab]) {
        sheet.getRange(row, colIdx).setValue(allTabUrls[sourceTab]);
      } else {
        sheet.getRange(row, colIdx).setValue("ACTIVE");
      }
      if (!activeStreamNames.includes(p.provider_name)) activeStreamNames.push(p.provider_name);
    }
  });

  const urlJW = findUrlInTab(ss, "JustWatch", name, year);
  if (urlJW) {
    sheet.getRange(row, 26).setValue(urlJW);
  } else {
    sheet.getRange(row, 26).clearContent();
  }
  
  const streamingOn = activeStreamNames.length > 0 ? activeStreamNames.join(", ") : "Rent/Buy Only";
  sheet.getRange(row, 13).setValue(streamingOn);

  SpreadsheetApp.flush();
  const finalRowData = sheet.getRange(row, 1, 1, 27).getValues()[0];
  
  const movieData = {
    title: name,
    year: year,
    image: posterUrl,
    addedAt: timestamp,
    studio: studio,
    genre: genres,
    streaming: activeStreamNames,
    amazon: finalRowData[3],
    google: finalRowData[4],
    youtube: finalRowData[5],
    moviesAnywhere: finalRowData[6],
    appleTv: finalRowData[7],
    fandango: finalRowData[8],
    netflix: finalRowData[13],
    disneyBundle: finalRowData[14],
    max: finalRowData[15],
    peacock: finalRowData[16],
    paramount: finalRowData[17],
    tubi: finalRowData[18],
    pluto: finalRowData[19],
    roku: finalRowData[20],
    freevee: finalRowData[21],
    plex: finalRowData[22],
    xumo: finalRowData[23],
    shudder: finalRowData[24],
    justwatch: finalRowData[25]
  };

  const cleanTitleForSlug = name.replace(/\(\d{4}\)/g, '').trim();
  const slug = `${cleanTitleForSlug}-${year}`.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  
  updateFirebase(slug, movieData);
  sendDiscordUpdate(name, year, posterUrl, finalRowData[3], studio, genres, streamingOn, currentNum, totalMovies);
}

function updateJustWatchTab(ss, name, year, link) {
  const tab = ss.getSheetByName("JustWatch");
  if (!tab) return;
  const data = tab.getDataRange().getValues();
  const cleanName = name.toLowerCase().trim();
  const cleanYear = year.toString().trim();
  const oldStyleSearch = `${name} (${year})`.toLowerCase().trim();
  
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    const rowName = data[i][0].toString().toLowerCase().trim();
    if (rowName === cleanName || rowName === oldStyleSearch) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (foundRow !== -1) {
    tab.getRange(foundRow, 1).setValue(name);
    tab.getRange(foundRow, 2).setValue(link); 
    tab.getRange(foundRow, 3).setValue(year);
  } else {
    tab.appendRow([name, link, year]);
  }
}

function getTabForProvider(name) {
  const providers = {
    "Netflix": "Netflix",
    "Hulu": "Hulu / Disney+",
    "Disney Plus": "Hulu / Disney+",
    "Max": "Max (HBO)",
    "Peacock": "Peacock",
    "Paramount Plus": "Paramount+",
    "Tubi TV": "Tubi",
    "Pluto TV": "Pluto TV",
    "The Roku Channel": "The Roku Channel",
    "Freevee": "Freevee",
    "Plex": "Plex",
    "Xumo Play": "Xumo Play",
    "Shudder": "Shudder / Screambox",
    "Screambox": "Shudder / Screambox",
    "Crunchyroll": "Crunchyroll",
    "JustWatch": "JustWatch"
  };
  return providers[name] || "";
}

function findUrlInTab(ss, tabName, title, year) {
  const tab = ss.getSheetByName(tabName);
  if (!tab) return null;
  const data = tab.getDataRange().getValues();
  const normalize = (str) => str.toString().toLowerCase().replace(/\(\d{4}\)/g, "").replace(/^the\s+/i, "").replace(/[^\w]/g, "").trim();
  const cleanSearch = normalize(title);
  const searchYear = year.toString().trim();
  let fallbackUrl = null;
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const cellTitle = normalize(data[i][0]);
    const cellYear = data[i][2] ? data[i][2].toString().trim() : "";
    if (cellTitle === cleanSearch) {
      if (cellYear === searchYear) return data[i][1];
      if (cellYear === "") fallbackUrl = data[i][1];
    }
  }
  return fallbackUrl;
}

function fetchTMDBMetadata(title, year) {
  const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&year=${year}`;
  const headers = { "Authorization": "Bearer " + TMDB_TOKEN };
  try {
    const res = JSON.parse(UrlFetchApp.fetch(searchUrl, { headers }).getContentText());
    if (res.results?.length > 0) {
      const id = res.results[0].id;
      return JSON.parse(UrlFetchApp.fetch(`https://api.themoviedb.org/3/movie/${id}?append_to_response=watch/providers`, { headers }).getContentText());
    }
  } catch (e) { return null; }
  return null;
}

function updateFirebase(slug, data) {
  const url = `${FIREBASE_URL}movies/${slug.replace(/[.#$\[\]]/g, "_")}.json?auth=${FIREBASE_SECRET}`;
  UrlFetchApp.fetch(url, { method: "put", contentType: "application/json", payload: JSON.stringify(data) });
}

function sendDiscordSummary(count) {
  const payload = JSON.stringify({
    embeds: [{
      title: "🎬 Movie Library Sync Complete",
      description: `The movie library has been updated. Total active titles: **${count}**`,
      color: 15158332,
      timestamp: new Date().toISOString()
    }]
  });
  UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, { method: "post", contentType: "application/json", payload: payload });
}

function sendDiscordUpdate(title, year, imageUrl, amazonUrl, studio, genres, streamingOn, current, total) {
  const payload = JSON.stringify({
    embeds: [{
      title: `Updated (${current} / ${total}): ${title} (${year})`,
      url: "https://werewolf.ourflora.com/movies-anywhere/",
      image: { url: imageUrl },
      fields: [
        { name: "Studio", value: studio, inline: true },
        { name: "Genres", value: genres, inline: true },
        { name: "Streaming On", value: streamingOn, inline: false }
      ],
      color: 3447003
    }]
  });
  UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, { method: "post", contentType: "application/json", payload: payload });
}
