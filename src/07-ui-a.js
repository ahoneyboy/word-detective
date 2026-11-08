/* =====================================================================
 * 六、界面与交互（P2/P3：渲染一律用 createElement/textContent，防 XSS）
 * ===================================================================== */
const VIEWS=["search","contrast","quiz","browse","me"];
function $(sel,root){return (root||document).querySelector(sel);}
function el(tag,cls,text){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!=null)n.textContent=text;
  return n;
}
function colorPill(color){
  const map={"褒义":"biao","中性":"zhong","贬义":"bian"};
  return el("span","tagpill "+(map[color]||"zhong"),color);
}
function gradeLabel(g){
  if(g<=2)return"1-2 年级";
  if(g<=4)return"3-4 年级";
  if(g<=6)return"5-6 年级";
  return"7-9 年级";
}
function shortDiff(t){       // 推导行单元格截短（每格 ≤18 字）
  const s=String(t||"").split(/[，。；]/)[0];
  return s.length>18?s.slice(0,17)+"…":s;
}

/* ---------- Toast / Modal ---------- */
let toastTimer=null;
function toast(msg,ms){
  const t=$("#toast");t.textContent=msg;t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){t.classList.remove("show");},ms||2400);
}
function openModal(node,onClose){
  const root=$("#modal-root");root.textContent="";
  const ov=el("div","modal-overlay");
  const box=el("div","modal");
  box.appendChild(node);ov.appendChild(box);root.appendChild(ov);
  function close(){root.textContent="";if(onClose)onClose();}
  ov.addEventListener("click",function(e){if(e.target===ov)close();});
  return close;
}
function confirmModal(title,body,okText,onOk){
  const c=el("div");
  c.appendChild(el("h3",null,title));
  c.appendChild(el("p","muted",body));
  const act=el("div","modal-actions");
  const cancel=el("button","btn btn-plain","取消");
  const ok=el("button","btn btn-primary",okText||"确定");
  act.append(cancel,ok);c.appendChild(act);
  const close=openModal(c);
  cancel.addEventListener("click",close);
  ok.addEventListener("click",function(){close();onOk();});
}

/* ---------- 音效（WebAudio 合成，无音频文件、无网络） ---------- */
let actx=null;
function tone(freq,dur,type,gain){
  try{
    if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==="suspended")actx.resume().catch(function(){});
    const o=actx.createOscillator(),g=actx.createGain();
    o.type=type||"sine";o.frequency.value=freq;
    o.connect(g);g.connect(actx.destination);
    const t=actx.currentTime;
    g.gain.setValueAtTime(gain||0.04,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t);o.stop(t+dur+0.02);
  }catch(e){}
}
function playCorrect(){if(getSettings().sound){tone(660,0.09);setTimeout(function(){tone(880,0.14);},90);}}
function playWrong(){if(getSettings().sound)tone(196,0.2,"square",0.03);}
function playMaster(){if(getSettings().sound)[523,659,784].forEach(function(f,i){setTimeout(function(){tone(f,0.12);},i*110);});}

/* ---------- 应用状态 ---------- */
const S={
  view:"search", entry:null, navStack:[], query:"", results:[], selIndex:0,
  contrast:{a:null,b:null},
  quiz:null,
  browse:{pos:"",grade:"",tag:""}
};
function goView(v){
  if(location.hash==="#/"+v)route();else location.hash="#/"+v;
}

