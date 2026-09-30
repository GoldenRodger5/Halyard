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
  const expanded=String(value??'')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’‘]/g,"'")
    .replace(/\b(it|he|she|that|what|who|there|here)'s\b/g,'$1 is')
    .replace(/\b(i|you|we|they|he|she|it)'d\b/g,'$1 would')
    .replace(/\b(i|you|we|they)'re\b/g,'$1 are')
    .replace(/\b(i|you|we|they|he|she)'ll\b/g,'$1 will')
    .replace(/\b(can)'t\b/g,'cannot')
    .replace(/\b(won)'t\b/g,'will not')
    .replace(/n't\b/g,' not')
    .replace(/'ve\b/g,' have')
    .replace(/'m\b/g,' am')
    .replace(/'s\b/g,'s');
  return expanded
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function orderedCoverage(expected:string[],actual:string[]):number {
  if(!expected.length) return 1;
  if(!actual.length) return 0;

  // Longest-common-subsequence coverage preserves word order while tolerating
  // bounded ASR omissions/insertions.
  const dp=new Array<number>(actual.length+1).fill(0);
  for(let i=1;i<=expected.length;i++){
    let diagonal=0;
    for(let j=1;j<=actual.length;j++){
      const previous=dp[j]!;
      if(expected[i-1]===actual[j-1]) dp[j]=diagonal+1;
      else dp[j]=Math.max(dp[j]!,dp[j-1]!);
      diagonal=previous;
    }
  }
  return dp[actual.length]!/expected.length;
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
  const payoffWordCount=Math.min(14,Math.max(8,Math.ceil(expected.length*0.2)));
  const payoffExpected=expected.slice(-payoffWordCount);
  const tail=actual.slice(-Math.max(16,payoffExpected.length*2));
  const tailCounts=new Map<string,number>();
  for(const w of tail) tailCounts.set(w,(tailCounts.get(w)??0)+1);
  let payoffFound=0;
  for(const w of payoffExpected){
    const n=tailCounts.get(w)??0;
    if(n>0){payoffFound++;tailCounts.set(w,n-1);}
  }
  const payoff=payoffExpected.length ? payoffFound/payoffExpected.length : 1;
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
