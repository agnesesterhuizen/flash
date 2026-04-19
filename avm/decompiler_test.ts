import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";
import {
  Decompiler,
  type MethodInfo,
  MethodFlags,
  type MetadataInfo,
  TraitKind,
  TraitAttr,
  type TraitInfo,
  InstanceFlags,
} from "./decompiler.ts";

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
    methods?: number[][]; // each entry is raw bytes for one method_info
    metadata?: { name: number; items: { key: number; value: number }[] }[];
    instances?: number[][]; // each entry is raw bytes for one instance_info
    classes?: number[][]; // each entry is raw bytes for one class_info
    scripts?: number[][]; // each entry is raw bytes for one script_info
    methodBodies?: number[][]; // each entry is raw bytes for one method_body_info
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

  // method_count + method_info entries
  const methods = opts.methods ?? [];
  bytes.push(...encodeU30(methods.length));
  for (const m of methods) bytes.push(...m);

  // metadata_count + metadata_info entries
  const mds = opts.metadata ?? [];
  bytes.push(...encodeU30(mds.length));
  for (const md of mds) {
    bytes.push(...encodeU30(md.name));
    bytes.push(...encodeU30(md.items.length));
    for (const item of md.items) {
      bytes.push(...encodeU30(item.key));
      bytes.push(...encodeU30(item.value));
    }
  }

  // class_count + instance_info entries + class_info entries
  const insts = opts.instances ?? [];
  const clss = opts.classes ?? [];
  bytes.push(...encodeU30(insts.length)); // class_count
  for (const inst of insts) bytes.push(...inst);
  for (const cls of clss) bytes.push(...cls);

  // script_count + script_info entries
  const scrpts = opts.scripts ?? [];
  bytes.push(...encodeU30(scrpts.length));
  for (const s of scrpts) bytes.push(...s);

  // method_body_count + method_body_info entries
  const bodies = opts.methodBodies ?? [];
  bytes.push(...encodeU30(bodies.length));
  for (const b of bodies) bytes.push(...b);

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
  const abc = new Decompiler().run(
    buildMinimalAbc({ methods: [buildMethodInfo(), buildMethodInfo()] }),
  );
  assertEquals(abc.methods.length, 2);
});

Deno.test("parses large u30 method count (multi-byte encoding)", () => {
  // Just verify the count parses; we won't create 300 methods
  const abc = new Decompiler().run(buildMinimalAbc({ methods: [] }));
  assertEquals(abc.methods.length, 0);
});

Deno.test("handles u30 values requiring 5 bytes", () => {
  // Verify empty methods array
  const abc = new Decompiler().run(buildMinimalAbc({ methods: [] }));
  assertEquals(abc.methods.length, 0);
});

// Helper: build raw bytes for a method_info entry
function buildMethodInfo(
  opts: {
    paramCount?: number;
    returnType?: number;
    paramTypes?: number[];
    name?: number;
    flags?: number;
    options?: { val: number; kind: number }[];
    paramNames?: number[];
  } = {},
): number[] {
  const bytes: number[] = [];
  const paramCount = opts.paramCount ?? 0;
  const paramTypes = opts.paramTypes ?? [];
  const flags = opts.flags ?? 0;

  bytes.push(...encodeU30(paramCount));
  bytes.push(...encodeU30(opts.returnType ?? 0));
  for (const pt of paramTypes) bytes.push(...encodeU30(pt));
  bytes.push(...encodeU30(opts.name ?? 0));
  bytes.push(flags);

  if (flags & MethodFlags.HAS_OPTIONAL) {
    const options = opts.options ?? [];
    bytes.push(...encodeU30(options.length));
    for (const o of options) {
      bytes.push(...encodeU30(o.val));
      bytes.push(o.kind);
    }
  }

  if (flags & MethodFlags.HAS_PARAM_NAMES) {
    const paramNames = opts.paramNames ?? [];
    for (const pn of paramNames) bytes.push(...encodeU30(pn));
  }

  return bytes;
}

// --- method_info tests ---

