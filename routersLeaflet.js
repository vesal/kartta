/*
Näiden reitityspalveluiden käyttö edellyttää, että olet ladannut Leaflet Routing Machine -kirjaston
ja että on olemassa globaali muuttuja mapWrapper, jossa on kartta ja L.Routing.
 */

function processRouteData(text, waypoints) {
  const data = JSON.parse(text);
  if (!data.routes || data.routes.length === 0) {
    return [];
  }

  const routeCount = data.routes.length;
  let routeIndex = 1;
  const routeObjs = [];
  for (const route of data.routes) {
    if (route.sections) {
      let allCoords = [];
      let allInstructions = [];
      let totalDistance = 0;
      let totalTime = 0;
      let coordOffset = 0;
      for (let si = 0; si < route.sections.length; si++) {
        const section = route.sections[si];
        const routeObj = processSection(section, waypoints, {legIndex: si, legCount: route.sections.length});
        if (routeObj) {
          // Adjust instruction offsets
          for (let instr of routeObj.instructions) {
            if (typeof instr.index === "number") {
              instr.index += coordOffset;
            }
          }
          if (si < route.sections.length - 1) {
            // Change last instruction to "WaypointReached" if not the final section
            let instr = routeObj.instructions[routeObj.instructions.length - 1];
            instr.type = "WaypointReached";
          }
          coordOffset += routeObj.coordinates.length;  // last point dublicated
          allCoords = allCoords.concat(routeObj.coordinates);
          allInstructions = allInstructions.concat(routeObj.instructions);
          totalDistance += routeObj.summary.totalDistance;
          totalTime += routeObj.summary.totalTime;

          // routeObj.name = `Reitti ${routeIndex}/${routeCount}`; // = ${(routeObj.summary.totalDistance / 1000).toFixed(1)} km`;
          // routeObjs.push(routeObj);
          // routeIndex++;
        }
      }
      if (allCoords.length > 0) {
        routeObjs.push({
          coordinates: allCoords,
          name: `Reitti ${routeIndex}/${routeCount}`,
          instructions: allInstructions,
          summary: {
            totalDistance: totalDistance,
            totalTime: totalTime
          },
          inputWaypoints: waypoints,
          properties: {isSimplified: false}
        });
        routeIndex++;
      }
    }
  }

  return routeObjs;
}

function processSection(section, waypoints, index) {
  if (!section.polyline || !section.turnByTurnActions) {
    return null;
  }
  const polylineStr = section.polyline;
  const decoded = decodeFlexPolyline(polylineStr);
  const actions = section.turnByTurnActions;

  let totalDistance = 0;
  let totalTime = 0;

  const instructions = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    totalDistance += a.length;  // lisää segmentin pituus kokonaismatkaan
    totalTime += a.duration;    // lisää segmentin kesto kokonaisaikaan
    // Haetaan suomenkielinen tien nimi
    let roadName = "";
    if (a.nextRoad && a.nextRoad.name) {
      const fiName = a.nextRoad.name.find(n => n.language === "fi");
      roadName = fiName ? fiName.value : a.nextRoad.name[0].value;
    }

    // Määritellään tyyppi LRM:lle
    let type = a.action;  // "turn", "depart", "arrive"
    let direction = a.direction || null;
    let exit = a.exit || 1; // vain roundaboutissa
    if (type === "turn") {
      if (direction === "left" || direction === "slight left" || direction === "sharp left") {
        direction = "vasemmalle";
      } else if (direction === "right" || direction === "slight right" || direction === "sharp right") {
        // direction = "oikealle";
        direction = "oikeelle"
      } else if (direction === "straight") {
        direction = "suoraan";
      } else {
        direction = ""; // muut
      }
    } else {
      direction = ""; // muille tyypeille ei suuntaa
    }
    let text;
    let modifier = null;
    let mode = "driving";
    let distance = a.length;

    const m = {};
    const step = {maneuver: m};
    step.name = roadName;
    m.type = a.action;
    m.mode = mode;
    m.modifier = a.direction;

    switch (type) {
      case "turn":
        // text = `Käänny ${direction} tielle ${roadName}`;
        modifier = a.direction;
        if (a.direction === "left" || a.direction === "slight left" || a.direction === "sharp left") {
          type = "Left"; // LRM tyyppi
          modifier = "Left"
        } else {
          type = "Right"; // LRM tyyppi
          modifier = "Right"
        }
        break;
      case "depart":
        type = "Head"; // LRM tyyppi
        mode = "driving"
        break;
      case "arrive":
        type = "DestinationReached"
        break;
      case "roundaboutEnter":
        if (i < actions.length - 1 && actions[i + 1].action === "roundaboutExit") {
          const nexta = actions[i + 1];
          exit = nexta.exit || 1;
        }
        type = "Roundabout";
        m.type = "roundabout";
        distance = 0;
        modifier = "SlightRight"; // aina oikea
        break;
      case "roundaboutExit":
        type = "SlightRight";
        m.type = "exit roundabout";
        modifier = "SlightRight"; // aina oikea
        let exitTo = "";
        if (roadName !== "") exitTo = " tielle " + roadName;
        text = `Poistu liittymästä ${exit},${exitTo}`;
        break;
      case "merge":
        type = "Merge";
        break;
      case "continue":
        type = "Continue";
        break;
      case "enterHighway":
        type = "Motorway";
        text = `Liity moottoritielle ${roadName}`;
        m.type = "merge"
        break;
      case "keep":
        type = "Continue";
        m.type = "continue";
        modifier = a.direction;
        if (a.direction === "right") {
          text = `Ryhmity oikealle tielle ${roadName}`;
        } else if (a.direction === "left") {
          text = `Ryhmity vasemmalle tielle ${roadName}`;
        } else {
          text = `Pysy tiellä ${roadName}`;
        }
        break;
      case "exit":
        type = "Exit";
        modifier = "SlightRight"; // aina oikea
        text = `Poistu tieltä ${roadName} kohti ${a.signpost?.labels?.[0]?.routeNumber?.value ?? "oikea"}`;
        step.name = `${a.signpost?.labels?.[0]?.routeNumber?.value ?? "oikea"}`;
        break;
      default:
        text = a.action; // fallback
    }
    m.exit = exit;
    text = routeStepToText(step, index); // käytä OSRM-tyyliä
    instructions.push(
      {
        text: text,
        distance: distance,
        // time: a.duration,
        index: a.offset,
        type: type,
        modifier: modifier,
        // mode: mode,
      });
  }
  const routeObj = {
    coordinates: decoded,
    name: "Reitti",
    instructions: instructions, // Voit halutessasi lisätä reittiohjeet
    summary: {
      totalDistance: totalDistance, // halutessasi voit laskea todellisen etäisyyden
      totalTime: totalTime      // tai arvioida ajassa
    },
    inputWaypoints: waypoints,
    properties: {isSimplified: false}
  };
  return routeObj;
}


