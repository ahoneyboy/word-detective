/* 自动化测试（P8 自检）：
   1) 词条结构校验（字段、标签、拼音推导、例句数量、diff 完整性）
   2) 近/反义不掺和 + 循环矛盾检测
   3) 检索三种输入方式
   4) 出题引擎全量自检（R2/R5/R6/R8 逐题校验 + R7 关内不重复）
   运行：node test/run.js */
const fs=require("fs");
const path=require("path");
const read=f=>fs.readFileSync(path.join(__dirname, f==="test-body.js"?"":"..","src",f),"utf8");
const src=read("03-worddb-a.js")+"\n"+read("04-worddb-b.js")+"\n"+read("04c-worddb-extra1.js")
  +"\n"+read("04d-worddb-extra2.js")+"\n"+read("05-worddb-c.js")
  +"\n"+read("06-core.js")+"\n"+fs.readFileSync(path.join(__dirname,"test-body.js"),"utf8");
new Function(src)();   // 同一函数作用域内执行，词库与引擎对测试代码可见
