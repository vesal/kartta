
class MapWrapper {
  /**
   * @typedef {Object} Polyline
   * @property {function(string, Object=): any} setText
   */
   // Luo layer-muuttuja, johon asetetaan nykyinen karttalaatta


    constructor(containerId, mapmodes, useCache = true) {
      // noinspection TypeScriptUMDGlobal
      this.tileStore = new KeyValStore('kartta-db', 'tiles');
      this.useCache = useCache;
      // noinspection TypeScriptUMDGlobal
      this.L = L;
      this.currentLayer = null;
      this.mapModes = mapmodes;
      this.mapModeKey = "OpenStreet";
      this.mapMode = this.mapModes[this.mapModeKey];
      const tileLayerOptions = {
        attribution: this.mapMode.c,
        // maxZoom: 26,
        minZoom: 2,
        zoomControl: false,
        rotate: true,
        bearing: 0,
        touchRotate: true,
        shiftKeyRotate: true,
 				rotateControl: {
					closeOnZeroBearing: false,
					position: 'topright',
				},

      }
      // mapWrapper.map.rotate.enable();
      // this.map.touchRotate.enable();
      // mapWrapper.map.rotate.setAngle(45);

      this.map = this.L.map('map', tileLayerOptions).setView([60.1699, 24.9384], 13);
      this.pins = [];
      // this.L.control.zoom({ position: 'topright' }).addTo(this.map);
      this.L.control.scale({
        position: 'bottomright',
        imperial: false
      }).addTo(this.map);
    }

   setZoomButtons(show) {
      if (show) {
        this.zoomControl = this.L.control.zoom({ position: 'topright' }).addTo(this.map);
      } else {
        if (this.zoomControl) this.zoomControl.remove();
        this.zoomControl = null
      }
   }

   setUseCache(useCache) {
     this.useCache = useCache;
   }

   setView(coord, zoom=null) {
     if (zoom === null) {
       zoom = this.map.getZoom();
     }
     if (zoom > this.mapMode.mz) zoom = this.mapMode.mz;
     if (Array.isArray(coord)) {
       coord = this.L.latLng(coord[0], coord[1]);
     }
     this.map.setView(coord, zoom);
   }

   getCenter() {
     const center = this.map.getCenter();
     return [center.lat, center.lng];
   }

   getZoom() {
      return this.map.getZoom();
   }

   addLayer(layer) {
     this.map.addLayer(layer);
   }

   removeLayer(layer) {
     this.map.removeLayer(layer);
   }


