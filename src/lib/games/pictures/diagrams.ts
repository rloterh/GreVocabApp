/**
 * The ten Picture It diagrams: 86 named parts.
 *
 * Every part is something you can point at on its own. Wholes that contain
 * other parts are left out on purpose — *stamen* (anther and filament both
 * show), *hull* (bow and stern are sections of it), *pediment* (the tympanum
 * is its face) — because highlighting a whole that holds an asked-about part
 * makes two answers defensible.
 *
 * Canvas 440 × 330. Callouts start at `from`, clear of the drawing, and end
 * on the part at `anchor`.
 */

import type { Diagram } from "./types";

const house: Diagram = {
  id: "house",
  title: "A house",
  shapes: [
    { line: [20, 300, 420, 300], kind: "detail" },
    { rect: [268, 52, 30, 62, 2], part: "chimney" },
    { d: "M110 150 L220 58 L330 150 Z", part: "gable" },
    { d: "M96 158 L220 50 L344 158 L334 162 L220 64 L106 162 Z", part: "bargeboard" },
    { d: "M216 50 L220 30 L224 50 Z", part: "finial" },
    { circle: [220, 28, 5], part: "finial" },
    { rect: [118, 177, 204, 123] },
    { d: "M92 160 L348 160 L348 170 L322 172 L118 172 L92 170 Z", part: "eave" },
    ...[98, 106, 330, 338].map((x) => ({ line: [x, 162, x, 169] as [number, number, number, number], kind: "detail" as const })),
    { d: "M86 172 L354 172 L354 175 Q354 182 347 182 L93 182 Q86 182 86 175 Z", part: "gutter" },
    { d: "M340 182 L346 182 L346 290 Q346 296 352 296 L358 296 L358 300 L348 300 Q340 300 340 292 Z" },
    { rect: [138, 196, 66, 10], part: "lintel" },
    { rect: [144, 206, 54, 48] },
    { line: [171, 206, 171, 254], kind: "detail" },
    { line: [144, 230, 198, 230], kind: "detail" },
    { rect: [136, 254, 70, 8], part: "sill" },
    { d: "M238 214 A30 30 0 0 1 298 214 Z", part: "fanlight" },
    { line: [268, 186, 268, 214], kind: "detail" },
    { rect: [238, 214, 60, 86] },
    { circle: [288, 258, 3], kind: "ink" },
  ],
  parts: [
    { id: "gable", name: "gable", definition: "The triangular upper part of a wall at the end of a pitched roof.", anchor: [220, 120], from: [410, 70] },
    { id: "eave", name: "eave", definition: "The part of a roof that overhangs the wall below it.", anchor: [100, 165], from: [24, 118] },
    { id: "gutter", name: "gutter", definition: "A channel along the edge of a roof that carries rainwater away.", anchor: [300, 179], from: [414, 226] },
    { id: "bargeboard", name: "bargeboard", definition: "A board fixed along the sloping edge of a gable.", anchor: [300, 122], from: [414, 112] },
    { id: "finial", name: "finial", definition: "An ornament crowning the peak of a roof or gable.", anchor: [217, 42], from: [80, 28] },
    { id: "chimney", name: "chimney", definition: "A vertical structure that carries smoke up and out of a building.", anchor: [283, 80], from: [404, 34] },
    { id: "lintel", name: "lintel", definition: "A horizontal beam across the top of a window or door.", anchor: [171, 201], from: [30, 160] },
    { id: "sill", name: "sill", definition: "The horizontal ledge at the bottom of a window.", anchor: [171, 258], from: [30, 290] },
    { id: "fanlight", name: "fanlight", definition: "A half-round window above a door.", anchor: [268, 202], from: [410, 196] },
  ],
};

