class AbcReader {
  private data: Uint8Array;
  private pos = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  get position() {
    return this.pos;
  }

  readU8(): number {
    return this.data[this.pos++];
  }

  readU16(): number {
    const lo = this.data[this.pos++];
    const hi = this.data[this.pos++];
    return (hi << 8) | lo;
  }

  readU30(): number {
    let result = 0;
    for (let i = 0; i < 5; i++) {
      const byte = this.data[this.pos++];
      result |= (byte & 0x7f) << (7 * i);
      if ((byte & 0x80) === 0) break;
    }
    return result;
  }

  readS32(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    for (let i = 0; i < 5; i++) {
      byte = this.data[this.pos++];
      result |= (byte & 0x7f) << shift;
      shift += 7;
      if ((byte & 0x80) === 0) break;
    }
    // Sign extend if the sign bit of the last byte is set
    if (shift < 32 && (byte! & 0x40) !== 0) {
      result |= -(1 << shift);
    }
    return result;
  }

  readU32(): number {
    return this.readU30() >>> 0;
  }

  readD64(): number {
    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) {
      view[i] = this.data[this.pos++];
    }
    return new DataView(buf).getFloat64(0, true);
  }

  readBytes(count: number): Uint8Array {
    const slice = this.data.slice(this.pos, this.pos + count);
    this.pos += count;
    return slice;
  }

  readTraits(): TraitInfo[] {
    const traitCount = this.readU30();
    const traits: TraitInfo[] = [];
    for (let i = 0; i < traitCount; i++) {
      const name = this.readU30();
      const kindByte = this.readU8();
      const kind = kindByte & 0x0f;
      const attrs = (kindByte >> 4) & 0x0f;

      let trait: TraitInfo;
      switch (kind) {
        case TraitKind.Slot:
        case TraitKind.Const: {
          const slotId = this.readU30();
          const typeName = this.readU30();
          const vindex = this.readU30();
          const vkind = vindex !== 0 ? this.readU8() : 0;
          trait = {
            kind,
            name,
            attrs,
            slotId,
            typeName,
            vindex,
            vkind,
            metadata: [],
          };
          break;
        }
        case TraitKind.Method:
        case TraitKind.Getter:
        case TraitKind.Setter: {
          const dispId = this.readU30();
          const method = this.readU30();
          trait = { kind, name, attrs, dispId, method, metadata: [] };
          break;
        }
        case TraitKind.Class: {
          const slotId = this.readU30();
          const classi = this.readU30();
          trait = { kind, name, attrs, slotId, classi, metadata: [] };
          break;
        }
        case TraitKind.Function: {
          const slotId = this.readU30();
          const fn = this.readU30();
          trait = { kind, name, attrs, slotId, function: fn, metadata: [] };
          break;
        }
        default:
          throw new Error(`Unknown trait kind: ${kind}`);
      }

      if (attrs & TraitAttr.Metadata) {
        const metadataCount = this.readU30();
        for (let j = 0; j < metadataCount; j++) {
          trait.metadata.push(this.readU30());
        }
      }

      traits.push(trait);
    }
    return traits;
  }
}

export type Multiname =
  | { kind: 0x07 | 0x0d; ns: number; name: number }
  | { kind: 0x0f | 0x10; name: number }
  | { kind: 0x11 | 0x12 }
  | { kind: 0x09 | 0x0e; name: number; nsSet: number }
  | { kind: 0x1b | 0x1c; nsSet: number };

export interface ConstantPool {
  integers: number[];
  uintegers: number[];
  doubles: number[];
  strings: string[];
  namespaces: { kind: number; name: number }[];
  nsSets: number[][];
  multinames: Multiname[];
}

export interface OptionDetail {
  val: number;
  kind: number;
}

export interface MethodInfo {
  paramCount: number;
  returnType: number;
  paramTypes: number[];
  name: number;
  flags: number;
  options: OptionDetail[];
  paramNames: number[];
}

export const MethodFlags = {
  NEED_ARGUMENTS: 0x01,
  NEED_ACTIVATION: 0x02,
  NEED_REST: 0x04,
  HAS_OPTIONAL: 0x08,
  SET_DXNS: 0x40,
  HAS_PARAM_NAMES: 0x80,
} as const;

export interface MetadataInfo {
  name: number;
  items: { key: number; value: number }[];
}

