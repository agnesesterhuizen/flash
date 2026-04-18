import { assertEquals } from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { parseFillStyleArray } from "./parser.ts";
import { Bitstream } from "./bitstream.ts";

// -0000_00010-_0000_0000
// -000_00010_0-000_0000
Deno.test("parseFillStyleArray - empty", () => {
  const buffer = new Uint8Array([254, 0, 0]);
  const bitstream = Bitstream.fromBuffer(buffer);

  const result = parseFillStyleArray(bitstream, "Shape1");
  assertEquals(0, result.length);
});
