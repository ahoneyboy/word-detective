/* =====================================================================
 * 闯关视图（P4 精修：即时反馈、连击、星级、错题特训）
 * ===================================================================== */
function renderQuiz(){
  const v=$("#view-quiz");v.textContent="";
  const wrap=el("div","quiz-wrap");
  wrap.appendChild(el("div","view-title","🎯 词语闯关"));
  if(!S.quiz)wrap.appendChild(quizStartPanel());
  else if(S.quiz.stage==="playing")
    wrap.appendChild(S.quiz.mode==="auto"?quizAutoPanel():quizQuestionPanel());
  else wrap.appendChild(quizSettlementPanel());
  v.appendChild(wrap);
}
function levelChips(){
  const row=el("div","mode-row");
  [[1,"简单 · 3-4年级"],[2,"进阶 · 4-6年级"],[3,"挑战 · 5年级以上"]].forEach(function(lv){
    const c=el("button","chip"+(getSettings().level===lv[0]?" on":""),lv[1]);
    c.type="button";
    c.addEventListener("click",function(){
      const s=getSettings();s.level=lv[0];saveSettings(s);renderQuiz();
    });
    row.appendChild(c);
  });
  return row;
}
function answerModeChips(){
  const row=el("div","mode-row");
  const cur=getSettings().answerMode||"choice";
  [["choice","🔘 选项作答","四个选项点一个"],
   ["fill","✍️ 填写作答","自己写出近/反义词，系统判分"],
   ["auto","👀 自动看答案","逐词自动展示答案，适合背诵"]].forEach(function(m){
    const c=el("button","chip"+(cur===m[0]?" on":""),m[1]);
    c.type="button";c.title=m[2];
    c.addEventListener("click",function(){
      const s=getSettings();s.answerMode=m[0];saveSettings(s);renderQuiz();
    });
    row.appendChild(c);
  });
  return row;
}
function countChips(){
  const row=el("div","mode-row");
  const cur=getSettings().qCount||5;
  [3,5,10,15,20].forEach(function(n){
    const c=el("button","chip"+(cur===n?" on":""),n+" 题");
    c.type="button";
    c.addEventListener("click",function(){
      const s=getSettings();s.qCount=n;saveSettings(s);renderQuiz();
    });
    row.appendChild(c);
  });
  return row;
}
function quizStartPanel(){
  const qn=getSettings().qCount||5;
  const card=el("div","card");
  card.appendChild(el("div",null,"每关 "+qn+" 题，答完立刻知道对不对。答错的词会自动收进错题本，连续答对 2 次就算掌握。"));
  card.appendChild(el("div","sec-title","题目数量"));
  card.appendChild(countChips());
  card.appendChild(el("div","sec-title","选择难度"));
  card.appendChild(levelChips());
  card.appendChild(el("div","sec-title","答题方式"));
  card.appendChild(answerModeChips());
  card.appendChild(el("div","sec-title","选择模式"));
  const row=el("div","mode-row");
  const normal=el("button","chip on","普通闯关");
  normal.type="button";
  row.appendChild(normal);
  const wn=Object.keys(getWrong()).length;
  if(wn>0){
    const wrong=el("button","chip","🩹 错题特训（"+wn+" 个词待巩固）");
    wrong.type="button";
    wrong.addEventListener("click",function(){startLevel({mode:"wrong"});});
    row.appendChild(wrong);
  }else{
    const wrong=el("button","chip","🩹 错题特训");
    wrong.type="button";wrong.disabled=true;
    wrong.title="错题本还是空的，真棒！";
    row.appendChild(wrong);
  }
  card.appendChild(row);
  card.appendChild(el("div","muted","错题特训使用选项作答；填写与自动模式在普通闯关中生效。"));
  const today=getHistory()[todayStr()]||{};
  card.appendChild(el("div","muted","今天已练 "+(today.answered||0)+" 题 · 已连击打卡 "+(getStreak().current||0)+" 天"));
  const row2=el("div","next-row-center");
  const go=el("button","btn btn-primary","🚀 开始闯关");
  go.type="button";
  go.addEventListener("click",function(){
    const am=getSettings().answerMode||"choice";
    startLevel({mode:am==="choice"?"normal":am});
  });
  row2.appendChild(go);card.appendChild(row2);
  return card;
}
function startLevel(opts){
  const isFocus=opts.mode==="focus"||opts.mode==="focusFill";
  const count=isFocus?3:(getSettings().qCount||5);   /* 单词/错题特训固定短关，其余用设置题量 */
  const questions=QUIZ_ENGINE.generateLevel(Object.assign({count:count},opts));
  if(!questions.length){
    toast("这一关暂时组不出题目，换个难度试试");
    return;
  }
  S.quiz={stage:"playing",mode:opts.mode||"normal",level:getSettings().level,focusId:opts.focusId||null,
    questions:questions,index:0,combo:0,maxCombo:0,correct:0,wrongList:[],locked:false,timer:null,revealed:false,paused:false};
  renderQuiz();
}
function quizQuestionPanel(){
  const q=S.quiz.questions[S.quiz.index];
  const card=el("div","card");
  const top=el("div","quiz-top");
  top.appendChild(el("span",null,"第 "+(S.quiz.index+1)+"/"+S.quiz.questions.length+" 题"));
  const prog=el("div","qprog");
  const fill=el("div","qprog-fill");
  fill.style.width=(S.quiz.index/S.quiz.questions.length*100)+"%";
  prog.appendChild(fill);top.appendChild(prog);
  if(S.quiz.combo>=2){
    const cb=el("span","qcombo"+(S.quiz.combo>=3?" hot":""),"连对 "+S.quiz.combo+"!");
    top.appendChild(cb);
  }
  const quit=el("button","btn btn-plain btn-small","退出本关");
  quit.type="button";
  quit.addEventListener("click",function(){
    clearTimeout(S.quiz.timer);S.quiz=null;renderQuiz();
  });
  top.appendChild(quit);
  card.appendChild(top);
  card.appendChild(el("div","q-prompt",q.prompt));
  if(q.kind==="swap"){
    const sbox=el("div","q-sentence");
    markIn(sbox,q.sentence,q.sentence.indexOf(q.fromWord),q.fromWord.length);
    card.appendChild(sbox);
  }
  const isFill=q.kind==="fillSyn"||q.kind==="fillAnt";
  if(isFill){
    card.appendChild(el("div","muted","写完点「提交」，实在想不出来可以点「看答案」。"));
    const frow=el("div","fill-row");
    const inp=el("input","fill-input");
    inp.type="text";inp.placeholder="在这里输入一个词";
    inp.setAttribute("aria-label","填写答案");
    inp.autocomplete="off";inp.spellcheck=false;
    const submit=el("button","btn btn-primary","提交");
    const peek=el("button","btn btn-plain","看答案");
    submit.type="button";peek.type="button";
    frow.append(inp,submit,peek);
    card.appendChild(frow);
    const fb=el("div");
    card.appendChild(fb);
    const next=el("div","next-row-center");
    const nb=el("button","btn btn-primary","下一题 →");
    nb.type="button";nb.style.display="none";
    nb.addEventListener("click",function(){clearTimeout(S.quiz.timer);nextQuestion();});
    next.appendChild(nb);card.appendChild(next);
    S.quiz.nodes={fb:fb,nb:nb,fillInput:inp,fillSubmit:submit,fillPeek:peek,fill:isFill};
    submit.addEventListener("click",function(){judgeFill(false);});
    peek.addEventListener("click",function(){judgeFill(true);});
    inp.addEventListener("keydown",function(ev){
      if(ev.isComposing)return;
      if(ev.key==="Enter"){ev.preventDefault();judgeFill(false);}
    });
    setTimeout(function(){inp.focus();},50);
    return card;
  }
  const grid=el("div","optgrid");
  q.options.forEach(function(w,i){
    const b=el("button","opt",w);
    b.type="button";
    b.addEventListener("click",function(){judge(i);});
    grid.appendChild(b);
  });
  card.appendChild(grid);
  const fb=el("div");
  card.appendChild(fb);
  const next=el("div","next-row-center");
  const nb=el("button","btn btn-primary","下一题 →");
  nb.type="button";nb.style.display="none";
  nb.addEventListener("click",function(){clearTimeout(S.quiz.timer);nextQuestion();});
  next.appendChild(nb);card.appendChild(next);
  S.quiz.nodes={grid:grid,fb:fb,nb:nb,fill:false};
  return card;
}
/* 填写题判分：支持"看答案"（记入错题本，之后接着练） */
function judgeFill(peeked){
  const qz=S.quiz;
  if(!qz||qz.locked||qz.stage!=="playing")return;
  const q=qz.questions[qz.index];
  let res;
  if(peeked){
    res={state:"peek"};
  }else{
    const entry=DB_API.byId(q.wordId);   /* checkFillAnswer 需要词条对象 */
    res=QUIZ_ENGINE.checkFillAnswer(entry,q.kind,qz.nodes.fillInput.value);
    if(res.state==="empty"){toast("先写一个词再提交哦");return;}
    if(res.state==="self"){
      const fb0=qz.nodes.fb;fb0.textContent="";
      const hint=el("div","fb fb-no");
      hint.appendChild(el("div","fb-title","「"+q.word+"」就是题目本身，换一个意思相近或相反的词试试。"));
      fb0.appendChild(hint);
      return;
    }
  }
  qz.locked=true;
  qz.nodes.fillInput.disabled=true;
  qz.nodes.fillSubmit.disabled=true;
  qz.nodes.fillPeek.disabled=true;
  const prog=document.querySelector("#view-quiz .qprog-fill");
  if(prog)prog.style.width=((qz.index+1)/qz.questions.length*100)+"%";
  const fb=qz.nodes.fb;
  fb.textContent="";
  let mastered=false;
  if(res.state==="ok"){
    qz.combo++;qz.maxCombo=Math.max(qz.maxCombo,qz.combo);qz.correct++;
    bumpTotals({answered:1,correct:1});bumpHistory("answered");bumpHistory("correct");
    mastered=recordRightOnWrong(q.wordId);
    const box=el("div","fb fb-ok");
    box.appendChild(el("div","fb-title","答对了！🎉"+(qz.combo>=2?("（连对 "+qz.combo+" 题）"):"")));
    box.appendChild(el("div","fb-body",q.explain));
    fb.appendChild(box);
    playCorrect();
    if(mastered){
      playMaster();
      toast("🎉 「"+q.word+"」连续答对 2 次，已从错题本出库！");
      bumpTotals({mastered:1});
    }
  }else{
    qz.combo=0;
    bumpTotals({answered:1});bumpHistory("answered");
    recordWrong(q.wordId,q.kind);
    qz.wrongList.push({word:q.word,answer:q.answers[0],explain:q.explain});
    const box=el("div","fb fb-no");
    box.appendChild(el("div","fb-title",peeked?"没关系，先记住它们：":"再看看参考答案："));
    box.appendChild(el("div","fb-body",q.explain));
    fb.appendChild(box);
    if(!peeked)playWrong();
  }
  updateStreak();
  checkBadges().forEach(function(b){toast(b.icon+" 解锁徽章： "+b.name);});
  qz.nodes.nb.style.display="inline-flex";
  qz.timer=setTimeout(function(){
    if(S.quiz&&S.quiz.stage==="playing"&&S.quiz.mode!=="auto")nextQuestion();
  },res.state==="ok"?1200:2500);
}
function judge(i){
  const qz=S.quiz;
  if(!qz||qz.locked||qz.stage!=="playing")return;
  qz.locked=true;
  const q=qz.questions[qz.index];
  const ok=i===q.answerIndex;
  const btns=qz.nodes.grid.querySelectorAll(".opt");
  btns.forEach(function(b,j){
    b.disabled=true;
    if(j===q.answerIndex){
      b.classList.add(j===i?"ok":"reveal");
      if(j!==i)b.appendChild(el("span","ansmark","✓ 正确答案"));
    }else if(j===i){
      b.classList.add("bad");
    }else{
      b.classList.add("dim");
    }
  });
  qz.nodes.fill.style.width=((qz.index+1)/qz.questions.length*100)+"%";
  const fb=qz.nodes.fb;
  fb.textContent="";
  let mastered=false;
  if(ok){
    qz.combo++;qz.maxCombo=Math.max(qz.maxCombo,qz.combo);qz.correct++;
    bumpTotals({answered:1,correct:1});bumpHistory("answered");bumpHistory("correct");
    mastered=recordRightOnWrong(q.wordId);
    const box=el("div","fb fb-ok");
    box.appendChild(el("div","fb-title","答对了！🎉"+(qz.combo>=2?("（连对 "+qz.combo+" 题）"):"")));
    box.appendChild(el("div","fb-body",q.explain));
    fb.appendChild(box);
    playCorrect();
    if(mastered){
      playMaster();
      toast("🎉 「"+q.word+"」连续答对 2 次，已从错题本出库！");
      bumpTotals({mastered:1});
    }
  }else{
    qz.combo=0;
    bumpTotals({answered:1});bumpHistory("answered");
    recordWrong(q.wordId,q.kind);
    qz.wrongList.push({word:q.word,answer:q.options[q.answerIndex],explain:q.explain});
    const box=el("div","fb fb-no");
    box.appendChild(el("div","fb-title","这一次没答对，看看正确的词："));
    box.appendChild(el("div","fb-body",q.explain));
    fb.appendChild(box);
    playWrong();
  }
  updateStreak();
  checkBadges().forEach(function(b){toast(b.icon+" 解锁徽章： "+b.name);});
  qz.nodes.nb.style.display="inline-flex";
  qz.timer=setTimeout(function(){
    if(S.quiz&&S.quiz.stage==="playing")nextQuestion();
  },ok?1200:2500);
}
function nextQuestion(){
  const qz=S.quiz;
  clearTimeout(qz.timer);
  qz.index++;qz.locked=false;
  if(qz.index>=qz.questions.length){
    qz.stage="settle";
    bumpTotals({levels:1});
    const stars=starCount(qz.correct,qz.questions.length);
    if(stars===3)bumpTotals({stars3:1});
    setTotalsMax("maxCombo",qz.maxCombo);
    checkBadges().forEach(function(b){toast(b.icon+" 解锁徽章： "+b.name);});
  }
  renderQuiz();
}
function starCount(c,total){   /* 星级按正确率：全对3星、≥80%两星、≥60%一星 */
  const r=c/total;
  return r>=1?3:r>=0.8?2:r>=0.6?1:0;
}
/* 自动学习模式：逐词自动展示答案，可暂停/翻页，不计入统计 */
function quizAutoPanel(){
  const qz=S.quiz;
  const q=qz.questions[qz.index];
  const card=el("div","card");
  const top=el("div","quiz-top");
  top.appendChild(el("span",null,"第 "+(qz.index+1)+"/"+qz.questions.length+" 词 · 自动模式"));
  const prog=el("div","qprog");
  const fill=el("div","qprog-fill");
  fill.style.width=(qz.index/qz.questions.length*100)+"%";
  prog.appendChild(fill);top.appendChild(prog);
  const quit=el("button","btn btn-plain btn-small","退出");
  quit.type="button";
  quit.addEventListener("click",function(){
    clearTimeout(qz.timer);clearTimeout(qz.timer2);S.quiz=null;renderQuiz();
  });
  top.appendChild(quit);
  card.appendChild(top);
  const wbox=el("div","auto-word");
  wbox.appendChild(el("div","d-word",q.word));
  wbox.appendChild(el("div","d-py",q.pinyin));
  wbox.appendChild(el("div","muted",q.definition));
  card.appendChild(wbox);
  const ans=el("div","auto-answer"+(qz.revealed?" revealed":""));
  if(q.synWords.length){
    const l1=el("div",null);
    l1.appendChild(el("span","ex-num","近义词 "));
    l1.appendChild(document.createTextNode(q.synWords.join("、")));
    ans.appendChild(l1);
  }
  if(q.antWords.length){
    const l2=el("div",null);
    l2.appendChild(el("span","ex-num","反义词 "));
    l2.appendChild(document.createTextNode(q.antWords.join("、")));
    ans.appendChild(l2);
  }
  if(q.explain)ans.appendChild(el("div","muted","⚠ "+q.explain));
  ans.appendChild(el("div","muted","本模式只看不练，不计入统计。"));
  card.appendChild(ans);
  const ctrl=el("div","auto-controls");
  const prev=el("button","btn btn-plain btn-small","‹ 上一个");
  const pause=el("button","btn btn-ghost btn-small",qz.paused?"▶ 继续":"⏸ 暂停");
  const next=el("button","btn btn-primary btn-small","下一个 ›");
  prev.type="button";pause.type="button";next.type="button";
  prev.addEventListener("click",function(){
    clearTimeout(qz.timer);clearTimeout(qz.timer2);
    qz.index=(qz.index-1+qz.questions.length)%qz.questions.length;
    qz.revealed=true;qz.paused=true;renderQuiz();
  });
  next.addEventListener("click",function(){
    clearTimeout(qz.timer);clearTimeout(qz.timer2);
    autoAdvance();
  });
  pause.addEventListener("click",function(){
    if(qz.paused){                    /* 继续：未揭示先揭示，已揭示定时前进 */
      qz.paused=false;
      if(!qz.revealed){
        qz.timer=setTimeout(function(){revealAuto();},500);
      }
      qz.timer2=setTimeout(function(){autoAdvance();},qz.revealed?1800:2300);
    }else{
      qz.paused=true;
      clearTimeout(qz.timer);clearTimeout(qz.timer2);
    }
    renderQuiz();
  });
  ctrl.append(prev,pause,next);
  card.appendChild(ctrl);
  function revealAuto(){
    qz.revealed=true;
    const a=document.querySelector("#view-quiz .auto-answer");
    if(a)a.classList.add("revealed");
  }
  function autoAdvance(){
    const cur=S.quiz;
    if(!cur||cur.stage!=="playing"||cur.mode!=="auto")return;
    cur.index++;
    cur.revealed=false;
    if(cur.index>=cur.questions.length){cur.stage="settle";}
    renderQuiz();
  }
  if(!qz.paused){
    if(!qz.revealed)qz.timer=setTimeout(revealAuto,1400);
    qz.timer2=setTimeout(autoAdvance,qz.revealed?1800:4600);
  }
  return card;
}
function quizSettlementPanel(){
  const qz=S.quiz;
  if(qz.mode==="auto"){
    const card=el("div","card settle");
    card.appendChild(el("div",null,"📖 本轮自动学习了 "+qz.questions.length+" 个词，去闯关练一练吧！"));
    const act=el("div","settle-actions");
    const again=el("button","btn btn-primary","再来一轮");
    again.type="button";
    again.addEventListener("click",function(){S.quiz=null;startLevel({mode:"auto"});});
    const home=el("button","btn btn-plain","返回");
    home.type="button";
    home.addEventListener("click",function(){S.quiz=null;renderQuiz();});
    act.append(again,home);card.appendChild(act);
    return card;
  }
  const stars=starCount(qz.correct,qz.questions.length);
  const card=el("div","card settle");
  card.appendChild(el("div",null,stars===3?"太棒了，全对通关！":stars>0?"不错的成绩！":"没关系，再来一次会更稳。"));
  const st=el("div","stars");
  st.textContent=stars>0?"⭐".repeat(stars):"☆☆☆";
  card.appendChild(st);
  const score=qz.correct*20+qz.maxCombo*5;
  card.appendChild(el("div","score-line","答对 "+qz.correct+"/"+qz.questions.length+" · 得分 "+score+" · 最高连对 "+qz.maxCombo));
  if(qz.wrongList.length){
    card.appendChild(el("div","sec-title","本关需要巩固的词"));
    const ul=el("ul","wrong-list");
    qz.wrongList.forEach(function(w){
      const li=el("li");
      li.appendChild(document.createTextNode("「"+w.word+"」→ 正确的是「"+w.answer+"」。"));
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }
  const act=el("div","settle-actions");
  const again=el("button","btn btn-primary","再来一关");
  again.type="button";
  again.addEventListener("click",function(){
    const m=qz.mode;
    S.quiz=null;
    if(m==="focus"||m==="focusFill")startLevel({mode:m,focusId:qz.focusId});
    else startLevel({mode:m==="wrong"?"wrong":(getSettings().answerMode==="choice"?"normal":getSettings().answerMode)});
  });
  const toWrong=el("button","btn btn-ghost","去错题本");
  toWrong.type="button";
  toWrong.addEventListener("click",function(){S.quiz=null;goView("me");});
  const home=el("button","btn btn-plain","返回查词");
  home.type="button";
  home.addEventListener("click",function(){S.quiz=null;goView("search");});
  act.append(again,toWrong,home);
  card.appendChild(act);
  return card;
}

/* =====================================================================
 * 词库浏览视图（P0-F21/F22：A-Z 分组 + 字母导航 + 词性/年级/标签筛选）
 * ===================================================================== */
function renderBrowse(){
  const v=$("#view-browse");v.textContent="";
  const wrap=el("div");
  wrap.appendChild(el("div","view-title","📚 词库（"+WORD_DB.length+" 条）"));
  const filters=el("div","filter-row");
  const selPos=el("select");
  selPos.setAttribute("aria-label","按词性筛选");
  [["","全部词性"]].concat(POS_LIST.map(function(p){return [p,p];})).forEach(function(o){
    const op=el("option",null,o[1]);op.value=o[0];selPos.appendChild(op);
  });
  selPos.value=S.browse.pos;
  const selGrade=el("select");
  selGrade.setAttribute("aria-label","按年级筛选");
  [["","全部年级"],["1","1-2 年级"],["2","3-4 年级"],["3","5-6 年级"],["4","7-9 年级"]].forEach(function(o){
    const op=el("option",null,o[1]);op.value=o[0];selGrade.appendChild(op);
  });
  selGrade.value=S.browse.grade;
  const selTag=el("select");
  selTag.setAttribute("aria-label","按主题筛选");
  [["","全部主题"]].concat(TAG_LIST.map(function(t){return [t,t];})).forEach(function(o){
    const op=el("option",null,o[1]);op.value=o[0];selTag.appendChild(op);
  });
  selTag.value=S.browse.tag;
  const count=el("span","muted");
  filters.append(selPos,selGrade,selTag,count);
  wrap.appendChild(filters);
  const layout=el("div","browse-layout");
  const list=el("div","card");list.style.padding="8px 16px";
  const nav=el("div","letter-nav");
  layout.append(list,nav);
  wrap.appendChild(layout);
  function inGrade(e,band){
    if(!band)return true;
    if(band==="1")return e.grade<=2;
    if(band==="2")return e.grade>=3&&e.grade<=4;
    if(band==="3")return e.grade>=5&&e.grade<=6;
    return e.grade>=7;
  }
  function apply(){
    list.textContent="";nav.textContent="";
    const filtered=WORD_DB.filter(function(e){
      return (!S.browse.pos||e.pos===S.browse.pos)
        &&inGrade(e,S.browse.grade)
        &&(!S.browse.tag||e.tags.indexOf(S.browse.tag)>=0);
    });
    count.textContent="共 "+filtered.length+" 个词";
    if(!filtered.length){
      list.appendChild(el("div","empty","这个筛选组合下还没有词，换个条件试试。"));
      return;
    }
    const groups={};
    filtered.forEach(function(e){
      const c=(e.pinyin_plain[0]||"#").toUpperCase();
      (groups[c]=groups[c]||[]).push(e);
    });
    const letters=Object.keys(groups).sort();
    letters.forEach(function(ch){
      const head=el("div","letter-head",ch);
      head.id="lg-"+ch;
      list.appendChild(head);
      groups[ch].forEach(function(e){
        const row=el("button","wrow");
        row.type="button";
        row.appendChild(el("span","w",e.word));
        row.appendChild(el("span","py",e.pinyin));
        row.appendChild(el("span","def",e.definition));
        row.addEventListener("click",function(){
          S.entry=e;S.navStack=[];
          $("#search-input").value=e.word;
          goView("search");
        });
        list.appendChild(row);
      });
      const nb=el("button",null,ch);
      nb.type="button";
      nb.addEventListener("click",function(){
        const t=$("#lg-"+ch);if(t)t.scrollIntoView({block:"start"});
      });
      nav.appendChild(nb);
    });
  }
  selPos.addEventListener("change",function(){S.browse.pos=selPos.value;apply();});
  selGrade.addEventListener("change",function(){S.browse.grade=selGrade.value;apply();});
  selTag.addEventListener("change",function(){S.browse.tag=selTag.value;apply();});
  apply();
  v.appendChild(wrap);
}

/* =====================================================================
 * 我的视图（P5/P6：统计、打卡日历、薄弱词、错题本、生词本、报告、
 * 徽章、词卡打印、数据导入导出、设置）
 * ===================================================================== */
function renderMe(){
  const v=$("#view-me");v.textContent="";
  const wrap=el("div","me-wrap");
  wrap.appendChild(el("div","view-title","🏠 我的"));
  /* --- 学习统计 --- */
  const t=getTotals(),h=getHistory(),streak=getStreak();
  const acc=t.answered?Math.round(t.correct/t.answered*100)+"%":"—";
  const statCard=el("div","card");
  const grid=el("div","statgrid");
  [[t.searched||0,"查词次数"],[t.answered||0,"答题总数"],[acc,"总正确率"],
   [streak.current||0,"连续打卡"],[streak.longest||0,"最长连击"],[Object.keys(getMastered()).length,"已掌握词"]].forEach(function(p){
    const s=el("div","stat");
    s.appendChild(el("div","num",String(p[0])));
    s.appendChild(el("div","lbl",p[1]));
    grid.appendChild(s);
  });
  statCard.appendChild(grid);
  statCard.appendChild(el("div","sec-title","最近 30 天打卡（有练习的日子会点亮）"));
  const cal=el("div","cal");
  for(let i=29;i>=0;i--){
    const d=new Date(Date.now()-i*86400000);
    const key=todayStr(d);
    const day=h[key]||{};
    const cell=el("div","cal-cell"+((day.answered||0)>0?" on":"")+(i===0?" today":""));
    cell.title=key+"：答题 "+(day.answered||0)+" 道，查词 "+(day.searched||0)+" 次";
    cal.appendChild(cell);
  }
  statCard.appendChild(cal);
  wrap.appendChild(statCard);
  /* --- 薄弱词 --- */
  const weak=weakWords(2).slice(0,5);
  if(weak.length){
    const card=el("div","card");
    card.appendChild(el("div","sec-title","📌 薄弱词 Top"+weak.length+"（错误 ≥2 次且未掌握）"));
    weak.forEach(function(w){
      const row=el("div","list-row");
      row.appendChild(el("span","w",w.entry.word));
      row.appendChild(el("span","py",w.entry.pinyin));
      row.appendChild(el("span","muted","错 "+w.count+" 次 · "+w.types.map(function(x){return KIND_NAME[x]||x;}).join("/")));
      const btn=el("button","btn btn-ghost btn-small","去练这个词");
      btn.type="button";
      btn.addEventListener("click",function(){
        S.quiz=null;
        startLevel({mode:"focus",focusId:w.entry.id});
        goView("quiz");
      });
      row.appendChild(btn);
      card.appendChild(row);
    });
    wrap.appendChild(card);
  }
  /* --- 错题本 --- */
  const wrongCard=el("div","card");
  wrongCard.appendChild(el("div","sec-title","🩹 错题本（连续答对 2 次自动出库）"));
  const wobj=getWrong(),wids=Object.keys(wobj);
  if(!wids.length){
    wrongCard.appendChild(el("div","empty","错题本空空的，说明最近学得很扎实！继续保持～"));
  }else{
    wids.sort(function(a,b){return wobj[b].count-wobj[a].count;}).forEach(function(id){
      const e=DB_API.byId(id),it=wobj[id];
      if(!e)return;
      const row=el("div","list-row");
      const w=el("span","w",e.word);
      w.addEventListener("click",function(){goView("search");openWord(e.word);});
      row.appendChild(w);
      row.appendChild(el("span","py",e.pinyin));
      row.appendChild(el("span","ktag","错 "+it.count+" 次"));
      row.appendChild(el("span","muted",it.wrongTypes.map(function(x){return KIND_NAME[x]||x;}).join("/")+" 题 · "+relTime(it.lastWrongAt)+"错的"));
      const btn=el("button","btn btn-ghost btn-small","练一练");
      btn.type="button";
      btn.addEventListener("click",function(){
        S.quiz=null;startLevel({mode:"focus",focusId:id});goView("quiz");
      });
      row.appendChild(btn);
      wrongCard.appendChild(row);
    });
    const act=el("div","next-row");
    const practice=el("button","btn btn-primary btn-small","只练错题（生成一关）");
    practice.type="button";
    practice.addEventListener("click",function(){S.quiz=null;startLevel({mode:"wrong"});goView("quiz");});
    act.appendChild(practice);wrongCard.appendChild(act);
  }
  wrap.appendChild(wrongCard);
  /* --- 生词本 --- */
  const favCard=el("div","card");
  favCard.appendChild(el("div","sec-title","⭐ 生词本"));
  const favs=getFavorites().map(DB_API.byId).filter(Boolean);
  if(!favs.length){
    favCard.appendChild(el("div","empty","还没有收藏的词。查词时点右上角「收藏」，把要复习的词存起来。"));
  }else{
    favs.forEach(function(e){
      const row=el("div","list-row");
      const w=el("span","w",e.word);
      w.addEventListener("click",function(){goView("search");openWord(e.word);});
      row.appendChild(w);
      row.appendChild(el("span","py",e.pinyin));
      row.appendChild(el("span","grow muted",e.definition));
      const rm=el("button","btn btn-plain btn-small","移出");
      rm.type="button";
      rm.addEventListener("click",function(){
        toggleFav(e.id);renderMe();toast("已从生词本移出「"+e.word+"」");
      });
      row.appendChild(rm);
      favCard.appendChild(row);
    });
    const act=el("div","next-row");
    const fc=el("button","btn btn-primary btn-small","复习生词（闪卡模式）");
    fc.type="button";
    fc.addEventListener("click",function(){openFlashcards(favs);});
    act.appendChild(fc);favCard.appendChild(act);
  }
  wrap.appendChild(favCard);
  /* --- 学习报告（P6） --- */
  const repCard=el("div","card");
  repCard.appendChild(el("div","sec-title","📊 学习报告 · 本周"));
  const ws=weekStats();
  const g2=el("div","statgrid");
  g2.style.gridTemplateColumns="repeat(3,1fr)";
  [[ws.searched,"本周查词"],[ws.answered,"本周答题"],
   [ws.answered?Math.round(ws.correct/ws.answered*100)+"%":"—","本周正确率"]].forEach(function(p){
    const s=el("div","stat");
    s.appendChild(el("div","num",String(p[0])));
    s.appendChild(el("div","lbl",p[1]));
    g2.appendChild(s);
  });
  repCard.appendChild(g2);
  const box=el("div","report-box");
  box.appendChild(el("div",null,"💬 给家长的一段话："));
  box.appendChild(el("div",null,parentReport()));
  repCard.appendChild(box);
  const cp=el("button","btn btn-plain btn-small","复制周报");
  cp.type="button";cp.style.marginTop="10px";
  cp.addEventListener("click",function(){
    const text=parentReport();
    const done=function(){toast("已复制，可以粘贴给家长啦");};
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done,function(){fallbackCopy(text);done();});
    }else{fallbackCopy(text);done();}
  });
  repCard.appendChild(cp);
  wrap.appendChild(repCard);
  /* --- 徽章 --- */
  const badgeCard=el("div","card");
  badgeCard.appendChild(el("div","sec-title","🏅 成就徽章"));
  const have=getBadges(),bg=el("div","badge-grid");
  BADGES.forEach(function(b){
    const got=have.indexOf(b.id)>=0;
    const d=el("div","badge"+(got?"":" locked"));
    d.appendChild(el("div","bi",got?b.icon:"🔒"));
    d.appendChild(el("div","bn",b.name));
    d.appendChild(el("div","bd",b.desc));
    bg.appendChild(d);
  });
  badgeCard.appendChild(bg);
  wrap.appendChild(badgeCard);
  /* --- 词卡打印（P6/F25） --- */
  const printCard=el("div","card");
  printCard.appendChild(el("div","sec-title","🖨️ 词卡打印（A4 一页 8 张，虚线可裁剪）"));
  const prow=el("div","filter-row");
  const src=el("select");
  src.setAttribute("aria-label","选择打印范围");
  [["fav","收藏词"],["wrong","错题词"],["tag","指定主题"]].forEach(function(o){
    const op=el("option",null,o[1]);op.value=o[0];src.appendChild(op);
  });
  const tagSel=el("select");
  tagSel.style.display="none";
  TAG_LIST.forEach(function(tg){
    const op=el("option",null,tg);op.value=tg;tagSel.appendChild(op);
  });
  const pcount=el("span","muted");
  const pbtn=el("button","btn btn-primary btn-small","🖨️ 打印词卡");
  pbtn.type="button";
  prow.append(src,tagSel,pcount,pbtn);
  printCard.appendChild(prow);
  function printPool(){
    if(src.value==="fav")return getFavorites().map(DB_API.byId).filter(Boolean);
    if(src.value==="wrong")return Object.keys(getWrong()).map(DB_API.byId).filter(Boolean);
    return DB_API.byTag(tagSel.value);
  }
  function refreshCount(){
    const n=printPool().length;
    pcount.textContent="可选 "+n+" 个词（每次最多打 16 张）";
  }
  src.addEventListener("change",function(){
    tagSel.style.display=src.value==="tag"?"":"none";refreshCount();
  });
  tagSel.addEventListener("change",refreshCount);
  refreshCount();
  pbtn.addEventListener("click",function(){
    const words=printPool().slice(0,16);
    if(!words.length){toast("这个范围里还没有词，先收藏或练习几个吧");return;}
    printCards(words);
  });
  wrap.appendChild(printCard);
  /* --- 数据管理 --- */
  const dataCard=el("div","card");
  dataCard.appendChild(el("div","sec-title","💾 数据备份"));
  const drow=el("div","next-row");
  const ex=el("button","btn btn-ghost btn-small","导出 JSON");
  ex.type="button";
  ex.addEventListener("click",exportData);
  const im=el("button","btn btn-plain btn-small","导入 JSON");
  im.type="button";
  im.addEventListener("click",function(){$("#import-file").click();});
  const cl=el("button","btn btn-plain btn-small","清空数据");
  cl.type="button";
  cl.addEventListener("click",function(){
    confirmModal("清空全部学习数据？","收藏、错题、统计都会被删除，此操作无法撤销。","清空",function(){
      ["favorites","wrong","history","streak","badges","totals","recent","mastered","settings","onboarded","version"]
        .forEach(function(k){STORE.remove(k);});
      STORE.init();applyTheme(getSettings().theme);
      renderMe();toast("已清空，重新开始！");
    });
  });
  drow.append(ex,im,cl);
  dataCard.appendChild(drow);
  const file=document.createElement("input");
  file.type="file";file.id="import-file";file.accept=".json,application/json";
  file.style.display="none";
  file.addEventListener("change",function(){importData(file);});
  dataCard.appendChild(file);
  wrap.appendChild(dataCard);
  /* --- 设置 --- */
  const setCard=el("div","card");
  setCard.appendChild(el("div","sec-title","⚙️ 设置"));
  const s=getSettings();
  const r1=el("div","switch-row");
  r1.appendChild(el("span",null,"🔊 答题音效"));
  const sw1=el("button","switch"+(s.sound?" on":""));
  sw1.type="button";sw1.setAttribute("aria-label","音效开关");
  sw1.addEventListener("click",function(){
    const st=getSettings();st.sound=!st.sound;saveSettings(st);
    sw1.classList.toggle("on",st.sound);
  });
  r1.appendChild(sw1);setCard.appendChild(r1);
  const r2=el("div","switch-row");
  r2.appendChild(el("span",null,"🌙 深色模式"));
  const sw2=el("button","switch"+(s.theme==="dark"?" on":""));
  sw2.type="button";sw2.setAttribute("aria-label","深色模式开关");
  sw2.addEventListener("click",function(){
    const st=getSettings();st.theme=st.theme==="dark"?"light":"dark";saveSettings(st);
    applyTheme(st.theme);sw2.classList.toggle("on",st.theme==="dark");
  });
  r2.appendChild(sw2);setCard.appendChild(r2);
  wrap.appendChild(setCard);
  v.appendChild(wrap);
}
function fallbackCopy(text){
  const ta=document.createElement("textarea");
  ta.value=text;ta.style.position="fixed";ta.style.opacity="0";
  document.body.appendChild(ta);ta.select();
  try{document.execCommand("copy");}catch(e){}
  document.body.removeChild(ta);
}

