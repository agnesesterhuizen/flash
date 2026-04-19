import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.187.0/testing/asserts.ts";
import { disassemble } from "./decompiler.ts";
import type { AbcFile, ExceptionInfo, MethodBodyInfo } from "./decompiler.ts";
import {
  AVM,
  AVMThrowError,
  type AVMHost,
  type AVMValue,
  type AVMObject,
} from "./vm.ts";

// ── Helpers ──

function stubHost(): AVMHost {
  return {
    findHostClass: () => null,
    constructHost: () => ({ traits: new Map(), proto: null, class: null }),
    getHostProperty: () => undefined,
    setHostProperty: () => false,
    callHostMethod: () => undefined,
    trace: () => {},
  };
}

function makeAbc(opts: {
  code: number[];
  integers?: number[];
  uintegers?: number[];
  doubles?: number[];
  strings?: string[];
  namespaces?: { kind: number; name: number }[];
  multinames?: { kind: number; ns?: number; name?: number; nsSet?: number }[];
  localCount?: number;
  exceptions?: ExceptionInfo[];
}): AbcFile {
  const code = new Uint8Array(opts.code);
  const body: MethodBodyInfo = {
    method: 0,
    maxStack: 10,
    localCount: opts.localCount ?? 1,
    initScopeDepth: 0,
    maxScopeDepth: 1,
    code,
    instructions: disassemble(code),
    exceptions: opts.exceptions ?? [],
    traits: [],
  };
  return {
    majorVersion: 46,
    minorVersion: 16,
    constantPool: {
      integers: opts.integers ?? [],
      uintegers: opts.uintegers ?? [],
      doubles: opts.doubles ?? [],
      strings: opts.strings ?? [],
      namespaces: opts.namespaces ?? [],
      nsSets: [],
      multinames: (opts.multinames ??
        []) as AbcFile["constantPool"]["multinames"],
    },
    methods: [
      {
        paramCount: 0,
        returnType: 0,
        paramTypes: [],
        name: 0,
        flags: 0,
        options: [],
        paramNames: [],
      },
    ],
    metadata: [],
    instances: [],
    classes: [],
    scripts: [{ init: 0, traits: [] }],
    methodBodies: [body],
  };
}

function run(abc: AbcFile): AVMValue {
  const vm = new AVM(abc, stubHost());
  return vm.runMethodBody(0);
}

// ── pushnull ──

Deno.test("vm: pushnull + returnvalue", () => {
  const result = run(makeAbc({ code: [0x20, 0x48] }));
  assertEquals(result, null);
});

// ── pushundefined ──

Deno.test("vm: pushundefined + returnvalue", () => {
  const result = run(makeAbc({ code: [0x21, 0x48] }));
  assertEquals(result, undefined);
});

// ── pushtrue ──

Deno.test("vm: pushtrue + returnvalue", () => {
  const result = run(makeAbc({ code: [0x26, 0x48] }));
  assertEquals(result, true);
});

// ── pushfalse ──

Deno.test("vm: pushfalse + returnvalue", () => {
  const result = run(makeAbc({ code: [0x27, 0x48] }));
  assertEquals(result, false);
});

// ── pushnan ──

Deno.test("vm: pushnan + returnvalue", () => {
  const result = run(makeAbc({ code: [0x28, 0x48] }));
  assertEquals(Number.isNaN(result), true);
});

// ── pushbyte ──

Deno.test("vm: pushbyte positive", () => {
  const result = run(makeAbc({ code: [0x24, 42, 0x48] }));
  assertEquals(result, 42);
});

Deno.test("vm: pushbyte negative (sign-extended)", () => {
  // 0xff = -1 when sign-extended from 8-bit
  const result = run(makeAbc({ code: [0x24, 0xff, 0x48] }));
  assertEquals(result, -1);
});

Deno.test("vm: pushbyte 0x80 = -128", () => {
  const result = run(makeAbc({ code: [0x24, 0x80, 0x48] }));
  assertEquals(result, -128);
});

// ── pushshort ──

Deno.test("vm: pushshort positive", () => {
  // pushshort 300 (u30 encoded: 0xac, 0x02)
  const result = run(makeAbc({ code: [0x25, 0xac, 0x02, 0x48] }));
  assertEquals(result, 300);
});

Deno.test("vm: pushshort negative (sign-extended from 16-bit)", () => {
  // 65535 = 0xffff → sign-extend from 16-bit = -1
  // u30 encoding of 65535: [0xff, 0xff, 0x03]
  const result = run(makeAbc({ code: [0x25, 0xff, 0xff, 0x03, 0x48] }));
  assertEquals(result, -1);
});

// ── pushint ──

Deno.test("vm: pushint", () => {
  // pushint index=1 → integers[0] = 99
  const result = run(makeAbc({ code: [0x2d, 0x01, 0x48], integers: [99] }));
  assertEquals(result, 99);
});

Deno.test("vm: pushint negative value", () => {
  const result = run(makeAbc({ code: [0x2d, 0x01, 0x48], integers: [-42] }));
  assertEquals(result, -42);
});

// ── pushuint ──

Deno.test("vm: pushuint", () => {
  const result = run(
    makeAbc({ code: [0x2e, 0x01, 0x48], uintegers: [0xdeadbeef] }),
  );
  assertEquals(result, 0xdeadbeef);
});

// ── pushdouble ──

Deno.test("vm: pushdouble", () => {
  const result = run(makeAbc({ code: [0x2f, 0x01, 0x48], doubles: [3.14] }));
  assertEquals(result, 3.14);
});

// ── pushstring ──

Deno.test("vm: pushstring", () => {
  const result = run(makeAbc({ code: [0x2c, 0x01, 0x48], strings: ["hello"] }));
  assertEquals(result, "hello");
});

Deno.test("vm: pushstring index 2", () => {
  const result = run(
    makeAbc({ code: [0x2c, 0x02, 0x48], strings: ["a", "b"] }),
  );
  assertEquals(result, "b");
});

// ── pushnamespace ──

Deno.test("vm: pushnamespace", () => {
  // pushnamespace index=1 → namespaces[0].name = 2 → strings[1] = "flash.display"
  // But our VM currently pushes the name index number (ns.name)
  const result = run(
    makeAbc({
      code: [0x31, 0x01, 0x48],
      namespaces: [{ kind: 0x08, name: 1 }],
      strings: ["flash.display"],
    }),
  );
  assertEquals(result, 1);
});

// ── pop ──

Deno.test("vm: pop discards top of stack", () => {
  // push 10, push 20, pop → stack has [10], returnvalue → 10
  const result = run(makeAbc({ code: [0x24, 10, 0x24, 20, 0x29, 0x48] }));
  assertEquals(result, 10);
});

// ── dup ──

Deno.test("vm: dup duplicates top of stack", () => {
  // push 7, dup, pop → stack has [7], returnvalue → 7
  const result = run(makeAbc({ code: [0x24, 7, 0x2a, 0x29, 0x48] }));
  assertEquals(result, 7);
});

Deno.test("vm: dup leaves two copies", () => {
  // push 5, dup → stack [5, 5], pop both should work
  // push 5, dup, pop, returnvalue → 5
  const result = run(makeAbc({ code: [0x24, 5, 0x2a, 0x29, 0x48] }));
  assertEquals(result, 5);
});

// ── swap ──

Deno.test("vm: swap exchanges top two", () => {
  // push 1, push 2, swap, returnvalue → 1 (was at bottom, now on top after swap)
  const result = run(makeAbc({ code: [0x24, 1, 0x24, 2, 0x2b, 0x48] }));
  assertEquals(result, 1);
});

Deno.test("vm: swap then pop reveals other value", () => {
  // push 1, push 2, swap, pop, returnvalue → 2
  const result = run(makeAbc({ code: [0x24, 1, 0x24, 2, 0x2b, 0x29, 0x48] }));
  assertEquals(result, 2);
});

// ── returnvoid ──

Deno.test("vm: returnvoid returns undefined", () => {
  const result = run(makeAbc({ code: [0x47] }));
  assertEquals(result, undefined);
});

// ── returnvalue ──

Deno.test("vm: returnvalue pops and returns", () => {
  const result = run(makeAbc({ code: [0x24, 99, 0x48] }));
  assertEquals(result, 99);
});

// ── unimplemented opcode throws ──

Deno.test("vm: unimplemented opcode throws", () => {
  // 0xff is not a valid opcode
  assertThrows(
    () => run(makeAbc({ code: [0x01] })), // bkpt — not in opcode table, treated as unknown
    Error,
  );
});

// ── combined sequences ──

Deno.test("vm: push multiple, pop down to one, return", () => {
  // push 1, push 2, push 3, pop, pop, returnvalue → 1
  const result = run(
    makeAbc({ code: [0x24, 1, 0x24, 2, 0x24, 3, 0x29, 0x29, 0x48] }),
  );
  assertEquals(result, 1);
});

Deno.test("vm: pushstring, dup, pop, returnvalue", () => {
  const result = run(
    makeAbc({ code: [0x2c, 0x01, 0x2a, 0x29, 0x48], strings: ["test"] }),
  );
  assertEquals(result, "test");
});

