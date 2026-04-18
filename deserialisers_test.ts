import { assertEquals } from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { headerDeserialiser, rectDeserialiser } from "./deserialisers.ts";
import { Bitstream } from "./bitstream.ts";

// Deno.test("rectDeserialiser", () => {
//   const buffer = new Uint8Array([120, 0, 5, 95, 0, 0, 15, 160, 0]);
//   const s = rectDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

//   console.log("s", s);

//   assertEquals(15, s.nBits);
//   assertEquals(0, s.xMin);
//   assertEquals(11000, s.xMax);
//   assertEquals(0, s.yMin);
//   assertEquals(8000, s.yMax);
// });

Deno.test("headerDeserialiser", () => {
  const buffer = new Uint8Array([
    0x46,
    0x57,
    0x53,
    0x20,
    0x91,
    0x00,
    0x00,
    0x00,
    0x78,
    0x00,
    0x05,
    0x5f,
    0x00,
    0x00,
    0x0f,
    0xa0,
    0x00,
    0x18,
    0x00,
    0x01,
    0x00,
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
  assertEquals(24, s.frameRate);
  assertEquals(1, s.frameCount);
});
