import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";
import {
  parseFillStyleArray,
  parseHeader,
  parseLineStyleArray,
  parseMatrixRecord,
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

// --- parseHeader synthetic spec tests (spec p.26) ---
// SWF header layout:
//   Signature  UI8[3]  "FWS" | "CWS" | "ZWS"
//   Version    UI8     file version
//   FileLength UI32    total byte length (uncompressed)
//   FrameSize  RECT    variable-size, byte-aligned
//   FrameRate  UI16    8.8 fixed point (low=fraction, high=integer)
//   FrameCount UI16

Deno.test("parseHeader - FWS, nBits=5 RECT (small frame size)", () => {
  // Spec p.26: FWS signature, RECT with nBits=5
  // Signature: "FWS" = [0x46, 0x57, 0x53]
  // Version: 6
  // FileLength: 100 = 0x64
  // RECT nBits=5, xMin=0, xMax=10, yMin=0, yMax=8
  //   nBits=5:  00101
  //   xMin=0:   00000
  //   xMax=10:  01010
  //   yMin=0:   00000
  //   yMax=8:   01000
  //   Bits: 00101_00000_01010_00000_01000 (25 bits → 4 bytes)
  //   Byte 0: 00101000 = 0x28
  //   Byte 1: 00010100 = 0x14
  //   Byte 2: 00000100 = 0x04
  //   Byte 3: 00000000 = 0x00  (7 padding bits)
  // FrameRate: 24.0 fps → 8.8 = 0x1800 → LE [0x00, 0x18]
  // FrameCount: 10 → LE [0x0A, 0x00]
  const buffer = new Uint8Array([
    0x46,
    0x57,
    0x53, // "FWS"
    0x06, // version 6
    0x64,
    0x00,
    0x00,
    0x00, // fileLength 100
    0x28,
    0x14,
    0x04,
    0x00, // RECT (4 bytes, nBits=5)
    0x00,
    0x18, // frameRate 24.0 (8.8 fixed)
    0x0a,
    0x00, // frameCount 10
  ]);

  const header = parseHeader(buffer);

  assertEquals("F", header.compressionType);
  assertEquals(6, header.version);
  assertEquals(100, header.fileLength);
  assertEquals(5, header.frameSize.nBits);
  assertEquals(0, header.frameSize.xMin);
  assertEquals(10, header.frameSize.xMax);
  assertEquals(0, header.frameSize.yMin);
  assertEquals(8, header.frameSize.yMax);
  assertEquals(24, header.frameRate);
  assertEquals(10, header.frameCount);
});

Deno.test("parseHeader - FWS, nBits=11 RECT (medium frame size)", () => {
  // Spec p.26: FWS signature, RECT with nBits=11
  // RECT nBits=11, xMin=0, xMax=800, yMin=0, yMax=600
  //   nBits=11: 01011
  //   xMin=0:   00000000000
  //   xMax=800: 01100100000
  //   yMin=0:   00000000000
  //   yMax=600: 01001011000
  //   Total: 5 + 44 = 49 bits → 7 bytes
  //   Byte 0: 01011000 = 0x58
  //   Byte 1: 00000000 = 0x00
  //   Byte 2: 01100100 = 0x64
  //   Byte 3: 00000000 = 0x00
  //   Byte 4: 00000001 = 0x01
  //   Byte 5: 00101100 = 0x2C
  //   Byte 6: 00000000 = 0x00  (7 padding bits)
  // FrameRate: 30.0 fps → 8.8 = 0x1E00 → LE [0x00, 0x1E]
  // FrameCount: 5
  const buffer = new Uint8Array([
    0x46,
    0x57,
    0x53, // "FWS"
    0x0a, // version 10
    0xc8,
    0x00,
    0x00,
    0x00, // fileLength 200
    0x58,
    0x00,
    0x64,
    0x00,
    0x01,
    0x2c,
    0x00, // RECT (7 bytes, nBits=11)
    0x00,
    0x1e, // frameRate 30.0 (8.8 fixed)
    0x05,
    0x00, // frameCount 5
  ]);

  const header = parseHeader(buffer);

  assertEquals("F", header.compressionType);
  assertEquals(10, header.version);
  assertEquals(200, header.fileLength);
  assertEquals(11, header.frameSize.nBits);
  assertEquals(0, header.frameSize.xMin);
  assertEquals(800, header.frameSize.xMax);
  assertEquals(0, header.frameSize.yMin);
  assertEquals(600, header.frameSize.yMax);
  assertEquals(30, header.frameRate);
  assertEquals(5, header.frameCount);
});

Deno.test("parseHeader - CWS signature (zlib compressed)", () => {
  // Spec p.26: "C" = zlib compression, SWF 6+. First 8 bytes uncompressed,
  // rest compressed. Parser reads compressionType but doesn't decompress yet,
  // so we provide valid uncompressed data after byte 8 for testing.
  // Same RECT as nBits=5 test above.
  const buffer = new Uint8Array([
    0x43,
    0x57,
    0x53, // "CWS"
    0x06, // version 6
    0x64,
    0x00,
    0x00,
    0x00, // fileLength 100 (decompressed size)
    0x28,
    0x14,
    0x04,
    0x00, // RECT (nBits=5)
    0x00,
    0x18, // frameRate 24.0
    0x0a,
    0x00, // frameCount 10
  ]);

  const header = parseHeader(buffer);

  assertEquals("C", header.compressionType);
  assertEquals(6, header.version);
  assertEquals(100, header.fileLength);
  assertEquals(24, header.frameRate);
  assertEquals(10, header.frameCount);
});

Deno.test("parseHeader - ZWS signature (LZMA compressed)", () => {
  // Spec p.26: "Z" = LZMA compression, SWF 13+. Same treatment as CWS.
  const buffer = new Uint8Array([
    0x5a,
    0x57,
    0x53, // "ZWS"
    0x0d, // version 13
    0x00,
    0x01,
    0x00,
    0x00, // fileLength 256 (decompressed size)
    0x28,
    0x14,
    0x04,
    0x00, // RECT (nBits=5)
    0x00,
    0x18, // frameRate 24.0
    0x01,
    0x00, // frameCount 1
  ]);

  const header = parseHeader(buffer);

  assertEquals("Z", header.compressionType);
  assertEquals(13, header.version);
  assertEquals(256, header.fileLength);
  assertEquals(24, header.frameRate);
  assertEquals(1, header.frameCount);
});

Deno.test("parseHeader - fractional frame rate (8.8 fixed point)", () => {
  // Spec p.26: FrameRate is 8.8 fixed point — high byte is integer, low byte
  // is 1/256 fraction. E.g. 29 + 248/256 = 29.96875 fps.
  // 8.8 value = (29 << 8) | 248 = 0x1DF8 → LE [0xF8, 0x1D]
  const buffer = new Uint8Array([
    0x46,
    0x57,
    0x53, // "FWS"
    0x08, // version 8
    0x32,
    0x00,
    0x00,
    0x00, // fileLength 50
    0x28,
    0x14,
    0x04,
    0x00, // RECT (nBits=5)
    0xf8,
    0x1d, // frameRate 29.96875 (8.8: int=29, frac=248/256)
    0x01,
    0x00, // frameCount 1
  ]);

  const header = parseHeader(buffer);

  assertEquals("F", header.compressionType);
  assertEquals(29.96875, header.frameRate);
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
    "parseFillStyle: unsupported gradient fill style type: LINEAR_GRADIENT",
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
      colorTransform: undefined,
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
      colorTransform: undefined,
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

// --- LINESTYLE2 (Shape4) ---

Deno.test(
  "parseLineStyleArray - LINESTYLE2 basic round caps/joins with RGBA color",
  () => {
    // count=1, width=20 (UI16 LE), flags=0x0000 (all defaults), RGBA color
    //
    // Flags (16 bits):
    //   StartCapStyle  UB[2] = 00 (round)
    //   JoinStyle      UB[2] = 00 (round)
    //   HasFillFlag    UB[1] = 0
    //   NoHScaleFlag   UB[1] = 0
    //   NoVScaleFlag   UB[1] = 0
    //   PixelHintingFlag UB[1] = 0
    //   Reserved       UB[5] = 00000
    //   NoClose        UB[1] = 0
    //   EndCapStyle    UB[2] = 00 (round)
    //   → 00000000 00000000 = 0x00 0x00
    //
    // Color RGBA: R=0xFF G=0x00 B=0x00 A=0x80
    const buffer = new Uint8Array([
      0x01, // count = 1
      0x14,
      0x00, // width = 20 (UI16 LE)
      0x00,
      0x00, // flags: all zeros
      0xff,
      0x00,
      0x00,
      0x80, // RGBA(255, 0, 0, 128)
    ]);
    const bitstream = Bitstream.fromBuffer(buffer);

    const result = parseLineStyleArray(bitstream, "Shape4");

    assertEquals(1, result.length);
    const ls = result[0] as any;
    assertEquals(20, ls.width);
    assertEquals(0, ls.startCapStyle);
    assertEquals(0, ls.joinStyle);
    assertEquals(false, ls.hasFillFlag);
    assertEquals(false, ls.noHScaleFlag);
    assertEquals(false, ls.noVScaleFlag);
    assertEquals(false, ls.pixelHintingFlag);
    assertEquals(false, ls.noClose);
    assertEquals(0, ls.endCapStyle);
    assertEquals(undefined, ls.miterLimitFactor);
    assertEquals({ red: 0xff, green: 0x00, blue: 0x00, alpha: 0x80 }, ls.color);
  },
);

Deno.test(
  "parseLineStyleArray - LINESTYLE2 square caps, bevel join, noClose, pixelHinting",
  () => {
    // count=1, width=100 (UI16 LE)
    //
    // Flags (16 bits):
    //   StartCapStyle  UB[2] = 10 (square)
    //   JoinStyle      UB[2] = 01 (bevel)
    //   HasFillFlag    UB[1] = 0
    //   NoHScaleFlag   UB[1] = 1
    //   NoVScaleFlag   UB[1] = 1
    //   PixelHintingFlag UB[1] = 1
    //   Reserved       UB[5] = 00000
    //   NoClose        UB[1] = 1
    //   EndCapStyle    UB[2] = 10 (square)
    //   → 10010111 00000110 = 0x97 0x06
    //
    // Color RGBA: R=0x11 G=0x22 B=0x33 A=0xFF
    const buffer = new Uint8Array([
      0x01, // count = 1
      0x64,
      0x00, // width = 100 (UI16 LE)
      0x97,
      0x06, // flags
      0x11,
      0x22,
      0x33,
      0xff, // RGBA(17, 34, 51, 255)
    ]);
    const bitstream = Bitstream.fromBuffer(buffer);

    const result = parseLineStyleArray(bitstream, "Shape4");

    assertEquals(1, result.length);
    const ls = result[0] as any;
    assertEquals(100, ls.width);
    assertEquals(2, ls.startCapStyle); // square
    assertEquals(1, ls.joinStyle); // bevel
    assertEquals(false, ls.hasFillFlag);
    assertEquals(true, ls.noHScaleFlag);
    assertEquals(true, ls.noVScaleFlag);
    assertEquals(true, ls.pixelHintingFlag);
    assertEquals(true, ls.noClose);
    assertEquals(2, ls.endCapStyle); // square
    assertEquals(undefined, ls.miterLimitFactor);
    assertEquals({ red: 0x11, green: 0x22, blue: 0x33, alpha: 0xff }, ls.color);
  },
);

Deno.test(
  "parseLineStyleArray - LINESTYLE2 miter join with miterLimitFactor",
  () => {
    // count=1, width=40 (UI16 LE)
    //
    // Flags (16 bits):
    //   StartCapStyle  UB[2] = 00 (round)
    //   JoinStyle      UB[2] = 10 (miter)
    //   HasFillFlag    UB[1] = 0
    //   NoHScaleFlag   UB[1] = 0
    //   NoVScaleFlag   UB[1] = 0
    //   PixelHintingFlag UB[1] = 0
    //   Reserved       UB[5] = 00000
    //   NoClose        UB[1] = 0
    //   EndCapStyle    UB[2] = 00 (round)
    //   → 00100000 00000000 = 0x20 0x00
    //
    // MiterLimitFactor: UI16 LE = 0x0300 (8.8 fixed-point 3.0)
    // Color RGBA: R=0x00 G=0xFF B=0x00 A=0xC0
    const buffer = new Uint8Array([
      0x01, // count = 1
      0x28,
      0x00, // width = 40 (UI16 LE)
      0x20,
      0x00, // flags: miter join
      0x00,
      0x03, // miterLimitFactor = 0x0300 (LE)
      0x00,
      0xff,
      0x00,
      0xc0, // RGBA(0, 255, 0, 192)
    ]);
    const bitstream = Bitstream.fromBuffer(buffer);

    const result = parseLineStyleArray(bitstream, "Shape4");

    assertEquals(1, result.length);
    const ls = result[0] as any;
    assertEquals(40, ls.width);
    assertEquals(0, ls.startCapStyle);
    assertEquals(2, ls.joinStyle); // miter
    assertEquals(false, ls.hasFillFlag);
    assertEquals(0x0300, ls.miterLimitFactor); // 8.8 fixed-point = 3.0
    assertEquals({ red: 0x00, green: 0xff, blue: 0x00, alpha: 0xc0 }, ls.color);
  },
);

Deno.test(
  "parseLineStyleArray - LINESTYLE2 hasFillFlag with solid fill",
  () => {
    // count=1, width=50 (UI16 LE)
    //
    // Flags (16 bits):
    //   StartCapStyle  UB[2] = 01 (no cap)
    //   JoinStyle      UB[2] = 00 (round)
    //   HasFillFlag    UB[1] = 1
    //   NoHScaleFlag   UB[1] = 0
    //   NoVScaleFlag   UB[1] = 0
    //   PixelHintingFlag UB[1] = 0
    //   Reserved       UB[5] = 00000
    //   NoClose        UB[1] = 0
    //   EndCapStyle    UB[2] = 01 (no cap)
    //   → 01001000 00000001 = 0x48 0x01
    //
    // FillType (single FILLSTYLE, NOT FILLSTYLEARRAY):
    //   TypeCode UI8 = 0x00 (SOLID)
    //   Color RGBA: R=0xAA G=0xBB B=0xCC A=0xDD
    const buffer = new Uint8Array([
      0x01, // count = 1
      0x32,
      0x00, // width = 50 (UI16 LE)
      0x48,
      0x01, // flags: hasFillFlag=1, no caps
      0x00, // FILLSTYLE type = SOLID
      0xaa,
      0xbb,
      0xcc,
      0xdd, // RGBA(170, 187, 204, 221)
    ]);
    const bitstream = Bitstream.fromBuffer(buffer);

    const result = parseLineStyleArray(bitstream, "Shape4");

    assertEquals(1, result.length);
    const ls = result[0] as any;
    assertEquals(50, ls.width);
    assertEquals(1, ls.startCapStyle); // no cap
    assertEquals(0, ls.joinStyle); // round
    assertEquals(true, ls.hasFillFlag);
    assertEquals(1, ls.endCapStyle); // no cap
    assertEquals(undefined, ls.color);
    assertEquals(
      {
        type: "SOLID",
        color: { red: 0xaa, green: 0xbb, blue: 0xcc, alpha: 0xdd },
      },
      ls.fillType,
    );
  },
);

Deno.test("parseLineStyleArray - LINESTYLE2 multiple styles", () => {
  // count=2:
  //   Style 1: width=10, all-default flags, color RGBA(0x10,0x20,0x30,0x40)
  //   Style 2: width=30, no-cap start/end, miter join, miterLimit=0x0200 (2.0),
  //            color RGBA(0x50,0x60,0x70,0x80)
  //
  // Style 1 flags: 00000000 00000000 = 0x00 0x00
  // Style 2 flags:
  //   StartCapStyle  UB[2] = 01 (no cap)
  //   JoinStyle      UB[2] = 10 (miter)
  //   HasFillFlag    UB[1] = 0
  //   NoHScaleFlag   UB[1] = 0
  //   NoVScaleFlag   UB[1] = 0
  //   PixelHintingFlag UB[1] = 0
  //   Reserved       UB[5] = 00000
  //   NoClose        UB[1] = 0
  //   EndCapStyle    UB[2] = 01 (no cap)
  //   → 01100000 00000001 = 0x60 0x01
  const buffer = new Uint8Array([
    0x02, // count = 2
    // Style 1
    0x0a,
    0x00, // width = 10
    0x00,
    0x00, // flags: all defaults
    0x10,
    0x20,
    0x30,
    0x40, // RGBA
    // Style 2
    0x1e,
    0x00, // width = 30
    0x60,
    0x01, // flags: no-cap, miter join
    0x00,
    0x02, // miterLimitFactor = 0x0200 (LE) = 2.0
    0x50,
    0x60,
    0x70,
    0x80, // RGBA
  ]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseLineStyleArray(bitstream, "Shape4");

  assertEquals(2, result.length);

  const ls1 = result[0] as any;
  assertEquals(10, ls1.width);
  assertEquals(0, ls1.joinStyle);
  assertEquals(undefined, ls1.miterLimitFactor);
  assertEquals({ red: 0x10, green: 0x20, blue: 0x30, alpha: 0x40 }, ls1.color);

  const ls2 = result[1] as any;
  assertEquals(30, ls2.width);
  assertEquals(2, ls2.joinStyle); // miter
  assertEquals(1, ls2.startCapStyle); // no cap
  assertEquals(1, ls2.endCapStyle); // no cap
  assertEquals(0x0200, ls2.miterLimitFactor); // 8.8 = 2.0
  assertEquals({ red: 0x50, green: 0x60, blue: 0x70, alpha: 0x80 }, ls2.color);
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

// --- DefineShape3 RGBA fills ---
// Spec p.133: DefineShape3 extends DefineShape2 by using RGBA instead of RGB
// in all color fields (FILLSTYLE solid color, LINESTYLE color).

Deno.test(
  "parseTags - DefineShape3 single RGBA solid fill and RGBA line style",
  () => {
    // DefineShape3 (tag code 32)
    // ShapeId = 0x0007 (UI16 LE)
    // ShapeBounds = RECT with Nbits=0 (empty)
    //   00000 + 3 padding bits → 0x00
    // SHAPEWITHSTYLE:
    //   FillStyleArray:
    //     count = 1 (UI8)
    //     FILLSTYLE[0]:
    //       type = 0x00 (SOLID)
    //       color = RGBA(0xAA, 0xBB, 0xCC, 0x80) — 4 bytes for Shape3
    //   LineStyleArray:
    //     count = 1 (UI8)
    //     LINESTYLE[0]:
    //       width = 0x0014 (20 twips, UI16 LE)
    //       color = RGBA(0x11, 0x22, 0x33, 0xFF) — 4 bytes for Shape3
    //   NumFillBits = 1 (UB[4])
    //   NumLineBits = 1 (UB[4])
    //     → 0x11
    //   ShapeRecords:
    //     EndShape: TypeFlag=0 (UB[1]) + flags=00000 (UB[5]) = 6 zero bits + 2 pad
    //     → 0x00
    const body = [
      0x07,
      0x00, // id = 7 (UI16 LE)
      0x00, // RECT: nBits=0 + padding
      // FillStyleArray
      0x01, // count = 1
      0x00, // SOLID fill type
      0xaa,
      0xbb,
      0xcc,
      0x80, // RGBA(170, 187, 204, 128)
      // LineStyleArray
      0x01, // count = 1
      0x14,
      0x00, // width = 20 (UI16 LE)
      0x11,
      0x22,
      0x33,
      0xff, // RGBA(17, 34, 51, 255)
      // NumFillBits=1, NumLineBits=1
      0x11,
      // EndShape (6 zero bits + 2 padding)
      0x00,
    ];
    const tags = parseTags(makeShortTag(32, body));

    assertEquals(1, tags.length);
    assertEquals("DefineShape3", tags[0].type);
    const tag = tags[0] as {
      id: number;
      shapes: {
        fillStyles: {
          type: string;
          color: { red: number; green: number; blue: number; alpha: number };
        }[];
        lineStyles: {
          width: number;
          color: { red: number; green: number; blue: number; alpha: number };
        }[];
        numFillBits: number;
        numLineBits: number;
      };
    };
    assertEquals(7, tag.id);
    // Fill style: RGBA solid
    assertEquals(1, tag.shapes.fillStyles.length);
    assertEquals("SOLID", tag.shapes.fillStyles[0].type);
    assertEquals(
      { red: 0xaa, green: 0xbb, blue: 0xcc, alpha: 0x80 },
      tag.shapes.fillStyles[0].color,
    );
    // Line style: RGBA color
    assertEquals(1, tag.shapes.lineStyles.length);
    assertEquals(0x14, tag.shapes.lineStyles[0].width);
    assertEquals(
      { red: 0x11, green: 0x22, blue: 0x33, alpha: 0xff },
      tag.shapes.lineStyles[0].color,
    );
    assertEquals(1, tag.shapes.numFillBits);
    assertEquals(1, tag.shapes.numLineBits);
  },
);

Deno.test("parseTags - DefineShape3 multiple RGBA solid fills", () => {
  // DefineShape3 (tag code 32) with 2 solid RGBA fills, 0 line styles
  //
  // ShapeId = 0x0042 (UI16 LE)
  // ShapeBounds = RECT with Nbits=0 → 0x00
  // SHAPEWITHSTYLE:
  //   FillStyleArray:
  //     count = 2 (UI8)
  //     FILLSTYLE[0]: type=0x00 (SOLID), RGBA(0xFF, 0x00, 0x00, 0xFF) — opaque red
  //     FILLSTYLE[1]: type=0x00 (SOLID), RGBA(0x00, 0xFF, 0x00, 0x40) — translucent green
  //   LineStyleArray:
  //     count = 0 (UI8)
  //   NumFillBits = 2 (need 2 bits for indices 0-2), NumLineBits = 0
  //     → 0x20
  //   EndShape → 0x00
  const body = [
    0x42,
    0x00, // id = 66 (UI16 LE)
    0x00, // RECT: nBits=0 + padding
    // FillStyleArray
    0x02, // count = 2
    0x00, // SOLID fill type
    0xff,
    0x00,
    0x00,
    0xff, // RGBA(255, 0, 0, 255) — opaque red
    0x00, // SOLID fill type
    0x00,
    0xff,
    0x00,
    0x40, // RGBA(0, 255, 0, 64) — translucent green
    // LineStyleArray
    0x00, // count = 0
    // NumFillBits=2, NumLineBits=0
    0x20,
    // EndShape (6 zero bits + 2 padding)
    0x00,
  ];
  const tags = parseTags(makeShortTag(32, body));

  assertEquals(1, tags.length);
  assertEquals("DefineShape3", tags[0].type);
  const tag = tags[0] as {
    id: number;
    shapes: {
      fillStyles: {
        type: string;
        color: { red: number; green: number; blue: number; alpha: number };
      }[];
      lineStyles: any[];
    };
  };
  assertEquals(66, tag.id);
  assertEquals(2, tag.shapes.fillStyles.length);
  assertEquals(
    {
      type: "SOLID",
      color: { red: 0xff, green: 0x00, blue: 0x00, alpha: 0xff },
    },
    tag.shapes.fillStyles[0],
  );
  assertEquals(
    {
      type: "SOLID",
      color: { red: 0x00, green: 0xff, blue: 0x00, alpha: 0x40 },
    },
    tag.shapes.fillStyles[1],
  );
  assertEquals(0, tag.shapes.lineStyles.length);
});

Deno.test(
  "parseTags - DefineShape3 fully transparent RGBA fill (alpha=0)",
  () => {
    // DefineShape3 with a fully transparent solid fill (alpha=0x00)
    //
    // ShapeId = 0x0001 (UI16 LE)
    // ShapeBounds = RECT with Nbits=0 → 0x00
    // SHAPEWITHSTYLE:
    //   FillStyleArray: count=1, SOLID RGBA(0x00, 0x00, 0x00, 0x00)
    //   LineStyleArray: count=0
    //   NumFillBits=1, NumLineBits=0 → 0x10
    //   EndShape → 0x00
    const body = [
      0x01,
      0x00, // id = 1 (UI16 LE)
      0x00, // RECT: nBits=0 + padding
      // FillStyleArray
      0x01, // count = 1
      0x00, // SOLID fill type
      0x00,
      0x00,
      0x00,
      0x00, // RGBA(0, 0, 0, 0) — fully transparent
      // LineStyleArray
      0x00, // count = 0
      // NumFillBits=1, NumLineBits=0
      0x10,
      // EndShape (6 zero bits + 2 padding)
      0x00,
    ];
    const tags = parseTags(makeShortTag(32, body));

    assertEquals(1, tags.length);
    assertEquals("DefineShape3", tags[0].type);
    const tag = tags[0] as {
      id: number;
      shapes: {
        fillStyles: {
          type: string;
          color: { red: number; green: number; blue: number; alpha: number };
        }[];
      };
    };
    assertEquals(1, tag.id);
    assertEquals(1, tag.shapes.fillStyles.length);
    assertEquals(
      {
        type: "SOLID",
        color: { red: 0x00, green: 0x00, blue: 0x00, alpha: 0x00 },
      },
      tag.shapes.fillStyles[0],
    );
  },
);

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

// --- PlaceObject2 with real matrix ---
// Spec p.36: PlaceObject2 with non-identity MATRIX (spec p.22)

Deno.test("parseTags - PlaceObject2 with scale + translate matrix", () => {
  // PlaceObject2 flags byte: hasMatrix(0x04) + hasCharacter(0x02) = 0x06
  // depth = 1, characterId = 5
  //
  // MATRIX (spec p.22):
  //   HasScale=1:        1                          (1 bit)
  //   NScaleBits=18:     10010                      (5 bits)
  //   ScaleX=1.5:        011000000000000000         (FB[18], 1.5×65536=98304)
  //   ScaleY=0.5:        001000000000000000         (FB[18], 0.5×65536=32768)
  //   HasRotate=0:       0                          (1 bit)
  //   NTranslateBits=8:  01000                      (5 bits)
  //   TranslateX=100:    01100100                   (SB[8])
  //   TranslateY=-50:    11001110                   (SB[8], two's complement)
  //   Total: 64 bits = 8 bytes exact
  //
  //   Byte 0: 1,1,0,0,1,0,0,1 = 0xC9
  //   Byte 1: 1,0,0,0,0,0,0,0 = 0x80
  //   Byte 2: 0x00
  //   Byte 3: 0,0,1,0,0,0,0,0 = 0x20
  //   Byte 4: 0x00
  //   Byte 5: 0,0,0,0,1,0,0,0 = 0x08
  //   Byte 6: 0,1,1,0,0,1,0,0 = 0x64
  //   Byte 7: 1,1,0,0,1,1,1,0 = 0xCE
  const tags = parseTags(
    makeShortTag(26, [
      0x06, // flags: hasMatrix + hasCharacter
      0x01,
      0x00, // depth = 1
      0x05,
      0x00, // characterId = 5
      // MATRIX: scale 1.5/0.5, translate 100/-50
      0xc9,
      0x80,
      0x00,
      0x20,
      0x00,
      0x08,
      0x64,
      0xce,
    ]),
  );

  assertEquals(1, tags.length);
  assertEquals(
    {
      type: "PlaceObject2",
      hasClipActions: false,
      hasClipDepth: false,
      hasName: false,
      hasRatio: false,
      hasColorTransform: false,
      hasMatrix: true,
      hasCharacter: true,
      move: false,
      depth: 1,
      characterId: 5,
      matrix: {
        scaleX: 1.5,
        scaleY: 0.5,
        rotateSkew0: 0,
        rotateSkew1: 0,
        translateX: 100,
        translateY: -50,
      },
      colorTransform: undefined,
      ratio: undefined,
      name: undefined,
      clipDepth: undefined,
    },
    tags[0],
  );
});

Deno.test(
  "parseTags - PlaceObject2 with scale + rotate + translate matrix",
  () => {
    // PlaceObject2 flags: hasName(0x20) + hasMatrix(0x04) + hasCharacter(0x02)
    //                     + move(0x01) = 0x27
    // depth = 3, characterId = 7, name = "Bob"
    //
    // MATRIX (spec p.22) — all fields:
    //   HasScale=1:          1                          (1 bit)
    //   NScaleBits=18:       10010                      (5 bits)
    //   ScaleX=1.5:          011000000000000000         (FB[18], 98304)
    //   ScaleY=0.5:          001000000000000000         (FB[18], 32768)
    //   HasRotate=1:         1                          (1 bit)
    //   NRotateBits=18:      10010                      (5 bits)
    //   RotateSkew0=1.0:     010000000000000000         (FB[18], 65536)
    //   RotateSkew1=-1.0:    110000000000000000         (FB[18], -65536)
    //   NTranslateBits=8:    01000                      (5 bits)
    //   TranslateX=100:      01100100                   (SB[8])
    //   TranslateY=-50:      11001110                   (SB[8], two's complement)
    //   Total: 105 bits → 14 bytes (7 bits padding)
    //
    //   Byte  0: 1,1,0,0,1,0,0,1 = 0xC9
    //   Byte  1: 1,0,0,0,0,0,0,0 = 0x80
    //   Byte  2: 0x00
    //   Byte  3: 0,0,1,0,0,0,0,0 = 0x20
    //   Byte  4: 0x00
    //   Byte  5: 0,0,1,1,0,0,1,0 = 0x32
    //   Byte  6: 0,1,0,0,0,0,0,0 = 0x40
    //   Byte  7: 0x00
    //   Byte  8: 0,0,1,1,0,0,0,0 = 0x30
    //   Byte  9: 0x00
    //   Byte 10: 0,0,0,0,0,1,0,0 = 0x04
    //   Byte 11: 0,0,1,1,0,0,1,0 = 0x32
    //   Byte 12: 0,1,1,0,0,1,1,1 = 0x67
    //   Byte 13: 0x00
    const tags = parseTags(
      makeShortTag(26, [
        0x27, // flags: hasName + hasMatrix + hasCharacter + move
        0x03,
        0x00, // depth = 3
        0x07,
        0x00, // characterId = 7
        // MATRIX: scale 1.5/0.5, rotate 1.0/-1.0, translate 100/-50
        0xc9,
        0x80,
        0x00,
        0x20,
        0x00,
        0x32,
        0x40,
        0x00,
        0x30,
        0x00,
        0x04,
        0x32,
        0x67,
        0x00,
        // name = "Bob\0"
        0x42,
        0x6f,
        0x62,
        0x00,
      ]),
    );

    assertEquals(1, tags.length);
    assertEquals(
      {
        type: "PlaceObject2",
        hasClipActions: false,
        hasClipDepth: false,
        hasName: true,
        hasRatio: false,
        hasColorTransform: false,
        hasMatrix: true,
        hasCharacter: true,
        move: true,
        depth: 3,
        characterId: 7,
        matrix: {
          scaleX: 1.5,
          scaleY: 0.5,
          rotateSkew0: 1.0,
          rotateSkew1: -1.0,
          translateX: 100,
          translateY: -50,
        },
        colorTransform: undefined,
        ratio: undefined,
        name: "Bob",
        clipDepth: undefined,
      },
      tags[0],
    );
  },
);

// --- MATRIX record ---
// Spec p.22: HasScale UB[1], NScaleBits UB[5], ScaleX/Y FB[NScaleBits],
//            HasRotate UB[1], NRotateBits UB[5], RotateSkew0/1 FB[NRotateBits],
//            NTranslateBits UB[5], TranslateX/Y SB[NTranslateBits].
// FB = 16.16 signed fixed-point. SB = signed bits. Must be byte aligned.

Deno.test("MATRIX - translate-only (HasScale=0, HasRotate=0)", () => {
  // HasScale=0:       0                    (1 bit)
  // HasRotate=0:      0                    (1 bit)
  // NTranslateBits:   01000 = 8            (5 bits)
  // TranslateX=100:   01100100             (SB[8])
  // TranslateY=-50:   11001110             (SB[8], two's complement: 256-50=206)
  // Total: 23 bits → 3 bytes, 1 bit padding
  // Byte 0: 0,0,0,1,0,0,0,0 = 0x10
  // Byte 1: 1,1,0,0,1,0,0,1 = 0xC9
  // Byte 2: 1,0,0,1,1,1,0,0 = 0x9C
  const buffer = new Uint8Array([0x10, 0xc9, 0x9c]);
  const result = parseMatrixRecord(Bitstream.fromBuffer(buffer));

  assertEquals(
    {
      scaleX: 1,
      scaleY: 1,
      rotateSkew0: 0,
      rotateSkew1: 0,
      translateX: 100,
      translateY: -50,
    },
    result,
  );
});

Deno.test("MATRIX - scale-only (HasScale=1, HasRotate=0)", () => {
  // HasScale=1:       1                          (1 bit)
  // NScaleBits=18:    10010                      (5 bits)
  // ScaleX=1.5:       011000000000000000         (FB[18], 1.5×65536=98304)
  // ScaleY=0.5:       001000000000000000         (FB[18], 0.5×65536=32768)
  // HasRotate=0:      0                          (1 bit)
  // NTranslateBits=0: 00000                      (5 bits)
  // Total: 48 bits = 6 bytes exact
  // Byte 0: 1,1,0,0,1,0,0,1 = 0xC9
  // Byte 1: 1,0,0,0,0,0,0,0 = 0x80
  // Byte 2: 0x00
  // Byte 3: 0,0,1,0,0,0,0,0 = 0x20
  // Byte 4: 0x00
  // Byte 5: 0x00
  const buffer = new Uint8Array([0xc9, 0x80, 0x00, 0x20, 0x00, 0x00]);
  const result = parseMatrixRecord(Bitstream.fromBuffer(buffer));

  assertEquals(
    {
      scaleX: 1.5,
      scaleY: 0.5,
      rotateSkew0: 0,
      rotateSkew1: 0,
      translateX: 0,
      translateY: 0,
    },
    result,
  );
});

Deno.test("MATRIX - rotate-only (HasScale=0, HasRotate=1)", () => {
  // HasScale=0:          0                          (1 bit)
  // HasRotate=1:         1                          (1 bit)
  // NRotateBits=18:      10010                      (5 bits)
  // RotateSkew0=1.0:     010000000000000000         (FB[18], 1.0×65536=65536)
  // RotateSkew1=-1.0:    110000000000000000         (FB[18], -1.0×65536=-65536)
  // NTranslateBits=0:    00000                      (5 bits)
  // Total: 48 bits = 6 bytes exact
  // Byte 0: 0,1,1,0,0,1,0,0 = 0x64
  // Byte 1: 1,0,0,0,0,0,0,0 = 0x80
  // Byte 2: 0x00
  // Byte 3: 0,1,1,0,0,0,0,0 = 0x60
  // Byte 4: 0x00
  // Byte 5: 0x00
  const buffer = new Uint8Array([0x64, 0x80, 0x00, 0x60, 0x00, 0x00]);
  const result = parseMatrixRecord(Bitstream.fromBuffer(buffer));

  assertEquals(
    {
      scaleX: 1,
      scaleY: 1,
      rotateSkew0: 1.0,
      rotateSkew1: -1.0,
      translateX: 0,
      translateY: 0,
    },
    result,
  );
});

Deno.test("MATRIX - all fields (scale + rotate + translate)", () => {
  // HasScale=1:          1                          (1 bit)
  // NScaleBits=18:       10010                      (5 bits)
  // ScaleX=1.5:          011000000000000000         (FB[18], 98304)
  // ScaleY=0.5:          001000000000000000         (FB[18], 32768)
  // HasRotate=1:         1                          (1 bit)
  // NRotateBits=1:       00001                      (5 bits)
  // RotateSkew0=0:       0                          (SB[1])
  // RotateSkew1=0:       0                          (SB[1])
  // NTranslateBits=5:    00101                      (5 bits)
  // TranslateX=10:       01010                      (SB[5])
  // TranslateY=-5:       11011                      (SB[5], two's complement: 32-5=27)
  // Total: 65 bits → 9 bytes, 7 bits padding
  // Byte 0: 1,1,0,0,1,0,0,1 = 0xC9
  // Byte 1: 1,0,0,0,0,0,0,0 = 0x80
  // Byte 2: 0x00
  // Byte 3: 0,0,1,0,0,0,0,0 = 0x20
  // Byte 4: 0x00
  // Byte 5: 0,0,1,0,0,0,0,1 = 0x21
  // Byte 6: 0,0,0,0,1,0,1,0 = 0x0A
  // Byte 7: 1,0,1,0,1,1,0,1 = 0xAD
  // Byte 8: 1,0,0,0,0,0,0,0 = 0x80
  const buffer = new Uint8Array([
    0xc9, 0x80, 0x00, 0x20, 0x00, 0x21, 0x0a, 0xad, 0x80,
  ]);
  const result = parseMatrixRecord(Bitstream.fromBuffer(buffer));

  assertEquals(
    {
      scaleX: 1.5,
      scaleY: 0.5,
      rotateSkew0: 0,
      rotateSkew1: 0,
      translateX: 10,
      translateY: -5,
    },
    result,
  );
});

Deno.test("MATRIX - byte alignment consumes padding bits", () => {
  // Translate-only with 13 data bits → must pad to 16 bits
  // HasScale=0:       0              (1 bit)
  // HasRotate=0:      0              (1 bit)
  // NTranslateBits=3: 00011          (5 bits)
  // TranslateX=1:     001            (SB[3])
  // TranslateY=-1:    111            (SB[3], two's complement)
  // Total: 13 bits → 2 bytes, 3 bits padding
  // Byte 0: 0,0,0,0,0,1,1,0 = 0x06
  // Byte 1: 0,1,1,1,1,0,0,0 = 0x78
  const bs = Bitstream.fromBuffer(new Uint8Array([0x06, 0x78]));
  const result = parseMatrixRecord(bs);

  assertEquals(
    {
      scaleX: 1,
      scaleY: 1,
      rotateSkew0: 0,
      rotateSkew1: 0,
      translateX: 1,
      translateY: -1,
    },
    result,
  );

  // After parsing, bitstream should be byte-aligned at bit 16
  assertEquals(16, bs.index);
});

// --- DefineFontName (Tag 88) ---

Deno.test("DefineFontName - parses font name and copyright", () => {
  // Tag 88: FontID (UI16) + FontName (STRING) + FontCopyright (STRING)
  // FontID = 1 → LE [0x01, 0x00]
  // FontName = "Arial\0"
  // FontCopyright = "Test\0"
  const body = [
    0x01,
    0x00, // FontID = 1
    0x41,
    0x72,
    0x69,
    0x61,
    0x6c,
    0x00, // "Arial\0"
    0x54,
    0x65,
    0x73,
    0x74,
    0x00, // "Test\0"
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeShortTag(88, body), ...endTag]);
  const tags = parseTags(buffer);

  assertEquals(tags[0], {
    type: "DefineFontName",
    fontId: 1,
    fontName: "Arial",
    fontCopyright: "Test",
  });
});

Deno.test("DefineFontName - empty strings", () => {
  const body = [
    0x05,
    0x00, // FontID = 5
    0x00, // FontName = "" (just null terminator)
    0x00, // FontCopyright = ""
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeShortTag(88, body), ...endTag]);
  const tags = parseTags(buffer);

  assertEquals(tags[0], {
    type: "DefineFontName",
    fontId: 5,
    fontName: "",
    fontCopyright: "",
  });
});

// --- DefineSceneAndFrameLabelData (Tag 86) ---

Deno.test(
  "DefineSceneAndFrameLabelData - single scene, no frame labels",
  () => {
    // EncodedU32: values < 128 fit in one byte (MSB=0)
    // SceneCount = 1
    // Scene 0: offset = 0, name = "Scene 1\0"
    // FrameLabelCount = 0
    const body = [
      0x01, // SceneCount = 1
      0x00, // Offset[0] = 0
      0x53,
      0x63,
      0x65,
      0x6e,
      0x65,
      0x20,
      0x31,
      0x00, // "Scene 1\0"
      0x00, // FrameLabelCount = 0
    ];
    const endTag = makeShortTag(0, []);
    const buffer = new Uint8Array([...makeLongTag(86, body), ...endTag]);
    const tags = parseTags(buffer);

    assertEquals(tags[0], {
      type: "DefineSceneAndFrameLabelData",
      sceneCount: 1,
      scenes: [{ offset: 0, name: "Scene 1" }],
      frames: [],
    });
  },
);

Deno.test(
  "DefineSceneAndFrameLabelData - multiple scenes and frame labels",
  () => {
    const body = [
      0x02, // SceneCount = 2
      0x00, // Offset[0] = 0
      0x41,
      0x00, // Name[0] = "A\0"
      0x0a, // Offset[1] = 10
      0x42,
      0x00, // Name[1] = "B\0"
      0x02, // FrameLabelCount = 2
      0x00, // FrameNum[0] = 0
      0x73,
      0x74,
      0x61,
      0x72,
      0x74,
      0x00, // "start\0"
      0x05, // FrameNum[1] = 5
      0x65,
      0x6e,
      0x64,
      0x00, // "end\0"
    ];
    const endTag = makeShortTag(0, []);
    const buffer = new Uint8Array([...makeLongTag(86, body), ...endTag]);
    const tags = parseTags(buffer);

    assertEquals(tags[0], {
      type: "DefineSceneAndFrameLabelData",
      sceneCount: 2,
      scenes: [
        { offset: 0, name: "A" },
        { offset: 10, name: "B" },
      ],
      frames: [
        { number: 0, label: "start" },
        { number: 5, label: "end" },
      ],
    });
  },
);

Deno.test("DefineSceneAndFrameLabelData - EncodedU32 multi-byte value", () => {
  // EncodedU32: 300 = 0b100101100
  // Byte 0: 0b10101100 = 0xAC (low 7 bits = 0b0101100, MSB=1 → continue)
  // Byte 1: 0b00000010 = 0x02 (next 7 bits = 0b0000010, MSB=0 → stop)
  // Result: (0x2C) | (0x02 << 7) = 44 + 256 = 300
  const body = [
    0x01, // SceneCount = 1
    0xac,
    0x02, // Offset[0] = 300 (EncodedU32, 2 bytes)
    0x58,
    0x00, // Name[0] = "X\0"
    0x00, // FrameLabelCount = 0
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(86, body), ...endTag]);
  const tags = parseTags(buffer);

  assertEquals(tags[0], {
    type: "DefineSceneAndFrameLabelData",
    sceneCount: 1,
    scenes: [{ offset: 300, name: "X" }],
    frames: [],
  });
});

// --- DefineEditText (Tag 37) ---

// Helper to build a RECT with nBits=5 and all zeros (xMin=0, xMax=0, yMin=0, yMax=0)
// nBits=5:  00101
// 4 fields: 00000 00000 00000 00000
// Total: 25 bits → pad to 32 bits (4 bytes)
// 00101_00000_00000_00000_00000_0000000
// Byte 0: 00101000 = 0x28
// Byte 1: 00000000 = 0x00
// Byte 2: 00000000 = 0x00
// Byte 3: 00000000 = 0x00
const zeroRect = [0x28, 0x00, 0x00, 0x00];

Deno.test("DefineEditText - minimal (no optional fields)", () => {
  // CharacterID = 1, zero RECT, all flags off except bare minimum
  // Flags (16 bits, all 0): 0x00, 0x00
  // VariableName = "" (null terminator)
  const body = [
    0x01,
    0x00, // CharacterID = 1
    ...zeroRect, // Bounds
    0x00,
    0x00, // 16 flag bits all zero
    0x00, // VariableName = ""
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(37, body), ...endTag]);
  const tags = parseTags(buffer);

  assertEquals(tags[0], {
    type: "DefineEditText",
    characterId: 1,
    bounds: { nBits: 5, xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
    hasText: false,
    wordWrap: false,
    multiline: false,
    password: false,
    readOnly: false,
    hasTextColor: false,
    hasMaxLength: false,
    hasFont: false,
    hasFontClass: false,
    autoSize: false,
    hasLayout: false,
    noSelect: false,
    border: false,
    wasStatic: false,
    html: false,
    useOutlines: false,
    fontId: undefined,
    fontClass: undefined,
    fontHeight: undefined,
    textColor: undefined,
    maxLength: undefined,
    align: undefined,
    leftMargin: undefined,
    rightMargin: undefined,
    indent: undefined,
    leading: undefined,
    variableName: "",
    initialText: undefined,
  });
});

Deno.test("DefineEditText - with font and text", () => {
  // Flags: HasText=1, HasFont=1, rest=0
  // HasText is bit 0 (MSB of first flag byte), HasFont is bit 7 (LSB of first flag byte)
  // Flag bits in order: HasText WordWrap Multiline Password ReadOnly HasTextColor HasMaxLength HasFont
  //                     HasFontClass AutoSize HasLayout NoSelect Border WasStatic HTML UseOutlines
  // HasText=1:  1000_0001 = 0x81
  // Rest=0:     0000_0000 = 0x00
  const body = [
    0x02,
    0x00, // CharacterID = 2
    ...zeroRect, // Bounds
    0x81, // HasText=1 HasFont=1 (bits: 1,0,0,0,0,0,0,1)
    0x00, // second flag byte all zero
    0x03,
    0x00, // FontID = 3
    0x00,
    0xf0, // FontHeight = 0xf000 LE → actually 240 in twips... wait
  ];

  // Hmm, let me be more careful. FontHeight UI16 LE = 240 → 0xF0, 0x00
  const body2 = [
    0x02,
    0x00, // CharacterID = 2
    ...zeroRect, // Bounds
    0x81,
    0x00, // flags: HasText=1, HasFont=1
    0x03,
    0x00, // FontID = 3
    0xf0,
    0x00, // FontHeight = 240
    0x6d,
    0x79,
    0x56,
    0x61,
    0x72,
    0x00, // VariableName = "myVar\0"
    0x48,
    0x69,
    0x00, // InitialText = "Hi\0"
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(37, body2), ...endTag]);
  const tags = parseTags(buffer);

  assertEquals(tags[0], {
    type: "DefineEditText",
    characterId: 2,
    bounds: { nBits: 5, xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
    hasText: true,
    wordWrap: false,
    multiline: false,
    password: false,
    readOnly: false,
    hasTextColor: false,
    hasMaxLength: false,
    hasFont: true,
    hasFontClass: false,
    autoSize: false,
    hasLayout: false,
    noSelect: false,
    border: false,
    wasStatic: false,
    html: false,
    useOutlines: false,
    fontId: 3,
    fontClass: undefined,
    fontHeight: 240,
    textColor: undefined,
    maxLength: undefined,
    align: undefined,
    leftMargin: undefined,
    rightMargin: undefined,
    indent: undefined,
    leading: undefined,
    variableName: "myVar",
    initialText: "Hi",
  });
});

Deno.test("DefineEditText - with layout, color, and maxLength", () => {
  // Flags byte 1: HasText=0, WordWrap=1, Multiline=1, Password=0, ReadOnly=0,
  //               HasTextColor=1, HasMaxLength=1, HasFont=0
  //   = 0,1,1,0,0,1,1,0 = 0x66
  // Flags byte 2: HasFontClass=0, AutoSize=0, HasLayout=1, NoSelect=0,
  //               Border=1, WasStatic=0, HTML=0, UseOutlines=0
  //   = 0,0,1,0,1,0,0,0 = 0x28
  const body = [
    0x0a,
    0x00, // CharacterID = 10
    ...zeroRect, // Bounds
    0x66,
    0x28, // flags
    // TextColor RGBA (since HasTextColor=1): red=0xFF, green=0x00, blue=0x80, alpha=0xFF
    0xff,
    0x00,
    0x80,
    0xff,
    // MaxLength UI16 (since HasMaxLength=1): 100
    0x64,
    0x00,
    // Layout fields (since HasLayout=1):
    0x02, // Align = 2 (Center)
    0x14,
    0x00, // LeftMargin = 20
    0x0a,
    0x00, // RightMargin = 10
    0x05,
    0x00, // Indent = 5
    0xfe,
    0xff, // Leading = -2 (SI16: 0xFFFE = -2)
    // VariableName
    0x74,
    0x78,
    0x74,
    0x00, // "txt\0"
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(37, body), ...endTag]);
  const tags = parseTags(buffer);

  assertEquals(tags[0], {
    type: "DefineEditText",
    characterId: 10,
    bounds: { nBits: 5, xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
    hasText: false,
    wordWrap: true,
    multiline: true,
    password: false,
    readOnly: false,
    hasTextColor: true,
    hasMaxLength: true,
    hasFont: false,
    hasFontClass: false,
    autoSize: false,
    hasLayout: true,
    noSelect: false,
    border: true,
    wasStatic: false,
    html: false,
    useOutlines: false,
    fontId: undefined,
    fontClass: undefined,
    fontHeight: undefined,
    textColor: { red: 0xff, green: 0x00, blue: 0x80, alpha: 0xff },
    maxLength: 100,
    align: 2,
    leftMargin: 20,
    rightMargin: 10,
    indent: 5,
    leading: -2,
    variableName: "txt",
    initialText: undefined,
  });
});

// --- DefineText (Tag 11) / DefineText2 (Tag 33) ---

// Build a MATRIX with no scale, no rotate, no translate (all zero).
// HasScale=0 (1 bit), HasRotate=0 (1 bit), NTranslateBits=0 (5 bits: 00000),
// Total: 7 bits → pad to 8 bits
// Byte: 0,0,00000,0 = 0x00
const zeroMatrix = [0x00];

Deno.test("DefineText - single record, one glyph", () => {
  // CharacterID = 1 (UI16 LE)
  // TextBounds = zero RECT (nBits=5, all zeros, 4 bytes)
  // TextMatrix = zero matrix (1 byte)
  // GlyphBits = 2, AdvanceBits = 3
  // TextRecord:
  //   flags byte: TextRecordType=1, Reserved=000, HasFont=1, HasColor=0, HasYOffset=0, HasXOffset=0
  //   = 1000_1000 = 0x88
  //   FontID = 5 (UI16 LE: 0x05, 0x00)
  //   TextHeight = 240 (UI16 LE: 0xF0, 0x00)
  //   GlyphCount = 1
  //   GlyphEntry: GlyphIndex=2 (UB[2]=10), GlyphAdvance=3 (SB[3]=011)
  //     Bits: 10_011 = 5 bits → pad to 8: 10011_000 = 0x98
  // EndOfRecords = 0x00
  const body = [
    0x01,
    0x00, // CharacterID = 1
    ...zeroRect, // TextBounds
    ...zeroMatrix, // TextMatrix
    0x02, // GlyphBits = 2
    0x03, // AdvanceBits = 3
    0x88, // TextRecord flags: type=1, hasFont=1
    0x05,
    0x00, // FontID = 5
    0xf0,
    0x00, // TextHeight = 240
    0x01, // GlyphCount = 1
    0x98, // GlyphIndex=2 (10), GlyphAdvance=3 (011), pad 000
    0x00, // EndOfRecords
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(11, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineText");
  if (tag.type !== "DefineText") return;
  assertEquals(tag.characterId, 1);
  assertEquals(tag.glyphBits, 2);
  assertEquals(tag.advanceBits, 3);
  assertEquals(tag.textRecords.length, 1);
  assertEquals(tag.textRecords[0].fontId, 5);
  assertEquals(tag.textRecords[0].textHeight, 240);
  assertEquals(tag.textRecords[0].glyphEntries, [
    { glyphIndex: 2, glyphAdvance: 3 },
  ]);
});

Deno.test("DefineText - record with color and offsets", () => {
  // GlyphBits = 1, AdvanceBits = 1
  // TextRecord flags: type=1, reserved=000, hasFont=0, hasColor=1, hasYOffset=1, hasXOffset=1
  //   = 1000_0111 = 0x87
  // TextColor RGB: 0xFF, 0x00, 0x80
  // XOffset SI16 LE: 100 → 0x64, 0x00
  // YOffset SI16 LE: -10 → 0xF6, 0xFF
  // GlyphCount = 1
  // GlyphEntry: GlyphIndex=0 (UB[1]=0), GlyphAdvance=0 (SB[1]=0)
  //   Bits: 0_0 = 2 bits → pad to 8: 00_000000 = 0x00
  const body = [
    0x02,
    0x00, // CharacterID = 2
    ...zeroRect,
    ...zeroMatrix,
    0x01, // GlyphBits = 1
    0x01, // AdvanceBits = 1
    0x87, // flags: hasColor=1, hasYOffset=1, hasXOffset=1
    0xff,
    0x00,
    0x80, // TextColor RGB
    0x64,
    0x00, // XOffset = 100
    0xf6,
    0xff, // YOffset = -10
    0x01, // GlyphCount = 1
    0x00, // GlyphIndex=0, GlyphAdvance=0, padding
    0x00, // EndOfRecords
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(11, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineText");
  if (tag.type !== "DefineText") return;
  assertEquals(tag.characterId, 2);
  assertEquals(tag.textRecords.length, 1);
  assertEquals(tag.textRecords[0].textColor, {
    red: 0xff,
    green: 0x00,
    blue: 0x80,
  });
  assertEquals(tag.textRecords[0].xOffset, 100);
  assertEquals(tag.textRecords[0].yOffset, -10);
});

Deno.test("DefineText2 - uses RGBA color", () => {
  // Same as DefineText but tag 33, color is RGBA
  // GlyphBits = 1, AdvanceBits = 1
  // TextRecord flags: type=1, reserved=000, hasFont=0, hasColor=1, hasYOffset=0, hasXOffset=0
  //   = 1000_0100 = 0x84
  // TextColor RGBA: 0xFF, 0x00, 0x80, 0xAA
  // GlyphCount = 1
  // GlyphEntry: GlyphIndex=1 (UB[1]=1), GlyphAdvance=-1 (SB[1]=1)
  //   Bits: 1_1 = 2 bits → pad to 8: 11_000000 = 0xC0
  const body = [
    0x03,
    0x00, // CharacterID = 3
    ...zeroRect,
    ...zeroMatrix,
    0x01, // GlyphBits = 1
    0x01, // AdvanceBits = 1
    0x84, // flags: hasColor=1
    0xff,
    0x00,
    0x80,
    0xaa, // TextColor RGBA
    0x01, // GlyphCount = 1
    0xc0, // GlyphIndex=1, GlyphAdvance=-1, padding
    0x00, // EndOfRecords
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(33, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineText2");
  if (tag.type !== "DefineText2") return;
  assertEquals(tag.characterId, 3);
  assertEquals(tag.textRecords.length, 1);
  assertEquals(tag.textRecords[0].textColor, {
    red: 0xff,
    green: 0x00,
    blue: 0x80,
    alpha: 0xaa,
  });
  assertEquals(tag.textRecords[0].glyphEntries, [
    { glyphIndex: 1, glyphAdvance: -1 },
  ]);
});

Deno.test("DefineText - no text records (just EndOfRecords)", () => {
  const body = [
    0x04,
    0x00, // CharacterID = 4
    ...zeroRect,
    ...zeroMatrix,
    0x01, // GlyphBits = 1
    0x01, // AdvanceBits = 1
    0x00, // EndOfRecords immediately
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(11, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineText");
  if (tag.type !== "DefineText") return;
  assertEquals(tag.textRecords.length, 0);
});

// Helper: encode a float16 value as two little-endian bytes
const encodeFloat16 = (value: number): [number, number] => {
  const buf = new ArrayBuffer(4);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);
  f32[0] = value;
  const bits32 = u32[0];
  const sign = (bits32 >> 31) & 1;
  let exponent = ((bits32 >> 23) & 0xff) - 127 + 15;
  let mantissa = (bits32 >> 13) & 0x3ff;
  if (exponent <= 0) {
    exponent = 0;
    mantissa = 0;
  } else if (exponent >= 31) {
    exponent = 31;
    mantissa = 0;
  }
  const bits16 = (sign << 15) | (exponent << 10) | mantissa;
  return [bits16 & 0xff, (bits16 >> 8) & 0xff];
};

Deno.test("DefineFontAlignZones - single glyph zone", () => {
  // FLOAT16 1.0 = 0x3C00 -> LE bytes: 0x00, 0x3C
  // FLOAT16 0.5 = 0x3800 -> LE bytes: 0x00, 0x38
  // FLOAT16 2.0 = 0x4000 -> LE bytes: 0x00, 0x40
  // FLOAT16 0.0 = 0x0000 -> LE bytes: 0x00, 0x00
  const body = [
    0x05,
    0x00, // FontID = 5
    0x40, // CSMTableHint = 1 (medium), Reserved = 0 → bits: 01_000000
    // ZONERECORD[0]:
    0x02, // NumZoneData = 2
    ...encodeFloat16(1.0), // ZoneData[0].AlignmentCoordinate = 1.0
    ...encodeFloat16(0.5), // ZoneData[0].Range = 0.5
    ...encodeFloat16(2.0), // ZoneData[1].AlignmentCoordinate = 2.0
    ...encodeFloat16(0.0), // ZoneData[1].Range = 0.0
    0x03, // Reserved(6)=0, ZoneMaskY=1, ZoneMaskX=1 → bits: 000000_1_1
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeShortTag(73, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineFontAlignZones");
  if (tag.type !== "DefineFontAlignZones") return;
  assertEquals(tag.fontId, 5);
  assertEquals(tag.csmTableHint, 1);
  assertEquals(tag.zoneTable.length, 1);

  const zone = tag.zoneTable[0];
  assertEquals(zone.numZoneData, 2);
  assertEquals(zone.zoneData.length, 2);
  assertEquals(zone.zoneData[0].alignmentCoordinate, 1.0);
  assertEquals(zone.zoneData[0].range, 0.5);
  assertEquals(zone.zoneData[1].alignmentCoordinate, 2.0);
  assertEquals(zone.zoneData[1].range, 0.0);
  assertEquals(zone.zoneMaskY, true);
  assertEquals(zone.zoneMaskX, true);
});

Deno.test("DefineFontAlignZones - multiple glyph zones", () => {
  const body = [
    0x0a,
    0x00, // FontID = 10
    0x80, // CSMTableHint = 2 (thick), Reserved = 0 → bits: 10_000000
    // ZONERECORD[0]:
    0x02, // NumZoneData = 2
    ...encodeFloat16(0.25), // ZoneData[0].AlignmentCoordinate
    ...encodeFloat16(0.125), // ZoneData[0].Range
    ...encodeFloat16(0.75), // ZoneData[1].AlignmentCoordinate
    ...encodeFloat16(1.5), // ZoneData[1].Range
    0x02, // Reserved=0, ZoneMaskY=1, ZoneMaskX=0 → bits: 000000_1_0
    // ZONERECORD[1]:
    0x02, // NumZoneData = 2
    ...encodeFloat16(3.0), // ZoneData[0].AlignmentCoordinate
    ...encodeFloat16(0.0), // ZoneData[0].Range
    ...encodeFloat16(4.0), // ZoneData[1].AlignmentCoordinate
    ...encodeFloat16(0.0), // ZoneData[1].Range
    0x01, // Reserved=0, ZoneMaskY=0, ZoneMaskX=1 → bits: 000000_0_1
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(73, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineFontAlignZones");
  if (tag.type !== "DefineFontAlignZones") return;
  assertEquals(tag.fontId, 10);
  assertEquals(tag.csmTableHint, 2);
  assertEquals(tag.zoneTable.length, 2);

  assertEquals(tag.zoneTable[0].zoneMaskY, true);
  assertEquals(tag.zoneTable[0].zoneMaskX, false);
  assertEquals(tag.zoneTable[0].zoneData[0].alignmentCoordinate, 0.25);
  assertEquals(tag.zoneTable[0].zoneData[0].range, 0.125);
  assertEquals(tag.zoneTable[0].zoneData[1].alignmentCoordinate, 0.75);
  assertEquals(tag.zoneTable[0].zoneData[1].range, 1.5);

  assertEquals(tag.zoneTable[1].zoneMaskY, false);
  assertEquals(tag.zoneTable[1].zoneMaskX, true);
  assertEquals(tag.zoneTable[1].zoneData[0].alignmentCoordinate, 3.0);
  assertEquals(tag.zoneTable[1].zoneData[1].alignmentCoordinate, 4.0);
});

Deno.test("DefineFont3 - 0 glyphs, no layout (device font)", () => {
  const body = [
    0x01,
    0x00, // FontID = 1
    // Flags byte: HasLayout=0, ShiftJIS=0, SmallText=0, ANSI=0,
    //             WideOffsets=0, WideCodes=1, Italic=0, Bold=0
    //             = 0b00000100 = 0x04
    0x04,
    0x01, // LanguageCode = 1 (Latin)
    0x04, // FontNameLen = 4
    0x54,
    0x65,
    0x73,
    0x74, // FontName = "Test"
    0x00,
    0x00, // NumGlyphs = 0
    // No OffsetTable, CodeTableOffset, GlyphShapeTable, CodeTable
    // No layout data (HasLayout=0)
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeShortTag(75, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineFont3");
  if (tag.type !== "DefineFont3") return;
  assertEquals(tag.fontId, 1);
  assertEquals(tag.hasLayout, false);
  assertEquals(tag.wideCodes, true);
  assertEquals(tag.italic, false);
  assertEquals(tag.bold, false);
  assertEquals(tag.languageCode, 1);
  assertEquals(tag.fontName, "Test");
  assertEquals(tag.numGlyphs, 0);
  assertEquals(tag.glyphShapeTable, []);
  assertEquals(tag.codeTable, []);
  assertEquals(tag.fontAscent, undefined);
});

Deno.test("DefineFont3 - single glyph, narrow offsets, no layout", () => {
  // Build a minimal glyph shape: NumFillBits=1, NumLineBits=0,
  // then EndShape record (non-edge, flags=0 → 6 zero bits)
  // = 0b0001_0000 0b000000_xx = [0x10, 0x00] (byte-aligned, 2 bytes)
  const glyphShape = [0x10, 0x00]; // NF=1, NL=0, then 1-bit non-edge + 5-bit flags=0 → EndShape, padded

  // Offset table: single entry pointing past itself
  // OffsetTable has 1 entry (UI16) + CodeTableOffset (UI16) = 4 bytes
  // Glyph starts at byte 4 from start of OffsetTable
  const offsetTable = [
    0x04,
    0x00, // Offset[0] = 4 (past OffsetTable + CodeTableOffset)
  ];
  const codeTableOffset = [
    0x06,
    0x00, // CodeTableOffset = 6 (4 + 2 bytes of glyph)
  ];

  const body = [
    0x02,
    0x00, // FontID = 2
    // Flags: HasLayout=0, ShiftJIS=0, SmallText=0, ANSI=0,
    //        WideOffsets=0, WideCodes=1, Italic=1, Bold=0
    //        = 0b00000110 = 0x06
    0x06,
    0x01, // LanguageCode = 1
    0x01, // FontNameLen = 1
    0x41, // FontName = "A"
    0x01,
    0x00, // NumGlyphs = 1
    ...offsetTable,
    ...codeTableOffset,
    ...glyphShape,
    0x41,
    0x00, // CodeTable[0] = 0x0041 ('A')
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(75, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineFont3");
  if (tag.type !== "DefineFont3") return;
  assertEquals(tag.fontId, 2);
  assertEquals(tag.italic, true);
  assertEquals(tag.bold, false);
  assertEquals(tag.fontName, "A");
  assertEquals(tag.numGlyphs, 1);
  assertEquals(tag.glyphShapeTable.length, 1);
  assertEquals(tag.glyphShapeTable[0].length, 1);
  assertEquals(tag.glyphShapeTable[0][0].type, "EndShape");
  assertEquals(tag.codeTable, [0x0041]);
  assertEquals(tag.fontAscent, undefined);
});

Deno.test("DefineFont3 - with layout and kerning", () => {
  // Same minimal glyph shapes (EndShape only)
  const glyphShape = [0x10, 0x00];

  // 2 glyphs, narrow offsets
  // OffsetTable: 2×UI16 + CodeTableOffset UI16 = 6 bytes before glyphs
  const body = [
    0x03,
    0x00, // FontID = 3
    // Flags: HasLayout=1, ShiftJIS=0, SmallText=0, ANSI=0,
    //        WideOffsets=0, WideCodes=1, Italic=0, Bold=1
    //        = 0b10000101 = 0x85
    0x85,
    0x01, // LanguageCode = 1
    0x02, // FontNameLen = 2
    0x42,
    0x43, // FontName = "BC"
    0x02,
    0x00, // NumGlyphs = 2
    // OffsetTable (2 entries × UI16)
    0x06,
    0x00, // Offset[0] = 6 (past 2×UI16 offsets + 1×UI16 codeTableOffset)
    0x08,
    0x00, // Offset[1] = 8 (6 + 2 bytes glyph0)
    // CodeTableOffset
    0x0a,
    0x00, // CodeTableOffset = 10 (8 + 2 bytes glyph1)
    // GlyphShapeTable[0]
    ...glyphShape,
    // GlyphShapeTable[1]
    ...glyphShape,
    // CodeTable
    0x42,
    0x00, // CodeTable[0] = 0x0042 ('B')
    0x43,
    0x00, // CodeTable[1] = 0x0043 ('C')
    // Layout data:
    // FontAscent SI16
    0xe8,
    0x03, // 1000
    // FontDescent SI16
    0xf4,
    0x01, // 500
    // FontLeading SI16
    0x00,
    0x00, // 0
    // FontAdvanceTable SI16[2]
    0xc8,
    0x00, // 200
    0x90,
    0x01, // 400
    // FontBoundsTable RECT[2] — minimal zero RECTs
    // RECT: nBits=0 (5 bits) → 0b00000 xxx = 0x00 (byte-aligned, 1 byte each)
    0x00, // RECT[0]: nBits=0, no fields
    0x00, // RECT[1]: nBits=0, no fields
    // KerningCount UI16
    0x01,
    0x00, // 1 kerning record
    // KERNINGRECORD (wideCodes=1): UI16 + UI16 + SI16
    0x42,
    0x00, // Code1 = 0x0042 ('B')
    0x43,
    0x00, // Code2 = 0x0043 ('C')
    0xf6,
    0xff, // Adjustment = -10 (0xFFF6 as SI16)
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(75, body), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineFont3");
  if (tag.type !== "DefineFont3") return;
  assertEquals(tag.fontId, 3);
  assertEquals(tag.hasLayout, true);
  assertEquals(tag.bold, true);
  assertEquals(tag.italic, false);
  assertEquals(tag.fontName, "BC");
  assertEquals(tag.numGlyphs, 2);
  assertEquals(tag.glyphShapeTable.length, 2);
  assertEquals(tag.codeTable, [0x0042, 0x0043]);
  assertEquals(tag.fontAscent, 1000);
  assertEquals(tag.fontDescent, 500);
  assertEquals(tag.fontLeading, 0);
  assertEquals(tag.fontAdvanceTable, [200, 400]);
  assertEquals(tag.fontBoundsTable!.length, 2);
  assertEquals(tag.kerningTable!.length, 1);
  assertEquals(tag.kerningTable![0], {
    code1: 0x42,
    code2: 0x43,
    adjustment: -10,
  });
});

Deno.test("DefineSprite - empty sprite (just End tag)", () => {
  const spriteBody = [
    0x05,
    0x00, // SpriteID = 5
    0x01,
    0x00, // FrameCount = 1
    // Nested tags: just End
    ...makeShortTag(0, []),
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(39, spriteBody), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineSprite");
  if (tag.type !== "DefineSprite") return;
  assertEquals(tag.spriteId, 5);
  assertEquals(tag.frameCount, 1);
  assertEquals(tag.controlTags.length, 1);
  assertEquals(tag.controlTags[0].type, "End");
});

Deno.test("DefineSprite - with ShowFrame and PlaceObject2", () => {
  // PlaceObject2: move=1, hasCharacter=1, depth=1, characterId=7
  const placeBody = [
    0x03, // flags: hasCharacter=1, move=1
    0x01,
    0x00, // depth = 1
    0x07,
    0x00, // characterId = 7
  ];
  const spriteBody = [
    0x0a,
    0x00, // SpriteID = 10
    0x02,
    0x00, // FrameCount = 2
    // Nested tags:
    ...makeShortTag(26, placeBody), // PlaceObject2
    ...makeShortTag(1, []), // ShowFrame
    ...makeShortTag(1, []), // ShowFrame
    ...makeShortTag(0, []), // End
  ];
  const endTag = makeShortTag(0, []);
  const buffer = new Uint8Array([...makeLongTag(39, spriteBody), ...endTag]);
  const tags = parseTags(buffer);

  const tag = tags[0];
  assertEquals(tag.type, "DefineSprite");
  if (tag.type !== "DefineSprite") return;
  assertEquals(tag.spriteId, 10);
  assertEquals(tag.frameCount, 2);
  assertEquals(tag.controlTags.length, 4);
  assertEquals(tag.controlTags[0].type, "PlaceObject2");
  assertEquals(tag.controlTags[1].type, "ShowFrame");
  assertEquals(tag.controlTags[2].type, "ShowFrame");
  assertEquals(tag.controlTags[3].type, "End");
});