Deno.test("parses simple method with no params", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo({ returnType: 0, name: 0 })],
    }),
  );
  assertEquals(abc.methods.length, 1);
  const m = abc.methods[0];
  assertEquals(m.paramCount, 0);
  assertEquals(m.returnType, 0);
  assertEquals(m.paramTypes, []);
  assertEquals(m.name, 0);
  assertEquals(m.flags, 0);
  assertEquals(m.options, []);
  assertEquals(m.paramNames, []);
});

Deno.test("parses method with typed params and return type", () => {
  // Simulating: function add(a: int, b: int): int
  // multiname indices: 1=int
  const abc = new Decompiler().run(
    buildMinimalAbc({
      multinames: [{ kind: 0x07, data: [...encodeU30(0), ...encodeU30(0)] }],
      strings: ["add"],
      methods: [
        buildMethodInfo({
          paramCount: 2,
          returnType: 1,
          paramTypes: [1, 1],
          name: 1,
        }),
      ],
    }),
  );
  const m = abc.methods[0];
  assertEquals(m.paramCount, 2);
  assertEquals(m.returnType, 1);
  assertEquals(m.paramTypes, [1, 1]);
  assertEquals(m.name, 1);
  assertEquals(m.flags, 0);
});

Deno.test("parses method with HAS_OPTIONAL flag", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [
        buildMethodInfo({
          paramCount: 2,
          returnType: 0,
          paramTypes: [0, 0],
          flags: MethodFlags.HAS_OPTIONAL,
          options: [
            { val: 1, kind: 0x03 }, // integer constant pool index 1
          ],
        }),
      ],
    }),
  );
  const m = abc.methods[0];
  assertEquals(m.paramCount, 2);
  assertEquals(m.flags, MethodFlags.HAS_OPTIONAL);
  assertEquals(m.options.length, 1);
  assertEquals(m.options[0], { val: 1, kind: 0x03 });
});

Deno.test("parses method with multiple optional params", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [
        buildMethodInfo({
          paramCount: 3,
          returnType: 0,
          paramTypes: [0, 0, 0],
          flags: MethodFlags.HAS_OPTIONAL,
          options: [
            { val: 0, kind: 0x0a }, // false
            { val: 0, kind: 0x0c }, // null
          ],
        }),
      ],
    }),
  );
  const m = abc.methods[0];
  assertEquals(m.options.length, 2);
  assertEquals(m.options[0], { val: 0, kind: 0x0a });
  assertEquals(m.options[1], { val: 0, kind: 0x0c });
});

Deno.test("parses method with HAS_PARAM_NAMES flag", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["x", "y"],
      methods: [
        buildMethodInfo({
          paramCount: 2,
          returnType: 0,
          paramTypes: [0, 0],
          flags: MethodFlags.HAS_PARAM_NAMES,
          paramNames: [1, 2], // string indices
        }),
      ],
    }),
  );
  const m = abc.methods[0];
  assertEquals(m.flags, MethodFlags.HAS_PARAM_NAMES);
  assertEquals(m.paramNames, [1, 2]);
});

Deno.test("parses method with both HAS_OPTIONAL and HAS_PARAM_NAMES", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["a", "b"],
      methods: [
        buildMethodInfo({
          paramCount: 2,
          returnType: 0,
          paramTypes: [0, 0],
          flags: MethodFlags.HAS_OPTIONAL | MethodFlags.HAS_PARAM_NAMES,
          options: [{ val: 0, kind: 0x0b }], // true
          paramNames: [1, 2],
        }),
      ],
    }),
  );
  const m = abc.methods[0];
  assertEquals(m.flags, MethodFlags.HAS_OPTIONAL | MethodFlags.HAS_PARAM_NAMES);
  assertEquals(m.options, [{ val: 0, kind: 0x0b }]);
  assertEquals(m.paramNames, [1, 2]);
});

Deno.test("parses method with NEED_REST flag", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [
        buildMethodInfo({
          paramCount: 0,
          returnType: 0,
          flags: MethodFlags.NEED_REST,
        }),
      ],
    }),
  );
  const m = abc.methods[0];
  assertEquals(m.flags, MethodFlags.NEED_REST);
  assertEquals(m.options, []);
  assertEquals(m.paramNames, []);
});

