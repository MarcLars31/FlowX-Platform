import { buildChapterWorkspace, type ChapterWorkspace, type WorkspaceChapter, type ChapterSection } from "./project-chapter-workspace";
import { visibleProjectRequirements } from "./project-requirement-views";
import { projectRequirementOrderPostNumber, sortProjectRequirementsBySource } from "./project-requirement-order";
import { requirementSnapshot } from "./requirement-snapshot";
import { currentPostRequirement } from "./current-post-requirement";
import { ownRequirementBody } from "./own-requirement-text";
import { chapterAddress, chapterCaptionPath, chapterContains, chapterHeaderPages, joinedChapterNumber, type ChapterCaption, type ChapterPage } from "./pdf-chapter-navigation";
import { splitPostHeading, type HeadingLayout } from "@/modules/technical-description-extractor/post-heading";
type Row = Record<string, unknown> & { id: string };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const documentId = (row: Row) => String(row.source_document_id ?? row.source_technical_description_document_id ?? "legacy");
const key = (...parts: string[]) => JSON.stringify(parts);
const flags = (row: Row) => Array.isArray(record(row.value_json).reviewFlags) ? record(row.value_json).reviewFlags as unknown[] : [];

/** A read-only navigation projection. Saved post IDs, text, product choices and
 * matching inheritance stay unchanged. Each visible post enters exactly one
 * section; unresolved text remains accessible without becoming a chapter. */