// ── 2. Arithmetic & logic ──

Deno.test("vm: add numbers", () => {
  // pushbyte 3, pushbyte 4, add, returnvalue → 7
  assertEquals(run(makeAbc({ code: [0x24, 3, 0x24, 4, 0xa0, 0x48] })), 7);
});

Deno.test("vm: add string concatenation", () => {
  // pushstring 'hello', pushstring ' world', add, returnvalue → 'hello world'
  assertEquals(
    run(
      makeAbc({
        code: [0x2c, 0x01, 0x2c, 0x02, 0xa0, 0x48],
        strings: ["hello", " world"],
      }),
    ),
    "hello world",
  );
});

Deno.test("vm: add string + number coerces to string", () => {
  // pushstring 'n=', pushbyte 5, add, returnvalue → 'n=5'
  assertEquals(
    run(makeAbc({ code: [0x2c, 0x01, 0x24, 5, 0xa0, 0x48], strings: ["n="] })),
    "n=5",
  );
});

Deno.test("vm: subtract", () => {
  // pushbyte 10, pushbyte 3, subtract, returnvalue → 7
  assertEquals(run(makeAbc({ code: [0x24, 10, 0x24, 3, 0xa1, 0x48] })), 7);
});

Deno.test("vm: multiply", () => {
  // pushbyte 6, pushbyte 7, multiply, returnvalue → 42
  assertEquals(run(makeAbc({ code: [0x24, 6, 0x24, 7, 0xa2, 0x48] })), 42);
});

Deno.test("vm: divide", () => {
  // pushbyte 20, pushbyte 4, divide, returnvalue → 5
  assertEquals(run(makeAbc({ code: [0x24, 20, 0x24, 4, 0xa3, 0x48] })), 5);
});

Deno.test("vm: divide by zero", () => {
  // pushbyte 1, pushbyte 0, divide → Infinity
  assertEquals(
    run(makeAbc({ code: [0x24, 1, 0x24, 0, 0xa3, 0x48] })),
    Infinity,
  );
});

Deno.test("vm: modulo", () => {
  // pushbyte 10, pushbyte 3, modulo, returnvalue → 1
  assertEquals(run(makeAbc({ code: [0x24, 10, 0x24, 3, 0xa4, 0x48] })), 1);
});

Deno.test("vm: negate", () => {
  // pushbyte 5, negate, returnvalue → -5
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x90, 0x48] })), -5);
});

Deno.test("vm: negate negative", () => {
  // pushbyte -3 (0xfd), negate, returnvalue → 3
  assertEquals(run(makeAbc({ code: [0x24, 0xfd, 0x90, 0x48] })), 3);
});

Deno.test("vm: increment", () => {
  // pushbyte 9, increment, returnvalue → 10
  assertEquals(run(makeAbc({ code: [0x24, 9, 0x91, 0x48] })), 10);
});

Deno.test("vm: decrement", () => {
  // pushbyte 9, decrement, returnvalue → 8
  assertEquals(run(makeAbc({ code: [0x24, 9, 0x93, 0x48] })), 8);
});

Deno.test("vm: lshift", () => {
  // pushbyte 1, pushbyte 4, lshift → 16
  assertEquals(run(makeAbc({ code: [0x24, 1, 0x24, 4, 0xa5, 0x48] })), 16);
});

Deno.test("vm: rshift", () => {
  // pushbyte 32, pushbyte 2, rshift → 8
  assertEquals(run(makeAbc({ code: [0x24, 32, 0x24, 2, 0xa6, 0x48] })), 8);
});

Deno.test("vm: rshift sign-preserving", () => {
  // pushint -16, pushbyte 2, rshift → -4
  assertEquals(
    run(makeAbc({ code: [0x2d, 0x01, 0x24, 2, 0xa6, 0x48], integers: [-16] })),
    -4,
  );
});

Deno.test("vm: urshift", () => {
  // pushint -1, pushbyte 28, urshift → 15
  assertEquals(
    run(makeAbc({ code: [0x2d, 0x01, 0x24, 28, 0xa7, 0x48], integers: [-1] })),
    15,
  );
});

Deno.test("vm: bitand", () => {
  // pushbyte 0x0f, pushbyte 0x37, bitand → 0x07
  assertEquals(
    run(makeAbc({ code: [0x24, 0x0f, 0x24, 0x37, 0xa8, 0x48] })),
    0x07,
  );
});

Deno.test("vm: bitor", () => {
  // pushbyte 0x0f, pushbyte 0x30, bitor → 0x3f
  assertEquals(
    run(makeAbc({ code: [0x24, 0x0f, 0x24, 0x30, 0xa9, 0x48] })),
    0x3f,
  );
});

Deno.test("vm: bitxor", () => {
  // pushbyte 0x0f, pushbyte 0x0a, bitxor → 0x05
  assertEquals(
    run(makeAbc({ code: [0x24, 0x0f, 0x24, 0x0a, 0xaa, 0x48] })),
    0x05,
  );
});

Deno.test("vm: bitnot", () => {
  // pushbyte 0, bitnot → -1
  assertEquals(run(makeAbc({ code: [0x24, 0, 0x97, 0x48] })), -1);
});

Deno.test("vm: not truthy", () => {
  // pushtrue, not → false
  assertEquals(run(makeAbc({ code: [0x26, 0x96, 0x48] })), false);
});

Deno.test("vm: not falsy", () => {
  // pushfalse, not → true
  assertEquals(run(makeAbc({ code: [0x27, 0x96, 0x48] })), true);
});

Deno.test("vm: not null → true", () => {
  assertEquals(run(makeAbc({ code: [0x20, 0x96, 0x48] })), true);
});

Deno.test("vm: not zero → true", () => {
  assertEquals(run(makeAbc({ code: [0x24, 0, 0x96, 0x48] })), true);
});

Deno.test("vm: increment_i truncates to int", () => {
  // pushdouble 2.9, increment_i → 3 (not 3.9)
  assertEquals(
    run(makeAbc({ code: [0x2f, 0x01, 0xc0, 0x48], doubles: [2.9] })),
    3,
  );
});

Deno.test("vm: decrement_i truncates to int", () => {
  // pushdouble 3.9, decrement_i → 2
  assertEquals(
    run(makeAbc({ code: [0x2f, 0x01, 0xc1, 0x48], doubles: [3.9] })),
    2,
  );
});

Deno.test("vm: negate_i", () => {
  // pushbyte 5, negate_i → -5
  assertEquals(run(makeAbc({ code: [0x24, 5, 0xc4, 0x48] })), -5);
});

Deno.test("vm: add_i truncates to int", () => {
  // pushdouble 1.5, pushdouble 2.5, add_i → 3 (truncated)
  assertEquals(
    run(
      makeAbc({
        code: [0x2f, 0x01, 0x2f, 0x02, 0xc5, 0x48],
        doubles: [1.5, 2.5],
      }),
    ),
    4,
  );
});

Deno.test("vm: subtract_i", () => {
  // pushbyte 10, pushbyte 3, subtract_i → 7
  assertEquals(run(makeAbc({ code: [0x24, 10, 0x24, 3, 0xc6, 0x48] })), 7);
});

Deno.test("vm: multiply_i", () => {
  // pushbyte 6, pushbyte 7, multiply_i → 42
  assertEquals(run(makeAbc({ code: [0x24, 6, 0x24, 7, 0xc7, 0x48] })), 42);
});

Deno.test("vm: compound arithmetic (3+4)*2-1", () => {
  // pushbyte 3, pushbyte 4, add, pushbyte 2, multiply, pushbyte 1, subtract, returnvalue → 13
  assertEquals(
    run(
      makeAbc({
        code: [0x24, 3, 0x24, 4, 0xa0, 0x24, 2, 0xa2, 0x24, 1, 0xa1, 0x48],
      }),
    ),
    13,
  );
});

// ── 3. Comparison ──

Deno.test("vm: equals true", () => {
  // pushbyte 5, pushbyte 5, equals → true
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x24, 5, 0xab, 0x48] })), true);
});

Deno.test("vm: equals false", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x24, 6, 0xab, 0x48] })), false);
});

Deno.test("vm: strictequals true", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x24, 5, 0xac, 0x48] })), true);
});

Deno.test("vm: strictequals false (same value, technically)", () => {
  // pushbyte 0, pushfalse, strictequals → false (number vs boolean)
  assertEquals(run(makeAbc({ code: [0x24, 0, 0x27, 0xac, 0x48] })), false);
});

Deno.test("vm: lessthan true", () => {
  assertEquals(run(makeAbc({ code: [0x24, 3, 0x24, 5, 0xad, 0x48] })), true);
});

Deno.test("vm: lessthan false", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x24, 3, 0xad, 0x48] })), false);
});

Deno.test("vm: lessequals", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x24, 5, 0xae, 0x48] })), true);
  assertEquals(run(makeAbc({ code: [0x24, 6, 0x24, 5, 0xae, 0x48] })), false);
});