export const TraitKind = {
  Slot: 0,
  Method: 1,
  Getter: 2,
  Setter: 3,
  Class: 4,
  Function: 5,
  Const: 6,
} as const;

export const TraitAttr = {
  Final: 0x1,
  Override: 0x2,
  Metadata: 0x4,
} as const;

export interface TraitSlot {
  kind: typeof TraitKind.Slot | typeof TraitKind.Const;
  name: number;
  attrs: number;
  slotId: number;
  typeName: number;
  vindex: number;
  vkind: number;
  metadata: number[];
}

export interface TraitMethod {
  kind:
    | typeof TraitKind.Method
    | typeof TraitKind.Getter
    | typeof TraitKind.Setter;
  name: number;
  attrs: number;
  dispId: number;
  method: number;
  metadata: number[];
}

export interface TraitClass {
  kind: typeof TraitKind.Class;
  name: number;
  attrs: number;
  slotId: number;
  classi: number;
  metadata: number[];
}

export interface TraitFunction {
  kind: typeof TraitKind.Function;
  name: number;
  attrs: number;
  slotId: number;
  function: number;
  metadata: number[];
}

export type TraitInfo = TraitSlot | TraitMethod | TraitClass | TraitFunction;

export const InstanceFlags = {
  Sealed: 0x01,
  Final: 0x02,
  Interface: 0x04,
  ProtectedNs: 0x08,
} as const;

export interface InstanceInfo {
  name: number;
  superName: number;
  flags: number;
  protectedNs: number;
  interfaces: number[];
  iinit: number;
  traits: TraitInfo[];
}

export interface ClassInfo {
  cinit: number;
  traits: TraitInfo[];
}

export interface ScriptInfo {
  init: number;
  traits: TraitInfo[];
}

export interface ExceptionInfo {
  from: number;
  to: number;
  target: number;
  excType: number;
  varName: number;
}

export interface Instruction {
  offset: number;
  opcode: number;
  name: string;
  operands: number[];
}

export interface MethodBodyInfo {
  method: number;
  maxStack: number;
  localCount: number;
  initScopeDepth: number;
  maxScopeDepth: number;
  code: Uint8Array;
  instructions: Instruction[];
  exceptions: ExceptionInfo[];
  traits: TraitInfo[];
}

export interface AbcFile {
  majorVersion: number;
  minorVersion: number;
  constantPool: ConstantPool;
  methods: MethodInfo[];
  metadata: MetadataInfo[];
  instances: InstanceInfo[];
  classes: ClassInfo[];
  scripts: ScriptInfo[];
  methodBodies: MethodBodyInfo[];
}

// Operand format types
const enum OpFmt {
  None, // no operands
  U30, // single u30
  U30x2, // two u30s
  U8, // single u8
  S24, // single s24 (3-byte signed)
  Debug, // u8 + u30 + u8 + u30
  LookupSwitch, // s24 default + u30 case_count + s24[case_count+1]
}

