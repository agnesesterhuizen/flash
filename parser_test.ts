import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { parseFillStyleArray, parseHeader, parseTags } from "./parser.ts";
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
    0x01,
    0x43,
    0x34,
    0x12,
    0b0000_0100,
    0b0000_0000,
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
        0x34,
        0x12,
        0x10,
        0x00,
        0x10,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
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
