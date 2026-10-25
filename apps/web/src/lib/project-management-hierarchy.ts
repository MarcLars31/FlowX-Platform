import type { ManagedPost, ManagementSnapshot, WorkAssignment } from "./project-management";
import { productPostMeasurement } from "./project-requirement-views";

export type HierarchyAssignment = Omit<WorkAssignment, "scope_type" | "assigned_to"> & {
  scope_type: "post" | "main_post" | "pdf_chapter" | "chapter" | "group"; assigned_to: string | null;
  assignment_mode?: "explicit" | "inherit" | "unassigned"; chapter_key?: string;
};
export type HierarchyPost = ManagedPost & {
  mainPost?: { id: string; number: string; title: string; standalone: boolean } | null;
  hierarchyReview?: boolean; assignmentMode?: "explicit" | "inherit" | "unassigned";
  sourcePage?: number; sourceOrder?: number; documentId?: string; measurement?: Record<string, unknown>; sourceChapter?: unknown;
};
export type HierarchySnapshot = Omit<ManagementSnapshot, "posts" | "assignments"> & { posts: HierarchyPost[]; assignments: HierarchyAssignment[] };
export type HierarchySelection = { type: "post" | "main_post" | "pdf_chapter"; ids: string[]; label: string };

export function actionableManagementSnapshot(data: HierarchySnapshot): HierarchySnapshot {
  return { ...data, posts: data.posts.filter(post => post.measurement === undefined || productPostMeasurement({ id: post.id, value_json: post.measurement }).visible) };
}
export type ManagementMainPost = { key: string; title: string; number: string; anchor: string; posts: HierarchyPost[]; standalone: boolean; review: boolean; assignment?: HierarchyAssignment };
export function managementMainPosts(posts: HierarchyPost[], assignments: HierarchyAssignment[]): ManagementMainPost[] {
  const groups = new Map<string, ManagementMainPost>();
  for (const post of posts) {
    const main = post.mainPost, key = main?.id ?? post.id;
    const group = groups.get(key) ?? { key, title: main?.title ?? post.title, number: main?.number ?? post.number ?? "", anchor: key,
      posts: [], standalone: main?.standalone ?? true, review: post.hierarchyReview ?? false,
      assignment: assignments.find(item => item.scope_type === 'main_post' && item.scope_value === key) };
    group.posts.push(post); groups.set(key,group);
  }
  return [...groups.values()];
}
export function managementChapters(data: HierarchySnapshot, mode: 'pdf' | 'main' = 'pdf') {
  const grouped = new Map<string, { key: string; title: string; posts: HierarchyPost[]; assignment?: HierarchyAssignment; anchor: string; scope: 'pdf_chapter' | 'main_post' | 'post'; review: boolean }>();
  for (const post of [...data.posts].sort((a,b) => (a.sourcePage ?? 0)-(b.sourcePage ?? 0) || (a.sourceOrder ?? 0)-(b.sourceOrder ?? 0))) {
    const useMain = mode === 'main' || !post.sourceChapter || post.hierarchyReview;
    const key = useMain ? `main:${post.mainPost?.id ?? post.id}` : post.chapterKey;
    const chapter = grouped.get(key) ?? { key, title: useMain ? `${post.mainPost?.number ?? post.number ?? ''} ${post.mainPost?.title ?? post.title}`.trim() : post.chapter,
      posts: [], anchor: useMain ? post.mainPost?.id ?? post.id : post.id,
      scope: useMain ? !post.mainPost || post.mainPost.standalone ? 'post' as const : 'main_post' as const : 'pdf_chapter' as const, review: post.hierarchyReview ?? false };
    chapter.posts.push(post);
    if (!useMain && post.id < chapter.anchor) chapter.anchor = post.id;
    grouped.set(key, chapter);
  }
  for (const chapter of grouped.values()) {
    const ids = new Set(chapter.posts.map(post => post.id));
    chapter.assignment = data.assignments.find(item => item.scope_type === chapter.scope && (chapter.scope === 'pdf_chapter' ? item.chapter_key === chapter.key || ids.has(item.scope_value) : item.scope_value === chapter.anchor));
    if (chapter.assignment) chapter.anchor = chapter.assignment.scope_value;
  }
  return [...grouped.values()];
}
