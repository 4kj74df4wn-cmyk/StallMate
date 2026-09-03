const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(process.argv[2],'utf8');
const blocks=[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
if(!blocks.length){console.error('SYNTAX FAIL: no inline script found');process.exit(2);}
let n=0; for(const b of blocks){ try{ new vm.Script(b); n++; }catch(e){ console.error('SYNTAX FAIL: '+e.message);process.exit(1);} }
console.log('syntax OK ('+n+' script block(s) parsed)');