// Custom HERE-router
let HereRouter = null;

function createHereRouter() {
  if (HereRouter) return HereRouter;
  // noinspection JSUnresolvedReference,TypeScriptUMDGlobal
  const hereRouter = L.Routing.OSRMv1.extend({
    options: {
      serviceUrl: 'https://router.hereapi.com/v8/routes',
      // apiKey: apikey // <-- korvaa omalla avaimellasi
    },
    route: function (waypoints, callback, context, opts) {
      if (this.options.useSample) {
        // Paikallinen JSON (cache)
        const routeObjs = processRouteData(sampleRouteData, waypoints);
        setTimeout(() => {
          callback.call(context, null, routeObjs);
        }, 0);
      } else {  // hae oikeasti netistä
        let transportMode = "car";
        if (options.routeMode === "walk") transportMode = "pedestrian";
        if (options.routeMode === "bike") transportMode = "bicycle";
        const coords = waypoints.map(wp => `${wp.latLng.lat},${wp.latLng.lng}`);
        let hereUrl = `${this.options.serviceUrl}?transportMode=${transportMode}&origin=${coords[0]}&destination=${coords[coords.length - 1]}&apiKey=${this.options.apiKey}&return=polyline,turnbyturnactions&alternatives=5`;
        for (let i = 1; i < coords.length - 1; i++) {
          hereUrl += `&via=${coords[i]}`;
        }

        // console.log("HERE URL:", hereUrl);

        // Käytä PHP-proxya
        const proxyUrl = "https://www.mit.jyu.fi/demowww/cyclo/index.php?getredirect=" + encodeURIComponent(hereUrl);

        // Hae HERE API:sta
        fetch(proxyUrl)
          .then(res => res.text())
          .then(text => {
            const routeObjs = processRouteData(text, waypoints);
            callback.call(context, null, routeObjs);
          })
          .catch(err => {
            console.error("Routing fetch error:", err);
            callback.call(context, err, []);
          });
      }
    }
  });
  HereRouter = hereRouter;
  return hereRouter;
} // createHereRouter


function findRouteHERE(from, to, apiKey, callback, useSample = false) {
  // Poista vanha reitti, jos se on olemassa
  createHereRouter();
  removeOldRoutingControl();

  const router = new HereRouter({apiKey: apiKey, useSample: useSample});

  // Luo ja lisää uusi reitti kartalle
  mapWrapper.routingControl = mapWrapper.L.Routing.control({
    waypoints: [
      mapWrapper.L.latLng(from[0], from[1]),
      mapWrapper.L.latLng(to[0], to[1])
    ],
    router: router,
    container: document.getElementById('itineraryDiv'),
    routeWhileDragging: false,
    showAlternatives: true,
    lineOptions: {
      styles: [{color: 'orange', opacity: 1, weight: 5}] // <- vaihda väri
    },
    altLineOptions: {
      styles: [{color: 'gray', opacity: 0.5, weight: 5}]
    }
  }).addTo(mapWrapper.map);
  mapWrapper.routingControl.on('routesfound', function (e) {
    mapWrapper.routingControl.currentRoutes = e.routes; // talletetaan kaikki reitit
    if (callback) {
      setTimeout(() => {
        callback(mapWrapper.routingControl)
      }, 0);
    }
  });
  mapWrapper.routingControl.on('waypointschanged', function(e) {
  // This will recalculate the route with the new waypoints
    // mapWrapper.routingControl._route();
  });
  return mapWrapper.routingControl;
}


const stepToTextFunctions = {
  "suomi": routeStepToTextSuomi,
  "savo": routeStepToTextSavo
}

function routeStepToTextSuomi(step, index) {
  const m = step.maneuver;
  let dirtext = "";
  if (m.bearing_after) dirtext = ` kohti ${Math.ceil(m.bearing_after/10)*10}, astetta`;
  let suunta = "";
  switch (m.modifier) {
    case "left":
      suunta = "vasemmalle";
      break;
    case "right":
      suunta = "oikealle";
      break;
    case "straight":
      suunta = "suoraan";
      break;
    case "slight right":
      suunta = "loivasti oikealle";
      break;
    case "slight left":
      suunta = "loivasti vasemmalle";
      break;
    case "uturn":
      suunta = "tee U-käännös";
      break;
  }
  switch (m.type) {
    case "depart":
      return `Aja tielle ${step.name}${dirtext}`;
    case "turn":
      return `Käänny ${suunta} tielle ${step.name}`;
    case "roundabout":
      return `Aja liikenneympyrään ja posti liittymästä ${m.exit}`;
    case "exit roundabout":
      return `Poistu liittymästä ${m.exit}, suuntaan ${step.name}`;
    case "roundabout turn":
      return `Tee jotakin ympyrässä`;
    case "merge":
      return `Liity tielle ${step.name}`;
    case "off ramp":
      return `Postu tieltä ${step.name}`;
    case "new name":
      return `Aja ${suunta} tielle ${step.name}`;
    case "end of road":
      return `Käänny ${suunta} tielle ${step.name}`;
    case "continue":
      return `Jatka samaan suuntaan ${suunta} tielle ${step.name}`;
    case "exit rotary":
      return `Postu ${suunta}, suuntaan ${step.name}`;
    case "exit":
      return `Postu ${suunta}, suuntaan ${step.name}`;
    case "arrive":
      if ((index?.legIndex ?? 0) < (index?.legCount ?? 0) - 1) return "Olet välipisteessä!";
      return "Olet perillä!";
    case "thenDrive":
      return ", sitten aja ";
    case "exampleVoice":
      return "Nyt puhutaan suomea nopeudella ";
  }
  return `No höh! ${m.type} ${suunta} ${step.name}`; // fallback if not found
}

function rnd(words) {
  const arr = words.split("|");
  return arr[Math.floor(Math.random() * arr.length)];
}

