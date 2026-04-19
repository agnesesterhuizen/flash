import type {
  AbcFile,
  MethodBodyInfo,
  MethodInfo,
  InstanceInfo,
  ClassInfo,
  TraitInfo,
} from "./decompiler.ts";
import { TraitKind } from "./decompiler.ts";

// ── Values ──

export type AVMValue = undefined | null | boolean | number | string | AVMObject;
export type AVMCallable = (receiver: AVMObject, args: AVMValue[]) => AVMValue;

export interface AVMObject {
  traits: Map<string, AVMValue>;
  proto: AVMObject | null;
  class: AVMClass | null;
  [key: string]: unknown;
}

export interface AVMClass {
  name: string;
  instance: InstanceInfo;
  classInfo: ClassInfo;
  baseClass: AVMClass | null;
  iinit: MethodBodyInfo;
  cinit: MethodBodyInfo;
}

// ── Host interface ──

export interface AVMHost {
  /** Resolve a class that the VM doesn't own (e.g. flash.display.MovieClip). */
  findHostClass(name: string, ns: string): AVMClass | null;

  /** Construct a host-provided object (called for `new HostClass(args)`). */
  constructHost(cls: AVMClass, args: AVMValue[]): AVMObject;

  /** Get a property on a host object that the VM can't resolve via traits. */
  getHostProperty(obj: AVMObject, name: string, ns: string): AVMValue;

  /** Set a property on a host object. Return true if handled. */
  setHostProperty(
    obj: AVMObject,
    name: string,
    ns: string,
    value: AVMValue,
  ): boolean;

  /** Call a host-provided method. */
  callHostMethod(
    obj: AVMObject,
    name: string,
    ns: string,
    args: AVMValue[],
  ): AVMValue;

  /** Trace output (global trace() function). */
  trace(msg: string): void;
}

// ── Errors ──

export class AVMThrowError extends Error {
  value: AVMValue;
  constructor(value: AVMValue) {
    super(`AVM throw: ${value}`);
    this.name = "AVMThrowError";
    this.value = value;
  }
}

// ── Scope & frame ──

interface CallFrame {
  method: MethodInfo;
  body: MethodBodyInfo;
  ip: number;
  stack: AVMValue[];
  scopeStack: AVMObject[];
  locals: AVMValue[];
}

// ── VM ──

export class AVM {
  private abc: AbcFile;
  private host: AVMHost;
  private globalObject: AVMObject;
  private callStack: CallFrame[] = [];
  private bodyByMethod: Map<number, MethodBodyInfo>;

  constructor(abc: AbcFile, host: AVMHost) {
    this.abc = abc;
    this.host = host;
    this.globalObject = { traits: new Map(), proto: null, class: null };
    this.bodyByMethod = new Map();
    for (const body of abc.methodBodies) {
      this.bodyByMethod.set(body.method, body);
    }
  }

  /** Run all script initialisers (entry points). */
  execute(): void {
    for (const script of this.abc.scripts) {
      const body = this.bodyByMethod.get(script.init);
      if (!body)
        throw new Error(`No body for script init method ${script.init}`);
      this.executeMethod(body, this.globalObject, []);
    }
  }

  /** Resolve a multiname index to a {name, ns} pair using the constant pool. */
  resolveMultiname(index: number): { name: string; ns: string } {
    const cp = this.abc.constantPool;
    const mn = cp.multinames[index - 1];
    if (!mn) return { name: `?mn${index}`, ns: "" };

    if ("name" in mn && "ns" in mn) {
      const nsEntry = cp.namespaces[(mn.ns as number) - 1];
      return {
        name: cp.strings[(mn.name as number) - 1] ?? "",
        ns: nsEntry ? (cp.strings[nsEntry.name - 1] ?? "") : "",
      };
    }
    if ("name" in mn) {
      return { name: cp.strings[(mn.name as number) - 1] ?? "", ns: "" };
    }
    return { name: `?mn${index}`, ns: "" };
  }

  /** Run a specific method body by method index (for testing). */
  runMethodBody(methodIndex: number, args: AVMValue[] = []): AVMValue {
    const body = this.bodyByMethod.get(methodIndex);
    if (!body) throw new Error(`No body for method ${methodIndex}`);
    return this.executeMethod(body, this.globalObject, args);
  }

  /** Get the global object (for testing). */
  getGlobalObject(): AVMObject {
    return this.globalObject;
  }

  private getProperty(obj: AVMObject, name: string): AVMValue {
    if (obj.traits.has(name)) return obj.traits.get(name);
    // Walk prototype chain
    let proto = obj.proto;
    while (proto) {
      if (proto.traits.has(name)) return proto.traits.get(name);
      proto = proto.proto;
    }
    // Fall through to host
    return this.host.getHostProperty(obj, name, "");
  }

  private setProperty(obj: AVMObject, name: string, value: AVMValue): void {
    if (!this.host.setHostProperty(obj, name, "", value)) {
      obj.traits.set(name, value);
    }
  }

