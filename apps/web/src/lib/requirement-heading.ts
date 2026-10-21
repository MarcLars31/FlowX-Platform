import { ownPostHeadingSource, splitPostHeading } from "@/modules/technical-description-extractor/post-heading";
const object=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==="string"?value:"";
const normalized=(value:unknown)=>text(value).replace(/\s+/g," ").trim();

/** Repair a proven derived title in the data snapshot shared by navigation,
 * detail, search and exports. No CSS truncation and no PDF/network work on reads.
 * Unrelated user wording and all source/review/product fields remain intact. */
export function separateSavedRequirementHeading<T extends Record<string,unknown>>(row:T):T {
  const value=object(row.value_json);
  if(object(value.headingSplit).version===1) return row;
  const source=text(value.pdfDescriptionText)||text(value.sourceText)||text(row.source_excerpt);
  if(!source || !value.postNumber) return row;
  const own=ownPostHeadingSource(source,text(value.postNumber),text(value.nsCode));
  const split=splitPostHeading(own);
  const previousBody = text(value.description);
  if (previousBody && ![row.value_text, row.display_name, split.requirementText, own].some(candidate => normalized(candidate) === normalized(previousBody))) return row;
  const title=normalized(split.title), original=normalized(own);
  const matches=(candidate:unknown)=>Boolean(title && normalized(candidate).startsWith(title+" ") && original.includes(normalized(candidate)));
  const affected=["value_text","display_name"].filter(key=>matches(row[key]));
  if (split.status === "review" && [row.value_text, row.display_name].some(candidate => normalized(candidate) === original) && own.includes("\n")) {
    const flags = Array.isArray(value.reviewFlags) ? value.reviewFlags : [];
    return {...row,value_json:{...value,description:own,headingSplit:split,reviewFlags:[...new Set([...flags,"unverified-heading-boundary"])]}};
  }
  if(split.status!=="separated" || !split.requirementText || !affected.length) return row;
  return {...row,...Object.fromEntries(affected.map(key=>[key,split.title])),value_json:{...value,
    title:split.title,description:split.requirementText,headingSplit:split,legacyHeading:row.value_text}};
}

