import { Bitstream } from "./bitstream.ts";
import { bit, bytes, DeserialiserFactory, sbytes, u8 } from "./struct.ts";
import { rectDeserialiser } from "./deserialisers.ts";
import { AbcFile, Decompiler } from "../avm/decompiler.ts";

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

interface GlyphEntry {
  glyphIndex: number;
  glyphAdvance: number;
}

interface ColorTransform {
  redMultTerm: number;
  greenMultTerm: number;
  blueMultTerm: number;
  alphaMultTerm: number;
  redAddTerm: number;
  greenAddTerm: number;
  blueAddTerm: number;
  alphaAddTerm: number;
}

interface TextRecord<ColorType = RGB> {
  fontId?: number;
  textColor?: ColorType;
  xOffset?: number;
  yOffset?: number;
  textHeight?: number;
  glyphEntries: GlyphEntry[];
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
      colorTransform?: ColorTransform;
      ratio?: number;
      name?: string;
      clipDepth?: number;
    }
  | {
      type: "PlaceObject3";
      hasClipActions: boolean;
      hasClipDepth: boolean;
      hasName: boolean;
      hasRatio: boolean;
      hasColorTransform: boolean;
      hasMatrix: boolean;
      hasCharacter: boolean;
      move: boolean;
      hasImage: boolean;
      hasClassName: boolean;
      hasCacheAsBitmap: boolean;
      hasBlendMode: boolean;
      hasFilterList: boolean;
      depth: number;
      className?: string;
      characterId?: number;
      matrix?: Matrix;
      colorTransform?: ColorTransform;
      ratio?: number;
      name?: string;
      clipDepth?: number;
      blendMode?: number;
      bitmapCache?: number;
    }
  | {
      type: "DoABC";
      flags: number;
      name: string;
      abcDataRaw: Uint8Array;
      abcData: AbcFile;
    }
  | {
      type: "SymbolClass";
      symbols: { tag: number; name: string }[];
    }
  | {
      type: "DefineEditText";
      characterId: number;
      bounds: Rect;
      hasText: boolean;
      wordWrap: boolean;
      multiline: boolean;
      password: boolean;
      readOnly: boolean;
      hasTextColor: boolean;
      hasMaxLength: boolean;
      hasFont: boolean;
      hasFontClass: boolean;
      autoSize: boolean;
      hasLayout: boolean;
      noSelect: boolean;
      border: boolean;
      wasStatic: boolean;
      html: boolean;
      useOutlines: boolean;
      fontId?: number;
      fontClass?: string;
      fontHeight?: number;
      textColor?: RGBA;
      maxLength?: number;
      align?: number;
      leftMargin?: number;
      rightMargin?: number;
      indent?: number;
      leading?: number;
      variableName: string;
      initialText?: string;
    }
  | {
      type: "DefineText";
      characterId: number;
      textBounds: Rect;
      textMatrix: Matrix;
      glyphBits: number;
      advanceBits: number;
      textRecords: TextRecord<RGB>[];
    }
  | {
      type: "DefineText2";
      characterId: number;
      textBounds: Rect;
      textMatrix: Matrix;
      glyphBits: number;
      advanceBits: number;
      textRecords: TextRecord<RGBA>[];
    }
  | {
      type: "DefineFontName";
      fontId: number;
      fontName: string;
      fontCopyright: string;
    }
  | {
      type: "DefineFontAlignZones";
      fontId: number;
      csmTableHint: number;
      zoneTable: {
        numZoneData: number;
        zoneData: { alignmentCoordinate: number; range: number }[];
        zoneMaskY: boolean;
        zoneMaskX: boolean;
      }[];
    }
  | {
      type: "DefineFont3";
      fontId: number;
      hasLayout: boolean;
      shiftJIS: boolean;
      smallText: boolean;
      ansi: boolean;
      wideOffsets: boolean;
      wideCodes: boolean;
      italic: boolean;
      bold: boolean;
      languageCode: number;
      fontName: string;
      numGlyphs: number;
      glyphShapeTable: ShapeRecord[][];
      codeTable: number[];
      fontAscent?: number;
      fontDescent?: number;
      fontLeading?: number;
      fontAdvanceTable?: number[];
      fontBoundsTable?: Rect[];
      kerningTable?: { code1: number; code2: number; adjustment: number }[];
    }
  | {
      type: "DefineSprite";
      spriteId: number;
      frameCount: number;
      controlTags: Tag[];
    }
  | {
      type: "ShowFrame";
    }
  | {
      type: "FrameLabel";
      name: string;
      namedAnchor: boolean;
    }
  | {
      type: "RemoveObject";
      characterId: number;
      depth: number;
    }
  | {
      type: "RemoveObject2";
      depth: number;
    }
  | {
      type: "DoAction";
      actions: Uint8Array;
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

const readS16 = (reader: Bitstream): number => {
  const val = reader.readU16();
  return val >= 0x8000 ? val - 0x10000 : val;
};

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

const parseCxFormWithAlpha = (reader: Bitstream): ColorTransform => {
  const hasAddTerms = reader.readSync(1) === 1;
  const hasMultTerms = reader.readSync(1) === 1;
  const nBits = reader.readSync(4);
  const redMultTerm = hasMultTerms ? reader.readSigned(nBits) : 256;
  const greenMultTerm = hasMultTerms ? reader.readSigned(nBits) : 256;
  const blueMultTerm = hasMultTerms ? reader.readSigned(nBits) : 256;
  const alphaMultTerm = hasMultTerms ? reader.readSigned(nBits) : 256;
  const redAddTerm = hasAddTerms ? reader.readSigned(nBits) : 0;
  const greenAddTerm = hasAddTerms ? reader.readSigned(nBits) : 0;
  const blueAddTerm = hasAddTerms ? reader.readSigned(nBits) : 0;
  const alphaAddTerm = hasAddTerms ? reader.readSigned(nBits) : 0;
  const padding = (8 - (reader.index % 8)) % 8;
  if (padding > 0) reader.readSync(padding);
  return {
    redMultTerm,
    greenMultTerm,
    blueMultTerm,
    alphaMultTerm,
    redAddTerm,
    greenAddTerm,
    blueAddTerm,
    alphaAddTerm,
  };
};

const skipFilterList = (reader: Bitstream): void => {
  const numberOfFilters = reader.readU8();
  for (let i = 0; i < numberOfFilters; i++) {
    const filterId = reader.readU8();
    switch (filterId) {
      case 0: // DropShadow: RGBA(4) + 4×FIXED(16) + FIXED8(2) + 1 byte bits = 23
        reader.readSync(23 * 8);
        break;
      case 1: // Blur: 2×FIXED(8) + 1 byte bits = 9
        reader.readSync(9 * 8);
        break;
      case 2: // Glow: RGBA(4) + 2×FIXED(8) + FIXED8(2) + 1 byte bits = 15
        reader.readSync(15 * 8);
        break;
      case 3: // Bevel: 2×RGBA(8) + 3×FIXED(12) + FIXED8(2) + 1 byte bits = 23
        reader.readSync(23 * 8);
        break;
      case 4: // GradientGlow
      case 7: {
        // GradientBevel
        const numColors = reader.readU8();
        // RGBA[numColors] + UI8[numColors] + 4×FIXED(16) + FIXED8(2) + 1 byte bits
        reader.readSync((numColors * 5 + 19) * 8);
        break;
      }
      case 5: {
        // Convolution
        const matrixX = reader.readU8();
        const matrixY = reader.readU8();
        // Divisor(4) + Bias(4) + FLOAT[matrixX*matrixY](4 each) + RGBA(4) + 1 byte bits
        reader.readSync((12 + matrixX * matrixY * 4 + 1) * 8);
        break;
      }
      case 6: // ColorMatrix: FLOAT[20] = 80 bytes
        reader.readSync(80 * 8);
        break;
      default:
        throw `skipFilterList: unknown filter ID ${filterId}`;
    }
  }
};

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

  let colorTransform: ColorTransform | undefined;
  if (hasColorTransform) {
    colorTransform = parseCxFormWithAlpha(reader);
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
    colorTransform,
    ratio,
    name,
    clipDepth,
  } satisfies Tag;
};

