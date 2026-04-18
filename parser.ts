import { Bitstream } from "./bitstream.ts";
import { bit, bytes, DeserialiserFactory, sbytes, u8 } from "./struct.ts";
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
      bitmapId: number;
      bitmapMatrix: Matrix;
    };

interface LineStyle<ColorType = RGB> {
  width: number;
  color: ColorType;
}

interface LineStyle2<ColorType = RGB | RGBA> {
  width: number;
  startCapStyle: number;
  joinStyle: number;
  hasFillFlag: boolean;
  noHScaleFlag: boolean;
  noVScaleFlag: boolean;
  pixelHintingFlag: boolean;
  noClose: boolean;
  endCapStyle: number;
  miterLimitFactor?: number;
  color?: ColorType;
  fillType?: FillStyle;
}

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
      newStyles?: {
        fillStyles: FillStyle[];
        lineStyles: LineStyle[];
        numFillBits: number;
        numLineBits: number;
      };
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
    }
  | {
      type: "DefineShape4";
      id: number;
      bounds: Rect;
      edgeBounds: Rect;
      usesFillWindingRule: boolean;
      usesNonScalingStrokes: boolean;
      usesScalingStrokes: boolean;
      shapes: ShapeWithStyle;
    }
  | {
      type: "DefineBitsLossless2";
      characterId: number;
      bitmapFormat: number;
      bitmapWidth: number;
      bitmapHeight: number;
      bitmapColorTableSize?: number;
      zlibBitmapData: Uint8Array;
    }
  | {
      type: "DefineBitsLossless";
      characterId: number;
      bitmapFormat: number;
      bitmapWidth: number;
      bitmapHeight: number;
      bitmapColorTableSize?: number;
      zlibBitmapData: Uint8Array;
    }
  | {
      type: "PlaceObject2";
      hasClipActions: boolean;
      hasClipDepth: boolean;
      hasName: boolean;
      hasRatio: boolean;
      hasColorTransform: boolean;
      hasMatrix: boolean;
      hasCharacter: boolean;
      move: boolean;
      depth: number;
      characterId?: number;
      matrix?: Matrix;
      ratio?: number;
      name?: string;
      clipDepth?: number;
    }
  | {
      type: "DoABC";
      flags: number;
      name: string;
      abcData: Uint8Array;
    }
  | {
      type: "SymbolClass";
      symbols: { tag: number; name: string }[];
    }
  | {
      type: "ShowFrame";
    }
  | {
      type: "Unimplemented";
      tagType: string;
    }
  | {
      type: "End";
    };

const readU16LE = (buffer: Uint8Array, offset: number) =>
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint16(
    offset,
    true,
  );

const parseRect = (bs: Bitstream): Rect => {
  const rect = rectDeserialiser.deserialise(bs);
  const rectBitLength = 5 + rect.nBits * 4;
  const padding = (8 - (rectBitLength % 8)) % 8;

  if (padding > 0) {
    bs.readSync(padding);
  }

  return rect;
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
    (x) => sbytes(x.nScaleBits as number),
  )
  .conditionalField(
    (x) => x.hasScale === 1,
    "scaleY",
    (x) => sbytes(x.nScaleBits as number),
  )
  .field("hasRotate", bit())
  .conditionalField((x) => x.hasRotate === 1, "nRotateBits", bytes(5))
  .conditionalField(
    (x) => x.hasRotate === 1,
    "rotateSkew0",
    (x) => sbytes(x.nRotateBits as number),
  )
  .conditionalField(
    (x) => x.hasRotate === 1,
    "rotateSkew1",
    (x) => sbytes(x.nRotateBits as number),
  )
  .field("nTranslateBits", bytes(5))
  .field("translateX", (x) => sbytes(x.nTranslateBits as number))
  .field("translateY", (x) => sbytes(x.nTranslateBits as number))
  .build();

export const parseMatrixRecord = (bitstream: Bitstream): Matrix => {
  const s = matrixDeserialiser.deserialise(bitstream);
  const withDefault = (value: number | undefined, fallback: number) =>
    value === undefined || Number.isNaN(value) ? fallback : value;
  const fbDefault = (value: number | undefined, fallback: number) =>
    value === undefined || Number.isNaN(value) ? fallback : value / 65536;

  const padding = (8 - (bitstream.index % 8)) % 8;
  if (padding > 0) {
    bitstream.readSync(padding);
  }

  return {
    scaleX: fbDefault(s.scaleX as number | undefined, 1),
    scaleY: fbDefault(s.scaleY as number | undefined, 1),
    rotateSkew0: fbDefault(s.rotateSkew0 as number | undefined, 0),
    rotateSkew1: fbDefault(s.rotateSkew1 as number | undefined, 0),
    translateX: withDefault(s.translateX as number | undefined, 0),
    translateY: withDefault(s.translateY as number | undefined, 0),
  };
};

