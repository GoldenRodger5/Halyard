import {describe,expect,it} from 'vitest';
import {sourceTitlePriority,sortSourceCatalogEntries}
  from './v4-source-resolver';

describe('v4 source resolver selection',()=>{
  it('prioritizes consequential event premises over generic recency',()=>{
    const rows=[
      {title:'We become Girls for the Day',index:0},
      {title:'Cooking Blindfolded with my Crush',index:1},
      {title:'I GOTT MY FIRST TATOOOO',index:2},
      {title:'He passed out BDUBS hot wings challenge',index:5},
      {title:'I got kicked out of the spa',index:6},
    ].map((row)=>({
      id:row.title,url:'https://www.youtube.com/watch?v=x',
      title:row.title,timestamp:null,upload_date:null,duration:null,view_count:null,
      catalog_index:row.index,
      source_priority_score:sourceTitlePriority(row.title,row.index,null)
    }));
    const sorted=sortSourceCatalogEntries(rows);
    expect(sorted.map(x=>x.title)).toEqual([
      'He passed out BDUBS hot wings challenge',
      'I got kicked out of the spa',
      'Cooking Blindfolded with my Crush',
      'I GOTT MY FIRST TATOOOO',
      'We become Girls for the Day',
    ]);
  });

  it('keeps recency as a bounded tie breaker',()=>{
    expect(sourceTitlePriority('ordinary upload',0,null))
      .toBeGreaterThan(sourceTitlePriority('ordinary upload',8,null));
  });
});