const opcodeTable: Map<number, [string, OpFmt]> = new Map([
  // No operands
  [0x02, ["nop", OpFmt.None]],
  [0x03, ["throw", OpFmt.None]],
  [0x07, ["dxnslate", OpFmt.None]],
  [0x09, ["label", OpFmt.None]],
  [0x1c, ["pushwith", OpFmt.None]],
  [0x1d, ["popscope", OpFmt.None]],
  [0x1e, ["nextname", OpFmt.None]],
  [0x1f, ["hasnext", OpFmt.None]],
  [0x20, ["pushnull", OpFmt.None]],
  [0x21, ["pushundefined", OpFmt.None]],
  [0x23, ["nextvalue", OpFmt.None]],
  [0x26, ["pushtrue", OpFmt.None]],
  [0x27, ["pushfalse", OpFmt.None]],
  [0x28, ["pushnan", OpFmt.None]],
  [0x29, ["pop", OpFmt.None]],
  [0x2a, ["dup", OpFmt.None]],
  [0x2b, ["swap", OpFmt.None]],
  [0x30, ["pushscope", OpFmt.None]],
  [0x47, ["returnvoid", OpFmt.None]],
  [0x48, ["returnvalue", OpFmt.None]],
  [0x57, ["newactivation", OpFmt.None]],
  [0x64, ["getglobalscope", OpFmt.None]],
  [0x70, ["convert_s", OpFmt.None]],
  [0x71, ["esc_xelem", OpFmt.None]],
  [0x72, ["esc_xattr", OpFmt.None]],
  [0x73, ["convert_i", OpFmt.None]],
  [0x74, ["convert_u", OpFmt.None]],
  [0x75, ["convert_d", OpFmt.None]],
  [0x76, ["convert_b", OpFmt.None]],
  [0x77, ["convert_o", OpFmt.None]],
  [0x78, ["checkfilter", OpFmt.None]],
  [0x82, ["coerce_a", OpFmt.None]],
  [0x85, ["coerce_s", OpFmt.None]],
  [0x87, ["astypelate", OpFmt.None]],
  [0x90, ["negate", OpFmt.None]],
  [0x91, ["increment", OpFmt.None]],
  [0x93, ["decrement", OpFmt.None]],
  [0x95, ["typeof", OpFmt.None]],
  [0x96, ["not", OpFmt.None]],
  [0x97, ["bitnot", OpFmt.None]],
  [0xa0, ["add", OpFmt.None]],
  [0xa1, ["subtract", OpFmt.None]],
  [0xa2, ["multiply", OpFmt.None]],
  [0xa3, ["divide", OpFmt.None]],
  [0xa4, ["modulo", OpFmt.None]],
  [0xa5, ["lshift", OpFmt.None]],
  [0xa6, ["rshift", OpFmt.None]],
  [0xa7, ["urshift", OpFmt.None]],
  [0xa8, ["bitand", OpFmt.None]],
  [0xa9, ["bitor", OpFmt.None]],
  [0xaa, ["bitxor", OpFmt.None]],
  [0xab, ["equals", OpFmt.None]],
  [0xac, ["strictequals", OpFmt.None]],
  [0xad, ["lessthan", OpFmt.None]],
  [0xae, ["lessequals", OpFmt.None]],
  [0xaf, ["greaterthan", OpFmt.None]],
  [0xb0, ["greaterequals", OpFmt.None]],
  [0xb1, ["instanceof", OpFmt.None]],
  [0xb3, ["istypelate", OpFmt.None]],
  [0xb4, ["in", OpFmt.None]],
  [0xc0, ["increment_i", OpFmt.None]],
  [0xc1, ["decrement_i", OpFmt.None]],
  [0xc4, ["negate_i", OpFmt.None]],
  [0xc5, ["add_i", OpFmt.None]],
  [0xc6, ["subtract_i", OpFmt.None]],
  [0xc7, ["multiply_i", OpFmt.None]],
  [0xd0, ["getlocal_0", OpFmt.None]],
  [0xd1, ["getlocal_1", OpFmt.None]],
  [0xd2, ["getlocal_2", OpFmt.None]],
  [0xd3, ["getlocal_3", OpFmt.None]],
  [0xd4, ["setlocal_0", OpFmt.None]],
  [0xd5, ["setlocal_1", OpFmt.None]],
  [0xd6, ["setlocal_2", OpFmt.None]],
  [0xd7, ["setlocal_3", OpFmt.None]],

  // Single u30
  [0x04, ["getsuper", OpFmt.U30]],
  [0x05, ["setsuper", OpFmt.U30]],
  [0x06, ["dxns", OpFmt.U30]],
  [0x08, ["kill", OpFmt.U30]],
  [0x25, ["pushshort", OpFmt.U30]],
  [0x2c, ["pushstring", OpFmt.U30]],
  [0x2d, ["pushint", OpFmt.U30]],
  [0x2e, ["pushuint", OpFmt.U30]],
  [0x2f, ["pushdouble", OpFmt.U30]],
  [0x31, ["pushnamespace", OpFmt.U30]],
  [0x40, ["newfunction", OpFmt.U30]],
  [0x41, ["call", OpFmt.U30]],
  [0x42, ["construct", OpFmt.U30]],
  [0x49, ["constructsuper", OpFmt.U30]],
  [0x55, ["newobject", OpFmt.U30]],
  [0x56, ["newarray", OpFmt.U30]],
  [0x58, ["newclass", OpFmt.U30]],
  [0x59, ["getdescendants", OpFmt.U30]],
  [0x5a, ["newcatch", OpFmt.U30]],
  [0x5d, ["findpropstrict", OpFmt.U30]],
  [0x5e, ["findproperty", OpFmt.U30]],
  [0x60, ["getlex", OpFmt.U30]],
  [0x61, ["setproperty", OpFmt.U30]],
  [0x62, ["getlocal", OpFmt.U30]],
  [0x63, ["setlocal", OpFmt.U30]],
  [0x66, ["getproperty", OpFmt.U30]],
  [0x68, ["initproperty", OpFmt.U30]],
  [0x6a, ["deleteproperty", OpFmt.U30]],
  [0x6c, ["getslot", OpFmt.U30]],
  [0x6d, ["setslot", OpFmt.U30]],
  [0x6e, ["getglobalslot", OpFmt.U30]],
  [0x6f, ["setglobalslot", OpFmt.U30]],
  [0x80, ["coerce", OpFmt.U30]],
  [0x86, ["astype", OpFmt.U30]],
  [0x92, ["inclocal", OpFmt.U30]],
  [0x94, ["declocal", OpFmt.U30]],
  [0xb2, ["istype", OpFmt.U30]],
  [0xc2, ["inclocal_i", OpFmt.U30]],
  [0xc3, ["declocal_i", OpFmt.U30]],
  [0xf0, ["debugline", OpFmt.U30]],
  [0xf1, ["debugfile", OpFmt.U30]],

  // Two u30s
  [0x32, ["hasnext2", OpFmt.U30x2]],
  [0x43, ["callmethod", OpFmt.U30x2]],
  [0x44, ["callstatic", OpFmt.U30x2]],
  [0x45, ["callsuper", OpFmt.U30x2]],
  [0x46, ["callproperty", OpFmt.U30x2]],
  [0x4a, ["constructprop", OpFmt.U30x2]],
  [0x4c, ["callproplex", OpFmt.U30x2]],
  [0x4e, ["callsupervoid", OpFmt.U30x2]],
  [0x4f, ["callpropvoid", OpFmt.U30x2]],

  // Single u8
  [0x24, ["pushbyte", OpFmt.U8]],
  [0x65, ["getscopeobject", OpFmt.U8]],

  // Single s24 (branches)
  [0x0c, ["ifnlt", OpFmt.S24]],
  [0x0d, ["ifnle", OpFmt.S24]],
  [0x0e, ["ifngt", OpFmt.S24]],
  [0x0f, ["ifnge", OpFmt.S24]],
  [0x10, ["jump", OpFmt.S24]],
  [0x11, ["iftrue", OpFmt.S24]],
  [0x12, ["iffalse", OpFmt.S24]],
  [0x13, ["ifeq", OpFmt.S24]],
  [0x14, ["ifne", OpFmt.S24]],
  [0x15, ["iflt", OpFmt.S24]],
  [0x16, ["ifle", OpFmt.S24]],
  [0x17, ["ifgt", OpFmt.S24]],
  [0x18, ["ifge", OpFmt.S24]],
  [0x19, ["ifstricteq", OpFmt.S24]],
  [0x1a, ["ifstrictne", OpFmt.S24]],

  // Special
  [0x1b, ["lookupswitch", OpFmt.LookupSwitch]],
  [0xef, ["debug", OpFmt.Debug]],
]);

