import { parseHeader, parseTags } from "./parser.ts";

(
  globalThis as typeof globalThis & { __SWF_PARSER_DEBUG__?: boolean }
).__SWF_PARSER_DEBUG__ = false;

const arrayBuffer = await Deno.readFile("prm.swf");
const buffer = new Uint8Array(arrayBuffer);

const header = parseHeader(buffer);

const tags = parseTags(buffer.slice(21));

const parsed = {
  header,
  tags,
};

console.log(JSON.stringify(parsed, null, 2));