  // noinspection TypeScriptUMDGlobal
  static CustomTileLayer = class extends L.GridLayer {
    constructor(options, outer) {
      super(options);
      this.outer = outer;
    }


  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    const tileInfo = { zoom: coords.z, x: coords.x, y: coords.y };
    const url = this.outer.mapMode.f(tileInfo);
    tile.crossOrigin = "Anonymous";
    tile.onload = () => done(null, tile);
    tile.onerror = () => done(new Error('Tile load error'), tile);

    if (!this.outer.useCache) {
      // Do not use cache, always fetch from network
      tile.src = url;
      return tile;
    }

    const cacheKey = `${this.outer.mapModeKey}_${coords.z}_${coords.x}_${coords.y}`;

    // Try to get from IndexedDB
    this.outer.tileStore.get(cacheKey).then(cached => {
      if (cached) {
        tile.src = typeof cached === "string" ? cached : "";
        done(null, tile); // Notify Leaflet that the tile is ready
        // console.log(`From tile cache: ${cacheKey}`);
        return tile;
      }
      // Not cached: fetch from network
      tile.src = url;
      tile.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = tile.width;
          canvas.height = tile.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(tile, 0, 0);
          const dataURL = canvas.toDataURL('image/png');
          // Tässä yritetty zipata, mutta siitä ei ollut kuin haittaa
          this.outer.tileStore.set(cacheKey, dataURL).catch(e => {
            console.log('Tile cache error:', e, e.name, e.message, e.code);
          });          // console.log(`Tile cached: ${cacheKey}`);
        } catch (e) {
          // Ignore storage errors
        }
        done(null, tile);
      };
    });
    return tile;
  }

  }; // CustomTileLayer ends

  setDoubleClickZoom(enable) {
    if (enable) {
      this.map.doubleClickZoom.enable();
    } else {
      this.map.doubleClickZoom.disable();
    }
  }

  // Aluksi luodaan ja lisätään ensimmäinen layer
  setMapMode(modeKey) {
    const mapMode = this.mapModes[modeKey];
    if (mapMode) {
      this.mapMode = mapMode;
      this.mapModeKey = modeKey;
    }
    if (this.currentLayer) {
      this.removeLayer(this.currentLayer);
    }
    if (typeof this.mapMode.i !== 'undefined') {
         this.mapMode.i();
    }
    const tileLayerOptions = {
      attribution: this.mapMode.c,
      maxZoom: this.mapMode.mz,
      minZoom: 2,
    };
    // Ota oma karttataso käyttöön
    this.currentLayer = new MapWrapper.CustomTileLayer(tileLayerOptions, this);
    this.addLayer(this.currentLayer);

    // Päivitä attribution-kenttä Leafletin oikeaan alakulmaan
    this.map.attributionControl.setPrefix(false);
    // map.attributionControl.setAttribution(mapMode.c);
  }

  calcPinFontSize(label) {
    let tsize = "16";
    if (label.length > 3) { tsize = "12"; }
    if (label.length >= 5) { tsize = "10"; }
    return tsize;
  }

  customPin(label = 'I', color = 'green', baseColor = 'black', flip = false) {
    label = label.trim();
    let textY = 16;
    let trY = 0;
    let scaleY = 1;
    const iconAnchor = [16, 48];
    if (flip) {
      trY = -48;
      scaleY = -1;
      textY = 32;
      iconAnchor[1] = 0;
    }
    const tsize = this.calcPinFontSize(label);
    const svg = `
      <svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
        <g transform="scale(1,${scaleY}) translate(0,${trY})">
          <!-- Kolmion muotoinen jalka -->
          <path d="M 3 16 L 16 48 L 29 16 Z" fill="${baseColor}" />
          <!-- Eri värinen valinta-alue -->
          <path id="pin-foot" d="M 4 15 L 16 47 L 28 15 Z" fill="red" style="visibility:hidden;" />
          <!-- Iso musta ympyrä -->
          <circle cx="16" cy="16" r="16" fill="${baseColor}" />
          <!-- Sisempi värillinen ympyrä -->
          <circle cx="16" cy="16" r="14" fill="${color}" />
        </g>
        <!-- Valkoinen teksti keskellä -->
        <text x="16" y="${textY}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${tsize}" fill="white" dominant-baseline="middle">
          ${label}
        </text>
      </svg>
    `;

    return this.L.divIcon({
      className: '',
      html: svg,
      iconSize: [32, 48],
      iconAnchor: iconAnchor, // kärki osoittaa koordinaattiin
      popupAnchor: [0, -48]
    });
  }  // customPin ends

  selectPin(pin, selected) {
    const element = pin.getElement();
    if (!element) {
      return;
    }
    const svg = element.querySelector('svg');
    const foot = svg.querySelector('#pin-foot');
    if (foot) {
      foot.style.visibility = selected ? 'visible' : 'hidden';
    }
  }

  createPin(coord, label, color, click, text = null, flip = false) {
    const pin = this.L.marker(coord, {icon: this.customPin(label, color, 'black', flip)});
    pin.addTo(this.map);
    if (text) {
      pin.bindPopup(text);
    }
    pin.on('click', function() {
      click(pin);
    });
    return pin;
  }

  removePin(pin) {
    this.map.removeLayer(pin);
    const index = this.pins.indexOf(pin);
    if (index > -1) {
      this.pins.splice(index, 1);
    }
  }


  setPinLocation(pin, coord) {
    if (!pin || !pin.setLatLng) {
      return;
    }
    pin.setLatLng(coord);
  }


  getPinLocation(pin=null) {
    if (!pin || !pin.getLatLng) {
      const center = this.map.getCenter();
      return [center.lat, center.lng];
    }
    const latLng = pin.getLatLng();
    return [latLng.lat, latLng.lng];
  }

  setPinLabel(pin, label) {
    const element = pin.getElement();
    if (!element) {
      return;
    }
    const svg = element.querySelector('svg');
    if (!svg) {
      return;
    }
    const textElement = svg.querySelector('text');
    if (!textElement) {
      return;
    }
    const s = label.trim();
    textElement.textContent = s;
    const fontSize = this.calcPinFontSize(s);
    textElement.setAttribute('font-size', fontSize);
  }

  getPinLabel(pin) {
    const element = pin.getElement();
    if (!element) {
      return '';
    }
    const svg = element.querySelector('svg');
    if (!svg) {
      return '';
    }
    const textElement = svg.querySelector('text');
    if (!textElement) {
      return '';
    }
    return textElement.textContent.trim();
  }

  setPinDragging(pin, enable) {
    if (enable) {
      pin.dragging.enable();
    } else {
      pin.dragging.disable();
    }
  }

  on(event, callback) {
    this.map.on(event, callback);
  }

  setPinOn(pin, eventName, callback, remove = false) {
    if (remove) {
      pin.off(eventName, callback);
      return;
    }
    pin.on(eventName, callback);
  }

  findPin(name) {
    name = name.trim().toUpperCase();
    /*
    let pin = null;
    this.map.eachLayer(function(layer) {
      if (!pin)
        if (layer instanceof this.L.Marker) {
          const label = this.getPinLabel(layer);
          if (label.trim().toUpperCase() === name) {
            pin = layer;
          }
      }
      return pin;
    }.bind(this));
     */
    // noinspection JSUnresolvedReference
    const layers = this.map._layers;
    for (const key in layers) {
      const layer = layers[key];
      if (layer instanceof this.L.Marker) {
        const label = this.getPinLabel(layer);
        if (label.trim().toUpperCase() === name) {
          return layer;
        }
      }
    }
    return null;
  }


  addLines(lines, from, to, options = {}, text = null, draw = true) {
    if (!lines) {
      lines = [];
    }
    const lineOptions = {
      color: options.color || 'blue',
      weight: options.weight || 2,
      opacity: options.opacity || 0.6
    };
    let line;
    // if (!line) {
      line = this.L.polyline([from, to], lineOptions);
      line.from = from;
      line.to = to;
      if (draw) this.map.addLayer(line);
    // } else {
    //  line.setLatLngs([from, to]);
    //  if (options) line.setStyle(lineOptions);
    // }
    line.setText("", {});
    if (text) {
      let flip = 'normal';
      let offset = -3;
      if (to[1] < from[1]) {
         flip = 'flip';
         offset = 12;
      }
      const opts = {repeat: false, center: true, offset: offset}
      if (flip === 'flip') opts.orientation = 'flip';
      line.setText(text, opts);
    }
    lines.push(line);
    return lines;
  }

  removeLines(lines, idx1 = 0, idx2 = 10000000) {
    if (!lines || lines.length === 0) return;
    if (idx1 >= lines.length) return;
    if (idx1 < 0) idx1 = lines.length + idx1;
    if (idx2 < 0) idx2 = lines.length + idx2;
    if (idx1 >= lines.length) return;
    if (idx2 < 0) return;
    if (idx1 < 0) idx1 = 0;
    if (idx2 >= lines.length) idx2 = lines.length - 1;
    for (let i = idx1; i <= idx2; i++) {
      this.map.removeLayer(lines[i]);
    }
    lines.splice(idx1, idx2 - idx1 + 1); // poista vastaavat taulukosta
  }

  getCoordXY(coord) {
    if (Array.isArray(coord)) {
      coord = this.L.latLng(coord[0], coord[1]);
    }
    const point = this.map.latLngToContainerPoint(coord);
    return [point.x, point.y];
  }

  getXYCoord(xy) {
    if (Array.isArray(xy)) {
      xy = this.L.point(xy[0], xy[1]);
    }
    const coord = this.map.containerPointToLatLng(xy);
    return [coord.lat, coord.lng];
  }

  createPolyline(options = {}) {
    const lineOptions = {
      color: options.color || 'blue',
      weight: options.weight || 2,
      opacity: options.opacity || 0.6
    };
    const polyline = {
      points: [],
      line: null,
    }
    polyline.line = this.L.polyline(polyline.points, lineOptions);
    return polyline;
  }

  addPolylinePoint(polyline, point, draw = true) {
    if (!polyline || !polyline.line || !polyline.points) {
      return;
    }
    polyline.points.push(point);
    polyline.line.setLatLngs(polyline.points);
    if (draw && !this.map.hasLayer(polyline.line)) {
      this.map.addLayer(polyline.line);
    }
  }
 }
 // MapWrapper ends