function routeStepToTextSavo(step, index) {
  const m = step.maneuver;
  let suunta = "";
  let dirtext = "";
  if (m.bearing_after) dirtext = ` suuntoo ${Math.ceil(m.bearing_after/10)*10}, astetta`;

  switch (m.modifier) {
    case "left":
      suunta = "vasemmalle";
      break;
    case "right":
      suunta = "ooekkeeelle";
      break;
    case "straight":
      suunta = "suoroo";
      break;
    case "slight right":
      suunta = "hitusen oekeelle";
      break;
    case "slight left":
      suunta = "ätväse vasemmalle";
      break;
    case "uturn":
      suunta = "tiehhä U-kiännös";
      break;
  }
  switch (m.type) {
    case "depart":
      return `${rnd("Pörräätä|Lähehä")} tiellee ${step.name}${dirtext}`;
    case "turn":
      return `${rnd("Kiänny|Kurvooo|Vänkee")} ${suunta} tielle ${step.name}`;
    case "roundabout":
      return `${rnd("Määhä|Tungeha")} ympyrrään ja ${rnd("luikaha|puthaka|kurvoo")} pihalle kolosta ${m.exit}`;
    case "exit roundabout":
      return `${rnd("Tempasehha|Kurvoo|Putkaha|Luikaha|Vänkeehhä")} pihalle paekasta ${m.exit}, suuntoo ${step.name}`;
    case "roundabout turn":
      return `Tiehhä jottaen ympyrässä`;
    case "merge":
      return `Änkee tielle ${step.name}`;
    case "off ramp":
      return `Kurvoo poes tieltä ${step.name}`;
    case "new name":
      return `Tuuppoo ${suunta} tielle ${step.name}`;
    case "end of road":
      return `${rnd("Viennä|Kiennä")} ${suunta} tielle ${step.name}`;
    case "continue":
      return `Hurrautahhan sammaan suuntaa ${suunta} tielle ${step.name}`;
    case "exit rotary":
      return `Tempasehha syrjää ${suunta}, suuntoo ${step.name}`;
    case "exit":
      return `Tempasehha syrjää ${suunta}, suuntoo ${step.name}`;
    case "arrive":
      if ((index?.legIndex ?? 0) < (index?.legCount ?? 0) - 1) return  "Oot välpistees!";
      return "Kahh siinähä oot!";
    case "thenDrive":
      return `, ${rnd("sitte|koht sillee")} ${rnd("pörräätät|tuuppoot|hurrautat")} `;
    case "exampleVoice":
      return "Nyt huastetaan savvoo noppeuvella ";
  }
  return `No höh! ${m.type} ${suunta} ${step.name}`; // fallback if not found
}

const textsForNumbersSuomi = {
  ones: ["nolla", "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "seitsemän", "kahdeksan", "yhdeksän",
    "kymmenen", "yksitoista", "kaksitoista", "kolmetoista", "neljätoista", "viisitoista", "kuusitoista", "seitsemäntoista", "kahdeksantoista", "yhdeksäntoista"],
  tens: ["", "", "kaksikymmentä", "kolmekymmentä", "neljäkymmentä", "viisikymmentä", "kuusikymmentä", "seitsemänkymmentä", "kahdeksankymmentä", "yhdeksänkymmentä"],
  hundreds: ["", "sata", "sataa"],
  thousands: ["", "tuhat", "tuhatta"],
  km: ["", "kilometri", "kilometriä"],
  m: ["", "metri", "metriä"],
}

const textsForNumbersSavo = {
  ones: ["nolla", "yks", "kaks", "kolome", "nelejä", "viis", "kuus", "seihtemän", "kaheksan", "yheksän",
    "kymmene", "ykstoesta", "kakstoesta", "kolmetoesta", "neljätoesta", "viistoesta", "kuusitoesta", "seihtemäntoesta", "kaheksantoesta", "yheksäntoesta"],
  tens: ["", "", "kakskymment", "kolmekymment", "neljäkymment", "viiskymment", "kuuskymment", "seihtemänkymment", "kaheksankymment", "yheksänkymment"],
  hundreds: ["", "sata", "sattoo"],
  thousands: ["", "tuhat", "tuhattoo"],
  km: ["", "kilomeetri", "kilomeetrii"],
  m: ["", "metri", "metrii"],
}

const textsForNumbers = {
  suomi: textsForNumbersSuomi,
  savo: textsForNumbersSavo
}

function numberToText(num, order) {
  try {
    return textsForNumbers[options.dialect][order][num];
  } catch (e) {
    return num.toString();
  }
}

function routeStepToText(step, index= -1) {
  return stepToTextFunctions[options.dialect](step, index);
}


function findRouteOSRM(from, to, callback) {

  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  // Lokaalia ORSM palvelinta varten asenna:
  // ks: https://github.com/project-osrm/osrm-backend/pkgs/container/osrm-backend#using-docker
  //  docker pull ghcr.io/project-osrm/osrm-backend:v6.0.0
  //  Hae finland-latest.osm.pbf
  //  docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/finland-latest.osm.pbf || echo "osrm-extract failed"
  //  docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/finland-latest.osrm || echo "osrm-partition failed"
  //  docker run -t -i -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/finland-latest.osrm
  const osrmServer = isLocalhost
    ? "http://localhost:5000"
    : "https://router.project-osrm.org";


  removeOldRoutingControl();

  if (!mapWrapper.L.Routing) {
    // fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`)
    fetch(`${osrmServer}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`)
      .then(res => res.json())
      .then(data => {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        mapWrapper.L.polyline(coords, {color: 'blue'}).addTo(mapWrapper.map);
      });
    return;
  }

  mapWrapper.routingControl = mapWrapper.L.Routing.control({
    // language: 'fi',  // ei toimi
    waypoints: [
      mapWrapper.L.latLng(from[0], from[1]),
      mapWrapper.L.latLng(to[0], to[1])
    ],
    router: new mapWrapper.L.Routing.OSRMv1({
      stepToText: routeStepToText,
      serviceUrl: osrmServer + '/route/v1',
    }),
    container: document.getElementById('itineraryDiv'),
    routeWhileDragging: true,
    showAlternatives: true,
    lineOptions: {
      styles: [{color: 'blue', opacity: 0.8, weight: 6}]
    },
    altLineOptions: {
      styles: [{color: 'gray', opacity: 0.5, weight: 5}]
    }
  });

  mapWrapper.routingControl.addTo(mapWrapper.map);

  mapWrapper.routingControl.on('routesfound', function (e) {
    mapWrapper.routingControl.currentRoutes = e.routes; // talletetaan kaikki reitit
    if (callback) {
      setTimeout(() => {
        callback(mapWrapper.routingControl)
      }, 0);
    }
  });
  return mapWrapper.routingControl;
}

function findRouteGraphHopper(from, to, apiKey, callback) {
  removeOldRoutingControl();
  let vechile = "car"
  if (options.routeMode === "walk") vechile = "foot";
  if (options.routeMode === "bike") vechile = "bike";

  mapWrapper.routingControl = mapWrapper. L.Routing.control({
    waypoints: [
      mapWrapper.L.latLng(from[0], from[1]),
      mapWrapper.L.latLng(to[0], to[1])
    ],
    router: mapWrapper.L.Routing.graphHopper(apiKey, {
      urlParameters: {
        vehicle: vechile,   // 'foot', 'bike', tai 'car'
        locale: 'fi',       // Ohjeiden kieli
      },
    }),
    // not possible to use own stepToText function here :-(
    lineOptions: { // free version has only one route :-(
      styles: [{ color: 'blue', opacity: 0.7, weight: 5 }]
    },
    showAlternatives: true,
    routeWhileDragging: true
  });

  mapWrapper.routingControl.addTo(mapWrapper.map);

  mapWrapper.routingControl.on('routesfound', function (e) {
    mapWrapper.routingControl.currentRoutes = e.routes; // talletetaan kaikki reitit
    if (callback) {
      setTimeout(() => {
        callback(mapWrapper.routingControl)
      }, 0);
    }
  });
  return mapWrapper.routingControl;

}

