import { Bitstream } from "./bitstream.ts";
import {
  array,
  bit,
  bytes,
  Deserialiser,
  DeserialiserFactory,
  Resolver,
  Struct,
  struct,
  u16,
  u8,
} from "./struct.ts";
import { rectDeserialiser } from "./deserialisers.ts";

const isParserDebugEnabled = () =>
  (globalThis as typeof globalThis & { __SWF_PARSER_DEBUG__?: boolean })
    .__SWF_PARSER_DEBUG__ === true;

const parserDebugLog = (
  scope: string,
  message: string,
  details?: Record<string, unknown>,
) => {
  if (!isParserDebugEnabled()) {
    return;
  }

  console.log(`[parser:${scope}] ${message}`, details ?? {});
};

const TagCode = {
  End: 0,
  ShowFrame: 1,
  DefineShape: 2,
  PlaceObject: 4,
  RemoveObject: 5,
  DefineBits: 6,
  DefineButton: 7,
  JPEGTables: 8,
  SetBackgroundColor: 9,
  DefineFont: 10,
  DefineText: 11,
  DoAction: 12,
  DefineFontInfo: 13,
  DefineSound: 14,
  StartSound: 15,
  DefineButtonSound: 17,
  SoundStreamHead: 18,
  SoundStreamBlock: 19,
  DefineBitsLossless: 20,
  DefineBitsJPEG2: 21,
  DefineShape2: 22,
  DefineButtonCxform: 23,
  Protect: 24,
  PlaceObject2: 26,
  RemoveObject2: 28,
  DefineShape3: 32,
  DefineText2: 33,
  DefineButton2: 34,
  DefineBitsJPEG3: 35,
  DefineBitsLossless2: 36,
  DefineEditText: 37,
  DefineSprite: 39,
  FrameLabel: 43,
  SoundStreamHead2: 45,
  DefineMorphShape: 46,
  DefineFont2: 48,
  ExportAssets: 56,
  ImportAssets: 57,
  EnableDebugger: 58,
  DoInitAction: 59,
  DefineVideoStream: 60,
  VideoFrame: 61,
  DefineFontInfo2: 62,
  EnableDebugger2: 64,
  ScriptLimits: 65,
  SetTabIndex: 66,
  FileAttributes: 69,
  PlaceObject3: 70,
  ImportAssets2: 71,
  DefineFontAlignZones: 73,
  CSMTextSettings: 74,
  DefineFont3: 75,
  SymbolClass: 76,
  Metadata: 77,
  DefineScalingGrid: 78,
  DoABC: 82,
  DefineShape4: 83,
  DefineMorphShape2: 84,
  DefineSceneAndFrameLabelData: 86,
  DefineBinaryData: 87,
  DefineFontName: 88,
  StartSound2: 89,
  DefineBitsJPEG4: 90,
  DefineFont4: 91,
  EnableTelemetry: 93,
};

const TagTypeNames: Record<number, string> = {
  0: "End",
  1: "ShowFrame",
  2: "DefineShape",
  4: "PlaceObject",
  5: "RemoveObject",
  6: "DefineBits",
  7: "DefineButton",
  8: "JPEGTables",
  9: "SetBackgroundColor",
  10: "DefineFont",
  11: "DefineText",
  12: "DoAction",
  13: "DefineFontInfo",
  14: "DefineSound",
  15: "StartSound",
  17: "DefineButtonSound",
  18: "SoundStreamHead",
  19: "SoundStreamBlock",
  20: "DefineBitsLossless",
  21: "DefineBitsJPEG2",
  22: "DefineShape2",
  23: "DefineButtonCxform",
  24: "Protect",
  26: "PlaceObject2",
  28: "RemoveObject2",
  32: "DefineShape3",
  33: "DefineText2",
  34: "DefineButton2",
  35: "DefineBitsJPEG3",
  36: "DefineBitsLossless2",
  37: "DefineEditText",
  39: "DefineSprite",
  43: "FrameLabel",
  45: "SoundStreamHead2",
  46: "DefineMorphShape",
  48: "DefineFont2",
  56: "ExportAssets",
  57: "ImportAssets",
  58: "EnableDebugger",
  59: "DoInitAction",
  60: "DefineVideoStream",
  61: "VideoFrame",
  62: "DefineFontInfo2",
  64: "EnableDebugger2",
  65: "ScriptLimits",
  66: "SetTabIndex",
  69: "FileAttributes",
  70: "PlaceObject3",
  71: "ImportAssets2",
  73: "DefineFontAlignZones",
  74: "CSMTextSettings",
  75: "DefineFont3",
  76: "SymbolClass",
  77: "Metadata",
  78: "DefineScalingGrid",
  82: "DoABC",
  83: "DefineShape4",
  84: "DefineMorphShape2",
  86: "DefineSceneAndFrameLabelData",
  87: "DefineBinaryData",
  88: "DefineFontName",
  89: "StartSound2",
  90: "DefineBitsJPEG4",
  91: "DefineFont4",
  93: "EnableTelemetry",
};

