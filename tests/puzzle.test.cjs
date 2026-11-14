const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PUZZLES,conflicts}=require('../assets/puzzle.js');
function solve(regions, choices=[]){
  if(choices.length===5)return [choices.map(i=>i%5)];
  return Array.from({length:5},(_,c)=>choices.length*5+c)
    .filter(i=>choices.every(j=>!conflicts(i,j,regions)))
    .flatMap(i=>solve(regions,[...choices,i]));
}
for(const [i,{rows,solution}] of PUZZLES.entries()){
 test('puzzle '+(i+1)+' has connected regions and one valid solution',()=>{
  const regions=rows.join('');
  assert.equal(regions.length,25);
  for(const name of '01234'){
   const start=regions.indexOf(name);
   assert.notEqual(start,-1);
   const found=new Set([start]), pending=[start];
   while(pending.length){
    const cell=pending.pop();
    const r=Math.floor(cell/5), c=cell%5;
    for(const [y,x] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]){
      const next=y*5+x;
      if(y>=0&&y<5&&x>=0&&x<5&&regions[next]===name&&!found.has(next)){found.add(next);pending.push(next);}
    }
   }
   assert.equal(found.size,Array.from(regions).filter(c=>c===name).length);
  }
  assert.deepEqual(solve(regions),[solution]);
 });
}