tagParsers[TagCode.PlaceObject3] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const flags1 = reader.readU8();
  const flags2 = reader.readU8();

  const hasClipActions = (flags1 & 0x80) !== 0;
  const hasClipDepth = (flags1 & 0x40) !== 0;
  const hasName = (flags1 & 0x20) !== 0;
  const hasRatio = (flags1 & 0x10) !== 0;
  const hasColorTransform = (flags1 & 0x08) !== 0;
  const hasMatrix = (flags1 & 0x04) !== 0;
  const hasCharacter = (flags1 & 0x02) !== 0;
  const move = (flags1 & 0x01) !== 0;

  const hasImage = (flags2 & 0x10) !== 0;
  const hasClassName = (flags2 & 0x08) !== 0;
  const hasCacheAsBitmap = (flags2 & 0x04) !== 0;
  const hasBlendMode = (flags2 & 0x02) !== 0;
  const hasFilterList = (flags2 & 0x01) !== 0;

  const depth = reader.readU16();
  const className =
    hasClassName || (hasImage && hasCharacter)
      ? parseNullTerminatedString(reader)
      : undefined;
  const characterId = hasCharacter ? reader.readU16() : undefined;
  const matrix = hasMatrix ? parseMatrixRecord(reader) : undefined;
  const colorTransform = hasColorTransform
    ? parseCxFormWithAlpha(reader)
    : undefined;
  const ratio = hasRatio ? reader.readU16() : undefined;
  const name = hasName ? parseNullTerminatedString(reader) : undefined;
  const clipDepth = hasClipDepth ? reader.readU16() : undefined;
  if (hasFilterList) skipFilterList(reader);
  const blendMode = hasBlendMode ? reader.readU8() : undefined;
  const bitmapCache = hasCacheAsBitmap ? reader.readU8() : undefined;

  return {
    type: "PlaceObject3",
    hasClipActions,
    hasClipDepth,
    hasName,
    hasRatio,
    hasColorTransform,
    hasMatrix,
    hasCharacter,
    move,
    hasImage,
    hasClassName,
    hasCacheAsBitmap,
    hasBlendMode,
    hasFilterList,
    depth,
    className,
    characterId,
    matrix,
    colorTransform,
    ratio,
    name,
    clipDepth,
    blendMode,
    bitmapCache,
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
  const abcDataRaw = buffer.slice(abcByteOffset);

  const avmDecompiler = new Decompiler();
  const abcData = avmDecompiler.run(Array.from(abcDataRaw));

  return {
    type: "DoABC",
    flags,
    name,
    abcDataRaw,
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

const parseEncodedU32 = (bitstream: Bitstream): number => {
  let result = 0;
  for (let i = 0; i < 5; i++) {
    const byte = bitstream.readU8();
    result |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) break;
  }
  return result;
};

tagParsers[TagCode.DefineSceneAndFrameLabelData] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);

  const sceneCount = parseEncodedU32(reader);
  const scenes: Scene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const offset = parseEncodedU32(reader);
    const name = parseNullTerminatedString(reader);
    scenes.push({ offset, name });
  }

  const frameLabelCount = parseEncodedU32(reader);
  const frames: Frame[] = [];
  for (let i = 0; i < frameLabelCount; i++) {
    const number = parseEncodedU32(reader);
    const label = parseNullTerminatedString(reader);
    frames.push({ number, label });
  }

  return {
    type: "DefineSceneAndFrameLabelData",
    sceneCount,
    scenes,
    frames,
  } satisfies Tag;
};
tagParsers[TagCode.DefineFont3] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);

  const fontId = reader.readU16();
  const hasLayout = reader.readSync(1) === 1;
  const shiftJIS = reader.readSync(1) === 1;
  const smallText = reader.readSync(1) === 1;
  const ansi = reader.readSync(1) === 1;
  const wideOffsets = reader.readSync(1) === 1;
  const wideCodes = reader.readSync(1) === 1;
  const italic = reader.readSync(1) === 1;
  const bold = reader.readSync(1) === 1;
  const languageCode = reader.readU8();
  const fontNameLen = reader.readU8();
  const fontNameBytes: number[] = [];
  for (let i = 0; i < fontNameLen; i++) {
    fontNameBytes.push(reader.readU8());
  }
  const fontName = String.fromCharCode(...fontNameBytes);
  const numGlyphs = reader.readU16();

  const glyphShapeTable: ShapeRecord[][] = [];
  const codeTable: number[] = [];

  if (numGlyphs > 0) {
    // Read offset table to determine glyph boundaries
    const offsets: number[] = [];
    for (let i = 0; i < numGlyphs; i++) {
      offsets.push(wideOffsets ? reader.readU32() : reader.readU16());
    }
    const codeTableOffset = wideOffsets ? reader.readU32() : reader.readU16();

    // Compute glyph byte sizes from offsets
    const glyphSizes: number[] = [];
    for (let i = 0; i < numGlyphs - 1; i++) {
      glyphSizes.push(offsets[i + 1] - offsets[i]);
    }
    glyphSizes.push(codeTableOffset - offsets[numGlyphs - 1]);

    // Parse each glyph shape using sub-buffers
    for (let i = 0; i < numGlyphs; i++) {
      const byteOffset = reader.index / 8;
      const glyphBytes = buffer.slice(byteOffset, byteOffset + glyphSizes[i]);
      const glyphReader = Bitstream.fromBuffer(glyphBytes);
      const numFillBits = glyphReader.readSync(4);
      const numLineBits = glyphReader.readSync(4);
      const records = parseShapeRecords(
        glyphReader,
        "Shape1",
        numFillBits,
        numLineBits,
      );
      glyphShapeTable.push(records);
      // Advance main reader by glyph byte size
      reader.index += glyphSizes[i] * 8;
    }

    // CodeTable: UI16[NumGlyphs]
    for (let i = 0; i < numGlyphs; i++) {
      codeTable.push(reader.readU16());
    }
  }

  let fontAscent: number | undefined;
  let fontDescent: number | undefined;
  let fontLeading: number | undefined;
  let fontAdvanceTable: number[] | undefined;
  let fontBoundsTable: Rect[] | undefined;
  let kerningTable:
    | { code1: number; code2: number; adjustment: number }[]
    | undefined;

  if (hasLayout) {
    fontAscent = readS16(reader);
    fontDescent = readS16(reader);
    fontLeading = readS16(reader);
    fontAdvanceTable = [];
    for (let i = 0; i < numGlyphs; i++) {
      fontAdvanceTable.push(readS16(reader));
    }
    fontBoundsTable = [];
    for (let i = 0; i < numGlyphs; i++) {
      fontBoundsTable.push(parseRect(reader));
    }
    const kerningCount = reader.readU16();
    kerningTable = [];
    for (let i = 0; i < kerningCount; i++) {
      // DefineFont3 always has wideCodes=1, so UI16+UI16+SI16
      const code1 = reader.readU16();
      const code2 = reader.readU16();
      const adjustment = readS16(reader);
      kerningTable.push({ code1, code2, adjustment });
    }
  }

  return {
    type: "DefineFont3",
    fontId,
    hasLayout,
    shiftJIS,
    smallText,
    ansi,
    wideOffsets,
    wideCodes,
    italic,
    bold,
    languageCode,
    fontName,
    numGlyphs,
    glyphShapeTable,
    codeTable,
    fontAscent,
    fontDescent,
    fontLeading,
    fontAdvanceTable,
    fontBoundsTable,
    kerningTable,
  } satisfies Tag;
};
tagParsers[TagCode.DefineFontAlignZones] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);

  const fontId = reader.readU16();
  const csmTableHint = reader.readSync(2);
  reader.readSync(6); // Reserved

  const zoneTable: {
    numZoneData: number;
    zoneData: { alignmentCoordinate: number; range: number }[];
    zoneMaskY: boolean;
    zoneMaskX: boolean;
  }[] = [];

  // Derive glyph count from remaining bytes:
  // Each ZONERECORD = 1 (NumZoneData) + NumZoneData*4 (FLOAT16 pairs) + 1 (mask byte)
  // With NumZoneData always 2: 1 + 2*4 + 1 = 10 bytes per record
  const remainingBytes = (reader.available / 8) | 0;
  const numGlyphs = remainingBytes / 10;

  for (let i = 0; i < numGlyphs; i++) {
    const numZoneData = reader.readU8();
    const zoneData: { alignmentCoordinate: number; range: number }[] = [];
    for (let j = 0; j < numZoneData; j++) {
      const alignmentCoordinate = reader.readFloat16();
      const range = reader.readFloat16();
      zoneData.push({ alignmentCoordinate, range });
    }
    reader.readSync(6); // Reserved
    const zoneMaskY = reader.readSync(1) === 1;
    const zoneMaskX = reader.readSync(1) === 1;
    zoneTable.push({ numZoneData, zoneData, zoneMaskY, zoneMaskX });
  }

  return {
    type: "DefineFontAlignZones",
    fontId,
    csmTableHint,
    zoneTable,
  } satisfies Tag;
};
tagParsers[TagCode.DefineEditText] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);

  const characterId = reader.readU16();
  const bounds = parseRect(reader);

  const hasText = reader.readSync(1) === 1;
  const wordWrap = reader.readSync(1) === 1;
  const multiline = reader.readSync(1) === 1;
  const password = reader.readSync(1) === 1;
  const readOnly = reader.readSync(1) === 1;
  const hasTextColor = reader.readSync(1) === 1;
  const hasMaxLength = reader.readSync(1) === 1;
  const hasFont = reader.readSync(1) === 1;
  const hasFontClass = reader.readSync(1) === 1;
  const autoSize = reader.readSync(1) === 1;
  const hasLayout = reader.readSync(1) === 1;
  const noSelect = reader.readSync(1) === 1;
  const border = reader.readSync(1) === 1;
  const wasStatic = reader.readSync(1) === 1;
  const html = reader.readSync(1) === 1;
  const useOutlines = reader.readSync(1) === 1;

  const fontId = hasFont ? reader.readU16() : undefined;
  const fontClass = hasFontClass
    ? parseNullTerminatedString(reader)
    : undefined;
  const fontHeight = hasFont || hasFontClass ? reader.readU16() : undefined;
  const textColor = hasTextColor
    ? {
        red: reader.readU8(),
        green: reader.readU8(),
        blue: reader.readU8(),
        alpha: reader.readU8(),
      }
    : undefined;
  const maxLength = hasMaxLength ? reader.readU16() : undefined;

  const align = hasLayout ? reader.readU8() : undefined;
  const leftMargin = hasLayout ? reader.readU16() : undefined;
  const rightMargin = hasLayout ? reader.readU16() : undefined;
  const indent = hasLayout ? reader.readU16() : undefined;
  const leadingRaw = hasLayout ? reader.readU16() : undefined;
  const leading =
    leadingRaw !== undefined
      ? leadingRaw >= 0x8000
        ? leadingRaw - 0x10000
        : leadingRaw
      : undefined;

  const variableName = parseNullTerminatedString(reader);
  const initialText = hasText ? parseNullTerminatedString(reader) : undefined;

  return {
    type: "DefineEditText",
    characterId,
    bounds,
    hasText,
    wordWrap,
    multiline,
    password,
    readOnly,
    hasTextColor,
    hasMaxLength,
    hasFont,
    hasFontClass,
    autoSize,
    hasLayout,
    noSelect,
    border,
    wasStatic,
    html,
    useOutlines,
    fontId,
    fontClass,
    fontHeight,
    textColor,
    maxLength,
    align,
    leftMargin,
    rightMargin,
    indent,
    leading,
    variableName,
    initialText,
  } satisfies Tag;
};
tagParsers[TagCode.DefineFontName] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const fontId = reader.readU16();
  const fontName = parseNullTerminatedString(reader);
  const fontCopyright = parseNullTerminatedString(reader);

  return {
    type: "DefineFontName",
    fontId,
    fontName,
    fontCopyright,
  } satisfies Tag;
};
const parseTextRecords = <C extends RGB | RGBA>(
  reader: Bitstream,
  glyphBits: number,
  advanceBits: number,
  parseColor: (reader: Bitstream) => C,
): TextRecord<C>[] => {
  const records: TextRecord<C>[] = [];

  while (true) {
    // Peek at the first byte — 0 means end of records
    const firstByte = reader.readU8();
    if (firstByte === 0) break;

    // TextRecordType is UB[1] = 1 (already consumed as part of firstByte)
    // StyleFlagsReserved UB[3] = 0
    // StyleFlagsHasFont UB[1]
    // StyleFlagsHasColor UB[1]
    // StyleFlagsHasYOffset UB[1]
    // StyleFlagsHasXOffset UB[1]
    const hasFont = (firstByte & 0x08) !== 0;
    const hasColor = (firstByte & 0x04) !== 0;
    const hasYOffset = (firstByte & 0x02) !== 0;
    const hasXOffset = (firstByte & 0x01) !== 0;

    const fontId = hasFont ? reader.readU16() : undefined;
    const textColor = hasColor ? parseColor(reader) : undefined;
    const xOffset = hasXOffset ? readS16(reader) : undefined;
    const yOffset = hasYOffset ? readS16(reader) : undefined;
    const textHeight = hasFont ? reader.readU16() : undefined;

    const glyphCount = reader.readU8();
    const glyphEntries: GlyphEntry[] = [];
    for (let i = 0; i < glyphCount; i++) {
      const glyphIndex = reader.readSync(glyphBits);
      const glyphAdvance = reader.readSigned(advanceBits);
      glyphEntries.push({ glyphIndex, glyphAdvance });
    }

    // Byte-align after glyph entries (they're bit-packed)
    const padding = (8 - (reader.index % 8)) % 8;
    if (padding > 0) reader.readSync(padding);

    records.push({
      fontId,
      textColor,
      xOffset,
      yOffset,
      textHeight,
      glyphEntries,
    });
  }

  return records;
};