/* ---------- 闪卡复习（P5 生词本） ---------- */
function openFlashcards(entries){
  let idx=0;
  const c=el("div");
  const head=el("div",null);
  head.style.display="flex";head.style.justifyContent="space-between";head.style.alignItems="center";
  head.appendChild(el("h3",null,"⭐ 生词闪卡"));
  const closeBtn=el("button","btn btn-plain btn-small","关闭");
  head.appendChild(closeBtn);
  c.appendChild(head);
  const prog=el("div","muted");
  c.appendChild(prog);
  const fc=el("div","fc");
  const inner=el("div","fc-inner");
  const front=el("div","fc-face");
  const back=el("div","fc-face fc-back");
  inner.append(front,back);fc.appendChild(inner);
  c.appendChild(fc);
  const nav=el("div","modal-actions");
  const prev=el("button","btn btn-plain","← 上一个");
  const next=el("button","btn btn-primary","下一个 →");
  nav.append(prev,next);
  c.appendChild(nav);
  function paint(){
    const e=entries[idx];
    prog.textContent="第 "+(idx+1)+"/"+entries.length+" 张 · 点击卡片翻面";
    front.textContent="";
    front.appendChild(el("div","fc-word",e.word));
    front.appendChild(el("div","d-py",e.pinyin));
    front.appendChild(el("div","fc-hint","点一点，看意思"));
    back.textContent="";
    back.appendChild(el("div",null,e.definition));
    if(e.synonyms.length)back.appendChild(el("div","muted","近义词："+e.synonyms.map(function(s){return s.word;}).join("、")));
    if(e.antonyms.length)back.appendChild(el("div","muted","反义词："+e.antonyms.map(function(s){return s.word;}).join("、")));
    fc.classList.remove("flipped");
  }
  fc.addEventListener("click",function(){fc.classList.toggle("flipped");});
  prev.addEventListener("click",function(){idx=(idx-1+entries.length)%entries.length;paint();});
  next.addEventListener("click",function(){idx=(idx+1)%entries.length;paint();});
  paint();
  const close=openModal(c);
  closeBtn.addEventListener("click",close);
}

