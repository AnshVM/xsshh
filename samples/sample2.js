function doSearchQuery(query) {
    document.getElementById('searchMessage').innerHTML = query;
}
var query = (new URLSearchParams(location.search)).get('search');
if (query) {
    doSearchQuery(query);
}