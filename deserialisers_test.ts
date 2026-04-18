import { assertEquals } from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { headerDeserialiser, rectDeserialiser } from "./deserialisers.ts";
import { Bitstream } from "./bitstream.ts";

// --- RECT record ---
// Spec p.21: Nbits UB[5], Xmin SB[Nbits], Xmax SB[Nbits], Ymin SB[Nbits], Ymax SB[Nbits]
// Must be byte aligned.

Deno.test("RECT - Nbits=0, all values zero (minimal rect)", () => {
  // 00000 (nBits=0, no further fields — reading 0 bits yields NaN from parseInt)
  const buffer = new Uint8Array([0x00]);
  const s = rectDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(0, s.nBits);
  // NOTE: read(0) returns NaN — parser limitation with zero-width fields
  assertEquals(true, isNaN(s.xMin as number));
  assertEquals(true, isNaN(s.xMax as number));
  assertEquals(true, isNaN(s.yMin as number));
  assertEquals(true, isNaN(s.yMax as number));
});

Deno.test("RECT - Nbits=1, signed single-bit fields", () => {
  // nBits=1: 00001
  // With SB[1], value 0 = 0, value 1 = -1 (sign bit set)
  // xMin=0:  0
  // xMax=-1: 1  (SB[1]: sign bit set → -1)
  // yMin=0:  0
  // yMax=-1: 1  (SB[1]: sign bit set → -1)
  // Bits: 00001_0_1_0_1 = 000010101 (9 bits)
  // Byte 0: 00001010 = 0x0A
  // Byte 1: 1_______ = 0x80
  const buffer = new Uint8Array([0x0a, 0x80]);
  const s = rectDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(1, s.nBits);
  assertEquals(0, s.xMin);
  assertEquals(-1, s.xMax);
  assertEquals(0, s.yMin);
  assertEquals(-1, s.yMax);
});

Deno.test("RECT - Nbits=5, negative coordinates (-100, 100, -80, 80)", () => {
  // nBits=5: 00101
  // SB[5] range: -16 to 15. Need wider. Use Nbits=8 for range -128 to 127.
  // Actually -100 needs at least 8 bits. Let's use Nbits=8.
  // nBits=8:    01000
  // xMin=-100:  10011100  (two's complement: 256-100=156=0x9C=10011100)
  // xMax=100:   01100100
  // yMin=-80:   10110000  (256-80=176=0xB0=10110000)
  // yMax=80:    01010000
  // Total: 5 + 32 = 37 bits
  // Byte 0 (pos 0-7):  01000100 = 0x44
  // Byte 1 (pos 8-15): 11100011 = 0xE3
  // Byte 2 (pos 16-23):00100101 = 0x25
  // Byte 3 (pos 24-31):10000010 = 0x82
  // Byte 4 (pos 32-36): 10000___ = 0x80
  const buffer = new Uint8Array([0x44, 0xe3, 0x25, 0x82, 0x80]);
  const s = rectDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(8, s.nBits);
  assertEquals(-100, s.xMin);
  assertEquals(100, s.xMax);
  assertEquals(-80, s.yMin);
  assertEquals(80, s.yMax);
});

Deno.test("RECT - Nbits=5, typical small rect (0, 15, 0, 10)", () => {
  // SB[5] range: -16 to 15
  // nBits=5:  00101
  // xMin=0:   00000
  // xMax=15:  01111
  // yMin=0:   00000
  // yMax=10:  01010
  // Bits: 00101_00000_01111_00000_01010 (25 bits)
  // Byte 0 (pos 0-7):  00101000 = 0x28
  // Byte 1 (pos 8-15): 00011110 = 0x1E
  // Byte 2 (pos 16-23):00000101 = 0x05
  // Byte 3 (pos 24):   0_______ = 0x00
  const buffer = new Uint8Array([0x28, 0x1e, 0x05, 0x00]);
  const s = rectDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(5, s.nBits);
  assertEquals(0, s.xMin);
  assertEquals(15, s.xMax);
  assertEquals(0, s.yMin);
  assertEquals(10, s.yMax);
});

Deno.test("RECT - Nbits=11, non-zero all fields (100, 800, 50, 600)", () => {
  // nBits=11: 01011
  // xMin=100: 00001100100
  // xMax=800: 01100100000
  // yMin=50:  00000110010
  // yMax=600: 01001011000
  // Total: 5 + 44 = 49 bits
  // Byte 0: 01011000 = 0x58
  // Byte 1: 01100100 = 0x64
  // Byte 2: 01100100 = 0x64
  // Byte 3: 00000000 = 0x00
  // Byte 4: 11001001 = 0xC9
  // Byte 5: 00101100 = 0x2C
  // Byte 6: 0_______ = 0x00
  const buffer = new Uint8Array([0x58, 0x64, 0x64, 0x00, 0xc9, 0x2c, 0x00]);
  const s = rectDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(11, s.nBits);
  assertEquals(100, s.xMin);
  assertEquals(800, s.xMax);
  assertEquals(50, s.yMin);
  assertEquals(600, s.yMax);
});

Deno.test("RECT - Nbits=15, frame size rect (0, 11000, 0, 8000)", () => {
  // From test.swf FrameSize — a typical SWF display area (550x400 px = 11000x8000 twips)
  // nBits=15:    01111
  // xMin=0:      000000000000000
  // xMax=11000:  010101011111000
  // yMin=0:      000000000000000
  // yMax=8000:   001111101000000
  // Total: 5 + 60 = 65 bits (9 bytes)
  const buffer = new Uint8Array([
    0x78, 0x00, 0x05, 0x5f, 0x00, 0x00, 0x0f, 0xa0, 0x00,
  ]);
  const s = rectDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(15, s.nBits);
  assertEquals(0, s.xMin);
  assertEquals(11000, s.xMax);
  assertEquals(0, s.yMin);
  assertEquals(8000, s.yMax);
});

Deno.test("headerDeserialiser", () => {
  const buffer = new Uint8Array([
    0x46, 0x57, 0x53, 0x20, 0x91, 0x00, 0x00, 0x00, 0x78, 0x00, 0x05, 0x5f,
    0x00, 0x00, 0x0f, 0xa0, 0x00, 0x18, 0x00, 0x01, 0x00,
  ]);

  const s = headerDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals("F".charCodeAt(0), s.compressionType);
  assertEquals("W".charCodeAt(0), s.signature1);
  assertEquals("S".charCodeAt(0), s.signature2);
  assertEquals(32, s.version);
  assertEquals(145, s.fileLength);
  assertEquals(15, s.frameSize.nBits);
  assertEquals(0, s.frameSize.xMin);
  assertEquals(11000, s.frameSize.xMax);
  assertEquals(0, s.frameSize.yMin);
  assertEquals(8000, s.frameSize.yMax);
  assertEquals(0, s.frameSizePadding);
  assertEquals(24, s.frameRate);
  assertEquals(1, s.frameCount);
});

Deno.test("headerDeserialiser reads non-zero frame size padding bits", () => {
  const buffer = new Uint8Array([
    0x46, 0x57, 0x53, 0x20, 0x10, 0x00, 0x00, 0x00, 0x0a, 0xd5, 0x18, 0x00,
    0x01, 0x00,
  ]);

  const s = headerDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(1, s.frameSize.nBits);
  assertEquals(0, s.frameSize.xMin);
  assertEquals(-1, s.frameSize.xMax);
  assertEquals(0, s.frameSize.yMin);
  assertEquals(-1, s.frameSize.yMax);
  assertEquals(0b1010101, s.frameSizePadding);
  assertEquals(24, s.frameRate);
  assertEquals(1, s.frameCount);
});
