// Axis & Allies (Lite) — data
// This is a simplified, fan-made scenario with an abstract map.
// No official map art or component scans are used.

const POWERS = {
  "USSR": { side: "Allies", color: "#ef4444" },
  "Germany": { side: "Axis", color: "#f59e0b" },
  "UK": { side: "Allies", color: "#22c55e" },
  "Japan": { side: "Axis", color: "#e11d48" },
  "USA": { side: "Allies", color: "#60a5fa" },
};

const TURN_ORDER = ["USSR", "Germany", "UK", "Japan", "USA"];

const PHASES = [
  "Purchase",
  "Combat Move",
  "Conduct Combat",
  "Noncombat Move",
  "Mobilize",
  "Collect Income",
];

const UNIT_STATS = {
  "inf": { name: "Infantry", cost: 3, atk: 1, def: 2, move: 1, domain: "land" },
  "tank": { name: "Tank", cost: 5, atk: 3, def: 3, move: 2, domain: "land" },
  "ftr": { name: "Fighter", cost: 10, atk: 3, def: 4, move: 4, domain: "air" },
  "bmb": { name: "Bomber", cost: 12, atk: 4, def: 1, move: 6, domain: "air" },

  "sub": { name: "Submarine", cost: 6, atk: 2, def: 2, move: 2, domain: "sea" },
  "dd":  { name: "Destroyer", cost: 8, atk: 3, def: 3, move: 2, domain: "sea" },
  "trn": { name: "Transport", cost: 7, atk: 0, def: 0, move: 2, domain: "sea", capacity: 2 },
  "bb":  { name: "Battleship", cost: 20, atk: 4, def: 4, move: 2, domain: "sea", hp: 2 },
  "cv":  { name: "Carrier", cost: 14, atk: 3, def: 3, move: 2, domain: "sea", airCap: 2 },
};

// Abstract territories + sea zones (rectangles on the canvas)
const MAP = [
  // Seas
  { id:"ARCTIC", name:"Arctic Sea", type:"sea", ipc:0, x:40, y:40, w:1120, h:90, neighbors:["NPAC","NATL"] },
  { id:"NPAC", name:"North Pacific", type:"sea", ipc:0, x:40, y:150, w:240, h:110, neighbors:["ARCTIC","CPAC","SOJ","US_W"] },
  { id:"CPAC", name:"Central Pacific", type:"sea", ipc:0, x:300, y:150, w:240, h:110, neighbors:["NPAC","SPAC","US_W","US_C"] },
  { id:"SPAC", name:"South Pacific", type:"sea", ipc:0, x:560, y:590, w:300, h:90, neighbors:["CPAC","INDO","AUS","SEA"] },
  { id:"SOJ", name:"Sea of Japan", type:"sea", ipc:0, x:920, y:150, w:240, h:110, neighbors:["NPAC","JPN","CHN","SEA"] },

  { id:"NATL", name:"North Atlantic", type:"sea", ipc:0, x:560, y:270, w:300, h:110, neighbors:["ARCTIC","MATL","NSEA","CAN_E","UK"] },
  { id:"MATL", name:"Mid Atlantic", type:"sea", ipc:0, x:560, y:390, w:300, h:110, neighbors:["NATL","SATL","NSEA","US_C","FRA"] },
  { id:"SATL", name:"South Atlantic", type:"sea", ipc:0, x:560, y:510, w:300, h:70, neighbors:["MATL","MED"] },
  { id:"NSEA", name:"North Sea", type:"sea", ipc:0, x:880, y:270, w:280, h:110, neighbors:["NATL","MATL","BALT","UK","FRA","GER"] },
  { id:"BALT", name:"Baltic Sea", type:"sea", ipc:0, x:880, y:390, w:280, h:70, neighbors:["NSEA","GER","POL"] },
  { id:"MED", name:"Mediterranean", type:"sea", ipc:0, x:880, y:470, w:280, h:110, neighbors:["SATL","INDO","FRA","NAF"] },
  { id:"INDO", name:"Indian Ocean", type:"sea", ipc:0, x:880, y:590, w:280, h:90, neighbors:["MED","SPAC","IND","SEA"] },

  // Lands (Americas)
  { id:"US_W", name:"Western USA (Washington)", type:"land", ipc:6, capital:"USA", x:40, y:270, w:240, h:110, neighbors:["US_C","NPAC","CPAC"] },
  { id:"US_C", name:"Central USA", type:"land", ipc:4, x:40, y:390, w:240, h:110, neighbors:["US_W","CAN_E","MATL","CPAC"] },
  { id:"CAN_E", name:"Eastern Canada", type:"land", ipc:2, x:40, y:510, w:240, h:70, neighbors:["US_C","NATL"] },

  // Lands (Europe)
  { id:"UK", name:"United Kingdom (London)", type:"land", ipc:5, capital:"UK", x:300, y:270, w:240, h:110, neighbors:["FRA","NATL","NSEA"] },
  { id:"FRA", name:"France", type:"land", ipc:3, x:300, y:390, w:240, h:110, neighbors:["UK","GER","MATL","NSEA","MED","NAF"] },
  { id:"GER", name:"Germany (Berlin)", type:"land", ipc:6, capital:"Germany", x:300, y:510, w:240, h:70, neighbors:["FRA","POL","USSR_W","NSEA","BALT"] },
  { id:"POL", name:"Poland", type:"land", ipc:2, x:300, y:590, w:240, h:90, neighbors:["GER","USSR_W","BALT"] },
  { id:"NAF", name:"North Africa", type:"land", ipc:2, x:40, y:590, w:240, h:90, neighbors:["FRA","MED"] },

  // Lands (Eurasia / Pacific)
  { id:"USSR_W", name:"Western USSR", type:"land", ipc:3, x:920, y:270, w:240, h:110, neighbors:["GER","POL","MOS","CAU"] },
  { id:"MOS", name:"Moscow", type:"land", ipc:6, capital:"USSR", x:920, y:390, w:240, h:110, neighbors:["USSR_W","CAU"] },
  { id:"CAU", name:"Caucasus", type:"land", ipc:4, x:920, y:510, w:240, h:70, neighbors:["MOS","USSR_W","IND"] },

  { id:"CHN", name:"China", type:"land", ipc:3, x:300, y:150, w:240, h:110, neighbors:["IND","SEA","SOJ","JPN"] },
  { id:"IND", name:"India", type:"land", ipc:4, x:300, y:40, w:240, h:90, neighbors:["CHN","SEA","CAU","INDO"] },
  { id:"SEA", name:"Southeast Asia", type:"land", ipc:3, x:40, y:150, w:240, h:110, neighbors:["CHN","IND","JPN","SPAC","INDO","SOJ"] },
  { id:"JPN", name:"Japan (Tokyo)", type:"land", ipc:6, capital:"Japan", x:920, y:40, w:240, h:90, neighbors:["CHN","SEA","SOJ"] },
  { id:"AUS", name:"Australia", type:"land", ipc:3, x:920, y:590, w:240, h:90, neighbors:["SPAC"] },
];

