import { Bitstream } from "./bitstream.ts";

export type Struct = {
  [key: string]: number | Struct | Struct[];
};

type Context = Record<string, number | string>;

export type Resolver<T> = (s: Struct, context: Context) => T;

interface Deserialisable {
  deserialise(bs: Bitstream, context: Context, parent?: Struct): Struct;
}

type FieldDefinition<FieldName> =
  | {
      kind: "FIELD";
      name: FieldName;
      type: DataType | Resolver<DataType>;
    }
  | {
      kind: "CONDITIONAL_FIELD";
      predicate: Resolver<boolean>;
      name: FieldName;
      type: DataType | Resolver<DataType>;
    };
// | {
//     kind: "STRUCT_FIELD";
//     name: FieldName;
//     t: Deserialisable;
//   }
// | {
//     kind: "ARRAY_FIELD";
//     name: FieldName;
//     t: Deserialisable;
//     length: number | Resolver<number>;
//   };

type DataType =
  | {
      type: "BYTES";
      width: number;
    }
  | {
      type: "U8";
    }
  | {
      type: "U16";
    }
  | {
      type: "U32";
    }
  | {
      type: "STRUCT";
      t: Deserialisable;
    }
  | {
      type: "ARRAY";
      t: Deserialisable;
      length?: number;
    };

export const bit = (): DataType => ({ type: "BYTES", width: 1 });
export const bytes = (width: number): DataType => ({ type: "BYTES", width });
export const u8 = (): DataType => ({ type: "U8" });
export const u16 = (): DataType => ({ type: "U16" });
export const u32 = (): DataType => ({ type: "U32" });
export const struct = (t: Deserialisable): DataType => ({
  type: "STRUCT",
  t,
});
export const array = (t: Deserialisable, length?: number): DataType => ({
  type: "ARRAY",
  t,
  length,
});

export class Deserialiser<T extends Struct> implements Deserialisable {
  fieldDefinitions: FieldDefinition<keyof T>[] = [];

  constructor(fieldDefinitions: FieldDefinition<keyof T>[]) {
    this.fieldDefinitions = fieldDefinitions;
  }

  deserialise(bs: Bitstream, context: Context = {}, parent?: Struct): T {
    const fields = {} as Record<keyof T, number | Struct | Struct[]>;

    const resolveType = (d: DataType | Resolver<DataType>) =>
      typeof d === "function" ? d({ parent, ...fields }, context) : d;

    const getData = (
      d: DataType | Resolver<DataType>,
    ): number | Struct | Struct[] => {
      const t = resolveType(d);

      switch (t.type) {
        case "BYTES": {
          return bs.read(t.width);
        }
        case "U8":
          return bs.readU8();
        case "U16":
          return bs.readU16();
        case "U32":
          return bs.readU32();
        case "STRUCT":
          return t.t.deserialise(bs, context, parent);
        case "ARRAY": {
          const out: Struct[] = [];

          if (t.length !== undefined) {
            for (let i = 0; i < t.length; i++) {
              out.push(t.t.deserialise(bs, context, parent));
            }

            return out;
          }

          while (bs.available > 0) {
            try {
              const s = t.t.deserialise(bs, context, parent);
              out.push(s);
            } catch (error) {
              if (
                !(error instanceof Error) ||
                error.message !== "end of buffer"
              ) {
                throw error;
              }
              return out;
            }
          }

          return out;
        }
      }
    };

    for (const fd of this.fieldDefinitions) {
      switch (fd.kind) {
        case "FIELD": {
          fields[fd.name] = getData(fd.type);
          break;
        }
        case "CONDITIONAL_FIELD": {
          const p = fd.predicate(fields, context);
          if (p) {
            const value = getData(fd.type);
            fields[fd.name] = value;
          }
          break;
        }
      }
    }

    return fields as T;
  }

  type() {
    return struct(this);
  }
}

export class DeserialiserFactory<T extends Struct> {
  fieldDefinitions: FieldDefinition<keyof T>[] = [];

  field(name: keyof T, type: DataType | Resolver<DataType>) {
    this.fieldDefinitions.push({ kind: "FIELD", name, type });
    return this;
  }

  conditionalField(
    p: Resolver<boolean>,
    name: keyof T,
    type: DataType | Resolver<DataType>,
  ) {
    this.fieldDefinitions.push({
      kind: "CONDITIONAL_FIELD",
      predicate: p,
      name,
      type,
    });
    return this;
  }

  if(
    p: Resolver<boolean>,
    f: (f: DeserialiserFactory<T>) => DeserialiserFactory<T>,
  ) {
    const fac = new DeserialiserFactory<T>();
    const d = f(fac).build();

    d.fieldDefinitions.forEach((def) => {
      if (def.kind === "FIELD") {
        this.fieldDefinitions.push({
          kind: "CONDITIONAL_FIELD",
          predicate: p,
          name: def.name,
          type: def.type,
        });

        return;
      }

      if (def.kind === "CONDITIONAL_FIELD") {
        this.fieldDefinitions.push({
          ...def,
          predicate: (s, ctx) => {
            const blockResult = p(s, ctx);
            if (!blockResult) {
              return false;
            }

            return def.predicate(s, ctx);
          },
        });

        return;
      }
    });

    return this;
  }

  build(): Deserialiser<T> {
    return new Deserialiser(this.fieldDefinitions);
  }
}

// const fillStyleStruct = new DeserialiserFactory().build();

// const fillStyleArrayStruct = new DeserialiserFactory()
//   .field("fillStyleCount", "UInt8")
//   .conditionalField(
//     (x: Struct) => {
//       console.log({ x });
//       return x.fillStyleCount?.value === "TODO";
//     },
//     "fillStyleCountExtended",
//     "UInt16"
//   )
//   // .structField("fillStyles", fillStyleStruct)
//   .build();

// console.log(fillStyleArrayStruct);