Deno.test("vm: greaterthan", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x24, 3, 0xaf, 0x48] })), true);
  assertEquals(run(makeAbc({ code: [0x24, 3, 0x24, 5, 0xaf, 0x48] })), false);
});

Deno.test("vm: greaterequals", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x24, 5, 0xb0, 0x48] })), true);
  assertEquals(run(makeAbc({ code: [0x24, 4, 0x24, 5, 0xb0, 0x48] })), false);
});

Deno.test("vm: typeof number", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x95, 0x48] })), "number");
});

Deno.test("vm: typeof string", () => {
  assertEquals(
    run(makeAbc({ code: [0x2c, 0x01, 0x95, 0x48], strings: ["hi"] })),
    "string",
  );
});

Deno.test("vm: typeof boolean", () => {
  assertEquals(run(makeAbc({ code: [0x26, 0x95, 0x48] })), "boolean");
});

Deno.test("vm: typeof null", () => {
  // JS typeof null = 'object', AS3 matches
  assertEquals(run(makeAbc({ code: [0x20, 0x95, 0x48] })), "object");
});

Deno.test("vm: typeof undefined", () => {
  assertEquals(run(makeAbc({ code: [0x21, 0x95, 0x48] })), "undefined");
});

Deno.test("vm: instanceof throws STUB", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x24, 1, 0x24, 2, 0xb1, 0x48] })),
    Error,
    "STUB: instanceof",
  );
});

Deno.test("vm: istypelate throws STUB", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x24, 1, 0x24, 2, 0xb3, 0x48] })),
    Error,
    "STUB: istypelate",
  );
});

Deno.test("vm: comparison chain: 3 < 5 == true", () => {
  // pushbyte 3, pushbyte 5, lessthan, pushtrue, strictequals → true
  assertEquals(
    run(makeAbc({ code: [0x24, 3, 0x24, 5, 0xad, 0x26, 0xac, 0x48] })),
    true,
  );
});

// ── 4. Locals ──

Deno.test("vm: getlocal_0 returns receiver", () => {
  // getlocal_0 is the receiver (an AVMObject), just check it's not undefined
  const result = run(makeAbc({ code: [0xd0, 0x48] }));
  assertEquals(typeof result, "object");
});

Deno.test("vm: setlocal_1 + getlocal_1", () => {
  // pushbyte 42, setlocal_1, getlocal_1, returnvalue → 42
  assertEquals(
    run(makeAbc({ code: [0x24, 42, 0xd5, 0xd1, 0x48], localCount: 2 })),
    42,
  );
});

Deno.test("vm: setlocal_2 + getlocal_2", () => {
  assertEquals(
    run(makeAbc({ code: [0x24, 99, 0xd6, 0xd2, 0x48], localCount: 3 })),
    99,
  );
});

Deno.test("vm: setlocal_3 + getlocal_3", () => {
  assertEquals(
    run(makeAbc({ code: [0x24, 7, 0xd7, 0xd3, 0x48], localCount: 4 })),
    7,
  );
});

Deno.test("vm: generic setlocal + getlocal", () => {
  // pushbyte 55, setlocal 5, getlocal 5, returnvalue → 55
  assertEquals(
    run(
      makeAbc({
        code: [0x24, 55, 0x63, 0x05, 0x62, 0x05, 0x48],
        localCount: 6,
      }),
    ),
    55,
  );
});

Deno.test("vm: kill sets local to undefined", () => {
  // pushbyte 10, setlocal_1, kill 1, getlocal_1, returnvalue → undefined
  assertEquals(
    run(
      makeAbc({
        code: [0x24, 10, 0xd5, 0x08, 0x01, 0xd1, 0x48],
        localCount: 2,
      }),
    ),
    undefined,
  );
});

Deno.test("vm: locals are independent", () => {
  // pushbyte 1, setlocal_1, pushbyte 2, setlocal_2, getlocal_1, returnvalue → 1
  assertEquals(
    run(
      makeAbc({
        code: [0x24, 1, 0xd5, 0x24, 2, 0xd6, 0xd1, 0x48],
        localCount: 3,
      }),
    ),
    1,
  );
});

Deno.test("vm: overwrite local", () => {
  // pushbyte 1, setlocal_1, pushbyte 2, setlocal_1, getlocal_1, returnvalue → 2
  assertEquals(
    run(
      makeAbc({
        code: [0x24, 1, 0xd5, 0x24, 2, 0xd5, 0xd1, 0x48],
        localCount: 2,
      }),
    ),
    2,
  );
});

Deno.test("vm: uninitialized local is undefined", () => {
  // getlocal_1, returnvalue → undefined
  assertEquals(run(makeAbc({ code: [0xd1, 0x48], localCount: 2 })), undefined);
});

// ── 5. Control flow ──

Deno.test("vm: nop does nothing", () => {
  assertEquals(run(makeAbc({ code: [0x02, 0x24, 1, 0x48] })), 1);
});

Deno.test("vm: label does nothing", () => {
  assertEquals(run(makeAbc({ code: [0x09, 0x24, 2, 0x48] })), 2);
});

Deno.test("vm: jump forward skips instructions", () => {
  // Byte layout:
  //   0: pushbyte 10    [0x24, 0x0a]       (2 bytes)
  //   2: jump +2        [0x10, 0x02,0x00,0x00]  (4 bytes, skips next 2 bytes)
  //   6: pushbyte 20    [0x24, 0x14]       (2 bytes) ← skipped
  //   8: returnvalue    [0x48]
  // jump target = byte 6 + 2 = 8 → returnvalue
  assertEquals(
    run(makeAbc({ code: [0x24, 10, 0x10, 0x02, 0x00, 0x00, 0x24, 20, 0x48] })),
    10,
  );
});

Deno.test("vm: iftrue takes branch when true", () => {
  // pushtrue, iftrue +2, pushbyte 1, returnvalue, pushbyte 2, returnvalue
  //   0: pushtrue       [0x26]          (1 byte)
  //   1: iftrue +2      [0x11, 0x02,0x00,0x00]  (4 bytes)
  //   5: pushbyte 1     [0x24, 0x01]    (2 bytes) ← skipped
  //   7: returnvalue    [0x48]          (1 byte)  ← skipped
  //   8: pushbyte 2     [0x24, 0x02]    (2 bytes) ← branch target (byte 5+2=7? no)
  // Wait, need to recalc. iftrue at byte 1, next ins at byte 5. target = 5 + 2 = 7.
  // byte 7 = returnvalue. That's wrong — stack would be empty.
  // Let me lay it out differently:
  //   0: pushtrue       [0x26]                   1 byte
  //   1: iftrue +4      [0x11, 0x04,0x00,0x00]   4 bytes → target = 5+4 = 9
  //   5: pushbyte 1     [0x24, 0x01]              2 bytes
  //   7: returnvalue    [0x48]                    1 byte
  //   8: pushbyte 2     [0x24, 0x02]              2 bytes ← wait that's byte 8, not 9
  // Hmm. Let me be more careful:
  //   0: pushtrue       [0x26]                   (1)
  //   1: iftrue +3      [0x11, 0x03,0x00,0x00]   (4) → target = byte 5+3 = 8
  //   5: pushbyte 1     [0x24, 0x01]              (2) ← fallthrough path
  //   7: returnvalue    [0x48]                    (1)
  //   8: pushbyte 2     [0x24, 0x02]              (2) ← branch target
  //  10: returnvalue    [0x48]                    (1)
  assertEquals(
    run(
      makeAbc({
        code: [0x26, 0x11, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2, 0x48],
      }),
    ),
    2,
  );
});

Deno.test("vm: iftrue falls through when false", () => {
  // pushfalse, iftrue +3, pushbyte 1, returnvalue, pushbyte 2, returnvalue
  assertEquals(
    run(
      makeAbc({
        code: [0x27, 0x11, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2, 0x48],
      }),
    ),
    1,
  );
});

Deno.test("vm: iffalse takes branch when false", () => {
  // pushfalse, iffalse +3, pushbyte 1, returnvalue, pushbyte 2, returnvalue
  assertEquals(
    run(
      makeAbc({
        code: [0x27, 0x12, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2, 0x48],
      }),
    ),
    2,
  );
});

Deno.test("vm: iffalse falls through when true", () => {
  assertEquals(
    run(
      makeAbc({
        code: [0x26, 0x12, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2, 0x48],
      }),
    ),
    1,
  );
});

Deno.test("vm: ifeq takes branch when equal", () => {
  // pushbyte 5, pushbyte 5, ifeq +3, pushbyte 1, returnvalue, pushbyte 2, returnvalue
  assertEquals(
    run(
      makeAbc({
        code: [
          0x24, 5, 0x24, 5, 0x13, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2,
          0x48,
        ],
      }),
    ),
    2,
  );
});

Deno.test("vm: ifne takes branch when not equal", () => {
  assertEquals(
    run(
      makeAbc({
        code: [
          0x24, 5, 0x24, 6, 0x14, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2,
          0x48,
        ],
      }),
    ),
    2,
  );
});