interface Rect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

type CompressionType = "F" | "C" | "Z";

interface SWFHeader {
  compressionType: CompressionType;
  version: number;
  fileLength: number;
  frameSize: Rect;
  frameRate: number;
  frameCount: number;
}

interface RGB {
  red: number;
  green: number;
  blue: number;
}

interface RGBA extends RGB {
  alpha: number;
}

interface Scene {
  offset: number;
  name: string;
}

interface Frame {
  number: number;
  label: string;
}

// TODO: maybe represent more like an actual matrix
interface Matrix {
  scaleX: number;
  scaleY: number;
  rotateSkew0: number;
  rotateSkew1: number;
  translateX: number;
  translateY: number;
}

interface Gradient {}

type SolidFillStyleType = "SOLID";

type GradientFillStyleType =
  | "LINEAR_GRADIENT"
  | "RADIAL_GRADIENT"
  | "FOCAL_RADIAL_GRADIENT";

type BitmapFillStyleType =
  | "REPEATING_BITMAP"
  | "CLIPPED_BITMAP"
  | "NON_SMOOTHED_REPEATING_BITMAP"
  | "NON_SMOOTHED_CLIPPED_BITMAP";

type FillStyleType =
  | SolidFillStyleType
  | GradientFillStyleType
  | BitmapFillStyleType;

const FillStyleCodeNames: Record<number, FillStyleType> = {
  [0x00]: "SOLID",
  [0x10]: "LINEAR_GRADIENT",
  [0x12]: "RADIAL_GRADIENT",
  [0x13]: "FOCAL_RADIAL_GRADIENT",
  [0x40]: "REPEATING_BITMAP",
  [0x41]: "CLIPPED_BITMAP",
  [0x42]: "NON_SMOOTHED_REPEATING_BITMAP",
  [0x43]: "NON_SMOOTHED_CLIPPED_BITMAP",
};

type FillStyle<ColorType = RGB> =
  | {
      type: SolidFillStyleType;
      color: ColorType;
    }
  | {
      type: BitmapFillStyleType;
      gradientMatrix: Matrix;
      gradient: Gradient;
    }
  | {
      type: BitmapFillStyleType;
      bitmapId: number;
      bitmapMatrix: Matrix;
    };

interface LineStyle<ColorType = RGB> {
  width: number;
  color: ColorType;
}

interface LineStyle2<ColorType = RGB> {}

type ShapeType = "Shape1" | "Shape2" | "Shape3" | "Shape4";

type ShapeRecordType =
  | "EndShape"
  | "StyleChange"
  | "StraightEdge"
  | "CurvedEdge";

type ShapeRecord =
  | {
      type: "EndShape";
    }
  | {
      type: "StyleChange";
      moveTo?: { deltaX: number; deltaY: number };
      fillStyle0?: number;
      fillStyle1?: number;
      lineStyle?: number;
      newStyles?: { fillStyles: FillStyle[]; lineStyles: LineStyle[] };
    }
  | {
      type: "StraightEdge";
      lineType: "General" | "Horizontal" | "Vertical";
      deltaX: number;
      deltaY: number;
    }
  | {
      type: "CurvedEdge";
      controlDeltaX: number;
      controlDeltaY: number;
      anchorDeltaX: number;
      anchorDeltaY: number;
    };

interface ShapeWithStyle {
  fillStyles: FillStyle[];
  lineStyles: LineStyle[];
  numFillBits: number;
  numLineBits: number;
  shapeRecords: ShapeRecord[];
}

type Tag =
  | {
      type: "SetBackgroundColor";
      color: RGB;
    }
  | {
      type: "FileAttributes";
      useDirectBlit: boolean;
      useGPU: boolean;
      hasMetadata: boolean;
      actionScript3: boolean;
      useNetwork: boolean;
    }
  | {
      type: "DefineSceneAndFrameLabelData";
      sceneCount: number;
      scenes: Scene[];
      frames: Frame[];
    }
  | {
      type: "DefineShape";
      id: number;
      bounds: Rect;
      shapes: ShapeWithStyle;
    }
  | {
      type: "DefineShape2";
      id: number;
      bounds: Rect;
      shapes: ShapeWithStyle;
    }
  | {
      type: "DefineShape3";
      id: number;
      bounds: Rect;
      shapes: ShapeWithStyle;
    };

