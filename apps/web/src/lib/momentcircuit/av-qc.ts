export type AlignmentResult = {
  pass:boolean;
  overall_coverage:number;
  ordered_coverage:number;
  payoff_coverage:number;
  expected_words:number;
  transcript_words:number;
  missing_words:string[];
};

export function normalizeSpeech(value:string):string[] {
  return String(value??'')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’‘]/g,"'")
    .replace(/[^a-z0-9'\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w)=>w.replace(/^'+|'+$/g,''))
    .filter(Boolean);
}

function orderedCoverage(expected:string[],actual:string[]):number {
  if(!expected.length) return 1;
  let j=0,found=0;
  for(const word of actual){
    if(j<expected.length && word===expected[j]){found++;j++;continue;}
    if(j+1<expected.length && word===expected[j+1]){found++;j+=2;}
  }
  return found/expected.length;
}

export function assessCaptionAlignment(expectedPhrases:string[],transcript:string):AlignmentResult {
  const expected=normalizeSpeech(expectedPhrases.join(' '));
  const actual=normalizeSpeech(transcript);
  if(!expected.length) return {pass:true,overall_coverage:1,ordered_coverage:1,payoff_coverage:1,expected_words:0,transcript_words:actual.length,missing_words:[]};
  if(!actual.length) return {pass:false,overall_coverage:0,ordered_coverage:0,payoff_coverage:0,expected_words:expected.length,transcript_words:0,missing_words:[...new Set(expected)].slice(0,20)};

  const counts=new Map<string,number>();
  for(const w of actual) counts.set(w,(counts.get(w)??0)+1);
  let found=0;
  const missing:string[]=[];
  for(const w of expected){
    const n=counts.get(w)??0;
    if(n>0){found++;counts.set(w,n-1);} else missing.push(w);
  }
  const overall=found/expected.length;
  const ordered=orderedCoverage(expected,actual);
  const payoffExpected=normalizeSpeech(expectedPhrases.at(-1)??'');
  const tail=actual.slice(-Math.max(8,payoffExpected.length*2));
  const tailSet=new Set(tail);
  const payoff=payoffExpected.length ? payoffExpected.filter((w)=>tailSet.has(w)).length/payoffExpected.length : 1;
  const pass=overall>=0.82 && ordered>=0.72 && payoff>=0.72;
  return {
    pass,
    overall_coverage:Number(overall.toFixed(3)),
    ordered_coverage:Number(ordered.toFixed(3)),
    payoff_coverage:Number(payoff.toFixed(3)),
    expected_words:expected.length,
    transcript_words:actual.length,
    missing_words:[...new Set(missing)].slice(0,20),
  };
}