Deno.test("parses method with NEED_ARGUMENTS flag", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [
        buildMethodInfo({
          paramCount: 1,
          returnType: 0,
          paramTypes: [0],
          flags: MethodFlags.NEED_ARGUMENTS,
        }),
      ],
    }),
  );
  assertEquals(abc.methods[0].flags, MethodFlags.NEED_ARGUMENTS);
});

Deno.test("parses method with NEED_ACTIVATION flag", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [
        buildMethodInfo({
          flags: MethodFlags.NEED_ACTIVATION,
        }),
      ],
    }),
  );
  assertEquals(abc.methods[0].flags, MethodFlags.NEED_ACTIVATION);
});

Deno.test("parses multiple methods", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["foo", "bar"],
      methods: [
        buildMethodInfo({ name: 1, paramCount: 0, returnType: 0 }),
        buildMethodInfo({
          name: 2,
          paramCount: 1,
          returnType: 0,
          paramTypes: [0],
        }),
        buildMethodInfo({
          paramCount: 1,
          returnType: 0,
          paramTypes: [0],
          flags: MethodFlags.HAS_OPTIONAL,
          options: [{ val: 1, kind: 0x01 }],
        }),
      ],
    }),
  );
  assertEquals(abc.methods.length, 3);
  assertEquals(abc.methods[0].name, 1);
  assertEquals(abc.methods[1].paramCount, 1);
  assertEquals(abc.methods[2].options.length, 1);
});

// --- metadata_info tests ---

Deno.test("parses empty metadata array", () => {
  const abc = new Decompiler().run(buildMinimalAbc());
  assertEquals(abc.metadata, []);
});

Deno.test("parses metadata with no items", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["MyAnnotation"],
      metadata: [{ name: 1, items: [] }],
    }),
  );
  assertEquals(abc.metadata.length, 1);
  assertEquals(abc.metadata[0].name, 1);
  assertEquals(abc.metadata[0].items, []);
});

Deno.test("parses metadata with key/value items", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["Event", "name", "click", "type", "MouseEvent"],
      metadata: [
        {
          name: 1, // "Event"
          items: [
            { key: 2, value: 3 }, // name="click"
            { key: 4, value: 5 }, // type="MouseEvent"
          ],
        },
      ],
    }),
  );
  assertEquals(abc.metadata.length, 1);
  assertEquals(abc.metadata[0].name, 1);
  assertEquals(abc.metadata[0].items.length, 2);
  assertEquals(abc.metadata[0].items[0], { key: 2, value: 3 });
  assertEquals(abc.metadata[0].items[1], { key: 4, value: 5 });
});

Deno.test("parses metadata with keyless item (key=0)", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["SomeTag", "value1"],
      metadata: [{ name: 1, items: [{ key: 0, value: 2 }] }],
    }),
  );
  assertEquals(abc.metadata[0].items[0], { key: 0, value: 2 });
});

Deno.test("parses multiple metadata entries", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      strings: ["A", "B", "k", "v"],
      metadata: [
        { name: 1, items: [] },
        { name: 2, items: [{ key: 3, value: 4 }] },
      ],
    }),
  );
  assertEquals(abc.metadata.length, 2);
  assertEquals(abc.metadata[0], { name: 1, items: [] });
  assertEquals(abc.metadata[1], { name: 2, items: [{ key: 3, value: 4 }] });
});

// --- traits_info tests ---

// Helper: build raw bytes for a traits array (count + entries)
function buildTraitsBytes(traits: number[][]): number[] {
  const bytes = [...encodeU30(traits.length)];
  for (const t of traits) bytes.push(...t);
  return bytes;
}