  /** Call an AVMValue as a function. Works for method-index closures and host methods. */
  private callFunction(
    fn: AVMValue,
    receiver: AVMObject,
    args: AVMValue[],
  ): AVMValue {
    if (fn != null && typeof fn === "object") {
      const obj = fn as AVMObject;
      const methodIdx = obj.traits.get("__methodIndex__");
      if (typeof methodIdx === "number") {
        const fnBody = this.bodyByMethod.get(methodIdx);
        if (fnBody) return this.executeMethod(fnBody, receiver, args);
      }
      // Check for native callable
      const native = obj.traits.get("__native__") as AVMCallable | undefined;
      if (native) return native(receiver, args);
    }
    // Fall through to host
    return this.host.callHostMethod(receiver, "call", "", args);
  }

  /** Construct a new object: create AVMObject, call initializer. */
  private constructObject(fn: AVMValue, args: AVMValue[]): AVMObject {
    const obj: AVMObject = { traits: new Map(), proto: null, class: null };
    if (fn != null && typeof fn === "object") {
      const fnObj = fn as AVMObject;

      // If fn is a newclass-created class object, use its prototype and avmClass
      const avmClass = fnObj.traits.get("__avmClass__") as AVMClass | undefined;
      const proto = fnObj.traits.get("__proto__") as AVMObject | undefined;
      if (avmClass) {
        obj.class = avmClass;
        obj.proto = proto ?? fnObj;
        // Install instance traits on the new object
        this.installTraits(obj, avmClass.instance.traits);
        // Run instance initializer (iinit)
        const iinitBody = this.bodyByMethod.get(avmClass.instance.iinit);
        if (iinitBody) this.executeMethod(iinitBody, obj, args);
        return obj;
      }

      const methodIdx = fnObj.traits.get("__methodIndex__");
      if (typeof methodIdx === "number") {
        const fnBody = this.bodyByMethod.get(methodIdx);
        if (fnBody) {
          obj.proto = fnObj; // set prototype
          this.executeMethod(fnBody, obj, args);
          return obj;
        }
      }
    }
    // Fall through to host construction
    return this.host.constructHost(null as unknown as AVMClass, args);
  }

  /** Install ABC traits onto an AVMObject. */
  private installTraits(obj: AVMObject, traits: TraitInfo[]): void {
    const cp = this.abc.constantPool;
    for (const trait of traits) {
      const mn = cp.multinames[trait.name - 1];
      let traitName = `?trait${trait.name}`;
      if (mn && "name" in mn) {
        traitName = cp.strings[(mn.name as number) - 1] ?? traitName;
      }
      switch (trait.kind) {
        case TraitKind.Slot:
        case TraitKind.Const: {
          // Initialize slot with default value
          let value: AVMValue = undefined;
          if (trait.vindex > 0) {
            value = this.resolveDefaultValue(trait.vkind, trait.vindex);
          }
          obj.traits.set(traitName, value);
          if (trait.slotId > 0) {
            obj.traits.set(`__slot_${trait.slotId}`, value);
          }
          break;
        }
        case TraitKind.Method:
        case TraitKind.Getter:
        case TraitKind.Setter: {
          const fnObj: AVMObject = {
            traits: new Map(),
            proto: null,
            class: null,
          };
          fnObj.traits.set("__methodIndex__", trait.method);
          obj.traits.set(traitName, fnObj);
          break;
        }
        case TraitKind.Class: {
          // Class trait — will be populated by newclass opcode
          break;
        }
        case TraitKind.Function: {
          const fnObj: AVMObject = {
            traits: new Map(),
            proto: null,
            class: null,
          };
          fnObj.traits.set("__methodIndex__", trait.function);
          obj.traits.set(traitName, fnObj);
          break;
        }
      }
    }
  }

  /** Resolve a default value from the constant pool (for trait slot initializers). */
  private resolveDefaultValue(vkind: number, vindex: number): AVMValue {
    const cp = this.abc.constantPool;
    switch (vkind) {
      case 0x03:
        return cp.integers[vindex - 1] ?? 0; // Int
      case 0x04:
        return cp.uintegers[vindex - 1] ?? 0; // UInt
      case 0x06:
        return cp.doubles[vindex - 1] ?? NaN; // Double
      case 0x01:
        return cp.strings[vindex - 1] ?? ""; // Utf8
      case 0x0b:
        return true; // True
      case 0x0a:
        return false; // False
      case 0x0c:
        return null; // Null
      case 0x00:
        return undefined; // Undefined
      default:
        return undefined;
    }
  }