const COLUMNS = [104, 174, 244, 314];
const temple: Diagram = {
  id: "temple",
  title: "A classical temple",
  shapes: [
    { d: "M78 86 L220 28 L362 86 Z" },
    { d: "M100 80 L220 40 L340 80 Z", part: "tympanum" },
    { rect: [74, 86, 292, 11, 1], part: "cornice" },
    { rect: [84, 97, 272, 22], part: "frieze" },
    ...[100, 136, 172, 208, 244, 280, 316].flatMap((x) => [
      { line: [x, 99, x, 117] as [number, number, number, number], kind: "detail" as const },
      { line: [x + 5, 99, x + 5, 117] as [number, number, number, number], kind: "detail" as const },
    ]),
    { rect: [84, 119, 272, 18], part: "architrave" },
    ...COLUMNS.flatMap((x) => [
      { rect: [x - 7, 137, 44, 6, 1] as [number, number, number, number, number], part: "capital" },
      { d: `M${x - 4} 143 L${x + 34} 143 L${x + 30} 149 L${x} 149 Z`, part: "capital" },
      { rect: [x, 149, 30, 107] as [number, number, number, number], part: "shaft" },
      { line: [x + 8, 152, x + 8, 253] as [number, number, number, number], kind: "detail" as const },
      { line: [x + 15, 152, x + 15, 253] as [number, number, number, number], kind: "detail" as const },
      { line: [x + 22, 152, x + 22, 253] as [number, number, number, number], kind: "detail" as const },
      { rect: [x - 6, 256, 42, 14] as [number, number, number, number], part: "plinth" },
    ]),
    { rect: [70, 270, 300, 14], part: "stylobate" },
    { rect: [58, 284, 324, 14] },
    { line: [20, 298, 420, 298], kind: "detail" },
  ],
  parts: [
    { id: "tympanum", name: "tympanum", definition: "The triangular face enclosed by a pediment.", anchor: [220, 66], from: [410, 30] },
    { id: "cornice", name: "cornice", definition: "The projecting ledge along the top of a building or entablature.", anchor: [356, 91], from: [420, 112] },
    { id: "frieze", name: "frieze", definition: "The broad horizontal band between the architrave and the cornice, often decorated.", anchor: [90, 108], from: [20, 80] },
    { id: "architrave", name: "architrave", definition: "The beam resting directly on top of a row of columns.", anchor: [350, 128], from: [420, 150] },
    { id: "capital", name: "capital", definition: "The decorated top of a column.", anchor: [104, 143], from: [24, 170] },
    { id: "shaft", name: "shaft", definition: "The long main body of a column.", anchor: [259, 200], from: [420, 210] },
    { id: "plinth", name: "plinth", definition: "The square block a column stands on.", anchor: [98, 263], from: [20, 240] },
    { id: "stylobate", name: "stylobate", definition: "The top step of the platform a row of columns stands on.", anchor: [360, 277], from: [420, 252] },
  ],
};

const ship: Diagram = {
  id: "ship",
  title: "A sailing ship",
  shapes: [
    { d: "M20 286 Q40 280 60 286 T100 286 T140 286 T180 286 T220 286 T260 286 T300 286 T340 286 T380 286 T420 286", kind: "detail" },
    { d: "M214 60 L214 196 L94 196 Z", part: "mainsail" },
    { rect: [88, 196, 130, 6, 3], part: "boom" },
    { d: "M224 92 L404 200 L318 208 Z", part: "jib" },
    { rect: [215, 56, 8, 162, 2], part: "mast" },
    { d: "M356 214 L414 196 L416 202 L360 222 Z", part: "bowsprit" },
    { d: "M120 218 L320 218 L320 262 L120 262 Z" },
    { d: "M120 218 L70 218 Q74 246 104 262 L120 262 Z", part: "stern" },
    { d: "M320 218 L376 218 Q362 246 336 262 L320 262 Z", part: "bow" },
    { line: [70, 218, 376, 218], kind: "detail" },
    { circle: [160, 238, 6], part: "porthole" },
    { circle: [210, 238, 6], part: "porthole" },
    { circle: [260, 238, 6], part: "porthole" },
    { d: "M130 262 L320 262 L312 276 L138 276 Z", part: "keel" },
    { d: "M88 226 L66 226 L70 266 L92 262 Z", part: "rudder" },
  ],
  parts: [
    { id: "bow", name: "bow", definition: "The front end of a ship.", anchor: [350, 236], from: [420, 262] },
    { id: "stern", name: "stern", definition: "The rear end of a ship.", anchor: [98, 236], from: [24, 196] },
    { id: "keel", name: "keel", definition: "The structure running along the bottom of a ship, keeping it stable.", anchor: [224, 270], from: [300, 316] },
    { id: "rudder", name: "rudder", definition: "A flat blade at the stern, turned to steer a ship.", anchor: [78, 250], from: [20, 300] },
    { id: "mast", name: "mast", definition: "A tall upright pole that holds a ship's sails.", anchor: [219, 110], from: [110, 44] },
    { id: "boom", name: "boom", definition: "A horizontal pole along the bottom edge of a sail.", anchor: [130, 199], from: [40, 168] },
    { id: "mainsail", name: "mainsail", definition: "The principal sail of a ship, set on the main mast.", anchor: [172, 156], from: [40, 110] },
    { id: "jib", name: "jib", definition: "A triangular sail set ahead of the mast.", anchor: [318, 170], from: [410, 110] },
    { id: "bowsprit", name: "bowsprit", definition: "A spar projecting forward from a ship's bow.", anchor: [392, 206], from: [424, 160] },
    { id: "porthole", name: "porthole", definition: "A small round window in a ship's side.", anchor: [210, 238], from: [300, 300] },
  ],
};