/* ---------- 哈希路由（浏览器后退可用） ---------- */
function route(){
  let h=location.hash.replace(/^#\/?/,"");
  if(VIEWS.indexOf(h)<0)h="search";
  S.view=h;
  document.querySelectorAll(".tab").forEach(function(t){t.classList.toggle("active",t.dataset.v===h);});
  document.querySelectorAll(".view").forEach(function(s){s.classList.remove("active");});
  $("#view-"+h).classList.add("active");
  VIEW_RENDER[h]();
  window.scrollTo(0,0);
}

/* =====================================================================
 * 查词视图（P2 精修：防抖 150ms、三种输入、高亮、面包屑、空状态）
 * ===================================================================== */
function renderSearch(){
  renderResults();
}
function renderResults(){
  const box=$("#search-results"),detail=$("#search-detail");
  box.textContent="";
  const q=DB_API.cleanQuery($("#search-input").value);
  S.query=q;
  if(!q){renderSearchHome(box);return;}
  const res=DB_API.search(q);
  S.results=res;S.selIndex=0;
  if(!res.length){
    const empty=el("div","empty");
    empty.appendChild(el("div","big","🤔"));
    empty.appendChild(el("div",null,"没找到「"+q+"」。"));
    empty.appendChild(el("div","muted","试试换个说法，或者按拼音找找看。"));
    const chips=el("div","reco-chips");
    DB_API.recommend(3).forEach(function(e){
      const c=el("button","chip",e.word);c.type="button";
      c.addEventListener("click",function(){openWord(e.word);});
      chips.appendChild(c);
    });
    empty.appendChild(chips);
    box.appendChild(empty);
    detail.textContent="";
    return;
  }
  res.slice(0,20).forEach(function(r,i){box.appendChild(resultItem(r,i));});
  if(res.length>20)box.appendChild(el("div","more-hint","还有 "+(res.length-20)+" 条结果，请补充关键词"));
  showDetail(res[0].e,false);       // 默认选中第一条（不计数）
}
function renderSearchHome(box){
  const detail=$("#search-detail");
  box.appendChild(el("div","sec-title","📅 今日一词"));
  const daily=DB_API.daily();
  const dbox=el("div","daily-box");
  const w=el("div","d-word",daily.word);
  w.style.cursor="pointer";
  w.addEventListener("click",function(){openWord(daily.word);});
  dbox.appendChild(w);
  dbox.appendChild(el("div","d-py",daily.pinyin));
  dbox.appendChild(el("div","muted",daily.definition));
  const more=el("button","btn btn-ghost btn-small","查看详情");
  more.style.marginTop="8px";more.type="button";
  more.addEventListener("click",function(){openWord(daily.word);});
  dbox.appendChild(more);
  box.appendChild(dbox);
  box.appendChild(el("div","sec-title","🕘 最近查过"));
  const rec=getRecent().map(DB_API.byId).filter(Boolean);
  if(!rec.length){
    box.appendChild(el("div","muted","还没搜过词呢，试试输入「高兴」，或者输入拼音 gaoxing。"));
  }else{
    const chips=el("div","reco-chips");
    rec.forEach(function(e){
      const c=el("button","chip",e.word);c.type="button";
      c.addEventListener("click",function(){openWord(e.word);});
      chips.appendChild(c);
    });
    box.appendChild(chips);
  }
  detail.textContent="";
  detail.appendChild(el("div","empty",null));
  const d=detail.firstChild;
  d.appendChild(el("div","big","🔎"));
  d.appendChild(el("div",null,"左边选一个词，这里会显示它的用法提示。"));
}
function markIn(parent,text,start,len){
  if(start==null||start<0||len<=0||start+len>text.length){parent.textContent=text;return;}
  parent.appendChild(document.createTextNode(text.slice(0,start)));
  const m=el("mark",null,text.slice(start,start+len));
  parent.appendChild(m);
  parent.appendChild(document.createTextNode(text.slice(start+len)));
}
function highlightPinyin(parent,e,start,len){
  const spans=DB_API.plainRangeToPinyin(e,start,len);
  if(!spans.length){parent.textContent=e.pinyin;return;}
  const syls=e.pinyin.split(/\s+/);
  syls.forEach(function(syl,i){
    if(i>0)parent.appendChild(document.createTextNode(" "));
    const sp=spans.filter(function(x){return x.i===i;})[0];
    if(sp&&sp.a===0&&sp.b===syl.length)parent.appendChild(el("mark",null,syl));
    else if(sp){markIn(parent,syl,sp.a,sp.b-sp.a);}
    else parent.appendChild(document.createTextNode(syl));
  });
}
function resultItem(r,i){
  const b=el("button","result-item"+(i===S.selIndex?" sel":""));
  b.type="button";
  const l1=el("div","result-line1");
  const w=el("span","result-word");
  if(r.field==="word")markIn(w,r.e.word,r.start,r.len);else w.textContent=r.e.word;
  const p=el("span","result-py");
  if(r.field==="plain")highlightPinyin(p,r.e,r.start,r.len);
  else if(r.field==="initials"){p.textContent=r.e.pinyin;}
  else p.textContent=r.e.pinyin;
  l1.append(w,p);
  b.appendChild(l1);
  const syns=r.e.synonyms.slice(0,3).map(function(s){return s.word;}).join(" / ");
  b.appendChild(el("span","result-syn",syns?("近义词："+syns):""));
  b.addEventListener("click",function(){selectResult(i,true);});
  return b;
}
function selectResult(i,countIt){
  S.selIndex=i;
  const items=$("#search-results").querySelectorAll(".result-item");
  items.forEach(function(n,j){n.classList.toggle("sel",j===i);});
  if(items[i])items[i].scrollIntoView({block:"nearest"});
  const r=S.results[i];
  if(r){
    if(countIt)openWord(r.e.word);
    else showDetail(r.e,false);
  }
}
/* 打开词条：维护 ≤5 层返回栈，计数并打卡徽章 */
function openWord(word,fromEntry){
  const e=DB_API.byWord(word);
  if(!e){renderNotFound(word,fromEntry);return;}
  if(S.entry&&S.entry.id!==e.id){
    S.navStack.push(S.entry);
    if(S.navStack.length>5)S.navStack.shift();
  }
  S.entry=e;
  bumpHistory("searched");bumpTotals({searched:1});pushRecent(e.id);
  checkBadges().forEach(function(b){toast(b.icon+" 解锁徽章： "+b.name);});
  showDetail(e,true);
}
function renderNotFound(word,fromEntry){
  const detail=$("#search-detail");detail.textContent="";
  const d=el("div","empty");
  d.appendChild(el("div","big","🧐"));
  d.appendChild(el("div",null,"词库里还没有「"+word+"」。"));
  if(fromEntry&&fromEntry.synonyms.length){
    d.appendChild(el("div","muted","先看看和它相近的词："));
    const chips=el("div","reco-chips");
    fromEntry.synonyms.forEach(function(s){
      const c=el("button","chip",s.word);c.type="button";
      c.addEventListener("click",function(){openWord(s.word,fromEntry);});
      chips.appendChild(c);
    });
    d.appendChild(chips);
  }
  detail.appendChild(d);
}
function pillItem(word,diff,type,fromEntry){
  const b=el("button","pillitem"+(type==="ant"?" ant":""));
  b.type="button";
  b.appendChild(el("span","pill-word",word));
  if(diff)b.appendChild(el("span","pill-diff",diff));
  b.addEventListener("click",function(){openWord(word,fromEntry);});
  return b;
}
function showDetail(entry,refreshList){
  if(refreshList){/* 由 openWord 调用时同步列表选中态 */}
  const detail=$("#search-detail");detail.textContent="";
  detail.appendChild(buildDetail(entry));
}
function buildDetail(entry){
  const c=el("div","detail");
  if(S.navStack.length){
    const back=el("button","backlink");
    back.type="button";
    const prev=S.navStack[S.navStack.length-1];
    back.appendChild(el("span",null,"← 返回 "+prev.word));
    back.addEventListener("click",function(){
      const p=S.navStack.pop();
      if(p){S.entry=p;showDetail(p,false);}
    });
    c.appendChild(back);
  }
  const top=el("div","d-top");
  const wwrap=el("div");
  wwrap.appendChild(el("div","d-word",entry.word));
  wwrap.appendChild(el("div","d-py",entry.pinyin));
  top.appendChild(wwrap);
  const isFav=getFavorites().indexOf(entry.id)>=0;
  const star=el("button","star-btn"+(isFav?" on":""));
  star.type="button";
  const ico=el("span","star-ico",isFav?"★":"☆");
  const lbl=el("span",null,isFav?"已收藏":"收藏");
  star.append(ico,lbl);
  star.addEventListener("click",function(){
    const on=toggleFav(entry.id);
    star.classList.toggle("on",on);
    ico.textContent=on?"★":"☆";lbl.textContent=on?"已收藏":"收藏";
    toast(on?("已把「"+entry.word+"」收进生词本"):("已从生词本移出「"+entry.word+"」"));
    checkBadges().forEach(function(b){toast(b.icon+" 解锁徽章： "+b.name);});
    if(S.view==="me")renderMe();
  });
  top.appendChild(star);
  c.appendChild(top);
  const meta=el("div","d-meta");
  meta.appendChild(el("span","meta-chip",entry.pos));
  meta.appendChild(el("span","meta-chip",gradeLabel(entry.grade)));
  meta.appendChild(colorPill(entry.color));
  c.appendChild(meta);
  c.appendChild(el("div","d-def",entry.definition));
  if(entry.synonyms.length){
    c.appendChild(el("div","sec-title","近义词"));
    const row=el("div","pillrow");
    entry.synonyms.forEach(function(s){row.appendChild(pillItem(s.word,s.diff,"syn",entry));});
    c.appendChild(row);
  }
  if(entry.antonyms.length){
    c.appendChild(el("div","sec-title","反义词"));
    const row=el("div","pillrow");
    entry.antonyms.forEach(function(s){row.appendChild(pillItem(s.word,s.diff,"ant",entry));});
    c.appendChild(row);
  }
  if(entry.examples.length){
    c.appendChild(el("div","sec-title","例句"));
    const ul=el("ul","ex-list");
    entry.examples.forEach(function(t,i){
      const li=el("li");
      li.appendChild(el("span","ex-num",i===0?"①":"②"));
      li.appendChild(document.createTextNode(t));
      ul.appendChild(li);
    });
    c.appendChild(ul);
  }
  if(entry.confuse){
    const box=el("div","confuse-box");
    box.appendChild(el("span",null,"⚠ 最容易错的地方："));
    box.appendChild(el("span",null,entry.confuse));
    c.appendChild(box);
  }
  const target=entry.contrast.length?DB_API.byWord(entry.contrast[0])
    :(entry.synonyms.length?DB_API.byWord(entry.synonyms[0].word):null);
  const row=el("div","next-row");
  if(target){
    const btn=el("button","btn btn-ghost btn-small","⚖️ 对比辨析");
    btn.type="button";
    btn.addEventListener("click",function(){
      S.contrast={a:entry,b:target};
      goView("contrast");
    });
    row.appendChild(btn);
  }
  const quizBtn=el("button","btn btn-ghost btn-small","✍️ 考考我");
  quizBtn.type="button";
  quizBtn.title="当场写一写这个词的近义词、反义词";
  quizBtn.addEventListener("click",function(){
    S.quiz=null;
    startLevel({mode:"focusFill",focusId:entry.id});
    goView("quiz");
  });
  row.appendChild(quizBtn);
  if(target||true)c.appendChild(row);
  return c;
}
/* 搜索框事件：防抖 150ms + 上下键 + 回车 */
function bindSearchInput(){
  const input=$("#search-input");
  let timer=null;
  input.addEventListener("input",function(){
    clearTimeout(timer);
    timer=setTimeout(renderResults,150);
  });
  input.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown"){e.preventDefault();if(S.results.length)selectResult((S.selIndex+1)%Math.min(S.results.length,20),false);}
    else if(e.key==="ArrowUp"){e.preventDefault();if(S.results.length)selectResult((S.selIndex-1+Math.min(S.results.length,20))%Math.min(S.results.length,20),false);}
    else if(e.key==="Enter"){
      e.preventDefault();
      if(S.results[S.selIndex])openWord(S.results[S.selIndex].e.word);
    }
  });
}

