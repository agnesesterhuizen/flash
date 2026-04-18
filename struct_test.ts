import { Bitstream } from "./bitstream.ts";
import { DeserialiserFactory, bit, u8, u16, array, struct } from "./struct.ts";
import { assertEquals } from "https://deno.land/std@0.187.0/testing/asserts.ts";

Deno.test("basic fields - bit", () => {
  type Data = {
    field: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("field", bit())
    .build();

  const buffer = new Uint8Array([0b1000_0000]);
  const d = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(1, d.field);
});

Deno.test("basic fields - multiple bits", () => {
  type Data = {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("a", bit())
    .field("b", bit())
    .field("c", bit())
    .field("d", bit())
    .field("e", bit())
    .build();

  const buffer = new Uint8Array([0b1011_0000]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(1, s.a);
  assertEquals(0, s.b);
  assertEquals(1, s.c);
  assertEquals(1, s.d);
  assertEquals(0, s.e);
});

Deno.test("basic fields - u8", () => {
  type Data = {
    field: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("field", u8())
    .build();

  const buffer = new Uint8Array([123]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(123, s.field);
});

Deno.test("basic fields - u16", () => {
  type Data = {
    field: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("field", u16())
    .build();

  const buffer = new Uint8Array([0xff, 0b0000_0001]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(511, s.field);
});

// Deno.test("basic fields - multiple", () => {
//   type Data = {
//     test_bit: number;
//     test_8: number;
//     test_16: number;
//   };

//   const deserialiser = new DeserialiserFactory<Data>()
//     .field("test_bit", bit())
//     .field("test_8", u8())
//     .field("test_16", u16())
//     .build();

//   const buffer = new Uint8Array([0b1_0111_101, 0b1_0000_000, 0b0_0111_0101, 0]);
//   const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

//   assertEquals(1, s.test_bit);
//   assertEquals(123, s.test_8);
//   assertEquals(234, s.test_16);
// });

Deno.test("conditional fields - false", () => {
  type Data = {
    a: number;
    b: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("a", bit())
    .conditionalField((s) => s.a === 1, "b", bit())
    .build();

  const buffer = new Uint8Array([0b0100_0000]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(0, s.a);
  assertEquals(undefined, s.b);
});

Deno.test("conditional fields - true", () => {
  type Data = {
    a: number;
    b: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("a", bit())
    .conditionalField((s) => s.a === 1, "b", bit())
    .build();

  const buffer = new Uint8Array([0b1100_0000]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(1, s.a);
  assertEquals(1, s.b);
});

Deno.test("struct fields ", () => {
  type Data = {
    a: {
      b: number;
    };
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("a", struct(new DeserialiserFactory().field("b", u8()).build()))
    .build();

  const buffer = new Uint8Array([0xab]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(0xab, s.a?.b);
});

Deno.test("struct fields - mixed data", () => {
  type Data = {
    a: number;
    b: {
      c: number;
    };
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("a", u8())
    .field("b", struct(new DeserialiserFactory().field("c", u8()).build()))
    .build();

  const buffer = new Uint8Array([0b1000_0001, 0b1000_0010]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(129, s.a);
  assertEquals(130, s.b.c);
});

Deno.test("array of structs", () => {
  type ElementData = { element: number };
  type Data = {
    array: ElementData[];
  };

  const elDeseriser = new DeserialiserFactory<ElementData>()
    .field("element", bit())
    .build();

  const deserialiser = new DeserialiserFactory<Data>()
    .field("array", array(elDeseriser, 3))
    .build();

  const buffer = new Uint8Array([0b1010_0000]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(3, s.array.length);
  assertEquals(1, s.array[0].element);
  assertEquals(0, s.array[1].element);
  assertEquals(1, s.array[2].element);
});

Deno.test("array of structs - multiple fields", () => {
  type ElementData = { a: number; b: number };
  type Data = {
    array: ElementData[];
  };

  const elDeseriser = new DeserialiserFactory<ElementData>()
    .field("a", bit())
    .field("b", bit())
    .build();

  const deserialiser = new DeserialiserFactory<Data>()
    .field("array", array(elDeseriser, 3))
    .build();

  const buffer = new Uint8Array([0b1001_1000]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(3, s.array.length);
  assertEquals(1, s.array[0].a);
  assertEquals(0, s.array[0].b);
  assertEquals(0, s.array[1].a);
  assertEquals(1, s.array[1].b);
  assertEquals(1, s.array[2].a);
  assertEquals(0, s.array[2].b);
});