/* ---------- 词卡打印（P6/F25） ---------- */
function printCards(words){
  const layer=$("#print-layer");layer.textContent="";
  for(let p=0;p<words.length;p+=8){
    const page=el("div","print-page");
    words.slice(p,p+8).forEach(function(e){
      const card=el("div","print-card");
      card.appendChild(el("div","pc-word",e.word));
      card.appendChild(el("div","pc-py",e.pinyin));
      const syns=e.synonyms.slice(0,2).map(function(s){return s.word;}).join("、");
      const ants=e.antonyms.slice(0,2).map(function(s){return s.word;}).join("、");
      card.appendChild(el("div","pc-line","近义词："+(syns||"—")));
      card.appendChild(el("div","pc-line","反义词："+(ants||"—")));
      if(e.examples.length)card.appendChild(el("div","pc-ex","例："+e.examples[0]));
      card.appendChild(el("div","pc-corner","词语小侦探"));
      page.appendChild(card);
    });
    layer.appendChild(page);
  }
  setTimeout(function(){window.print();},50);
}

/* ---------- 导出 / 导入（P0-F13） ---------- */
function exportData(){
  const data={
    app:"词语小侦探",version:STORE.VERSION,exportedAt:new Date().toISOString(),
    data:{
      favorites:getFavorites(),wrong:getWrong(),history:getHistory(),
      streak:getStreak(),badges:getBadges(),totals:getTotals(),
      recent:getRecent(),mastered:getMastered(),settings:getSettings()
    }
  };
  try{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="词语小侦探备份-"+todayStr().replace(/-/g,"")+".json";
    document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);document.body.removeChild(a);},200);
    toast("已导出备份文件");
  }catch(e){toast("导出失败，请重试");}
}
function importData(fileInput){
  const f=fileInput.files&&fileInput.files[0];
  fileInput.value="";
  if(!f)return;
  const reader=new FileReader();
  reader.onload=function(){
    let obj=null;
    try{obj=JSON.parse(reader.result);}catch(e){}
    if(!obj||!obj.data||!Array.isArray(obj.data.favorites)){
      toast("文件格式不对，请选择本软件导出的 JSON");
      return;
    }
    confirmModal("导入备份？","导入会覆盖当前的学习数据（收藏、错题、统计），确定继续吗？","导入",function(){
      const d=obj.data;
      STORE.save("favorites",Array.isArray(d.favorites)?d.favorites:[]);
      STORE.save("wrong",(d.wrong&&typeof d.wrong==="object")?d.wrong:{});
      STORE.save("history",(d.history&&typeof d.history==="object")?d.history:{});
      STORE.save("streak",(d.streak&&typeof d.streak==="object")?d.streak:{current:0,longest:0,lastDate:""});
      STORE.save("badges",Array.isArray(d.badges)?d.badges:[]);
      STORE.save("totals",(d.totals&&typeof d.totals==="object")?d.totals:{});
      STORE.save("recent",Array.isArray(d.recent)?d.recent:[]);
      STORE.save("mastered",(d.mastered&&typeof d.mastered==="object")?d.mastered:{});
      STORE.save("settings",(d.settings&&typeof d.settings==="object")?d.settings:{});
      applyTheme(getSettings().theme);
      route();
      toast("导入成功，数据已恢复");
    });
  };
  reader.readAsText(f);
}

