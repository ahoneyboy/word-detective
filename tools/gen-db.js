/* 词库扩容生成器：
   读取 src/bulk/*.txt（一行一条，管道分隔），用 pinyin-pro 自动注音，
   生成 src/04e-worddb-bulk.js（W(...) 调用），再由 build.js 组装进 index.html。
   行格式： 词|词性|年级|色彩|释义|近1/近2|反1/反2|标签
   （近/反/标签可留空；# 开头为注释） */
const fs=require("fs");
const path=require("path");
const {pinyin}=require("pinyin-pro");

const ROOT=path.join(__dirname,"..");
const BULK=path.join(ROOT,"src","bulk");
const OUT=path.join(ROOT,"src","04e-worddb-bulk.js");

/* 现有手工词库的词，避免重复 */
function existingWords(){
  const src=["03-worddb-a.js","04-worddb-b.js","04c-worddb-extra1.js","04d-worddb-extra2.js"]
    .map(f=>fs.readFileSync(path.join(ROOT,"src",f),"utf8")).join("\n");
  const set=new Set();
  const re=/W\("([^"]+)"/g;let m;
  while((m=re.exec(src)))set.add(m[1]);
  return set;
}
/* 拼音人工校正表（多音字特例） */
const PINYIN_FIX={
  "强调":"qiáng diào","处理":"chǔ lǐ","处罚":"chǔ fá","追赶":"zhuī gǎn",
  "干净":"gān jìng","扭转":"niǔ zhuǎn","为难":"wéi nán","曲解":"qū jiě"
};
const POS_OK=new Set(["名词","动词","形容词","副词","量词","成语"]);
const TAGS_OK=new Set(["情绪","心情","动作","神态","声音","天气","自然","景物","人物","性格","品质","学习","生活","程度","速度","数量","颜色","空间","时间"]);

const seen=existingWords();
const lines=[],skipped=[];
const files=fs.readdirSync(BULK).filter(f=>f.endsWith(".txt")).sort();
for(const f of files){
  const raw=fs.readFileSync(path.join(BULK,f),"utf8").split("\n");
  for(let rawLine of raw){
    const line=rawLine.trim();
    if(!line||line.startsWith("#"))continue;
    const parts=line.split("|");
    if(parts.length<5){skipped.push(f+" 字段不足: "+line);continue;}
    let word,pos,grade,color,def,syn,ant,tags;
    if(parts.length>=8){                 /* 全格式：词|词性|年级|色彩|释义|近|反|标签 */
      [word,pos,grade,color,def,syn,ant,tags]=parts.map(s=>s.trim());
    }else if(parts.length===7){          /* 词|词性|年级|释义|近|反|标签 */
      [word,pos,grade,def,syn,ant,tags]=parts.map(s=>s.trim());
      color="中";
    }else if(parts.length===6){          /* 词|词性|释义|近|反|标签 */
      [word,pos,def,syn,ant,tags]=parts.map(s=>s.trim());
      grade="4";color="中";
    }else{                               /* 词|词性|释义|近|反 */
      [word,pos,def,syn,ant]=parts.map(s=>s.trim());
      grade="4";color="中";tags="";
    }
    if(seen.has(word)){skipped.push("重复跳过: "+word);continue;}
    if(word.length<1||word.length>5){skipped.push("长度异常: "+word);continue;}
    if(!POS_OK.has(pos)){skipped.push("词性非法: "+word+" "+pos);continue;}
    grade=parseInt(grade,10);
    if(!(grade>=1&&grade<=9)){skipped.push("年级非法: "+word);continue;}
    if(!["褒","中","贬"].includes(color)){skipped.push("色彩非法: "+word+" "+color);continue;}
    if(!def){skipped.push("无释义: "+word);continue;}
    tags=(tags||"").split(/\s+/).filter(t=>TAGS_OK.has(t));
    if(!tags.length){
      tags=[pos==="动词"?"动作":pos==="副词"?"程度":pos==="成语"?"品质":"生活"];
    }
    const py=PINYIN_FIX[word]||pinyin(word,{toneType:"symbol",type:"array"}).join(" ");
    const syns=(syn||"").split("/").map(s=>s.trim()).filter(Boolean).slice(0,4);
    const ants=(ant||"").split("/").map(s=>s.trim()).filter(Boolean).slice(0,2);
    seen.add(word);
    lines.push({word,py,pos,grade,color,def,syns,ants,tags});
  }
}
const out=lines.map(e=>`W(${JSON.stringify(e.word)},${JSON.stringify(e.py)},${JSON.stringify(e.pos)},${e.grade},${JSON.stringify(e.color)},${JSON.stringify(e.def)},[],${
  JSON.stringify(e.syns)},${JSON.stringify(e.ants)},${JSON.stringify(e.tags)},"","");`).join("\n");
fs.writeFileSync(OUT,
  "/* =====================================================================\n"+
  " * 词库扩容（批量）：由 tools/gen-db.js 从 src/bulk/*.txt 自动生成，\n"+
  " * 拼音由 pinyin-pro 构建期注音；请勿手工编辑本文件，改 bulk 源文件。\n"+
  " * ===================================================================== */\n"+out+"\n");
console.log("生成词条 "+lines.length+" 条 → "+path.basename(OUT));
if(skipped.length)console.log("跳过 "+skipped.length+" 条：\n  "+skipped.slice(0,20).join("\n  "));
