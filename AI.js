// Function to generate your universal links
function getStreamingLinks(title) {
    const cleanTitle = encodeURIComponent(title);
    return {
        amazon: `https://www.amazon.com/s?k=${cleanTitle}+Movie&tag=moviesanywhere02-20`,
        youtube: `https://www.youtube.com/results?search_query=${cleanTitle}+Movie`,
        google: `https://play.google.com/store/search?q=${cleanTitle}&c=movies`,
        apple: `https://tv.apple.com/search?term=${cleanTitle}`,
        fandango: `https://www.fandango.com/search?q=${cleanTitle}`
    };
}
