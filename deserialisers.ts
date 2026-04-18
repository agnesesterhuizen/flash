import { bytes, DeserialiserFactory, u16, u32, u8 } from "./struct.ts";

export type RectStruct = {
  nBits: number; // Nbits UB[5] Bits in each rect value field
  xMin: number; // Xmin SB[Nbits] x minimum position for rect
  xMax: number; // Xmax SB[Nbits] x maximum position for rect
  yMin: number; // Ymin SB[Nbits] y minimum position for rect
  yMax: number; // Ymax SB[Nbits] y maximum position for rect
};

export const rectDeserialiser = new DeserialiserFactory<RectStruct>()
  .field("nBits", bytes(5))
  .field("xMin", (x) => {
    console.log("x", x);
    return bytes(x.nBits as number);
  })
  .field("xMax", (x) => bytes(x.nBits as number))
  .field("yMin", (x) => bytes(x.nBits as number))
  .field("yMax", (x) => bytes(x.nBits as number))
  .build();

export type HeaderStruct = {
  compressionType: number; // UI8, compression type
  signature1: number; // UI8
  signature2: number; // UI8
  version: number; // UI8
  fileLength: number; // UI32
  frameSize: RectStruct;
  frameSizePadding: number;
  frameRate: number; // UI16
  frameCount: number; // UI16
};

export const headerDeserialiser = new DeserialiserFactory<HeaderStruct>()
  .field("compressionType", u8())
  .field("signature1", u8())
  .field("signature2", u8())
  .field("version", u8())
  .field("fileLength", u32())
  .field("frameSize", rectDeserialiser.type())
  .field("frameSizePadding", (x) =>
    bytes(
      (8 - ((5 + ((x.frameSize as RectStruct).nBits as number) * 4) % 8)) % 8,
    ))
  .field("frameRate", u16())
  .field("frameCount", u16())
  .build();