Deno.test("vm: iflt takes branch when less", () => {
  assertEquals(
    run(
      makeAbc({
        code: [
          0x24, 3, 0x24, 5, 0x15, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2,
          0x48,
        ],
      }),
    ),
    2,
  );
});

Deno.test("vm: iflt falls through when not less", () => {
  assertEquals(
    run(
      makeAbc({
        code: [
          0x24, 5, 0x24, 3, 0x15, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2,
          0x48,
        ],
      }),
    ),
    1,
  );
});

Deno.test("vm: ifstricteq", () => {
  // pushbyte 5, pushbyte 5, ifstricteq → branch
  assertEquals(
    run(
      makeAbc({
        code: [
          0x24, 5, 0x24, 5, 0x19, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2,
          0x48,
        ],
      }),
    ),
    2,
  );
});

Deno.test("vm: ifstrictne", () => {
  // pushbyte 5, pushbyte 6, ifstrictne → branch
  assertEquals(
    run(
      makeAbc({
        code: [
          0x24, 5, 0x24, 6, 0x1a, 0x03, 0x00, 0x00, 0x24, 1, 0x48, 0x24, 2,
          0x48,
        ],
      }),
    ),
    2,
  );
});

Deno.test("vm: jump backward (loop)", () => {
  // Simple loop: local1 = 0, loop: local1++, if local1 < 3, jump back
  // Layout:
  //  0: pushbyte 0      [0x24, 0x00]     2 bytes
  //  2: setlocal_1      [0xd5]           1 byte
  //  3: getlocal_1      [0xd1]           1 byte   ← loop top
  //  4: increment       [0x91]           1 byte
  //  5: dup             [0x2a]           1 byte
  //  6: setlocal_1      [0xd5]           1 byte
  //  7: pushbyte 3      [0x24, 0x03]     2 bytes
  //  9: iflt -6         [0x15, 0xfa,0xff,0xff]  4 bytes → target = 13 + (-6) = 7? No.
  // Wait: iflt is at byte 9, next ins at byte 13. target = 13 + (-6) = 7. But byte 7 is pushbyte, not getlocal_1.
  // Need target = byte 3. So offset = 3 - 13 = -10. s24(-10) = 0xf6,0xff,0xff
  //  13: getlocal_1     [0xd1]           1 byte
  //  14: returnvalue    [0x48]           1 byte
  assertEquals(
    run(
      makeAbc({
        code: [
          0x24,
          0x00, // 0: pushbyte 0
          0xd5, // 2: setlocal_1
          0xd1, // 3: getlocal_1  (loop top)
          0x91, // 4: increment
          0x2a, // 5: dup
          0xd5, // 6: setlocal_1
          0x24,
          0x03, // 7: pushbyte 3
          0x15,
          0xf6,
          0xff,
          0xff, // 9: iflt -10 → byte 3
          0xd1, // 13: getlocal_1
          0x48, // 14: returnvalue
        ],
        localCount: 2,
      }),
    ),
    3,
  );
});

Deno.test("vm: lookupswitch case 0", () => {
  // Byte layout:
  //  0: pushbyte 0      [0x24, 0x00]     (2 bytes)
  //  2: lookupswitch    [0x1b, default_s24, count_u30, case0_s24, case1_s24]
  //     Offsets relative to byte 2 (the lookupswitch itself).
  //     raw: 0x1b, default(3 bytes), count(1 byte), case0(3 bytes), case1(3 bytes) = 11 bytes total
  //     Next ins at byte 13.
  //     case0 → target byte 13 (pushbyte 10): offset = 13-2 = 11 → s24 [0x0b, 0x00, 0x00]
  //     case1 → target byte 15 (pushbyte 20): offset = 15-2 = 13 → s24 [0x0d, 0x00, 0x00]
  //     default → target byte 15: offset = 13 → s24 [0x0d, 0x00, 0x00]
  //  13: pushbyte 10    [0x24, 0x0a]     (2 bytes)
  //  15: returnvalue    [0x48]           (1 byte)   -- for case0 fallthrough and case1 and default
  // Wait, case0 hits pushbyte 10 then returnvalue=10, case1 and default also hit returnvalue but with stack from pushbyte 0 already consumed... Need separate returns.
  //
  // Simpler layout:
  //  0: pushbyte 0      [0x24, 0x00]     2b
  //  2: lookupswitch    11 bytes (opcode+default+count+2 cases)
  //     default offset = 15-2 = 13, case0 offset = 13-2 = 11, case1 offset = 15-2 = 13
  //  13: pushbyte 10   [0x24, 0x0a]     2b   ← case 0
  //  15: returnvalue   [0x48]           1b
  //  16: pushbyte 20   [0x24, 0x14]     2b   ← case 1 / default
  //  18: returnvalue   [0x48]           1b
  // Recalc: case0 = 13-2=11, case1 = 16-2=14, default = 16-2=14
  const code = [
    0x24,
    0x00, // 0: pushbyte 0
    0x1b, // 2: lookupswitch
    0x0e,
    0x00,
    0x00, //    default = 14
    0x01, //    case_count = 1
    0x0b,
    0x00,
    0x00, //    case0 = 11
    0x0e,
    0x00,
    0x00, //    case1 = 14
    0x24,
    0x0a, // 13: pushbyte 10
    0x48, // 15: returnvalue
    0x24,
    0x14, // 16: pushbyte 20
    0x48, // 18: returnvalue
  ];
  // index=0 → case0 → byte 2+11=13 → pushbyte 10 → return 10
  assertEquals(run(makeAbc({ code })), 10);
});

Deno.test("vm: lookupswitch case 1", () => {
  const code = [
    0x24,
    0x01, // 0: pushbyte 1
    0x1b, // 2: lookupswitch
    0x0e,
    0x00,
    0x00, //    default = 14
    0x01, //    case_count = 1
    0x0b,
    0x00,
    0x00, //    case0 = 11
    0x0e,
    0x00,
    0x00, //    case1 = 14
    0x24,
    0x0a, // 13: pushbyte 10
    0x48, // 15: returnvalue
    0x24,
    0x14, // 16: pushbyte 20
    0x48, // 18: returnvalue
  ];
  // index=1 → case1 → byte 2+14=16 → pushbyte 20 → return 20
  assertEquals(run(makeAbc({ code })), 20);
});

Deno.test("vm: lookupswitch default (out of range)", () => {
  const code = [
    0x24,
    0x05, // 0: pushbyte 5 (out of range)
    0x1b, // 2: lookupswitch
    0x0e,
    0x00,
    0x00, //    default = 14
    0x01, //    case_count = 1
    0x0b,
    0x00,
    0x00, //    case0 = 11
    0x0e,
    0x00,
    0x00, //    case1 = 14
    0x24,
    0x0a, // 13: pushbyte 10
    0x48, // 15: returnvalue
    0x24,
    0x14, // 16: pushbyte 20
    0x48, // 18: returnvalue
  ];
  // index=5 > case_count=1 → default → byte 2+14=16 → pushbyte 20 → return 20
  assertEquals(run(makeAbc({ code })), 20);
});

// ── 6. Coercions ──

Deno.test("vm: convert_i truncates float", () => {
  assertEquals(
    run(makeAbc({ code: [0x2f, 0x01, 0x73, 0x48], doubles: [3.9] })),
    3,
  );
});

Deno.test("vm: convert_i on negative", () => {
  assertEquals(
    run(makeAbc({ code: [0x2f, 0x01, 0x73, 0x48], doubles: [-2.7] })),
    -2,
  );
});

Deno.test("vm: convert_u on positive", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x74, 0x48] })), 5);
});

Deno.test("vm: convert_u on -1", () => {
  // -1 >>> 0 = 4294967295
  assertEquals(
    run(makeAbc({ code: [0x2d, 0x01, 0x74, 0x48], integers: [-1] })),
    4294967295,
  );
});

Deno.test("vm: convert_d identity on number", () => {
  assertEquals(run(makeAbc({ code: [0x24, 5, 0x75, 0x48] })), 5);
});

Deno.test("vm: convert_b truthy", () => {
  assertEquals(run(makeAbc({ code: [0x24, 1, 0x76, 0x48] })), true);
});

Deno.test("vm: convert_b falsy", () => {
  assertEquals(run(makeAbc({ code: [0x24, 0, 0x76, 0x48] })), false);
});

Deno.test("vm: convert_b null → false", () => {
  assertEquals(run(makeAbc({ code: [0x20, 0x76, 0x48] })), false);
});

Deno.test("vm: convert_s number to string", () => {
  assertEquals(run(makeAbc({ code: [0x24, 42, 0x70, 0x48] })), "42");
});

Deno.test("vm: convert_s null to string", () => {
  assertEquals(run(makeAbc({ code: [0x20, 0x70, 0x48] })), "null");
});

Deno.test("vm: convert_o throws on null", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x20, 0x77, 0x48] })),
    Error,
    "TypeError",
  );
});

