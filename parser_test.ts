import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";
import {
  parseFillStyleArray,
  parseHeader,
  parseLineStyleArray,
  parseTags,
} from "./parser.ts";
import { Bitstream } from "./bitstream.ts";

const makeShortTag = (tagCode: number, body: number[]) => {
  const header = (tagCode << 6) | body.length;
  return new Uint8Array([header & 0xff, (header >> 8) & 0xff, ...body]);
};

const makeLongTag = (tagCode: number, body: number[]) => {
  const header = (tagCode << 6) | 0b11_1111;
  const length = body.length;

  return new Uint8Array([
    header & 0xff,
    (header >> 8) & 0xff,
    length & 0xff,
    (length >> 8) & 0xff,
    (length >> 16) & 0xff,
    (length >> 24) & 0xff,
    ...body,
  ]);
};

Deno.test("parseHeader - test.swf", async () => {
  const buffer = await Deno.readFile("./test.swf");

  const header = parseHeader(buffer);

  assertEquals("F", header.compressionType);
  assertEquals(8, header.version);
  assertEquals(761, header.fileLength);
  assertEquals(15, header.frameSize.nBits);
  assertEquals(0, header.frameSize.xMin);
  assertEquals(11000, header.frameSize.xMax);
  assertEquals(0, header.frameSize.yMin);
  assertEquals(8000, header.frameSize.yMax);
  assertEquals(12, header.frameRate);
  assertEquals(1, header.frameCount);
});

Deno.test("parseHeader - prm.swf", async () => {
  const buffer = await Deno.readFile("./prm.swf");

  const header = parseHeader(buffer);

  assertEquals("F", header.compressionType);
  assertEquals(11, header.version);
  assertEquals(80049, header.fileLength);
  assertEquals(15, header.frameSize.nBits);
  assertEquals(0, header.frameSize.xMin);
  assertEquals(15200, header.frameSize.xMax);
  assertEquals(0, header.frameSize.yMin);
  assertEquals(12000, header.frameSize.yMax);
  assertEquals(30, header.frameRate);
  assertEquals(1, header.frameCount);
});

// -0000_00010-_0000_0000
// -000_00010_0-000_0000
Deno.test("parseFillStyleArray - empty", () => {
  const buffer = new Uint8Array([0]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseFillStyleArray(bitstream, "Shape1");
  assertEquals(0, result.length);
});

Deno.test("parseFillStyleArray - solid rgb fill", () => {
  const buffer = new Uint8Array([0x01, 0x00, 0x12, 0x34, 0x56]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseFillStyleArray(bitstream, "Shape1");

  assertEquals(
    [{ type: "SOLID", color: { red: 0x12, green: 0x34, blue: 0x56 } }],
    result,
  );
});

Deno.test("parseFillStyleArray - solid rgba fill", () => {
  const buffer = new Uint8Array([0x01, 0x00, 0x12, 0x34, 0x56, 0x78]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseFillStyleArray(bitstream, "Shape3");

  assertEquals(
    [
      {
        type: "SOLID",
        color: { red: 0x12, green: 0x34, blue: 0x56, alpha: 0x78 },
      },
    ],
    result,
  );
});

Deno.test("parseFillStyleArray - unsupported gradient fill throws", () => {
  const buffer = new Uint8Array([0x01, 0x10]);
  const bitstream = Bitstream.fromBuffer(buffer);

  let thrown;

  try {
    parseFillStyleArray(bitstream, "Shape1");
  } catch (error) {
    thrown = error;
  }

  assertEquals(
    "parseFillStyleArray: unsupported gradient fill style type: LINEAR_GRADIENT",
    thrown,
  );
});

Deno.test("parseFillStyleArray - bitmap fill", () => {
  const buffer = new Uint8Array([
    0x01, 0x43, 0x34, 0x12, 0b0000_0100, 0b0000_0000,
  ]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseFillStyleArray(bitstream, "Shape1");

  assertEquals(
    [
      {
        type: "NON_SMOOTHED_CLIPPED_BITMAP",
        bitmapId: 0x1234,
        bitmapMatrix: {
          scaleX: 1,
          scaleY: 1,
          rotateSkew0: 0,
          rotateSkew1: 0,
          translateX: 0,
          translateY: 0,
        },
      },
    ],
    result,
  );
});

Deno.test("parseTags - empty buffer", () => {
  assertEquals([], parseTags(new Uint8Array()));
});

Deno.test("parseTags - SetBackgroundColor short tag", () => {
  const tags = parseTags(makeShortTag(9, [1, 2, 3]));

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "SetBackgroundColor",
      color: { red: 1, green: 2, blue: 3 },
    },
    tags[0],
  );
});

Deno.test("parseTags - FileAttributes short tag", () => {
  const tags = parseTags(makeShortTag(69, [0b0110_1001, 0x00, 0x00, 0x00]));

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "FileAttributes",
      useDirectBlit: true,
      useGPU: true,
      hasMetadata: false,
      actionScript3: true,
      useNetwork: true,
    },
    tags[0],
  );
});