const parseNullTerminatedString = (bitstream: Bitstream): string => {
  const chars: number[] = [];

  while (true) {
    const value = bitstream.readU8();
    if (value === 0) {
      break;
    }

    chars.push(value);
  }

  return String.fromCharCode(...chars);
};

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

  // FrameSize (RECT) — variable size, byte-aligned
  const bitstream = new Bitstream(buffer.slice(8));
  const frameSize = parseRect(bitstream);

  // FrameRate — UI16, 8.8 fixed point (low byte = fraction, high byte = integer)
  const frameRateRaw = bitstream.readU16();
  const frameRate = (frameRateRaw >> 8) + (frameRateRaw & 0xff) / 256;

  // FrameCount — UI16
  const frameCount = bitstream.readU16();

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

tagParsers[TagCode.End] = () => {
  return { type: "End" } satisfies Tag;
};

tagParsers[TagCode.ShowFrame] = () => {
  return { type: "ShowFrame" } satisfies Tag;
};

tagParsers[TagCode.SetBackgroundColor] = (buffer) => {
  const color = rgbDeserialiser.deserialise(Bitstream.fromBuffer(buffer));

  return {
    type: "SetBackgroundColor",
    color,
  } satisfies Tag;
};

tagParsers[TagCode.FileAttributes] = (buffer) => {
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

  return {
    type: "FileAttributes",
    useDirectBlit: Boolean(s.useDirectBlit),
    useGPU: Boolean(s.useGPU),
    hasMetadata: Boolean(s.hasMetadata),
    actionScript3: Boolean(s.actionScript3),
    useNetwork: Boolean(s.useNetwork),
  } satisfies Tag;
};

const parseRGB = (n: number): RGB => {
  return {
    red: (n >> 16) & 0xff,
    green: (n >> 8) & 0xff,
    blue: n & 0xff,
  };
};

const parseRGBA = (n: number): RGBA => {
  return {
    red: (n >> 24) & 0xff,
    green: (n >> 16) & 0xff,
    blue: (n >> 8) & 0xff,
    alpha: n & 0xff,
  };
};

const parseFillStyle = (
  bitstream: Bitstream,
  shapeType: ShapeType,
): FillStyle => {
  const typeCode = bitstream.readSync(8);

  if (!(typeCode in FillStyleCodeNames)) {
    throw `parseFillStyle: encountered unknown fill style type: ${typeCode}`;
  }

  const type = FillStyleCodeNames[typeCode];

  switch (type) {
    case "SOLID": {
      const isRGBA = shapeType === "Shape3" || shapeType === "Shape4";
      const colorBytes = isRGBA ? 4 : 3;
      const colorValue = bitstream.readSync(colorBytes * 8);
      const color = isRGBA ? parseRGBA(colorValue) : parseRGB(colorValue);

      return { type, color };
    }
    case "LINEAR_GRADIENT":
    case "RADIAL_GRADIENT":
    case "FOCAL_RADIAL_GRADIENT":
      throw `parseFillStyle: unsupported gradient fill style type: ${type}`;
    case "REPEATING_BITMAP":
    case "CLIPPED_BITMAP":
    case "NON_SMOOTHED_REPEATING_BITMAP":
    case "NON_SMOOTHED_CLIPPED_BITMAP": {
      const bitmapId = bitstream.readU16();
      const bitmapMatrix = parseMatrixRecord(bitstream);

      return { type, bitmapId, bitmapMatrix };
    }
  }
};

export const parseFillStyleArray = (
  bitstream: Bitstream,
  shapeType: ShapeType,
): FillStyle[] => {
  const startIndex = bitstream.index;
  let itemCount = bitstream.readU8();

  if (itemCount === 0xff) {
    itemCount = bitstream.readU16();
  }

  parserDebugLog("fillStyles", "read fill style count", {
    shapeType,
    startIndex,
    afterCountIndex: bitstream.index,
    itemCount,
  });

  const fillStyles: FillStyle[] = [];

  while (fillStyles.length < itemCount) {
    fillStyles.push(parseFillStyle(bitstream, shapeType));
  }

  return fillStyles;
};

