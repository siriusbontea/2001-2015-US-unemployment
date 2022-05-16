// Define variables
const myData = {
    naprj: {
        epsg: "EPSG:3657",
        def: "+proj=lcc +lat_1=45.68333333333333 +lat_2=44.41666666666666 +lat_0=43.83333333333334 +lon_0=-100 +x_0=600000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
        specs: {
            resolutions: [8192, 4096, 2048, 1024, 512, 256, 128],
            origin: [0, 0],
        }
    },

    mapOptions: {
        center: [47.1152105, -101.3031364],
        scrollWheelZoom: true,
        zoomSnap: 0.1,
        dragging: true,
        zoomControl: false,
        zoomDelta: 0.2,
        zoom: .4,
        maxBounds: [
            [10, -170],
            [0, 0]
        ],
        maxBoundsViscosity: .2,

    },
    csv: {
        data: 'data/us-unemployment-counties.csv',
        st: 'STATE_FIP',
        cnty: 'COUNTY_FIP'
    },
    startYear: '2001',
    popup: function (props, year) {
        const popupContent = `<b>${props.NAME} County</b><br>
            ${props[year]}% Unemployment`;
        return popupContent;
    },
    nodata: {
        color: 'lightgrey',
        text: 'Data unavailable'
    },
    legend: {
        position: 'topright',
        mobile: 'bottomleft',
        title: '<h3><span>2001</span> Unemployment Rates</h3><ul>',
        build: function (color, breaks, i) {
            return `<li><span style="background:${color}"></span>
                  ${breaks[i].toLocaleString()}% &mdash;
                  ${breaks[i + 1].toLocaleString()}%</li>`
        },
        close: `<li><span style="background:lightgray"></span>No data</li></ul>`
    },
    slider: {
        position: 'bottomleft',
        mobile: 'bottomright',
        div: 'ui-controls',
        class: '.year-slider',
        select: '.legend h3 span',
    },
    geojsons: [{
            data: fetch("data/us-counties.json").then((r) => r.json()),
            fips: 'GEOID',
            exclude: ["COUNTY_FIP", "STATE_FIP", "NAME"],
            color: {
                q: 'q',
                breaks: 5,
                scale: {
                    type: 'brewer',
                    color: 'OrRd'
                },
                mode: 'lab'
            },
            style: {
                color: "black",
                weight: 0.5,
                fillOpacity: 1,
            },
            mouseover: {
                color: '#ffd70090',
                weight: 5
            },
            mouseout: {
                color: 'black',
                weight: 1
            }
        },
        {
            data: fetch("data/boundary_lines.json").then(r => r.json()),
            style: {
                color: "#333333",
                weight: 2,
                opacity: 1,
                interactive: false,
            },
        },
        // {
        //   data: fetch("https://newmapsplus.github.io/assets/data/ky-bbox.geojson").then(r => r.json()),
        //   style: {
        //     color: "purple",
        //     weight: 4,
        //     opacity: 1,
        //     fillOpacity: 0,
        //     interactive: false,
        //   },
        // },
    ]
}

// Place the map
const map = placeMap(myData)

// Kick it off...
getData(myData)
    .then(function (layers) {
        Papa.parse(myData.csv.data, {
            download: true,
            header: true,
            complete: function (data) {
                processData(layers, data, myData);
            }
        });
    })
    .catch(function (error) {
        console.log(`Ruh roh! An error has occurred`, error);
    });

// Functions in order that they are called
function placeMap(d) {
    const crs = new L.Proj.CRS(d.naprj.epsg, d.naprj.def, d.naprj.specs);
    d.mapOptions.crs = crs;
    const map = L.map("map",
        d.mapOptions)
    return map
}

function getData(d) {
    const promises = d.geojsons.map(k => k.data)
    return Promise.all(promises)
}

function processData(layers, csv, d) {
    const counties = layers[0];
    for (let i of counties.features) {
        for (let j of csv.data) {
            j.csvfips = j[d.csv.st] + j[d.csv.cnty]
            if (i.properties[d.geojsons[0].fips] === j.csvfips) {
                i.properties.unemploymentRates = j;
                break;
            }
        }
    }
    const rates = [];
    d.geojsons[0].exclude.push("unemploymentRates", "csvfips");
    counties.features.forEach(function (county) {
        for (const prop in county.properties.unemploymentRates) {
            if (!d.geojsons[0].exclude.includes(prop)) {
                rates.push(Number(county.properties.unemploymentRates[prop]));
            }
        }
    });
    const c = d.geojsons[0].color
    const breaks = chroma.limits(rates, c.q, c.breaks);
    const colorize = chroma.scale(chroma[c.scale.type][c.scale.color])
        .classes(breaks)
        .mode(c.mode);
    drawMap(layers, colorize, d);
    drawLegend(breaks, colorize);
}

function drawMap(layers, colorize, d) {
    const dataLayer = L.geoJson(layers[0], {
        style: function (feature) {
            return d.geojsons[0].style;
        },
        onEachFeature: function (feature, layer) {
            layer.on('mouseover', function () {
                layer.setStyle(d.geojsons[0].mouseover).bringToFront();
            });
            layer.on('mouseout', function () {
                layer.setStyle(d.geojsons[0].mouseout).bringToBack();
            });
        }
    }).addTo(map);
    for (let i = 1; i < layers.length; i++) {
        L.geoJson(layers[i], {
            style: function (feature) {
                return d.geojsons[i].style;
            },
        }).addTo(map);
    }
    createSliderUI(dataLayer, colorize, d);
    updateMap(dataLayer, colorize, d.startYear, d);
}

function updateMap(dataLayer, colorize, currentYear, d) {
    dataLayer.eachLayer(function (layer) {
        const props = layer.feature.properties.unemploymentRates;
        if (props) {
            layer.setStyle({
                fillColor: colorize(Number(props[currentYear]))
            });
            const tooltip = d.popup(props, currentYear);
            layer.bindTooltip(tooltip, {
                sticky: true
            });
        } else {
            layer.setStyle({
                fillColor: d.nodata.color
            });
            layer.bindTooltip(d.nodata.text, {
                sticky: true
            });
        }
    });
}

// Example using global myData variable instead of passing it in
function drawLegend(breaks, colorize) {
    let legendControl = L.control({
        position: myData.legend.position
    });
    if (L.Browser.mobile) {
        legendControl.setPosition(myData.legend.mobile);
    }
    legendControl.onAdd = function (map) {
        const legend = L.DomUtil.create('div', 'legend');
        return legend;
    };
    legendControl.addTo(map);
    const legend = document.querySelector('.legend')
    legend.innerHTML = myData.legend.title;
    for (let i = 0; i < breaks.length - 1; i++) {
        const color = colorize(breaks[i]);
        const classRange = myData.legend.build(color, breaks, i)
        legend.innerHTML += classRange;
    }
    legend.innerHTML += myData.legend.close;
}

function createSliderUI(dataLayer, colorize, d) {
    let sliderControl = L.control({
        position: d.slider.position
    });
    if (L.Browser.mobile) {
        sliderControl.setPosition(d.slider.mobile);
    }
    sliderControl.onAdd = function (map) {
        const slider = L.DomUtil.get(d.slider.div);
        L.DomEvent.disableScrollPropagation(slider);
        L.DomEvent.disableClickPropagation(slider);
        return slider;
    }
    sliderControl.addTo(map);
    const slider = document.querySelector(d.slider.class);
    slider.addEventListener("input", function (e) {
        const currentYear = e.target.value;
        updateMap(dataLayer, colorize, currentYear, d);
        document.querySelector(d.slider.select).innerHTML = currentYear;
    });
}