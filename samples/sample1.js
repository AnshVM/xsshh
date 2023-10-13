function search() {
    const query = document.getElementById('search').value
    window.location.href = window.location.href.split('?')[0] + "?q=" + query
}
document.getElementById('searchbtn').addEventListener('click', search)

const q = (new URLSearchParams(location.search)).get('q');
if (q) {
    document.getElementById("reflect").innerHTML = `Search results for ${q}`
}