Deno.test("parseTags - multiple supported tags", () => {
  const buffer = new Uint8Array([
    ...makeShortTag(9, [10, 20, 30]),
    ...makeShortTag(69, [0b0000_0001, 0x00, 0x00, 0x00]),
  ]);

  const tags = parseTags(buffer);

  assertEquals(2, tags.length);
  assertEquals("SetBackgroundColor", tags[0].type);
  assertEquals("FileAttributes", tags[1].type);
});

Deno.test("parseTags - extended length tag header", () => {
  const body = [1, 2, 3, ...new Array(60).fill(0)];
  const tags = parseTags(makeLongTag(9, body));

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "SetBackgroundColor",
      color: { red: 1, green: 2, blue: 3 },
    },
    tags[0],
  );
});

Deno.test("parseTags - DefineBitsLossless2 colormapped image", () => {
  const tags = parseTags(
    makeShortTag(
      36,
      [0x34, 0x12, 0x03, 0x20, 0x00, 0x10, 0x00, 0x07, 0xaa, 0xbb, 0xcc],
    ),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "DefineBitsLossless2",
      characterId: 0x1234,
      bitmapFormat: 3,
      bitmapWidth: 0x0020,
      bitmapHeight: 0x0010,
      bitmapColorTableSize: 0x07,
      zlibBitmapData: new Uint8Array([0xaa, 0xbb, 0xcc]),
    },
    tags[0],
  );
});

Deno.test("parseTags - DefineBitsLossless2 argb image", () => {
  const tags = parseTags(
    makeShortTag(36, [0x02, 0x00, 0x05, 0x08, 0x00, 0x04, 0x00, 0xde, 0xad]),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "DefineBitsLossless2",
      characterId: 2,
      bitmapFormat: 5,
      bitmapWidth: 8,
      bitmapHeight: 4,
      bitmapColorTableSize: undefined,
      zlibBitmapData: new Uint8Array([0xde, 0xad]),
    },
    tags[0],
  );
});

Deno.test("parseTags - DefineBitsLossless colormapped image", () => {
  const tags = parseTags(
    makeShortTag(
      20,
      [0x34, 0x12, 0x03, 0x20, 0x00, 0x10, 0x00, 0x07, 0xaa, 0xbb, 0xcc],
    ),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "DefineBitsLossless",
      characterId: 0x1234,
      bitmapFormat: 3,
      bitmapWidth: 0x0020,
      bitmapHeight: 0x0010,
      bitmapColorTableSize: 0x07,
      zlibBitmapData: new Uint8Array([0xaa, 0xbb, 0xcc]),
    },
    tags[0],
  );
});

Deno.test("parseTags - DefineBitsLossless rgb image", () => {
  const tags = parseTags(
    makeShortTag(20, [0x02, 0x00, 0x05, 0x08, 0x00, 0x04, 0x00, 0xde, 0xad]),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "DefineBitsLossless",
      characterId: 2,
      bitmapFormat: 5,
      bitmapWidth: 8,
      bitmapHeight: 4,
      bitmapColorTableSize: undefined,
      zlibBitmapData: new Uint8Array([0xde, 0xad]),
    },
    tags[0],
  );
});

Deno.test("parseTags - PlaceObject2 minimal", () => {
  const tags = parseTags(makeShortTag(26, [0x00, 0x34, 0x12]));

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "PlaceObject2",
      hasClipActions: false,
      hasClipDepth: false,
      hasName: false,
      hasRatio: false,
      hasColorTransform: false,
      hasMatrix: false,
      hasCharacter: false,
      move: false,
      depth: 0x1234,
      characterId: undefined,
      matrix: undefined,
      ratio: undefined,
      name: undefined,
      clipDepth: undefined,
    },
    tags[0],
  );
});

Deno.test("parseTags - PlaceObject2 with optional fields", () => {
  const tags = parseTags(
    makeShortTag(
      26,
      [0x36, 0x02, 0x00, 0x34, 0x12, 0x00, 0x07, 0x00, 0x61, 0x00, 0x09, 0x00],
    ),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "PlaceObject2",
      hasClipActions: false,
      hasClipDepth: false,
      hasName: true,
      hasRatio: true,
      hasColorTransform: false,
      hasMatrix: true,
      hasCharacter: true,
      move: false,
      depth: 2,
      characterId: 0x1234,
      matrix: {
        scaleX: 1,
        scaleY: 1,
        rotateSkew0: 0,
        rotateSkew1: 0,
        translateX: 0,
        translateY: 0,
      },
      ratio: 7,
      name: "a",
      clipDepth: undefined,
    },
    tags[0],
  );
});