function readU30FromCode(code: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let p = pos;
  for (let i = 0; i < 5; i++) {
    const byte = code[p++];
    result |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) break;
  }
  return [result, p];
}

function readS24FromCode(code: Uint8Array, pos: number): [number, number] {
  const lo = code[pos];
  const mid = code[pos + 1];
  const hi = code[pos + 2];
  let value = lo | (mid << 8) | (hi << 16);
  if (value & 0x800000) value |= ~0xffffff; // sign extend
  return [value, pos + 3];
}

export function disassemble(code: Uint8Array): Instruction[] {
  const instructions: Instruction[] = [];
  let pos = 0;

  while (pos < code.length) {
    const offset = pos;
    const opcode = code[pos++];
    const entry = opcodeTable.get(opcode);
    if (!entry) {
      instructions.push({
        offset,
        opcode,
        name: `unknown_0x${opcode.toString(16)}`,
        operands: [],
      });
      continue;
    }

    const [name, fmt] = entry;
    const operands: number[] = [];

    switch (fmt) {
      case OpFmt.None:
        break;
      case OpFmt.U30: {
        const [v, p] = readU30FromCode(code, pos);
        operands.push(v);
        pos = p;
        break;
      }
      case OpFmt.U30x2: {
        const [v1, p1] = readU30FromCode(code, pos);
        const [v2, p2] = readU30FromCode(code, p1);
        operands.push(v1, v2);
        pos = p2;
        break;
      }
      case OpFmt.U8:
        operands.push(code[pos++]);
        break;
      case OpFmt.S24: {
        const [v, p] = readS24FromCode(code, pos);
        operands.push(v);
        pos = p;
        break;
      }
      case OpFmt.Debug: {
        // u8 debug_type, u30 index, u8 reg, u30 extra
        operands.push(code[pos++]);
        const [idx, p1] = readU30FromCode(code, pos);
        operands.push(idx);
        operands.push(code[p1]);
        const [extra, p2] = readU30FromCode(code, p1 + 1);
        operands.push(extra);
        pos = p2;
        break;
      }
      case OpFmt.LookupSwitch: {
        // s24 default_offset, u30 case_count, s24[case_count+1] case_offsets
        const [defaultOffset, p1] = readS24FromCode(code, pos);
        operands.push(defaultOffset);
        const [caseCount, p2] = readU30FromCode(code, p1);
        operands.push(caseCount);
        pos = p2;
        for (let i = 0; i <= caseCount; i++) {
          const [caseOffset, p3] = readS24FromCode(code, pos);
          operands.push(caseOffset);
          pos = p3;
        }
        break;
      }
    }

    instructions.push({ offset, opcode, name, operands });
  }

  return instructions;
}