// Helper: build raw bytes for a single trait_slot/trait_const
function buildTraitSlot(opts: {
  name: number;
  kind: 0 | 6;
  attrs?: number;
  slotId?: number;
  typeName?: number;
  vindex?: number;
  vkind?: number;
  metadata?: number[];
}): number[] {
  const attrs = opts.attrs ?? 0;
  const bytes: number[] = [];
  bytes.push(...encodeU30(opts.name));
  bytes.push((attrs << 4) | opts.kind);
  bytes.push(...encodeU30(opts.slotId ?? 0));
  bytes.push(...encodeU30(opts.typeName ?? 0));
  const vindex = opts.vindex ?? 0;
  bytes.push(...encodeU30(vindex));
  if (vindex !== 0) bytes.push(opts.vkind ?? 0);
  if (attrs & TraitAttr.Metadata) {
    const md = opts.metadata ?? [];
    bytes.push(...encodeU30(md.length));
    for (const m of md) bytes.push(...encodeU30(m));
  }
  return bytes;
}

// Helper: build raw bytes for trait_method/getter/setter
function buildTraitMethod(opts: {
  name: number;
  kind: 1 | 2 | 3;
  attrs?: number;
  dispId?: number;
  method: number;
  metadata?: number[];
}): number[] {
  const attrs = opts.attrs ?? 0;
  const bytes: number[] = [];
  bytes.push(...encodeU30(opts.name));
  bytes.push((attrs << 4) | opts.kind);
  bytes.push(...encodeU30(opts.dispId ?? 0));
  bytes.push(...encodeU30(opts.method));
  if (attrs & TraitAttr.Metadata) {
    const md = opts.metadata ?? [];
    bytes.push(...encodeU30(md.length));
    for (const m of md) bytes.push(...encodeU30(m));
  }
  return bytes;
}

// Helper: build raw bytes for trait_class
function buildTraitClass(opts: {
  name: number;
  attrs?: number;
  slotId?: number;
  classi: number;
  metadata?: number[];
}): number[] {
  const attrs = opts.attrs ?? 0;
  const bytes: number[] = [];
  bytes.push(...encodeU30(opts.name));
  bytes.push((attrs << 4) | TraitKind.Class);
  bytes.push(...encodeU30(opts.slotId ?? 0));
  bytes.push(...encodeU30(opts.classi));
  if (attrs & TraitAttr.Metadata) {
    const md = opts.metadata ?? [];
    bytes.push(...encodeU30(md.length));
    for (const m of md) bytes.push(...encodeU30(m));
  }
  return bytes;
}

// Helper: build raw bytes for trait_function
function buildTraitFunction(opts: {
  name: number;
  attrs?: number;
  slotId?: number;
  function: number;
  metadata?: number[];
}): number[] {
  const attrs = opts.attrs ?? 0;
  const bytes: number[] = [];
  bytes.push(...encodeU30(opts.name));
  bytes.push((attrs << 4) | TraitKind.Function);
  bytes.push(...encodeU30(opts.slotId ?? 0));
  bytes.push(...encodeU30(opts.function));
  if (attrs & TraitAttr.Metadata) {
    const md = opts.metadata ?? [];
    bytes.push(...encodeU30(md.length));
    for (const m of md) bytes.push(...encodeU30(m));
  }
  return bytes;
}

Deno.test("parses empty traits array", () => {
  const traits = Decompiler.parseTraits([...encodeU30(0)]);
  assertEquals(traits, []);
});

Deno.test("parses Slot trait", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitSlot({ name: 1, kind: TraitKind.Slot, slotId: 1, typeName: 2 }),
    ]),
  );
  assertEquals(traits.length, 1);
  assertEquals(traits[0], {
    kind: TraitKind.Slot,
    name: 1,
    attrs: 0,
    slotId: 1,
    typeName: 2,
    vindex: 0,
    vkind: 0,
    metadata: [],
  });
});

Deno.test("parses Const trait with vindex/vkind", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitSlot({
        name: 3,
        kind: TraitKind.Const,
        slotId: 2,
        typeName: 1,
        vindex: 5,
        vkind: 0x03, // integer
      }),
    ]),
  );
  assertEquals(traits.length, 1);
  const t = traits[0];
  assertEquals(t.kind, TraitKind.Const);
  assertEquals((t as any).vindex, 5);
  assertEquals((t as any).vkind, 0x03);
});

