import { Bitstream } from "./bitstream.ts";
import {
  array,
  bit,
  bytes,
  DeserialiserFactory,
  struct,
  u16,
  u32,
  u8,
} from "./struct.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";

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

Deno.test("basic fields - u32", () => {
  type Data = {
    field: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("field", u32())
    .build();

  const buffer = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(0x12345678, s.field);
});

Deno.test("basic fields - bytes", () => {
  type Data = {
    field: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("field", bytes(3))
    .build();

  const buffer = new Uint8Array([0b1010_0000]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(0b101, s.field);
});

Deno.test("basic fields - mixed widths", () => {
  type Data = {
    test_bit: number;
    test_8: number;
    test_16: number;
  };

  const deserialiser = new DeserialiserFactory<Data>()
    .field("test_bit", bit())
    .field("test_8", u8())
    .field("test_16", u16())
    .build();

  const buffer = new Uint8Array([0xbd, 0xf5, 0x00, 0x00]);
  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  assertEquals(1, s.test_bit);
  assertEquals(123, s.test_8);
  assertEquals(234, s.test_16);
});

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

Deno.test(
  "dynamic field type resolvers can use parsed fields and context",
  () => {
    type Data = {
      width: number;
      value: number;
      fromContext: number;
    };

    const deserialiser = new DeserialiserFactory<Data>()
      .field("width", bytes(3))
      .field("value", (s) => bytes(s.width as number))
      .field("fromContext", (_s, context) => bytes(context.bits as number))
      .build();

    const buffer = new Uint8Array([0b10110110, 0b1100_0000]);
    const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer), {
      bits: 2,
    });

    assertEquals(0b101, s.width);
    assertEquals(0b10110, s.value);
    assertEquals(0b11, s.fromContext);
  },
);

Deno.test(
  "array of structs without a fixed length reads until the buffer ends",
  () => {
    type ElementData = { value: number };
    type Data = {
      array: ElementData[];
    };

    const elementDeserialiser = new DeserialiserFactory<ElementData>()
      .field("value", bytes(2))
      .build();

    const deserialiser = new DeserialiserFactory<Data>()
      .field("array", array(elementDeserialiser))
      .build();

    const buffer = new Uint8Array([0b0110_1100]);
    const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

    assertEquals(4, s.array.length);
    assertEquals(0b01, s.array[0].value);
    assertEquals(0b10, s.array[1].value);
    assertEquals(0b11, s.array[2].value);
    assertEquals(0b00, s.array[3].value);
  },
);

Deno.test(
  "array of structs without a fixed length stops on end of buffer",
  () => {
    type ElementData = { a: number; b: number };
    type Data = {
      array: ElementData[];
    };

    const elementDeserialiser = new DeserialiserFactory<ElementData>()
      .field("a", u8())
      .field("b", u8())
      .build();

    const deserialiser = new DeserialiserFactory<Data>()
      .field("array", array(elementDeserialiser))
      .build();

    const buffer = new Uint8Array([1, 2, 3]);
    const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

    assertEquals(1, s.array.length);
    assertEquals(1, s.array[0].a);
    assertEquals(2, s.array[0].b);
  },
);

Deno.test(
  "array of structs without a fixed length rethrows non-buffer errors",
  () => {
    type Data = {
      array: { value: number }[];
    };

    const throwingDeserialiser = {
      deserialise() {
        throw new Error("boom");
      },
    };

    const deserialiser = new DeserialiserFactory<Data>()
      .field("array", array(throwingDeserialiser))
      .build();

    assertThrows(
      () =>
        deserialiser.deserialise(Bitstream.fromBuffer(new Uint8Array([0xff]))),
      Error,
      "boom",
    );
  },
);

Deno.test(
  "if builder applies nested field definitions when the predicate matches",
  () => {
    type Data = {
      flag: number;
      value: number;
      nested: number;
    };

    const deserialiser = new DeserialiserFactory<Data>()
      .field("flag", bit())
      .if(
        (s) => s.flag === 1,
        (f) =>
          f
            .field("value", u8())
            .conditionalField((s) => s.value === 7, "nested", u8()),
      )
      .build();

    const buffer = new Uint8Array([0b1000_0011, 0b1000_0000, 0b1000_0000]);
    const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

    assertEquals(1, s.flag);
    assertEquals(7, s.value);
    assertEquals(1, s.nested);
  },
);

Deno.test(
  "if builder skips nested field definitions when the predicate does not match",
  () => {
    type Data = {
      flag: number;
      value: number;
    };

    const deserialiser = new DeserialiserFactory<Data>()
      .field("flag", bit())
      .if(
        (s) => s.flag === 1,
        (f) => f.field("value", u8()),
      )
      .build();

    const buffer = new Uint8Array([0b0000_0000]);
    const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

    assertEquals(0, s.flag);
    assertEquals(undefined, s.value);
  },
);

Deno.test("deserialiser.type can be reused as a nested struct type", () => {
  type Child = {
    value: number;
  };
  type Parent = {
    child: Child;
  };

  const child = new DeserialiserFactory<Child>().field("value", u8()).build();

  const parent = new DeserialiserFactory<Parent>()
    .field("child", child.type())
    .build();

  const s = parent.deserialise(Bitstream.fromBuffer(new Uint8Array([0x2a])));

  assertEquals(0x2a, s.child.value);
});