// Esimerkkidata, jos et halua oikeasti hakea netistä kopioitu HEREn vastauksesta
// const sampleRouteData = `{"routes":[{"id":"c1aaeeb8-dba8-4dc1-bac4-09510fdf0613","sections":[{"id":"89ffd010-a160-4c14-8996-75a369680d9b","type":"vehicle","turnByTurnActions":[{"action":"depart","duration":25,"length":170,"offset":0,"nextRoad":{"name":[{"value":"Tontuntie","language":"fi"}]}},{"action":"turn","duration":55,"length":244,"offset":1,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Tontuntie","language":"fi"}]},"nextRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"turnAngle":90.4643707},{"action":"turn","duration":35,"length":389,"offset":7,"direction":"left","severity":"quite","currentRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"nextRoad":{"name":[{"value":"Matinmäentie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":-97.47258},{"action":"turn","duration":71,"length":774,"offset":19,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Matinmäentie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"nextRoad":{"name":[{"value":"Palokanorsi","language":"fi"}],"number":[{"value":"16685","language":"fi","routeType":6}]},"turnAngle":84.2601929},{"action":"roundaboutEnter","duration":4,"length":37,"offset":29,"direction":"right","currentRoad":{"name":[{"value":"Palokanorsi","language":"fi"}]},"turnAngle":37.3803978},{"action":"roundaboutExit","duration":41,"length":197,"offset":34,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Palokanorsi","language":"fi"}],"number":[{"value":"16685","language":"fi","routeType":6}]},"roundaboutAngle":175.0},{"action":"roundaboutEnter","duration":2,"length":11,"offset":42,"direction":"right","currentRoad":{"name":[{"value":"Palokanorsi","language":"fi"}],"toward":[{"value":"Jyväskylä","language":"fi"}]},"signpost":{"labels":[{"name":{"value":"Jyväskylä","language":"fi"}},{"routeNumber":{"value":"4","language":"fi"}},{"routeNumber":{"value":"13","language":"fi"}},{"routeNumber":{"value":"E75","language":"fi"}}]},"turnAngle":43.4844017},{"action":"roundaboutExit","duration":29,"length":286,"offset":43,"direction":"right","exit":1,"currentRoad":{"toward":[{"value":"Jyväskylä","language":"fi"}]},"nextRoad":{"type":"highway","name":[{"value":"Nelostie","language":"fi"}],"number":[{"value":"E75","language":"fi","routeType":1},{"value":"4","language":"fi","routeType":2},{"value":"13","language":"fi","routeType":2}]},"signpost":{"labels":[{"name":{"value":"Jyväskylä","language":"fi"}}]},"roundaboutAngle":80.0},{"action":"enterHighway","duration":204,"length":5241,"offset":63,"direction":"middle","currentRoad":{"type":"highway"},"nextRoad":{"type":"highway","name":[{"value":"Nelostie","language":"fi"}],"number":[{"value":"E75","language":"fi","routeType":1},{"value":"4","language":"fi","routeType":2},{"value":"13","language":"fi","routeType":2}]},"turnAngle":9.8007612},{"action":"keep","duration":33,"length":301,"offset":145,"direction":"right","currentRoad":{"name":[{"value":"Nelostie","language":"fi"}],"number":[{"value":"E75","language":"fi","routeType":1},{"value":"4","language":"fi","routeType":2},{"value":"13","language":"fi","routeType":2}],"toward":[{"value":"Vaajakoski","language":"fi"},{"value":"Tourula","language":"fi"},{"value":"Seppälä","language":"fi"}]},"nextRoad":{"name":[{"value":"Tourulantie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"signpost":{"labels":[{"name":{"value":"Vaajakoski","language":"fi"}},{"name":{"value":"Tourula","language":"fi"}},{"name":{"value":"Seppälä","language":"fi"}}]},"turnAngle":16.7577744},{"action":"turn","duration":97,"length":540,"offset":157,"direction":"left","severity":"quite","currentRoad":{"type":"highway"},"nextRoad":{"name":[{"value":"Tourulantie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"turnAngle":-112.4919052},{"action":"turn","duration":36,"length":206,"offset":166,"direction":"left","severity":"quite","currentRoad":{"name":[{"value":"Seppäläntie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"nextRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]},"turnAngle":-78.2324982},{"action":"arrive","duration":0,"length":0,"offset":174,"currentRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]}}],"departure":{"time":"2025-08-27T19:08:14+03:00","place":{"type":"place","location":{"lat":62.2997414,"lng":25.7322547},"originalLocation":{"lat":62.2997499,"lng":25.73228}}},"arrival":{"time":"2025-08-27T19:18:46+03:00","place":{"type":"place","location":{"lat":62.2557651,"lng":25.7773148},"originalLocation":{"lat":62.25577,"lng":25.77725}}},"polyline":"BG6lv62D-pyixBxtCi3DvlBjxD_OnpB7GjNzU_TjI_OjDjIjXw0BvCoGzjBosCrO4c3NwWrOoV_EoGrEAjXwWvbkcjDkDrEoL_EvRrJjhB_pF36QrE3NrO7uBrJriBnL_sBrErOrErTnBnQ8BvHUnGT7LjD_JvC3DnBnG_EzPzF_OjN_gCvC3NvHvqB7GzZnBnf4D_J4IvRoG_J0F7GwH7G8GrE4IjD4DT8GUoGkDgF0F4D8GgFwR8B8QAkInB4N7B0K_E0PnGwMrJ8L3S0U7pBkc3X0PzPgKvR8L_Y0PriBsYrY0P3pCgyBj5JgyGvb4Srd0UjhBoV3c0U_dkS3XwMvWsJnf0K7awH_2G84B_0C8VzoB0KrsBkNnLkDnuB0K_dsJvgBkIzPgFzyBsO7V4InagPrT4N_ToQna0ZzP8QvRwWr2B01C7kBsgCriBw-BnkB4kCze89BrdghCzUsxBrTw0BnQsxB3X01CjIkhBzFoV7GofjNslCzF8fnLkpCnG03B3IoiCvH8uBjSg1CzK4mBzFwRzF4SvMokBjS4rB7GoQ3SokBzek1BnQ0Znfw0B3N8a_JkX_O8kBjNgoBjNgyBrO8iCnVsmEnLslCzP8xCzZwrDnLwlBjI4XzKsY_JgU7LwW3IkN3I8LrJ0FnGgFnakXrT8LrJsE7L4D3I8B3IA3XjD7QvC3IU_OgFjI4DgFwR0U46B0PgoBwM8asvCk5E8GwMofk6BkmB0rC4DrJkIjNoGnGwHvC8GT8pB8QwM4DuX6H","transport":{"mode":"car"}}]}]}`;
// https://router.hereapi.com/v8/routes?transportMode=car&origin=62.29975,25.73228&destination=62.25577,25.77725&return=polyline,turnbyturnactions&apiKey=JDvhMntbmG4VpjrQEZnky6Vd1J-ugz3nrwQD-PUB2jY
const sampleRouteData = `{"notices":[{"title":"The provided parameter '' is unknown.","code":"unknownParameter","severity":"info"}],"routes":[{"id":"84ec3718-5a32-4ab5-b807-21b8bb13ae76","sections":[{"id":"23f1e4a6-10c4-43fb-8777-7e185e7c7bfb","type":"vehicle","turnByTurnActions":[{"action":"depart","duration":25,"length":170,"offset":0,"nextRoad":{"name":[{"value":"Tontuntie","language":"fi"}]}},{"action":"turn","duration":55,"length":244,"offset":1,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Tontuntie","language":"fi"}]},"nextRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"turnAngle":90.4643707},{"action":"turn","duration":33,"length":389,"offset":7,"direction":"left","severity":"quite","currentRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"nextRoad":{"name":[{"value":"Matinmäentie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":-97.47258},{"action":"turn","duration":71,"length":774,"offset":19,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Matinmäentie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"nextRoad":{"name":[{"value":"Palokanorsi","language":"fi"}],"number":[{"value":"16685","language":"fi","routeType":6}]},"turnAngle":84.2601929},{"action":"roundaboutEnter","duration":4,"length":37,"offset":29,"direction":"right","currentRoad":{"name":[{"value":"Palokanorsi","language":"fi"}]},"turnAngle":37.3803978},{"action":"roundaboutExit","duration":33,"length":197,"offset":34,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Palokanorsi","language":"fi"}],"number":[{"value":"16685","language":"fi","routeType":6}]},"roundaboutAngle":175.0},{"action":"roundaboutEnter","duration":2,"length":11,"offset":42,"direction":"right","currentRoad":{"name":[{"value":"Palokanorsi","language":"fi"}],"toward":[{"value":"Jyväskylä","language":"fi"}]},"signpost":{"labels":[{"name":{"value":"Jyväskylä","language":"fi"}},{"routeNumber":{"value":"4","language":"fi"}},{"routeNumber":{"value":"13","language":"fi"}},{"routeNumber":{"value":"E75","language":"fi"}}]},"turnAngle":43.4844017},{"action":"roundaboutExit","duration":29,"length":286,"offset":43,"direction":"right","exit":1,"currentRoad":{"toward":[{"value":"Jyväskylä","language":"fi"}]},"nextRoad":{"type":"highway","name":[{"value":"Nelostie","language":"fi"}],"number":[{"value":"E75","language":"fi","routeType":1},{"value":"4","language":"fi","routeType":2},{"value":"13","language":"fi","routeType":2}]},"signpost":{"labels":[{"name":{"value":"Jyväskylä","language":"fi"}}]},"roundaboutAngle":80.0},{"action":"enterHighway","duration":201,"length":5241,"offset":63,"direction":"middle","currentRoad":{"type":"highway"},"nextRoad":{"type":"highway","name":[{"value":"Nelostie","language":"fi"}],"number":[{"value":"E75","language":"fi","routeType":1},{"value":"4","language":"fi","routeType":2},{"value":"13","language":"fi","routeType":2}]},"turnAngle":9.8007612},{"action":"keep","duration":33,"length":301,"offset":145,"direction":"right","currentRoad":{"name":[{"value":"Nelostie","language":"fi"}],"number":[{"value":"E75","language":"fi","routeType":1},{"value":"4","language":"fi","routeType":2},{"value":"13","language":"fi","routeType":2}],"toward":[{"value":"Vaajakoski","language":"fi"},{"value":"Tourula","language":"fi"},{"value":"Seppälä","language":"fi"}]},"nextRoad":{"name":[{"value":"Tourulantie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"signpost":{"labels":[{"name":{"value":"Vaajakoski","language":"fi"}},{"name":{"value":"Tourula","language":"fi"}},{"name":{"value":"Seppälä","language":"fi"}}]},"turnAngle":16.7577744},{"action":"turn","duration":92,"length":540,"offset":157,"direction":"left","severity":"quite","currentRoad":{"type":"highway"},"nextRoad":{"name":[{"value":"Tourulantie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"turnAngle":-112.4919052},{"action":"turn","duration":36,"length":206,"offset":166,"direction":"left","severity":"quite","currentRoad":{"name":[{"value":"Seppäläntie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"nextRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]},"turnAngle":-78.2324982},{"action":"arrive","duration":0,"length":0,"offset":174,"currentRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]}}],"departure":{"time":"2025-08-27T18:30:23+03:00","place":{"type":"place","location":{"lat":62.2997414,"lng":25.7322547},"originalLocation":{"lat":62.2997499,"lng":25.73228}}},"arrival":{"time":"2025-08-27T18:40:37+03:00","place":{"type":"place","location":{"lat":62.2557651,"lng":25.7773148},"originalLocation":{"lat":62.25577,"lng":25.77725}}},"polyline":"BG6lv62D-pyixBxtCi3DvlBjxD_OnpB7GjNzU_TjI_OjDjIjXw0BvCoGzjBosCrO4c3NwWrOoV_EoGrEAjXwWvbkcjDkDrEoL_EvRrJjhB_pF36QrE3NrO7uBrJriBnL_sBrErOrErTnBnQ8BvHUnGT7LjD_JvC3DnBnG_EzPzF_OjN_gCvC3NvHvqB7GzZnBnf4D_J4IvRoG_J0F7GwH7G8GrE4IjD4DT8GUoGkDgF0F4D8GgFwR8B8QAkInB4N7B0K_E0PnGwMrJ8L3S0U7pBkc3X0PzPgKvR8L_Y0PriBsYrY0P3pCgyBj5JgyGvb4Srd0UjhBoV3c0U_dkS3XwMvWsJnf0K7awH_2G84B_0C8VzoB0KrsBkNnLkDnuB0K_dsJvgBkIzPgFzyBsO7V4InagPrT4N_ToQna0ZzP8QvRwWr2B01C7kBsgCriBw-BnkB4kCze89BrdghCzUsxBrTw0BnQsxB3X01CjIkhBzFoV7GofjNslCzF8fnLkpCnG03B3IoiCvH8uBjSg1CzK4mBzFwRzF4SvMokBjS4rB7GoQ3SokBzek1BnQ0Znfw0B3N8a_JkX_O8kBjNgoBjNgyBrO8iCnVsmEnLslCzP8xCzZwrDnLwlBjI4XzKsY_JgU7LwW3IkN3I8LrJ0FnGgFnakXrT8LrJsE7L4D3I8B3IA3XjD7QvC3IU_OgFjI4DgFwR0U46B0PgoBwM8asvCk5E8GwMofk6BkmB0rC4DrJkIjNoGnGwHvC8GT8pB8QwM4DuX6H","transport":{"mode":"car"}}]},{"id":"d0446495-4107-4e30-82bf-8a38391f945a","sections":[{"id":"de9ea0c9-69b4-4987-91ba-1efa74f27fb4","type":"vehicle","turnByTurnActions":[{"action":"depart","duration":25,"length":170,"offset":0,"nextRoad":{"name":[{"value":"Tontuntie","language":"fi"}]}},{"action":"turn","duration":55,"length":244,"offset":1,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Tontuntie","language":"fi"}]},"nextRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"turnAngle":90.4643707},{"action":"turn","duration":61,"length":693,"offset":7,"direction":"left","severity":"quite","currentRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"nextRoad":{"name":[{"value":"Matinmäentie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":-97.47258},{"action":"roundaboutEnter","duration":6,"length":31,"offset":24,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":69.5225677},{"action":"roundaboutExit","duration":31,"length":296,"offset":30,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":180.0},{"action":"roundaboutEnter","duration":5,"length":34,"offset":37,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":94.5225677},{"action":"roundaboutExit","duration":16,"length":100,"offset":43,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":185.0},{"action":"roundaboutEnter","duration":7,"length":36,"offset":48,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":89.2648926},{"action":"roundaboutExit","duration":15,"length":106,"offset":55,"direction":"right","exit":1,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":181.0},{"action":"roundaboutEnter","duration":5,"length":31,"offset":60,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":84.9922638},{"action":"roundaboutExit","duration":40,"length":457,"offset":65,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":192.0},{"action":"roundaboutEnter","duration":2,"length":19,"offset":80,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":16.623642},{"action":"roundaboutExit","duration":389,"length":4082,"offset":84,"direction":"right","exit":1,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":158.0},{"action":"turn","duration":27,"length":196,"offset":195,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Seppäläntie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"nextRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]},"turnAngle":96.8952332},{"action":"arrive","duration":0,"length":0,"offset":202,"currentRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]}}],"departure":{"time":"2025-08-27T18:30:23+03:00","place":{"type":"place","location":{"lat":62.2997414,"lng":25.7322547},"originalLocation":{"lat":62.2997499,"lng":25.73228}}},"arrival":{"time":"2025-08-27T18:41:47+03:00","place":{"type":"place","location":{"lat":62.2557651,"lng":25.7773148},"originalLocation":{"lat":62.25577,"lng":25.77725}}},"polyline":"BG6lv62D-pyixBxtCi3DvlBjxD_OnpB7GjNzU_TjI_OjDjIjXw0BvCoGzjBosCrO4c3NwWrOoV_EoGrEAjXwWvbkcjDkDrEoL_gC4kC3cgevW4XrYwb7LwMnBvC3DjD3DkDnBwCTsJUkD_OkN7uB41Bnf4mBrYwgB_EwHnLgUjIoQ7B_E7B7BvCTjDwC7BkIU4IzKoQjIwMjIkNvHsO3IsTvC_E7BnBvCT7BoB7BwC7B8GU4IrE0F7G4I3NwWrO8ajI4NvCzF7B7BjDTjDwCvC4I3N4cjIsO7BsJjhB03BrJ0PvbopB3NkS_O4SjhBkmBjNgPnagjBrEgF_E4DvCoB_EUvCnBjDoBvCkDnB4DnG8LvMwRjNgFzyB0e_J8GvW4S3IkIrJ4IrO8Q3IoLnVofjwB0rCnV4hB7L0UnVgoBvHsOzP4czP8fnLoajXs7B_EkNna8nCnL8f7GsTnG8Q7Vs7BvgBg6Cze4zC3NkmB3IwbnLopBjN08B3N0rC_J4wB_JwlBnGgUrEwMnGsOjIoQjIkN3I8L3Xkc7gDksDjXkXzKkIrJsErJwC_JoBnLTvqBjI7LTzKwC_JgFrJwH3IgKrJ4NvH4NzKsdvWo7CnLwlB_EkN7GoQjD0FnLsT_OoV7QsT_JsJ3S4SzKgF3X8Vn4Bg8BnQoQ_YwW3IkIzjB4hBvW4SzKoLzFsE3IwHnVwWzU4SrEsJjX8Q7QsJ_J4D3D8BrOkDvMUvMTvHnB7L7BjNjD3czK_JrE_JrEz8Bjc7LzFvwDnuBjmB7QnL_E7LzFnL7G3I7G3SjSnL3N3NrT7L_T7Q7f7B_J_EnLnV7uBkIjNoGnGwHvC8GT8pB8QwM4DuX6H","transport":{"mode":"car"}}]},{"id":"7f14b7bc-5411-4804-a020-963560df5e01","sections":[{"id":"5e30590c-b6a5-43e0-9b38-332d446bafff","type":"vehicle","turnByTurnActions":[{"action":"depart","duration":25,"length":170,"offset":0,"nextRoad":{"name":[{"value":"Tontuntie","language":"fi"}]}},{"action":"turn","duration":55,"length":244,"offset":1,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Tontuntie","language":"fi"}]},"nextRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"turnAngle":90.4643707},{"action":"turn","duration":61,"length":693,"offset":7,"direction":"left","severity":"quite","currentRoad":{"name":[{"value":"Touruvuorentie","language":"fi"}]},"nextRoad":{"name":[{"value":"Matinmäentie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":-97.47258},{"action":"roundaboutEnter","duration":6,"length":31,"offset":24,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":69.5225677},{"action":"roundaboutExit","duration":31,"length":296,"offset":30,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":180.0},{"action":"roundaboutEnter","duration":5,"length":34,"offset":37,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":94.5225677},{"action":"roundaboutExit","duration":16,"length":100,"offset":43,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":185.0},{"action":"roundaboutEnter","duration":7,"length":36,"offset":48,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":89.2648926},{"action":"roundaboutExit","duration":15,"length":106,"offset":55,"direction":"right","exit":1,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":181.0},{"action":"roundaboutEnter","duration":5,"length":31,"offset":60,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":84.9922638},{"action":"roundaboutExit","duration":40,"length":457,"offset":65,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":192.0},{"action":"roundaboutEnter","duration":2,"length":19,"offset":80,"direction":"right","currentRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"turnAngle":16.623642},{"action":"roundaboutExit","duration":245,"length":2699,"offset":84,"direction":"right","exit":1,"nextRoad":{"name":[{"value":"Ritopohjantie","language":"fi"}],"number":[{"value":"16711","language":"fi","routeType":6}]},"roundaboutAngle":158.0},{"action":"turn","duration":62,"length":553,"offset":155,"direction":"right","severity":"quite","currentRoad":{"name":[{"value":"Seppäläntie","language":"fi"}],"number":[{"value":"46503","language":"fi","routeType":6}]},"nextRoad":{"name":[{"value":"Vasarakatu","language":"fi"}]},"turnAngle":73.8842468},{"action":"roundaboutEnter","duration":6,"length":40,"offset":175,"direction":"right","currentRoad":{"name":[{"value":"Vasarakatu","language":"fi"}]},"turnAngle":54.7153473},{"action":"roundaboutExit","duration":32,"length":233,"offset":181,"direction":"right","exit":2,"nextRoad":{"name":[{"value":"Vasarakatu","language":"fi"},{"value":"Seppälä","language":"fi"}]},"roundaboutAngle":204.0},{"action":"roundaboutEnter","duration":13,"length":82,"offset":186,"direction":"right","currentRoad":{"name":[{"value":"Vasarakatu","language":"fi"},{"value":"Seppälä","language":"fi"}]},"turnAngle":76.4728775},{"action":"roundaboutExit","duration":23,"length":160,"offset":196,"direction":"right","exit":3,"nextRoad":{"name":[{"value":"Alasinkatu","language":"fi"}]},"roundaboutAngle":296.0},{"action":"roundaboutEnter","duration":4,"length":14,"offset":199,"direction":"right","currentRoad":{"name":[{"value":"Alasinkatu","language":"fi"}]},"turnAngle":95.4348984},{"action":"roundaboutExit","duration":79,"length":473,"offset":202,"direction":"right","exit":1,"roundaboutAngle":77.0},{"action":"roundaboutEnter","duration":5,"length":19,"offset":231,"direction":"right","turnAngle":68.6128693},{"action":"roundaboutExit","duration":12,"length":76,"offset":234,"direction":"right","exit":1,"nextRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]},"roundaboutAngle":98.0},{"action":"arrive","duration":0,"length":0,"offset":236,"currentRoad":{"name":[{"value":"Ahjokatu","language":"fi"}]}}],"departure":{"time":"2025-08-27T18:30:23+03:00","place":{"type":"place","location":{"lat":62.2997414,"lng":25.7322547},"originalLocation":{"lat":62.2997499,"lng":25.73228}}},"arrival":{"time":"2025-08-27T18:42:52+03:00","place":{"type":"place","location":{"lat":62.2557651,"lng":25.7773148},"originalLocation":{"lat":62.25577,"lng":25.77725}}},"polyline":"BG6lv62D-pyixBxtCi3DvlBjxD_OnpB7GjNzU_TjI_OjDjIjXw0BvCoGzjBosCrO4c3NwWrOoV_EoGrEAjXwWvbkcjDkDrEoL_gC4kC3cgevW4XrYwb7LwMnBvC3DjD3DkDnBwCTsJUkD_OkN7uB41Bnf4mBrYwgB_EwHnLgUjIoQ7B_E7B7BvCTjDwC7BkIU4IzKoQjIwMjIkNvHsO3IsTvC_E7BnBvCT7BoB7BwC7B8GU4IrE0F7G4I3NwWrO8ajI4NvCzF7B7BjDTjDwCvC4I3N4cjIsO7BsJjhB03BrJ0PvbopB3NkS_O4SjhBkmBjNgPnagjBrEgF_E4DvCoB_EUvCnBjDoBvCkDnB4DnG8LvMwRjNgFzyB0e_J8GvW4S3IkIrJ4IrO8Q3IoLnVofjwB0rCnV4hB7L0UnVgoBvHsOzP4czP8fnLoajXs7B_EkNna8nCnL8f7GsTnG8Q7Vs7BvgBg6Cze4zC3NkmB3IwbnLopBjN08B3N0rC_J4wB_JwlBnGgUrEwMnGsOjIoQjIkN3I8L3Xkc7gDksDjXkXzKkIrJsErJwC_JoBnLTvqBjI7LTzKwC_JgFrJwH3IgKrJ4NvH4NzKsdvWo7CnLwlB_EkN7GoQjD0FnLsT_OoV7QsT_JsJ3S4SzKgF3X8Vn4Bg8B7GjDvRgKnLoBvHjD7LvH_JjX7GjNjN7V7GjIrE_JjDjI3pCvsFvCnGjDvHrE_Jjc74B7GzKzK_J3DvCvHzFnBrJjDnG7BnBvCnBrEwCjDwHrEnBjXjIrlC7fnazFzFnBT_JvCjIvCvC7GU3D0F7BkIUoLwCkIsE4DsEnB4DgUkNkuCkNkzCvCoB7BsET0FvCUzFoBjI3DzFvCjD7BrJzFrJ3DzKrE_J3D_JrErE7BjDnBjNvH_JrErJrEjIvC7GjDvHvC3IjD7GjDjDnB3IvC7GUrEwH7B8L_J8sCvCkNnG89BnB4I3DUjDgFnBoG3DnBtmB5M","transport":{"mode":"car"}}]}]}`;