const RECT_SIZE = 9;

const parseRect = (bs: Bitstream): Rect => {
  return rectDeserialiser.deserialise(bs);
};

type MatrixStruct = {
  hasScale: number; // UB[1]
  nScaleBits: number; // If HasScale = 1, UB[5]
  scaleX: number; // If HasScale = 1, FB[NScaleBits]
  scaleY: number; // If HasScale = 1, FB[NScaleBits]
  hasRotate: number; // UB[1]
  nRotateBits: number; // If HasRotate = 1, UB[5]
  rotateSkew0: number; // If HasRotate = 1, FB[NRotateBits]
  rotateSkew1: number; // If HasRotate = 1, FB[NRotateBits]
  nTranslateBits: number; // UB[5]
  translateX: number; // SB[NTranslateBits]
  translateY: number; // SB[NTranslateBits]
};

const matrixDeserialiser = new DeserialiserFactory<MatrixStruct>()
  .field("hasScale", bit())
  .conditionalField((x) => x.hasScale === 1, "nScaleBits", bytes(5))
  .conditionalField(
    (x) => x.hasScale === 1,
    "scaleX",
    (x) => bytes(x.nScaleBits as number),
  )
  .conditionalField(
    (x) => x.hasScale === 1,
    "scaleY",
    (x) => bytes(x.nScaleBits as number),
  )
  .field("hasRotate", bit())
  .conditionalField((x) => x.hasRotate === 1, "nRotateBits", bytes(5))
  .conditionalField(
    (x) => x.hasRotate === 1,
    "rotateSkew0",
    (x) => bytes(x.nRotateBits as number),
  )
  .conditionalField(
    (x) => x.hasRotate === 1,
    "rotateSkew1",
    (x) => bytes(x.nRotateBits as number),
  )
  .field("nTranslateBits", bytes(5))
  .field("translateX", (x) => bytes(x.nTranslateBits as number))
  .field("translateY", (x) => bytes(x.nTranslateBits as number))
  .build();

type GradientRecordStuct = {
  ratio: number; // UI8
  color: RGBStruct | RGBAStruct; // RGB (Shape1 or Shape2) RGBA (Shape3)
};

const gradientRecordDeserialiser =
  new DeserialiserFactory<GradientRecordStuct>()
    .field("ratio", u8())
    .field("color", (_, ctx) =>
      ctx?.shapeType === "Shape3"
        ? struct(rgbaDeserialiser)
        : struct(rgbDeserialiser),
    )
    .build();

type GradientStruct = {
  spreadMode: number; // UB[2]
  interpolationMode: number; // InterpolationMode UB[2]
  numGradients: number; // UB[4]
  gradientRecords: GradientRecordStuct[]; // GRADRECORD[nGrads]
};

const gradientDeserialiser = new DeserialiserFactory<GradientStruct>()
  .field("spreadMode", bytes(2))
  .field("interpolationMode", bytes(2))
  .field("numGradients", bytes(4))
  .field("gradientRecords", (x) =>
    array(gradientRecordDeserialiser, x.numGradients as number),
  )
  .build();

type FocalGradientStruct = {
  spreadMode: number; // UB[2]
  interpolationMode: number; // UB[2]
  numGradients: number; // UB[4]
  gradientRecords: GradientRecordStuct[]; // GRADRECORD[nGrads]
  focalPoint: number; // FIXED8
};

const focalGradientDeserialiser = new DeserialiserFactory<FocalGradientStruct>()
  .field("spreadMode", bytes(2))
  .field("interpolationMode", bytes(2))
  .field("numGradients", bytes(4))
  .field("gradientRecords", (x) =>
    array(gradientRecordDeserialiser, x.numGradients as number),
  )
  .field("focalPoint", u8()) // TODO: Fixed*
  .build();

