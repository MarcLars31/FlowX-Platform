export type SupplierArticleKind = 'ahlsell' | 'nrf' | 'el' | 'supplier';
export function supplierArticleIdentity(value: unknown, kind: SupplierArticleKind = 'ahlsell') {
  if (typeof value !== 'string') return null;
  const number=value.trim().toUpperCase();
  // Prefixes and suffixes are significant. N99274384 and 99274384 are not
  // interchangeable; a supplier name such as CORINOR is not an article number.
  if (kind==='nrf' && !/^\d{7}$/.test(number)) return null;
  if (kind==='el' && !/^\d{6,8}$/.test(number)) return null;
  if (kind==='ahlsell' && !/^(?:N)?\d{6,8}(?:N5)?$/.test(number)) return null;
  if (kind==='supplier' && (!/^[A-Z0-9][A-Z0-9._/-]{1,79}$/.test(number) || !/\d/.test(number))) return null;
  return {number,kind,key:`${kind}:${number}`};
}

/** Only reject contradictory values actually stated in both documents. Missing
 * electrical data remains unverified; it never becomes a positive match. */
export function electricalOfferCompatible(requirement: string, product: string) {
  const norm=(s:string)=>s.toUpperCase().replace(/,/g,'.'); const a=norm(requirement),b=norm(product);
  const ip=(s:string)=>s.match(/\bIP\s*(\d)(\d)\b/);
  const wanted=ip(a),actual=ip(b);
  if(wanted&&actual&&(Number(actual[1])<Number(wanted[1])||Number(actual[2])<Number(wanted[2]))) return false;
  const volts=(s:string)=>[...s.matchAll(/\b(\d{2,4}(?:\.\d+)?)\s*V\s*(AC|DC)?\b/g)];
  const av=volts(a),bv=volts(b);
  if(av.length===1&&bv.length===1&&(av[0][1]!==bv[0][1]||(av[0][2]&&bv[0][2]&&av[0][2]!==bv[0][2]))) return false;
  const phases=(s:string)=>s.match(/\b([1-4])\s*(?:POL(?:ET)?|P(?:\+N)?)\b/)?.[1];
  const ap=phases(a),bp=phases(b); if(ap&&bp&&ap!==bp)return false;
  return true;
}