// https://router.project-osrm.org/route/v1/driving/25.732646,62.299957250000006;25.777101516723633,62.255518627960456?overview=false&alternatives=true&steps=true&hints=;
// http://localhost:5000/route/v1/driving/25.732741652606464,62.29987315843354;25.776157379150394,62.256577461867785?overview=full&geometries=geojson
// https://router.project-osrm.org/route/v1/driving/25.732741652606464,62.29987315843354;25.77529907226563,62.25665737235106?overview=false&alternatives=true&steps=true&hints=;

//#region Routing UI
let voicesInitialized = false;

function speakText(text, cancel = true) {
  if (!('speechSynthesis' in window)) {
    setError("ei puhetta!")
    return;
  }
  if (!voicesInitialized) {
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      speechSynthesis.onvoiceschanged = () => {
        // console.log(speechSynthesis.getVoices());
        voicesInitialized = true;
        speakText(text, cancel); // Retry speaking after voices are loaded
      };
      return;
    }
  }
  voicesInitialized = true;
  if (cancel) window.speechSynthesis.cancel(); // Stop any ongoing speech
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fi-FI'; // Aseta haluttu kieli, esimerkiksi suomeksi
  utterance.rate = options.speechRate/100;
  window.speechSynthesis.speak(utterance);
}