/* ---------- 深色主题 / 首次引导 / 启动 ---------- */
function applyTheme(theme){
  document.documentElement.dataset.theme=theme==="dark"?"dark":"light";
}
function maybeOnboard(){
  if(STORE.load("onboarded",false))return;
  const steps=[
    {ico:"🔎",t:"第 1 步 · 查词",d:"输入汉字、拼音或首字母都能找到词。每个近义词旁边都有一句“怎么用”的提示。"},
    {ico:"⚖️",t:"第 2 步 · 辨析",d:"两个词到底差在哪？五维对比表，加上同一个场景的两种说法，一眼看懂。"},
    {ico:"🎯",t:"第 3 步 · 闯关",d:"每天 5 题一小关。答错的词自动进错题本，连续答对 2 次就算掌握。"}
  ];
  let i=0;
  const c=el("div");
  const ico=el("div","ob-ico"),tt=el("div","ob-t"),dd=el("div","ob-d");
  const dots=el("div","ob-dots");
  steps.forEach(function(){dots.appendChild(el("span","ob-dot"));});
  const act=el("div","modal-actions");
  const prev=el("button","btn btn-plain","上一步");
  const next=el("button","btn btn-primary","下一步");
  act.append(prev,next);
  c.append(ico,tt,dd,dots,act);
  function paint(){
    ico.textContent=steps[i].ico;tt.textContent=steps[i].t;dd.textContent=steps[i].d;
    dots.childNodes.forEach(function(d,j){d.classList.toggle("on",j===i);});
    prev.style.visibility=i===0?"hidden":"visible";
    next.textContent=i===steps.length-1?"开始使用 ✓":"下一步";
  }
  prev.addEventListener("click",function(){if(i>0){i--;paint();}});
  next.addEventListener("click",function(){
    if(i<steps.length-1){i++;paint();return;}
    STORE.save("onboarded",true);
    close();toast("准备好了！从查一个词开始吧 🔍");
  });
  paint();
  const close=openModal(c);
}
const VIEW_RENDER={
  search:renderSearch,contrast:renderContrast,quiz:renderQuiz,
  browse:renderBrowse,me:renderMe
};
function init(){
  STORE.init();
  applyTheme(getSettings().theme);
  window.addEventListener("hashchange",route);
  if(!location.hash){
    try{history.replaceState(null,"","#/search");}catch(e){location.hash="#/search";}
  }
  bindSearchInput();
  route();
  maybeOnboard();
  window.selfTestQuiz=QUIZ_ENGINE.selfTestQuiz;   /* 开发者自检入口 */
}
try{
  init();
}catch(err){
  (function(){
    const banner=document.createElement("div");
    banner.style.cssText="margin:40px auto;max-width:520px;padding:24px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,.06);text-align:center";
    banner.textContent="软件启动遇到了一点小问题，请刷新页面再试一次。";
    document.body.insertBefore(banner,document.body.firstChild);
  })();
}