const FRET_XS = [272, 290, 324, 339, 352, 364];
const guitar: Diagram = {
  id: "guitar",
  title: "An acoustic guitar",
  shapes: [
    {
      d: "M40 165 C40 95 128 86 152 116 C163 129 184 112 206 113 C240 115 256 140 256 165 C256 190 240 215 206 217 C184 218 163 201 152 214 C128 244 40 235 40 165 Z",
      part: "body",
    },
    { d: "M200 192 C214 204 244 200 246 178 C247 164 238 156 226 160 C230 176 218 188 200 192 Z", part: "pickguard" },
    { circle: [190, 165, 21], part: "soundhole" },
    { circle: [190, 165, 26], kind: "detail" },
    { rect: [78, 146, 16, 38, 3], part: "bridge" },
    { rect: [256, 155, 118, 20, 2], part: "neck" },
    ...FRET_XS.map((x) => ({ line: [x, 156, x, 174] as [number, number, number, number], kind: "line" as const })),
    { line: [306, 155, 306, 175], kind: "line", part: "fret" },
    { rect: [372, 150, 8, 30, 2], part: "nut" },
    { d: "M380 150 L428 139 L430 191 L380 180 Z", part: "headstock" },
    ...[
      [394, 139],
      [408, 136],
      [422, 133],
      [394, 191],
      [408, 194],
      [422, 197],
    ].map(([cx, cy]) => ({ circle: [cx!, cy!, 5] as [number, number, number], part: "tuning-peg" })),
    ...[159, 163, 167, 171].map((y) => ({ line: [86, y, 378, y] as [number, number, number, number], kind: "detail" as const })),
  ],
  parts: [
    { id: "body", name: "body", definition: "The large hollow part of a guitar that makes the sound louder.", anchor: [80, 210], from: [24, 300] },
    { id: "soundhole", name: "soundhole", definition: "The round opening in a guitar's top that lets the sound out.", anchor: [190, 152], from: [150, 40] },
    { id: "bridge", name: "bridge", definition: "The piece on a guitar's body that anchors the strings.", anchor: [86, 150], from: [24, 60] },
    { id: "pickguard", name: "pickguard", definition: "A plate on a guitar's top that protects it from being scratched by a pick.", anchor: [234, 186], from: [270, 290] },
    { id: "neck", name: "neck", definition: "The long, narrow part of a guitar along which the strings run.", anchor: [282, 172], from: [300, 260] },
    { id: "fret", name: "fret", definition: "One of the thin raised strips across a guitar's neck that mark the notes.", anchor: [306, 156], from: [380, 70] },
    { id: "nut", name: "nut", definition: "The grooved strip where the neck meets the headstock, spacing the strings.", anchor: [376, 180], from: [300, 280] },
    { id: "headstock", name: "headstock", definition: "The end of a guitar's neck that holds the tuning pegs.", anchor: [404, 165], from: [420, 280] },
    { id: "tuning-peg", name: "tuning peg", definition: "A peg turned to tighten or loosen a string.", anchor: [408, 136], from: [380, 50] },
  ],
};

