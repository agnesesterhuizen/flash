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

export interface MethodBodyInfo {
  method: number;
  maxStack: number;
  localCount: number;
  initScopeDepth: number;
  maxScopeDepth: number;
  code: Uint8Array;
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
      methodBodies.push({
        method,
        maxStack,
        localCount,
        initScopeDepth,
        maxScopeDepth,
        code,
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