function stepFromType(maneuverType) {
   return {maneuver: {type: maneuverType, modifier: ''}};
}

function exampleSpeech() {
  let exampleText = document.getElementById('exampleText').value;
  if (exampleText === '') exampleText = routeStepToText(stepFromType('exampleVoice'));
  speakText(exampleText + " " + numberToFinnishWords(options.speechRate));
}

function numberToFinnishWords(n) {
  if (n < 20) {
    return numberToText(n, "ones");
  }
  if (n < 100) {
    if (n % 10 === 0) return numberToText(Math.floor(n / 10), "tens");
    return numberToText(Math.floor(n / 10), "tens") + " " + numberToFinnishWords(n % 10);
  }
  if (n < 1000) {
    if (n === 100) return numberToText(1, "hundreds");
    if (n < 200) return numberToText(1, "hundreds") + " " + numberToFinnishWords(n % 100);
    if (n % 100 === 0) return numberToFinnishWords(Math.floor(n / 100)) + " " + numberToText(2, "hundreds")
    return numberToFinnishWords(Math.floor(n / 100)) + " " + numberToText(2, "hundreds") + " " + numberToFinnishWords(n % 100);
  }
  if (n < 10000) {
    if (n === 1000) return numberToText(1, "thousands");
    if (n % 1000 === 0) return numberToFinnishWords(Math.floor(n / 1000)) + " " + numberToText(2, "thousands");
    return numberToFinnishWords(Math.floor(n / 1000)) + " " + numberToText(2, "thousands") + " " + numberToFinnishWords(n % 1000);
  }
  return n.toString(); // fallback
}