Deno.test("vm: convert_o throws on undefined", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x21, 0x77, 0x48] })),
    Error,
    "TypeError",
  );
});

Deno.test("vm: coerce_a is a no-op", () => {
  assertEquals(run(makeAbc({ code: [0x24, 7, 0x82, 0x48] })), 7);
});

Deno.test("vm: coerce_s on number", () => {
  assertEquals(run(makeAbc({ code: [0x24, 9, 0x85, 0x48] })), "9");
});

Deno.test("vm: coerce_s on null stays null", () => {
  assertEquals(run(makeAbc({ code: [0x20, 0x85, 0x48] })), null);
});

// ── 7. Scope chain ──

Deno.test("vm: pushscope + getscopeobject", () => {
  // getlocal_0 (receiver), pushscope, getscopeobject 0, returnvalue
  // getscopeobject 0 returns the scope at index 0
  const result = run(makeAbc({ code: [0xd0, 0x30, 0x65, 0x00, 0x48] }));
  assertEquals(typeof result, "object");
  assertEquals(result !== null, true);
});

Deno.test("vm: pushscope + popscope", () => {
  // getlocal_0, pushscope, popscope, pushbyte 1, returnvalue → 1
  assertEquals(run(makeAbc({ code: [0xd0, 0x30, 0x1d, 0x24, 1, 0x48] })), 1);
});

Deno.test("vm: getglobalscope returns global object", () => {
  const result = run(makeAbc({ code: [0x64, 0x48] }));
  assertEquals(typeof result, "object");
  assertEquals(result !== null, true);
});

Deno.test("vm: pushscope wraps primitive", () => {
  // pushbyte 42, pushscope, getscopeobject 0, returnvalue → wrapped object
  const result = run(makeAbc({ code: [0x24, 42, 0x30, 0x65, 0x00, 0x48] }));
  assertEquals(typeof result, "object");
});

Deno.test("vm: multiple scope pushes and getscopeobject index", () => {
  // getlocal_0, pushscope (index 0)
  // pushbyte 10, pushscope (index 1)
  // getscopeobject 1 → the wrapper for 10
  // returnvalue
  const result = run(
    makeAbc({ code: [0xd0, 0x30, 0x24, 10, 0x30, 0x65, 0x01, 0x48] }),
  ) as AVMObject;
  assertEquals(result.traits.get("__value__"), 10);
});

Deno.test("vm: pushwith works like pushscope", () => {
  // getlocal_0, pushwith, getscopeobject 0, returnvalue
  const result = run(makeAbc({ code: [0xd0, 0x1c, 0x65, 0x00, 0x48] }));
  assertEquals(typeof result, "object");
});

// ── 8. Property access ──

// Helper: build an AbcFile with multiname QName(ns=1, name=1) at index 1
// strings[0]="x", namespaces[0]={kind:0x08, name:1}
// multiname index 1 in operand → cp.multinames[0] → QName ns=1,name=1
// resolveMultiname(1): ns=cp.namespaces[0]=cp.strings[0]="", name=cp.strings[0]="x"
// Actually: QName has ns index and name index. ns=1 → namespaces[0], name=1 → strings[0]
function propsAbc(code: number[], extraStrings: string[] = []): AbcFile {
  return makeAbc({
    code,
    strings: ["x", "y", ...extraStrings],
    namespaces: [{ kind: 0x08, name: 0 }], // namespace with empty name (name index 0 = not in strings)
    multinames: [
      { kind: 0x07, ns: 1, name: 1 }, // QName: mn index 1 → "x"
      { kind: 0x07, ns: 1, name: 2 }, // QName: mn index 2 → "y"
    ],
    localCount: 4,
  });
}

Deno.test("vm: setproperty + getproperty on global", () => {
  // getglobalscope, pushbyte 42, setproperty "x"(mn=1), getglobalscope, getproperty "x"(mn=1), returnvalue
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x24,
      42, // pushbyte 42
      0x61,
      0x01, // setproperty mn=1 ("x")
      0x64, // getglobalscope
      0x66,
      0x01, // getproperty mn=1 ("x")
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, 42);
});

Deno.test("vm: getproperty returns undefined for missing", () => {
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x66,
      0x01, // getproperty mn=1 ("x")
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, undefined);
});

Deno.test("vm: initproperty sets property", () => {
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x2c,
      0x01, // pushstring "x"
      0x68,
      0x01, // initproperty mn=1 ("x")
      0x64, // getglobalscope
      0x66,
      0x01, // getproperty mn=1 ("x")
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, "x");
});

Deno.test("vm: deleteproperty removes property", () => {
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x24,
      10, // pushbyte 10
      0x61,
      0x01, // setproperty "x"
      0x64, // getglobalscope
      0x6a,
      0x01, // deleteproperty "x" → pushes true
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, true);
});

Deno.test("vm: deleteproperty returns false for missing", () => {
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x6a,
      0x01, // deleteproperty "x" → false (didn't exist)
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, false);
});

Deno.test("vm: setslot + getslot", () => {
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x24,
      77, // pushbyte 77
      0x6d,
      0x01, // setslot 1
      0x64, // getglobalscope
      0x6c,
      0x01, // getslot 1
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, 77);
});