export const parseHeader = (buffer: Uint8Array): SWFHeader => {
  // parse header

  // Signature - compression type (UI8)
  // “F” indicates uncompressed
  // “C” indicates a zlib compressed SWF (SWF 6 and later only)
  // “Z” indicates a LZMA compressed SWF (SWF 13 and later only)
  const compressionType = String.fromCharCode(buffer[0]) as CompressionType;

  // Signature - always “W” (UI8)
  const signatureB = String.fromCharCode(buffer[1]);
  if (signatureB !== "W") throw "invalid swf file";

  // Signature - always “S” (UI8)
  const signatureC = String.fromCharCode(buffer[2]);
  if (signatureC !== "S") throw "invalid swf file";

  // Version (UI8)
  // Single byte file version (for example, 0x06 for SWF 6)
  const version = buffer[3];

  // FileLength (UI32)
  let fileLength = 0;
  const startIndex = 4;
  for (let i = 0; i < 4; i++) {
    fileLength += buffer[i + startIndex] << (i * 8);
  }

  // *** compression applies from this point but assuming uncompressed for now ***

  // FrameSize (RECT)
  const rb = buffer.slice(8, 8 + RECT_SIZE);
  const bitstream = new Bitstream(rb);
  const frameSize = parseRect(bitstream);

  // FrameRate
  const frameRate = buffer[18];

  // FrameCount
  const frameCount = new Uint16Array(buffer.slice(19, 21))[0];

  return {
    compressionType,
    version,
    fileLength,
    frameSize,
    frameRate,
    frameCount,
  };
};

type TagParser = (buffer: Uint8Array) => Tag;

const tagParsers: Record<number, TagParser> = {};

type RGBStruct = {
  red: number;
  green: number;
  blue: number;
};

type RGBAStruct = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

const rgbDeserialiser = new DeserialiserFactory<RGBStruct>()
  .field("red", u8())
  .field("green", u8())
  .field("blue", u8())
  .build();

const rgbaDeserialiser = new DeserialiserFactory<RGBAStruct>()
  .field("red", u8())
  .field("green", u8())
  .field("blue", u8())
  .field("alpha", u8())
  .build();

tagParsers[TagCode.SetBackgroundColor] = (buffer) => {
  const color = rgbDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  const tag: Tag = {
    type: "SetBackgroundColor",
    color,
  };

  return tag;
};

tagParsers[TagCode.FileAttributes] = (buffer) => {
  // const tag: Tag = {
  //   // Header RECORDHEADER
  //   type: "FileAttributes",
  //   // Reserved UB[1]
  //   reserved1: buffer[0] & 0b1000_0000,
  //   // // UseDirectBlit UB[1]
  //   useDirectBlit: (buffer[0] & 0b0100_0000) > 0,
  //   // // UseGPU  UB[1]
  //   useGPU: (buffer[0] & 0b0010_0000) > 0,
  //   // // HasMetadata UB[1]
  //   hasMetadata: (buffer[0] & 0b0001_0000) > 0,
  //   // // ActionScript3 UB[1]
  //   actionScript3: (buffer[0] & 0b0000_1000) > 0,
  //   // // Reserved UB[2]
  //   reserved2: buffer[0] & 0b0000_0110,
  //   // // UseNetwork UB[1]
  //   useNetwork: (buffer[0] & 0b0000_0001) > 0,
  //   // // Reserved UB[24]
  //   reserved3: buffer[1] & (buffer[2] << 8) & (buffer[3] << 16),
  // };

  type FileAttributesStruct = {
    // Reserved UB[1]
    reserved: number;
    // UseDirectBlit UB[1]
    useDirectBlit: number;
    // UseGPU  UB[1]
    useGPU: number;
    // HasMetadata UB[1]
    hasMetadata: number;
    // ActionScript3 UB[1]
    actionScript3: number;
    // Reserved UB[2]
    reserved2: number;
    // UseNetwork UB[1]
    useNetwork: number;
    // Reserved UB[24]
    reserved3: number;
  };

  const deserialiser = new DeserialiserFactory<FileAttributesStruct>()
    .field("reserved", bit())
    .field("useDirectBlit", bit())
    .field("useGPU", bit())
    .field("hasMetadata", bit())
    .field("actionScript3", bit())
    .field("reserved2", bytes(2))
    .field("useNetwork", bit())
    .field("reserved3", bytes(24))
    .build();

  const s = deserialiser.deserialise(Bitstream.fromBuffer(buffer));

  const tag: Tag = {
    type: "FileAttributes",
    useDirectBlit: Boolean(s.useDirectBlit),
    useGPU: Boolean(s.useGPU),
    hasMetadata: Boolean(s.hasMetadata),
    actionScript3: Boolean(s.actionScript3),
    useNetwork: Boolean(s.useNetwork),
  };

  return tag;
};