export const parseLineStyleArray = (
  bitstream: Bitstream,
  shapeType: ShapeType,
): LineStyle[] => {
  const startIndex = bitstream.index;
  let itemCount = bitstream.readU8();

  if (itemCount === 0xff) {
    itemCount = bitstream.readU16();
  }

  parserDebugLog("lineStyles", "read line style count", {
    shapeType,
    startIndex,
    afterCountIndex: bitstream.index,
    itemCount,
  });

  const lineStyles: LineStyle[] = [];

  if (shapeType === "Shape4") {
    while (lineStyles.length < itemCount) {
      const width = bitstream.readU16();
      const startCapStyle = bitstream.readSync(2);
      const joinStyle = bitstream.readSync(2);
      const hasFillFlag = bitstream.readSync(1) === 1;
      const noHScaleFlag = bitstream.readSync(1) === 1;
      const noVScaleFlag = bitstream.readSync(1) === 1;
      const pixelHintingFlag = bitstream.readSync(1) === 1;
      bitstream.readSync(5);
      const noClose = bitstream.readSync(1) === 1;
      const endCapStyle = bitstream.readSync(2);
      const miterLimitFactor =
        joinStyle === 2 ? bitstream.readU16() : undefined;

      const lineStyle: LineStyle2<RGBA> = {
        width,
        startCapStyle,
        joinStyle,
        hasFillFlag,
        noHScaleFlag,
        noVScaleFlag,
        pixelHintingFlag,
        noClose,
        endCapStyle,
        miterLimitFactor,
      };

      if (hasFillFlag) {
        lineStyle.fillType = parseFillStyle(bitstream, shapeType);
      } else {
        lineStyle.color = parseRGBA(bitstream.readSync(32));
      }

      lineStyles.push(lineStyle as unknown as LineStyle);
    }

    return lineStyles;
  }

  while (lineStyles.length < itemCount) {
    parserDebugLog("lineStyles", "reading line style", {
      shapeType,
      lineStyleIndex: lineStyles.length,
      currentIndex: bitstream.index,
      available: bitstream.available,
    });

    const width = bitstream.readU16();
    const isRGBA = shapeType === "Shape3";
    const colorBytes = isRGBA ? 4 : 3;
    const colorValue = bitstream.readSync(colorBytes * 8);
    const color = isRGBA ? parseRGBA(colorValue) : parseRGB(colorValue);

    lineStyles.push({ width, color });
  }

  return lineStyles;
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
    const flags = bitstream.readSync(5);

    if (flags === 0) {
      parserDebugLog("shapeRecord", "end shape record", {
        currentIndex: bitstream.index,
      });
      return { type: "EndShape" };
    }

    //StyleChangeRecord

    const record: ShapeRecord = { type: "StyleChange" };

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

      if (shapeType !== "Shape4") {
        const padding = (8 - (bitstream.index % 8)) % 8;
        if (padding > 0) {
          bitstream.readSync(padding);
        }
      }

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

      record.newStyles = {
        fillStyles,
        lineStyles,
        numFillBits,
        numLineBits,
      };
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
  let currentNumFillBits = numFillBits;
  let currentNumLineBits = numLineBits;

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
      currentNumFillBits,
      currentNumLineBits,
    );

    shapeRecords.push(record);

    parserDebugLog("shapeRecords", "parsed shape record", {
      shapeType,
      currentIndex: reader.index,
      available: reader.available,
      recordType: record.type,
      recordCount: shapeRecords.length,
    });

    if (record.type === "StyleChange" && record.newStyles) {
      currentNumFillBits = record.newStyles.numFillBits;
      currentNumLineBits = record.newStyles.numLineBits;
    }

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

  const id = reader.readU16();
  const bounds = parseRect(reader);
  const shapes = parseShapeWithStyle(reader, "Shape1");

  return {
    type: "DefineShape",
    id,
    bounds,
    shapes,
  } satisfies Tag;
};

tagParsers[TagCode.DefineShape2] = (buffer) => {
  const reader = new Bitstream(buffer);

  const id = reader.readU16();
  const bounds = parseRect(reader);
  const shapes = parseShapeWithStyle(reader, "Shape2");

  return {
    type: "DefineShape2",
    id,
    bounds,
    shapes,
  } satisfies Tag;
};

tagParsers[TagCode.DefineShape3] = (buffer) => {
  const reader = new Bitstream(buffer);

  const id = reader.readU16();

  const bounds = parseRect(reader);
  const shapes = parseShapeWithStyle(reader, "Shape3");

  return {
    type: "DefineShape3",
    id,
    bounds,
    shapes,
  } satisfies Tag;
};

tagParsers[TagCode.DefineShape4] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);

  const id = reader.readU16();
  const bounds = parseRect(reader);
  const edgeBounds = parseRect(reader);
  reader.readSync(5);
  const usesFillWindingRule = reader.readSync(1) === 1;
  const usesNonScalingStrokes = reader.readSync(1) === 1;
  const usesScalingStrokes = reader.readSync(1) === 1;
  const shapes = parseShapeWithStyle(reader, "Shape4");

  return {
    type: "DefineShape4",
    id,
    bounds,
    edgeBounds,
    usesFillWindingRule,
    usesNonScalingStrokes,
    usesScalingStrokes,
    shapes,
  } satisfies Tag;
};