Deno.test("vm: setglobalslot + getglobalslot", () => {
  const result = run(
    propsAbc([
      0x24,
      33, // pushbyte 33
      0x6f,
      0x02, // setglobalslot 2
      0x6e,
      0x02, // getglobalslot 2
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, 33);
});

Deno.test("vm: findpropstrict finds on scope", () => {
  // Push global with "x" set, then findpropstrict "x" should find it
  const abc = propsAbc([
    0x64, // getglobalscope
    0x24,
    5, // pushbyte 5
    0x61,
    0x01, // setproperty "x" on global
    0x64, // getglobalscope
    0x30, // pushscope
    0x5d,
    0x01, // findpropstrict "x"
    0x48, // returnvalue
  ]);
  const vm = new AVM(abc, stubHost());
  const result = vm.runMethodBody(0);
  // Should return the global object since it has "x"
  assertEquals((result as AVMObject).traits.get("x"), 5);
});

Deno.test("vm: findproperty finds on scope stack", () => {
  const abc = propsAbc([
    0x64, // getglobalscope
    0x24,
    9, // pushbyte 9
    0x61,
    0x01, // setproperty "x" on global
    0x64, // getglobalscope
    0x30, // pushscope
    0x5e,
    0x01, // findproperty "x"
    0x48, // returnvalue
  ]);
  const vm = new AVM(abc, stubHost());
  const result = vm.runMethodBody(0);
  assertEquals((result as AVMObject).traits.get("x"), 9);
});

Deno.test("vm: getlex combines find + get", () => {
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x24,
      88, // pushbyte 88
      0x61,
      0x01, // setproperty "x" on global
      0x64, // getglobalscope
      0x30, // pushscope
      0x60,
      0x01, // getlex "x"
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, 88);
});

Deno.test("vm: two properties x and y", () => {
  const result = run(
    propsAbc([
      0x64, // getglobalscope
      0x24,
      10, // pushbyte 10
      0x61,
      0x01, // setproperty "x"
      0x64, // getglobalscope
      0x24,
      20, // pushbyte 20
      0x61,
      0x02, // setproperty "y" (mn=2)
      0x64, // getglobalscope
      0x66,
      0x01, // getproperty "x"
      0x64, // getglobalscope
      0x66,
      0x02, // getproperty "y"
      0xa0, // add
      0x48, // returnvalue
    ]),
  );
  assertEquals(result, 30);
});

// ── 9. Calls ──

// Helper: build an AbcFile with two methods. Method 0 is the entry point, method 1 is the callee.
function makeCallAbc(opts: {
  mainCode: number[];
  calleeCode: number[];
  strings?: string[];
  namespaces?: { kind: number; name: number }[];
  multinames?: { kind: number; ns?: number; name?: number; nsSet?: number }[];
  localCount?: number;
  calleeLocalCount?: number;
}): AbcFile {
  const mainBytes = new Uint8Array(opts.mainCode);
  const calleeBytes = new Uint8Array(opts.calleeCode);
  const mainBody: MethodBodyInfo = {
    method: 0,
    maxStack: 10,
    localCount: opts.localCount ?? 1,
    initScopeDepth: 0,
    maxScopeDepth: 10,
    code: mainBytes,
    instructions: disassemble(mainBytes),
    exceptions: [],
    traits: [],
  };
  const calleeBody: MethodBodyInfo = {
    method: 1,
    maxStack: 10,
    localCount: opts.calleeLocalCount ?? 2,
    initScopeDepth: 0,
    maxScopeDepth: 10,
    code: calleeBytes,
    instructions: disassemble(calleeBytes),
    exceptions: [],
    traits: [],
  };
  return {
    majorVersion: 46,
    minorVersion: 16,
    constantPool: {
      integers: [],
      uintegers: [],
      doubles: [],
      strings: opts.strings ?? [],
      namespaces: opts.namespaces ?? [],
      nsSets: [],
      multinames: (opts.multinames ??
        []) as AbcFile["constantPool"]["multinames"],
    },
    methods: [
      {
        paramCount: 0,
        returnType: 0,
        paramTypes: [],
        name: 0,
        flags: 0,
        options: [],
        paramNames: [],
      },
      {
        paramCount: 1,
        returnType: 0,
        paramTypes: [0],
        name: 0,
        flags: 0,
        options: [],
        paramNames: [],
      },
    ],
    metadata: [],
    instances: [],
    classes: [],
    scripts: [{ init: 0, traits: [] }],
    methodBodies: [mainBody, calleeBody],
  };
}

Deno.test("vm: newfunction creates closure", () => {
  // newfunction 1 → pushes an object with __methodIndex__=1
  const abc = makeCallAbc({
    mainCode: [0x40, 0x01, 0x48], // newfunction 1, returnvalue
    calleeCode: [0x47], // returnvoid (won't be called here)
  });
  const vm = new AVM(abc, stubHost());
  const result = vm.runMethodBody(0) as AVMObject;
  assertEquals(result.traits.get("__methodIndex__"), 1);
});

Deno.test("vm: call invokes function with args", () => {
  // Main: newfunction 1, pushNull (receiver), pushbyte 7, call(1), returnvalue
  // Callee: getlocal_1, pushbyte 3, add, returnvalue  (adds 3 to first arg)
  const abc = makeCallAbc({
    mainCode: [
      0x40,
      0x01, // newfunction 1
      0x20, // pushnull (receiver)
      0x24,
      7, // pushbyte 7
      0x41,
      0x01, // call(argCount=1)
      0x48, // returnvalue
    ],
    calleeCode: [
      0xd1, // getlocal_1 (first arg)
      0x24,
      3, // pushbyte 3
      0xa0, // add
      0x48, // returnvalue
    ],
  });
  assertEquals(run(abc), 10);
});

Deno.test("vm: call with zero args", () => {
  const abc = makeCallAbc({
    mainCode: [
      0x40,
      0x01, // newfunction 1
      0x20, // pushnull
      0x41,
      0x00, // call(argCount=0)
      0x48, // returnvalue
    ],
    calleeCode: [
      0x24,
      42, // pushbyte 42
      0x48, // returnvalue
    ],
  });
  assertEquals(run(abc), 42);
});

Deno.test("vm: call with multiple args", () => {
  // Callee: getlocal_1 + getlocal_2 → multiply → return
  const abc = makeCallAbc({
    mainCode: [
      0x40,
      0x01, // newfunction 1
      0x20, // pushnull
      0x24,
      5, // pushbyte 5
      0x24,
      6, // pushbyte 6
      0x41,
      0x02, // call(argCount=2)
      0x48, // returnvalue
    ],
    calleeCode: [
      0xd1, // getlocal_1
      0xd2, // getlocal_2
      0xa2, // multiply
      0x48, // returnvalue
    ],
    calleeLocalCount: 3,
  });
  assertEquals(run(abc), 30);
});

Deno.test("vm: callstatic invokes by method index", () => {
  // callstatic: method_index=1, argCount=1
  const abc = makeCallAbc({
    mainCode: [
      0xd0, // getlocal_0 (receiver = global)
      0x24,
      10, // pushbyte 10
      0x44,
      0x01,
      0x01, // callstatic method=1, argCount=1
      0x48, // returnvalue
    ],
    calleeCode: [
      0xd1, // getlocal_1
      0x24,
      5, // pushbyte 5
      0xa0, // add
      0x48, // returnvalue
    ],
  });
  assertEquals(run(abc), 15);
});

Deno.test("vm: callproperty calls method on object", () => {
  // Set a function as property "x" on global, then callproperty
  const abc = makeCallAbc({
    mainCode: [
      0x64, // getglobalscope
      0x40,
      0x01, // newfunction 1
      0x61,
      0x01, // setproperty "x" (mn=1)
      0x64, // getglobalscope
      0x24,
      99, // pushbyte 99
      0x46,
      0x01,
      0x01, // callproperty mn=1("x"), argCount=1
      0x48, // returnvalue
    ],
    calleeCode: [
      0xd1, // getlocal_1
      0x91, // increment
      0x48, // returnvalue
    ],
    strings: ["x"],
    namespaces: [{ kind: 0x08, name: 0 }],
    multinames: [{ kind: 0x07, ns: 1, name: 1 }],
  });
  assertEquals(run(abc), 100);
});

Deno.test("vm: callpropvoid discards result", () => {
  // callpropvoid should not push anything onto the stack
  const abc = makeCallAbc({
    mainCode: [
      0x64, // getglobalscope
      0x40,
      0x01, // newfunction 1
      0x61,
      0x01, // setproperty "x"
      0x64, // getglobalscope
      0x4f,
      0x01,
      0x00, // callpropvoid mn=1("x"), argCount=0
      0x24,
      7, // pushbyte 7
      0x48, // returnvalue
    ],
    calleeCode: [
      0x24,
      99, // pushbyte 99
      0x48, // returnvalue
    ],
    strings: ["x"],
    namespaces: [{ kind: 0x08, name: 0 }],
    multinames: [{ kind: 0x07, ns: 1, name: 1 }],
  });
  assertEquals(run(abc), 7);
});

Deno.test("vm: construct creates new object", () => {
  // Main: newfunction 1, construct(1 arg)
  // Callee: setproperty "x" on this to the arg
  const abc = makeCallAbc({
    mainCode: [
      0x40,
      0x01, // newfunction 1
      0x24,
      55, // pushbyte 55
      0x42,
      0x01, // construct(argCount=1)
      0x66,
      0x01, // getproperty "x" on result
      0x48, // returnvalue
    ],
    calleeCode: [
      0xd0, // getlocal_0 (this = new object)
      0xd1, // getlocal_1 (arg)
      0x61,
      0x01, // setproperty "x"
      0x47, // returnvoid
    ],
    strings: ["x"],
    namespaces: [{ kind: 0x08, name: 0 }],
    multinames: [{ kind: 0x07, ns: 1, name: 1 }],
  });
  assertEquals(run(abc), 55);
});

Deno.test("vm: constructprop creates new object via property", () => {
  const abc = makeCallAbc({
    mainCode: [
      0x64, // getglobalscope
      0x40,
      0x01, // newfunction 1
      0x61,
      0x01, // setproperty "x" (mn=1)
      0x64, // getglobalscope
      0x24,
      77, // pushbyte 77
      0x4a,
      0x01,
      0x01, // constructprop mn=1("x"), argCount=1
      0x66,
      0x01, // getproperty "x" on result
      0x48, // returnvalue
    ],
    calleeCode: [
      0xd0, // getlocal_0
      0xd1, // getlocal_1
      0x61,
      0x01, // setproperty "x"
      0x47, // returnvoid
    ],
    strings: ["x"],
    namespaces: [{ kind: 0x08, name: 0 }],
    multinames: [{ kind: 0x07, ns: 1, name: 1 }],
  });
  assertEquals(run(abc), 77);
});

Deno.test("vm: newobject creates object from key-value pairs", () => {
  // pushstring "a", pushbyte 1, pushstring "b", pushbyte 2, newobject(2)
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "a"
        0x24,
        1, // pushbyte 1
        0x2c,
        0x02, // pushstring "b"
        0x24,
        2, // pushbyte 2
        0x55,
        0x02, // newobject(2)
        0x48, // returnvalue
      ],
      strings: ["a", "b"],
    }),
  );
  const obj = result as AVMObject;
  assertEquals(obj.traits.get("b"), 2);
  assertEquals(obj.traits.get("a"), 1);
});

Deno.test("vm: newarray creates array object", () => {
  // pushbyte 10, pushbyte 20, pushbyte 30, newarray(3)
  const result = run(
    makeAbc({
      code: [
        0x24,
        10, // pushbyte 10
        0x24,
        20, // pushbyte 20
        0x24,
        30, // pushbyte 30
        0x56,
        0x03, // newarray(3)
        0x48, // returnvalue
      ],
    }),
  );
  const obj = result as AVMObject;
  assertEquals(obj.traits.get("0"), 10);
  assertEquals(obj.traits.get("1"), 20);
  assertEquals(obj.traits.get("2"), 30);
  assertEquals(obj.traits.get("length"), 3);
});

Deno.test("vm: newactivation creates empty object", () => {
  const result = run(makeAbc({ code: [0x57, 0x48] }));
  const obj = result as AVMObject;
  assertEquals(obj.traits.size, 0);
  assertEquals(obj.proto, null);
});