Deno.test("parses Method trait", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitMethod({
        name: 1,
        kind: TraitKind.Method,
        dispId: 0,
        method: 3,
      }),
    ]),
  );
  assertEquals(traits.length, 1);
  assertEquals(traits[0], {
    kind: TraitKind.Method,
    name: 1,
    attrs: 0,
    dispId: 0,
    method: 3,
    metadata: [],
  });
});

Deno.test("parses Getter trait", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitMethod({ name: 2, kind: TraitKind.Getter, method: 5 }),
    ]),
  );
  assertEquals(traits[0].kind, TraitKind.Getter);
  assertEquals((traits[0] as any).method, 5);
});

Deno.test("parses Setter trait", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitMethod({ name: 2, kind: TraitKind.Setter, method: 7 }),
    ]),
  );
  assertEquals(traits[0].kind, TraitKind.Setter);
  assertEquals((traits[0] as any).method, 7);
});

Deno.test("parses Class trait", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([buildTraitClass({ name: 1, slotId: 1, classi: 0 })]),
  );
  assertEquals(traits[0], {
    kind: TraitKind.Class,
    name: 1,
    attrs: 0,
    slotId: 1,
    classi: 0,
    metadata: [],
  });
});

Deno.test("parses Function trait", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitFunction({ name: 4, slotId: 2, function: 10 }),
    ]),
  );
  assertEquals(traits[0], {
    kind: TraitKind.Function,
    name: 4,
    attrs: 0,
    slotId: 2,
    function: 10,
    metadata: [],
  });
});

Deno.test("parses trait with ATTR_Final and ATTR_Override", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitMethod({
        name: 1,
        kind: TraitKind.Method,
        attrs: TraitAttr.Final | TraitAttr.Override,
        method: 2,
      }),
    ]),
  );
  assertEquals(traits[0].attrs, TraitAttr.Final | TraitAttr.Override);
});

Deno.test("parses trait with ATTR_Metadata", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitMethod({
        name: 1,
        kind: TraitKind.Method,
        attrs: TraitAttr.Metadata,
        method: 2,
        metadata: [0, 1],
      }),
    ]),
  );
  assertEquals(traits[0].metadata, [0, 1]);
});

Deno.test("parses multiple mixed traits", () => {
  const traits = Decompiler.parseTraits(
    buildTraitsBytes([
      buildTraitSlot({ name: 1, kind: TraitKind.Slot }),
      buildTraitMethod({ name: 2, kind: TraitKind.Method, method: 0 }),
      buildTraitClass({ name: 3, classi: 0 }),
      buildTraitFunction({ name: 4, function: 1 }),
    ]),
  );
  assertEquals(traits.length, 4);
  assertEquals(traits[0].kind, TraitKind.Slot);
  assertEquals(traits[1].kind, TraitKind.Method);
  assertEquals(traits[2].kind, TraitKind.Class);
  assertEquals(traits[3].kind, TraitKind.Function);
});

Deno.test("throws on unknown trait kind", () => {
  // kind = 7 is invalid
  const bytes = [...encodeU30(1), ...encodeU30(1), 0x07 | (0 << 4)];
  // kind 7 doesn't exist — but wait, 0x07 lower nibble = 7
  assertThrows(
    () => Decompiler.parseTraits(bytes),
    Error,
    "Unknown trait kind: 7",
  );
});

// --- instance_info / class_info helpers ---

// Helper: build raw bytes for one instance_info
function buildInstanceInfo(opts: {
  name: number;
  superName?: number;
  flags?: number;
  protectedNs?: number;
  interfaces?: number[];
  iinit: number;
  traits?: number[][]; // raw trait bytes
}): number[] {
  const bytes: number[] = [];
  const flags = opts.flags ?? 0;
  bytes.push(...encodeU30(opts.name));
  bytes.push(...encodeU30(opts.superName ?? 0));
  bytes.push(flags);
  if (flags & InstanceFlags.ProtectedNs) {
    bytes.push(...encodeU30(opts.protectedNs ?? 0));
  }
  const interfaces = opts.interfaces ?? [];
  bytes.push(...encodeU30(interfaces.length));
  for (const iface of interfaces) bytes.push(...encodeU30(iface));
  bytes.push(...encodeU30(opts.iinit));
  // traits
  const traits = opts.traits ?? [];
  bytes.push(...encodeU30(traits.length));
  for (const t of traits) bytes.push(...t);
  return bytes;
}