// Factories (where new units can be placed) — capitals only in this Lite scenario.
const FACTORIES = new Set(["US_W","UK","MOS","GER","JPN"]);

// Starting ownership for the Lite scenario
const START_OWNER = {
  // Allies
  "US_W":"USA","US_C":"USA","CAN_E":"USA",
  "UK":"UK","FRA":"UK","NAF":"UK","IND":"UK","AUS":"UK",
  "USSR_W":"USSR","MOS":"USSR","CAU":"USSR",
  // Axis
  "GER":"Germany","POL":"Germany",
  "JPN":"Japan","SEA":"Japan","CHN":"Japan",
};

// Starting units (simple, balanced-ish)
const START_UNITS = [
  // USA
  ["US_W","USA",[["inf",4],["ftr",1],["bmb",1]]],
  ["US_C","USA",[["inf",2]]],
  ["NPAC","USA",[["cv",1],["dd",1],["trn",1]]],

  // UK
  ["UK","UK",[["inf",4],["ftr",1]]],
  ["FRA","UK",[["inf",2]]],
  ["NATL","UK",[["bb",1],["trn",1]]],

  // USSR
  ["MOS","USSR",[["inf",6],["tank",2],["ftr",1]]],
  ["USSR_W","USSR",[["inf",3]]],
  ["CAU","USSR",[["inf",2],["tank",1]]],

  // Germany
  ["GER","Germany",[["inf",5],["tank",2],["ftr",1]]],
  ["NSEA","Germany",[["sub",1],["dd",1],["trn",1]]],

  // Japan
  ["JPN","Japan",[["inf",5],["tank",1],["ftr",1],["bmb",1]]],
  ["SOJ","Japan",[["bb",1],["cv",1],["dd",1],["sub",1],["trn",1]]],
  ["SEA","Japan",[["inf",2]]],
  ["CHN","Japan",[["inf",2]]],
];

// Victory conditions based on 1941-style capitals (configurable)
const VICTORY_RULES = {
  long: {
    name: "Capture 2 enemy capitals",
    alliesWin: { type:"capitals", mustHold:["GER","JPN"] },      // Allies hold Berlin+Tokyo at end of Japan turn
    axisWin:   { type:"capitalsAny2", alliedCapitals:["US_W","UK","MOS"] }, // Axis holds any two at end of USA turn
  },
  short: {
    name: "Short game: capture 1 enemy capital",
    alliesWin: { type:"capitalsAny1", enemyCapitals:["GER","JPN"] },
    axisWin:   { type:"capitalsAny1", enemyCapitals:["US_W","UK"] }, // per 1941 short option
  }
};

