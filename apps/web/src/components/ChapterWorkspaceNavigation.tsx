"use client";
import type { MainPostGroup } from "@/lib/project-post-hierarchy";
import { ChevronRight } from "lucide-react";
import { chapterPostSection, type ChapterSource, type ChapterWorkspace, type ChapterSection, type WorkspaceChapter } from "@/lib/project-chapter-workspace";
import { productChoiceSnapshots } from "@/lib/product-choice-collection";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { formatProjectQuantity, projectRequirementQuantity } from "@/lib/project-requirement-quantity";
type Row = Record<string, unknown> & { id: string };

export function ChapterOverview({ workspace, onOpen, selected }: {
  workspace: ChapterWorkspace; selected: ReadonlySet<string>;
  onOpen: (chapter: WorkspaceChapter) => void;
}) {
  return <nav className="chapter-overview" aria-label="Kapitelöversikt">
    {workspace.chapters.map(chapter => {
      const ids = chapterPostSection(chapter).requirementIds;
      return <section key={chapter.id} className="chapter-overview-group">
        <h3><button type="button" id={`chapter-${encodeURIComponent(chapter.id)}`} className="chapter-overview-row" onClick={() => onOpen(chapter)}>
          <ChevronRight aria-hidden="true" />
          <span><strong>{chapter.number} {chapter.title}</strong><small>{chapter.kind === "review" ? chapter.sections.length + " textavsnitt" : ids.length ? ids.length + " poster" : "Kapitlets krav och information"}</small></span>
          <span className="chapter-count">{chapter.kind === "review" ? "Behöver kontroll" : ids.length ? ids.filter(id => selected.has(id)).length + " av " + ids.length + " valda" : "Kravtext"}</span>
        </button></h3>
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
export function ChapterRequirements({ workspace, chapter, section }: {
  workspace: ChapterWorkspace; chapter: WorkspaceChapter; section: ChapterSection;
}) {
  const sources = [...new Set([chapter.sourceId, section.sourceId, ...(section.textSourceIds ?? [])])]
    .filter((id): id is string => Boolean(id && workspace.sources[id]?.text.trim()));
  const content = sources.map(id => <SourceRequirements key={id} source={workspace.sources[id]} label={chapter.kind === "review" ? "PDF-text för kontroll" : "Krav och information"} />);
  return <div className="chapter-common-requirements">
    {section.requirementIds.length && sources.length ? <details><summary>Krav och information för kapitlet</summary>{content}</details> : content}
    {section.warning && <p role="status" className="chapter-warning">{section.warning}</p>}
  </div>;
}

export function SelectedProductSummary({ assignment }: { assignment?: Row }) {
  const products = productChoiceSnapshots(assignment?.product_snapshot);
  return products.length ? <span>{products.map((product, index) => <span className="chapter-selected-product" key={index}>
    {String(product.name ?? "Produkt")} · Art. {String(product.productNumber ?? "—")}
  </span>)}</span> : <span className="chapter-no-product">Ingen produkt vald</span>;
}
export function SectionPosts({ rows, groups, assignments, disabled, onSelect }: {
  groups?: MainPostGroup[];
  rows: Row[]; assignments: ReadonlyMap<string, Row>; disabled: boolean; onSelect: (id: string) => boolean;
}) {
  if (!rows.length) return null;
  return <nav className="chapter-other-posts" aria-label="Poster i kapitlet">
    <h3>Poster <span>({rows.length})</span></h3>
    {(groups ?? [{ id: "posts", sourceId: null, number: "", title: "", requirementIds: rows.map(row => row.id) }]).map(group => {
      const byId = new Map(rows.map(row => [row.id,row]));
      return <section key={group.id} className="mb-4 rounded-lg border border-slate-200">
        {!group.standalone && group.title && <h4 className="bg-slate-50 px-4 py-3 font-semibold">{group.number} {group.title}</h4>}
        {group.review && <p className="px-4 py-2 text-sm text-amber-800">Kontrollera huvudpostkopplingen</p>}
        <ol>{group.requirementIds.flatMap(id => { const row = byId.get(id); return row ? [<li key={row.id}><button type="button" id={`section-post-${row.id}`} disabled={disabled} onClick={() => onSelect(row.id)}>
          <span><strong>{projectRequirementDetails(row).postNumber ?? "Post utan nummer"}</strong> {String(row.value_text ?? row.display_name ?? "Produktpost")}</span>
          <small>{formatProjectQuantity(projectRequirementQuantity(row.value_json))}</small>
          <SelectedProductSummary assignment={assignments.get(row.id)} />
        </button></li>] : []; })}</ol>
      </section>;
    })}
  </nav>;
}
