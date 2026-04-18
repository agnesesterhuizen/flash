import { assertEquals } from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { parseFillStyleArray } from "./parser.ts";
import { BitstreamReader } from "npm:@astronautlabs/bitstream";
import { BitStream } from "./dataview.ts";

// -0000_00010-_0000_0000
// -000_00010_0-000_0000
Deno.test("parseFillStyleArray - empty", () => {
  const buffer = new Uint8Array([254, 0, 0]);
  //   const bitstream = new BitStream(buffer);
  const bitstream = new BitstreamReader();
  bitstream.addBuffer(buffer);

  //   console.log("buffer", bitstream);
  //   console.log("buffer", bitstream);

  //   for (let i = 0; i < 8; i++) {
  //     console.log("x", i, bitstream.readSync(1));
  //   }

  const result = parseFillStyleArray(bitstream, "Shape1");
  assertEquals(0, result.length);
});
