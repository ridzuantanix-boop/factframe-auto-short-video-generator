import type { Research } from "@/lib/pawarna/types";
export function ResearchSources({research}:{research?:Research}) {
  if(!research)return null;
  return <details className="pn-sources"><summary>{research.status==="grounded"?"Lihat sumber research":"Kenapa maklumat web belum disahkan?"}</summary><p>{research.note}</p>{research.sources.map(s=><a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer">{s.title} ↗</a>)}{research.search_html&&<iframe title="Cadangan Google Search" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:"><base target="_blank">${research.search_html}`}/>}</details>;
}