const castle: Diagram = {
  id: "castle",
  title: "A castle",
  shapes: [
    { rect: [184, 70, 72, 100], part: "keep" },
    ...[184, 204, 224, 244].map((x) => ({ rect: [x, 60, 12, 10] as [number, number, number, number], part: "keep" })),
    { line: [220, 60, 220, 34], kind: "detail" },
    { d: "M220 34 L244 40 L220 46 Z", kind: "detail" },
    { rect: [100, 170, 240, 112], part: "curtain-wall" },
    ...[118, 142, 166, 262, 286, 310].map((x) => ({ rect: [x, 156, 14, 14] as [number, number, number, number], part: "battlements" })),
    { rect: [70, 140, 40, 142], part: "turret" },
    { d: "M64 140 L90 98 L116 140 Z", part: "turret" },
    { rect: [330, 140, 40, 142], part: "turret" },
    { d: "M324 140 L350 98 L376 140 Z", part: "turret" },
    { rect: [148, 200, 5, 24, 2], part: "loophole" },
    { rect: [288, 200, 5, 24, 2], part: "loophole" },
    { d: "M196 282 L196 236 A24 24 0 0 1 244 236 L244 282 Z" },
    { d: "M200 262 L200 238 A20 20 0 0 1 240 238 L240 262 Z", part: "portcullis" },
    ...[208, 216, 224, 232].map((x) => ({ line: [x, 222, x, 262] as [number, number, number, number], kind: "detail" as const })),
    { line: [200, 238, 240, 238], kind: "detail" },
    { line: [200, 250, 240, 250], kind: "detail" },
    { rect: [20, 282, 400, 8] },
    { d: "M20 290 L420 290 L412 318 L28 318 Z", part: "moat" },
    { d: "M36 300 Q46 296 56 300 T76 300 T96 300 T116 300 T136 300 T156 300 T176 300 M264 300 Q274 296 284 300 T304 300 T324 300 T344 300 T364 300 T384 300 T404 300", kind: "detail" },
    { d: "M44 310 Q54 306 64 310 T84 310 T104 310 T124 310 T144 310 T164 310 M276 310 Q286 306 296 310 T316 310 T336 310 T356 310 T376 310 T396 310", kind: "detail" },
    { d: "M196 282 L244 282 L256 318 L184 318 Z", part: "drawbridge" },
  ],
  parts: [
    { id: "keep", name: "keep", definition: "The strongest central tower of a castle.", anchor: [220, 110], from: [160, 30] },
    { id: "turret", name: "turret", definition: "A small tower on top of or at the corner of a larger building.", anchor: [90, 120], from: [24, 60] },
    { id: "battlements", name: "battlements", definition: "A wall with regular gaps along its top, for defenders to shoot through.", anchor: [149, 160], from: [140, 60] },
    { id: "portcullis", name: "portcullis", definition: "A heavy grating lowered to block a castle gateway.", anchor: [220, 244], from: [130, 316] },
    { id: "drawbridge", name: "drawbridge", definition: "A bridge that can be raised to stop anyone crossing a moat.", anchor: [238, 304], from: [330, 326] },
    { id: "moat", name: "moat", definition: "A deep, wide ditch around a castle, usually filled with water.", anchor: [100, 305], from: [24, 250] },
    { id: "curtain-wall", name: "curtain wall", definition: "The outer wall linking the towers of a castle.", anchor: [310, 250], from: [420, 240] },
    { id: "loophole", name: "loophole", definition: "A narrow vertical slit in a wall for shooting arrows through.", anchor: [290, 212], from: [420, 196] },
  ],
};