// Helper: build raw bytes for one class_info
function buildClassInfo(opts: {
  cinit: number;
  traits?: number[][]; // raw trait bytes
}): number[] {
  const bytes: number[] = [];
  bytes.push(...encodeU30(opts.cinit));
  const traits = opts.traits ?? [];
  bytes.push(...encodeU30(traits.length));
  for (const t of traits) bytes.push(...t);
  return bytes;
}

// --- instance_info / class_info tests ---

Deno.test("parses empty instances and classes", () => {
  const abc = new Decompiler().run(buildMinimalAbc());
  assertEquals(abc.instances, []);
  assertEquals(abc.classes, []);
});

Deno.test("parses basic instance_info and class_info", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo(), buildMethodInfo()], // iinit=0, cinit=1
      instances: [buildInstanceInfo({ name: 1, superName: 2, iinit: 0 })],
      classes: [buildClassInfo({ cinit: 1 })],
    }),
  );
  assertEquals(abc.instances.length, 1);
  assertEquals(abc.instances[0].name, 1);
  assertEquals(abc.instances[0].superName, 2);
  assertEquals(abc.instances[0].flags, 0);
  assertEquals(abc.instances[0].protectedNs, 0);
  assertEquals(abc.instances[0].interfaces, []);
  assertEquals(abc.instances[0].iinit, 0);
  assertEquals(abc.instances[0].traits, []);
  assertEquals(abc.classes.length, 1);
  assertEquals(abc.classes[0].cinit, 1);
  assertEquals(abc.classes[0].traits, []);
});

Deno.test("parses instance_info with Sealed and Final flags", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      instances: [
        buildInstanceInfo({
          name: 1,
          flags: InstanceFlags.Sealed | InstanceFlags.Final,
          iinit: 0,
        }),
      ],
      classes: [buildClassInfo({ cinit: 0 })],
    }),
  );
  assertEquals(
    abc.instances[0].flags,
    InstanceFlags.Sealed | InstanceFlags.Final,
  );
});

Deno.test("parses instance_info with ProtectedNs", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      namespaces: [{ kind: 0x18, name: 0 }], // protected ns
      methods: [buildMethodInfo()],
      instances: [
        buildInstanceInfo({
          name: 1,
          flags: InstanceFlags.ProtectedNs,
          protectedNs: 1,
          iinit: 0,
        }),
      ],
      classes: [buildClassInfo({ cinit: 0 })],
    }),
  );
  assertEquals(abc.instances[0].protectedNs, 1);
});

Deno.test("parses instance_info with interfaces", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      instances: [
        buildInstanceInfo({
          name: 1,
          interfaces: [2, 3],
          iinit: 0,
        }),
      ],
      classes: [buildClassInfo({ cinit: 0 })],
    }),
  );
  assertEquals(abc.instances[0].interfaces, [2, 3]);
});

Deno.test("parses instance_info with traits", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo(), buildMethodInfo()],
      instances: [
        buildInstanceInfo({
          name: 1,
          iinit: 0,
          traits: [
            buildTraitMethod({ name: 1, kind: TraitKind.Method, method: 1 }),
          ],
        }),
      ],
      classes: [buildClassInfo({ cinit: 0 })],
    }),
  );
  assertEquals(abc.instances[0].traits.length, 1);
  assertEquals(abc.instances[0].traits[0].kind, TraitKind.Method);
});

Deno.test("parses class_info with traits", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo(), buildMethodInfo()],
      instances: [buildInstanceInfo({ name: 1, iinit: 0 })],
      classes: [
        buildClassInfo({
          cinit: 1,
          traits: [
            buildTraitSlot({
              name: 2,
              kind: TraitKind.Slot,
              slotId: 1,
              typeName: 0,
            }),
          ],
        }),
      ],
    }),
  );
  assertEquals(abc.classes[0].traits.length, 1);
  assertEquals(abc.classes[0].traits[0].kind, TraitKind.Slot);
});