Deno.test("parseTags - DefineShape4 minimal", () => {
  const tags = parseTags(
    makeShortTag(
      83,
      [
        0x34, 0x12, 0x10, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
      ],
    ),
  );

  assertEquals(1, tags.length);
  assertEquals("DefineShape4", tags[0].type);
  assertEquals(0x1234, tags[0].id);
  assertEquals(false, tags[0].usesFillWindingRule);
  assertEquals(false, tags[0].usesNonScalingStrokes);
  assertEquals(false, tags[0].usesScalingStrokes);
});

Deno.test("parseTags - DoABC", () => {
  const tags = parseTags(
    makeShortTag(
      82,
      [0x01, 0x00, 0x00, 0x00, 0x61, 0x62, 0x63, 0x00, 0xde, 0xad],
    ),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "DoABC",
      flags: 1,
      name: "abc",
      abcData: new Uint8Array([0xde, 0xad]),
    },
    tags[0],
  );
});

Deno.test("parseTags - ShowFrame", () => {
  const tags = parseTags(makeShortTag(1, []));

  assertEquals(1, tags.length);
  assertEquals({ type: "ShowFrame" }, tags[0]);
});

Deno.test("parseTags - SymbolClass single symbol", () => {
  // Tag 76: NumSymbols=1, Tag=0x0005, Name="MyClass\0"
  const tags = parseTags(
    makeShortTag(76, [
      0x01,
      0x00, // NumSymbols = 1
      0x05,
      0x00, // Tag1 = 5
      0x4d,
      0x79,
      0x43,
      0x6c,
      0x61,
      0x73,
      0x73,
      0x00, // "MyClass\0"
    ]),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "SymbolClass",
      symbols: [{ tag: 5, name: "MyClass" }],
    },
    tags[0],
  );
});

Deno.test("parseTags - SymbolClass multiple symbols with root class", () => {
  // Tag 76: NumSymbols=2, first with tag=0 (root class), second with tag=1
  const tags = parseTags(
    makeShortTag(76, [
      0x02,
      0x00, // NumSymbols = 2
      0x00,
      0x00, // Tag1 = 0 (main timeline)
      0x41,
      0x70,
      0x70,
      0x00, // "App\0"
      0x01,
      0x00, // Tag2 = 1
      0x42,
      0x00, // "B\0"
    ]),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "SymbolClass",
      symbols: [
        { tag: 0, name: "App" },
        { tag: 1, name: "B" },
      ],
    },
    tags[0],
  );
});

Deno.test("parseTags - unknown tag throws", () => {
  let thrown;

  try {
    parseTags(makeShortTag(3, []));
  } catch (error) {
    thrown = error;
  }

  assertEquals("parseTags: encountered unknown tag: 3", thrown);
});

// --- parseLineStyleArray ---