// TODO: figure this all out
const parseMatrix = (buffer: Uint8Array): Matrix => {
  //     reserved1: buffer[0] & 0b1000_0000,

  let nextFieldBitIndex = 0;

  // HasScale UB[1]
  const hasScale = (buffer[0] & (1 << nextFieldBitIndex)) === 1;
  nextFieldBitIndex += 1;

  let scaleX = 1;
  let scaleY = 1;

  let rotateSkew0 = 1;
  let rotateSkew1 = 1;

  let translateX = 0;
  let translateY = 0;

  // pg 22

  if (hasScale) {
    // NScaleBits If HasScale = 1, UB[5]
    const nScaleBits = buffer[0] & (0b0011_1110 >> 1);
    //ScaleX If HasScale = 1, FB[NScaleBits]
    //ScaleY If HasScale = 1, FB[NScaleBits]
    nextFieldBitIndex += 5 + nScaleBits * 2;

    throw "TODO: figure out how to parse FB[nBits]";
  }

  const hasRotateByte = Math.floor(nextFieldBitIndex / 8);
  const hasRotateBitIndex = nextFieldBitIndex - hasRotateByte * 8;
  const hasRotate = (buffer[hasRotateByte] & (1 << hasRotateBitIndex)) === 1;

  if (hasRotate) {
    const nRotateBits = buffer[0] & (0b0011_1110 >> 1);
  }

  return { scaleX, scaleY, rotateSkew0, rotateSkew1, translateX, translateY };
};

const parseRGB = (n: number): RGB => {
  return {
    red: (n & (0xff << 0)) >> 0,
    green: (n & (0xff << 1)) >> 1,
    blue: (n & (0xff << 2)) >> 2,
  };
};

const parseRGBA = (n: number): RGBA => {
  return {
    red: (n & (0xff << 0)) >> 0,
    green: (n & (0xff << 1)) >> 1,
    blue: (n & (0xff << 2)) >> 2,
    alpha: (n & (0xff << 3)) >> 3,
  };
};

const readLittleEndian = (bitstream: Bitstream, length: number): number => {
  let buffer = "";

  for (let i = 0; i < length; i++) {
    buffer += bitstream.readSync(1);
  }

  return parseInt(buffer, 2);
};

export const parseFillStyleArray = (
  bitstream: Bitstream,
  shapeType: ShapeType,
): FillStyle[] => {
  const startIndex = bitstream.index;
  let itemCount = readLittleEndian(bitstream, 8);

  if (itemCount === 0xff) {
    itemCount = readLittleEndian(bitstream, 16);
  }

  parserDebugLog("fillStyles", "read fill style count", {
    shapeType,
    startIndex,
    afterCountIndex: bitstream.index,
    itemCount,
  });

  const fillStyles: FillStyle[] = [];

  if (itemCount > 0) {
    parserDebugLog("fillStyles", "returning early without consuming styles", {
      shapeType,
      itemCount,
      currentIndex: bitstream.index,
      available: bitstream.available,
    });
  }

  return fillStyles;

  // while (fillStyles.length < itemCount) {
  //   console.log("loop");
  //   const typeCode = bitstream.readSync(8);

  //   console.log({ typeCode });

  //   if (!(typeCode in FillStyleCodeNames)) {
  //     throw `parseFillStyleArray: encountered unknown fill style type: ${typeCode}`;
  //   }

  //   const type = FillStyleCodeNames[typeCode];

  //   switch (type) {
  //     case "SOLID": {
  //       const isRGBA = shapeType === "Shape3";
  //       const colorBytes = isRGBA ? 4 : 3;
  //       const colorValue = bitstream.readSync(colorBytes * 8);
  //       const color = isRGBA ? parseRGBA(colorValue) : parseRGB(colorValue);

  //       const fillStyle = {
  //         type,
  //         color,
  //       };

  //       fillStyles.push(fillStyle);
  //       break;
  //     }
  //     case "LINEAR_GRADIENT":
  //     case "RADIAL_GRADIENT":
  //     case "FOCAL_RADIAL_GRADIENT":
  //       throw "TODO: parseFillStyleArray gradient";
  //     case "REPEATING_BITMAP":
  //     case "CLIPPED_BITMAP":
  //     case "NON_SMOOTHED_REPEATING_BITMAP":
  //     case "NON_SMOOTHED_CLIPPED_BITMAP": {
  //       throw "TODO: parseFillStyleArray bitmap";
  //     }
  //   }
  // }

  // return fillStyles;
};