export function buildDocumentChapterWorkspace(requirements: Row[], pages: readonly ChapterPage[] = []): ChapterWorkspace {
  const rows = sortProjectRequirementsBySource(requirements.filter(row => !["rejected", "superseded"].includes(String(row.status))).map(requirementSnapshot));
  const original = buildChapterWorkspace(rows);
  const headers = chapterHeaderPages(pages), products = new Set(visibleProjectRequirements(rows).map(row => row.id));
  const sources = { ...original.sources };
  const layouts = new Map(pages.map(page => [key(page.document_id,String(page.page_number)),page.heading_layout as HeadingLayout | undefined]));
  const uncertainHeadings = new Set<string>();
  for (const row of rows.filter(row => !products.has(row.id))) {
    const own = currentPostRequirement(row), value = record(own.value_json);
    sources[row.id] = { id:row.id, number:projectRequirementOrderPostNumber(row) ?? "", title:String(row.value_text ?? row.display_name ?? "Krav och information"),
      text:String(ownRequirementBody(value) ?? value.pdfDescriptionText ?? value.sourceText ?? own.source_excerpt ?? ""),
      pages:[...new Set([Number(row.source_page), ...(Array.isArray(value.sourcePages) ? value.sourcePages.map(Number) : [])])].filter(n => Number.isSafeInteger(n) && n > 0) };
    const prior = record(value.headingSplit), source = sources[row.id];
    const bodyInTitle = /\b(?:skal|skall|må|omfatter|omhandler|utføres|gjelder|Det er|Dette kapitlet)\b/i;
    if (typeof prior.originalText === "string" && source.title === prior.title && bodyInTitle.test(source.title)) {
      const split = splitPostHeading(prior.originalText,layouts.get(key(documentId(row),String(row.source_page))));
      if (split.status === "separated" && !bodyInTitle.test(split.title)) {
        source.title=split.title; source.text=split.requirementText;
      } else {
        source.title="Post " + source.number; source.text=prior.originalText; uncertainHeadings.add(row.id);
      }
    }
  }
  type Group = { chapter: WorkspaceChapter; paths: ChapterCaption[][]; rows: Row[] };
  const groups = new Map<string, Group>(), rowPath = new Map<string, ChapterCaption[]>();
  const ensure = (doc: string, path: ChapterCaption[], fallback = false) => {
    const root = path[0], id = key(doc, root.number, root.title);
    let group = groups.get(id);
    if (!group) { group = { chapter:{ id, sourceId:null, number:root.number, title:root.title, sections:[], ...(fallback ? {kind:"main-post" as const} : {}) }, paths:[], rows:[] }; groups.set(id,group); }
    if (path.length > 1 && !group.paths.some(p => key(...p.map(c => c.number + " " + c.title)) === key(...path.map(c => c.number + " " + c.title)))) group.paths.push(path);
    return id;
  };
  for (const [doc, documentHeaders] of headers) for (const header of documentHeaders) ensure(doc,header.path);
  // Legacy imports may predate stored geometry. A structured source chapter is
  // usable only when it is a single caption line, not an entire prose block.
  const legacyPaths = new Map<string, ChapterCaption[]>(), legacyDocuments = new Set<string>();
  for (const row of rows) {
    const doc = documentId(row);
    if (headers.get(doc)?.length) continue;
    const title = record(record(row.value_json).sourceChapter).title;
    if (typeof title !== "string" || /[\r\n]|[.!?]\s+[A-ZÆØÅ]/u.test(title)) continue;
    const path = chapterCaptionPath(title);
    if (path.length) { legacyPaths.set(row.id,path); legacyDocuments.add(doc); ensure(doc,path); }
  }
  for (const row of rows) {
    const doc = documentId(row), number = projectRequirementOrderPostNumber(row) ?? "", documentHeaders = headers.get(doc) ?? [];
    const onPage = documentHeaders.find(header => header.page === Number(row.source_page));
    let path = onPage?.path ?? legacyPaths.get(row.id);
    if (!path) {
      // Continuations may omit the header. Carry context only while its address
      // contains this post; an unrelated prose/layout page cannot inherit it.
      const preceding = documentHeaders.filter(header => header.page < Number(row.source_page)).at(-1);
      if (preceding && (chapterContains(joinedChapterNumber(preceding.path),number) || chapterContains(preceding.path[0].number,number))) path = preceding.path;
    }
    let id = path ? ensure(doc,path) : undefined;
    if (!id && number) {
      const candidates = [...groups.entries()].filter(([groupId,g]) => groupId.startsWith(key(doc).slice(0,-1) + ",") && chapterContains(g.chapter.number,number));
      if (candidates.length === 1) id = candidates[0][0];
    }
    if (!id && !documentHeaders.length && !legacyDocuments.has(doc) && number) {
      const main = number.replace(/^D\d+\./i, "").split(".")[0];
      const heading = rows.find(candidate => documentId(candidate) === doc && !products.has(candidate.id)
        && chapterAddress(projectRequirementOrderPostNumber(candidate) ?? "") === chapterAddress(main)
        && !flags(candidate).some(flag => ["unassigned-source-text","unverified-post-source"].includes(String(flag))));
      id = ensure(doc,[{number:main,title:heading ? String(heading.value_text ?? heading.display_name) : "Huvudpost " + main}],!heading);
    }
    if (id) { groups.get(id)!.rows.push(row); if (path) rowPath.set(row.id,path); }
  }
  const assigned = new Set<string>(), assignedText = new Set<string>();
  for (const [groupId,group] of groups) {
    const {chapter} = group, sections = new Map<string,ChapterSection>();
    const headerVerified = (row: Row) => {
      const number = projectRequirementOrderPostNumber(row) ?? "";
      return [chapter.number,...group.paths.map(joinedChapterNumber)].some(n => chapterAddress(n) === chapterAddress(number));
    };
    const headings = group.rows.filter(row => !products.has(row.id) && projectRequirementOrderPostNumber(row)
      && (!flags(row).some(flag => ["unassigned-source-text","unverified-post-source"].includes(String(flag))) || headerVerified(row)));
    const main = headings.find(row => chapterAddress(projectRequirementOrderPostNumber(row)!) === chapterAddress(chapter.number));
    if (main) { chapter.sourceId=main.id; assignedText.add(main.id); }
    const known = group.paths.map(path => ({number:joinedChapterNumber(path), title:path.slice(1).map(c => c.title).join(" › ")}));
    const nestedHeadings = headings.filter(row => chapterContains(chapter.number,projectRequirementOrderPostNumber(row)!)
      && chapterAddress(projectRequirementOrderPostNumber(row)!) !== chapterAddress(chapter.number));
    const wrappers = new Set(nestedHeadings.filter(row => {
      const number = projectRequirementOrderPostNumber(row)!;
      const descendants = nestedHeadings.filter(other => other.id !== row.id && chapterContains(number,projectRequirementOrderPostNumber(other)!));
      return descendants.length > 1 && nestedHeadings.every(other => chapterContains(number,projectRequirementOrderPostNumber(other)!)
        || chapterContains(projectRequirementOrderPostNumber(other)!,number));
    }).map(row => row.id));
    // Only the shallowest real heading below the chapter becomes a navigation
    // section. Deeper specification headings stay as text in that section.
    for (const heading of headings) {
      const number = projectRequirementOrderPostNumber(heading)!;
      if (wrappers.has(heading.id) || record(heading.value_json).nsCode) continue;
      if (chapterAddress(number) === chapterAddress(chapter.number) || !chapterContains(chapter.number,number)) continue;
      if (known.some(c => chapterContains(c.number,number))) continue;
      if (headings.some(other => !wrappers.has(other.id) && other.id !== heading.id && projectRequirementOrderPostNumber(other) !== number
        && chapterAddress(projectRequirementOrderPostNumber(other)!) !== chapterAddress(chapter.number)
        && chapterContains(chapter.number,projectRequirementOrderPostNumber(other)!) && chapterContains(projectRequirementOrderPostNumber(other)!,number))) continue;
      known.push({number,title:sources[heading.id].title});
    }
    const sectionFor = (caption?: ChapterCaption) => {
      const id = key(groupId,caption?.number ?? "direct",caption?.title ?? "");
      let section = sections.get(id);
      if (!section) {
        const source = caption && headings.find(row => chapterAddress(projectRequirementOrderPostNumber(row)!) === chapterAddress(caption.number));
        section = {id,sourceId:source?.id ?? null,number:caption?.number ?? chapter.number,title:caption?.title ?? "Poster och information direkt under kapitlet",requirementIds:[],textSourceIds:[],
          ...(source && uncertainHeadings.has(source.id) ? {warning:"Rubrikgränsen är osäker. Hela originaltexten finns under krav och information."} : {})};
        sections.set(id,section);
      }
      return section;
    };
    for (const row of group.rows) {
      if (assignedText.has(row.id)) continue;
      const number = projectRequirementOrderPostNumber(row) ?? "", path = rowPath.get(row.id);
      // Page-header path takes precedence over inferred post nesting. For
      // root-only headers use the deepest evidenced containing subchapter.
      const caption = path && path.length > 1 ? {number:joinedChapterNumber(path),title:path.slice(1).map(c => c.title).join(" › ")}
        : known.filter(c => chapterContains(c.number,number)).sort((a,b) => b.number.split(".").length-a.number.split(".").length)[0];
      if (!products.has(row.id) && !headerVerified(row) && flags(row).some(flag => ["unassigned-source-text","unverified-post-source"].includes(String(flag)))) continue;
      const section = sectionFor(caption);
      if (products.has(row.id)) { section.requirementIds.push(row.id); assigned.add(row.id); }
      else { section.textSourceIds!.push(row.id); assignedText.add(row.id); }
    }
    if (!sections.size && chapter.sourceId) sectionFor();
    chapter.sections=[...sections.values()];
  }
  const positions = new Map(rows.map((row,index) => [row.id,index]));
  const chapters = [...groups.values()].filter(group => group.chapter.sections.length)
    .sort((a,b) => (positions.get(a.rows[0]?.id) ?? Infinity) - (positions.get(b.rows[0]?.id) ?? Infinity)).map(group => group.chapter);
  const missing = rows.filter(row => products.has(row.id) && !assigned.has(row.id));
  if (missing.length) chapters.push({id:"unlinked",sourceId:null,number:"",title:"Poster att kontrollera",kind:"review",sections:[{
    id:"unlinked:posts",sourceId:null,number:"",title:"Poster utan säker kapitelkoppling",requirementIds:missing.map(row => row.id),warning:"Kapitelkopplingen är osäker. Originalposterna är bevarade."}]});
  const review = rows.filter(row => !products.has(row.id) && !assignedText.has(row.id));
  if (review.length) chapters.push({id:"source-review",sourceId:null,number:"",title:"PDF-text att kontrollera",kind:"review",sections:review.map(row => ({
    id:row.id,sourceId:row.id,number:"",title:"PDF-sida " + sources[row.id].pages.join(", "),requirementIds:[],warning:"Originaltexten har bevarats för kontroll och används inte som kapitelrubrik."}))});
  return { chapters,sources,ancestors:original.ancestors };
}