const parseDefineText = (
  tagType: "DefineText" | "DefineText2",
  buffer: Uint8Array,
): Tag => {
  const reader = Bitstream.fromBuffer(buffer);

  const characterId = reader.readU16();
  const textBounds = parseRect(reader);
  const textMatrix = parseMatrixRecord(reader);
  const glyphBits = reader.readU8();
  const advanceBits = reader.readU8();

  if (tagType === "DefineText2") {
    const textRecords = parseTextRecords(
      reader,
      glyphBits,
      advanceBits,
      (r) =>
        ({
          red: r.readU8(),
          green: r.readU8(),
          blue: r.readU8(),
          alpha: r.readU8(),
        }) as RGBA,
    );

    return {
      type: "DefineText2",
      characterId,
      textBounds,
      textMatrix,
      glyphBits,
      advanceBits,
      textRecords,
    } satisfies Tag;
  }

  const textRecords = parseTextRecords(reader, glyphBits, advanceBits, (r) => ({
    red: r.readU8(),
    green: r.readU8(),
    blue: r.readU8(),
  }));

  return {
    type: "DefineText",
    characterId,
    textBounds,
    textMatrix,
    glyphBits,
    advanceBits,
    textRecords,
  } satisfies Tag;
};

tagParsers[TagCode.DefineText] = (buffer) =>
  parseDefineText("DefineText", buffer);
tagParsers[TagCode.DefineText2] = (buffer) =>
  parseDefineText("DefineText2", buffer);
tagParsers[TagCode.DefineSprite] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const spriteId = reader.readU16();
  const frameCount = reader.readU16();
  const controlTags = parseTags(buffer.slice(4));

  return {
    type: "DefineSprite",
    spriteId,
    frameCount,
    controlTags,
  } satisfies Tag;
};

tagParsers[TagCode.FrameLabel] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const name = parseNullTerminatedString(reader);
  const namedAnchor = reader.available >= 8 && reader.readU8() === 1;

  return {
    type: "FrameLabel",
    name,
    namedAnchor,
  } satisfies Tag;
};

tagParsers[TagCode.RemoveObject] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const characterId = reader.readU16();
  const depth = reader.readU16();
  return { type: "RemoveObject", characterId, depth } satisfies Tag;
};

tagParsers[TagCode.RemoveObject2] = (buffer) => {
  const reader = Bitstream.fromBuffer(buffer);
  const depth = reader.readU16();
  return { type: "RemoveObject2", depth } satisfies Tag;
};

tagParsers[TagCode.DoAction] = (buffer) => {
  return { type: "DoAction", actions: buffer } satisfies Tag;
};

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
