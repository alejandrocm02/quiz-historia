/* ═══════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════ */
const MODE_CFG = {
  easy:   {label:'Fácil',  count:15, time:20},
  medium: {label:'Medio',  count:30, time:15},
  hard:   {label:'Difícil',count:61, time:10}
};

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let selectedMode = 'easy';
let rankTab = 'easy', rankTabFull = 'easy';
let username = '';
let QUESTIONS = [], current = 0, score = 0, answered = false;
let timerInterval = null, timeLeft = 20, quizStart = 0;
let shuffled = [];

/* VS state */
let vsP1='', vsP2='', vsScore=[0,0], vsQuestions=[], vsCurrent=0;
let vsBuzzed=0, vsSecondChance=false, vsPassed=false;

/* ═══════════════════════════════════════════
   AUDIO
═══════════════════════════════════════════ */
const AC = new (window.AudioContext||window.webkitAudioContext)();
document.addEventListener('click',()=>{if(AC.state==='suspended')AC.resume();},{once:true});
document.addEventListener('keydown',()=>{if(AC.state==='suspended')AC.resume();},{once:true});

function playTone(type){
  try{
    const o=AC.createOscillator(),g=AC.createGain();
    o.connect(g);g.connect(AC.destination);
    if(type==='correct'){
      o.type='sine';o.frequency.setValueAtTime(520,AC.currentTime);o.frequency.setValueAtTime(780,AC.currentTime+.1);
      g.gain.setValueAtTime(.18,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.45);
      o.start();o.stop(AC.currentTime+.45);
    }else if(type==='wrong'){
      o.type='sawtooth';o.frequency.setValueAtTime(220,AC.currentTime);o.frequency.setValueAtTime(160,AC.currentTime+.15);
      g.gain.setValueAtTime(.14,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.4);
      o.start();o.stop(AC.currentTime+.4);
    }else if(type==='timeout'){
      o.type='triangle';o.frequency.setValueAtTime(300,AC.currentTime);o.frequency.setValueAtTime(180,AC.currentTime+.2);
      g.gain.setValueAtTime(.12,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.5);
      o.start();o.stop(AC.currentTime+.5);
    }else if(type==='tick'){
      o.type='sine';o.frequency.setValueAtTime(900,AC.currentTime);
      g.gain.setValueAtTime(.05,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.07);
      o.start();o.stop(AC.currentTime+.07);
    }else if(type==='buzz'){
      o.type='square';o.frequency.setValueAtTime(440,AC.currentTime);
      g.gain.setValueAtTime(.12,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.18);
      o.start();o.stop(AC.currentTime+.18);
    }else if(type==='finish'){
      [0,.12,.24,.38].forEach((t,i)=>{
        const o2=AC.createOscillator(),g2=AC.createGain();
        o2.connect(g2);g2.connect(AC.destination);o2.type='sine';
        o2.frequency.setValueAtTime([440,550,660,880][i],AC.currentTime+t);
        g2.gain.setValueAtTime(.14,AC.currentTime+t);g2.gain.exponentialRampToValueAtTime(.001,AC.currentTime+t+.3);
        o2.start(AC.currentTime+t);o2.stop(AC.currentTime+t+.3);
      });
    }
  }catch(e){}
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function formatTime(ms){
  const s=Math.round(ms/1000);
  return s<60?s+'s':Math.floor(s/60)+'m '+('0'+(s%60)).slice(-2)+'s';
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

/* ═══════════════════════════════════════════
   FIREBASE RANKING
═══════════════════════════════════════════ */
async function saveScore(name, score, total, mode, timeMs){
  if(!window._fbReady) return;
  try{
    await window._addDoc(
      window._collection(window._db,'scores'),
      {name, score, total, pct:Math.round(score/total*100), mode, time:timeMs,
       date:new Date().toLocaleDateString('es-ES'), ts:Date.now()}
    );
  }catch(e){console.warn('Firebase save error:',e);}
}

window.loadRanking = async function(mode, containerId, highlightName){
  const el=document.getElementById(containerId);
  if(!el) return;
  el.innerHTML='<div class="loader">Cargando…</div>';
  if(!window._fbReady){setTimeout(()=>window.loadRanking(mode,containerId,highlightName),600);return;}
  try{
    const q=window._query(
      window._collection(window._db,'scores'),
      window._where('mode','==',mode),
      window._orderBy('score','desc'),
      window._orderBy('time','asc'),
      window._limit(10)
    );
    const snap=await window._getDocs(q);
    const rows=[];
    snap.forEach(d=>rows.push(d.data()));
    renderRankRows(el, rows, highlightName);
  }catch(e){
    el.innerHTML='<div class="empty-rank">Error al cargar. Comprueba la conexión.</div>';
  }
};

function renderRankRows(el, rows, highlightName){
  if(!rows.length){el.innerHTML='<div class="empty-rank">Aún no hay puntuaciones. ¡Sé el primero!</div>';return;}
  const pc=i=>i===0?'top1':i===1?'top2':i===2?'top3':'';
  el.innerHTML=rows.map((e,i)=>`
    <div class="rank-item${e.name===highlightName?' me':''}">
      <span class="rank-pos ${pc(i)}">${i+1}</span>
      <span class="rank-name">${esc(e.name)}</span>
      <div class="rank-right">
        <div class="rank-score">${e.score}/${e.total}</div>
        <div class="rank-meta">${e.pct}% · ${formatTime(e.time)}</div>
      </div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   MODE SELECTOR
═══════════════════════════════════════════ */
function selectMode(el){
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  selectedMode=el.dataset.mode;
  document.getElementById('solo-setup').style.display = selectedMode==='vs'?'none':'block';
  document.getElementById('vs-setup').style.display   = selectedMode==='vs'?'block':'none';
}

function switchTab(mode, btn){
  rankTab=mode;
  document.querySelectorAll('#screen-login .tabs .tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  window.loadRanking(mode,'rank-preview','');
}
function switchTabFull(mode, btn){
  rankTabFull=mode;
  document.querySelectorAll('#screen-ranking .tabs .tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  window.loadRanking(mode,'rank-full',username);
}

/* ═══════════════════════════════════════════
   SOLO QUIZ
═══════════════════════════════════════════ */
function startSolo(){
  if(AC.state==='suspended')AC.resume();
  const val=document.getElementById('inp-username').value.trim();
  if(!val){document.getElementById('inp-username').classList.add('error');document.getElementById('inp-username').focus();return;}
  document.getElementById('inp-username').classList.remove('error');
  username=val;
  const cfg=MODE_CFG[selectedMode];
  QUESTIONS=shuffle(window.ALL_QUESTIONS).slice(0,cfg.count);
  current=0;score=0;answered=false;quizStart=Date.now();
  showScreen('screen-quiz');
  renderQuestion();
}
document.getElementById('inp-username').addEventListener('input',function(){this.classList.remove('error');});
document.getElementById('inp-username').addEventListener('keydown',function(e){if(e.key==='Enter')startSolo();});

function renderQuestion(){
  answered=false;
  const q=QUESTIONS[current];
  const pool=q.answers.map((text,idx)=>({text,isCorrect:idx===q.correct}));
  shuffled=shuffle(pool);
  const cfg=MODE_CFG[selectedMode];
  const pct=(current/QUESTIONS.length)*100;

  document.getElementById('q-label').textContent=`Pregunta ${current+1} / ${QUESTIONS.length}`;
  document.getElementById('score-pill').textContent=`✦ ${score} aciertos`;
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('q-number').textContent=String(current+1).padStart(2,'0');
  document.getElementById('q-text').textContent=q.question;
  document.getElementById('feedback').className='feedback';
  document.getElementById('next-btn').style.display='none';

  document.getElementById('answers-grid').innerHTML=
    shuffled.map((a,i)=>`<button class="answer-btn" id="ab${i}" onclick="handleAnswer(this,${i})">${esc(a.text)}</button>`).join('');

  startTimer(cfg.time);
}

function startTimer(sec){
  clearInterval(timerInterval);
  timeLeft=sec;
  updateTimerUI(sec);
  timerInterval=setInterval(()=>{
    timeLeft--;
    updateTimerUI(MODE_CFG[selectedMode].time);
    if(timeLeft<=4&&timeLeft>0)playTone('tick');
    if(timeLeft<=0){clearInterval(timerInterval);onTimeout();}
  },1000);
}
function updateTimerUI(max){
  const pct=(timeLeft/max)*100;
  const fill=document.getElementById('timer-fill');
  const num=document.getElementById('timer-num');
  fill.style.width=pct+'%';
  if(timeLeft>max*.5){fill.style.background='var(--gold)';num.style.color='var(--gold)';}
  else if(timeLeft>max*.25){fill.style.background='var(--warn)';num.style.color='var(--warn)';}
  else{fill.style.background='var(--err)';num.style.color='var(--err)';}
  num.textContent=timeLeft;
}
function onTimeout(){
  if(answered)return;
  answered=true;playTone('timeout');
  const correctText=QUESTIONS[current].answers[QUESTIONS[current].correct];
  document.querySelectorAll('.answer-btn').forEach((b,i)=>{
    b.disabled=true;if(shuffled[i]&&shuffled[i].isCorrect)b.classList.add('reveal');
  });
  const fb=document.getElementById('feedback');
  fb.className='feedback timeout';
  fb.textContent=`⏱ ¡Tiempo! La respuesta era: ${correctText}`;
  const nb=document.getElementById('next-btn');
  nb.style.display='block';
  nb.textContent=current+1<QUESTIONS.length?'Siguiente →':'Ver resultados →';
}
function handleAnswer(btn,idx){
  if(answered)return;
  answered=true;clearInterval(timerInterval);
  const sel=shuffled[idx];
  const correctText=QUESTIONS[current].answers[QUESTIONS[current].correct];
  const isOk=sel.isCorrect;
  if(isOk)score++;
  playTone(isOk?'correct':'wrong');
  document.querySelectorAll('.answer-btn').forEach((b,i)=>{
    b.disabled=true;if(shuffled[i]&&shuffled[i].isCorrect)b.classList.add('reveal');
  });
  if(!isOk){btn.classList.remove('reveal');btn.classList.add('wrong');}
  else{btn.classList.remove('reveal');btn.classList.add('correct');}
  const fb=document.getElementById('feedback');
  fb.className='feedback '+(isOk?'correct':'wrong');
  fb.textContent=isOk?'✓ ¡Correcto! Bien hecho.':'✕ Incorrecto. La respuesta era: '+correctText;
  const nb=document.getElementById('next-btn');
  nb.style.display='block';
  nb.textContent=current+1<QUESTIONS.length?'Siguiente →':'Ver resultados →';
}
function nextQ(){
  current++;
  if(current>=QUESTIONS.length){showResults();return;}
  renderQuestion();
}
async function showResults(){
  const totalMs=Date.now()-quizStart;
  const total=QUESTIONS.length;
  const pct=Math.round(score/total*100);
  await saveScore(username,score,total,selectedMode,totalMs);
  playTone('finish');
  let stars,msg;
  if(pct===100){stars='★★★★★';msg='Impecable. Dominas la historia y la cultura con maestría absoluta.';}
  else if(pct>=80){stars='★★★★☆';msg='Excelente resultado. Tu conocimiento histórico y cultural es admirable.';}
  else if(pct>=60){stars='★★★☆☆';msg='Buen nivel. Tienes una sólida base cultural con algo de margen para crecer.';}
  else if(pct>=40){stars='★★☆☆☆';msg='No está mal, pero hay varias cosas por repasar. ¡La cultura general se entrena!';}
  else{stars='★☆☆☆☆';msg='Parece que la historia guarda aún muchos secretos para ti. ¡Ánimo y a estudiar!';}
  document.getElementById('res-name').textContent=username.toUpperCase()+' · '+MODE_CFG[selectedMode].label.toUpperCase();
  document.getElementById('res-stars').textContent=stars;
  document.getElementById('res-fraction').innerHTML=`${score}<span class="results-total">/${total}</span>`;
  document.getElementById('res-pct').textContent=pct+'% de aciertos';
  document.getElementById('res-time').textContent='⏱ Tiempo total: '+formatTime(totalMs);
  document.getElementById('res-msg').textContent=msg;
  showScreen('screen-results');
}

/* ═══════════════════════════════════════════
   1v1 MODE
═══════════════════════════════════════════ */
function startVS(){
  if(AC.state==='suspended')AC.resume();
  const p1=document.getElementById('inp-p1').value.trim()||'Jugador 1';
  const p2=document.getElementById('inp-p2').value.trim()||'Jugador 2';
  const count=parseInt(document.getElementById('vs-count').value)||10;
  vsP1=p1; vsP2=p2; vsScore=[0,0];
  vsQuestions=shuffle(window.ALL_QUESTIONS).slice(0,count);
  vsCurrent=0;
  showScreen('screen-vs');
  vsRenderBuzzPhase();
}

/* keyboard shortcuts Q / P */
document.addEventListener('keydown',function(e){
  if(document.getElementById('screen-vs').classList.contains('active')){
    if(e.key.toLowerCase()==='q')buzzIn(1);
    if(e.key.toLowerCase()==='p')buzzIn(2);
  }
});

function vsUpdateHeader(){
  const banner=document.getElementById('turn-banner');
  banner.className='turn-banner '+(vsBuzzed===2?'p2':'p1');
  document.getElementById('turn-name').textContent=vsBuzzed===2?vsP2:vsP1;
  document.getElementById('turn-name').className='turn-name '+(vsBuzzed===2?'p2':'p1');
  document.getElementById('vs-score-p1').textContent=vsScore[0];
  document.getElementById('vs-score-p2').textContent=vsScore[1];
  document.getElementById('vs-q-label').textContent=`Pregunta ${vsCurrent+1} / ${vsQuestions.length}`;
  document.getElementById('vs-progress-fill').style.width=(vsCurrent/vsQuestions.length*100)+'%';
}

function vsRenderBuzzPhase(){
  vsBuzzed=0; vsSecondChance=false; vsPassed=false;
  const q=vsQuestions[vsCurrent];
  document.getElementById('buzz-question').textContent=q.question;
  document.getElementById('buzz-p1-name').textContent=vsP1;
  document.getElementById('buzz-p2-name').textContent=vsP2;
  document.getElementById('vs-feedback-buzz').className='feedback';
  document.getElementById('vs-buzz-phase').style.display='block';
  document.getElementById('vs-answer-phase').style.display='none';
  document.getElementById('buzz-p1').disabled=false;
  document.getElementById('buzz-p2').disabled=false;
  // neutral banner
  document.getElementById('turn-banner').className='turn-banner p1';
  document.getElementById('turn-name').textContent='⚔️ '+vsP1+' vs '+vsP2;
  document.getElementById('turn-name').className='turn-name p1';
  document.getElementById('vs-score-p1').textContent=vsScore[0];
  document.getElementById('vs-score-p2').textContent=vsScore[1];
  document.getElementById('vs-q-label').textContent=`Pregunta ${vsCurrent+1} / ${vsQuestions.length}`;
  document.getElementById('vs-progress-fill').style.width=(vsCurrent/vsQuestions.length*100)+'%';
}

function buzzIn(player){
  if(vsBuzzed!==0)return; // already buzzed
  if(vsSecondChance && player===vsBuzzed)return; // same player can't re-buzz
  playTone('buzz');
  vsBuzzed=player;
  document.getElementById('buzz-p1').disabled=true;
  document.getElementById('buzz-p2').disabled=true;
  vsUpdateHeader();
  vsShowAnswerPhase();
}

function vsShowAnswerPhase(){
  const q=vsQuestions[vsCurrent];
  const pool=q.answers.map((text,idx)=>({text,isCorrect:idx===q.correct}));
  shuffled=shuffle(pool);
  document.getElementById('vs-q-number').textContent=String(vsCurrent+1).padStart(2,'0');
  document.getElementById('vs-q-text').textContent=q.question;
  document.getElementById('vs-feedback').className='feedback';
  document.getElementById('vs-next-btn').style.display='none';
  document.getElementById('vs-answers-grid').innerHTML=
    shuffled.map((a,i)=>`<button class="answer-btn" id="vsab${i}" onclick="vsHandleAnswer(this,${i})">${esc(a.text)}</button>`).join('');
  document.getElementById('vs-buzz-phase').style.display='none';
  document.getElementById('vs-answer-phase').style.display='block';
}

function vsHandleAnswer(btn, idx){
  const sel=shuffled[idx];
  const q=vsQuestions[vsCurrent];
  const correctText=q.answers[q.correct];
  const isOk=sel.isCorrect;
  const fb=document.getElementById('vs-feedback');

  if(isOk){
    vsScore[vsBuzzed-1]++;
    playTone('correct');
    document.querySelectorAll('#vs-answers-grid .answer-btn').forEach((b,i)=>{
      b.disabled=true;if(shuffled[i]&&shuffled[i].isCorrect)b.classList.add('reveal');
    });
    btn.classList.remove('reveal');btn.classList.add('correct');
    fb.className='feedback correct';
    fb.textContent=`✓ ¡Correcto! +1 punto para ${vsBuzzed===1?vsP1:vsP2}.`;
    document.getElementById('vs-score-p1').textContent=vsScore[0];
    document.getElementById('vs-score-p2').textContent=vsScore[1];
    document.getElementById('vs-next-btn').style.display='block';
    document.getElementById('vs-next-btn').textContent=vsCurrent+1<vsQuestions.length?'Siguiente pregunta →':'Ver resultados →';
  } else {
    playTone('wrong');
    btn.disabled=true;btn.classList.add('wrong');
    if(!vsSecondChance){
      // first fail → other player can buzz in
      vsSecondChance=true;
      const other=vsBuzzed===1?vsP2:vsP1;
      fb.className='feedback info';
      fb.textContent=`✕ Incorrecto. ¡${other} puede intentarlo! Pulsa su botón.`;
      // re-enable buzz for other player
      document.getElementById('vs-answer-phase').style.display='none';
      document.getElementById('vs-buzz-phase').style.display='block';
      document.getElementById('vs-feedback-buzz').className='feedback info';
      document.getElementById('vs-feedback-buzz').textContent=`¡${other}, es tu turno! Pulsa tu botón para responder.`;
      const otherBtn=vsBuzzed===1?'buzz-p2':'buzz-p1';
      document.getElementById(otherBtn).disabled=false;
      const prevBuzzed=vsBuzzed;
      vsBuzzed=0; // reset so other can buzz
      // Prevent original player from buzzing again this question
      document.getElementById(prevBuzzed===1?'buzz-p1':'buzz-p2').disabled=true;
    } else {
      // second fail → reveal and move on
      document.querySelectorAll('#vs-answers-grid .answer-btn').forEach((b,i)=>{
        b.disabled=true;if(shuffled[i]&&shuffled[i].isCorrect)b.classList.add('reveal');
      });
      fb.className='feedback wrong';
      fb.textContent=`✕ Incorrecto. La respuesta era: ${correctText}. Nadie puntúa.`;
      document.getElementById('vs-next-btn').style.display='block';
      document.getElementById('vs-next-btn').textContent=vsCurrent+1<vsQuestions.length?'Siguiente pregunta →':'Ver resultados →';
    }
  }
}

function vsNextQ(){
  vsCurrent++;
  if(vsCurrent>=vsQuestions.length){showVSResults();return;}
  vsRenderBuzzPhase();
}

function showVSResults(){
  playTone('finish');
  const [s1,s2]=vsScore;
  let winnerMsg, winnerSub;
  if(s1>s2){winnerMsg=`🏆 ¡Gana ${vsP1}!`;winnerSub=`${vsP1} demuestra ser el más culto del duelo.`;}
  else if(s2>s1){winnerMsg=`🏆 ¡Gana ${vsP2}!`;winnerSub=`${vsP2} demuestra ser el más culto del duelo.`;}
  else{winnerMsg='🤝 ¡Empate!';winnerSub='Dos mentes igual de brillantes. ¡Revancha!';}
  document.getElementById('vs-winner-msg').textContent=winnerMsg;
  document.getElementById('vs-winner-sub').textContent=winnerSub;
  document.getElementById('vr-name-p1').textContent=vsP1;
  document.getElementById('vr-name-p2').textContent=vsP2;
  document.getElementById('vr-score-p1').textContent=s1;
  document.getElementById('vr-score-p2').textContent=s2;
  const c1=document.getElementById('vr-card-p1');
  const c2=document.getElementById('vr-card-p2');
  c1.classList.toggle('winner',s1>s2);
  c2.classList.toggle('winner',s2>s1);
  showScreen('screen-vs-results');
}

/* ═══════════════════════════════════════════
   NAV
═══════════════════════════════════════════ */
function goHome(){
  clearInterval(timerInterval);
  showScreen('screen-login');
  // loadRanking may not be ready yet if Firebase is still initialising
  if(typeof window.loadRanking === 'function'){
    window.loadRanking(rankTab,'rank-preview','');
  } else {
    // retry after Firebase module finishes
    setTimeout(()=>{
      if(typeof window.loadRanking === 'function') window.loadRanking(rankTab,'rank-preview','');
    }, 800);
  }
}

/* ═══════════════════════════════════════════
   BIND ALL STATIC BUTTONS VIA addEventListener
   (avoids onclick + module scope race condition)
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function(){

  // Results screen
  const btnVerRanking = document.querySelector('#screen-results .btn-outline-sm:not(.gold)');
  const btnJugarDeNuevo = document.querySelector('#screen-results .btn-outline-sm.gold');
  if(btnVerRanking) btnVerRanking.addEventListener('click', function(){
    showScreen('screen-ranking');
    if(typeof window.loadRanking==='function') window.loadRanking(rankTabFull,'rank-full',username);
  });
  if(btnJugarDeNuevo) btnJugarDeNuevo.addEventListener('click', goHome);

  // VS Results screen
  const btnVsVolver = document.querySelector('#screen-vs-results .btn-outline-sm.gold');
  if(btnVsVolver) btnVsVolver.addEventListener('click', goHome);

  // Ranking screen back button
  const btnBackRanking = document.querySelector('#screen-ranking .back-btn');
  if(btnBackRanking) btnBackRanking.addEventListener('click', goHome);

  // Ranking tabs (login screen)
  document.querySelectorAll('#screen-login .tabs .tab').forEach(tab=>{
    tab.addEventListener('click', function(){ switchTab(this.dataset.mode, this); });
  });

  // Ranking tabs (full ranking screen)
  document.querySelectorAll('#screen-ranking .tabs .tab').forEach(tab=>{
    tab.addEventListener('click', function(){ switchTabFull(this.dataset.mode, this); });
  });

  // Mode selector buttons
  document.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click', function(){ selectMode(this); });
  });

  // Start buttons
  const btnStartSolo = document.querySelector('#solo-setup .btn');
  if(btnStartSolo) btnStartSolo.addEventListener('click', startSolo);

  const btnStartVS = document.querySelector('#vs-setup .btn');
  if(btnStartVS) btnStartVS.addEventListener('click', startVS);

  // Next button (quiz)
  document.getElementById('next-btn').addEventListener('click', nextQ);

  // VS next button
  document.getElementById('vs-next-btn').addEventListener('click', vsNextQ);

  // Buzz buttons
  document.getElementById('buzz-p1').addEventListener('click', ()=>buzzIn(1));
  document.getElementById('buzz-p2').addEventListener('click', ()=>buzzIn(2));
});

/* expose globals (kept for any remaining inline references) */
window.selectMode=selectMode;
window.switchTab=switchTab;
window.switchTabFull=switchTabFull;
window.startSolo=startSolo;
window.startVS=startVS;
window.handleAnswer=handleAnswer;
window.nextQ=nextQ;
window.buzzIn=buzzIn;
window.vsHandleAnswer=vsHandleAnswer;
window.vsNextQ=vsNextQ;
window.showScreen=showScreen;
window.goHome=goHome;