const parseLineStyleArray = (
  bitstream: Bitstream,
  shapeType: ShapeType,
): LineStyle[] => {
  const startIndex = bitstream.index;
  let itemCount = bitstream.readSync(8);

  if (itemCount === 0xff) {
    itemCount = bitstream.readSync(16);
  }

  parserDebugLog("lineStyles", "read line style count", {
    shapeType,
    startIndex,
    afterCountIndex: bitstream.index,
    itemCount,
  });

  const lineStyles: LineStyle[] = [];

  if (shapeType === "Shape4") {
    throw "TODO: implement LINESTYLE2";
  }

  while (lineStyles.length < itemCount) {
    parserDebugLog("lineStyles", "reading line style", {
      shapeType,
      lineStyleIndex: lineStyles.length,
      currentIndex: bitstream.index,
      available: bitstream.available,
    });

    const width = bitstream.readSync(16);
    const isRGBA = shapeType === "Shape3";
    const colorBytes = isRGBA ? 4 : 3;
    const colorValue = bitstream.readSync(colorBytes * 8);
    const color = isRGBA ? parseRGBA(colorValue) : parseRGB(colorValue);

    lineStyles.push({ width, color });
  }

  return lineStyles;
};

// When an unsigned-bit value is expanded into a larger word size,
// the leftmost bits are filled with zeros.
// When a signed-bit value is expanded into a larger word size,
// the high bit is copied to the leftmost bits.
const readSb = (bitstream: Bitstream, length: number) => {
  const bits = bitstream.read(length);
  const highBit = (bits >> length) & 1;
};

const getShapeRecordFlags = (flags: number) => {
  const stateNewStyles = (flags & 0b10000) != 0;
  const stateLineStyle = (flags & 0b1000) != 0;
  const stateFillStyle1 = (flags & 0b100) != 0;
  const stateFillStyle0 = (flags & 0b10) != 0;
  const stateMoveTo = (flags & 0b1) != 0;

  return {
    stateNewStyles,
    stateLineStyle,
    stateFillStyle1,
    stateFillStyle0,
    stateMoveTo,
  };
};

const parseShapeRecord = (
  bitstream: Bitstream,
  shapeType: ShapeType,
  numFillBits: number,
  numLineBits: number,
): ShapeRecord => {
  const recordStartIndex = bitstream.index;
  const isEdgeRecord = bitstream.readSync(1) === 1;

  parserDebugLog("shapeRecord", "record start", {
    shapeType,
    recordStartIndex,
    isEdgeRecord,
    numFillBits,
    numLineBits,
    available: bitstream.available,
  });

  if (!isEdgeRecord) {
    const isEndOfShape = bitstream.readSync(5) === 0;
    if (isEndOfShape) {
      parserDebugLog("shapeRecord", "end shape record", {
        currentIndex: bitstream.index,
      });
      return { type: "EndShape" };
    }

    //StyleChangeRecord

    const record: ShapeRecord = { type: "StyleChange" };

    const flags = bitstream.readSync(5);

    const {
      stateNewStyles,
      stateLineStyle,
      stateFillStyle1,
      stateFillStyle0,
      stateMoveTo,
    } = getShapeRecordFlags(flags);

    parserDebugLog("shapeRecord", "style change flags", {
      currentIndex: bitstream.index,
      flags,
      stateNewStyles,
      stateLineStyle,
      stateFillStyle1,
      stateFillStyle0,
      stateMoveTo,
    });

    if (stateMoveTo) {
      // 130
      const moveBits = bitstream.readSync(5);
      const deltaX = bitstream.readSigned(moveBits);
      const deltaY = bitstream.readSigned(moveBits);
      record.moveTo = { deltaX, deltaY };
    }

    if (stateFillStyle0) {
      record.fillStyle0 = bitstream.readSync(numFillBits);
    }

    if (stateFillStyle1) {
      record.fillStyle1 = bitstream.readSync(numFillBits);
    }

    if (stateLineStyle) {
      record.lineStyle = bitstream.readSync(numLineBits);
    }

    if (stateNewStyles) {
      parserDebugLog("shapeRecord", "parsing new styles", {
        currentIndex: bitstream.index,
        available: bitstream.available,
      });

      const fillStyles = parseFillStyleArray(bitstream, shapeType);
      const lineStyles = parseLineStyleArray(bitstream, shapeType);

      const numFillBits = bitstream.readSync(4);
      const numLineBits = bitstream.readSync(4);

      parserDebugLog("shapeRecord", "parsed new styles", {
        currentIndex: bitstream.index,
        fillStyleCount: fillStyles.length,
        lineStyleCount: lineStyles.length,
        numFillBits,
        numLineBits,
      });

      record.newStyles = { fillStyles, lineStyles };
    }

    return record;
  }

  const isStraightEdge = bitstream.readSync(1) === 1;
  // Number of bits per value (2 less than the actual number).
  const bitsPerValue = bitstream.readSync(4);

  if (isStraightEdge) {
    const record: ShapeRecord = {
      type: "StraightEdge",
      lineType: "General",
      deltaX: 0,
      deltaY: 0,
    };

    const isGeneralLine = bitstream.readSync(1) === 1;
    let isVerticalLine = false;
    if (!isGeneralLine) {
      isVerticalLine = bitstream.readSync(1) === 1;
      record.lineType = isVerticalLine ? "Vertical" : "Horizontal";
    }

    if (isGeneralLine || !isVerticalLine) {
      record.deltaX = bitstream.readSigned(bitsPerValue + 2);
    }

    if (isGeneralLine || isVerticalLine) {
      record.deltaY = bitstream.readSigned(bitsPerValue + 2);
    }

    return record;
  }

  const controlDeltaX = bitstream.readSigned(bitsPerValue + 2);
  const controlDeltaY = bitstream.readSigned(bitsPerValue + 2);
  const anchorDeltaX = bitstream.readSigned(bitsPerValue + 2);
  const anchorDeltaY = bitstream.readSigned(bitsPerValue + 2);

  const record: ShapeRecord = {
    type: "CurvedEdge",
    controlDeltaX,
    controlDeltaY,
    anchorDeltaX,
    anchorDeltaY,
  };

  return record;
};

