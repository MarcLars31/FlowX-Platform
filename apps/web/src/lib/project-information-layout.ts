import { projectInformationParagraphs } from "./project-requirement-details";

export type InformationTable = {
  kind: "table";
  caption: string;
  columns: string[];
  rows: Array<{ cells: string[]; heading?: boolean }>;
  continued: boolean;
};
export type InformationBlock = ReturnType<typeof projectInformationParagraphs>[number] | InformationTable;

type TableHeader = { columns: string[]; roomNumbers: boolean; values: number };

function tableHeader(line: string): TableHeader | null {
  const rooms = /^(Romnavn)\s+(Romnummer)\s+(LAeq\s+LAF,max|LAF,max)$/i.exec(line);
  if (rooms) return { columns: [rooms[1], rooms[2], ...rooms[3].split(/\s+/)], roomNumbers: true, values: rooms[3].split(/\s+/).length };
  const sound = /^(Lydkilde\s*\([^)]*\))\s+(L\s*wA)$/i.exec(line);
  return sound ? { columns: [sound[1], sound[2].replace(/\s+/g, "")], roomNumbers: false, values: 1 } : null;
}

function tableRow(line: string, header: TableHeader) {
  const numbers: string[] = [];
  let label = line;
  for (let i = 0; i < header.values; i++) {
    const tail = /\s+([−-]?\d+(?:[.,]\d+)?)$/.exec(label);
    if (!tail) return null;
    numbers.unshift(tail[1]);
    label = label.slice(0, tail.index).trim();
  }
  if (!label) return null;
  if (!header.roomNumbers) return { cells: [label, ...numbers] };
  const room = /\s+([A-ZÆØÅ][A-ZÆØÅ0-9]*\.\d+|flere)$/i.exec(label);
  return { cells: [room ? label.slice(0, room.index) : label, room?.[1] ?? "", ...numbers] };
}

/** Rebuild supported tables only from explicit headers and row boundaries in
 * the saved source. Never use flattened attributes or guess missing values. */
export function projectInformationBlocks(source: string): InformationBlock[] {
  const lines = source.split(/\r?\n/).map(line => line.trim());
  const blocks: InformationBlock[] = [];
  let prose: string[] = [];
  let active: { block: InformationTable; header: TableHeader } | null = null;
  const flush = () => { blocks.push(...projectInformationParagraphs(prose.join("\n"))); prose = []; };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const page = /^FORTSETTELSE SIDE (\d+)$/.exec(line);
    const caption = /^Tabell\s+\d+\s+\S/i.test(line) ? line : "";
    const header = tableHeader(caption ? lines[index + 1] ?? "" : line);
    if (header) {
      flush();
      const block: InformationTable = { kind: "table", caption, columns: header.columns, rows: [], continued: false };
      blocks.push(block);
      active = { block, header };
      if (caption) index++;
      continue;
    }
    if (active) {
      if (page) {
        blocks.push({ kind: "page", text: `Side ${page[1]}` });
        const block: InformationTable = { ...active.block, caption: "", rows: [], continued: true };
        blocks.push(block);
        active.block = block;
        continue;
      }
      if (!line) continue;
      const row = tableRow(line, active.header);
      if (row) { active.block.rows.push(row); continue; }
      // The source has empty cells on wrapped names/notes and section rows.
      // Keep those rows as written instead of moving text into another cell.
      if (/^(?:Utendørs|Innendørs)$/i.test(line) || (line.length < 70 && /^(?:[a-zæøå(])/.test(line))) {
        active.block.rows.push({ cells: [line, ...active.block.columns.slice(1).map(() => "")],
          ...(/^(?:Utendørs|Innendørs)$/i.test(line) ? { heading: true } : {}) });
        continue;
      }
      active = null;
    }
    prose.push(line);
  }
  flush();
  return blocks.filter(block => block.kind !== "table" || block.rows.length > 0);
}
