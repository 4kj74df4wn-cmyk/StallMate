const fs=require('fs'),crypto=require('crypto');
const BASE='baseline/v7.9.8.14_M2_d806e672.html';
const EXPECT='d806e672b4409bbefb4f0b57980580720e291f69c268c8b74d08834a7f227a11';
let html=fs.readFileSync(BASE,'utf8');
// (2) baseline-SHA guard — FAIL-CLOSED if source baseline != frozen v7.9.8.14
const got=crypto.createHash('sha256').update(fs.readFileSync(BASE)).digest('hex');
if(got!==EXPECT){ console.error('BASELINE_SHA_MISMATCH: '+got+' != '+EXPECT); process.exit(9); }
const inner=fs.readFileSync('authlayer.js','utf8');
const dbTag='<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>';
const authTag='<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>';
if(html.indexOf(authTag)<0) html=html.replace(dbTag, dbTag+'\n'+authTag);
if(html.indexOf("APP_VERSION='v7.9.8.14'")<0) throw new Error('APP_VERSION anchor not found');
html=html.replace("APP_VERSION='v7.9.8.14'","APP_VERSION='v7.9.8.15-rc.1'");
const block='<script>\n'+inner+'\n</script>\n';
const idx=html.lastIndexOf('</body>');
html=html.slice(0,idx)+block+html.slice(idx);
fs.writeFileSync('stallmate_v7.9.8.15-rc.1.html',html);
console.log('candidate written (baseline-SHA guard PASS)');
