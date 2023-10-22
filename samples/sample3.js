function trackSearch(query) {
    document.write('<img src="/resources/images/tracker.gif?searchTerms=' + query + '">');
}
var query = (new URLSearchParams(location.search)).get('search');
if (query) {
    trackSearch(query);
}