/* =====================================================================
 * 辨析视图（P3 精修：五维对比 + 同场景例句 + 交换 A/B）
 * ===================================================================== */
function contrastPairKey(a,b){
  return CONTRAST_DB[a.word+"|"+b.word]?a.word+"|"+b.word
    :(CONTRAST_DB[b.word+"|"+a.word]?b.word+"|"+a.word:null);
}
function buildContrast(a,b){
  const key=contrastPairKey(a,b);
  const pair=key?CONTRAST_DB[key]:null;
  const dims={weight:null,scope:null,color:null,coll:null,pos:null};
  if(a.color!==b.color)dims.color=["「"+a.word+"」是"+a.color+"词","「"+b.word+"」是"+b.color+"词"];
  if(a.pos!==b.pos)dims.pos=["「"+a.word+"」是"+a.pos,"「"+b.word+"」是"+b.pos];
  if(pair){
    for(const k in pair.rows)dims[k]=pair.rows[k];
  }else{
    /* 数据不足时从 diff 文本推导（诚实标注，不编造） */
    const diffOf=function(stem,other){
      const s=stem.synonyms.filter(function(x){return x.word===other.word;})[0];
      return s?s.diff:"";
    };
    const ta=diffOf(a,b),tb=diffOf(b,a);
    if(/更(重|深|强|大|高)|最重|轻一?些|程度/.test(ta)||/更(重|深|强|大|高)|最重|轻一?些|程度/.test(tb))
      dims.weight=[ta?shortDiff(ta):"—",tb?shortDiff(tb):"—"];
    if(/多(形容|指|用于|说)|一般(说|指)|场合|范围|书面|口语/.test(ta)||/多(形容|指|用于|说)|一般(说|指)|场合|范围|书面|口语/.test(tb))
      dims.scope=[ta?shortDiff(ta):"—",tb?shortDiff(tb):"—"];
    if(/搭配|常说|可以说|固定|连用/.test(ta)||/搭配|常说|可以说|固定|连用/.test(tb))
      dims.coll=[ta?shortDiff(ta):"—",tb?shortDiff(tb):"—"];
  }
  return {a:a,b:b,dims:dims,scene:pair?pair.scene:null,
    pitfall:pair?pair.pitfall:(a.confuse||b.confuse||""),curated:!!pair,swap:pair?pair.swap:undefined};
}
function pickerSlot(label,get,set){
  const wrap=el("div","picker");
  const input=el("input");
  input.type="text";input.placeholder="输入 "+label+" 词（如 寂静）";
  input.setAttribute("aria-label","选择 "+label+" 词");
  const e=get();
  if(e)input.value=e.word;
  const list=el("div","picker-list");
  list.style.display="none";
  function refresh(){
    const q=DB_API.cleanQuery(input.value);
    list.textContent="";
    if(!q){list.style.display="none";return;}
    DB_API.search(q).slice(0,8).forEach(function(r){
      const b=el("button",null,r.e.word+"　"+r.e.pinyin);
      b.type="button";
      b.addEventListener("mousedown",function(ev){ev.preventDefault();set(r.e);list.style.display="none";renderContrast();});
      list.appendChild(b);
    });
    list.style.display=list.childNodes.length?"block":"none";
  }
  input.addEventListener("input",refresh);
  input.addEventListener("focus",refresh);
  input.addEventListener("blur",function(){setTimeout(function(){list.style.display="none";},150);});
  input.addEventListener("keydown",function(ev){
    if(ev.key==="Enter"&&list.firstChild){ev.preventDefault();list.firstChild.dispatchEvent(new Event("mousedown"));}
  });
  wrap.append(input,list);
  return wrap;
}
function vsWordBlock(e){
  const w=el("div","vs-word");
  w.appendChild(el("div","w",e?e.word:"—"));
  w.appendChild(el("div","py",e?e.pinyin:""));
  if(e)w.appendChild(colorPill(e.color));
  return w;
}
function renderContrast(){
  const v=$("#view-contrast");v.textContent="";
  const wrap=el("div","contrast-wrap");
  wrap.appendChild(el("div","view-title","⚖️ 近义词辨析"));
  const sel=el("div","card vs-select");
  sel.appendChild(pickerSlot("A",function(){return S.contrast.a;},function(e){S.contrast.a=e;}));
  sel.appendChild(el("div","vs-badge","VS"));
  sel.appendChild(pickerSlot("B",function(){return S.contrast.b;},function(e){S.contrast.b=e;}));
  const swapBtn=el("button","btn btn-plain btn-small","⇄ 交换 A/B");
  swapBtn.type="button";
  swapBtn.addEventListener("click",function(){
    const t=S.contrast.a;S.contrast.a=S.contrast.b;S.contrast.b=t;renderContrast();
  });
  sel.appendChild(swapBtn);
  wrap.appendChild(sel);
  const rec=el("div","chiprow");
  rec.style.marginBottom="14px";
  rec.appendChild(el("span","muted"," 高频易混： "));
  Object.keys(CONTRAST_DB).slice(0,6).forEach(function(k){
    const names=k.split("|");
    const c=el("button","chip",names[0]+" vs "+names[1]);c.type="button";
    c.addEventListener("click",function(){
      S.contrast={a:DB_API.byWord(names[0]),b:DB_API.byWord(names[1])};renderContrast();
    });
    rec.appendChild(c);
  });
  wrap.appendChild(rec);
  if(S.contrast.a&&S.contrast.b){
    wrap.appendChild(renderContrastResult(buildContrast(S.contrast.a,S.contrast.b)));
  }else{
    const hint=el("div","card empty");
    hint.appendChild(el("div","big","⚖️"));
    hint.appendChild(el("div",null,"选两个词，看看它们到底差在哪。"));
    wrap.appendChild(hint);
  }
  v.appendChild(wrap);
}
function renderContrastResult(ct){
  const card=el("div","card");
  const head=el("div","vs-head");
  head.append(vsWordBlock(ct.a),el("div","vs-badge","VS"),vsWordBlock(ct.b));
  card.appendChild(head);
  const rows=[["weight","语义轻重"],["scope","使用范围"],["color","感情色彩"],["coll","搭配习惯"],["pos","词性差异"]];
  const present=rows.filter(function(r){return ct.dims[r[0]];});
  if(!present.length){
    const b=el("div","same-banner");
    b.textContent="这两个词基本可以互换，只有细微的语感差别。";
    card.appendChild(b);
    const tips=el("div","scene-box");
    tips.appendChild(el("div","scene-ctx","各自要点"));
    [ct.a,ct.b].forEach(function(e){
      e.synonyms.forEach(function(s){
        if(s.word===(e===ct.a?ct.b.word:ct.a.word)&&s.diff)
          tips.appendChild(el("div","scene-line","· "+s.diff));
      });
    });
    card.appendChild(tips);
  }else{
    const t=el("table","ct-table");
    const thead=el("thead"),trh=el("tr");
    ["维度",ct.a.word,ct.b.word].forEach(function(h,i){
      trh.appendChild(el(i===0?"th":"th",null,h));
    });
    thead.appendChild(trh);t.appendChild(thead);
    const tbody=el("tbody");
    present.forEach(function(r){
      const tr=el("tr");
      tr.appendChild(el("th",null,r[1]));
      tr.appendChild(el("td",null,ct.dims[r[0]][0]));
      tr.appendChild(el("td",null,ct.dims[r[0]][1]));
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);card.appendChild(t);
    if(!ct.curated)card.appendChild(el("div","muted","以上差异由词库标注推导；其余维度差异不明显或数据还不完整。"));
  }
  if(ct.scene){
    const box=el("div","scene-box");
    box.appendChild(el("div","scene-ctx","同一个场景（"+ct.scene.ctx+"），两种说法："));
    const l1=el("div","scene-line");l1.appendChild(el("span","ex-num","①"));
    markIn(l1,ct.scene.a,ct.scene.a.indexOf(ct.a.word),ct.a.word.length);
    box.appendChild(l1);
    const l2=el("div","scene-line");l2.appendChild(el("span","ex-num","②"));
    markIn(l2,ct.scene.b,ct.scene.b.indexOf(ct.b.word),ct.b.word.length);
    box.appendChild(l2);
    const con=el("div","scene-conclusion");
    con.textContent=(ct.scene.better?("这个场景更适合用「"+ct.scene.better+"」，因为"):"为什么")+ct.scene.why;
    box.appendChild(con);
    card.appendChild(box);
  }else{
    const box=el("div","scene-box");
    box.appendChild(el("div","scene-ctx","例句对照（词库里还没有为这对词写同场景例句）："));
    [ct.a,ct.b].forEach(function(e,i){
      if(!e.examples.length)return;
      const line=el("div","scene-line");
      line.appendChild(el("span","ex-num",i===0?"①":"②"));
      markIn(line,e.examples[0],e.examples[0].indexOf(e.word),e.word.length);
      box.appendChild(line);
    });
    card.appendChild(box);
  }
  if(ct.pitfall){
    const box=el("div","confuse-box");
    box.appendChild(el("span",null,"⚠ 最容易错的地方："));
    box.appendChild(el("span",null,ct.pitfall));
    card.appendChild(box);
  }
  return card;
}