const parseDefineBitsLossless = (
  tagType: "DefineBitsLossless" | "DefineBitsLossless2",
  validNonPaletteFormats: number[],
  buffer: Uint8Array,
): Tag => {
  const characterId = readU16LE(buffer, 0);
  const bitmapFormat = buffer[2];
  const bitmapWidth = readU16LE(buffer, 3);
  const bitmapHeight = readU16LE(buffer, 5);

  let index = 7;
  let bitmapColorTableSize: number | undefined;

  if (bitmapFormat === 3) {
    bitmapColorTableSize = buffer[index];
    index += 1;
  } else if (!validNonPaletteFormats.includes(bitmapFormat)) {
    throw `${tagType}: unsupported bitmap format ${bitmapFormat}`;
  }

  const zlibBitmapData = buffer.slice(index);

  return {
    type: tagType,
    characterId,
    bitmapFormat,
    bitmapWidth,
    bitmapHeight,
    bitmapColorTableSize,
    zlibBitmapData,
  } satisfies Tag;
};

tagParsers[TagCode.DefineBitsLossless2] = (buffer) =>
  parseDefineBitsLossless("DefineBitsLossless2", [5], buffer);

tagParsers[TagCode.DefineBitsLossless] = (buffer) =>
  parseDefineBitsLossless("DefineBitsLossless", [4, 5], buffer);

tagParsers[TagCode.PlaceObject2] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const flags = reader.readU8();

  const hasClipActions = (flags & 0x80) !== 0;
  const hasClipDepth = (flags & 0x40) !== 0;
  const hasName = (flags & 0x20) !== 0;
  const hasRatio = (flags & 0x10) !== 0;
  const hasColorTransform = (flags & 0x08) !== 0;
  const hasMatrix = (flags & 0x04) !== 0;
  const hasCharacter = (flags & 0x02) !== 0;
  const move = (flags & 0x01) !== 0;

  const depth = reader.readU16();
  const characterId = hasCharacter ? reader.readU16() : undefined;
  const matrix = hasMatrix ? parseMatrixRecord(reader) : undefined;

  if (hasColorTransform) {
    throw "PlaceObject2: unsupported color transform";
  }

  const ratio = hasRatio ? reader.readU16() : undefined;
  const name = hasName ? parseNullTerminatedString(reader) : undefined;
  const clipDepth = hasClipDepth ? reader.readU16() : undefined;

  if (hasClipActions) {
    throw "PlaceObject2: unsupported clip actions";
  }

  return {
    type: "PlaceObject2",
    hasClipActions,
    hasClipDepth,
    hasName,
    hasRatio,
    hasColorTransform,
    hasMatrix,
    hasCharacter,
    move,
    depth,
    characterId,
    matrix,
    ratio,
    name,
    clipDepth,
  } satisfies Tag;
};

tagParsers[TagCode.DoABC] = (buffer) => {
  const flags = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  ).getUint32(0, true);

  const reader = Bitstream.fromBuffer(buffer.slice(4));
  const name = parseNullTerminatedString(reader);
  const abcByteOffset = 4 + reader.index / 8;
  const abcData = buffer.slice(abcByteOffset);

  return {
    type: "DoABC",
    flags,
    name,
    abcData,
  } satisfies Tag;
};

tagParsers[TagCode.SymbolClass] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const numSymbols = reader.readU16();
  const symbols: { tag: number; name: string }[] = [];

  for (let i = 0; i < numSymbols; i++) {
    const tag = reader.readU16();
    const name = parseNullTerminatedString(reader);
    symbols.push({ tag, name });
  }

  return {
    type: "SymbolClass",
    symbols,
  } satisfies Tag;
};

const TODO_PARSER =
  (name: string) =>
  (_: Uint8Array): Tag => {
    return { type: "Unimplemented", tagType: name };
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
    throw `parseTag: unexpected end of buffer at index ${startIndex}`;
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
  if (length === 0x3f) {
    length = new DataView(buffer.buffer, buffer.byteOffset).getUint32(
      startIndex + 2,
      true,
    );
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
};

export const parseTags = (buffer: Uint8Array): Tag[] => {
  const tags: Tag[] = [];

  let index = 0;
  while (index < buffer.length) {
    const { tag, nextTagStartIndex } = parseTag(buffer, index);
    tags.push(tag);
    if (tag.type === "End") {
      break;
    }
    index = nextTagStartIndex;
  }

  return tags;
};
