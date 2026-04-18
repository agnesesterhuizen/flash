import { parseHeader, parseTags } from "./parser.ts";
import { Movie } from "npm:swf-types";
import { parseSwf } from "npm:swf-parser";

const arrayBuffer = await Deno.readFile("prm.swf");

const movie: Movie = parseSwf(arrayBuffer);
console.log(movie);

// const buffer = new Uint8Array(arrayBuffer);

// const header = parseHeader(buffer);
// console.log(header);

// const tags = parseTags(buffer.slice(21, -1));
