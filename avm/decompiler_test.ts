import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { Decompiler } from "./decompiler.ts";

// Helper: encode a u30 value as variable-length bytes
function encodeU30(value: number): number[] {
  const bytes: number[] = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}

// Helper: encode a u16 little-endian
function encodeU16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

// Helper: encode an s32 as variable-length bytes
function encodeS32(value: number): number[] {
  const bytes: number[] = [];
  let more = true;
  while (more) {
    let byte = value & 0x7f;
    value >>= 7;
    if (
      (value === 0 && (byte & 0x40) === 0) ||
      (value === -1 && (byte & 0x40) !== 0)
    ) {
      more = false;
    } else {
      byte |= 0x80;
    }
    bytes.push(byte);
  }
  return bytes;
}

// Helper: encode a d64 little-endian
function encodeD64(value: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, true);
  return [...new Uint8Array(buf)];
}

// Helper: encode a UTF-8 string with u30 length prefix
function encodeString(s: string): number[] {
  const encoded = new TextEncoder().encode(s);
  return [...encodeU30(encoded.length), ...encoded];
}

// Build a minimal abcFile byte array with empty constant pool
function buildMinimalAbc(
  opts: {
    major?: number;
    minor?: number;
    integers?: number[];
    uintegers?: number[];
    doubles?: number[];
    strings?: string[];
    namespaces?: { kind: number; name: number }[];
    nsSets?: number[][];
    multinames?: { kind: number; data: number[] }[];
    methodCount?: number;
  } = {},
): number[] {
  const bytes: number[] = [];

  bytes.push(...encodeU16(opts.minor ?? 16));
  bytes.push(...encodeU16(opts.major ?? 46));

  // integers (count is entries + 1)
  const ints = opts.integers ?? [];
  bytes.push(...encodeU30(ints.length + 1));
  for (const v of ints) bytes.push(...encodeS32(v));

  // uintegers
  const uints = opts.uintegers ?? [];
  bytes.push(...encodeU30(uints.length + 1));
  for (const v of uints) bytes.push(...encodeU30(v));

  // doubles
  const dbls = opts.doubles ?? [];
  bytes.push(...encodeU30(dbls.length + 1));
  for (const v of dbls) bytes.push(...encodeD64(v));

  // strings
  const strs = opts.strings ?? [];
  bytes.push(...encodeU30(strs.length + 1));
  for (const s of strs) bytes.push(...encodeString(s));

  // namespaces
  const nss = opts.namespaces ?? [];
  bytes.push(...encodeU30(nss.length + 1));
  for (const ns of nss) {
    bytes.push(ns.kind);
    bytes.push(...encodeU30(ns.name));
  }

  // ns_sets
  const sets = opts.nsSets ?? [];
  bytes.push(...encodeU30(sets.length + 1));
  for (const set of sets) {
    bytes.push(...encodeU30(set.length));
    for (const ns of set) bytes.push(...encodeU30(ns));
  }

  // multinames
  const mns = opts.multinames ?? [];
  bytes.push(...encodeU30(mns.length + 1));
  for (const mn of mns) {
    bytes.push(mn.kind);
    bytes.push(...mn.data);
  }

  // method_count
  bytes.push(...encodeU30(opts.methodCount ?? 0));

  return bytes;
}

Deno.test("parses version numbers", () => {
  const abc = new Decompiler().run(buildMinimalAbc({ major: 46, minor: 16 }));
  assertEquals(abc.majorVersion, 46);
  assertEquals(abc.minorVersion, 16);
});

Deno.test("parses empty constant pool", () => {
  const abc = new Decompiler().run(buildMinimalAbc());
  assertEquals(abc.constantPool.integers, []);
  assertEquals(abc.constantPool.uintegers, []);
  assertEquals(abc.constantPool.doubles, []);
  assertEquals(abc.constantPool.strings, []);
  assertEquals(abc.constantPool.namespaces, []);
  assertEquals(abc.constantPool.nsSets, []);
  assertEquals(abc.constantPool.multinames, []);
});

Deno.test("parses integers including negative values", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({ integers: [0, 42, -1, 300, -128] }),
  );
  assertEquals(abc.constantPool.integers, [0, 42, -1, 300, -128]);
});

Deno.test("parses unsigned integers", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({ uintegers: [0, 1, 255, 65535] }),
  );
  assertEquals(abc.constantPool.uintegers, [0, 1, 255, 65535]);
});

Deno.test("parses doubles", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({ doubles: [1.5, 0.0, -3.14] }),
  );
  assertEquals(abc.constantPool.doubles.length, 3);
  assertEquals(abc.constantPool.doubles[0], 1.5);
  assertEquals(abc.constantPool.doubles[1], 0.0);
  assertAlmostEquals(abc.constantPool.doubles[2], -3.14);
});

