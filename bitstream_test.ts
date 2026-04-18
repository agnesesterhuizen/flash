import { assertEquals } from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { Bitstream } from "./bitstream.ts";

// Deno.test("Bitstream.read - bit in first byte, set", () => {
//   const bs = new Bitstream(new Uint8Array([0b10]));
//   assertEquals(1, bs.read(1));
// });

// Deno.test("Bitstream.read - bit in first byte, unset", () => {
//   const bs = new Bitstream(new Uint8Array([0b01]));
//   assertEquals(0, bs.read(1));
// });

// Deno.test("Bitstream.read - bit in second byte, set", () => {
//   const bs = new Bitstream(new Uint8Array([0, 0b100]));
//   assertEquals(1, bs.read(8 + 2));
// });

// Deno.test("Bitstream.read - bit in second byte, unset", () => {
//   const bs = new Bitstream(new Uint8Array([0, 0b10]));
//   assertEquals(0, bs.read(8 + 0));
// });

// const readRangeTestCases = [
//   { input: [0b1], expectedResult: 1, startIndex: 7, length: 1 },
//   { input: [0b11], expectedResult: 3, startIndex: 6, length: 2 },
//   { input: [0b110], expectedResult: 6, startIndex: 5, length: 3 },
//   { input: [0b101], expectedResult: 5, startIndex: 5, length: 3 },
//   { input: [0b0100_0000], expectedResult: 1, startIndex: 1, length: 1 },
//   { input: [0b1000_0000], expectedResult: 1, startIndex: 0, length: 1 },
//   {
//     input: [0b0000_0001, 0b1000_0000],
//     expectedResult: 3,
//     startIndex: 7,
//     length: 2,
//   },
// ];

// for (const testCase of readRangeTestCases) {
//   Deno.test(
//     `Bitstream.readRange(${testCase.startIndex}, ${testCase.length}) with input ${testCase.input} => ${testCase.expectedResult}`,
//     () => {
//       const bs = new Bitstream(new Uint8Array(testCase.input));
//       assertEquals(
//         testCase.expectedResult,
//         bs.readRange(testCase.startIndex, testCase.length)
//       );
//     }
//   );
// }

// Deno.test("Bitstream.readRange - rect", () => {
//   const expectedNBits = 15;
//   const expected = { xMin: 0, xMax: 15200, yMin: 0, yMax: 12000 };

//   const rectBuffer = new Uint8Array([120, 0, 7, 108, 0, 0, 23, 112, 0]);
//   const bs = new Bitstream(rectBuffer);

//   // Nbits UB[5] Bits in each rect value field
//   const nBits = bs.readRange(0, 5);
//   assertEquals(expectedNBits, nBits);
//   // Xmin SB[Nbits] x minimum position for rect
//   assertEquals(expected.xMin, bs.readRange(5 + nBits * 0, nBits));
//   // Xmax SB[Nbits] x maximum position for rect
//   assertEquals(expected.xMax, bs.readRange(5 + nBits * 1, nBits));
//   // Ymin SB[Nbits] y minimum position for rect
//   assertEquals(expected.yMin, bs.readRange(5 + nBits * 2, nBits));
//   // Ymax SB[Nbits] y maximum position for rect
//   assertEquals(expected.yMax, bs.readRange(5 + nBits * 3, nBits));
// });
