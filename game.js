(() => {
  'use strict';
  const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
  const mapCanvas=document.getElementById('minimap'),mapCtx=mapCanvas.getContext('2d');
  const W=3600,H=3000,GRID=400,ROAD=104,keys=new Set();
  const buildings=[],palms=[],traffic=[];
  let width=1,height=1,dpr=1,elapsed=0,running=false,paused=false,soundOn=true,toastTimer=0,completed=0,cash=2450,audioCtx=null;
  let missionStage='pickup';
  const player={x:240,y:230,angle:-.5,vx:0,vy:0,inCar:false,speed:0,carX:218,carY:200,carAngle:0};
  const jobs=[{pickup:[1000,200],drop:[1800,600],name:'VESPUCCI CANALS',dropName:'LITTLE SEOUL'},{pickup:[3000,1000],drop:[2200,1800],name:'MIRROR PARK',dropName:'LA MESA'},{pickup:[600,2200],drop:[3000,2600],name:'DEL PERRO PIER',dropName:'VINEWOOD HILLS'}];
  const palettes=[['#b9a98b','#d8c6a3','#847762'],['#967f6d','#baa38c','#746557'],['#918b78','#c5b99d','#6d7164'],['#a48975','#c6ad94','#7e6a5a'],['#898b7d','#b5b69d','#6b7167'],['#9b8d7b','#c4b197','#72695d']];
  const rnd=(()=>{let s=78231;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}})();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function makeCity(){
    for(let gx=0;gx<8;gx++)for(let gy=0;gy<7;gy++){
      const left=gx*GRID+200+ROAD/2+14,top=gy*GRID+200+ROAD/2+14,bw=GRID-ROAD-30,bh=GRID-ROAD-30;
      const ix=12+rnd()*23,iy=12+rnd()*24,w=bw-ix-rnd()*16,h=bh-iy-rnd()*17,pal=palettes[Math.floor(rnd()*palettes.length)];
      buildings.push({x:left+ix,y:top+iy,w,h,topColor:pal[0],roof:pal[1],side:pal[2],height:22+rnd()*58,kind:Math.floor(rnd()*4),seed:rnd()*1000});
      if(rnd()>.25){palms.push({x:left+5+rnd()*12,y:top+5+rnd()*12,size:13+rnd()*8},{x:left+bw-8-rnd()*8,y:top+bh-7-rnd()*8,size:12+rnd()*8});}
    }
    const colors=['#d95143','#4f7c88','#e7e1ca','#d6a64f','#546354','#b8c0b9','#523f39'];
    for(let i=0;i<13;i++){
      const vertical=rnd()>.52,lane=1+Math.floor(rnd()*7),line=(200+lane*GRID)+(rnd()>.5?22:-22),positive=rnd()>.5;
      const t={vertical,line,pos:rnd()*(vertical?H:W),dir:positive?1:-1,speed:46+rnd()*34,color:colors[Math.floor(rnd()*colors.length)]};
      t.angle=vertical?(positive?Math.PI/2:-Math.PI/2):(positive?0:Math.PI);traffic.push(t);
    }
  }
  function resize(){dpr=Math.min(devicePixelRatio||1,2);width=innerWidth;height=innerHeight;canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  function currentTarget(){const job=jobs[Math.min(completed,jobs.length-1)];return missionStage==='pickup'?job.pickup:job.drop;}
  function toast(text){const el=document.getElementById('toast');document.getElementById('toastText').textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
  function beep(freq=520,duration=.08){if(!soundOn)return;try{audioCtx||=new(window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.connect(gain);gain.connect(audioCtx.destination);osc.frequency.value=freq;gain.gain.setValueAtTime(.035,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.start();osc.stop(audioCtx.currentTime+duration);}catch(_){}}
  function updateMissionUI(){
    const title=document.getElementById('missionTitle'),copy=document.getElementById('missionCopy'),job=jobs[Math.min(completed,jobs.length-1)];
    if(completed>=3){title.textContent='CITY ON YOUR SIDE';copy.textContent='All jobs cleared. Keep cruising and enjoy the coast.';document.getElementById('progressText').textContent='3 / 3';document.getElementById('progressBar').style.width='100%';document.getElementById('rewardText').textContent='PAID';return;}
    title.textContent=missionStage==='pickup'?'A QUICK FAVOR':'DROP IT OFF';copy.textContent=missionStage==='pickup'?`Grab the package in ${job.name}, then make the drop.`:`Package secured. Deliver it to ${job.dropName}.`;
    document.getElementById('progressText').textContent=`${completed} / 3`;document.getElementById('progressBar').style.width=`${completed/3*100}%`;document.getElementById('rewardText').textContent=`$${750+completed*250}`;
  }
  function nearRoadName(x,y){const roads=['OCEAN DRIVE','PALOMINO AVE','VESPUCCI BLVD','DEL PERRO FWY','SUNSET BLVD','HAWICK AVE','MIRROR PARK'];return roads[Math.floor(x/GRID+y/GRID*2)%roads.length];}
  function updateHud(){
    document.getElementById('vehiclePanel').style.opacity=player.inCar?'1':'.48';document.getElementById('speed').textContent=String(Math.round(Math.abs(player.speed)*1.6)).padStart(3,'0');
    document.getElementById('modeLabel').textContent=player.inCar?'IN VEHICLE':'ON FOOT';
    document.getElementById('controlsHint').innerHTML=player.inCar?'<span class="hint-key">W A S D</span><span>DRIVE</span><i></i><span class="hint-key">E</span><span>EXIT</span><i></i><span class="hint-key">SPACE</span><span>HANDBRAKE</span>':'<span class="hint-key">W A S D</span><span>MOVE</span><i></i><span class="hint-key">E</span><span>ENTER VEHICLE</span>';
    const loc=player.inCar?[player.carX,player.carY]:[player.x,player.y],regions=['VESPUCCI BEACH','ROCKFORD HILLS','LITTLE SEOUL','MIRROR PARK','LA MESA','DEL PERRO'];
    document.getElementById('districtLabel').textContent=regions[(Math.floor(loc[0]/600)+Math.floor(loc[1]/500)*2)%regions.length];document.getElementById('locationName').textContent=nearRoadName(...loc);
    const mins=Math.floor(elapsed*1.1)%60;document.getElementById('clock').textContent=`${String(16+Math.floor(elapsed/90)%7).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
    document.querySelectorAll('#stars b').forEach((s,i)=>s.classList.toggle('active',i<Math.min(5,Math.floor(Math.abs(player.speed)/55))));
    document.getElementById('heatLabel').textContent=Math.abs(player.speed)>160?'HOT':Math.abs(player.speed)>100?'LOUD':'CLEAN';document.getElementById('cash').textContent=`$${cash.toLocaleString('en-US')}`;
  }
  function collides(x,y,r=8){return buildings.some(b=>x+r>b.x&&x-r<b.x+b.w&&y+r>b.y&&y-r<b.y+b.h);}
  function completeStage(){beep(700,.13);if(missionStage==='pickup'){missionStage='drop';toast('PACKAGE SECURED  •  MAKE THE DROP');}else{completed++;cash+=750+(completed-1)*250;missionStage='pickup';toast(completed>=3?'JOB COMPLETE  •  NICE WORK':'DELIVERY COMPLETE  •  NEXT JOB');if(completed>=3){document.getElementById('completeBanner').classList.remove('hidden');document.getElementById('bonusCash').textContent=`+$${750+(completed-1)*250}`;setTimeout(()=>document.getElementById('completeBanner').classList.add('hidden'),4200);}}updateMissionUI();}
  function update(dt){if(!running||paused)return;elapsed+=dt;for(const t of traffic){t.pos+=t.speed*dt*t.dir;if(t.pos< -100)t.pos=(t.vertical?H:W)+100;if(t.pos>(t.vertical?H:W)+100)t.pos=-100;}
    if(player.inCar){const accel=keys.has('w')?190:keys.has('s')?-155:0;player.speed+=accel*dt;if(keys.has(' '))player.speed*=Math.pow(.08,dt);else if(!accel)player.speed*=Math.pow(.52,dt);player.speed=clamp(player.speed,-72,220);
      const steering=(keys.has('a')?-1:0)+(keys.has('d')?1:0),steerScale=.42+Math.min(1,Math.abs(player.speed)/105);player.carAngle+=steering*2.15*steerScale*dt*(player.speed<0?-1:1);
      const nx=player.carX+Math.cos(player.carAngle)*player.speed*dt,ny=player.carY+Math.sin(player.carAngle)*player.speed*dt;if(nx>20&&nx<W-20&&ny>20&&ny<H-20&&!collides(nx,ny,14)){player.carX=nx;player.carY=ny;}else player.speed*=-.2;player.x=player.carX;player.y=player.carY;
    }else{let dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dy=(keys.has('s')?1:0)-(keys.has('w')?1:0);if(dx||dy){const len=Math.hypot(dx,dy);dx/=len;dy/=len;player.angle=Math.atan2(dy,dx);const nx=player.x+dx*145*dt,ny=player.y+dy*145*dt;if(!collides(nx,ny,7)){player.x=nx;player.y=ny;}}}
    const [tx,ty]=currentTarget(),px=player.inCar?player.carX:player.x,py=player.inCar?player.carY:player.y;if(Math.hypot(px-tx,py-ty)<(player.inCar?43:31))completeStage();updateHud();
  }
  function drawRoads(){
    ctx.fillStyle='#748773';ctx.fillRect(0,0,W,H);
    for(let gx=0;gx<9;gx++)for(let gy=0;gy<8;gy++)if((gx+gy)%3===0){ctx.fillStyle='rgba(190,181,143,.18)';ctx.fillRect(gx*GRID+266,gy*GRID+266,GRID-ROAD-30,GRID-ROAD-30);}
    ctx.fillStyle='#b9b29d';for(let x=200;x<=W;x+=GRID)ctx.fillRect(x-ROAD/2-9,0,ROAD+18,H);for(let y=200;y<=H;y+=GRID)ctx.fillRect(0,y-ROAD/2-9,W,ROAD+18);
    ctx.fillStyle='#41494a';for(let x=200;x<=W;x+=GRID)ctx.fillRect(x-ROAD/2,0,ROAD,H);for(let y=200;y<=H;y+=GRID)ctx.fillRect(0,y-ROAD/2,W,ROAD);
    ctx.fillStyle='rgba(188,170,135,.07)';for(let x=200;x<=W;x+=GRID)ctx.fillRect(x-ROAD/2+3,0,ROAD-6,H);for(let y=200;y<=H;y+=GRID)ctx.fillRect(0,y-ROAD/2+3,W,ROAD-6);
    ctx.strokeStyle='#eee6c8';ctx.lineWidth=2;ctx.setLineDash([17,15]);ctx.globalAlpha=.48;for(let x=200;x<=W;x+=GRID){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=200;y<=H;y+=GRID){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.setLineDash([]);ctx.globalAlpha=.65;
    ctx.strokeStyle='#cec8b2';ctx.lineWidth=1;for(let x=200;x<=W;x+=GRID){ctx.beginPath();ctx.moveTo(x-ROAD/2+8,0);ctx.lineTo(x-ROAD/2+8,H);ctx.moveTo(x+ROAD/2-8,0);ctx.lineTo(x+ROAD/2-8,H);ctx.stroke();}for(let y=200;y<=H;y+=GRID){ctx.beginPath();ctx.moveTo(0,y-ROAD/2+8);ctx.lineTo(W,y-ROAD/2+8);ctx.moveTo(0,y+ROAD/2-8);ctx.lineTo(W,y+ROAD/2-8);ctx.stroke();}ctx.globalAlpha=1;
    ctx.fillStyle='rgba(235,231,211,.48)';for(let x=200;x<=W;x+=GRID)for(let y=200;y<=H;y+=GRID)for(let i=0;i<5;i++){ctx.fillRect(x-ROAD/2+11+i*8,y-ROAD/2+6,4,18);ctx.fillRect(x-ROAD/2+11+i*8,y+ROAD/2-24,4,18);ctx.fillRect(x-ROAD/2+6,y-ROAD/2+11+i*8,18,4);ctx.fillRect(x+ROAD/2-24,y-ROAD/2+11+i*8,18,4);}ctx.globalAlpha=1;
  }
  function drawBuildings(){for(const b of buildings){
    ctx.fillStyle='rgba(24,30,27,.3)';ctx.fillRect(b.x-6,b.y-5,b.w+12,b.h+12);ctx.fillStyle='#b8b09c';ctx.fillRect(b.x-6,b.y-6,b.w+12,b.h+12);ctx.fillStyle=b.side;ctx.fillRect(b.x+5,b.y+5,b.w,b.h);ctx.fillStyle=b.topColor;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle=b.roof;ctx.fillRect(b.x+5,b.y+5,b.w-10,b.h-10);ctx.fillStyle='rgba(244,231,199,.23)';ctx.fillRect(b.x+4,b.y+4,b.w-8,3);ctx.fillRect(b.x+4,b.y+4,3,b.h-8);
    if(b.kind===0){ctx.fillStyle='rgba(90,83,68,.4)';ctx.fillRect(b.x+b.w*.22,b.y+b.h*.24,b.w*.27,b.h*.24);ctx.fillStyle='rgba(228,215,181,.25)';ctx.fillRect(b.x+b.w*.24,b.y+b.h*.26,b.w*.23,b.h*.2);ctx.fillStyle='rgba(83,83,70,.36)';ctx.fillRect(b.x+b.w*.66,b.y+b.h*.58,23,17);}
    else if(b.kind===1){ctx.fillStyle='rgba(86,88,77,.36)';ctx.fillRect(b.x+b.w*.12,b.y+b.h*.14,b.w*.76,b.h*.7);ctx.strokeStyle='rgba(235,225,199,.36)';ctx.lineWidth=2;for(let k=1;k<5;k++){ctx.beginPath();ctx.moveTo(b.x+b.w*.12+k*b.w*.15,b.y+b.h*.14);ctx.lineTo(b.x+b.w*.12+k*b.w*.15,b.y+b.h*.84);ctx.stroke();}}
    else if(b.kind===2){ctx.fillStyle='rgba(76,80,69,.42)';ctx.fillRect(b.x+b.w*.58,b.y+b.h*.18,b.w*.22,b.h*.2);ctx.fillStyle='rgba(223,211,182,.31)';ctx.fillRect(b.x+b.w*.13,b.y+b.h*.63,b.w*.53,4);ctx.fillRect(b.x+b.w*.13,b.y+b.h*.72,b.w*.53,4);}
    else{ctx.fillStyle='rgba(90,85,70,.34)';ctx.fillRect(b.x+b.w*.12,b.y+b.h*.18,b.w*.76,b.h*.63);ctx.fillStyle='rgba(225,213,181,.26)';ctx.fillRect(b.x+b.w*.16,b.y+b.h*.23,b.w*.18,b.h*.21);ctx.fillRect(b.x+b.w*.4,b.y+b.h*.23,b.w*.17,b.h*.21);ctx.fillRect(b.x+b.w*.64,b.y+b.h*.23,b.w*.2,b.h*.21);}
    ctx.fillStyle='rgba(67,74,68,.45)';for(let n=0;n<2;n++){const q=(b.seed*17+n*37)%1;ctx.fillRect(b.x+10+q*(b.w-42),b.y+b.h*(.57+n*.1),25,17);ctx.fillStyle='rgba(224,215,187,.23)';ctx.fillRect(b.x+13+q*(b.w-42),b.y+b.h*(.57+n*.1)+3,19,2);ctx.fillStyle='rgba(67,74,68,.45)';}if(b.height>65){ctx.fillStyle='rgba(236,211,167,.23)';ctx.fillRect(b.x+b.w*.45,b.y+b.h*.07,35,3);}
  }}
  function drawPalms(){for(const p of palms){ctx.fillStyle='rgba(25,35,27,.3)';ctx.beginPath();ctx.ellipse(p.x+5,p.y+4,p.size*.76,p.size*.42,.4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#655c43';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(p.x,p.y+6);ctx.lineTo(p.x+2,p.y-p.size*.65);ctx.stroke();ctx.fillStyle='#425f48';for(let i=0;i<7;i++){const a=i*Math.PI/3.5;ctx.beginPath();ctx.ellipse(p.x+Math.cos(a)*p.size*.55,p.y-p.size*.62+Math.sin(a)*p.size*.43,p.size*.52,3,a,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#cf9e5e';ctx.beginPath();ctx.arc(p.x,p.y-p.size*.65,2.4,0,Math.PI*2);ctx.fill();}}
  function drawCar(x,y,angle,color,scale=1,hero=false){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fillStyle='rgba(9,14,15,.34)';ctx.beginPath();ctx.ellipse(-1,4,22,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#20272a';ctx.fillRect(-18,-12,9,4);ctx.fillRect(9,-12,9,4);ctx.fillRect(-18,8,9,4);ctx.fillRect(9,8,9,4);ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-22,-9,44,18,5);ctx.fill();ctx.fillStyle=hero?'#c2c8b3':'#34454a';ctx.beginPath();ctx.roundRect(-8,-7,17,14,4);ctx.fill();ctx.fillStyle='rgba(238,237,210,.62)';ctx.fillRect(8,-6,5,12);ctx.fillStyle='#f9dfa1';ctx.fillRect(18,-6,3,4);ctx.fillRect(18,2,3,4);ctx.fillStyle='#d85e4e';ctx.fillRect(-21,-6,2,4);ctx.fillRect(-21,2,2,4);if(hero){ctx.strokeStyle='#f6d487';ctx.lineWidth=1.5;ctx.strokeRect(-22,-9,44,18);}ctx.restore();}
  function drawTarget(){if(completed>=3)return;const [x,y]=currentTarget(),pickup=missionStage==='pickup',pulse=.5+.5*Math.sin(elapsed*3.1),color=pickup?'#f4bd6d':'#d7e782';ctx.save();ctx.globalAlpha=.25+pulse*.18;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,34+pulse*10,0,Math.PI*2);ctx.fill();ctx.restore();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,25+pulse*3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-13,y);ctx.lineTo(x-4,y);ctx.moveTo(x+4,y);ctx.lineTo(x+13,y);ctx.moveTo(x,y-13);ctx.lineTo(x,y-4);ctx.moveTo(x,y+4);ctx.lineTo(x,y+13);ctx.stroke();}
  function drawPedestrian(x,y,angle){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(2,5,8,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#273f3e';ctx.beginPath();ctx.ellipse(0,1,5,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c89166';ctx.beginPath();ctx.arc(4,-4,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e7d4a9';ctx.fillRect(-3,-1,5,3);ctx.restore();}
  function drawMinimap(px,py){
    const mw=mapCanvas.width,mh=mapCanvas.height,scale=.18;mapCtx.clearRect(0,0,mw,mh);mapCtx.fillStyle='#789079';mapCtx.fillRect(0,0,mw,mh);
    mapCtx.save();mapCtx.translate(mw/2-px*scale,mh/2-py*scale);mapCtx.scale(scale,scale);mapCtx.fillStyle='#444b4c';for(let x=200;x<=W;x+=GRID)mapCtx.fillRect(x-ROAD/2,0,ROAD,H);for(let y=200;y<=H;y+=GRID)mapCtx.fillRect(0,y-ROAD/2,W,ROAD);mapCtx.fillStyle='#aa9e83';for(const b of buildings)mapCtx.fillRect(b.x,b.y,b.w,b.h);mapCtx.restore();
    const [tx,ty]=currentTarget();let mx=mw/2+(tx-px)*scale,my=mh/2+(ty-py)*scale;if(mx<8||mx>mw-8||my<8||my>mh-8){const dx=mx-mw/2,dy=my-mh/2,fac=Math.min((mw/2-10)/Math.max(1,Math.abs(dx)),(mh/2-10)/Math.max(1,Math.abs(dy)));mx=mw/2+dx*fac;my=mh/2+dy*fac;}
    mapCtx.fillStyle='#f1c071';mapCtx.beginPath();mapCtx.arc(mx,my,4,0,Math.PI*2);mapCtx.fill();mapCtx.strokeStyle='#fff';mapCtx.lineWidth=1;mapCtx.stroke();mapCtx.save();mapCtx.translate(mw/2,mh/2);mapCtx.rotate(player.inCar?player.carAngle:player.angle);mapCtx.fillStyle='#d9ef83';mapCtx.beginPath();mapCtx.moveTo(0,-6);mapCtx.lineTo(4,4);mapCtx.lineTo(0,2);mapCtx.lineTo(-4,4);mapCtx.closePath();mapCtx.fill();mapCtx.restore();mapCtx.fillStyle='rgba(255,255,255,.12)';mapCtx.fillRect(0,0,mw,1);mapCtx.fillRect(0,mh-1,mw,1);
  }
  function render(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);const px=player.inCar?player.carX:player.x,py=player.inCar?player.carY:player.y,camX=clamp(px-width/2,0,W-width),camY=clamp(py-height/2,0,H-height);
    ctx.save();ctx.translate(-camX,-camY);drawRoads();drawPalms();drawBuildings();drawTarget();for(const t of traffic)drawCar(t.vertical?t.line:t.pos,t.vertical?t.pos:t.line,t.angle,t.color,.88,false);drawCar(player.carX,player.carY,player.carAngle,'#d7aa68',1.13,true);if(!player.inCar)drawPedestrian(player.x,player.y,player.angle);
    const glow=ctx.createRadialGradient(camX+width*.73,camY+height*.14,20,camX+width*.73,camY+height*.14,Math.max(width,height)*.8);glow.addColorStop(0,'rgba(250,198,122,.10)');glow.addColorStop(1,'rgba(250,198,122,0)');ctx.fillStyle=glow;ctx.fillRect(camX,camY,width,height);ctx.restore();drawMinimap(px,py);
  }
  function interact(){if(player.inCar){player.inCar=false;player.speed=0;player.x=player.carX+Math.cos(player.carAngle+Math.PI/2)*30;player.y=player.carY+Math.sin(player.carAngle+Math.PI/2)*30;if(collides(player.x,player.y,8)){player.x=player.carX-Math.cos(player.carAngle+Math.PI/2)*30;player.y=player.carY-Math.sin(player.carAngle+Math.PI/2)*30;}toast('ON FOOT');beep(320,.07);}else if(Math.hypot(player.x-player.carX,player.y-player.carY)<65){player.inCar=true;player.x=player.carX;player.y=player.carY;toast('SENTINEL XS  •  READY TO DRIVE');beep(460,.09);}else toast('GET CLOSER TO A VEHICLE');}
  function togglePause(){if(!running)return;paused=!paused;document.getElementById('pauseOverlay').classList.toggle('hidden',!paused);keys.clear();}
  function onKeyDown(e){const key=e.key.toLowerCase();if(['w','a','s','d',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();if(e.repeat)return;
    if(key==='e'&&running&&!paused)interact();else if(key==='m')togglePause();else if(key==='h'){hudHidden=!hudHidden;document.getElementById('gameShell').classList.toggle('hud-hidden',hudHidden);}else if(key==='escape'&&running)togglePause();
    if(['arrowup','arrowdown','arrowleft','arrowright'].includes(key))keys.add(({arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'})[key]);else keys.add(key);
  }
  function onKeyUp(e){const key=e.key.toLowerCase();keys.delete(key);if(key.startsWith('arrow'))keys.delete(({arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'})[key]);}
  function frame(now){const dt=Math.min(.04,(now-(frame.last||now))/1000);frame.last=now;update(dt);render();requestAnimationFrame(frame);}
  function startGame(){running=true;paused=false;document.getElementById('introOverlay').classList.add('hidden');document.getElementById('pauseOverlay').classList.add('hidden');beep(620,.12);}
  document.getElementById('startBtn').addEventListener('click',startGame);document.getElementById('resumeBtn').addEventListener('click',()=>{paused=false;document.getElementById('pauseOverlay').classList.add('hidden');});
  document.getElementById('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;document.querySelector('#soundBtn span').textContent=soundOn?'SOUND ON':'SOUND OFF';if(soundOn)beep();});
  window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',()=>keys.clear());window.addEventListener('resize',resize);
  makeCity();resize();updateMissionUI();updateHud();requestAnimationFrame(frame);
})();
