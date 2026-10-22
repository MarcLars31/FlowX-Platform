/** Heading/body separation never changes a post's identity or hierarchy. */
export const POST_HEADING_VERSION = 1;
export type HeadingLine = { text: string; x: number; y: number; height: number; width: number; font?: string };
export type HeadingLayout = { version: typeof POST_HEADING_VERSION; lines: HeadingLine[] };
export type HeadingSplit = {
  version: typeof POST_HEADING_VERSION;
  title: string;
  requirementText: string;
  originalText: string;
  status: "separated" | "heading-only" | "review";
  evidence: string[];
};
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
const upper = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);
const field = (text: string) => /^[\p{L}][^:]{1,59}:\s*\S|^Andre krav\b|^[a-z]\)\s/iu.test(text)
  || /^(?:Antall(?: prøver| ledningsstrekk)?|Lengde|Areal|Volum|Rund sum)(?:\s|$)/u.test(text)
  || /^(?:RS|(?:stk|st|m|m2|m²|m3|m³|kg)\s+\d)(?:\s|[\d.,]|$)/u.test(text);
// A finite requirement clause provides independent evidence of body text.
// "Prisen inkluderer ..." is ordinary requirement text, never a price cell.
const prose = (text: string) => /\b(?:utføres|utføras|utförs|inkluderer|omfatter|leveres|monteres|kontrolleres|dokumenteres|ivaretas|påhviler|gjelder|består|inneholder|skal|må|skall)\b/iu.test(text);
const median = (values: number[]) => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)] ?? 0;

/** Match a whole physical line, never a guessed fixed number of characters.
 * The preceding post/code is allowed in that same physical row. */
function physical(text: string, layout?: HeadingLayout): HeadingLine | undefined {
  const key = normalized(text);
  const candidates = layout?.lines.filter(line => {
    const value = normalized(line.text);
    return value === key || value.endsWith(` ${key}`);
  });
  return candidates?.length === 1 ? candidates[0] : undefined;
}

function sourceLines(text: string, layout?: HeadingLayout): string[] {
  return text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).flatMap(line => {
    // PDF producers can put a complete paragraph into a single text block.
    // Restore physical lines only when they account for the entire block.
    const key=normalized(line), candidates=layout?.lines.filter(row=>key.includes(normalized(row.text)));
    if (candidates && candidates.length>1 && normalized(candidates.map(row=>row.text).join(" "))===key)
      return candidates.map(row=>row.text);
    const transition=line.match(/^([\p{Lu}\d][\p{Lu}\d\s/–—(),.\-]*\p{Lu})\s+(\p{Lu}\p{Ll}.*)$/u);
    if (transition && prose(transition[2])) return [transition[1],transition[2]];
    return [line];
  });
}

export function splitPostHeading(text: string, layout?: HeadingLayout): HeadingSplit {
  const originalText=text.trim(), lines=sourceLines(originalText,layout);
  const result = (count: number, status: HeadingSplit["status"], evidence: string[]): HeadingSplit => ({
    version: POST_HEADING_VERSION, title: normalized(lines.slice(0,count).join(" ")),
    requirementText: status === "review" ? originalText : lines.slice(count).join("\n"),
    originalText, status, evidence
  });
  if (!lines.length) return result(0,"review",["empty-heading"]);
  if (/^Dimensjon:\s*\S/i.test(lines[0])) return result(1,lines.length>1?"separated":"heading-only",["dimension-subpost"]);
  if (field(lines[0])) return result(0,"review",["heading-not-found"]);
  const geometry=lines.map(line=>physical(line,layout)), first=geometry[0];
  const pitches=geometry.slice(1).flatMap((line,index)=>line && geometry[index] && line.y>geometry[index]!.y
    ? [line.y-geometry[index]!.y] : []);
  const pitch=median(pitches);
  for(let index=1;index<lines.length;index++) {
    if (field(lines[index])) return result(index,"separated",["requirement-field"]);
    if (/^\d+(?:\.\d+)*\.?\s+\p{Lu}/u.test(lines[index]))
      return result(index,"separated",["numbered-body-section"]);
    const current=geometry[index], previous=geometry[index-1];
    const fontChange=Boolean(first?.font && current?.font && first.font!==current.font
      && geometry.slice(0,index).every(line=>line?.font===first.font));
    const smaller=Boolean(first && current && first.height>current.height*1.12
      && geometry.slice(0,index).every(line=>line && Math.abs(line.height-first.height)<first.height*.1));
    const gap=Boolean(current && previous && current.y-previous.y>Math.min(pitch*1.45 || Infinity,previous.height*1.8));
    const aligned=Boolean(current && first && Math.abs(current.x-first.x)<Math.max(first.height,current.height));
    const sentence=prose(lines[index]) || /[.!?]$/.test(lines[index]);
    const caseTransition=lines.slice(0,index).every(upper) && /\p{Ll}/u.test(lines[index]);
    if ((fontChange || smaller) && (sentence || (aligned && !upper(lines[index]))))
      return result(index,"separated",[fontChange?"font-transition":"size-transition","body-layout"]);
    if (gap && aligned && (sentence || caseTransition)) return result(index,"separated",["paragraph-gap","body-transition"]);
    // A clause below a requirement field cannot prove that the preceding
    // mixed-case heading continuation was already body text.
    const nextField=lines.findIndex((line,next)=>next>=index && field(line));
    const followingClause=lines.slice(index,nextField<0?undefined:nextField).some(prose);
    if (caseTransition && followingClause) return result(index,"separated",["numbered-block","case-transition","body-clause"]);
  }
  // An unresolved boundary must not silently throw any part of the source away.
  const firstMixed=lines.findIndex(line=>!upper(line));
  if(firstMixed>0) return result(firstMixed,"review",["case-transition-without-layout-evidence"]);
  if (lines.some(prose) || (lines.length>1 && lines.some(line=>/[.!?]$/.test(line))))
    return result(lines.length,"review",["heading-boundary-unverified"]);
  return result(lines.length,"heading-only",[lines.length>1?"continuous-heading-lines":"single-heading"]);
}

/** Strip only the explicit own post/code, never references inside prose. */
export function ownPostHeadingSource(source: string, postNumber?: string, nsCode?: string) {
  const lines=source.trim().split(/\r?\n/);
  if(postNumber && (lines[0]?.trim()===postNumber || lines[0]?.trim().startsWith(`${postNumber} `))) {
    lines[0]=lines[0].trim().slice(postNumber.length).trim();
  } else if(postNumber) {
    let joined="";
    for(let index=0;index<lines.length;index++) {
      const match=lines[index].trim().match(/^([\d.A-Z]+)(?:\s+(.*))?$/);
      if(!match || !postNumber.startsWith(joined+match[1])) break;
      joined+=match[1];
      if(joined===postNumber) { lines.splice(0,index+1,match[2]??"");break; }
    }
  }
  while(lines.length && !lines[0].trim()) lines.shift();
  if(nsCode && (lines[0]?.trim()===nsCode || lines[0]?.trim().startsWith(`${nsCode} `))) {
    lines[0]=lines[0].trim().slice(nsCode.length).trim();
  }
  return lines.filter(line=>line.trim()).join("\n");
}
