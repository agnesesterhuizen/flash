# AVM2 Virtual Machine

Stack-based interpreter for ActionScript 3 bytecode (ABC format, version 46.16).

## Usage

```ts
import { Decompiler } from "./decompiler.ts";
import { AVM, type AVMHost } from "./vm.ts";

// 1. Parse ABC bytes
const decompiler = new Decompiler(abcBytes);
const abc = decompiler.abc;

// 2. Provide a host (bridges Flash player APIs)
const host: AVMHost = {
    findHostClass: () => null,
    constructHost: (_, args) => ({
        traits: new Map(),
        proto: null,
        class: null,
    }),
    getHostProperty: () => undefined,
    setHostProperty: () => false,
    callHostMethod: () => undefined,
    trace: (msg) => console.log(msg),
};

// 3. Run
const vm = new AVM(abc, host);
vm.execute(); // runs all script initialisers
```

You can also run a single method body directly:

```ts
const result = vm.runMethodBody(0, [/* args */]);
```

## AVMHost

The VM doesn't know about Flash APIs. Everything external goes through the
`AVMHost` interface. Each method is a fallback — the VM tries its own resolution
first (traits, prototype chain, scope chain) and only calls the host when that
fails.

### `trace(msg: string): void`

Called by the global `trace()` function. Log it however you want.

### `getHostProperty(obj, name, ns): AVMValue`

Called when `getproperty` can't find `name` in `obj.traits` or its prototype
chain. This is where you return values for built-in properties like
`stage.stageWidth`, `this.x`, `movieClip.currentFrame`, etc.

Return `undefined` if you don't handle it.

### `setHostProperty(obj, name, ns, value): boolean`

Called when `setproperty` runs. The VM calls this **before** writing to traits.
Return `true` if you handled the write (e.g. setting `this.x` on a display
object), `false` to let the VM store it in `obj.traits` as usual.

### `callHostMethod(obj, name, ns, args): AVMValue`

Called when `callproperty`/`callpropvoid`/`callsuper`/etc. can't find the method
in traits. This is the main dispatch point for Flash API methods like
`gotoAndPlay()`, `addEventListener()`, `getChildByName()`, etc.

Also called as a last resort when `call` is used on a value that isn't a
VM-owned closure (no `__methodIndex__` or `__native__` trait).

### `findHostClass(name, ns): AVMClass | null`

Not currently called by any opcode (since `newclass` is stubbed), but will be
needed when class initialisation is implemented. Return an `AVMClass` for
host-provided classes like `MovieClip`, `Sprite`, `Event`, etc., or `null` if
unknown.

### `constructHost(cls, args): AVMObject`

Called when `construct` is used on something the VM can't resolve as a
VM-defined function. Create and return a new `AVMObject` representing the
host-side instance. Currently also the fallback for the stubbed `newclass` path.

## Implemented opcodes

All AVM2 opcodes are handled. Most are fully implemented:

- **Stack**: push variants, pop, dup, swap
- **Arithmetic**: add (with string concat), sub, mul, div, mod, negate, inc/dec,
  shifts, bitops, integer variants
- **Comparison**: equals, strictequals, lt/le/gt/ge, typeof, in
- **Locals**: getlocal/setlocal 0–3 + generic, kill
- **Control flow**: jump, all if\* branches, lookupswitch
- **Coercions**: convert\_i/u/d/b/s/o, coerce, coerce\_a, coerce\_s
- **Scope**: pushscope, pushwith, popscope, getscopeobject, getglobalscope
- **Properties**: get/set/init/deleteproperty, get/setsuper, get/setslot,
  get/setglobalslot, findpropstrict, findproperty, getlex
- **Calls**: call, construct, callproperty/void, callsuper/void, callstatic,
  callproplex, constructprop, constructsuper, newfunction, newobject, newarray,
  newactivation, newcatch
- **Exceptions**: throw, try/catch handler dispatch
- **Iteration**: nextname, nextvalue, hasnext, hasnext2
- **Debug**: debug, debugline, debugfile (no-ops per spec)
- **XML**: esc\_xelem, esc\_xattr

## Stubs (throw on use)

These opcodes are parsed but will throw a `STUB: ...` error at runtime so you
know immediately when something depends on them:

| Opcode                               | Why it's stubbed                   |
| ------------------------------------ | ---------------------------------- |
| `instanceof`, `istype`, `istypelate` | Need class hierarchy / type system |
| `astype`, `astypelate`               | Need runtime type coercion         |
| `checkfilter`                        | XML filtering                      |
| `getdescendants`                     | XML descendants                    |
| `newclass`                           | Full class initialisation          |
| `callmethod`                         | Dispatch-table method calls        |
| `dxns`, `dxnslate`                   | XML default namespace              |

## Tests

```sh
deno test avm/vm_test.ts
```

179 tests covering every opcode category.