const parseShapeRecords = (
  reader: Bitstream,
  shapeType: ShapeType,
  numFillBits: number,
  numLineBits: number,
): ShapeRecord[] => {
  const shapeRecords: ShapeRecord[] = [];

  parserDebugLog("shapeRecords", "start parsing shape records", {
    shapeType,
    currentIndex: reader.index,
    available: reader.available,
    numFillBits,
    numLineBits,
  });

  while (reader.available > 0) {
    const record = parseShapeRecord(
      reader,
      shapeType,
      numFillBits,
      numLineBits,
    );

    shapeRecords.push(record);

    parserDebugLog("shapeRecords", "parsed shape record", {
      shapeType,
      currentIndex: reader.index,
      available: reader.available,
      recordType: record.type,
      recordCount: shapeRecords.length,
    });

    if (record.type === "EndShape") {
      break;
    }
    continue;
  }

  return shapeRecords;
};

const parseShapeWithStyle = (
  bitstream: Bitstream,
  shapeType: ShapeType,
): ShapeWithStyle => {
  // FillStyles FILLSTYLEARRAY Array of fill styles.
  // LineStyles LINESTYLEARRAY Array of line styles.
  // NumFillBits UB[4] Number of fill index bits.
  // NumLineBits UB[4] Number of line index bits.
  // ShapeRecords SHAPERECORD[one or more] Shape records

  parserDebugLog("shapeWithStyle", "start", {
    shapeType,
    currentIndex: bitstream.index,
    available: bitstream.available,
  });

  const fillStyles = parseFillStyleArray(bitstream, shapeType);

  const lineStyles = parseLineStyleArray(bitstream, shapeType);

  const numFillBits = bitstream.readSync(4);
  const numLineBits = bitstream.readSync(4);

  parserDebugLog("shapeWithStyle", "parsed style arrays", {
    shapeType,
    currentIndex: bitstream.index,
    fillStyleCount: fillStyles.length,
    lineStyleCount: lineStyles.length,
    numFillBits,
    numLineBits,
  });

  const shapeRecords = parseShapeRecords(
    bitstream,
    shapeType,
    numFillBits,
    numLineBits,
  );

  return { fillStyles, lineStyles, numFillBits, numLineBits, shapeRecords };
};

tagParsers[TagCode.DefineShape] = (buffer) => {
  const reader = new Bitstream(buffer);

  const id = reader.readSync(2);
  const bounds = parseRect(reader);
  const shapes = parseShapeWithStyle(reader, "Shape1");

  const tag: Tag = {
    type: "DefineShape",
    id,
    bounds,
    shapes,
  };

  return tag;
};

tagParsers[TagCode.DefineShape2] = (buffer) => {
  const reader = new Bitstream(buffer);

  const id = reader.readSync(2);
  const bounds = parseRect(reader);
  const shapes = parseShapeWithStyle(reader, "Shape2");

  const tag: Tag = {
    type: "DefineShape2",
    id,
    bounds,
    shapes,
  };

  return tag;
};

const TODO = () => {
  throw new Error("TODO");
};

