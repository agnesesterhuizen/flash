export class Bitstream {
  index = 0;
  buffer: string;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer.reduce(
      (prev, n) => prev + n.toString(2).padStart(8, "0"),
      ""
    );
  }

  static fromBuffer(buffer: Uint8Array) {
    return new Bitstream(buffer);
  }

  get available() {
    return this.buffer.length - this.index;
  }

  read(width: number): number {
    if (this.index + width > this.buffer.length) {
      throw new Error("end of buffer");
    }

    if (width === 5) {
      console.log("  " + this.buffer.substring(this.index));
    }

    // 011110000000000000000101010111110000000000000000000011111010000000000000
    // 01111000000000000000010101011111000000000000000000001111
    // 0000000000000000

    const s = this.buffer.substring(this.index, this.index + width);
    console.log("  str: ", s);
    this.index += width;

    return parseInt(s, 2);
  }

  readU8() {
    return this.read(8);
  }

  readU16() {
    const l = this.read(8);
    const h = this.read(8);
    return (h << 8) + l;
  }

  readu32() {
    const a = this.read(8);
    const b = this.read(8);
    const c = this.read(8);
    const d = this.read(8);
    return (a << 24) + (b << 16) + (c << 8) + d;
  }

  readSync(width: number): number {
    return this.read(width);
  }

  readSigned(width: number): number {
    const n = this.read(width);
    const buf = new Uint32Array([n]);
    return new DataView(buf.buffer).getUint32(0);
  }
}