function loadRoutingMachine(callback) {
  // Load CSS
  function loadCSS() {
    return new Promise(resolve => {
      if (document.getElementById('leaflet-routing-css')) return resolve();
      const link = document.createElement('link');
      link.id = 'leaflet-routing-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet-routing-machine/dist/leaflet-routing-machine.css';
      link.onload = resolve;
      link.onerror = resolve; // resolve anyway
      document.head.appendChild(link);
    });
  }

  function createScript(src, resolve) {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
  }

    // Load JS
  function loadJS() {
    return new Promise(resolve => {
      if (window.L && window.L["Routing"]) return resolve();
      createScript('https://unpkg.com/leaflet-routing-machine/dist/leaflet-routing-machine.js', resolve);
    });
  }

  function loadPolylineJS() {
    return new Promise(resolve => {
      if (typeof polyline !== 'undefined') return resolve();
      createScript('js/polyline.js', resolve);
    });
  }

  function loadCorsLiteJS() {
    return new Promise(resolve => {
      if (typeof corslite !== 'undefined') return resolve();
      createScript('js/corslite.js', resolve);
    });
  }

  function loadGraphHopperJS() {
    return new Promise(resolve => {
      if (window.L && window.L["Routing"] && window.L["Routing"]["graphHopper"]) return resolve();
      createScript('js/lrm-graphhopper.js', resolve);
    });
  }

  // Load routersLeaflet.js
  function loadRouter() {
    return new Promise(resolve => {
      if (typeof findRouteOSRM !== "undefined") return resolve();
      createScript('routersLeaflet.js?v=' + Date.now(), resolve);
    });
  }

  /* Tämä ei toimi:
  // Load osrm-text-instructions from CDN
  function loadOsrmTextInstructions() {
    return new Promise(resolve => {
      if (window.osrmTextInstructions) return resolve();
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/osrm-text-instructions@latest/dist/osrm-text-instructions.js';
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }
  */

  Promise.all([loadCSS(), loadJS(), loadPolylineJS(), loadCorsLiteJS(), loadRouter() /*, loadOsrmTextInstructions()*/]).then(() => {
      loadGraphHopperJS().then(() => {
        if (callback) callback();
      });
  });
}

function removeOldRoutingControl(message=null) {
  const routeAltsDiv = document.getElementById('routeAlts');
  routeAltsDiv.innerHTML = message;
  if (mapWrapper.routingControl == null) return;
  mapWrapper.map.removeControl(mapWrapper.routingControl);
  mapWrapper.routingControl = null;
}