tagParsers[TagCode.DefineShape3] = (buffer) => {
  const reader = new Bitstream(buffer);

  const id = new Uint16Array(buffer)[0];
  // skip, TODO: figure out byte ordering
  reader.readSync(16);

  const bounds = parseRect(reader);
  const shapes = parseShapeWithStyle(reader, "Shape3");

  const tag: Tag = {
    type: "DefineShape3",
    id,
    bounds,
    shapes,
  };

  return tag;
};

const TODO_PARSER = (name: string) => (_: Uint8Array) => {
  return null as unknown as Tag;
};

tagParsers[TagCode.DefineSceneAndFrameLabelData] = TODO_PARSER(
  "DefineSceneAndFrameLabelData",
);
tagParsers[TagCode.DefineFont3] = TODO_PARSER("DefineFont3");
tagParsers[TagCode.DefineFontAlignZones] = TODO_PARSER("DefineFontAlignZones");
tagParsers[TagCode.DefineEditText] = TODO_PARSER("DefineEditText");
tagParsers[TagCode.DefineFontName] = TODO_PARSER("DefineFontName");
tagParsers[TagCode.DefineText] = TODO_PARSER("DefineText");
tagParsers[TagCode.DefineSprite] = TODO_PARSER("DefineSprite");

const parseTag = (
  buffer: Uint8Array,
  startIndex: number,
): { tag: Tag; nextTagStartIndex: number } => {
  if (startIndex + 2 > buffer.length) {
    return { tag: null as unknown as Tag, nextTagStartIndex: buffer.length };
  }

  const tagCodeAndLength = new Uint16Array(
    buffer.slice(startIndex, startIndex + 2).buffer,
  )[0];

  // tag code is first 10 bits
  const tagCode = tagCodeAndLength >> 6;

  if (!(tagCode in tagParsers)) {
    throw `parseTags: encountered unknown tag: ${
      TagTypeNames[tagCode] || tagCode
    }`;
  }

  // length is remaining 6 bits
  let length = tagCodeAndLength & 0b111111;

  let attributesStartIndex = startIndex + 2;

  // The last six unsigned bits of the tag header indicate the length of the data block to
  // follow if it is 62 bytes or less. If the length of the data block is more than 62 bytes,
  // then this field has all 1s and the length is indicated in the following dword
  if (length > 62) {
    const dv = new DataView(
      buffer.slice(startIndex + 2, startIndex + 6).reverse().buffer,
    );
    length = dv.getUint32(0);
    attributesStartIndex = startIndex + 6;
  }

  parserDebugLog("tag", "dispatch", {
    startIndex,
    tagCode,
    tagType: TagTypeNames[tagCode] || tagCode,
    length,
    attributesStartIndex,
  });

  const bodyBuffer = buffer.slice(
    attributesStartIndex,
    attributesStartIndex + length,
  );

  const parseTag = tagParsers[tagCode];
  const tag = parseTag(bodyBuffer);

  return {
    tag,
    nextTagStartIndex: attributesStartIndex + length,
  };

  // case TagCode.FileAttributes:
  // case TagCode.DefineSceneAndFrameLabelData:
  // case TagCode.DefineShape:
  // case TagCode.DefineShape2:
  // case TagCode.DefineShape3:
  // case TagCode.DefineShape4:
  // case TagCode.DefineFontName:
  // case TagCode.DefineFont3:
  // case TagCode.DefineText:
  // case TagCode.DefineFontAlignZones:
  // case TagCode.DefineEditText:
  // case TagCode.DefineSprite:
  // case TagCode.DefineBitsLossless:
  // case TagCode.DefineBitsLossless2:
  // case TagCode.PlaceObject2:
  // case TagCode.SymbolClass:
  // case TagCode.ShowFrame:
  // case TagCode.DoABC:
};

export const parseTags = (buffer: Uint8Array): Tag[] => {
  const tags: Tag[] = [];

  let index = 0;
  while (index < buffer.length) {
    const { tag, nextTagStartIndex } = parseTag(buffer, index);
    tags.push(tag);
    index = nextTagStartIndex;
  }

  return tags;
};

// ITEM TYPES
// FileAttributes
// SetBackgroundColor
// DefineSceneAndFrameLabelData
// DefineShape3
// DefineFont3
// DefineFontAlignZones
// DefineEditText
// DefineShape

// DefineFontName

// DefineText
// DefineSprite
// DefineShape2
// DefineBitsLossless2
// PlaceObject2
// DefineBitsLossless
// DefineShape4
// DoABC2
// SymbolClass
// ShowFrame