Deno.test("vm: newclass creates class object with traits", () => {
  // Build an ABC with a class: cinit is method 1 (returnvoid), iinit is method 2 (returnvoid)
  const code = new Uint8Array([0x20, 0x58, 0x00, 0x48]); // pushnull, newclass 0, returnvalue
  const cinitCode = new Uint8Array([0x47]); // returnvoid
  const iinitCode = new Uint8Array([0x47]); // returnvoid
  const abc: AbcFile = {
    majorVersion: 46,
    minorVersion: 16,
    constantPool: {
      integers: [],
      uintegers: [],
      doubles: [],
      strings: ["MyClass"],
      namespaces: [{ kind: 0x08, name: 0 }],
      nsSets: [],
      multinames: [
        { kind: 0x07, ns: 1, name: 1 },
      ] as AbcFile["constantPool"]["multinames"],
    },
    methods: [
      {
        paramCount: 0,
        returnType: 0,
        paramTypes: [],
        name: 0,
        flags: 0,
        options: [],
        paramNames: [],
      },
      {
        paramCount: 0,
        returnType: 0,
        paramTypes: [],
        name: 0,
        flags: 0,
        options: [],
        paramNames: [],
      },
      {
        paramCount: 0,
        returnType: 0,
        paramTypes: [],
        name: 0,
        flags: 0,
        options: [],
        paramNames: [],
      },
    ],
    metadata: [],
    instances: [
      {
        name: 1, // multiname index → "MyClass"
        superName: 0,
        flags: 0,
        protectedNs: 0,
        interfaces: [],
        iinit: 2,
        traits: [],
      },
    ],
    classes: [
      {
        cinit: 1,
        traits: [],
      },
    ],
    scripts: [{ init: 0, traits: [] }],
    methodBodies: [
      {
        method: 0,
        maxStack: 10,
        localCount: 1,
        initScopeDepth: 0,
        maxScopeDepth: 1,
        code,
        instructions: disassemble(code),
        exceptions: [],
        traits: [],
      },
      {
        method: 1,
        maxStack: 1,
        localCount: 1,
        initScopeDepth: 0,
        maxScopeDepth: 0,
        code: cinitCode,
        instructions: disassemble(cinitCode),
        exceptions: [],
        traits: [],
      },
      {
        method: 2,
        maxStack: 1,
        localCount: 1,
        initScopeDepth: 0,
        maxScopeDepth: 0,
        code: iinitCode,
        instructions: disassemble(iinitCode),
        exceptions: [],
        traits: [],
      },
    ],
  };
  const vm = new AVM(abc, stubHost());
  const result = vm.runMethodBody(0) as AVMObject;
  assertEquals(result.traits.get("__avmClass__") != null, true);
  assertEquals(result.traits.get("__methodIndex__"), 2); // iinit
});

Deno.test("vm: newcatch creates catch scope", () => {
  const result = run(makeAbc({ code: [0x5a, 0x00, 0x48] }));
  const obj = result as AVMObject;
  assertEquals(obj.traits.get("__catchIndex__"), 0);
});

Deno.test("vm: nested call - function returning function", () => {
  // Method 1 returns 42. Main: newfunction 1, pushnull, call(0), returnvalue
  const abc = makeCallAbc({
    mainCode: [
      0x40,
      0x01, // newfunction 1
      0x20, // pushnull
      0x41,
      0x00, // call(0)
      0x48, // returnvalue
    ],
    calleeCode: [0x24, 42, 0x48],
  });
  assertEquals(run(abc), 42);
});

// ── 10. throw ──

Deno.test("vm: throw number", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x24, 99, 0x03] })), // pushbyte 99, throw
    AVMThrowError,
    "AVM throw: 99",
  );
});

Deno.test("vm: throw string", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x2c, 0x01, 0x03], strings: ["boom"] })), // pushstring "boom", throw
    AVMThrowError,
    "AVM throw: boom",
  );
});

Deno.test("vm: throw null", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x20, 0x03] })), // pushnull, throw
    AVMThrowError,
    "AVM throw: null",
  );
});

Deno.test("vm: throw preserves value on error object", () => {
  try {
    run(makeAbc({ code: [0x24, 42, 0x03] }));
  } catch (e) {
    assertEquals((e as AVMThrowError).value, 42);
    return;
  }
  throw new Error("Expected AVMThrowError");
});

// ── 11. Exception handling ──

Deno.test("vm: try-catch catches throw and continues", () => {
  // Code layout:
  // 0: pushbyte 99     (0x24, 99)      offset 0
  // 2: throw           (0x03)           offset 2
  // 3: pushbyte 0      (0x24, 0)        offset 3 — dead code
  // 5: returnvalue      (0x48)           offset 5 — dead code
  // 6: pushbyte 1      (0x24, 1)        offset 6 — catch target: stack has thrown value
  // 8: returnvalue      (0x48)           offset 8
  // Exception: from=0, to=3, target=6
  const result = run(
    makeAbc({
      code: [
        0x24,
        99, // pushbyte 99
        0x03, // throw
        0x24,
        0, // (dead)
        0x48, // (dead)
        0x24,
        1, // catch: pushbyte 1 (overwrite thrown value)
        0x48, // returnvalue
      ],
      exceptions: [{ from: 0, to: 3, target: 6, excType: 0, varName: 0 }],
    }),
  );
  assertEquals(result, 1);
});

Deno.test("vm: catch receives thrown value on stack", () => {
  // throw 42, catch handler returns the thrown value directly
  const result = run(
    makeAbc({
      code: [
        0x24,
        42, // pushbyte 42     offset 0
        0x03, // throw           offset 2
        0x29, // pop (dead)      offset 3
        0x48, // catch: returnvalue  offset 4
      ],
      exceptions: [{ from: 0, to: 3, target: 3, excType: 0, varName: 0 }],
    }),
  );
  // Catch handler: stack is cleared, thrown value (42) pushed, then pop discards it...
  // Let me redo: target=4 → returnvalue with thrown value on stack
  const result2 = run(
    makeAbc({
      code: [
        0x24,
        42, // pushbyte 42     offset 0
        0x03, // throw           offset 2
        0x47, // returnvoid(dead) offset 3
        0x48, // catch target: returnvalue offset 4
      ],
      exceptions: [{ from: 0, to: 3, target: 4, excType: 0, varName: 0 }],
    }),
  );
  assertEquals(result2, 42);
});

Deno.test("vm: exception outside handler range propagates", () => {
  // throw is at offset 2, handler covers from=0 to=2 (exclusive), so offset 2 is NOT covered
  assertThrows(
    () =>
      run(
        makeAbc({
          code: [
            0x24,
            42, // pushbyte 42     offset 0
            0x03, // throw           offset 2 (not in [0,2))
            0x48, // catch target    offset 3
          ],
          exceptions: [{ from: 0, to: 2, target: 3, excType: 0, varName: 0 }],
        }),
      ),
    AVMThrowError,
  );
});

Deno.test("vm: exception inside handler range is caught", () => {
  // throw at offset 2, handler covers from=0 to=3 (inclusive of 2)
  const result = run(
    makeAbc({
      code: [
        0x24,
        42, // pushbyte 42     offset 0
        0x03, // throw           offset 2
        0x47, // (dead)          offset 3
        0x48, // catch target    offset 4
      ],
      exceptions: [{ from: 0, to: 3, target: 4, excType: 0, varName: 0 }],
    }),
  );
  assertEquals(result, 42);
});

Deno.test("vm: catch with code after handler", () => {
  // try { throw 10 } catch(e) { return e + 5 }
  const result = run(
    makeAbc({
      code: [
        0x24,
        10, // pushbyte 10     offset 0
        0x03, // throw           offset 2
        0x47, // (dead)          offset 3
        // catch target at offset 4: stack has thrown value (10)
        0x24,
        5, // pushbyte 5      offset 4
        0xa0, // add             offset 6
        0x48, // returnvalue     offset 7
      ],
      exceptions: [{ from: 0, to: 3, target: 4, excType: 0, varName: 0 }],
    }),
  );
  assertEquals(result, 15);
});

Deno.test("vm: nested try-catch uses innermost handler", () => {
  // Two handlers: outer covers 0-7, inner covers 0-3
  // throw at offset 2 → inner handler (target=4) wins (first match)
  const result = run(
    makeAbc({
      code: [
        0x24,
        1, // pushbyte 1      offset 0
        0x03, // throw           offset 2
        0x47, // (dead)          offset 3
        0x24,
        2, // catch inner: pushbyte 2  offset 4
        0xa0, // add             offset 6
        0x48, // returnvalue     offset 7
        0x24,
        99, // catch outer: pushbyte 99 offset 8
        0x48, // returnvalue     offset 10
      ],
      exceptions: [
        { from: 0, to: 3, target: 4, excType: 0, varName: 0 },
        { from: 0, to: 8, target: 8, excType: 0, varName: 0 },
      ],
    }),
  );
  // Inner handler: stack cleared, pushed 1, then pushbyte 2, add → 3
  assertEquals(result, 3);
});

Deno.test("vm: throw string caught in handler", () => {
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "err"  offset 0
        0x03, // throw             offset 2
        0x47, // (dead)            offset 3
        0x48, // catch: returnvalue offset 4
      ],
      strings: ["err"],
      exceptions: [{ from: 0, to: 3, target: 4, excType: 0, varName: 0 }],
    }),
  );
  assertEquals(result, "err");
});

// ── 12. Iteration ──

