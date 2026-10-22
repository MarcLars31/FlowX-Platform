"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChapterSource, ChapterWorkspace, ChapterSection, WorkspaceChapter } from "@/lib/project-chapter-workspace";
import { productChoiceSnapshots } from "@/lib/product-choice-collection";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { formatProjectQuantity, projectRequirementQuantity } from "@/lib/project-requirement-quantity";
type Row = Record<string, unknown> & { id: string };

export function ChapterOverview({ workspace, expanded, onToggle, onOpen, selected }: {
  workspace: ChapterWorkspace; expanded: string | null; selected: ReadonlySet<string>;
  onToggle: (id: string) => void; onOpen: (chapter: WorkspaceChapter, section: ChapterSection) => void;
}) {
  return <nav className="chapter-overview" aria-label="Kapitelöversikt">
    {workspace.chapters.map((chapter, index) => {
      const ids = chapter.sections.flatMap(section => section.requirementIds), open = expanded === chapter.id;
      const direct = chapter.sections.length === 1;
      const subsectionCount = chapter.sections.filter(section => section.sourceId !== null).length;
      return <section key={chapter.id} className="chapter-overview-group">
        <h3><button type="button" id={direct ? `chapter-section-${encodeURIComponent(chapter.sections[0].id)}` : undefined} className="chapter-overview-row" aria-expanded={direct ? undefined : open} aria-controls={direct ? undefined : `chapter-sections-${index}`} onClick={() => direct ? onOpen(chapter, chapter.sections[0]) : onToggle(chapter.id)}>
          {!direct && open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          <span><strong>{chapter.number} {chapter.title}</strong><small>{chapter.kind === "review" ? chapter.sections.length + " textavsnitt" : ids.length ? (subsectionCount ? subsectionCount + " underkapitel · " : "") + ids.length + " poster" : "Kapitlets krav och information"}</small></span>
          <span className="chapter-count">{chapter.kind === "review" ? "Behöver kontroll" : ids.length ? ids.filter(id => selected.has(id)).length + " av " + ids.length + " valda" : "Kravtext"}</span>
        </button></h3>
        <ol id={`chapter-sections-${index}`} hidden={direct || !open}>
          {chapter.sections.map(section => <li key={section.id}><button type="button" id={direct ? undefined : `chapter-section-${encodeURIComponent(section.id)}`} className="chapter-section-row" onClick={() => onOpen(chapter, section)}>
            <span><strong>{section.number} {section.title}</strong><small>{section.requirementIds.length ? section.requirementIds.length + " poster" : chapter.kind === "review" ? "Bevarad originaltext" : "Krav och information"}{section.warning ? " · Behöver kontroll" : ""}</small></span>
            <span className="chapter-count">{chapter.kind === "review" ? "Behöver kontroll" : section.requirementIds.length ? section.requirementIds.filter(id => selected.has(id)).length + " av " + section.requirementIds.length + " valda" : "Kravtext"}</span><ChevronRight aria-hidden="true" />
          </button></li>)}
        </ol>
      </section>;
    })}
  </nav>;
}

export function ChapterSectionProgress({chapter,section,selected}: {chapter:WorkspaceChapter;section:ChapterSection;selected:ReadonlySet<string>}) {
  const ids=section.requirementIds;
  return <p>{chapter.kind === "review" ? "PDF-text som behöver kontrolleras" : ids.length
    ? ids.length + " poster · " + ids.filter(id=>selected.has(id)).length + " av " + ids.length + " valda"
    : "Kravtext · inga egna produktval"}</p>;
}

function SourceRequirements({ source, label }: { source?: ChapterSource; label: string }) {
  const text = source?.text.trim() || "Ingen separat kravtext finns sparad för denna nivå.";
  const split = text.length > 1400 ? Math.max(text.lastIndexOf("\n", 1000), 800) : text.length;
  return <section className="chapter-source-requirements" aria-label={label}>
    <p className="chapter-source-label">{label}</p>
    {source && <h3>{source.number} {source.title}</h3>}
    {source?.pages.length ? <p className="chapter-source-pages">PDF-sida {source.pages.join(", ")}</p> : null}
    <p className="chapter-original-text">{text.slice(0, split)}</p>
    {split < text.length && <details className="chapter-full-source"><summary>Visa hela kravtexten · {text.length - split} tecken dolda</summary><p className="chapter-original-text">{text.slice(split)}</p></details>}
  </section>;
}
export function ChapterRequirements({ workspace, chapter, section, activeId }: {
  workspace: ChapterWorkspace; chapter: WorkspaceChapter; section: ChapterSection; activeId?: string | null;
}) {
  if (chapter.kind === "review") return <div className="chapter-common-requirements">
    <SourceRequirements source={workspace.sources[section.sourceId ?? ""]} label="PDF-text för kontroll" />
    {section.warning && <p role="status" className="chapter-warning">{section.warning}</p>}
  </div>;
  const commonSources = [
    { id: chapter.sourceId, label: "Huvudkapitlets krav" },
    { id: section.sourceId, label: "Underkapitlets krav" }
  ].filter((item, index, items) => item.id && item.id !== activeId && workspace.sources[item.id]
    && items.findIndex(other => other.id === item.id) === index);
  const common = new Set(commonSources.map(item => item.id));
  const contextId = activeId ?? section.sourceId;
  const extra = (contextId ? workspace.ancestors[contextId] ?? [] : []).filter(id => !common.has(id) && id !== activeId && workspace.sources[id]);
  return <div className="chapter-common-requirements">
    {commonSources.length > 0 && <div className="chapter-common-grid">
      {commonSources.map(item => <SourceRequirements key={item.id} source={workspace.sources[item.id!]} label={item.label} />)}
    </div>}
    {extra.length > 0 && <div className="chapter-ancestor-requirements" aria-label="Övriga överordnade krav">
      {extra.map(id => <SourceRequirements key={id} source={workspace.sources[id]} label="Överordnad posts krav" />)}
    </div>}
    {section.warning && <p role="status" className="chapter-warning">{section.warning}</p>}
  </div>;
}

export function SelectedProductSummary({ assignment }: { assignment?: Row }) {
  const products = productChoiceSnapshots(assignment?.product_snapshot);
  return products.length ? <span>{products.map((product, index) => <span className="chapter-selected-product" key={index}>
    {String(product.name ?? "Produkt")} · Art. {String(product.productNumber ?? "—")}
  </span>)}</span> : <span className="chapter-no-product">Ingen produkt vald</span>;
}
export function OtherSectionPosts({ rows, activeId, assignments, disabled, onSelect }: {
  rows: Row[]; activeId: string; assignments: ReadonlyMap<string, Row>; disabled: boolean; onSelect: (id: string) => boolean;
}) {
  const others = rows.filter(row => row.id !== activeId);
  return <nav className="chapter-other-posts" aria-label="Övriga poster i underkapitlet">
    <h3>Övriga poster i underkapitlet <span>({others.length})</span></h3>
    {!others.length && <p>Detta är underkapitlets enda produktpost.</p>}
    <ol>{others.map(row => <li key={row.id}><button type="button" disabled={disabled} onClick={() => onSelect(row.id)}>
      <span><strong>{projectRequirementDetails(row).postNumber ?? "Post utan nummer"}</strong> {String(row.value_text ?? row.display_name ?? "Produktpost")}</span>
      <small>{formatProjectQuantity(projectRequirementQuantity(row.value_json))}</small>
      <SelectedProductSummary assignment={assignments.get(row.id)} />
    </button></li>)}</ol>
  </nav>;
}
