// Multilingual helpers for Broke Cat's X intelligence layer.
// No translation service is required: original Unicode is always preserved,
// while safe Latin/Cyrillic/Greek variants are generated as extra search terms.

const CYR={
  А:'A',Б:'B',В:'V',Г:'G',Д:'D',Е:'E',Ё:'Yo',Ж:'Zh',З:'Z',И:'I',Й:'Y',К:'K',Л:'L',М:'M',Н:'N',О:'O',П:'P',Р:'R',С:'S',Т:'T',У:'U',Ф:'F',Х:'Kh',Ц:'Ts',Ч:'Ch',Ш:'Sh',Щ:'Shch',Ъ:'',Ы:'Y',Ь:'',Э:'E',Ю:'Yu',Я:'Ya',
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  І:'I',і:'i',Ї:'Yi',ї:'yi',Є:'Ye',є:'ye',Ґ:'G',ґ:'g'
};
const GREEK={
  Α:'A',Β:'V',Γ:'G',Δ:'D',Ε:'E',Ζ:'Z',Η:'I',Θ:'Th',Ι:'I',Κ:'K',Λ:'L',Μ:'M',Ν:'N',Ξ:'X',Ο:'O',Π:'P',Ρ:'R',Σ:'S',Τ:'T',Υ:'Y',Φ:'F',Χ:'Ch',Ψ:'Ps',Ω:'O',
  α:'a',β:'v',γ:'g',δ:'d',ε:'e',ζ:'z',η:'i',θ:'th',ι:'i',κ:'k',λ:'l',μ:'m',ν:'n',ξ:'x',ο:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',υ:'y',φ:'f',χ:'ch',ψ:'ps',ω:'o'
};

export const LAUNCH_QUERY_GROUPS=[
  // English + widely-used crypto shorthand.
  '("launching soon" OR "launch today" OR "fair launch" OR "contract address" OR "official CA" OR "CA soon" OR "live now" OR "TGE" OR "token launch") (solana OR SOL)',
  // Spanish, Portuguese, French, Italian, German.
  '("lanzamiento" OR "lanza hoy" OR "dirección del contrato" OR "contrato oficial" OR "lançamento" OR "endereço do contrato" OR "lança hoje" OR "lancement" OR "adresse du contrat" OR "lancio" OR "indirizzo contratto" OR "startet heute" OR "vertragsadresse") (solana OR SOL)',
  // Russian/Ukrainian + Turkish + Arabic.
  '("запуск" OR "запуск сегодня" OR "адрес контракта" OR "официальный контракт" OR "запуск сьогодні" OR "адреса контракту" OR "lansman" OR "sözleşme adresi" OR "yakında çıkıyor" OR "إطلاق" OR "عنوان العقد" OR "العقد الرسمي") (solana OR SOL)',
  // Chinese, Japanese, Korean.
  '("即将上线" OR "今日上线" OR "合约地址" OR "官方合约" OR "发布合约" OR "ローンチ" OR "本日ローンチ" OR "コントラクトアドレス" OR "公式コントラクト" OR "출시" OR "오늘 출시" OR "계약 주소" OR "공식 계약") (solana OR SOL)'
];

const clean=s=>String(s??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
export function quoteX(value){const s=clean(value).replace(/["\\]/g,' ').replace(/\s+/g,' ').trim();return s?`"${s.slice(0,120)}"`:''}
export function latinFold(value){return clean(value).normalize('NFKD').replace(/\p{M}+/gu,'').normalize('NFKC')}
export function transliterate(value){return [...clean(value)].map(ch=>CYR[ch]??GREEK[ch]??ch).join('')}
export function detectScripts(value){const s=clean(value);const out=[];if(/[\u0400-\u052f]/u.test(s))out.push('Cyrillic');if(/[\u0370-\u03ff]/u.test(s))out.push('Greek');if(/[\u3040-\u30ff]/u.test(s))out.push('Japanese');if(/[\u3400-\u9fff]/u.test(s))out.push('Han');if(/[\uac00-\ud7af]/u.test(s))out.push('Korean');if(/[\u0600-\u06ff]/u.test(s))out.push('Arabic');if(/[\u0590-\u05ff]/u.test(s))out.push('Hebrew');if(/[\u0900-\u097f]/u.test(s))out.push('Devanagari');if(/[A-Za-z]/.test(s))out.push('Latin');return [...new Set(out)]}
export function textVariants(value){const original=clean(value);if(!original)return[];const folded=latinFold(original);const roman=transliterate(original);const variants=[original,folded,roman].map(clean).filter(Boolean);return [...new Set(variants)].slice(0,4)}
export function tokenSearchTerms(c){
  const terms=[];
  // Contract address is language-independent and gets first priority.
  if(c?.tokenAddress)terms.push(String(c.tokenAddress));
  for(const v of textVariants(c?.name))terms.push(quoteX(v));
  for(const v of textVariants(c?.symbol)){
    terms.push(quoteX(v));
    // X cashtag syntax is safest for ASCII tickers; Unicode ticker is still searched quoted above.
    if(/^[A-Za-z0-9_]{2,20}$/.test(v))terms.push(`$${v}`);
  }
  return [...new Set(terms.filter(Boolean))];
}
export function tokenSearchQueries(c,maxLen=430){
  const terms=tokenSearchTerms(c);const queries=[];let bucket=[];
  for(const term of terms){const attempt=`(${[...bucket,term].join(' OR ')}) -is:retweet`;if(bucket.length&&attempt.length>maxLen){queries.push(`(${bucket.join(' OR ')}) -is:retweet`);bucket=[term]}else bucket.push(term)}
  if(bucket.length)queries.push(`(${bucket.join(' OR ')}) -is:retweet`);
  return queries.slice(0,3);
}
export function multilingualLaunchQueries(custom='',limit=4){
  const q=[];if(String(custom||'').trim())q.push(String(custom).trim());for(const group of LAUNCH_QUERY_GROUPS){if(q.length>=limit)break;if(!q.includes(group))q.push(group)}return q;
}
export function launchSignal(text){
  const s=clean(text).toLowerCase();
  const patterns=[
    /\b(launch(?:ing|es|ed)?|fair launch|contract address|official ca|ca soon|live now|token launch|tge)\b/i,
    /(lanzamiento|lanza hoy|dirección del contrato|contrato oficial|lançamento|endereço do contrato|lança hoje|lancement|adresse du contrat|lancio|indirizzo contratto|vertragsadresse)/iu,
    /(запуск|адрес контракта|официальный контракт|адреса контракту|lansman|sözleşme adresi|إطلاق|عنوان العقد|العقد الرسمي)/iu,
    /(即将上线|今日上线|合约地址|官方合约|发布合约|ローンチ|コントラクトアドレス|公式コントラクト|출시|계약 주소|공식 계약)/u
  ];
  return patterns.some(re=>re.test(s));
}
export function authorLaunchTerms(){return '(CA OR contract OR launch OR live OR lanzamiento OR lançamento OR lancement OR запуск OR "合约地址" OR ローンチ OR "계약 주소" OR إطلاق)'}