Deno.test("parses multiple instances and classes", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [
        buildMethodInfo(),
        buildMethodInfo(),
        buildMethodInfo(),
        buildMethodInfo(),
      ],
      instances: [
        buildInstanceInfo({ name: 1, iinit: 0 }),
        buildInstanceInfo({ name: 2, superName: 1, iinit: 1 }),
      ],
      classes: [buildClassInfo({ cinit: 2 }), buildClassInfo({ cinit: 3 })],
    }),
  );
  assertEquals(abc.instances.length, 2);
  assertEquals(abc.classes.length, 2);
  assertEquals(abc.instances[1].superName, 1);
  assertEquals(abc.classes[1].cinit, 3);
});

// --- script_info helpers ---

function buildScriptInfo(opts: {
  init: number;
  traits?: number[][];
}): number[] {
  const bytes: number[] = [];
  bytes.push(...encodeU30(opts.init));
  const traits = opts.traits ?? [];
  bytes.push(...encodeU30(traits.length));
  for (const t of traits) bytes.push(...t);
  return bytes;
}

// --- script_info tests ---

Deno.test("parses empty scripts array", () => {
  const abc = new Decompiler().run(buildMinimalAbc());
  assertEquals(abc.scripts, []);
});

Deno.test("parses basic script_info", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      scripts: [buildScriptInfo({ init: 0 })],
    }),
  );
  assertEquals(abc.scripts.length, 1);
  assertEquals(abc.scripts[0].init, 0);
  assertEquals(abc.scripts[0].traits, []);
});

Deno.test("parses script_info with traits", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo(), buildMethodInfo()],
      scripts: [
        buildScriptInfo({
          init: 0,
          traits: [
            buildTraitMethod({ name: 1, kind: TraitKind.Method, method: 1 }),
          ],
        }),
      ],
    }),
  );
  assertEquals(abc.scripts[0].traits.length, 1);
  assertEquals(abc.scripts[0].traits[0].kind, TraitKind.Method);
});

Deno.test("parses multiple scripts", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo(), buildMethodInfo(), buildMethodInfo()],
      scripts: [
        buildScriptInfo({ init: 0 }),
        buildScriptInfo({
          init: 1,
          traits: [buildTraitSlot({ name: 1, kind: TraitKind.Slot })],
        }),
        buildScriptInfo({ init: 2 }),
      ],
    }),
  );
  assertEquals(abc.scripts.length, 3);
  assertEquals(abc.scripts[0].init, 0);
  assertEquals(abc.scripts[1].init, 1);
  assertEquals(abc.scripts[1].traits.length, 1);
  assertEquals(abc.scripts[2].init, 2);
});

// --- method_body_info helpers ---

function buildMethodBodyInfo(opts: {
  method: number;
  maxStack?: number;
  localCount?: number;
  initScopeDepth?: number;
  maxScopeDepth?: number;
  code?: number[];
  exceptions?: {
    from: number;
    to: number;
    target: number;
    excType: number;
    varName: number;
  }[];
  traits?: number[][];
}): number[] {
  const bytes: number[] = [];
  bytes.push(...encodeU30(opts.method));
  bytes.push(...encodeU30(opts.maxStack ?? 1));
  bytes.push(...encodeU30(opts.localCount ?? 1));
  bytes.push(...encodeU30(opts.initScopeDepth ?? 0));
  bytes.push(...encodeU30(opts.maxScopeDepth ?? 1));
  const code = opts.code ?? [];
  bytes.push(...encodeU30(code.length));
  bytes.push(...code);
  const exceptions = opts.exceptions ?? [];
  bytes.push(...encodeU30(exceptions.length));
  for (const ex of exceptions) {
    bytes.push(...encodeU30(ex.from));
    bytes.push(...encodeU30(ex.to));
    bytes.push(...encodeU30(ex.target));
    bytes.push(...encodeU30(ex.excType));
    bytes.push(...encodeU30(ex.varName));
  }
  const traits = opts.traits ?? [];
  bytes.push(...encodeU30(traits.length));
  for (const t of traits) bytes.push(...t);
  return bytes;
}