function numberToFinnishDistance(n) {
  if (n === 0) return "";
  if (n >= 1000) {
    const km = Math.floor(n / 1000);
    const m = n % 1000;
    let result = (km === 1 ? numberToText(1, "km") : numberToFinnishWords(km) + " " + numberToText(2, "km"));
    if (m > 0) {
      result += " " + numberToFinnishWords(m) + " " + numberToText(2, "m");
    }
    return result;
  }
  return numberToFinnishWords(n) + " metriä";
}


function initRoutingEvents(routingControl) {
  const itineraryDiv = document.getElementById('itineraryDiv');
  const routingContainer = document.querySelector('.leaflet-routing-container');
  itineraryDiv.innerHTML = '';
  if (itineraryDiv && routingContainer) {
    itineraryDiv.appendChild(routingContainer);
  }
  const elements = document.querySelectorAll('.leaflet-routing-alt');

  // List all routes
  const routeAltsDiv = document.getElementById('routeAlts');
  routeAltsDiv.innerHTML = ''

  const routeSelectElements = [];

  function updateSelectedRoute(ri) {
    const elements = document.querySelectorAll('.route-alt');
    elements.forEach(e => e.classList.remove('route-alt-selected'));
    routeSelectElements[ri].classList.add('route-alt-selected');
  }

  const routes = routingControl.currentRoutes;
  const routeElements = [];

  for (let ri = 0; ri < routes.length; ri++) {
    const route = routingControl.currentRoutes[ri];
    const routeElam = elements[ri];
    routeElements.push(routeElam);
    let h3Content = routeElam.querySelector('h3')?.textContent;
    if (!h3Content) h3Content = `${fixed(route.summary.totalDistance/1000,1)} km, ${Math.round(route.summary.totalTime / 60)} min`;
    const li = document.createElement('p');
    routeSelectElements.push(li);
    li.className = 'route-alt';
    if (ri === 0) li.classList.add('route-alt-selected');
    li.innerText = `${ri+1}: ${h3Content} ${route.name}`;
    li._clickHandler = function () {
      // updateSelectedRoute(ri);
      routeElements[ri].click();
    };
    li.addEventListener('click', li._clickHandler);
    routeAltsDiv.appendChild(li);
  }

  routingControl.on('routeselected', function (e) {
    const routeIndex = routingControl.currentRoutes.findIndex(r => r === e.route);
    if (routeIndex < 0) return;
    routingControl.activeRouteIndex = routeIndex;
    updateSelectedRoute(routeIndex);
    const container = document.querySelector('.leaflet-routing-container');
    if (!container) return;
    const elements = document.querySelectorAll('.leaflet-routing-alt');
    const selectedRouteSection = elements[routeIndex];
    const instructions = selectedRouteSection ? selectedRouteSection.querySelectorAll('tr') : [];
    const routeInstructions = e.route.instructions;

    for (let idx = 0; idx < instructions.length; idx++) {
      const row = instructions[idx];
      if (row._clickHandler) {
        row.removeEventListener('click', row._clickHandler);
      }

      const instr = routeInstructions[idx];
      if (instr) {
        const meters = routingStyleRound(instr.distance);
        let smeters = numberToFinnishDistance(meters);
        if (instr.type === "Roundabout" || instr.type === "Rotary") smeters = "";
        let nextInstr = "";
        if (smeters !== "") nextInstr = `, ${routeStepToText(stepFromType("thenDrive"))} ${smeters}.`;
        const text = `${instr.text}${nextInstr}`;
        row.speakText = text;
      } else {
        row.speakText = row.innerText;
      }

      row._clickHandler = function () {
        instructions.forEach(r => r.classList.remove('routing-selected'));
        row.classList.add('routing-selected');
        speakText(row.speakText);
      };
      row.addEventListener('click', row._clickHandler);
    }
  });
  routingControl.activeRouteIndex = 0;
  routeElements[0].click();
  // const pl = decodeFlexPolyline("BG6lv62D-pyixBxtCi3DvlBjxD_OnpB7GjNzU_TjI_OjDjIjXw0BvCoGzjBosCrO4c3NwWrOoV_EoGrEAjXwWvbkcjDkDrEoL_EvRrJjhB_pF36QrE3NrO7uBrJriBnL_sBrErOrErTnBnQ8BvHUnGT7L");
  // console.log(pl);
}

function routingStyleRound(meters) {
  if (meters < 20) return Math.ceil(meters);
  if (meters < 500) return Math.ceil(meters / 50) * 50;
  if (meters < 1000) return Math.ceil(meters / 100) * 100;
  if (meters < 3000) return Math.ceil(meters / 500) * 500;
  // For 1000 or more, round up to nearest 100 and convert to km if needed
  if (meters < 10000) return Math.round(meters / 1000) * 1000;
  return Math.ceil(meters / 1000) * 1000;
}

//#endregion Routing UI

let routingOptionsLoaded = false;
function initRoutingOptions() {
  if (routingOptionsLoaded) return;
  const select = document.getElementById("dialectSelect");
  const dialects = Object.keys(stepToTextFunctions);
  select.innerHTML = "";
  for (const d of dialects) {
    const option = document.createElement("option");
    option.value = d;
    option.text = d;
    select.appendChild(option);
  }
  select.value = options.dialect;
  select.addEventListener("change", function() {
    options.dialect = this.value;
    localStorage.setItem('dialect', options.dialect);
  });
  routingOptionsLoaded = true;
}
