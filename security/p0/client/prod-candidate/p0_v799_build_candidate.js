const fs=require('fs');
let html=fs.readFileSync('baseline/v7.9.8.14_M2_d806e672.html','utf8');
const inner=fs.readFileSync('authlayer.js','utf8');
// 1) add auth-compat SDK after database-compat
const dbTag='<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>';
const authTag='<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>';
if(html.indexOf(dbTag)<0) throw new Error('db-compat tag not found'); 
if(html.indexOf(authTag)<0) html=html.replace(dbTag, dbTag+'\n'+authTag);
// 2) APP_VERSION bump
if(html.indexOf("APP_VERSION='v7.9.8.14'")<0) throw new Error('APP_VERSION anchor not found');
html=html.replace("APP_VERSION='v7.9.8.14'","APP_VERSION='v7.9.9'");
// 3) inject auth layer block before </body>
const block='<script>\n'+inner+'\n</script>\n';
const bodyClose='</body>';
const idx=html.lastIndexOf(bodyClose);
if(idx<0) throw new Error('</body> not found');
html=html.slice(0,idx)+block+html.slice(idx);
fs.writeFileSync('stallmate_v7.9.9.html',html);
console.log('candidate written, bytes='+html.length);
