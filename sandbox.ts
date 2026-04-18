import { parseHeader, parseTags } from "./parser.ts";

(
  globalThis as typeof globalThis & { __SWF_PARSER_DEBUG__?: boolean }
).__SWF_PARSER_DEBUG__ = true;

const arrayBuffer = await Deno.readFile("prm.swf");
const buffer = new Uint8Array(arrayBuffer);

const header = parseHeader(buffer);
console.log(header);

const tags = parseTags(buffer.slice(21, -1));
console.log(tags);
