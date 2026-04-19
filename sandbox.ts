import { Decompiler } from "./avm/decompiler.ts";
import { parseHeader, parseTags } from "./swf/parser.ts";

(
  globalThis as typeof globalThis & { __SWF_PARSER_DEBUG__?: boolean }
).__SWF_PARSER_DEBUG__ = false;

const bcjson = Deno.readTextFileSync("./abddata.json");
const bc = Object.values(JSON.parse(bcjson)) as number[];

// const arrayBuffer = await Deno.readFile("prm.swf");
// const buffer = new Uint8Array(arrayBuffer);

// const header = parseHeader(buffer);

// const tags = parseTags(buffer.slice(21));

// const parsed = {
//   header,
//   tags,
// };

// console.log(JSON.stringify(parsed, null, 2));

const decompiler = new Decompiler();
const abc = decompiler.run(bc);
console.log(JSON.stringify(abc, null, 2));