const church: Diagram = {
  id: "church",
  title: "A church, seen from above",
  shapes: [
    { rect: [30, 130, 42, 70, 2], part: "narthex" },
    { rect: [72, 108, 168, 22], part: "aisle" },
    { rect: [72, 200, 168, 22], part: "aisle" },
    { rect: [72, 130, 168, 70], part: "nave" },
    ...[96, 124, 152, 180, 208].flatMap((x) => [
      { circle: [x, 130, 3] as [number, number, number], kind: "ink" as const },
      { circle: [x, 200, 3] as [number, number, number], kind: "ink" as const },
    ]),
    { rect: [240, 48, 62, 82], part: "transept" },
    { rect: [240, 200, 62, 82], part: "transept" },
    { rect: [240, 130, 62, 70], part: "crossing" },
    { line: [240, 130, 302, 200], kind: "detail" },
    { line: [302, 130, 240, 200], kind: "detail" },
    { rect: [302, 130, 70, 70], part: "chancel" },
    { d: "M372 130 A35 35 0 0 1 372 200 Z", part: "apse" },
  ],
  parts: [
    { id: "narthex", name: "narthex", definition: "The entrance hall at the west end of a church.", anchor: [50, 165], from: [24, 60] },
    { id: "nave", name: "nave", definition: "The long central hall of a church, where the congregation sits.", anchor: [156, 165], from: [140, 300] },
    { id: "aisle", name: "aisle", definition: "A passage running alongside the nave, separated from it by columns.", anchor: [156, 119], from: [120, 40] },
    { id: "transept", name: "transept", definition: "Either arm crossing the main body of a cross-shaped church.", anchor: [271, 88], from: [380, 50] },
    { id: "crossing", name: "crossing", definition: "The space where the nave and the transept meet.", anchor: [271, 165], from: [200, 310] },
    { id: "chancel", name: "chancel", definition: "The part of a church near the altar, beyond the crossing.", anchor: [337, 165], from: [400, 280] },
    { id: "apse", name: "apse", definition: "A half-round recess at the end of a church, usually behind the altar.", anchor: [390, 165], from: [424, 90] },
  ],
};

const watch: Diagram = {
  id: "watch",
  title: "A wristwatch",
  shapes: [
    { rect: [190, 14, 60, 70, 6], part: "strap" },
    ...[30, 46, 62].map((y) => ({ circle: [220, y, 3] as [number, number, number], kind: "detail" as const })),
    { rect: [190, 246, 60, 50, 6], part: "strap" },
    { d: "M184 294 L256 294 Q262 294 262 300 L262 312 Q262 318 256 318 L184 318 Q178 318 178 312 L178 300 Q178 294 184 294 Z M186 300 L254 300 L254 312 L186 312 Z", part: "buckle", evenodd: true },
    { line: [220, 288, 220, 316], kind: "line", part: "buckle" },
    { rect: [298, 156, 14, 18, 3], part: "crown" },
    { d: "M220 85 A80 80 0 1 1 219.9 85 Z M220 97 A68 68 0 1 0 220.1 97 Z", part: "bezel", evenodd: true },
    ...[
      [182, 78],
      [244, 78],
      [182, 234],
      [244, 234],
    ].map(([x, y]) => ({ rect: [x!, y!, 14, 18, 3] as [number, number, number, number, number], part: "lug" })),
    { circle: [220, 165, 68], part: "dial" },
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      return {
        line: [220 + 54 * Math.sin(a), 165 - 54 * Math.cos(a), 220 + 62 * Math.sin(a), 165 - 62 * Math.cos(a)] as [number, number, number, number],
        kind: "detail" as const,
      };
    }),
    { d: "M223 160 L191 148 L217 170 Z", part: "hour-hand" },
    { d: "M218 161.5 L268 137 L222 168.5 Z", part: "minute-hand" },
    // A hairline that reaches the tick ring, with a counterweight past the pin:
    // the shape every second hand has, so it never reads as a thin minute hand.
    { line: [229, 151, 186, 218], kind: "line", part: "second-hand" },
    { circle: [229, 151, 4.5], part: "second-hand" },
    { circle: [220, 165, 4], kind: "ink" },
  ],
  parts: [
    { id: "strap", name: "strap", definition: "The band that holds a watch on the wrist.", anchor: [220, 44], from: [80, 30] },
    { id: "buckle", name: "buckle", definition: "The clasp that fastens a strap.", anchor: [258, 306], from: [380, 300] },
    { id: "lug", name: "lug", definition: "One of the projections on a watch case where the strap attaches.", anchor: [251, 86], from: [380, 50] },
    { id: "bezel", name: "bezel", definition: "The ring around a watch's face that holds the glass in place.", anchor: [146, 140], from: [40, 120] },
    { id: "dial", name: "dial", definition: "The face of a watch or clock, marked with the hours.", anchor: [190, 140], from: [40, 200] },
    { id: "crown", name: "crown", definition: "The knob on the side of a watch used to set the time.", anchor: [305, 165], from: [410, 120] },
    { id: "hour-hand", name: "hour hand", definition: "The shorter hand of a watch, which points to the hour.", anchor: [204, 156], from: [340, 60] },
    { id: "minute-hand", name: "minute hand", definition: "The longer hand of a watch, which points to the minutes.", anchor: [242, 152], from: [400, 280] },
    { id: "second-hand", name: "second hand", definition: "The thin hand that sweeps round once a minute.", anchor: [196, 203], from: [330, 300] },
  ],
};

