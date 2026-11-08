/* =====================================================================
 * 三、数据访问 API（纯逻辑，无 DOM，可在 Node 里单独测试）
 * ===================================================================== */
const POS_LIST=["名词","动词","形容词","副词","量词","成语"];
const DB_API=(()=>{
  const byIdMap={},byWordMap={};
  WORD_DB.forEach(e=>{byIdMap[e.id]=e;byWordMap[e.word]=e;});
  const relatedCache=new Map();

  /* 该词引用到的全部相关词（自身 + 近义词 + 反义词），用于 R2/R8 校验 */
  function relatedSet(e){
    let s=relatedCache.get(e.id);
    if(!s){
      s=new Set([e.word]);
      e.synonyms.forEach(x=>s.add(x.word));
      e.antonyms.forEach(x=>s.add(x.word));
      relatedCache.set(e.id,s);
    }
    return s;
  }
  /* R8 相关性判定：互为近/反义，或共享近义词，即视为相关 */
  function isRelated(a,b){
    if(!a||!b)return false;
    if(a.id===b.id)return true;
    if(relatedSet(a).has(b.word)||relatedSet(b).has(a.word))return true;
    for(const x of a.synonyms){if(b.synonyms.some(y=>y.word===x.word))return true;}
    return false;
  }

  /* ---------- 检索（P2：汉字 / 拼音全拼 / 拼音首字母） ---------- */
  function cleanQuery(q){
    return String(q==null?"":q)
      .replace(/^[，。！？、；：,.!?~\s]+|[，。！？、；：,.!?~\s]+$/g,"").trim();
  }
  function search(raw){
    const q=cleanQuery(raw);
    if(!q)return[];
    const low=q.toLowerCase();
    const qPlain=stripTones(low).replace(/[\s']/g,"");
    const out=[];
    for(const e of WORD_DB){
      let score=-1,field="",start=0,len=0;
      if(e.word===q){score=100;field="word";start=0;len=q.length;}
      else if(qPlain&&e.pinyin_plain===qPlain){score=95;field="plain";start=0;len=qPlain.length;}
      else if(low.length>=2&&e.initials===low){score=90;field="initials";start=0;len=low.length;}
      else if(e.word.startsWith(q)){score=80;field="word";start=0;len=q.length;}
      else if(qPlain.length>=2&&e.pinyin_plain.startsWith(qPlain)){score=70;field="plain";start=0;len=qPlain.length;}
      else if(qPlain.length>=2&&e.initials.startsWith(qPlain)){score=60;field="initials";start=0;len=qPlain.length;}
      else if(qPlain.length>=2&&e.pinyin_plain.includes(qPlain)){score=55;field="plain";start=e.pinyin_plain.indexOf(qPlain);len=qPlain.length;}
      else if(q.length>=2&&e.word.includes(q)){score=50;field="word";start=e.word.indexOf(q);len=q.length;}
      else if(e.tags.indexOf(q)>=0){score=45;field="tag";}
      if(score>0)out.push({e:e,score:score,field:field,start:start,len:len});
    }
    out.sort((a,b)=>b.score-a.score||a.e.word.length-b.e.word.length||a.e.id.localeCompare(b.e.id));
    return out;
  }
  /* 把"无声调全拼"里的匹配区间映射回带调拼音，用于高亮 */
  function plainRangeToPinyin(e,start,len){
    const syls=e.pinyin.split(/\s+/);
    let pos=0;const spans=[];
    for(let i=0;i<syls.length;i++){
      const p=stripTones(syls[i]);
      const s0=pos,s1=pos+p.length;
      const ov0=Math.max(s0,start),ov1=Math.min(s1,start+len);
      if(ov1>ov0)spans.push({i:i,a:ov0-s0,b:ov1-s0});
      pos=s1;
    }
    return spans;
  }
  function byId(id){return byIdMap[id]||null;}
  function byWord(w){return byWordMap[w]||null;}
  function letters(){
    const set={};
    WORD_DB.forEach(e=>{const c=(e.pinyin_plain[0]||"").toUpperCase();if(c)set[c]=1;});
    return Object.keys(set).sort();
  }
  function byLetter(ch){return WORD_DB.filter(e=>(e.pinyin_plain[0]||"").toUpperCase()===ch);}
  function byTag(t){return WORD_DB.filter(e=>e.tags.indexOf(t)>=0);}
  /* 每日一词：按日期确定性取词 */
  function daily(){
    const d=new Date();
    const key=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
    return WORD_DB[key%WORD_DB.length];
  }
  function recommend(n){
    const d=new Date();
    const seed=d.getFullYear()+d.getMonth()*31+d.getDate()*7;
    const arr=[];
    for(let i=0;i<WORD_DB.length;i++)arr.push(WORD_DB[(seed+i*97)%WORD_DB.length]);
    return arr.filter((e,i,a)=>a.indexOf(e)===i).slice(0,n);
  }
  return {byId:byId,byWord:byWord,search:search,cleanQuery:cleanQuery,
    isRelated:isRelated,relatedSet:relatedSet,plainRangeToPinyin:plainRangeToPinyin,
    letters:letters,byLetter:byLetter,byTag:byTag,daily:daily,recommend:recommend};
})();

/* =====================================================================
 * 四、本地存储（P5：统一前缀 syn.，容错读取，配额兜底）
 * ===================================================================== */
const STORE=(()=>{
  const P="syn.",VERSION="1.0";
  function safeParse(v,def){try{const o=JSON.parse(v);return o==null?def:o;}catch(e){return def;}}
  function load(key,def){
    try{const raw=localStorage.getItem(P+key);if(raw==null)return def;return safeParse(raw,def);}
    catch(e){return def;}   // 隐私模式/被禁用时抛异常，兜底默认值
  }
  function pruneHistory(h){
    const keep={};
    const d=new Date();
    for(let i=0;i<90;i++){          // 只保留最近 90 天
      const t=new Date(d.getTime()-i*86400000);
      keep[t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0")]=1;
    }
    Object.keys(h).forEach(k=>{if(!keep[k])delete h[k];});
  }
  function save(key,val){
    try{localStorage.setItem(P+key,JSON.stringify(val));return true;}
    catch(e){                     // 配额满：清掉最占空间的历史再试一次
      try{localStorage.removeItem(P+"history");localStorage.setItem(P+key,JSON.stringify(val));return true;}
      catch(e2){return false;}
    }
  }
  function remove(key){try{localStorage.removeItem(P+key);}catch(e){}}
  function migrate(){/* v1.0 为首个版本，预留升级迁移入口 */}
  function init(){
    let v="0";
    try{const raw=localStorage.getItem(P+"version");v=raw==null?"0":safeParse(raw,"0");}catch(e){}
    if(v!==VERSION){migrate();save("version",VERSION);}
    if(!Array.isArray(load("favorites",null)))save("favorites",[]);
    const w=load("wrong",null);if(!w||typeof w!=="object"||Array.isArray(w))save("wrong",{});
    const h=load("history",null);if(!h||typeof h!=="object"||Array.isArray(h))save("history",{});
    const s=load("streak",null);if(!s||typeof s!=="object"||Array.isArray(s))save("streak",{current:0,longest:0,lastDate:""});
    if(!Array.isArray(load("badges",null)))save("badges",[]);
    const st=load("settings",null);if(!st||typeof st!=="object"||Array.isArray(st))save("settings",{sound:true,theme:"light",level:1});
    const t=load("totals",null);if(!t||typeof t!=="object"||Array.isArray(t))save("totals",{});
    if(!Array.isArray(load("recent",null)))save("recent",[]);
    const m=load("mastered",null);if(!m||typeof m!=="object"||Array.isArray(m))save("mastered",{});
  }
  return {load:load,save:save,remove:remove,init:init,VERSION:VERSION};
})();

/* ---------- 学习数据读写（全部带默认值兜底） ---------- */
function getSettings(){
  const s=STORE.load("settings",{});
  return Object.assign({sound:true,theme:"light",level:1,answerMode:"choice"},(s&&typeof s==="object")?s:{});
}
function saveSettings(s){STORE.save("settings",s);}
function todayStr(d){const t=d||new Date();
  return t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0");}
function yesterStr(){return todayStr(new Date(Date.now()-86400000));}
function getHistory(){const h=STORE.load("history",{});return (h&&typeof h==="object"&&!Array.isArray(h))?h:{};}
function bumpHistory(field){
  const h=getHistory(),d=todayStr();
  const day=Object.assign({searched:0,answered:0,correct:0},h[d]||{});
  day[field]=(day[field]||0)+1;h[d]=day;
  STORE.save("history",h);
}
function getStreak(){
  const s=STORE.load("streak",{current:0,longest:0,lastDate:""});
  return (s&&typeof s==="object")?s:{current:0,longest:0,lastDate:""};
}
function updateStreak(){
  const s=getStreak(),t=todayStr();
  if(s.lastDate!==t){
    s.current=(s.lastDate===yesterStr())?(s.current||0)+1:1;
    s.longest=Math.max(s.longest||0,s.current);
    s.lastDate=t;STORE.save("streak",s);
  }
  return s;
}
function getWrong(){const w=STORE.load("wrong",{});return (w&&typeof w==="object"&&!Array.isArray(w))?w:{};}
/* 答错：按词聚合，记录错题类型 */
function recordWrong(id,kind){
  const w=getWrong();
  const it=Object.assign({count:0,streak:0,wrongTypes:[],lastWrongAt:0},w[id]||{});
  it.count++;it.streak=0;it.lastWrongAt=Date.now();
  if(it.wrongTypes.indexOf(kind)<0)it.wrongTypes.push(kind);
  w[id]=it;STORE.save("wrong",w);
}
/* 对错题本里的词答对：连续答对 2 次自动出库（真闭环），返回是否出库 */
function recordRightOnWrong(id){
  const w=getWrong(),it=w[id];
  if(!it)return false;
  it.streak=(it.streak||0)+1;
  if(it.streak>=2){
    delete w[id];
    STORE.save("wrong",w);   // 出库必须写回，否则刷新后错题"复活"
    const m=STORE.load("mastered",{});m[id]=Date.now();STORE.save("mastered",m);
    return true;
  }
  STORE.save("wrong",w);return false;
}
function getMastered(){const m=STORE.load("mastered",{});return (m&&typeof m==="object"&&!Array.isArray(m))?m:{};}
function getFavorites(){const f=STORE.load("favorites",[]);return Array.isArray(f)?f:[];}
function toggleFav(id){
  const f=getFavorites(),i=f.indexOf(id);
  if(i>=0)f.splice(i,1);else f.unshift(id);
  STORE.save("favorites",f);return i<0;
}
function getRecent(){const r=STORE.load("recent",[]);return Array.isArray(r)?r:[];}
function pushRecent(id){
  let r=getRecent().filter(x=>x!==id);r.unshift(id);r=r.slice(0,8);
  STORE.save("recent",r);
}
function getTotals(){
  const t=STORE.load("totals",{});
  return Object.assign({searched:0,answered:0,correct:0,levels:0,stars3:0,maxCombo:0,mastered:0},
    (t&&typeof t==="object"&&!Array.isArray(t))?t:{});
}
function bumpTotals(patch){
  const t=getTotals();
  for(const k in patch)t[k]=(t[k]||0)+(patch[k]||0);
  STORE.save("totals",t);return t;
}
function setTotalsMax(field,val){
  const t=getTotals();
  if(val>(t[field]||0)){t[field]=val;STORE.save("totals",t);}
}

/* ---------- 成就徽章（配置数组，便于扩充） ---------- */
const BADGES=[
 {id:"first3star",icon:"🌟",name:"第一次三星",desc:"第一次拿到三星通关",check:function(s){return s.stars3>=1;}},
 {id:"combo10",icon:"🔥",name:"连对十题",desc:"累计连对达到 10 题",check:function(s){return s.maxCombo>=10;}},
 {id:"search100",icon:"🔍",name:"查词百次",desc:"累计查词 100 次",check:function(s){return s.searches>=100;}},
 {id:"fav20",icon:"⭐",name:"收藏达人",desc:"收藏 20 个词语",check:function(s){return s.favs>=20;}},
 {id:"master10",icon:"🏅",name:"错题克星",desc:"掌握 10 个曾经出错的词",check:function(s){return s.mastered>=10;}},
 {id:"streak7",icon:"📅",name:"七日坚持",desc:"连续打卡 7 天",check:function(s){return s.streakLongest>=7;}},
 {id:"level10",icon:"🚀",name:"闯关小将",desc:"完成 10 个关卡",check:function(s){return s.levels>=10;}}
];
function getBadges(){const b=STORE.load("badges",[]);return Array.isArray(b)?b:[];}
function aggregateStats(){
  const t=getTotals();
  return {searches:t.searched||0,answered:t.answered||0,correct:t.correct||0,
    levels:t.levels||0,stars3:t.stars3||0,maxCombo:t.maxCombo||0,mastered:t.mastered||0,
    favs:getFavorites().length,streakLongest:getStreak().longest||0};
}
function checkBadges(){
  const s=aggregateStats(),have=getBadges(),newly=[];
  for(const b of BADGES){
    if(have.indexOf(b.id)<0){
      let ok=false;try{ok=b.check(s);}catch(e){}
      if(ok){have.push(b.id);newly.push(b);}
    }
  }
  if(newly.length)STORE.save("badges",have);
  return newly;
}

/* ---------- 统计与报告（P6：实时计算，不新增冗余存储） ---------- */
function weekStats(){
  const h=getHistory();let searched=0,answered=0,correct=0;
  for(let i=0;i<7;i++){
    const day=h[todayStr(new Date(Date.now()-i*86400000))];
    if(day){searched+=day.searched||0;answered+=day.answered||0;correct+=day.correct||0;}
  }
  return {searched:searched,answered:answered,correct:correct};
}
/* 薄弱词：错误次数 ≥2 且尚未出库 */
function weakWords(minCount){
  const w=getWrong(),arr=[];
  for(const id in w){
    if(w[id].count>=(minCount||2)){
      const e=DB_API.byId(id);
      if(e)arr.push({entry:e,count:w[id].count,lastWrongAt:w[id].lastWrongAt,types:w[id].wrongTypes});
    }
  }
  arr.sort((a,b)=>b.count-a.count||b.lastWrongAt-a.lastWrongAt);
  return arr;
}
function relTime(ts){
  if(!ts)return"";
  const days=Math.floor((Date.now()-ts)/86400000);
  if(days<=0)return"今天";
  if(days===1)return"昨天";
  return days+" 天前";
}
const KIND_NAME={syn:"近义",ant:"反义",odd:"异类",swap:"替换",fillSyn:"近义填写",fillAnt:"反义填写",learn:"自动学习"};
function parentReport(){
  const w=weekStats();
  if(!w.answered&&!w.searched)return"这周还没有学习记录。找个空闲，和孩子一起查几个词、玩一关闯关，就很棒。建议周末一起读一小段课文，找找里面的近义词。";
  let t="这周查了 "+w.searched+" 个词，做了 "+w.answered+" 道题";
  if(w.answered)t+="，正确率 "+Math.round(w.correct/w.answered*100)+"%";
  t+="。";
  const weak=weakWords(2).slice(0,2).map(x=>x.entry.word);
  if(weak.length)t+="还需要多练的是「"+weak.join("」「")+"」这一组。";
  t+="建议周末陪孩子读一段课文，一起找找里面的近义词。";
  return t;
}

/* =====================================================================
 * 五、出题引擎（P4：题目 = 词库 × 题型模板实时生成，R1-R8 硬性规则）
 *
 * 规则落地说明：
 * R1 正确答案必须来自该词的 synonyms（近义题）或 antonyms（反义题）。
 * R2 原文"干扰项不能是该词任何正确的近义词或反义词"按其本意（防止双正确
 *    答案）落地为：除正确答案外，任何选项不得属于该词的同类答案集合
 *    （近义题=其余近义词；反义题=其余反义词）。反义题用近义词作干扰项、
 *    近义题用反义词作干扰项，是 R3/R4 明确要求的测混淆点，予以保留。
 * R3 近义题干扰项优先取该词的 antonyms，其次同词性无关词。
 * R4 反义题干扰项优先取该词的 synonyms（最高频错因）。
 * R5 四个选项同词性。
 * R6 四个选项字数差 ≤2。
 * R7 同一关 5 题内不重复考同一个词。
 * R8 生成后全量校验：选项两两之间不能互为近义/反义（isRelated）。
 *    校验不过就重新生成，10 次失败换题换词，绝不放行不合格题目。
 * ===================================================================== */
const QUIZ_ENGINE=(()=>{
  function shuffle(arr){           // Fisher-Yates 洗牌
    const a=arr.slice();
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}
    return a;
  }
  function pickOne(arr){return arr[Math.floor(Math.random()*arr.length)];}
  function stemPool(level){        // F17：按年级筛选词库
    if(level===1)return WORD_DB.filter(e=>e.grade<=4);
    if(level===2)return WORD_DB.filter(e=>e.grade>=4&&e.grade<=6);
    return WORD_DB.filter(e=>e.grade>=5);
  }
  /* R6：字数差 ≤2 */
  function lenOk(words){
    let mn=99,mx=0;
    words.forEach(w=>{const n=w.length;mn=Math.min(mn,n);mx=Math.max(mx,n);});
    return mx-mn<=2;
  }
  /* 干扰项挑选：优先池（近义题=反义词；反义题=近义词）+ 同词性无关词 */
  function buildDistractors(stem,kind,answerWord,answerPos){
    const exclude=new Set([stem.word,answerWord]);
    const answerSet=(kind==="syn"?stem.synonyms:stem.antonyms).map(x=>x.word);
    answerSet.forEach(w=>{if(w!==answerWord)exclude.add(w);});   // R2：杜绝双正确答案
    const prefer=(kind==="syn"?stem.antonyms:stem.synonyms).map(x=>x.word)
      .filter(w=>!exclude.has(w)&&Math.abs(w.length-answerWord.length)<=2)
      .filter(w=>{const en=DB_API.byWord(w);return !en||en.pos===answerPos;});  // R5
    const general=WORD_DB
      .filter(e=>e.pos===answerPos&&e.word!==stem.word&&!exclude.has(e.word)
        &&Math.abs(e.word.length-answerWord.length)<=2
        &&!DB_API.relatedSet(stem).has(e.word))
      .map(e=>e.word);
    const picked=[],pool=shuffle(prefer).concat(shuffle(general));
    for(const w of pool){
      if(picked.length>=3)break;
      if(picked.indexOf(w)>=0)continue;
      let clash=false;
      for(const p of picked){const a=DB_API.byWord(w),b=DB_API.byWord(p);
        if(a&&b&&DB_API.isRelated(a,b)){clash=true;break;}}
      if(!clash)picked.push(w);
    }
    return picked.length===3?picked:null;
  }
  /* 生成后校验：R2/R5/R6/R8，返回失败规则名或 null */
  function validateOptions(stem,kind,answerWord,options){
    const answerSet=(kind==="syn"?stem.synonyms:stem.antonyms).map(x=>x.word);
    for(const w of options){                       // R2
      if(w!==answerWord&&answerSet.indexOf(w)>=0)return"R2";
    }
    const posSet={};let unknown=false;             // R5
    for(const w of options){
      const en=DB_API.byWord(w);
      if(en)posSet[en.pos]=1;else unknown=true;
    }
    if(!unknown&&Object.keys(posSet).length>1)return"R5";
    if(!lenOk(options))return"R6";                 // R6
    for(let i=0;i<options.length;i++)              // R8
      for(let j=i+1;j<options.length;j++){
        const a=DB_API.byWord(options[i]),b=DB_API.byWord(options[j]);
        if(a&&b&&DB_API.isRelated(a,b))return"R8";
      }
    return null;
  }
  /* 近义题 */
  function genSyn(stem){
    if(!stem.synonyms.length)return null;
    const withEntry=stem.synonyms.filter(s=>DB_API.byWord(s.word));
    const chosen=pickOne(withEntry.length?withEntry:stem.synonyms);
    const ansEntry=DB_API.byWord(chosen.word);
    const pos=ansEntry?ansEntry.pos:stem.pos;
    for(let t=0;t<10;t++){
      const ds=buildDistractors(stem,"syn",chosen.word,pos);
      if(!ds)continue;
      const options=shuffle([chosen.word].concat(ds));
      if(validateOptions(stem,"syn",chosen.word,options))continue;
      return {kind:"syn",wordId:stem.id,word:stem.word,pinyin:stem.pinyin,
        prompt:"下面哪个词是「"+stem.word+"」的近义词？",
        options:options,answerIndex:options.indexOf(chosen.word),
        explain:"「"+stem.word+"」和「"+chosen.word+"」是近义词。"+chosen.diff};
    }
    return null;
  }
  /* 反义题 */
  function genAnt(stem){
    if(!stem.antonyms.length)return null;
    const withEntry=stem.antonyms.filter(s=>DB_API.byWord(s.word));
    const chosen=pickOne(withEntry.length?withEntry:stem.antonyms);
    const ansEntry=DB_API.byWord(chosen.word);
    const pos=ansEntry?ansEntry.pos:stem.pos;
    for(let t=0;t<10;t++){
      const ds=buildDistractors(stem,"ant",chosen.word,pos);
      if(!ds)continue;
      const options=shuffle([chosen.word].concat(ds));
      if(validateOptions(stem,"ant",chosen.word,options))continue;
      return {kind:"ant",wordId:stem.id,word:stem.word,pinyin:stem.pinyin,
        prompt:"下面哪个词和「"+stem.word+"」意思相反？",
        options:options,answerIndex:options.indexOf(chosen.word),
        explain:"「"+stem.word+"」和「"+chosen.word+"」意思相反。"+chosen.diff};
    }
    return null;
  }
  /* 找异类题：3 个互为近义词 + 1 个无关词（无关词不能与组内任何词近义/反义） */
  function genOdd(stem){
    const synEntries=stem.synonyms.map(s=>DB_API.byWord(s.word)).filter(Boolean);
    const uniq=[],seen={};
    for(const s of synEntries){if(!seen[s.word]&&s.pos===stem.pos){seen[s.word]=1;uniq.push(s);}}
    if(uniq.length<2)return null;
    for(let t=0;t<10;t++){
      const g2=shuffle(uniq).slice(0,2);
      const group=[stem,g2[0],g2[1]];
      let bad=false;
      for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
        if(group[i].antonyms.some(a=>a.word===group[j].word))bad=true;
      }
      if(bad)continue;
      const cands=WORD_DB.filter(e=>
        e.pos===stem.pos&&
        group.every(g=>g.id!==e.id)&&
        group.every(g=>!DB_API.isRelated(g,e))&&
        Math.abs(e.word.length-stem.word.length)<=2);
      if(!cands.length)continue;
      const odd=pickOne(cands);
      const options=shuffle(group.map(g=>g.word).concat([odd.word]));
      if(!lenOk(options))continue;
      return {kind:"odd",wordId:stem.id,word:stem.word,pinyin:stem.pinyin,
        prompt:"下面哪个词和其他三个不是一类？（从意思上看）",
        options:options,answerIndex:options.indexOf(odd.word),
        explain:"「"+group.map(g=>g.word).join("」「")+"」是一组近义词，意思相近；而「"+odd.word+"」的意思是“"+odd.definition+"”，和它们不是一类。"};
    }
    return null;
  }
  /* 句中替换判断题（F14）：依据辨析库的 swap 标注出题；R7：跳过本关已用的词 */
  function genSwap(poolIds,usedIds){
    const keys=Object.keys(CONTRAST_DB).filter(function(k){return CONTRAST_DB[k].swap!==undefined;});
    const usable=keys.filter(function(k){
      const ids=k.split("|").map(function(w){const e=DB_API.byWord(w);return e?e.id:null;});
      if(usedIds&&ids.some(function(id){return id&&usedIds[id];}))return false;
      if(!poolIds)return true;
      return ids.some(function(id){return id&&poolIds.indexOf(id)>=0;});
    });
    const pool=usable.length?usable:keys.filter(function(k){
      const ids=k.split("|").map(function(w){const e=DB_API.byWord(w);return e?e.id:null;});
      return !(usedIds&&ids.some(function(id){return id&&usedIds[id];}));
    });
    if(!pool.length)return null;
    for(let t=0;t<10;t++){
      const key=pickOne(pool),pair=CONTRAST_DB[key];
      let names=key.split("|");
      if(Math.random()<0.5)names=[names[1],names[0]];   // 随机方向
      const A=DB_API.byWord(names[0]),B=DB_API.byWord(names[1]);
      if(!A||!B)continue;
      const ex=A.examples.filter(s=>s.indexOf(A.word)>=0)[0];
      if(!ex)continue;
      return {kind:"swap",wordId:A.id,word:A.word,pinyin:A.pinyin,
        sentence:ex,fromWord:A.word,toWord:B.word,
        prompt:"把句中的「"+A.word+"」换成「"+B.word+"」，句子的意思变了吗？",
        options:["意思基本不变","意思变了"],
        answerIndex:pair.swap?0:1,
        explain:pair.pitfall||(pair.scene&&pair.scene.why)||("「"+A.word+"」和「"+B.word+"」在这句话里不能随便互换。")};
    }
    return null;
  }
  /* 填写题：给出词语，用户手输近/反义词（判分见 checkFillAnswer） */
  function genFill(kind,stem){
    const list=kind==="fillSyn"?stem.synonyms:stem.antonyms;
    if(!list.length)return null;
    return {kind:kind,wordId:stem.id,word:stem.word,pinyin:stem.pinyin,
      prompt:kind==="fillSyn"
        ?("请写出一个「"+stem.word+"」的近义词")
        :("请写出一个「"+stem.word+"」的反义词"),
      answers:list.map(x=>x.word),
      explain:"「"+stem.word+"」的"+(kind==="fillSyn"?"近义词":"反义词")+"："
        +list.map(x=>x.word).join("、")+"。"+list[0].diff};
  }
  /* 填写判分：词库正向匹配；也接受"反向互认"（填的词的近/反义表里有题干词）。
     state: empty 没填 / self 填了题干本身 / ok 答对 / no 没对上 */
  function checkFillAnswer(stem,kind,input){
    const q=String(input==null?"":input).replace(/\s+/g,"");
    if(!q)return {state:"empty"};
    if(q===stem.word)return {state:"self"};
    const list=(kind==="fillSyn"?stem.synonyms:stem.antonyms);
    for(let i=0;i<list.length;i++){
      if(list[i].word===q)return {state:"ok",matched:q,reverse:false};
    }
    const en=DB_API.byWord(q);
    if(en){
      const refs=kind==="fillSyn"?en.synonyms:en.antonyms;
      for(let i=0;i<refs.length;i++){
        if(refs[i].word===stem.word)return {state:"ok",matched:q,reverse:true};
      }
    }
    return {state:"no"};
  }
  /* 自动学习卡：一词展示释义 + 全部近/反义词（不判分、不计入统计） */
  function genLearn(stem){
    if(!stem.synonyms.length&&!stem.antonyms.length)return null;
    return {kind:"learn",wordId:stem.id,word:stem.word,pinyin:stem.pinyin,
      definition:stem.definition,
      synWords:stem.synonyms.map(x=>x.word),
      antWords:stem.antonyms.map(x=>x.word),
      explain:stem.confuse||""};
  }
  function gen(kind,entry,poolIds,usedIds){
    if(kind==="syn")return genSyn(entry);
    if(kind==="ant")return genAnt(entry);
    if(kind==="odd")return genOdd(entry);
    if(kind==="swap")return genSwap(poolIds||null,usedIds||null);
    if(kind==="fillSyn"||kind==="fillAnt")return genFill(kind,entry);
    if(kind==="learn")return genLearn(entry);
    return null;
  }
  function eligible(kind,e){
    if(kind==="syn"||kind==="fillSyn")return e.synonyms.length>0;
    if(kind==="ant"||kind==="fillAnt")return e.antonyms.length>0;
    if(kind==="odd")return e.synonyms.filter(s=>DB_API.byWord(s.word)&&DB_API.byWord(s.word).pos===e.pos).length>=2;
    if(kind==="learn")return e.synonyms.length>0||e.antonyms.length>0;
    return true;
  }
  /* 生成一关（5 题 / 错题特训 / 单词特训），R7：关内词不重复 */
  function generateLevel(opts){
    opts=opts||{};
    const level=opts.level||1;
    let pool;
    if(opts.mode==="wrong"){
      const w=getWrong();
      pool=Object.keys(w).map(DB_API.byId).filter(Boolean).sort((a,b)=>w[b.id].count-w[a.id].count);
    }else if(opts.mode==="focus"||opts.mode==="focusFill"){
      pool=[DB_API.byId(opts.focusId)].filter(Boolean);
    }else{
      pool=stemPool(level);
    }
    const want=opts.mode==="focus"||opts.mode==="focusFill"?3:5;
    let kinds;
    if(opts.mode==="fill")kinds=shuffle(["fillSyn","fillAnt","fillSyn","fillAnt","fillSyn"]);
    else if(opts.mode==="auto")kinds=["learn","learn","learn","learn","learn"];
    else if(opts.mode==="focusFill")kinds=["fillSyn","fillAnt","fillSyn"];
    else kinds=shuffle(["syn","syn","ant","ant","odd","swap"]);
    const questions=[],used={};
    function tryKind(k){
      if(questions.length>=want)return;
      if(k==="swap"){
        const q=gen("swap",null,opts.mode?null:pool.map(x=>x.id),used);
        if(q){used[q.wordId]=1;questions.push(q);}
        return;
      }
      const order=shuffle(pool.filter(e=>!used[e.id]&&eligible(k,e)));
      for(const e of order){
        const q=gen(k,e,opts.mode?null:pool.map(x=>x.id),used);
        if(q){used[e.id]=1;questions.push(q);return;}
      }
    }
    kinds.forEach(tryKind);
    ["syn","ant","odd"].forEach(tryKind);   // 题型受限时兜底补足
    return questions;
  }
  /* 开发者自检（P4）：全词库 × 全题型生成并逐题校验，用 console.warn 打印不合格题
     注意：找异类题不用通用 R8（组内 3 词互为近义是题型定义），
     改查"无关词不能与组内任何词构成近义/反义/共享近义关系"。 */
  function selfTestQuiz(n){
    let genCount=0,fail=0;const log=[];
    WORD_DB.forEach(function(e){
      ["syn","ant","odd","fillSyn","fillAnt","learn"].forEach(function(kind){
        const q=gen(kind,e,null);
        if(!q)return;
        genCount++;
        let err;
        if(kind==="odd"){
          const odd=q.options[q.answerIndex];
          err=null;
          q.options.forEach(function(w){
            if(w===odd)return;
            const a=DB_API.byWord(w),b=DB_API.byWord(odd);
            if(a&&b&&DB_API.isRelated(a,b))err="R8-odd(无关词与组内相关)";
          });
        }else if(kind==="fillSyn"||kind==="fillAnt"){
          if(!q.answers.length||q.answers.indexOf(q.word)>=0)
            err="fill(参考答案为空或含题干)";
          else if(checkFillAnswer(e,kind,q.answers[0]).state!=="ok")
            err="fill(参考答案无法判分)";
        }else if(kind==="learn"){
          if((!q.synWords.length&&!q.antWords.length)
            ||q.synWords.indexOf(q.word)>=0||q.antWords.indexOf(q.word)>=0)
            err="learn(卡片内容为空或含题干)";
        }else{
          err=validateOptions(e,kind,q.options[q.answerIndex],q.options);
        }
        if(err){fail++;log.push(e.word+" ["+kind+"] "+err+"： "
          +(q.options?q.options.join(" / "):(q.answers||q.synWords||[]).join("、")));}
      });
    });
    let full=0,dup=0;
    for(let i=0;i<(n||60);i++){
      const qs=generateLevel({level:(i%3)+1,mode:"normal"});
      if(qs.length===5)full++;
      if(new Set(qs.map(q=>q.wordId)).size!==qs.length)dup++;
    }
    log.forEach(function(l){console.warn("[selfTest] 不合格题目:",l);});
    return {total:genCount,failed:fail,failures:log,levelsFull:full,levelsDup:dup};
  }
  return {shuffle:shuffle,stemPool:stemPool,gen:gen,eligible:eligible,
    validateOptions:validateOptions,checkFillAnswer:checkFillAnswer,
    generateLevel:generateLevel,selfTestQuiz:selfTestQuiz};
})();
