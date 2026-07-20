import { getAllTools } from "@/core/ai/tool-registry";
import { renderMemoryContext } from "@/core/memory";
import { z } from "zod";

const tools = getAllTools();
let toolChars = 0;
for (const t of tools) {
  toolChars += t.name.length + t.description.length +
    JSON.stringify(z.toJSONSchema(t.input)).length;
}
const mem = await renderMemoryContext();
const estTok = (c: number) => Math.round(c / 3.6);
console.log(JSON.stringify({
  toolCount: tools.length,
  toolChars, toolTokensEst: estTok(toolChars),
  memChars: mem.length, memTokensEst: estTok(mem.length),
  perChatCallOverheadEst: estTok(toolChars + mem.length),
}, null, 2));
process.exit(0);