const flower: Diagram = {
  id: "flower",
  title: "A flower, cut in half",
  shapes: [
    { rect: [214, 214, 12, 96, 4], part: "stem" },
    { d: "M206 208 Q170 204 154 226 Q186 230 210 214 Z", part: "sepal" },
    { d: "M234 208 Q270 204 286 226 Q254 230 230 214 Z", part: "sepal" },
    { d: "M200 200 Q110 180 116 92 Q170 112 210 192 Z", part: "petal" },
    { d: "M240 200 Q330 180 324 92 Q270 112 230 192 Z", part: "petal" },
    { ellipse: [220, 208, 28, 9], part: "receptacle" },
    { d: "M208 194 Q192 150 176 128", kind: "line", part: "filament" },
    { d: "M232 194 Q248 150 264 128", kind: "line", part: "filament" },
    { ellipse: [174, 120, 8, 13], part: "anther" },
    { ellipse: [266, 120, 8, 13], part: "anther" },
    { ellipse: [220, 184, 16, 20], part: "ovary" },
    { rect: [217, 106, 6, 60, 2], part: "style" },
    { ellipse: [220, 102, 15, 7], part: "stigma" },
  ],
  parts: [
    { id: "petal", name: "petal", definition: "One of the coloured, leaf-like parts around a flower's centre.", anchor: [130, 120], from: [30, 60] },
    { id: "sepal", name: "sepal", definition: "One of the small green leaves that enclose a bud and support the petals.", anchor: [170, 222], from: [40, 270] },
    { id: "receptacle", name: "receptacle", definition: "The thickened end of the stem from which a flower's parts grow.", anchor: [220, 211], from: [380, 270] },
    { id: "ovary", name: "ovary", definition: "The swollen base of a flower's pistil, where the seeds develop.", anchor: [226, 186], from: [400, 200] },
    { id: "style", name: "style", definition: "The slender stalk joining the stigma to the ovary.", anchor: [220, 140], from: [330, 40] },
    { id: "stigma", name: "stigma", definition: "The tip of a flower's pistil, which receives the pollen.", anchor: [220, 98], from: [220, 24] },
    { id: "filament", name: "filament", definition: "The thin stalk that holds up an anther.", anchor: [254, 156], from: [410, 140] },
    { id: "anther", name: "anther", definition: "The part of a stamen that produces pollen.", anchor: [174, 114], from: [60, 30] },
    { id: "stem", name: "stem", definition: "The main stalk of a plant, which supports the flower.", anchor: [220, 280], from: [330, 310] },
  ],
};

const eye: Diagram = {
  id: "eye",
  title: "A human eye",
  shapes: [
    { d: "M110 96 Q220 36 336 90 Q220 60 112 108 Z", part: "eyebrow" },
    { d: "M104 168 Q220 82 338 168 Q220 112 104 168 Z", part: "eyelid" },
    ...[
      [150, 150, 140, 128],
      [180, 143, 174, 121],
      [210, 140, 209, 118],
      [240, 141, 244, 119],
      [270, 145, 279, 124],
      [298, 152, 311, 132],
    ].map(([x1, y1, x2, y2]) => ({ line: [x1!, y1!, x2!, y2!] as [number, number, number, number], kind: "line" as const, part: "eyelash" })),
    { d: "M112 168 Q220 116 330 168 Q220 224 112 168 Z", part: "sclera" },
    { circle: [222, 168, 40], part: "iris" },
    ...Array.from({ length: 10 }, (_, i) => {
      const a = (i * Math.PI) / 5;
      return { line: [222 + 20 * Math.cos(a), 168 + 20 * Math.sin(a), 222 + 36 * Math.cos(a), 168 + 36 * Math.sin(a)] as [number, number, number, number], kind: "detail" as const };
    }),
    { circle: [222, 168, 16], kind: "ink", part: "pupil" },
    { circle: [214, 160, 4], kind: "detail" },
    { ellipse: [126, 168, 9, 7], part: "caruncle" },
    { d: "M112 176 Q220 236 330 172", kind: "detail" },
  ],
  parts: [
    { id: "eyebrow", name: "eyebrow", definition: "The strip of hair growing on the ridge above the eye.", anchor: [220, 66], from: [380, 40] },
    { id: "eyelid", name: "eyelid", definition: "The fold of skin that closes over the eye.", anchor: [256, 133], from: [410, 100] },
    { id: "eyelash", name: "eyelash", definition: "One of the short hairs growing from the edge of the eyelid.", anchor: [175, 124], from: [60, 50] },
    { id: "sclera", name: "sclera", definition: "The white outer layer of the eyeball.", anchor: [290, 172], from: [410, 220] },
    { id: "iris", name: "iris", definition: "The coloured ring around the pupil that controls how much light enters.", anchor: [250, 190], from: [360, 290] },
    { id: "pupil", name: "pupil", definition: "The dark opening at the centre of the eye that lets light in.", anchor: [222, 168], from: [200, 300] },
    { id: "caruncle", name: "caruncle", definition: "The small pink lump in the inner corner of the eye.", anchor: [126, 168], from: [24, 230] },
  ],
};

