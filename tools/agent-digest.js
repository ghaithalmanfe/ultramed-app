// usage: node agent-digest.js <agent.jsonl> > digest.txt  — what a cut-off worker did, in order (its notes, its task list, each step's description and the files it edited)
const fs=require("fs");const lines=fs.readFileSync(process.argv[2],"utf8").trim().split("\n");
const out=[];
for(const l of lines){let j;try{j=JSON.parse(l)}catch(e){continue}
 const m=j.message; if(!m||!m.content) continue; const ts=(j.timestamp||"").slice(11,19);
 const c=Array.isArray(m.content)?m.content:[{type:"text",text:m.content}];
 for(const p of c){
  if(p.type==="text"&&m.role==="assistant"&&p.text.trim()) out.push(ts+" NOTE "+p.text.trim().slice(0,1500));
  if(p.type==="tool_use"){ const i=p.input||{};
    if(p.name==="TaskCreate") out.push(ts+" TASK+ "+(i.subject||"")+" — "+(i.description||"").slice(0,400));
    else if(p.name==="TaskUpdate") out.push(ts+" TASK "+(i.taskId||"")+" → "+(i.status||"")+(i.subject?" ("+i.subject+")":""));
    else if(p.name==="Edit"||p.name==="Write") out.push(ts+" "+p.name.toUpperCase()+" "+(i.file_path||"").replace(/^.*scratchpad\//,""));
    else if(p.name==="Bash") out.push(ts+" RUN "+(i.description||"").slice(0,200));
    else out.push(ts+" "+p.name+" "+(i.description||i.file_path||i.query||"").toString().slice(0,160));
  }
 }}
console.log(out.join("\n"));
