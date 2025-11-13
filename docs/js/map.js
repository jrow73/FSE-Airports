// Map module — creates the Leaflet map and base layer
(function (global) {
const MapModule = {};


MapModule.init = function initMap() {
const map = L.map('map', { worldCopyJump: true, minZoom: 2, preferCanvas: false });


const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom: 19,
attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);


// Nice initial view (updates to data bounds after load)
map.setView([20, 0], 2);


return { map, osm };
};


global.MapModule = MapModule;
})(window);