  private findScopeProperty(
    name: string,
    scopeStack: AVMObject[],
    strict: boolean,
  ): AVMObject {
    // Search scope stack top-down
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].traits.has(name)) return scopeStack[i];
    }
    // Fall back to global
    if (this.globalObject.traits.has(name)) return this.globalObject;
    if (strict) {
      // In strict mode, still return global — host may handle it
      return this.globalObject;
    }
    return this.globalObject;
  }

  private executeMethod(
    body: MethodBodyInfo,
    receiver: AVMObject,
    args: AVMValue[],
  ): AVMValue {
    const method = this.abc.methods[body.method];
    const frame: CallFrame = {
      method,
      body,
      ip: 0,
      stack: [],
      scopeStack: [],
      locals: [receiver, ...args],
    };

    // Pad locals to expected count
    while (frame.locals.length < body.localCount) {
      frame.locals.push(undefined);
    }

    this.callStack.push(frame);
    try {
      return this.interpret(frame);
    } finally {
      this.callStack.pop();
    }
  }

  private interpret(frame: CallFrame): AVMValue {
    const { body } = frame;
    const { stack } = frame;
    const instructions = body.instructions;
    const cp = this.abc.constantPool;

    // Build byte-offset → instruction-index map for branches
    const offsetToIp = new Map<number, number>();
    for (let i = 0; i < instructions.length; i++) {
      offsetToIp.set(instructions[i].offset, i);
    }
    // Also map the end-of-code offset so branches past the last instruction work
    if (instructions.length > 0) {
      const last = instructions[instructions.length - 1];
      offsetToIp.set(body.code.length, instructions.length);
    }

    const jumpTo = (fromIns: number, s24Offset: number) => {
      // The next instruction's byte offset is where the s24 is relative to
      const nextIp = fromIns + 1;
      const nextByteOffset =
        nextIp < instructions.length
          ? instructions[nextIp].offset
          : body.code.length;
      const targetByte = nextByteOffset + s24Offset;
      const targetIp = offsetToIp.get(targetByte);
      if (targetIp === undefined) {
        throw new Error(`Branch target byte offset ${targetByte} not found`);
      }
      frame.ip = targetIp;
    };

    while (frame.ip < instructions.length) {
      const ins = instructions[frame.ip++];

      try {
        switch (ins.opcode) {
          // ── 1. Stack ops ──
          case 0x20: // pushnull
            stack.push(null);
            break;
          case 0x21: // pushundefined
            stack.push(undefined);
            break;
          case 0x26: // pushtrue
            stack.push(true);
            break;
          case 0x27: // pushfalse
            stack.push(false);
            break;
          case 0x28: // pushnan
            stack.push(NaN);
            break;
          case 0x24: // pushbyte
            stack.push((ins.operands[0] << 24) >> 24); // sign-extend from 8-bit
            break;
          case 0x25: // pushshort
            stack.push((ins.operands[0] << 16) >> 16); // sign-extend from 16-bit
            break;
          case 0x2d: // pushint
            stack.push(cp.integers[ins.operands[0] - 1] ?? 0);
            break;
          case 0x2e: // pushuint
            stack.push(cp.uintegers[ins.operands[0] - 1] ?? 0);
            break;
          case 0x2f: // pushdouble
            stack.push(cp.doubles[ins.operands[0] - 1] ?? NaN);
            break;
          case 0x2c: // pushstring
            stack.push(cp.strings[ins.operands[0] - 1] ?? "");
            break;
          case 0x31: // pushnamespace
            stack.push(cp.namespaces[ins.operands[0] - 1]?.name ?? 0);
            break;
          case 0x29: // pop
            stack.pop();
            break;
          case 0x2a: // dup
            stack.push(stack[stack.length - 1]);
            break;
          case 0x2b: {
            // swap
            const a = stack.pop();
            const b = stack.pop();
            stack.push(a!, b!);
            break;
          }

          // ── 10. Return (needed for testability) ──
          case 0x47: // returnvoid
            return undefined;
          case 0x48: // returnvalue
            return stack.pop();

          // ── 2. Arithmetic & logic ──
          case 0xa0: {
            // add
            const b = stack.pop();
            const a = stack.pop();
            if (typeof a === "string" || typeof b === "string") {
              stack.push(String(a) + String(b));
            } else {
              stack.push((a as number) + (b as number));
            }
            break;
          }
          case 0xa1: {
            // subtract
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a - b);
            break;
          }
          case 0xa2: {
            // multiply
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a * b);
            break;
          }
          case 0xa3: {
            // divide
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a / b);
            break;
          }
          case 0xa4: {
            // modulo
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a % b);
            break;
          }
          case 0x90: // negate
            stack.push(-(stack.pop() as number));
            break;
          case 0x91: // increment
            stack.push((stack.pop() as number) + 1);
            break;
          case 0x93: // decrement
            stack.push((stack.pop() as number) - 1);
            break;
          case 0xa5: {
            // lshift
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a << b);
            break;
          }
          case 0xa6: {
            // rshift
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a >> b);
            break;
          }
          case 0xa7: {
            // urshift
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a >>> b);
            break;
          }
          case 0xa8: {
            // bitand
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a & b);
            break;
          }
          case 0xa9: {
            // bitor
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a | b);
            break;
          }
          case 0xaa: {
            // bitxor
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a ^ b);
            break;
          }
          case 0x97: // bitnot
            stack.push(~(stack.pop() as number));
            break;
          case 0x96: // not
            stack.push(!stack.pop());
            break;
          case 0xc0: // increment_i
            stack.push(((stack.pop() as number) + 1) | 0);
            break;
          case 0xc1: // decrement_i
            stack.push(((stack.pop() as number) - 1) | 0);
            break;
          case 0xc4: // negate_i
            stack.push(-(stack.pop() as number) | 0);
            break;
          case 0xc5: {
            // add_i
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push((a + b) | 0);
            break;
          }
          case 0xc6: {
            // subtract_i
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push((a - b) | 0);
            break;
          }
          case 0xc7: {
            // multiply_i
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(Math.imul(a, b));
            break;
          }

          // ── 3. Comparison ──
          case 0xab: {
            // equals
            const b = stack.pop();
            const a = stack.pop();
            stack.push(a == b);
            break;
          }
          case 0xac: {
            // strictequals
            const b = stack.pop();
            const a = stack.pop();
            stack.push(a === b);
            break;
          }
          case 0xad: {
            // lessthan
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a < b);
            break;
          }
          case 0xae: {
            // lessequals
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a <= b);
            break;
          }
          case 0xaf: {
            // greaterthan
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a > b);
            break;
          }
          case 0xb0: {
            // greaterequals
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            stack.push(a >= b);
            break;
          }
          case 0xb1: {
            // instanceof
            const type = stack.pop();
            const value = stack.pop();
            throw new Error(
              `STUB: instanceof not implemented (value=${value}, type=${type})`,
            );
          }
          case 0xb3: {
            // istypelate
            const type = stack.pop();
            const value = stack.pop();
            throw new Error(
              `STUB: istypelate not implemented (value=${value}, type=${type})`,
            );
          }
          case 0xb2: {
            // istype
            const value = stack.pop();
            throw new Error(
              `STUB: istype not implemented (value=${value}, mn=${ins.operands[0]})`,
            );
          }
          case 0xb4: {
            // in
            const obj = stack.pop();
            const name = stack.pop();
            if (obj != null && typeof obj === "object") {
              stack.push((obj as AVMObject).traits.has(String(name)));
            } else {
              stack.push(false);
            }
            break;
          }
          case 0x95: // typeof
            stack.push(typeof stack.pop());
            break;

          // ── 4. Locals ──
          case 0xd0: // getlocal_0
            stack.push(frame.locals[0]);
            break;
          case 0xd1: // getlocal_1
            stack.push(frame.locals[1]);
            break;
          case 0xd2: // getlocal_2
            stack.push(frame.locals[2]);
            break;
          case 0xd3: // getlocal_3
            stack.push(frame.locals[3]);
            break;
          case 0xd4: // setlocal_0
            frame.locals[0] = stack.pop();
            break;
          case 0xd5: // setlocal_1
            frame.locals[1] = stack.pop();
            break;
          case 0xd6: // setlocal_2
            frame.locals[2] = stack.pop();
            break;
          case 0xd7: // setlocal_3
            frame.locals[3] = stack.pop();
            break;
          case 0x62: // getlocal
            stack.push(frame.locals[ins.operands[0]]);
            break;
          case 0x63: // setlocal
            frame.locals[ins.operands[0]] = stack.pop();
            break;
          case 0x08: // kill
            frame.locals[ins.operands[0]] = undefined;
            break;

          // ── 5. Control flow ──
          case 0x02: // nop
            break;
          case 0x09: // label
            break;
          case 0x10: // jump
            jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          case 0x11: // iftrue
            if (stack.pop()) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          case 0x12: // iffalse
            if (!stack.pop()) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          case 0x13: {
            // ifeq
            const b = stack.pop();
            const a = stack.pop();
            if (a == b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x14: {
            // ifne
            const b = stack.pop();
            const a = stack.pop();
            if (a != b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x15: {
            // iflt
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (a < b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x16: {
            // ifle
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (a <= b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x17: {
            // ifgt
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (a > b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x18: {
            // ifge
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (a >= b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x19: {
            // ifstricteq
            const b = stack.pop();
            const a = stack.pop();
            if (a === b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x1a: {
            // ifstrictne
            const b = stack.pop();
            const a = stack.pop();
            if (a !== b) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x0c: {
            // ifnlt
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (!(a < b)) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x0d: {
            // ifnle
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (!(a <= b)) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x0e: {
            // ifngt
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (!(a > b)) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x0f: {
            // ifnge
            const b = stack.pop() as number;
            const a = stack.pop() as number;
            if (!(a >= b)) jumpTo(frame.ip - 1, ins.operands[0]);
            break;
          }
          case 0x1b: {
            // lookupswitch
            const index = stack.pop() as number;
            const caseCount = ins.operands[1];
            // lookupswitch offsets are relative to the lookupswitch instruction itself
            const baseOffset = ins.offset;
            let s24Offset: number;
            if (index < 0 || index > caseCount) {
              s24Offset = ins.operands[0]; // default
            } else {
              s24Offset = ins.operands[2 + index];
            }
            const targetByte = baseOffset + s24Offset;
            const targetIp = offsetToIp.get(targetByte);
            if (targetIp === undefined) {
              throw new Error(
                `lookupswitch target byte offset ${targetByte} not found`,
              );
            }
            frame.ip = targetIp;
            break;
          }

          // ── 6. Coercions ──
          case 0x73: // convert_i
            stack.push((stack.pop() as number) | 0);
            break;
          case 0x74: // convert_u
            stack.push((stack.pop() as number) >>> 0);
            break;
          case 0x75: // convert_d
            stack.push(+(stack.pop() as number));
            break;
          case 0x76: // convert_b
            stack.push(!!stack.pop());
            break;
          case 0x70: // convert_s
            stack.push(String(stack.pop()));
            break;
          case 0x77: // convert_o
            if (stack[stack.length - 1] == null) {
              throw new Error(
                "TypeError: Cannot convert null or undefined to object",
              );
            }
            break;
          case 0x80: // coerce (to type named by multiname operand — treat as no-op for now)
            break;
          case 0x82: // coerce_a (to *)
            break;
          case 0x85: // coerce_s
            if (stack[stack.length - 1] != null) {
              stack.push(String(stack.pop()));
            }
            // null/undefined stay as-is per AVM2 spec
            break;

          // ── 7. Scope chain ──
          case 0x30: {
            // pushscope
            const val = stack.pop();
            if (val != null && typeof val === "object") {
              frame.scopeStack.push(val as AVMObject);
            } else {
              // Wrap primitive in an object for scope lookup
              const wrapper: AVMObject = {
                traits: new Map(),
                proto: null,
                class: null,
              };
              wrapper.traits.set("__value__", val);
              frame.scopeStack.push(wrapper);
            }
            break;
          }
          case 0x1c: {
            // pushwith
            const val = stack.pop();
            if (val != null && typeof val === "object") {
              frame.scopeStack.push(val as AVMObject);
            } else {
              const wrapper: AVMObject = {
                traits: new Map(),
                proto: null,
                class: null,
              };
              wrapper.traits.set("__value__", val);
              frame.scopeStack.push(wrapper);
            }
            break;
          }
          case 0x1d: // popscope
            frame.scopeStack.pop();
            break;
          case 0x65: // getscopeobject
            stack.push(frame.scopeStack[ins.operands[0]]);
            break;
          case 0x64: // getglobalscope
            stack.push(this.globalObject);
            break;

          // ── 8. Property access ──
          case 0x66: {
            // getproperty
            const { name } = this.resolveMultiname(ins.operands[0]);
            const obj = stack.pop();
            if (obj != null && typeof obj === "object") {
              stack.push(this.getProperty(obj as AVMObject, name));
            } else {
              stack.push(undefined);
            }
            break;
          }
          case 0x61: {
            // setproperty
            const { name } = this.resolveMultiname(ins.operands[0]);
            const value = stack.pop();
            const obj = stack.pop();
            if (obj != null && typeof obj === "object") {
              this.setProperty(obj as AVMObject, name, value);
            }
            break;
          }
          case 0x68: {
            // initproperty
            const { name } = this.resolveMultiname(ins.operands[0]);
            const value = stack.pop();
            const obj = stack.pop();
            if (obj != null && typeof obj === "object") {
              (obj as AVMObject).traits.set(name, value);
            }
            break;
          }
          case 0x6a: {
            // deleteproperty
            const { name } = this.resolveMultiname(ins.operands[0]);
            const obj = stack.pop();
            if (obj != null && typeof obj === "object") {
              stack.push((obj as AVMObject).traits.delete(name));
            } else {
              stack.push(false);
            }
            break;
          }
          case 0x04: {
            // getsuper
            const { name } = this.resolveMultiname(ins.operands[0]);
            const obj = stack.pop() as AVMObject;
            const proto = obj?.proto;
            stack.push(proto ? this.getProperty(proto, name) : undefined);
            break;
          }
          case 0x05: {
            // setsuper
            const { name } = this.resolveMultiname(ins.operands[0]);
            const value = stack.pop();
            const obj = stack.pop() as AVMObject;
            const proto = obj?.proto;
            if (proto) this.setProperty(proto, name, value);
            break;
          }
          case 0x6c: {
            // getslot
            const obj = stack.pop() as AVMObject;
            const slotIndex = ins.operands[0];
            // Slots are stored as __slot_N in traits for simplicity
            stack.push(obj?.traits.get(`__slot_${slotIndex}`) ?? undefined);
            break;
          }
          case 0x6d: {
            // setslot
            const value = stack.pop();
            const obj = stack.pop() as AVMObject;
            const slotIndex = ins.operands[0];
            if (obj) obj.traits.set(`__slot_${slotIndex}`, value);
            break;
          }
          case 0x6e: {
            // getglobalslot
            const slotIndex = ins.operands[0];
            stack.push(
              this.globalObject.traits.get(`__slot_${slotIndex}`) ?? undefined,
            );
            break;
          }
          case 0x6f: {
            // setglobalslot
            const value = stack.pop();
            const slotIndex = ins.operands[0];
            this.globalObject.traits.set(`__slot_${slotIndex}`, value);
            break;
          }
          case 0x5d: {
            // findpropstrict
            const { name } = this.resolveMultiname(ins.operands[0]);
            stack.push(this.findScopeProperty(name, frame.scopeStack, true));
            break;
          }
          case 0x5e: {
            // findproperty
            const { name } = this.resolveMultiname(ins.operands[0]);
            stack.push(this.findScopeProperty(name, frame.scopeStack, false));
            break;
          }
          case 0x60: {
            // getlex (findpropstrict + getproperty)
            const { name } = this.resolveMultiname(ins.operands[0]);
            const scopeObj = this.findScopeProperty(
              name,
              frame.scopeStack,
              true,
            );
            stack.push(this.getProperty(scopeObj, name));
            break;
          }
          case 0x59: {
            // getdescendants
            const obj = stack.pop();
            throw new Error(
              `STUB: getdescendants not implemented (obj=${obj}, mn=${ins.operands[0]})`,
            );
          }

          // ── 9. Calls ──
          case 0x41: {
            // call: argCount, ...args, receiver, function → result
            const argCount = ins.operands[0];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop();
            const fn = stack.pop();
            const recv =
              receiver != null && typeof receiver === "object"
                ? (receiver as AVMObject)
                : this.globalObject;
            stack.push(this.callFunction(fn, recv, args));
            break;
          }
          case 0x42: {
            // construct: argCount, ...args, object → new object
            const argCount = ins.operands[0];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const fn = stack.pop();
            stack.push(this.constructObject(fn, args));
            break;
          }
          case 0x49: {
            // constructsuper: argCount, ...args, object → void
            const argCount = ins.operands[0];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const obj = stack.pop() as AVMObject;
            if (obj?.class?.baseClass) {
              const base = obj.class.baseClass;
              this.executeMethod(base.iinit, obj, args);
            }
            // No base class = extends Object — safe to skip (Object has no iinit)
            break;
          }
          case 0x43: {
            // callmethod: disp_id, argCount
            const _dispId = ins.operands[0];
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop();
            throw new Error(
              `STUB: callmethod not implemented (disp_id=${_dispId}, argCount=${argCount}, receiver=${receiver})`,
            );
          }
          case 0x44: {
            // callstatic: method_index, argCount
            const methodIndex = ins.operands[0];
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop() as AVMObject;
            const fnBody = this.bodyByMethod.get(methodIndex);
            if (fnBody) {
              stack.push(
                this.executeMethod(fnBody, receiver ?? this.globalObject, args),
              );
            } else {
              stack.push(undefined);
            }
            break;
          }
          case 0x45: {
            // callsuper: multiname, argCount — call method on base class
            const { name, ns } = this.resolveMultiname(ins.operands[0]);
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop() as AVMObject;
            const proto = receiver?.proto;
            if (proto) {
              const fn = this.getProperty(proto, name);
              stack.push(this.callFunction(fn, receiver, args));
            } else {
              stack.push(this.host.callHostMethod(receiver, name, ns, args));
            }
            break;
          }
          case 0x46: {
            // callproperty: multiname, argCount
            const { name, ns } = this.resolveMultiname(ins.operands[0]);
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop() as AVMObject;
            if (receiver != null && typeof receiver === "object") {
              const fn = this.getProperty(receiver, name);
              stack.push(this.callFunction(fn, receiver, args));
            } else {
              stack.push(
                this.host.callHostMethod(this.globalObject, name, ns, args),
              );
            }
            break;
          }
          case 0x4c: {
            // callproplex: multiname, argCount — like callproperty but null this
            const { name, ns } = this.resolveMultiname(ins.operands[0]);
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop() as AVMObject;
            if (receiver != null && typeof receiver === "object") {
              const fn = this.getProperty(receiver, name);
              stack.push(this.callFunction(fn, this.globalObject, args));
            } else {
              stack.push(
                this.host.callHostMethod(this.globalObject, name, ns, args),
              );
            }
            break;
          }
          case 0x4e: {
            // callsupervoid: multiname, argCount — like callsuper but discards result
            const { name, ns } = this.resolveMultiname(ins.operands[0]);
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop() as AVMObject;
            const proto = receiver?.proto;
            if (proto) {
              const fn = this.getProperty(proto, name);
              this.callFunction(fn, receiver, args);
            } else {
              this.host.callHostMethod(receiver, name, ns, args);
            }
            break;
          }
          case 0x4f: {
            // callpropvoid: multiname, argCount — like callproperty but discards result
            const { name, ns } = this.resolveMultiname(ins.operands[0]);
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop() as AVMObject;
            if (receiver != null && typeof receiver === "object") {
              const fn = this.getProperty(receiver, name);
              this.callFunction(fn, receiver, args);
            } else {
              this.host.callHostMethod(this.globalObject, name, ns, args);
            }
            break;
          }
          case 0x4a: {
            // constructprop: multiname, argCount
            const { name } = this.resolveMultiname(ins.operands[0]);
            const argCount = ins.operands[1];
            const args: AVMValue[] = [];
            for (let i = 0; i < argCount; i++) args.unshift(stack.pop());
            const receiver = stack.pop() as AVMObject;
            const fn = receiver ? this.getProperty(receiver, name) : undefined;
            stack.push(this.constructObject(fn, args));
            break;
          }
          case 0x40: {
            // newfunction: method_index → closure object
            const methodIndex = ins.operands[0];
            const fnObj: AVMObject = {
              traits: new Map(),
              proto: null,
              class: null,
            };
            fnObj.traits.set("__methodIndex__", methodIndex);
            stack.push(fnObj);
            break;
          }
          case 0x55: {
            // newobject: argCount — pops argCount name-value pairs
            const argCount = ins.operands[0];
            const obj: AVMObject = {
              traits: new Map(),
              proto: null,
              class: null,
            };
            for (let i = 0; i < argCount; i++) {
              const value = stack.pop();
              const name = stack.pop();
              obj.traits.set(String(name), value);
            }
            stack.push(obj);
            break;
          }
          case 0x56: {
            // newarray: argCount — pops argCount values
            const argCount = ins.operands[0];
            const obj: AVMObject = {
              traits: new Map(),
              proto: null,
              class: null,
            };
            for (let i = 0; i < argCount; i++) {
              // Items are pushed left-to-right, so pop in reverse
              obj.traits.set(String(argCount - 1 - i), stack.pop());
            }
            obj.traits.set("length", argCount);
            stack.push(obj);
            break;
          }
          case 0x57: {
            // newactivation: creates a new activation object
            const activation: AVMObject = {
              traits: new Map(),
              proto: null,
              class: null,
            };
            stack.push(activation);
            break;
          }
          case 0x58: {
            // newclass: class_index
            const baseClassVal = stack.pop();
            const classIndex = ins.operands[0];
            const instanceInfo = this.abc.instances[classIndex];
            const classInfo = this.abc.classes[classIndex];
            if (!instanceInfo || !classInfo) {
              throw new Error(
                `newclass: no class/instance info at index ${classIndex}`,
              );
            }

            // Resolve class name
            const { name: className } = this.resolveMultiname(
              instanceInfo.name,
            );

            // Resolve base class
            let baseAvmClass: AVMClass | null = null;
            if (baseClassVal != null && typeof baseClassVal === "object") {
              const baseObj = baseClassVal as AVMObject;
              baseAvmClass =
                baseObj.class ??
                (baseObj.traits.get("__avmClass__") as AVMClass | undefined) ??
                null;
            }

            // Find iinit/cinit bodies
            const iinitBody = this.bodyByMethod.get(instanceInfo.iinit);
            const cinitBody = this.bodyByMethod.get(classInfo.cinit);

            // Create AVMClass
            const avmClass: AVMClass = {
              name: className,
              instance: instanceInfo,
              classInfo: classInfo,
              baseClass: baseAvmClass,
              iinit: iinitBody ?? {
                method: instanceInfo.iinit,
                maxStack: 0,
                localCount: 1,
                initScopeDepth: 0,
                maxScopeDepth: 0,
                code: new Uint8Array([0x47]),
                instructions: [
                  { offset: 0, opcode: 0x47, name: "returnvoid", operands: [] },
                ],
                exceptions: [],
                traits: [],
              },
              cinit: cinitBody ?? {
                method: classInfo.cinit,
                maxStack: 0,
                localCount: 1,
                initScopeDepth: 0,
                maxScopeDepth: 0,
                code: new Uint8Array([0x47]),
                instructions: [
                  { offset: 0, opcode: 0x47, name: "returnvoid", operands: [] },
                ],
                exceptions: [],
                traits: [],
              },
            };

            // Build prototype from instance traits
            const proto: AVMObject = {
              traits: new Map(),
              proto: null,
              class: avmClass,
            };
            if (baseClassVal != null && typeof baseClassVal === "object") {
              // Inherit from base prototype if available
              const baseProto = (baseClassVal as AVMObject).traits.get(
                "__proto__",
              ) as AVMObject | undefined;
              proto.proto = baseProto ?? (baseClassVal as AVMObject);
            }
            this.installTraits(proto, instanceInfo.traits);

            // Build class object
            const classObj: AVMObject = {
              traits: new Map(),
              proto: null,
              class: null,
            };
            classObj.traits.set(
              "__avmClass__",
              avmClass as unknown as AVMValue,
            );
            classObj.traits.set("__methodIndex__", instanceInfo.iinit); // construct = iinit
            classObj.traits.set("__proto__", proto as unknown as AVMValue);
            this.installTraits(classObj, classInfo.traits);

            // Run class initializer
            if (cinitBody) {
              this.executeMethod(cinitBody, classObj, []);
            }

            stack.push(classObj);
            break;
          }
          case 0x5a: {
            // newcatch: exception_index — creates catch scope
            const catchObj: AVMObject = {
              traits: new Map(),
              proto: null,
              class: null,
            };
            catchObj.traits.set("__catchIndex__", ins.operands[0]);
            stack.push(catchObj);
            break;
          }

          // ── 10. throw ──
          case 0x03: {
            // throw: pops value and throws it
            const value = stack.pop();
            throw new AVMThrowError(value);
          }

          // ── 12. Iteration ──
          case 0x1e: {
            // nextname: index, obj → name
            const index = stack.pop() as number;
            const obj = stack.pop();
            if (obj != null && typeof obj === "object") {
              const keys = Array.from((obj as AVMObject).traits.keys());
              stack.push(
                index > 0 && index <= keys.length ? keys[index - 1] : undefined,
              );
            } else {
              stack.push(undefined);
            }
            break;
          }
          case 0x23: {
            // nextvalue: index, obj → value
            const index = stack.pop() as number;
            const obj = stack.pop();
            if (obj != null && typeof obj === "object") {
              const keys = Array.from((obj as AVMObject).traits.keys());
              if (index > 0 && index <= keys.length) {
                stack.push((obj as AVMObject).traits.get(keys[index - 1]));
              } else {
                stack.push(undefined);
              }
            } else {
              stack.push(undefined);
            }
            break;
          }
          case 0x1f: {
            // hasnext: cur_index, obj → next_index
            const cur = stack.pop() as number;
            const obj = stack.pop();
            if (obj != null && typeof obj === "object") {
              const count = (obj as AVMObject).traits.size;
              stack.push(cur < count ? cur + 1 : 0);
            } else {
              stack.push(0);
            }
            break;
          }
          case 0x32: {
            // hasnext2: object_reg, index_reg
            const objReg = ins.operands[0];
            const idxReg = ins.operands[1];
            const obj = frame.locals[objReg];
            let idx = frame.locals[idxReg] as number;
            if (obj != null && typeof obj === "object") {
              const count = (obj as AVMObject).traits.size;
              if (idx < count) {
                idx = idx + 1;
                frame.locals[idxReg] = idx;
                stack.push(true);
              } else {
                frame.locals[idxReg] = 0;
                frame.locals[objReg] = null;
                stack.push(false);
              }
            } else {
              frame.locals[idxReg] = 0;
              frame.locals[objReg] = null;
              stack.push(false);
            }
            break;
          }

          // ── 13. Type checks ──
          case 0x86: // astype (multiname index)
            throw new Error(
              `STUB: astype not implemented (mn=${ins.operands[0]}, value=${stack[stack.length - 1]})`,
            );
          case 0x87: {
            // astypelate
            const type = stack.pop();
            throw new Error(
              `STUB: astypelate not implemented (type=${type}, value=${stack[stack.length - 1]})`,
            );
          }
          case 0x78: // checkfilter
            throw new Error(
              `STUB: checkfilter not implemented (value=${stack[stack.length - 1]})`,
            );
          case 0x06: // dxns
            throw new Error(
              `STUB: dxns not implemented (index=${ins.operands[0]})`,
            );
          case 0x07: // dxnslate
            throw new Error(
              `STUB: dxnslate not implemented (value=${stack.pop()})`,
            );

          // ── 14. Debug (no-ops) ──
          case 0xef: // debug
            break;
          case 0xf0: // debugline
            break;
          case 0xf1: // debugfile
            break;

          // ── 15. XML ──
          case 0x71: // esc_xelem — escape for XML element name
            stack.push(String(stack.pop()));
            break;
          case 0x72: // esc_xattr — escape for XML attribute value
            stack.push(String(stack.pop()));
            break;

          default:
            throw new Error(
              `Unimplemented opcode: ${ins.name} (0x${ins.opcode.toString(16)}) at offset ${ins.offset}`,
            );
        }
      } catch (e) {
        // ── 11. Exception handling ──
        if (!(e instanceof AVMThrowError)) throw e;

        // Search for a matching exception handler
        const throwOffset = ins.offset;
        let handled = false;
        for (const ex of body.exceptions) {
          if (throwOffset >= ex.from && throwOffset < ex.to) {
            // Found matching handler — clear stack, push thrown value, jump to target
            stack.length = 0;
            stack.push(e.value);
            const targetIp = offsetToIp.get(ex.target);
            if (targetIp === undefined) {
              throw new Error(
                `Exception handler target byte offset ${ex.target} not found`,
              );
            }
            frame.ip = targetIp;
            // Restore scope stack to initScopeDepth
            frame.scopeStack.length = body.initScopeDepth;
            handled = true;
            break;
          }
        }
        if (!handled) throw e;
      }
    }

    return undefined;
  }
}
