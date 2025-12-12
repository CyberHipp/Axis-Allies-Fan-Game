// Axis & Allies 1942.2 data contract
// Defines global AA object with rules, map, units, and setup.

window.AA = window.AA || {};

AA.rules = { edition: "1942.2" };

AA.map = {
  image: "assets/board.jpg",
  width: 0,
  height: 0,
  territories: {
    us_east: {
      name: "Eastern United States",
      type: "land",
      ipc: 12,
      polygon: [
        [1600, 1200], [1900, 1200], [1980, 1360], [1860, 1500], [1660, 1500], [1520, 1380]
      ],
      neighbors: ["atlantic", "uk", "western_us"],
      isCapital: true,
      isVC: true,
      owner: "USA",
    },
    western_us: {
      name: "Western United States",
      type: "land",
      ipc: 10,
      polygon: [
        [1200, 1200], [1500, 1200], [1520, 1380], [1400, 1500], [1180, 1500], [1100, 1320]
      ],
      neighbors: ["pacific", "us_east"],
      isVC: true,
      owner: "USA",
    },
    uk: {
      name: "United Kingdom",
      type: "land",
      ipc: 8,
      polygon: [
        [2100, 900], [2240, 880], [2300, 980], [2240, 1080], [2120, 1060], [2060, 960]
      ],
      neighbors: ["atlantic", "germany"],
      isCapital: true,
      isVC: true,
      owner: "UK",
    },
    germany: {
      name: "Germany",
      type: "land",
      ipc: 10,
      polygon: [
        [2300, 940], [2460, 920], [2540, 1020], [2480, 1140], [2340, 1140], [2260, 1040]
      ],
      neighbors: ["uk", "west_russia", "baltic"],
      isCapital: true,
      isVC: true,
      owner: "Germany",
    },
    west_russia: {
      name: "West Russia",
      type: "land",
      ipc: 6,
      polygon: [
        [2460, 940], [2640, 920], [2720, 1040], [2660, 1180], [2480, 1180], [2400, 1020]
      ],
      neighbors: ["germany", "caucasus", "baltic", "moscow"],
      isVC: false,
      owner: "Soviet",
    },
    moscow: {
      name: "Moscow",
      type: "land",
      ipc: 8,
      polygon: [
        [2640, 1080], [2820, 1060], [2900, 1200], [2820, 1340], [2660, 1340], [2580, 1180]
      ],
      neighbors: ["west_russia", "caucasus"],
      isCapital: true,
      isVC: true,
      owner: "Soviet",
    },
    caucasus: {
      name: "Caucasus",
      type: "land",
      ipc: 4,
      polygon: [
        [2480, 1180], [2660, 1180], [2720, 1300], [2620, 1420], [2460, 1420], [2380, 1300]
      ],
      neighbors: ["west_russia", "baltic", "moscow"],
      isVC: false,
      owner: "Soviet",
    },
    japan: {
      name: "Japan",
      type: "land",
      ipc: 8,
      polygon: [
        [1400, 880], [1520, 860], [1580, 960], [1520, 1040], [1400, 1060], [1340, 960]
      ],
      neighbors: ["pacific"],
      isCapital: true,
      isVC: true,
      owner: "Japan",
    },
    baltic: {
      name: "Baltic Sea",
      type: "sea",
      ipc: 0,
      polygon: [
        [2320, 780], [2520, 760], [2600, 860], [2520, 960], [2340, 980], [2240, 880]
      ],
      neighbors: ["uk", "germany", "west_russia", "caucasus", "atlantic"],
      isVC: false,
      owner: null,
    },
    atlantic: {
      name: "North Atlantic",
      type: "sea",
      ipc: 0,
      polygon: [
        [1800, 960], [2100, 940], [2240, 1040], [2140, 1180], [1880, 1180], [1720, 1060]
      ],
      neighbors: ["us_east", "uk", "baltic"],
      isVC: false,
      owner: null,
    },
    pacific: {
      name: "Central Pacific",
      type: "sea",
      ipc: 0,
      polygon: [
        [1000, 960], [1200, 940], [1320, 1040], [1240, 1160], [1020, 1180], [920, 1060]
      ],
      neighbors: ["western_us"],
      isVC: false,
      owner: null,
    },
  },
};

AA.units = {
  infantry:   { cost: 3, att: 1, def: 2, move: 1 },
  artillery:  { cost: 4, att: 2, def: 2, move: 1 },
  tank:       { cost: 6, att: 3, def: 3, move: 2 },
  aa:         { cost: 5, att: null, def: null, move: 1 },
  fighter:    { cost: 10, att: 3, def: 4, move: 4 },
  bomber:     { cost: 12, att: 4, def: 1, move: 6 },
  destroyer:  { cost: 8, att: 2, def: 2, move: 2 },
  sub:        { cost: 6, att: 2, def: 1, move: 2 },
  cruiser:    { cost: 12, att: 3, def: 3, move: 2 },
  carrier:    { cost: 14, att: 1, def: 2, move: 2 },
  battleship: { cost: 20, att: 4, def: 4, move: 2 },
  transport:  { cost: 7, att: 0, def: 0, move: 2 },
  ic:         { cost: 15, att: null, def: null, move: null },
};

AA.setup = {
  turnOrder: ["Soviet", "Germany", "UK", "Japan", "USA"],
  ipc: { Soviet: 24, Germany: 30, UK: 28, Japan: 30, USA: 32 },
  stacks: {
    us_east: { USA: { infantry: 2, artillery: 1, transport: 0 } },
    western_us: { USA: { infantry: 1, tank: 1 } },
    uk: { UK: { infantry: 2, fighter: 1 } },
    germany: { Germany: { infantry: 3, tank: 1 } },
    west_russia: { Soviet: { infantry: 4, artillery: 1 } },
    caucasus: { Soviet: { infantry: 2, tank: 1 } },
    moscow: { Soviet: { infantry: 3, tank: 1 } },
    atlantic: { UK: { battleship: 1, transport: 1 } },
    pacific: { USA: { carrier: 1, destroyer: 1 } },
    japan: { Japan: { infantry: 3, fighter: 1 } },
  },
};