Deno.test("parseLineStyleArray - empty", () => {
  const buffer = new Uint8Array([0x00]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseLineStyleArray(bitstream, "Shape1");
  assertEquals(0, result.length);
});

Deno.test("parseLineStyleArray - single RGB line style", () => {
  // count=1, width=0x0014 (20 twips), color=RGB(0xAA, 0xBB, 0xCC)
  const buffer = new Uint8Array([
    0x01,
    0x14,
    0x00, // width LE
    0xaa,
    0xbb,
    0xcc, // RGB
  ]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseLineStyleArray(bitstream, "Shape1");

  assertEquals(1, result.length);
  assertEquals(
    { width: 0x0014, color: { red: 0xaa, green: 0xbb, blue: 0xcc } },
    result[0],
  );
});

Deno.test("parseLineStyleArray - single RGBA line style (Shape3)", () => {
  // count=1, width=0x000A (10 twips), color=RGBA(0x11, 0x22, 0x33, 0x44)
  const buffer = new Uint8Array([
    0x01,
    0x0a,
    0x00, // width LE
    0x11,
    0x22,
    0x33,
    0x44, // RGBA
  ]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseLineStyleArray(bitstream, "Shape3");

  assertEquals(1, result.length);
  assertEquals(
    {
      width: 0x000a,
      color: { red: 0x11, green: 0x22, blue: 0x33, alpha: 0x44 },
    },
    result[0],
  );
});

Deno.test("parseLineStyleArray - multiple line styles", () => {
  // count=2
  const buffer = new Uint8Array([
    0x02,
    0x01,
    0x00,
    0xff,
    0x00,
    0x00, // width=1, red
    0x02,
    0x00,
    0x00,
    0xff,
    0x00, // width=2, green
  ]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseLineStyleArray(bitstream, "Shape1");

  assertEquals(2, result.length);
  assertEquals(0x0001, result[0].width);
  assertEquals(0x0002, result[1].width);
});

// --- DefineShape / DefineShape2 / DefineShape3 ---

// Helper: build a minimal DefineShape body.
// id (U16 LE) + RECT(nBits=0 → 5 zero bits + 3 padding) + parseShapeWithStyle:
//   fillStyleCount=0 + lineStyleCount=0 + numFillBits(4)=0 + numLineBits(4)=0
//   + EndShape(6 zero bits) + 2 padding bits
const makeMinimalShapeBody = (id: number): number[] => [
  id & 0xff,
  (id >> 8) & 0xff, // id U16 LE
  0x00, // RECT: nBits=0 (00000) + 3 padding
  0x00, // fillStyleCount = 0
  0x00, // lineStyleCount = 0
  0x00, // numFillBits=0, numLineBits=0
  0x00, // EndShape (000000) + 2 padding
];

Deno.test("parseTags - DefineShape minimal", () => {
  const tags = parseTags(makeShortTag(2, makeMinimalShapeBody(0x0001)));

  assertEquals(1, tags.length);
  assertEquals("DefineShape", tags[0].type);
  assertEquals(0x0001, (tags[0] as { id: number }).id);
});

Deno.test("parseTags - DefineShape2 minimal", () => {
  const tags = parseTags(makeShortTag(22, makeMinimalShapeBody(0x0002)));

  assertEquals(1, tags.length);
  assertEquals("DefineShape2", tags[0].type);
  assertEquals(0x0002, (tags[0] as { id: number }).id);
});

Deno.test("parseTags - DefineShape3 minimal", () => {
  const tags = parseTags(makeShortTag(32, makeMinimalShapeBody(0x0003)));

  assertEquals(1, tags.length);
  assertEquals("DefineShape3", tags[0].type);
  assertEquals(0x0003, (tags[0] as { id: number }).id);
});

Deno.test("parseTags - DefineShape with solid fill and line style", () => {
  const body = [
    0x05,
    0x00, // id = 5
    0x00, // RECT: nBits=0 + padding
    // fillStyleArray: count=1, SOLID RGB (0x00), color=FF0000
    0x01,
    0x00,
    0xff,
    0x00,
    0x00,
    // lineStyleArray: count=1, width=20 (0x14, 0x00), color=00FF00
    0x01,
    0x14,
    0x00,
    0x00,
    0xff,
    0x00,
    // numFillBits=1, numLineBits=1
    0x11,
    // EndShape: 0 bit (non-edge) + 00000 (flags=0) = 6 zero bits + 2 pad
    0x00,
  ];
  const tags = parseTags(makeShortTag(2, body));

  assertEquals(1, tags.length);
  assertEquals("DefineShape", tags[0].type);
  const tag = tags[0] as {
    id: number;
    shapes: {
      fillStyles: {
        type: string;
        color: { red: number; green: number; blue: number };
      }[];
      lineStyles: {
        width: number;
        color: { red: number; green: number; blue: number };
      }[];
    };
  };
  assertEquals(5, tag.id);
  assertEquals(1, tag.shapes.fillStyles.length);
  assertEquals("SOLID", tag.shapes.fillStyles[0].type);
  assertEquals(
    { red: 0xff, green: 0x00, blue: 0x00 },
    tag.shapes.fillStyles[0].color,
  );
  assertEquals(1, tag.shapes.lineStyles.length);
  assertEquals(0x14, tag.shapes.lineStyles[0].width);
  assertEquals(
    { red: 0x00, green: 0xff, blue: 0x00 },
    tag.shapes.lineStyles[0].color,
  );
});

// --- parseHeader bad signature ---

Deno.test("parseHeader - bad signature throws", () => {
  // "FXS" instead of "FWS"
  const buffer = new Uint8Array([
    0x46,
    0x58,
    0x53, // "FXS"
    0x08, // version
    0x00,
    0x00,
    0x00,
    0x00, // fileLength
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // RECT
    0x00, // frameRate
    0x00,
    0x00, // frameCount
  ]);

  let thrown;
  try {
    parseHeader(buffer);
  } catch (error) {
    thrown = error;
  }

  assertEquals("invalid swf file", thrown);
});

// --- parseDefineBitsLossless unsupported bitmap format ---

Deno.test(
  "parseTags - DefineBitsLossless unsupported bitmap format throws",
  () => {
    // format=2 is not in [3, 4, 5] for DefineBitsLossless
    const body = [
      0x01,
      0x00, // characterId = 1
      0x02, // bitmapFormat = 2 (unsupported)
      0x08,
      0x00, // bitmapWidth = 8
      0x04,
      0x00, // bitmapHeight = 4
      0xde,
      0xad, // data
    ];

    let thrown;
    try {
      parseTags(makeShortTag(20, body));
    } catch (error) {
      thrown = error;
    }

    assertEquals("DefineBitsLossless: unsupported bitmap format 2", thrown);
  },
);

Deno.test(
  "parseTags - DefineBitsLossless2 unsupported bitmap format throws",
  () => {
    // format=4 is not in [3, 5] for DefineBitsLossless2
    const body = [
      0x01,
      0x00, // characterId = 1
      0x04, // bitmapFormat = 4 (unsupported for Lossless2)
      0x08,
      0x00, // bitmapWidth = 8
      0x04,
      0x00, // bitmapHeight = 4
      0xde,
      0xad, // data
    ];

    let thrown;
    try {
      parseTags(makeShortTag(36, body));
    } catch (error) {
      thrown = error;
    }

    assertEquals("DefineBitsLossless2: unsupported bitmap format 4", thrown);
  },
);

// --- parseFillStyleArray extended count (0xff) ---

Deno.test("parseFillStyleArray - extended count 0xff", () => {
  // count byte = 0xFF, then U16 LE count = 2, then 2 SOLID RGB fills
  const buffer = new Uint8Array([
    0xff,
    0x02,
    0x00, // extended count = 2
    0x00,
    0xff,
    0x00,
    0x00, // SOLID, red
    0x00,
    0x00,
    0xff,
    0x00, // SOLID, green
  ]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseFillStyleArray(bitstream, "Shape1");

  assertEquals(2, result.length);
  assertEquals(
    { type: "SOLID", color: { red: 0xff, green: 0x00, blue: 0x00 } },
    result[0],
  );
  assertEquals(
    { type: "SOLID", color: { red: 0x00, green: 0xff, blue: 0x00 } },
    result[1],
  );
});

// --- PlaceObject2 clipDepth and move flags ---

Deno.test("parseTags - PlaceObject2 with clipDepth", () => {
  // flags: hasClipDepth (0x40) = 0b0100_0000
  const tags = parseTags(
    makeShortTag(26, [
      0x40, // flags: hasClipDepth
      0x05,
      0x00, // depth = 5
      0x0a,
      0x00, // clipDepth = 10
    ]),
  );

  assertEquals(1, tags.length);
  const tag = tags[0] as {
    type: string;
    hasClipDepth: boolean;
    clipDepth: number;
    depth: number;
    move: boolean;
  };
  assertEquals("PlaceObject2", tag.type);
  assertEquals(true, tag.hasClipDepth);
  assertEquals(10, tag.clipDepth);
  assertEquals(5, tag.depth);
  assertEquals(false, tag.move);
});

Deno.test("parseTags - PlaceObject2 with move flag", () => {
  // flags: move (0x01) = 0b0000_0001
  const tags = parseTags(
    makeShortTag(26, [
      0x01, // flags: move
      0x03,
      0x00, // depth = 3
    ]),
  );

  assertEquals(1, tags.length);
  const tag = tags[0] as {
    type: string;
    move: boolean;
    hasCharacter: boolean;
    depth: number;
  };
  assertEquals("PlaceObject2", tag.type);
  assertEquals(true, tag.move);
  assertEquals(false, tag.hasCharacter);
  assertEquals(3, tag.depth);
});

Deno.test("parseTags - PlaceObject2 with move and clipDepth", () => {
  // flags: hasClipDepth (0x40) | move (0x01) = 0x41
  const tags = parseTags(
    makeShortTag(26, [
      0x41, // flags: hasClipDepth + move
      0x02,
      0x00, // depth = 2
      0x08,
      0x00, // clipDepth = 8
    ]),
  );

  assertEquals(1, tags.length);
  const tag = tags[0] as {
    type: string;
    move: boolean;
    hasClipDepth: boolean;
    clipDepth: number;
    depth: number;
  };
  assertEquals("PlaceObject2", tag.type);
  assertEquals(true, tag.move);
  assertEquals(true, tag.hasClipDepth);
  assertEquals(8, tag.clipDepth);
  assertEquals(2, tag.depth);
});