const shoe: Diagram = {
  id: "shoe",
  title: "A shoe",
  shapes: [
    { line: [20, 290, 420, 290], kind: "detail" },
    { rect: [66, 266, 70, 22, 3], part: "heel" },
    { d: "M58 252 L384 252 Q404 252 406 262 L406 268 L58 268 Z", part: "sole" },
    { d: "M150 166 Q154 126 182 116 Q200 118 204 138 L198 160 Z", part: "tongue" },
    { d: "M222 154 Q298 174 368 210 Q392 224 392 242 L392 252 L236 252 Q226 230 232 200 Q238 176 222 154 Z", part: "vamp" },
    { d: "M66 252 L66 160 Q68 146 86 146 Q120 150 150 166 L222 154 Q238 176 232 200 Q226 230 236 252 Z", part: "quarter" },
    { d: "M316 194 Q364 206 388 230 L392 252 L304 252 Q294 220 316 194 Z", part: "toe-cap" },
    { rect: [62, 246, 332, 7, 2], part: "welt" },
    { d: "M162 174 L194 164 M178 170 L210 160", kind: "line", part: "lace" },
    { d: "M210 160 Q250 168 254 202", kind: "line", part: "lace" },
    { rect: [250, 200, 8, 13, 2], part: "aglet" },
    ...[
      [162, 174],
      [178, 170],
      [194, 164],
      [210, 160],
    ].map(([cx, cy]) => ({ circle: [cx!, cy!, 3.5] as [number, number, number], part: "eyelet" })),
    { d: "M96 160 Q100 210 96 240", kind: "detail" },
  ],
  parts: [
    { id: "sole", name: "sole", definition: "The bottom of a shoe, which touches the ground.", anchor: [300, 262], from: [400, 312] },
    { id: "heel", name: "heel", definition: "The raised part under the back of a shoe.", anchor: [100, 280], from: [24, 314] },
    { id: "quarter", name: "quarter", definition: "The back and side of a shoe's upper, around the heel.", anchor: [120, 210], from: [24, 120] },
    { id: "vamp", name: "vamp", definition: "The front part of a shoe's upper, covering the top of the foot.", anchor: [276, 224], from: [330, 120] },
    { id: "toe-cap", name: "toe cap", definition: "An extra layer covering the toe of a shoe.", anchor: [352, 232], from: [420, 180] },
    { id: "tongue", name: "tongue", definition: "The flap under a shoe's laces.", anchor: [180, 132], from: [120, 50] },
    { id: "eyelet", name: "eyelet", definition: "A small reinforced hole that a lace passes through.", anchor: [215, 151], from: [290, 60] },
    { id: "lace", name: "lace", definition: "A cord threaded through a shoe to fasten it.", anchor: [241, 174], from: [370, 120] },
    { id: "aglet", name: "aglet", definition: "The small plastic or metal tip on the end of a shoelace.", anchor: [254, 210], from: [330, 312] },
    { id: "welt", name: "welt", definition: "A strip joining a shoe's upper to its sole.", anchor: [180, 249], from: [130, 316] },
  ],
};

export const DIAGRAMS: readonly Diagram[] = [house, temple, ship, guitar, castle, church, watch, flower, eye, shoe];
