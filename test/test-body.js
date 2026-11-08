/* ---------- 测试主体 ---------- */
const FAILS=[];
function assert(cond,msg){if(!cond)FAILS.push(msg);}
const POS_SET=new Set(POS_LIST);
const COLOR_SET=new Set(["褒义","中性","贬义"]);
const TAG_SET=new Set(TAG_LIST);
function cnLen(s){return String(s).replace(/[，。、！？：；""''（）—…·,.!?;:'"()\s]/g,"").length;}

/* 1) 结构校验 */
for(const e of WORD_DB){
  assert(e.word.length>=2&&e.word.length<=5,"词条字数异常："+e.word);
  assert(POS_SET.has(e.pos),"词性非法："+e.word+" → "+e.pos);
  assert(Number.isInteger(e.grade)&&e.grade>=1&&e.grade<=9,"年级非法："+e.word);
  assert(COLOR_SET.has(e.color),"感情色彩非法："+e.word+" → "+e.color);
  assert(e.definition&&cnLen(e.definition)<=25,"释义超长(>25字)："+e.word);
  assert(Array.isArray(e.examples)&&e.examples.length===2,"例句必须恰好2条："+e.word);
  e.examples.forEach(x=>assert(cnLen(x)<=30,"例句超长(>30字)："+e.word+"："+x));
  assert(e.synonyms.length>=0&&e.synonyms.length<=4,"近义词数量须0-4："+e.word);
  e.synonyms.forEach(s=>assert(s.diff&&cnLen(s.diff)>=3&&s.diff!=="意思相近","近义词diff缺失或空话："+e.word+"→"+s.word));
  assert(e.antonyms.length<=2,"反义词超过2条："+e.word);
  e.antonyms.forEach(s=>assert(s.diff&&cnLen(s.diff)>=3&&s.diff!=="意思相近","反义词diff缺失或空话："+e.word+"→"+s.word));
  assert(e.tags.length>=1&&e.tags.length<=3,"标签须1-3个："+e.word);
  e.tags.forEach(t=>assert(TAG_SET.has(t),"标签非法："+e.word+" → "+t));
  assert(/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ'\s]+$/i.test(e.pinyin),"拼音含异常字符："+e.word+"："+e.pinyin);
  const syl=e.pinyin.trim().split(/\s+/);
  assert(e.initials===syl.map(s=>stripTones(s).charAt(0)).join(""),"首字母与拼音不一致："+e.word);
  assert(e.pinyin_plain===syl.map(stripTones).join(""),"全拼与拼音不一致："+e.word);
  const sw=new Set(e.synonyms.map(s=>s.word));
  e.antonyms.forEach(a=>assert(!sw.has(a.word),"近/反义掺和："+e.word+" 的近义词里出现了 "+a.word));
  assert(!sw.has(e.word)&&!e.antonyms.some(a=>a.word===e.word),"自引用："+e.word);
}
/* 2) 重复词 */
{const seen=new Set();for(const e of WORD_DB){assert(!seen.has(e.word),"重复词条："+e.word);seen.add(e.word);}}
/* 3) 循环矛盾：A 近义 B ⇒ B 不能反义 A；A 反义 B ⇒ B 不能近义 A */
{const byW=new Map(WORD_DB.map(e=>[e.word,e]));
 for(const e of WORD_DB){
   e.synonyms.forEach(s=>{const b=byW.get(s.word);
     if(b)assert(!b.antonyms.some(a=>a.word===e.word),"矛盾：A近义B但B反义A："+e.word+"-"+s.word);});
   e.antonyms.forEach(s=>{const b=byW.get(s.word);
     if(b)assert(!b.synonyms.some(a=>a.word===e.word),"矛盾：A反义B但B近义A："+e.word+"-"+s.word);});
 }
 /* 4) 辨析配对的两个词都必须在库中，且场景句包含目标词 */
 for(const k of Object.keys(CONTRAST_DB)){
   const [wa,wb]=k.split("|");
   assert(byW.has(wa)&&byW.has(wb),"辨析配对缺词条："+k);
   const p=CONTRAST_DB[k];
   assert(p.scene&&p.scene.a&&p.scene.a.includes(wa),"场景句A缺少目标词："+k);
   assert(p.scene.b&&p.scene.b.includes(wb),"场景句B缺少目标词："+k);
 }
 /* 5) 检索三种输入 */
 assert(DB_API.search("高兴").some(r=>r.e.word==="高兴"),"搜不到：高兴");
 assert(DB_API.search("gaoxing").some(r=>r.e.word==="高兴"),"搜不到：gaoxing");
 assert(DB_API.search("gāo xìng").some(r=>r.e.word==="高兴"),"搜不到：带调拼音");
 assert(DB_API.search("gx").some(r=>r.e.word==="高兴"),"搜不到：首字母 gx");
 assert(DB_API.search("<script>alert(1)</script>").length>=0,"XSS 输入导致异常");
}
/* 6) 出题引擎全量自检
   注意：R8（选项两两不相关）只约束"选近义/选反义"题；找异类题按其
   题型定义是"3 个互为近义词 + 1 个无关词"，改用专项校验：
   无关词（正确答案）不能与组内任何词构成近义/反义/共享近义关系。 */
let gen=0,fail=0;const failLog=[];
for(const e of WORD_DB){
  for(const kind of ["syn","ant","odd","fillSyn","fillAnt","learn"]){
    const q=QUIZ_ENGINE.gen(kind,e,null,null);
    if(!q)continue;
    gen++;
    const optStr=q.options?q.options.join(" / "):(q.answers||q.synWords||[]).join("、");
    assert(q.options===undefined||q.options.length===4,"选项数不为4："+e.word);
    assert(q.options===undefined||new Set(q.options).size===4,"选项有重复词："+e.word+"："+optStr);
    let err=null;
    if(kind==="odd"){
      const odd=q.options[q.answerIndex];
      const others=q.options.filter(w=>w!==odd);
      for(const o of others){
        const a=DB_API.byWord(o),b=DB_API.byWord(odd);
        if(a&&b&&DB_API.isRelated(a,b)){err="R8-odd(无关词与组内相关)";break;}
      }
      /* 组内 3 词 = 题干词自身 + 它的两个近义词（互为近义是题型定义） */
      if(!err&&!others.every(w=>w===e.word||e.synonyms.some(s=>s.word===w)))err="R1-odd(组内词不在近义集)";
    }else if(kind==="fillSyn"||kind==="fillAnt"){
      if(!q.answers.length||q.answers.includes(e.word))err="fill(参考答案为空或含题干)";
      else if(QUIZ_ENGINE.checkFillAnswer(e,kind,q.answers[0]).state!=="ok")err="fill(参考答案无法判分)";
    }else if(kind==="learn"){
      if((!q.synWords.length&&!q.antWords.length)||q.synWords.includes(e.word)||q.antWords.includes(e.word))
        err="learn(卡片内容为空或含题干)";
    }else{
      /* validateOptions 内部已按题型取答案集合：近义题排除其余近义词、
         反义题排除其余反义词（杜绝双正确答案）；近义题用反义词作干扰项
         是 R3 的设计，不会被误判。 */
      err=QUIZ_ENGINE.validateOptions(e,kind,q.options[q.answerIndex],q.options);
    }
    if(err){fail++;failLog.push(e.word+" ["+kind+"] 违反 "+err+"："+(q.options?q.options.join(" / "):(q.answers||[]).join("、")));}
  }
}
/* 7) 填写判分：正向、反向、误判三例 */
{
  const gx=DB_API.byWord("高兴");
  assert(QUIZ_ENGINE.checkFillAnswer(gx,"fillSyn","愉快").state==="ok","checkFillAnswer 正向失败：愉快");
  assert(QUIZ_ENGINE.checkFillAnswer(DB_API.byWord("愉快"),"fillSyn","高兴").state==="ok","checkFillAnswer 反向失败：高兴");
  assert(QUIZ_ENGINE.checkFillAnswer(gx,"fillSyn","难过").state==="no","checkFillAnswer 误收反义词：难过");
  assert(QUIZ_ENGINE.checkFillAnswer(gx,"fillSyn","").state==="empty","checkFillAnswer 空输入未识别");
  assert(QUIZ_ENGINE.checkFillAnswer(gx,"fillSyn","高兴").state==="self","checkFillAnswer 题干本身未识别");
  assert(QUIZ_ENGINE.checkFillAnswer(gx,"fillAnt","难过").state==="ok","checkFillAnswer 反义正向失败");
}
/* R7：60 关抽检——关内词不重复且满 5 题 */
let full=0,dup=0;
for(let i=0;i<60;i++){
  const qs=QUIZ_ENGINE.generateLevel({level:(i%3)+1,mode:"normal"});
  assert(qs.length>0,"有难度等级完全组不出题");
  if(qs.length===5)full++;
  if(new Set(qs.map(q=>q.wordId)).size!==qs.length)dup++;
}
/* 汇总输出 */
console.log("========== 自检结果 ==========");
console.log("词条总数：",WORD_DB.length);
console.log("辨析配对：",Object.keys(CONTRAST_DB).length,"组");
console.log("出题自检：成功生成 "+gen+" 道题，校验失败 "+fail+" 道");
if(failLog.length)console.log(failLog.slice(0,30).join("\n"));
console.log("关卡抽检：满 5 题 "+full+"/60，关内重复词 "+dup+" 关");
const pool={};
WORD_DB.forEach(e=>{pool[e.grade]=(pool[e.grade]||0)+1;});
console.log("年级分布：",JSON.stringify(pool));
if(FAILS.length){
  console.log("\n结构问题 "+FAILS.length+" 条：");
  FAILS.slice(0,50).forEach(m=>console.log("  ✗ "+m));
  process.exitCode=1;
}else{
  console.log("\n结构校验全部通过 ✓");
}
