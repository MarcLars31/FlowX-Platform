/** A numbered description heading is not a wrapped suffix of the left-column post. */
export function numberedPostHeading(post: string, nextLine: string) {
  const heading = /^(\d+(?:\.\d+)+)\.\s+([A-ZÆØÅ].*)$/.exec(nextLine.trim());
  if (!/^\d+(?:\.\d+)+$/.test(post) || !heading
    || heading[1].split(".")[0] === post.split(".")[0]
    || /^[A-ZÆØÅ]{1,5}[A-ZÆØÅ0-9]*\.[A-ZÆØÅ0-9.]+\b/.test(heading[2])) return null;
  return { postNumber: post, description: nextLine.trim(), legacyPostNumber: `${post}${heading[1]}` };
}
