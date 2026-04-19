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

export interface AbcFile {
  majorVersion: number;
  minorVersion: number;
  constantPool: ConstantPool;
  methodCount: number;
}

export class Decompiler {
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
      methodCount,
    };
  }
}
