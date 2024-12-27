const turf = require("@turf/turf"); // Turf.jsライブラリを使用
const fs = require("fs");

/**
 * グリッドデータを変換する関数
 * @param {Object} sourceGrid - 元のグリッドデータ（GeoJSON形式）
 * @param {Object} targetGrid - 変換後のグリッドデータ（GeoJSON形式）
 * @param {String} valueProperty - 按分する値のプロパティ名（例: "population"）
 * @returns {Object} - 按分されたターゲットグリッド（GeoJSON形式）
 */
function convertGrid(sourceGrid, targetGrid, valueProperty) {
  // 各ターゲットグリッドの値を取得
  targetGrid.features.forEach((targetFeature) => {

    // ターゲットグリッドの代表点が含まれるソースグリッドを取得
    for(let i=0; i<sourceGrid.features.length; i++){
      const sourceFeature = sourceGrid.features[i];
      const point = turf.centroid(targetFeature);
      
      //console.log(polys);
      let intersection;
      try {
        intersection = turf.booleanContains(sourceFeature, point); // return <boolean>
      } catch (exceptionVar) {
        //console.log(`ERROR: ${file}`);
        //console.log(exceptionVar);
      }
      
      if (intersection) {
        targetFeature.properties[valueProperty] = sourceFeature.properties[valueProperty];
      }
    }

  });

  return targetGrid;
}

// Reference: Slippy map tilenames
// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
// https://github.com/mghs15/tile-dist-from-pmtiles/blob/main/list2poly.js
const lon2tile = (lon,zoom) => { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
const lat2tile = (lat,zoom) => { return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }
const lon2tiled = (lon,zoom) => { return ((lon+180)/360*Math.pow(2,zoom)); }
const lat2tiled = (lat,zoom) => { return ((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)); }
const tile2long = (x,z) => { return (x/Math.pow(2,z)*360-180); }
const tile2lat  = (y,z) => {
  const n=Math.PI-2*Math.PI*y/Math.pow(2,z);
  return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}


// とりあえず、入力もタイル単位であると想定
/**
 * タイル単位のファイルで変換を行う関数（とりあえず）
 * @param {Integer} tz - 入力ファイルの ZL
 * @param {Integer} tx - 入力ファイルの X座標
 * @param {Integer} ty - 入力ファイルの Y座標
 * @param {Integer} dz - 入力ファイルと出力ファイルのZLの差
 * @returns {Object} - 按分されたターゲットグリッド（GeoJSON形式）
 */
const convertGridByTileUnit = (tz, tx, ty, dz) => { 

  // サンプルデータ: 元のグリッド（GeoJSON形式）
  let json;
  try {
    const sdat = fs.readFileSync(`./dst/${tz}-${tx}-${ty}.geojson`, "utf8");
    json = JSON.parse(sdat);
  } catch (exceptionVar) {
    console.log(`ERROR: ${tz}-${tx}-${ty}`);
    //console.log(exceptionVar);
  }
  
  if(!json) return;
  const sourceGrid = json; // とりあえず、入力がポリゴンの場合
  

  // サンプルデータ: 変換後のグリッド（GeoJSON形式）  
  const z = tz - dz;
  const x = tx >> dz;
  const y = ty >> dz;
  
  const u = 1<<(8-dz);
  const sx = (tx-(x<<dz))*u;
  const sy = (ty-(y<<dz))*u;
  
  console.log(sx, sy, dz, u);
  
  const targetGrid = {
    type: "FeatureCollection",
    name: `${tz}-${tx}-${ty}`,
    features: []
  };

  for(let i=sx; i<sx+u; i++){
    for(let j=sy; j<sy+u; j++){
      const nw = {
        lng: tile2long(x+i/256, z),
        lat: tile2lat(y+j/256, z)
      };
      const se = {
        lng: tile2long(x+(i+1)/256, z),
        lat: tile2lat(y+(j+1)/256, z)
      };
      const f = {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [nw.lng, nw.lat], 
            [se.lng, nw.lat], 
            [se.lng, se.lat], 
            [nw.lng, se.lat], 
            [nw.lng, nw.lat]
          ]],
        },
        properties: {
          "tile": `${i}-${j}`
        },
      };
      
      targetGrid.features.push(f);
      
    }
  }

  // 使用例
  const valueProperty = "人口（人）"; // "population";
  const convertedGrid = convertGrid(sourceGrid, targetGrid, valueProperty);
  const resultGrid = {
    type: "FeatureCollection",
    area: `${z}-${x}-${y}`,
    source: `${tz}-${tx}-${ty}`,
    features: convertedGrid.features.filter( f => f.properties[valueProperty])
  };
  

  // validation
  let org = 0;
  sourceGrid.features.forEach( f => {
    org += f.properties[valueProperty];
  });
  let res = 0;
  resultGrid.features.forEach( f => {
    res += f.properties[valueProperty];
  });
  console.log("validation", resultGrid.source, " --- ", org, "vs", res);
  
  return resultGrid;
}

const files = fs.readdirSync('./dst');
  
files.forEach( file => {

  const m = file.match(/(\d+)-(\d+)-(\d+)/);
  if(!m) return;
  const z = +m[1]; const x = +m[2]; const y = +m[3];

  const resultGrid = convertGridByTileUnit(z, x, y, 1);
  if(!resultGrid) return;
  const xyz = resultGrid.source;
  
  // 入力と出力のファイルが1対1なのでこれでよい
  // 入力と出力が対応しない場合、都度更新か追記が必要
  fs.writeFileSync(`./picked-tile-dst/${xyz}.geojson`, JSON.stringify(resultGrid, null, null))
  
});