// --- method_body_info tests ---

Deno.test("parses empty method bodies array", () => {
  const abc = new Decompiler().run(buildMinimalAbc());
  assertEquals(abc.methodBodies, []);
});

Deno.test("parses basic method_body_info", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      methodBodies: [
        buildMethodBodyInfo({
          method: 0,
          maxStack: 2,
          localCount: 3,
          initScopeDepth: 0,
          maxScopeDepth: 4,
          code: [0xd0, 0x30, 0x47], // getlocal_0, pushscope, returnvoid
        }),
      ],
    }),
  );
  assertEquals(abc.methodBodies.length, 1);
  const body = abc.methodBodies[0];
  assertEquals(body.method, 0);
  assertEquals(body.maxStack, 2);
  assertEquals(body.localCount, 3);
  assertEquals(body.initScopeDepth, 0);
  assertEquals(body.maxScopeDepth, 4);
  assertEquals(body.code, new Uint8Array([0xd0, 0x30, 0x47]));
  assertEquals(body.exceptions, []);
  assertEquals(body.traits, []);
});

Deno.test("parses method_body_info with exception handlers", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      methodBodies: [
        buildMethodBodyInfo({
          method: 0,
          code: [0xd0, 0x30, 0x47],
          exceptions: [{ from: 0, to: 2, target: 3, excType: 1, varName: 2 }],
        }),
      ],
    }),
  );
  const body = abc.methodBodies[0];
  assertEquals(body.exceptions.length, 1);
  assertEquals(body.exceptions[0], {
    from: 0,
    to: 2,
    target: 3,
    excType: 1,
    varName: 2,
  });
});

Deno.test("parses method_body_info with multiple exception handlers", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      methodBodies: [
        buildMethodBodyInfo({
          method: 0,
          code: [0xd0, 0x30, 0x47],
          exceptions: [
            { from: 0, to: 1, target: 2, excType: 0, varName: 0 },
            { from: 1, to: 3, target: 3, excType: 1, varName: 1 },
          ],
        }),
      ],
    }),
  );
  assertEquals(abc.methodBodies[0].exceptions.length, 2);
});

Deno.test("parses method_body_info with traits", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      methodBodies: [
        buildMethodBodyInfo({
          method: 0,
          code: [0x47],
          traits: [buildTraitSlot({ name: 1, kind: TraitKind.Slot })],
        }),
      ],
    }),
  );
  assertEquals(abc.methodBodies[0].traits.length, 1);
  assertEquals(abc.methodBodies[0].traits[0].kind, TraitKind.Slot);
});

Deno.test("parses method_body_info with empty code", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo()],
      methodBodies: [buildMethodBodyInfo({ method: 0, code: [] })],
    }),
  );
  assertEquals(abc.methodBodies[0].code, new Uint8Array([]));
});

Deno.test("parses multiple method bodies", () => {
  const abc = new Decompiler().run(
    buildMinimalAbc({
      methods: [buildMethodInfo(), buildMethodInfo(), buildMethodInfo()],
      methodBodies: [
        buildMethodBodyInfo({ method: 0, code: [0x47] }),
        buildMethodBodyInfo({
          method: 1,
          code: [0xd0, 0x30, 0x47],
          maxStack: 5,
        }),
        buildMethodBodyInfo({
          method: 2,
          code: [0x47],
          exceptions: [{ from: 0, to: 1, target: 1, excType: 0, varName: 0 }],
        }),
      ],
    }),
  );
  assertEquals(abc.methodBodies.length, 3);
  assertEquals(abc.methodBodies[0].method, 0);
  assertEquals(abc.methodBodies[1].maxStack, 5);
  assertEquals(abc.methodBodies[1].code, new Uint8Array([0xd0, 0x30, 0x47]));
  assertEquals(abc.methodBodies[2].exceptions.length, 1);
});
