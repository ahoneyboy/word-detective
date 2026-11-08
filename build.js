/* 构建脚本：把 src/ 分片组装成单文件 index.html */
const fs=require("fs");
const path=require("path");
const read=f=>fs.readFileSync(path.join(__dirname,"src",f),"utf8");
const parts=["01-head.html","02-body.html","03-worddb-a.js","04-worddb-b.js","04c-worddb-extra1.js","04d-worddb-extra2.js","04e-worddb-bulk.js","05-worddb-c.js","06-core.js","07-ui-a.js","08-ui-b.js","09-tail.html"];
const out=parts.map(read).join("\n");
fs.writeFileSync(path.join(__dirname,"index.html"),out);
console.log("index.html 已生成，大小 "+(out.length/1024).toFixed(1)+" KB（上限 600KB）");
