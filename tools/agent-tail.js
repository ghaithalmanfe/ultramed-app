// usage: node agent-tail.js <agent.jsonl> [n]
const fs=require("fs");const lines=fs.readFileSync(process.argv[2],"utf8").trim().split("\n");const n=+process.argv[3]||12;
const out=[];
for(const l of lines){let j;try{j=JSON.parse(l)}catch(e){continue}
 const m=j.message; if(!m||!m.content) continue; const ts=j.timestamp||"";
 const c=Array.isArray(m.content)?m.content:[{type:"text",text:m.content}];
 for(const p of c){
  if(p.type==="text"&&m.role==="assistant") out.push(ts.slice(11,19)+" TXT "+p.text.slice(0,500).replace(/\n/g," "));
  if(p.type==="tool_use"){ const i=p.input||{}; out.push(ts.slice(11,19)+" USE "+p.name+" "+(i.description||i.file_path||i.subject||"").toString().slice(0,170).replace(/\n/g," ")); }
 }}
console.log(out.slice(-n).join("\n"));
