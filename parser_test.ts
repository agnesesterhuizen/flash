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
  const buffer = new Uint8Array([254, 0, 0]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseFillStyleArray(bitstream, "Shape1");
  assertEquals(0, result.length);
});

Deno.test(
  "parseFillStyleArray - extended count currently still returns empty",
  () => {
    const buffer = new Uint8Array([0xff, 0x00, 0x02, 0xaa, 0xbb, 0xcc]);
    const bitstream = Bitstream.fromBuffer(buffer);

    const result = parseFillStyleArray(bitstream, "Shape1");

    assertEquals([], result);
  },
);

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

Deno.test("parseTags - unknown tag throws", () => {
  let thrown;

  try {
    parseTags(makeShortTag(3, []));
  } catch (error) {
    thrown = error;
  }

  assertEquals("parseTags: encountered unknown tag: 3", thrown);
});