function assertAlmostEquals(a: number, b: number, epsilon = 1e-10) {
  if (Math.abs(a - b) > epsilon) {
    throw new Error(`Expected ${a} to be close to ${b}`);
  }
}

Deno.test("parses strings", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({ strings: ["hello", "", "café"] }),
  );
  assertEquals(abc.constantPool.strings, ["hello", "", "café"]);
});

Deno.test("parses namespaces", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["flash.display"],
      namespaces: [
        { kind: 0x08, name: 1 }, // CONSTANT_Namespace, points to string[1]
        { kind: 0x16, name: 0 }, // CONSTANT_PackageNamespace, empty name
      ],
    }),
  );
  assertEquals(abc.constantPool.namespaces, [
    { kind: 0x08, name: 1 },
    { kind: 0x16, name: 0 },
  ]);
});

Deno.test("parses namespace sets", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      namespaces: [
        { kind: 0x08, name: 0 },
        { kind: 0x16, name: 0 },
      ],
      nsSets: [[1, 2]],
    }),
  );
  assertEquals(abc.constantPool.nsSets, [[1, 2]]);
});

Deno.test("parses QName multiname", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["Object"],
      namespaces: [{ kind: 0x16, name: 0 }],
      multinames: [
        { kind: 0x07, data: [...encodeU30(1), ...encodeU30(1)] }, // QName: ns=1, name=1
      ],
    }),
  );
  assertEquals(abc.constantPool.multinames.length, 1);
  assertEquals(abc.constantPool.multinames[0], { kind: 0x07, ns: 1, name: 1 });
});

Deno.test("parses RTQName multiname", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["r"],
      multinames: [
        { kind: 0x0f, data: [...encodeU30(1)] }, // RTQName: name=1
      ],
    }),
  );
  assertEquals(abc.constantPool.multinames[0], { kind: 0x0f, name: 1 });
});

Deno.test("parses RTQNameL multiname (no data)", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      multinames: [{ kind: 0x11, data: [] }],
    }),
  );
  assertEquals(abc.constantPool.multinames[0], { kind: 0x11 });
});

Deno.test("parses Multiname (with namespace set)", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["f"],
      namespaces: [{ kind: 0x16, name: 0 }],
      nsSets: [[1]],
      multinames: [
        { kind: 0x09, data: [...encodeU30(1), ...encodeU30(1)] }, // name=1, nsSet=1
      ],
    }),
  );
  assertEquals(abc.constantPool.multinames[0], {
    kind: 0x09,
    name: 1,
    nsSet: 1,
  });
});

Deno.test("parses MultinameL (namespace set only)", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      namespaces: [{ kind: 0x16, name: 0 }],
      nsSets: [[1]],
      multinames: [{ kind: 0x1b, data: [...encodeU30(1)] }],
    }),
  );
  assertEquals(abc.constantPool.multinames[0], { kind: 0x1b, nsSet: 1 });
});

Deno.test("parses multiple multiname kinds together", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["a", "b"],
      namespaces: [{ kind: 0x16, name: 0 }],
      nsSets: [[1]],
      multinames: [
        { kind: 0x07, data: [...encodeU30(1), ...encodeU30(1)] },
        { kind: 0x0f, data: [...encodeU30(2)] },
        { kind: 0x11, data: [] },
        { kind: 0x09, data: [...encodeU30(1), ...encodeU30(1)] },
        { kind: 0x1b, data: [...encodeU30(1)] },
      ],
    }),
  );
  assertEquals(abc.constantPool.multinames.length, 5);
});

Deno.test("throws on unknown multiname kind", () => {
  assertThrows(
    () =>
      new Decompiler().run(
        buildMinimalAbc({
          multinames: [{ kind: 0xff, data: [] }],
        }),
      ),
    Error,
    "Unknown multiname kind: 0xff",
  );
});

Deno.test("parses method count", () => {
  const abc = new Decompiler().run(buildMinimalAbc({ methodCount: 42 }));
  assertEquals(abc.methodCount, 42);
});

Deno.test("parses large u30 method count (multi-byte encoding)", () => {
  const abc = new Decompiler().run(buildMinimalAbc({ methodCount: 300 }));
  assertEquals(abc.methodCount, 300);
});

Deno.test("handles u30 values requiring 5 bytes", () => {
  // 0x3FFFFFFF = max u30 value
  const abc = new Decompiler().run(
    buildMinimalAbc({ methodCount: 0x3fffffff }),
  );
  assertEquals(abc.methodCount, 0x3fffffff);
});
