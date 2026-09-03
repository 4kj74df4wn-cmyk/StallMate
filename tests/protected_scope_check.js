// Deterministic protected-scope guard (C2, hardened). Reference = the immutable M2 snapshot
// (itself SHA-guarded by verify.sh C3), NOT a co-editable JSON — so editing a protected
// function AND a baseline file together still FAILS (combined-bypass resistant).
// Usage: node protected_scope_check.js <candidate.html> <reference.html>
//        node protected_scope_check.js <candidate.html> --emit   (print hashes, informational)
const fs=require('fs'), crypto=require('crypto');
const PROTECTED=['computeBillStats','isValidOrderId','billCountLabel','avgPerOrderLabel',
 'sessionBillCountLabel','renderStatKPI','collectBackupData','applyBackupData','backup','restore','clearAll'];
function extract(src,name){
  const re=new RegExp('function\\s+'+name+'\\s*\\(','g'); const m=re.exec(src); if(!m) return null;
  let i=src.indexOf('{',m.index); if(i<0) return null; const start=m.index;
  let depth=0,inS=false,q='',inL=false,inB=false;
  for(;i<src.length;i++){const c=src[i],n=src[i+1];
    if(inL){ if(c==='\n')inL=false; continue; }
    if(inB){ if(c==='*'&&n==='/'){inB=false;i++;} continue; }
    if(inS){ if(c==='\\'){i++;continue;} if(c===q)inS=false; continue; }
    if(c==='/'&&n==='/'){inL=true;i++;continue;}
    if(c==='/'&&n==='*'){inB=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){inS=true;q=c;continue;}
    if(c==='{')depth++; else if(c==='}'){depth--; if(depth===0)return src.slice(start,i+1);}
  } return null;
}
function hashes(src){const o={};for(const n of PROTECTED){const b=extract(src,n);if(b===null)return{__missing:n};o[n]=crypto.createHash('sha256').update(b).digest('hex');}return o;}
const cand=process.argv[2], ref=process.argv[3];
const cur=hashes(fs.readFileSync(cand,'utf8'));
if(cur.__missing){console.error('PROTECTED-SCOPE FAIL: candidate missing/unparsable fn: '+cur.__missing);process.exit(3);}
if(ref==='--emit'){console.log(JSON.stringify(cur,null,2));process.exit(0);}
if(!ref||!fs.existsSync(ref)){console.error('PROTECTED-SCOPE FAIL: reference snapshot missing '+ref);process.exit(2);}
const base=hashes(fs.readFileSync(ref,'utf8'));
if(base.__missing){console.error('PROTECTED-SCOPE FAIL: reference missing fn: '+base.__missing);process.exit(2);}
let bad=0; for(const n of PROTECTED){ if(base[n]!==cur[n]){console.error('PROTECTED-SCOPE FAIL: '+n+' changed vs immutable snapshot');bad++;} }
if(bad){process.exit(1);} console.log('protected-scope OK ('+PROTECTED.length+' fns == immutable snapshot)');