export class Decompiler {
  static parseTraits(bytes: number[]): TraitInfo[] {
    const reader = new AbcReader(new Uint8Array(bytes));
    return reader.readTraits();
  }

  run(bytecode: number[]): AbcFile {
    const data = new Uint8Array(bytecode);
    const reader = new AbcReader(data);

    const minorVersion = reader.readU16();
    const majorVersion = reader.readU16();

    // -- constant pool --
    const intCount = reader.readU30();
    const integers: number[] = [];
    for (let i = 1; i < intCount; i++) {
      integers.push(reader.readS32());
    }

    const uintCount = reader.readU30();
    const uintegers: number[] = [];
    for (let i = 1; i < uintCount; i++) {
      uintegers.push(reader.readU32());
    }

    const doubleCount = reader.readU30();
    const doubles: number[] = [];
    for (let i = 1; i < doubleCount; i++) {
      doubles.push(reader.readD64());
    }

    const stringCount = reader.readU30();
    const strings: string[] = [];
    for (let i = 1; i < stringCount; i++) {
      const size = reader.readU30();
      const utf8Bytes = reader.readBytes(size);
      strings.push(new TextDecoder().decode(utf8Bytes));
    }

    const namespaceCount = reader.readU30();
    const namespaces: { kind: number; name: number }[] = [];
    for (let i = 1; i < namespaceCount; i++) {
      const kind = reader.readU8();
      const name = reader.readU30();
      namespaces.push({ kind, name });
    }

    const nsSetCount = reader.readU30();
    const nsSets: number[][] = [];
    for (let i = 1; i < nsSetCount; i++) {
      const count = reader.readU30();
      const ns: number[] = [];
      for (let j = 0; j < count; j++) {
        ns.push(reader.readU30());
      }
      nsSets.push(ns);
    }

    const multinameCount = reader.readU30();
    const multinames: Multiname[] = [];
    for (let i = 1; i < multinameCount; i++) {
      const kind = reader.readU8();
      switch (kind) {
        case 0x07: // QName
        case 0x0d: // QNameA
          multinames.push({
            kind,
            ns: reader.readU30(),
            name: reader.readU30(),
          });
          break;
        case 0x0f: // RTQName
        case 0x10: // RTQNameA
          multinames.push({ kind, name: reader.readU30() });
          break;
        case 0x11: // RTQNameL
        case 0x12: // RTQNameLA
          multinames.push({ kind });
          break;
        case 0x09: // Multiname
        case 0x0e: // MultinameA
          multinames.push({
            kind,
            name: reader.readU30(),
            nsSet: reader.readU30(),
          });
          break;
        case 0x1b: // MultinameL
        case 0x1c: // MultinameLA
          multinames.push({ kind, nsSet: reader.readU30() });
          break;
        default:
          throw new Error(`Unknown multiname kind: 0x${kind.toString(16)}`);
      }
    }

    const methodCount = reader.readU30();
    const methods: MethodInfo[] = [];
    for (let i = 0; i < methodCount; i++) {
      const paramCount = reader.readU30();
      const returnType = reader.readU30();
      const paramTypes: number[] = [];
      for (let j = 0; j < paramCount; j++) {
        paramTypes.push(reader.readU30());
      }
      const name = reader.readU30();
      const flags = reader.readU8();

      let options: OptionDetail[] = [];
      if (flags & MethodFlags.HAS_OPTIONAL) {
        const optionCount = reader.readU30();
        for (let j = 0; j < optionCount; j++) {
          const val = reader.readU30();
          const kind = reader.readU8();
          options.push({ val, kind });
        }
      }

      let paramNames: number[] = [];
      if (flags & MethodFlags.HAS_PARAM_NAMES) {
        for (let j = 0; j < paramCount; j++) {
          paramNames.push(reader.readU30());
        }
      }

      methods.push({
        paramCount,
        returnType,
        paramTypes,
        name,
        flags,
        options,
        paramNames,
      });
    }

    const metadataCount = reader.readU30();
    const metadata: MetadataInfo[] = [];
    for (let i = 0; i < metadataCount; i++) {
      const name = reader.readU30();
      const itemCount = reader.readU30();
      const items: { key: number; value: number }[] = [];
      for (let j = 0; j < itemCount; j++) {
        const key = reader.readU30();
        const value = reader.readU30();
        items.push({ key, value });
      }
      metadata.push({ name, items });
    }

    const classCount = reader.readU30();
    const instances: InstanceInfo[] = [];
    for (let i = 0; i < classCount; i++) {
      const name = reader.readU30();
      const superName = reader.readU30();
      const flags = reader.readU8();
      const protectedNs =
        flags & InstanceFlags.ProtectedNs ? reader.readU30() : 0;
      const intrfCount = reader.readU30();
      const interfaces: number[] = [];
      for (let j = 0; j < intrfCount; j++) {
        interfaces.push(reader.readU30());
      }
      const iinit = reader.readU30();
      const traits = reader.readTraits();
      instances.push({
        name,
        superName,
        flags,
        protectedNs,
        interfaces,
        iinit,
        traits,
      });
    }

    const classes: ClassInfo[] = [];
    for (let i = 0; i < classCount; i++) {
      const cinit = reader.readU30();
      const traits = reader.readTraits();
      classes.push({ cinit, traits });
    }

    const scriptCount = reader.readU30();
    const scripts: ScriptInfo[] = [];
    for (let i = 0; i < scriptCount; i++) {
      const init = reader.readU30();
      const traits = reader.readTraits();
      scripts.push({ init, traits });
    }

    const methodBodyCount = reader.readU30();
    const methodBodies: MethodBodyInfo[] = [];
    for (let i = 0; i < methodBodyCount; i++) {
      const method = reader.readU30();
      const maxStack = reader.readU30();
      const localCount = reader.readU30();
      const initScopeDepth = reader.readU30();
      const maxScopeDepth = reader.readU30();
      const codeLength = reader.readU30();
      const code = reader.readBytes(codeLength);
      const exceptionCount = reader.readU30();
      const exceptions: ExceptionInfo[] = [];
      for (let j = 0; j < exceptionCount; j++) {
        const from = reader.readU30();
        const to = reader.readU30();
        const target = reader.readU30();
        const excType = reader.readU30();
        const varName = reader.readU30();
        exceptions.push({ from, to, target, excType, varName });
      }
      const traits = reader.readTraits();
      const instructions = disassemble(code);
      methodBodies.push({
        method,
        maxStack,
        localCount,
        initScopeDepth,
        maxScopeDepth,
        code,
        instructions,
        exceptions,
        traits,
      });
    }

    return {
      majorVersion,
      minorVersion,
      constantPool: {
        integers,
        uintegers,
        doubles,
        strings,
        namespaces,
        nsSets,
        multinames,
      },
      methods,
      metadata,
      instances,
      classes,
      scripts,
      methodBodies,
    };
  }
}
