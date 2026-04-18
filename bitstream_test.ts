import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { Bitstream } from "./bitstream.ts";

Deno.test("Bitstream.fromBuffer exposes the full bit length", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0xaa, 0x55]));

  assertEquals(16, bs.available);
  assertEquals(0, bs.index);
});

Deno.test(
  "Bitstream.read consumes bits sequentially across byte boundaries",
  () => {
    const bs = Bitstream.fromBuffer(new Uint8Array([0b1010_1100, 0b1111_0000]));

    assertEquals(0b101, bs.read(3));
    assertEquals(13, bs.available);
    assertEquals(0b01100, bs.read(5));
    assertEquals(8, bs.available);
    assertEquals(0b1111, bs.read(4));
    assertEquals(0b0000, bs.read(4));
    assertEquals(0, bs.available);
  },
);

Deno.test(
  "Bitstream.read throws when reading past the end of the buffer",
  () => {
    const bs = Bitstream.fromBuffer(new Uint8Array([0b1010_0000]));

    bs.read(8);

    assertThrows(() => bs.read(1), Error, "end of buffer");
  },
);

Deno.test("Bitstream.readU8 reads one byte", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0xab]));

  assertEquals(0xab, bs.readU8());
  assertEquals(0, bs.available);
});

Deno.test("Bitstream.readU16 reads little-endian values", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0x34, 0x12]));

  assertEquals(0x1234, bs.readU16());
  assertEquals(0, bs.available);
});

Deno.test("Bitstream.readU32 reads little-endian values", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0x78, 0x56, 0x34, 0x12]));

  assertEquals(0x12345678, bs.readU32());
  assertEquals(0, bs.available);
});

Deno.test("Bitstream.readu32 is an alias for readU32", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0x78, 0x56, 0x34, 0x12]));

  assertEquals(0x12345678, bs.readu32());
  assertEquals(0, bs.available);
});

Deno.test("Bitstream.readSync delegates to read", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0b1011_0000]));

  assertEquals(0b1011, bs.readSync(4));
  assertEquals(4, bs.available);
});

Deno.test(
  "Bitstream.readSigned currently reinterprets the value through a Uint32Array",
  () => {
    const bs = Bitstream.fromBuffer(new Uint8Array([0xff]));

    assertEquals(4278190080, bs.readSigned(8));
    assertEquals(0, bs.available);
  },
);

Deno.test("Bitstream.read returns the first bit when it is set", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0b1000_0000]));

  assertEquals(1, bs.read(1));
  assertEquals(7, bs.available);
});

Deno.test("Bitstream.read returns the first bit when it is unset", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0b0100_0000]));

  assertEquals(0, bs.read(1));
  assertEquals(7, bs.available);
});

Deno.test("Bitstream.read can reach a set bit in the second byte", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0x00, 0b0010_0000]));

  assertEquals(0b00000000001, bs.read(11));
  assertEquals(5, bs.available);
});

Deno.test("Bitstream.read can reach an unset bit in the second byte", () => {
  const bs = Bitstream.fromBuffer(new Uint8Array([0xff, 0b0100_0000]));

  assertEquals(0b111111110, bs.read(9));
  assertEquals(7, bs.available);
});