Deno.test("vm: in operator finds existing property", () => {
  // newobject with key "x", then check "x" in obj
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "x"
        0x24,
        1, // pushbyte 1
        0x55,
        0x01, // newobject(1)  → {x: 1}
        0xd5, // setlocal_1
        0x2c,
        0x01, // pushstring "x"
        0xd1, // getlocal_1
        0xb4, // in
        0x48, // returnvalue
      ],
      strings: ["x"],
      localCount: 2,
    }),
  );
  assertEquals(result, true);
});

Deno.test("vm: in operator returns false for missing", () => {
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "x"
        0x24,
        1, // pushbyte 1
        0x55,
        0x01, // newobject(1) → {x: 1}
        0xd5, // setlocal_1
        0x2c,
        0x02, // pushstring "y"
        0xd1, // getlocal_1
        0xb4, // in
        0x48, // returnvalue
      ],
      strings: ["x", "y"],
      localCount: 2,
    }),
  );
  assertEquals(result, false);
});

Deno.test("vm: hasnext advances index", () => {
  // Create {x:1, y:2}, hasnext from 0 → 1 (has more)
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "x"
        0x24,
        1, // pushbyte 1
        0x2c,
        0x02, // pushstring "y"
        0x24,
        2, // pushbyte 2
        0x55,
        0x02, // newobject(2)
        0x24,
        0, // pushbyte 0 (cur index)
        0x1f, // hasnext → 1
        0x48, // returnvalue
      ],
      strings: ["x", "y"],
    }),
  );
  assertEquals(result, 1);
});

Deno.test("vm: hasnext returns 0 when done", () => {
  // Create {x:1}, hasnext from 1 → 0 (done)
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "x"
        0x24,
        1, // pushbyte 1
        0x55,
        0x01, // newobject(1)
        0x24,
        1, // pushbyte 1 (already at end)
        0x1f, // hasnext → 0
        0x48, // returnvalue
      ],
      strings: ["x"],
    }),
  );
  assertEquals(result, 0);
});

Deno.test("vm: nextname gets key by index", () => {
  // Create {a:10}, nextname at index 1 → "a"
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "a"
        0x24,
        10, // pushbyte 10
        0x55,
        0x01, // newobject(1)
        0x24,
        1, // pushbyte 1 (index)
        0x1e, // nextname → "a"
        0x48, // returnvalue
      ],
      strings: ["a"],
    }),
  );
  assertEquals(result, "a");
});

Deno.test("vm: nextvalue gets value by index", () => {
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "a"
        0x24,
        10, // pushbyte 10
        0x55,
        0x01, // newobject(1)
        0x24,
        1, // pushbyte 1 (index)
        0x23, // nextvalue → 10
        0x48, // returnvalue
      ],
      strings: ["a"],
    }),
  );
  assertEquals(result, 10);
});

Deno.test("vm: hasnext2 updates registers and pushes boolean", () => {
  // Create {a:1, b:2}, store in local 1, index 0 in local 2
  // hasnext2(1, 2) → true, local 2 becomes 1
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "a"
        0x24,
        1, // pushbyte 1
        0x2c,
        0x02, // pushstring "b"
        0x24,
        2, // pushbyte 2
        0x55,
        0x02, // newobject(2)
        0xd5, // setlocal_1 (obj)
        0x24,
        0, // pushbyte 0
        0xd6, // setlocal_2 (index=0)
        0x32,
        0x01,
        0x02, // hasnext2 obj_reg=1, idx_reg=2
        0x48, // returnvalue → true
      ],
      strings: ["a", "b"],
      localCount: 3,
    }),
  );
  assertEquals(result, true);
});

Deno.test("vm: hasnext2 returns false when done", () => {
  // obj with 1 property, index already at 1
  const result = run(
    makeAbc({
      code: [
        0x2c,
        0x01, // pushstring "a"
        0x24,
        1, // pushbyte 1
        0x55,
        0x01, // newobject(1)
        0xd5, // setlocal_1
        0x24,
        1, // pushbyte 1 (already at end)
        0xd6, // setlocal_2
        0x32,
        0x01,
        0x02, // hasnext2
        0x48, // returnvalue → false
      ],
      strings: ["a"],
      localCount: 3,
    }),
  );
  assertEquals(result, false);
});

Deno.test("vm: for-in loop pattern sums values", () => {
  // obj = {a:10, b:20}, sum all values using hasnext2 + nextvalue loop
  // local0=this, local1=obj, local2=index, local3=sum
  //
  // Byte offsets:
  // 0:  pushstring "a"    [0x2c, 0x01]
  // 2:  pushbyte 10       [0x24, 10]
  // 4:  pushstring "b"    [0x2c, 0x02]
  // 6:  pushbyte 20       [0x24, 20]
  // 8:  newobject(2)      [0x55, 0x02]
  // 10: setlocal_1        [0xd5]
  // 11: pushbyte 0        [0x24, 0x00]
  // 13: setlocal_2        [0xd6]
  // 14: pushbyte 0        [0x24, 0x00]
  // 16: setlocal_3        [0xd7]
  // -- loop top --
  // 17: hasnext2(1,2)     [0x32, 0x01, 0x02]
  // 20: iffalse +10       [0x12, 0x0a, 0x00, 0x00]  → next=24, target=24+10=34
  // 24: getlocal_1        [0xd1]
  // 25: getlocal_2        [0xd2]
  // 26: nextvalue          [0x23]
  // 27: getlocal_3        [0xd3]
  // 28: add               [0xa0]
  // 29: setlocal_3        [0xd7]
  // 30: jump -17          [0x10, 0xef, 0xff, 0xff]  → next=34, target=34+(-17)=17
  // -- end --
  // 34: getlocal_3        [0xd3]
  // 35: returnvalue       [0x48]
  const code = [
    0x2c, 0x01, 0x24, 10, 0x2c, 0x02, 0x24, 20, 0x55, 0x02, 0xd5, 0x24, 0x00,
    0xd6, 0x24, 0x00, 0xd7,
    // loop top (offset 17)
    0x32, 0x01, 0x02, 0x12, 0x0a, 0x00, 0x00,
    // body (offset 24)
    0xd1, 0xd2, 0x23, 0xd3, 0xa0, 0xd7, 0x10, 0xef, 0xff, 0xff,
    // end (offset 34)
    0xd3, 0x48,
  ];
  const result = run(
    makeAbc({
      code,
      strings: ["a", "b"],
      localCount: 4,
    }),
  );
  assertEquals(result, 30);
});

// ── 13. Type checks ──

Deno.test("vm: astype throws STUB", () => {
  assertThrows(
    () =>
      run(
        makeAbc({
          code: [0x24, 42, 0x86, 0x01, 0x48],
          strings: ["int"],
          namespaces: [{ kind: 0x08, name: 0 }],
          multinames: [{ kind: 0x07, ns: 1, name: 1 }],
        }),
      ),
    Error,
    "STUB: astype",
  );
});

Deno.test("vm: astypelate throws STUB", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x24, 42, 0x20, 0x87, 0x48] })),
    Error,
    "STUB: astypelate",
  );
});

Deno.test("vm: checkfilter throws STUB", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x24, 7, 0x78, 0x48] })),
    Error,
    "STUB: checkfilter",
  );
});

Deno.test("vm: dxns throws STUB", () => {
  assertThrows(
    () => run(makeAbc({ code: [0x06, 0x01, 0x24, 5, 0x48] })),
    Error,
    "STUB: dxns",
  );
});

Deno.test("vm: dxnslate throws STUB", () => {
  assertThrows(
    () =>
      run(
        makeAbc({
          code: [0x2c, 0x01, 0x07, 0x24, 9, 0x48],
          strings: ["ns"],
        }),
      ),
    Error,
    "STUB: dxnslate",
  );
});

// ── 14. Debug (no-ops) ──

Deno.test("vm: debugline is no-op", () => {
  const result = run(makeAbc({ code: [0xf0, 0x01, 0x24, 5, 0x48] }));
  assertEquals(result, 5);
});

Deno.test("vm: debugfile is no-op", () => {
  const result = run(makeAbc({ code: [0xf1, 0x01, 0x24, 6, 0x48] }));
  assertEquals(result, 6);
});

Deno.test("vm: debug is no-op", () => {
  // debug has format: debug_type(u8), index(u30), reg(u8), extra(u30)
  const result = run(
    makeAbc({ code: [0xef, 0x01, 0x01, 0x00, 0x00, 0x24, 7, 0x48] }),
  );
  assertEquals(result, 7);
});

// ── 15. XML ──

Deno.test("vm: esc_xelem converts to string", () => {
  const result = run(makeAbc({ code: [0x24, 42, 0x71, 0x48] }));
  assertEquals(result, "42");
});

Deno.test("vm: esc_xattr converts to string", () => {
  const result = run(makeAbc({ code: [0x24, 7, 0x72, 0x48] }));
  assertEquals(result, "7");
});

Deno.test("vm: esc_xelem with string passthrough", () => {
  const result = run(
    makeAbc({
      code: [0x2c, 0x01, 0x71, 0x48],
      strings: ["div"],
    }),
  );
  assertEquals(result, "div");
});
