// 行動儀表板的色譜框與施放環：只負責畫面，不讀寫遊戲規則。
// 由 exploration-ui 呼叫 create()／update()／dispose()；瀏覽器不支援 canvas 時安靜略過。
(function(){
  var TAU=Math.PI*2;
  // 深色紙面用發光配色；淺色紙面改成墨色線條，框內保持紙色。藍、青預設為維多利亞版。
  var PALETTES={
    basic:{frame:'plain',pip:'blade',c:{hi:'#f0d8a4',main:'#c9a25e',deep:'#3a2c16',glow:'#e0b060'},ink:'#765124'},
    red:{frame:'thorn',pip:'blade',c:{hi:'#ff8a70',main:'#e0453a',deep:'#5a1612',glow:'#ff3b2b'},ink:'#a4412a'},
    blue:{frame:'rapier',pip:'card',c:{hi:'#cfdcf0',main:'#5a80bd',deep:'#16223f',glow:'#5f86c8',metal:'#c3c8d2'},ink:'#265f97',inkMetal:'#5d6778'},
    yellow:{frame:'crescent',pip:'drop',c:{hi:'#ffd98a',main:'#e0a332',deep:'#4a3208',glow:'#ffb52e'},ink:'#816516'},
    green:{frame:'vine',pip:'leaf',c:{hi:'#c4f0a0',main:'#6cbf4e',deep:'#17361a',glow:'#8ee25a'},ink:'#386c3d'},
    purple:{frame:'rune',pip:'star',c:{hi:'#e2b8ff',main:'#a866ee',deep:'#2c1250',glow:'#c070ff'},ink:'#745196'},
    cyan:{frame:'brass',pip:'gear',c:{hi:'#d4eeee',main:'#4f9dab',deep:'#0f2b37',glow:'#5aaab8',metal:'#c9a45a'},ink:'#1f6b78',inkMetal:'#8a6424'}
  };
  function rgba(hex,a){var n=parseInt(hex.slice(1),16);return'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')';}
  function palette(color,light){
    var p=PALETTES[color]||PALETTES.basic,c=p.c;
    if(!light)return{frame:p.frame,pip:p.pip,c:{hi:c.hi,main:c.main,deep:c.deep,glow:c.glow,metal:c.metal,off:'rgba(0,0,0,.35)',track:'rgba(255,255,255,.08)',flash:'#ffffff',light:false}};
    return{frame:p.frame,pip:p.pip,c:{hi:p.ink,main:p.ink,deep:'#eadcbd',glow:rgba(p.ink,.28),metal:c.metal&&p.inkMetal,off:rgba(p.ink,.1),track:rgba(p.ink,.14),flash:'#b0302a',light:true}};
  }
  function fit(cv){
    var r=cv.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
    if(cv.width!==Math.round(w*d)||cv.height!==Math.round(h*d)){cv.width=Math.round(w*d);cv.height=Math.round(h*d);}
    var ctx=cv.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
    return{ctx:ctx,w:w,h:h};
  }
  function rand(seed){var s=seed;return function(){return(s=(s*16807)%2147483647)/2147483647;};}
  function star4(ctx,x,y,L,S,rot){
    rot=rot||0;ctx.beginPath();
    for(var i=0;i<8;i++){var a=rot+i*Math.PI/4-Math.PI/2,r=i%2?S:L;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}
    ctx.closePath();
  }
  function starN(ctx,x,y,n,R,r,rot){
    rot=rot||0;ctx.beginPath();
    for(var i=0;i<n*2;i++){var a=rot+i*Math.PI/n-Math.PI/2,rr=i%2?r:R;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}
    ctx.closePath();
  }
  function glow(ctx,color,shadow,width,blur){ctx.save();ctx.shadowColor=shadow;ctx.shadowBlur=blur;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.restore();}
  function hexagon(ctx,x,y,r,rot){rot=rot||0;ctx.beginPath();for(var i=0;i<6;i++){var a=rot+i*TAU/6;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}ctx.closePath();}
  function scroll(ctx,x,y,r,dir,flip){ // 小渦卷：從 (x,y) 起往內捲
    ctx.beginPath();
    var cx=flip?x:x-r,cy=flip?y-r:y,a0=flip?Math.PI/2:0;
    for(var t=0;t<=9;t+=.25){var rr=r*(1-t/11),a=a0+dir*t;ctx.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr);}
  }
  function gear(ctx,x,y,R,n,rot){
    rot=rot||0;ctx.beginPath();
    for(var i=0;i<n*4;i++){var a=rot+i*TAU/(n*4),rr=(i%4<2)?R:R*.8;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}
    ctx.closePath();
  }
  function roundRect(ctx,x,y,w,h,r){
    r=Math.min(r,w/2,h/2);ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  }
  function fillPanel(ctx,w,h,c){
    var g=ctx.createLinearGradient(0,0,0,h);
    if(c.light){g.addColorStop(0,'#f6ecd4');g.addColorStop(1,'#ecdcbb');}
    else{g.addColorStop(0,rgba(c.deep,.95));g.addColorStop(.45,'#14161c');g.addColorStop(1,'#0e1014');}
    ctx.fillStyle=g;ctx.fill();
    var r=ctx.createRadialGradient(w*.75,h*.3,10,w*.75,h*.3,Math.max(w,h)*.6);
    r.addColorStop(0,c.light?rgba(c.main,.1):rgba(c.glow,.2));r.addColorStop(1,rgba(c.light?c.main:c.glow,0));
    ctx.save();ctx.clip();ctx.fillStyle=r;ctx.fillRect(0,0,w,h);ctx.restore();
  }
  function corners(w,h,m){return[[m,m],[w-m,m],[m,h-m],[w-m,h-m]];}

  // 面板框：每色一種框語言，版面位置共用。m 是框線離畫布邊緣的距離。
  var FRAMES={
    plain:function(ctx,w,h,c,m){
      roundRect(ctx,m,m,w-2*m,h-2*m,4);fillPanel(ctx,w,h,c);glow(ctx,c.main,c.glow,1.4,6);
      roundRect(ctx,m+5,m+5,w-2*m-10,h-2*m-10,2);ctx.strokeStyle=rgba(c.main,.3);ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=c.hi;corners(w,h,m).forEach(function(p){star4(ctx,p[0],p[1],9,2.4,Math.PI/4);ctx.fill();});
    },
    thorn:function(ctx,w,h,c,m){ // 紅：對稱荊棘，尖角向外
      var b=12,L=Math.min(7,m-1),x,y;
      ctx.beginPath();
      ctx.moveTo(m+b,m);ctx.lineTo(w-m-b,m);ctx.lineTo(w-m,m+b);ctx.lineTo(w-m,h-m-b);ctx.lineTo(w-m-b,h-m);ctx.lineTo(m+b,h-m);ctx.lineTo(m,h-m-b);ctx.lineTo(m,m+b);ctx.closePath();
      fillPanel(ctx,w,h,c);glow(ctx,c.main,c.glow,1.6,10);
      ctx.beginPath();ctx.rect(m+6,m+6,w-2*m-12,h-2*m-12);ctx.strokeStyle=rgba(c.main,.3);ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=c.main;
      function spike(x,y,dx,dy){
        var px=-dy,py=dx;
        ctx.beginPath();ctx.moveTo(x+px*3.5,y+py*3.5);ctx.lineTo(x+dx*L,y+dy*L);ctx.lineTo(x-px*3.5,y-py*3.5);ctx.closePath();
        ctx.save();ctx.shadowColor=c.glow;ctx.shadowBlur=6;ctx.fill();ctx.restore();
      }
      for(x=m+36;x<w-m-28;x+=42){spike(x,m,0,-1);spike(x+21,h-m,0,1);}
      for(y=m+36;y<h-m-28;y+=42){spike(m,y,-1,0);spike(w-m,y,1,0);}
      ctx.fillStyle=c.hi;
      corners(w,h,m).forEach(function(p){star4(ctx,p[0],p[1],12,3,Math.PI/4);ctx.save();ctx.shadowColor=c.glow;ctx.shadowBlur=12;ctx.fill();ctx.restore();});
      star4(ctx,w/2,h-m,11,2.6);ctx.fill();
    },
    crescent:function(ctx,w,h,c,m){ // 黃：新月凹口、下緣滴落、蜂巢角
      var cx=w/2,q=Math.min(56,w*.16),rr=rand(7),x;
      ctx.beginPath();
      ctx.moveTo(m+10,m);ctx.lineTo(cx-q,m);ctx.quadraticCurveTo(cx,m+20,cx+q,m);
      ctx.lineTo(w-m-10,m);ctx.quadraticCurveTo(w-m,m,w-m,m+10);ctx.lineTo(w-m,h-m-10);ctx.quadraticCurveTo(w-m,h-m,w-m-10,h-m);
      ctx.lineTo(m+10,h-m);ctx.quadraticCurveTo(m,h-m,m,h-m-10);ctx.lineTo(m,m+10);ctx.quadraticCurveTo(m,m,m+10,m);ctx.closePath();
      fillPanel(ctx,w,h,c);glow(ctx,c.main,c.glow,1.6,10);
      ctx.beginPath();ctx.arc(cx,m+1,11,0,TAU);ctx.arc(cx+5,m-2,10,0,TAU,true);
      ctx.fillStyle=c.hi;ctx.save();ctx.shadowColor=c.glow;ctx.shadowBlur=12;ctx.fill('evenodd');ctx.restore();
      for(x=m+28;x<w-m-20;x+=30+rr()*28){
        var len=4+rr()*Math.max(2,m-4);
        ctx.beginPath();ctx.moveTo(x-2.2,h-m);ctx.lineTo(x-1,h-m+len);ctx.arc(x,h-m+len,2.2,Math.PI,0,true);ctx.lineTo(x+2.2,h-m);ctx.closePath();
        ctx.fillStyle=rgba(c.main,.85);ctx.fill();
      }
      corners(w,h,m).forEach(function(p,k){
        for(var i=0;i<3;i++){
          var ox=[0,10,5][i]*(k%2?-1:1),oy=[0,0,8.6][i]*(k>1?-1:1);
          hexagon(ctx,p[0]+ox,p[1]+oy,5.8,Math.PI/6);ctx.strokeStyle=i?rgba(c.hi,.55):c.hi;ctx.lineWidth=1.2;ctx.stroke();
        }
      });
    },
    vine:function(ctx,w,h,c,m){ // 綠：圓潤外框，藤蔓與葉片
      var r=24;
      roundRect(ctx,m,m,w-2*m,h-2*m,r);fillPanel(ctx,w,h,c);glow(ctx,c.main,c.glow,1.6,8);
      function leaf(x,y,a,s){
        ctx.save();ctx.translate(x,y);ctx.rotate(a);
        ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(s*.5,-s*.45,s,0);ctx.quadraticCurveTo(s*.5,s*.45,0,0);
        ctx.fillStyle=rgba(c.main,.9);ctx.fill();ctx.strokeStyle=c.hi;ctx.lineWidth=.7;ctx.stroke();ctx.restore();
      }
      [m,h-m].forEach(function(y0,side){
        var x;
        ctx.beginPath();
        for(x=m+r;x<=w-m-r;x+=2)ctx.lineTo(x,y0+Math.sin(x/18)*3);
        ctx.strokeStyle=rgba(c.hi,.6);ctx.lineWidth=1.2;ctx.stroke();
        for(x=m+r+18;x<w-m-r;x+=34){var up=Math.sin(x/18)>0?1:-1;leaf(x,y0+Math.sin(x/18)*3,(side?1:-1)*(Math.PI/2-.5*up),9);}
      });
      [[m+5,m+5,0],[w-m-5,m+5,1],[w-m-5,h-m-5,2],[m+5,h-m-5,3]].forEach(function(p){
        ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(p[2]*Math.PI/2);
        ctx.beginPath();
        for(var t=0;t<12;t+=.2){var rr=13-t;ctx.lineTo(Math.cos(t*.9)*rr+8,Math.sin(t*.9)*rr+8);}
        ctx.strokeStyle=c.hi;ctx.lineWidth=1.2;ctx.stroke();
        leaf(18,3,-.3,11);leaf(3,18,1.8,11);
        ctx.restore();
      });
    },
    rune:function(ctx,w,h,c,m){ // 紫：四角小魔法陣，下緣符文列
      var rr=rand(11),x;
      roundRect(ctx,m,m,w-2*m,h-2*m,6);fillPanel(ctx,w,h,c);glow(ctx,c.main,c.glow,1.4,10);
      roundRect(ctx,m+6,m+6,w-2*m-12,h-2*m-12,3);ctx.strokeStyle=rgba(c.main,.3);ctx.lineWidth=1;ctx.stroke();
      function circle(x,y,R){
        ctx.fillStyle=c.deep;ctx.beginPath();ctx.arc(x,y,R,0,TAU);ctx.fill();
        ctx.beginPath();ctx.arc(x,y,R,0,TAU);glow(ctx,c.main,c.glow,1.2,8);
        ctx.beginPath();ctx.arc(x,y,R*.72,0,TAU);ctx.strokeStyle=rgba(c.hi,.6);ctx.lineWidth=.8;ctx.stroke();
        starN(ctx,x,y,5,R*.7,R*.28);ctx.strokeStyle=c.hi;ctx.lineWidth=.9;ctx.stroke();
        for(var i=0;i<16;i++){var a=i*TAU/16;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*R*.78,y+Math.sin(a)*R*.78);ctx.lineTo(x+Math.cos(a)*R*.92,y+Math.sin(a)*R*.92);ctx.stroke();}
      }
      corners(w,h,m+2).forEach(function(p){circle(p[0],p[1],11);});
      ctx.strokeStyle=rgba(c.hi,.5);ctx.lineWidth=1;
      for(x=m+30;x<w-m-26;x+=14){
        var y=h-m-9;ctx.beginPath();
        ctx.moveTo(x,y-3+rr()*2);ctx.lineTo(x+3+rr()*3,y+rr()*3-1.5);ctx.lineTo(x+rr()*5,y+3);
        if(rr()>.5){ctx.moveTo(x+1,y);ctx.lineTo(x+5,y);}
        ctx.stroke();
      }
    },
    rapier:function(ctx,w,h,c,m){ // 藍（維多利亞）：內凹角框、雙刻線、銀色渦卷、黑桃尖頂、下緣細劍
      var k=12,M=c.metal,cx=w/2,top=Math.max(1,m-10),y=h-m,bx0=m+58,bx1=w-m-36;
      function cart(o,kk){
        var x0=m+o,y0=m+o,x1=w-m-o,y1=h-m-o;
        ctx.beginPath();
        ctx.moveTo(x0+kk,y0);ctx.lineTo(x1-kk,y0);ctx.arc(x1,y0,kk,Math.PI,Math.PI/2,true);
        ctx.lineTo(x1,y1-kk);ctx.arc(x1,y1,kk,-Math.PI/2,Math.PI,true);
        ctx.lineTo(x0+kk,y1);ctx.arc(x0,y1,kk,0,-Math.PI/2,true);
        ctx.lineTo(x0,y0+kk);ctx.arc(x0,y0,kk,Math.PI/2,0,true);ctx.closePath();
      }
      cart(0,k);fillPanel(ctx,w,h,c);glow(ctx,M,c.glow,1.6,4);
      cart(5,k-2);ctx.strokeStyle=rgba(c.hi,.3);ctx.lineWidth=1;ctx.stroke();
      [[m,m,1,1],[w-m,m,-1,1],[m,h-m,1,-1],[w-m,h-m,-1,-1]].forEach(function(p){
        ctx.save();ctx.translate(p[0],p[1]);ctx.scale(p[2],p[3]);
        ctx.strokeStyle=M;ctx.lineWidth=1.3;
        scroll(ctx,26,7,6,1);ctx.stroke();scroll(ctx,7,26,6,-1,true);ctx.stroke();
        ctx.beginPath();ctx.arc(9,9,2.2,0,TAU);ctx.fillStyle=M;ctx.fill();
        ctx.restore();
      });
      ctx.beginPath();ctx.moveTo(cx,top);ctx.bezierCurveTo(cx+9,m-3,cx+8,m+5,cx,m+1);ctx.bezierCurveTo(cx-8,m+5,cx-9,m-3,cx,top);
      ctx.fillStyle=M;ctx.fill();
      [-1,1].forEach(function(d){ctx.beginPath();ctx.moveTo(cx+d*13,m);ctx.quadraticCurveTo(cx+d*36,m-6,cx+d*62,m);ctx.strokeStyle=rgba(M,.7);ctx.lineWidth=1;ctx.stroke();});
      // 下緣：橫放的杯形護手細劍，劍尖向右
      ctx.beginPath();ctx.moveTo(bx0,y-1.8);ctx.lineTo(bx1,y);ctx.lineTo(bx0,y+1.8);ctx.closePath();
      ctx.fillStyle=rgba(c.hi,.85);ctx.fill();
      ctx.strokeStyle=M;
      ctx.beginPath();ctx.moveTo(bx0+6,y-8);ctx.quadraticCurveTo(bx0-4,y,bx0+6,y+8);ctx.lineWidth=2;ctx.stroke();
      ctx.beginPath();ctx.moveTo(bx0-2,y-m+1);ctx.lineTo(bx0-2,y+m-1);ctx.lineWidth=1.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(bx0-2,y);ctx.lineTo(bx0-22,y);ctx.lineWidth=3;ctx.stroke();
      ctx.beginPath();ctx.arc(bx0-25,y,3.2,0,TAU);ctx.fillStyle=M;ctx.fill();
    },
    brass:function(ctx,w,h,c,m){ // 青（維多利亞）：黃銅製圖台，曬圖紙格線、鉚釘、角落齒輪、上緣尺規
      var M=c.metal,x,y,j,cx=w/2,py=h-m-2;
      roundRect(ctx,m,m,w-2*m,h-2*m,4);fillPanel(ctx,w,h,c);
      ctx.save();ctx.beginPath();ctx.rect(m+7,m+7,w-2*m-14,h-2*m-14);ctx.clip();
      ctx.strokeStyle=rgba(c.hi,c.light?.07:.05);ctx.lineWidth=1;
      for(x=m+7;x<w;x+=20){ctx.beginPath();ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,h);ctx.stroke();}
      for(y=m+7;y<h;y+=20){ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(w,y+.5);ctx.stroke();}
      ctx.restore();
      roundRect(ctx,m,m,w-2*m,h-2*m,4);glow(ctx,M,rgba(M,.5),2,3);
      ctx.beginPath();ctx.rect(m+7,m+7,w-2*m-14,h-2*m-14);ctx.strokeStyle=rgba(M,.45);ctx.lineWidth=1;ctx.stroke();
      function rivet(x,y){
        var g=ctx.createRadialGradient(x-1,y-1,.3,x,y,3);
        g.addColorStop(0,'#fff1c8');g.addColorStop(.5,M);g.addColorStop(1,'#4a3614');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,2.7,0,TAU);ctx.fill();
      }
      for(x=m+46;x<w-m-36;x+=40){rivet(x,m+3.5);rivet(x,h-m-3.5);}
      for(y=m+46;y<h-m-36;y+=40){rivet(m+3.5,y);rivet(w-m-3.5,y);}
      corners(w,h,m).forEach(function(p,i){
        var gx=p[0],gy=p[1];
        gear(ctx,gx,gy,14,11,i*.3);ctx.fillStyle=c.deep;ctx.fill();glow(ctx,M,rgba(M,.5),1.3,3);
        ctx.beginPath();ctx.arc(gx,gy,6,0,TAU);ctx.strokeStyle=M;ctx.lineWidth=1;ctx.stroke();
        for(var s=0;s<4;s++){var a=s*Math.PI/2+i*.3;ctx.beginPath();ctx.moveTo(gx+Math.cos(a)*2.6,gy+Math.sin(a)*2.6);ctx.lineTo(gx+Math.cos(a)*6,gy+Math.sin(a)*6);ctx.stroke();}
        rivet(gx,gy);
      });
      ctx.strokeStyle=rgba(M,.8);ctx.lineWidth=1;
      for(x=m+40,j=0;x<w-m-40;x+=10,j++){ctx.beginPath();ctx.moveTo(x,m+7);ctx.lineTo(x,m+7+(j%5?3:6));ctx.stroke();}
      // 下緣中央：小分規
      ctx.strokeStyle=M;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(cx,py-16);ctx.lineTo(cx-8,py);ctx.moveTo(cx,py-16);ctx.lineTo(cx+8,py);ctx.stroke();
      ctx.beginPath();ctx.arc(cx,py-16,2.8,0,TAU);ctx.fillStyle=M;ctx.fill();
    }
  };

  // 標題橫牌：放在「紅 · 破壞」等字的後方，兩端依框語言變形。
  function drawTitlePlate(ctx,cx,y,w,c,frame){
    var hw=Math.min(84,w*.3),hh=11,k=8,g;
    ctx.beginPath();
    if(frame==='vine')roundRect(ctx,cx-hw,y-hh,hw*2,hh*2,hh);
    else if(frame==='brass')roundRect(ctx,cx-hw,y-hh,hw*2,hh*2,3);
    else if(frame==='rapier'){ctx.moveTo(cx-hw+k,y-hh);ctx.lineTo(cx+hw-k,y-hh);ctx.arc(cx+hw,y-hh,k,Math.PI,Math.PI/2,true);ctx.lineTo(cx+hw+7,y);ctx.lineTo(cx+hw,y+hh-k);ctx.arc(cx+hw,y+hh,k,-Math.PI/2,Math.PI,true);ctx.lineTo(cx-hw+k,y+hh);ctx.arc(cx-hw,y+hh,k,0,-Math.PI/2,true);ctx.lineTo(cx-hw-7,y);ctx.lineTo(cx-hw,y-hh+k);ctx.arc(cx-hw,y-hh,k,Math.PI/2,0,true);}
    else if(frame==='thorn'){
      // 荊棘：兩端拉長成尖刺，上下緣各兩根小刺。
      var tx=hw*.55;
      ctx.moveTo(cx-hw-18,y);ctx.lineTo(cx-hw,y-hh);
      [-tx,tx].forEach(function(dx){ctx.lineTo(cx+dx-4,y-hh);ctx.lineTo(cx+dx+2,y-hh-6);ctx.lineTo(cx+dx+4,y-hh);});
      ctx.lineTo(cx+hw,y-hh);ctx.lineTo(cx+hw+18,y);ctx.lineTo(cx+hw,y+hh);
      [tx,-tx].forEach(function(dx){ctx.lineTo(cx+dx+4,y+hh);ctx.lineTo(cx+dx-2,y+hh+6);ctx.lineTo(cx+dx-4,y+hh);});
      ctx.lineTo(cx-hw,y+hh);
    }
    else if(frame==='crescent'){
      // 新月：兩端向內凹，上下角成為月牙尖。
      ctx.moveTo(cx-hw-10,y-hh);ctx.lineTo(cx+hw+10,y-hh);ctx.quadraticCurveTo(cx+hw-8,y,cx+hw+10,y+hh);
      ctx.lineTo(cx-hw-10,y+hh);ctx.quadraticCurveTo(cx-hw+8,y,cx-hw-10,y-hh);
    }
    else if(frame==='rune'){
      // 符文：切角石板，兩端外側各一顆菱形。
      var cut=6,dx2=hw+13;
      ctx.moveTo(cx-hw+cut,y-hh);ctx.lineTo(cx+hw-cut,y-hh);ctx.lineTo(cx+hw,y-hh+cut);ctx.lineTo(cx+hw,y+hh-cut);ctx.lineTo(cx+hw-cut,y+hh);
      ctx.lineTo(cx-hw+cut,y+hh);ctx.lineTo(cx-hw,y+hh-cut);ctx.lineTo(cx-hw,y-hh+cut);ctx.closePath();
      [-dx2,dx2].forEach(function(d){ctx.moveTo(cx+d,y-6);ctx.lineTo(cx+d+5,y);ctx.lineTo(cx+d,y+6);ctx.lineTo(cx+d-5,y);ctx.closePath();});
    }
    else{ctx.moveTo(cx-hw-14,y);ctx.lineTo(cx-hw,y-hh);ctx.lineTo(cx+hw,y-hh);ctx.lineTo(cx+hw+14,y);ctx.lineTo(cx+hw,y+hh);ctx.lineTo(cx-hw,y+hh);}
    ctx.closePath();
    g=ctx.createLinearGradient(cx-hw,0,cx+hw,0);
    if(c.light){g.addColorStop(0,rgba(c.main,.05));g.addColorStop(.5,rgba(c.main,.16));g.addColorStop(1,rgba(c.main,.05));}
    else{g.addColorStop(0,rgba(c.deep,.9));g.addColorStop(.5,rgba(c.main,.42));g.addColorStop(1,rgba(c.deep,.9));}
    ctx.fillStyle=g;ctx.fill();
    if(!c.metal){glow(ctx,c.hi,c.glow,1.2,8);return;}
    glow(ctx,c.metal,rgba(c.metal,.4),1.5,3);
    if(frame==='brass')[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(p){
      ctx.beginPath();ctx.arc(cx+p[0]*(hw-6),y+p[1]*5,2.2,0,TAU);ctx.fillStyle=c.metal;ctx.fill();
    });
  }

  // 施放環的裝飾層；rot 是動態角度，減少動態時固定為 0。
  function ringDeco(ctx,cx,cy,r,R,c,f,rot){
    var n,a,x,y,M=c.metal,rr;
    ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);glow(ctx,c.main,c.glow,2,10);
    ctx.beginPath();ctx.arc(cx,cy,r-5,0,TAU);ctx.strokeStyle=rgba(c.hi,.35);ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=c.hi;ctx.strokeStyle=c.hi;
    if(f==='thorn'){
      for(n=0;n<8;n++){
        a=n*TAU/8+Math.PI/8;x=cx+Math.cos(a)*r;y=cy+Math.sin(a)*r;var L=n%2?R*.075:R*.13;
        ctx.beginPath();ctx.moveTo(x+Math.cos(a+1.57)*3.5,y+Math.sin(a+1.57)*3.5);
        ctx.lineTo(x+Math.cos(a)*L,y+Math.sin(a)*L);ctx.lineTo(x-Math.cos(a+1.57)*3.5,y-Math.sin(a+1.57)*3.5);
        ctx.save();ctx.shadowColor=c.glow;ctx.shadowBlur=8;ctx.fillStyle=c.main;ctx.fill();ctx.restore();
      }
      [0,Math.PI].forEach(function(b){star4(ctx,cx+Math.cos(b)*r,cy+Math.sin(b)*r,9,2.2);ctx.fill();});
    }else if(f==='crescent'){
      ctx.beginPath();ctx.arc(cx,cy,r+7,Math.PI*.95+rot*.3,Math.PI*1.75+rot*.3);glow(ctx,c.hi,c.glow,2.6,12);
      for(n=0;n<12;n++){a=n*TAU/12+rot*.3;hexagon(ctx,cx+Math.cos(a)*(r-12),cy+Math.sin(a)*(r-12),2.8);ctx.strokeStyle=rgba(c.hi,.5);ctx.lineWidth=.8;ctx.stroke();}
    }else if(f==='vine'){
      for(n=0;n<18;n++){
        a=n*TAU/18+rot*.15;x=cx+Math.cos(a)*(r+3);y=cy+Math.sin(a)*(r+3);
        ctx.save();ctx.translate(x,y);ctx.rotate(a+(n%2?.9:-.9));
        ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(5,-3.5,10,0);ctx.quadraticCurveTo(5,3.5,0,0);
        ctx.fillStyle=rgba(c.main,.9);ctx.fill();ctx.restore();
      }
    }else if(f==='rune'){
      rr=rand(3);
      ctx.save();ctx.translate(cx,cy);
      ctx.rotate(rot*.4);starN(ctx,0,0,6,r-7,(r-7)*.5);ctx.strokeStyle=rgba(c.hi,.3);ctx.lineWidth=1;ctx.stroke();
      ctx.rotate(-rot*.9);
      ctx.beginPath();ctx.arc(0,0,r+9,0,TAU);ctx.strokeStyle=rgba(c.main,.6);ctx.stroke();
      ctx.strokeStyle=c.hi;
      for(n=0;n<24;n++){ctx.save();ctx.rotate(n*TAU/24);ctx.translate(r+9,0);ctx.beginPath();ctx.moveTo(-2.5,-2);ctx.lineTo(rr()*3.5-1,2.5);ctx.lineTo(2.5,-1+rr()*2);ctx.stroke();ctx.restore();}
      ctx.restore();
    }else if(f==='rapier'){ // 懷錶錶圈，三把細劍像指針以不同速度轉動
      ctx.beginPath();ctx.arc(cx,cy,r+11,0,TAU);ctx.strokeStyle=rgba(M,.7);ctx.lineWidth=1.2;ctx.stroke();
      for(n=0;n<60;n++){
        a=n*TAU/60;var tick=n%5?3:6;
        ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(r+3),cy+Math.sin(a)*(r+3));ctx.lineTo(cx+Math.cos(a)*(r+3+tick),cy+Math.sin(a)*(r+3+tick));
        ctx.strokeStyle=rgba(M,n%5?.45:.95);ctx.lineWidth=n%5?1:1.5;ctx.stroke();
      }
      [[1,.55,r+9],[-.37,.75,r+2],[.12,1,r+13]].forEach(function(h,k){
        ctx.save();ctx.translate(cx,cy);ctx.rotate(rot*h[0]+k*2.1);ctx.globalAlpha=h[1];
        ctx.beginPath();ctx.moveTo(r-14,-1.4);ctx.lineTo(h[2],0);ctx.lineTo(r-14,1.4);ctx.closePath();ctx.fillStyle=c.hi;ctx.fill();
        ctx.beginPath();ctx.moveTo(r-14,-4.5);ctx.lineTo(r-14,4.5);ctx.strokeStyle=M;ctx.lineWidth=1.5;ctx.stroke();
        ctx.restore();
      });
    }else if(f==='brass'){ // 緩慢轉動的黃銅齒圈，旁邊咬合一顆小齒輪
      gear(ctx,cx,cy,r+10,28,rot*.12);ctx.strokeStyle=rgba(M,.85);ctx.lineWidth=1.3;ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy,r+3,0,TAU);ctx.strokeStyle=rgba(M,.5);ctx.lineWidth=1;ctx.stroke();
      for(n=0;n<4;n++){a=Math.PI/4+n*Math.PI/2;ctx.beginPath();ctx.arc(cx+Math.cos(a)*(r-9),cy+Math.sin(a)*(r-9),2.3,0,TAU);ctx.fillStyle=M;ctx.fill();}
      a=Math.PI*.97;x=cx+Math.cos(a)*(r+18);y=cy+Math.sin(a)*(r+18);
      gear(ctx,x,y,9,8,-rot*.45);ctx.fillStyle=c.deep;ctx.fill();ctx.strokeStyle=M;ctx.lineWidth=1.1;ctx.stroke();
      ctx.beginPath();ctx.arc(x,y,2.6,0,TAU);ctx.fillStyle=M;ctx.fill();
    }else{
      for(n=0;n<4;n++){a=n*Math.PI/2+Math.PI/4;star4(ctx,cx+Math.cos(a)*r,cy+Math.sin(a)*r,6,1.8);ctx.fill();}
    }
  }
  // 環上的資源單格：刀片、撲克牌、水滴、葉片、星形、齒輪。
  function pip(ctx,type,x,y,s,a,lit,c){
    ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI/2);
    ctx.beginPath();
    if(type==='blade'){ctx.moveTo(0,-s*1.6);ctx.lineTo(s*.55,0);ctx.lineTo(0,s*.9);ctx.lineTo(-s*.55,0);}
    else if(type==='drop'){ctx.moveTo(0,-s*1.4);ctx.bezierCurveTo(s,-s*.2,s*.8,s,0,s);ctx.bezierCurveTo(-s*.8,s,-s,-s*.2,0,-s*1.4);}
    else if(type==='star'){ctx.restore();ctx.save();ctx.translate(x,y);starN(ctx,0,0,4,s*1.3,s*.4);}
    else if(type==='card'){ctx.rotate(-.3);roundRect(ctx,-s*.72,-s*1.05,s*1.44,s*2.1,2);}
    else if(type==='gear'){for(var k=0;k<16;k++){var aa=k*TAU/16,rr=k%2?s*.75:s;ctx.lineTo(Math.cos(aa)*rr,Math.sin(aa)*rr);}}
    else ctx.ellipse(0,0,s*.5,s*1.2,0,0,TAU);
    ctx.closePath();
    if(lit){
      ctx.shadowColor=c.glow;ctx.shadowBlur=c.metal?5:10;ctx.fillStyle=c.hi;ctx.fill();
      if(type==='card'&&c.metal){ctx.shadowBlur=0;ctx.strokeStyle=c.metal;ctx.lineWidth=1;ctx.stroke();star4(ctx,0,0,s*.55,s*.2);ctx.fillStyle=c.deep;ctx.fill();}
    }else{ctx.fillStyle=c.off;ctx.fill();ctx.strokeStyle=rgba(c.main,.5);ctx.lineWidth=1;ctx.stroke();}
    ctx.restore();
  }

  function create(options){
    options=options||{};
    var dashboard=options.dashboard,execute=options.execute,root=options.root||document.documentElement;
    var noop={update:function(){},dispose:function(){}};
    if(!dashboard||!execute||!document.createElement('canvas').getContext)return noop;
    var frame=document.createElement('canvas'),ring=document.createElement('canvas');
    frame.className='dashboard-frame';ring.className='spectrum-ring';
    frame.setAttribute('aria-hidden','true');ring.setAttribute('aria-hidden','true');
    dashboard.insertBefore(frame,dashboard.firstChild);execute.appendChild(ring);
    // 遊戲自己的「介面動態」設定（motion.js），不跟隨系統的減少動態效果。
    var media=(window.ExplorationMotion?window.ExplorationMotion.query('ui'):{matches:false,addEventListener:function(){},removeEventListener:function(){}});
    var view={color:'basic',cost:0,costMax:0,pending:0,ready:false,pips:null};
    var raf=0,frameKey='',disposed=false,art={scale:false,inner:.62};
    // 版面可用 CSS 變數調整繪圖：--art-scale: auto 讓線寬與裝飾隨尺寸等比縮放（以框寬 424px、施放環 240px 為設計尺寸）；
    // --art-ring-inner 設定施放環內圈半徑比例（預設 .62）。未設定時維持原本的固定像素畫法。
    function readArt(){
      var style=window.getComputedStyle?getComputedStyle(dashboard):null,inner=style?parseFloat(style.getPropertyValue('--art-ring-inner')):NaN;
      return{scale:!!style&&style.getPropertyValue('--art-scale').trim()==='auto',inner:inner>.3&&inner<.95?inner:.62};
    }
    function light(){return root.getAttribute('data-theme')==='light';}
    function still(){return!!(media&&media.matches);}
    function visible(){return!document.hidden&&dashboard.getClientRects().length>0;}
    function drawFrame(){
      var rect=dashboard.getBoundingClientRect(),heading=dashboard.querySelector('.dashboard-heading');
      var hy=heading?heading.offsetTop+heading.offsetHeight/2:24,isLight=light();
      art=readArt();
      var key=[Math.round(rect.width),Math.round(rect.height),view.color,isLight,Math.round(hy),heading?heading.textContent:'',art.scale,art.inner].join('|');
      if(key===frameKey||!rect.width)return;
      frameKey=key;
      var f=fit(frame),p=palette(view.color,isLight),k=art.scale?Math.max(.5,f.w/424):1,w=f.w/k,h=f.h/k,m=w<360?7:9;
      f.ctx.save();f.ctx.scale(k,k);
      (FRAMES[p.frame]||FRAMES.plain)(f.ctx,w,h,p.c,m);
      if(heading&&heading.textContent)drawTitlePlate(f.ctx,w/2,hy/k,w,p.c,p.frame);
      f.ctx.restore();
    }
    function drawRing(t){
      var f=fit(ring),ctx=f.ctx,p=palette(view.color,light()),c=p.c,k,a;
      var zoom=art.scale?Math.max(.4,Math.min(f.w,f.h)/240):1;ctx.save();ctx.scale(zoom,zoom);
      var cx=f.w/zoom/2,cy=f.h/zoom/2,R=Math.min(f.w,f.h)/zoom/2,moving=!still(),rot=moving?t/1000:0;
      var pulse=moving?.5+.5*Math.sin(t/260):.75;
      var bg=ctx.createRadialGradient(cx,cy,R*.2,cx,cy,R*.7);
      bg.addColorStop(0,rgba(c.light?c.main:c.glow,view.ready?(c.light?.16:.3):.08));bg.addColorStop(1,rgba(c.light?c.main:c.deep,0));
      ctx.fillStyle=bg;ctx.beginPath();ctx.arc(cx,cy,R*.7,0,TAU);ctx.fill();
      ringDeco(ctx,cx,cy,R*art.inner,R,c,p.frame,rot);
      // 上弧：本色主資源；本次要投入的格子閃爍。
      var P=view.pips,a0=Math.PI*1.16,a1=Math.PI*1.84;
      if(P&&P.max>0){
        var n=Math.max(0,Math.min(P.value,P.max));
        if(P.max>8){
          ctx.lineCap='round';
          ctx.beginPath();ctx.arc(cx,cy,R*.86,a0,a1);ctx.strokeStyle=rgba(c.main,.18);ctx.lineWidth=6;ctx.stroke();
          if(n>0){ctx.beginPath();ctx.arc(cx,cy,R*.86,a0,a0+(a1-a0)*n/P.max);glow(ctx,c.hi,c.glow,6,10);}
          ctx.lineCap='butt';
        }else for(k=0;k<P.max;k++){
          a=a0+(a1-a0)*(P.max===1?.5:k/(P.max-1));
          var spend=k<n&&k>=n-(P.spend||0);
          ctx.save();if(spend)ctx.globalAlpha=.35+.65*pulse;
          pip(ctx,P.type||p.pip,cx+Math.cos(a)*R*.86,cy+Math.sin(a)*R*.86,R*.068,a,k<n,spend?{hi:c.flash,main:c.main,glow:c.glow,deep:c.deep,metal:c.metal,off:c.off}:c);
          ctx.restore();
        }
      }
      // 下弧：Cost；本次要付的部分閃爍。數量多（青色儲備）時改成連續量條。
      var b0=Math.PI*.2,b1=Math.PI*.8,max=view.costMax,have=Math.min(view.cost,max),pay=view.ready?Math.max(0,Math.min(view.pending,have)):0;
      if(max>12){
        var keep=have-pay;
        ctx.lineCap='round';ctx.lineWidth=7;
        ctx.beginPath();ctx.arc(cx,cy,R*.87,b0,b1);ctx.strokeStyle=c.track;ctx.stroke();
        if(keep>0){ctx.beginPath();ctx.arc(cx,cy,R*.87,b1-(b1-b0)*keep/max,b1);glow(ctx,c.main,c.glow,7,6);}
        if(pay>0){ctx.save();ctx.globalAlpha=.4+.6*pulse;ctx.beginPath();ctx.arc(cx,cy,R*.87,b1-(b1-b0)*have/max,b1-(b1-b0)*keep/max);glow(ctx,c.flash,c.glow,7,12);ctx.restore();}
        ctx.lineCap='butt';
      }else for(k=0;k<max;k++){
        var gap=.05,s=b1-(b1-b0)*(k/max)-gap/2,e=b1-(b1-b0)*((k+1)/max)+gap/2;
        ctx.beginPath();ctx.arc(cx,cy,R*.87,e,s);ctx.lineWidth=8;
        if(k<have&&k>=have-pay){ctx.save();ctx.globalAlpha=.4+.6*pulse;glow(ctx,c.flash,c.glow,8,12);ctx.restore();}
        else if(k<have)glow(ctx,c.main,c.glow,8,6);
        else{ctx.strokeStyle=c.track;ctx.stroke();}
      }
      ctx.restore();
    }
    function tick(t){
      raf=0;if(disposed||!visible())return;
      drawFrame();drawRing(t);
      if(!still())raf=requestAnimationFrame(tick);
    }
    function start(){if(!raf&&!disposed)raf=requestAnimationFrame(tick);}
    function refresh(){frameKey='';start();}
    var observer=window.ResizeObserver?new ResizeObserver(refresh):null;
    if(observer){observer.observe(dashboard);observer.observe(ring);}
    var themeObserver=window.MutationObserver?new MutationObserver(refresh):null;
    if(themeObserver)themeObserver.observe(root,{attributes:true,attributeFilter:['data-theme']});
    document.addEventListener('visibilitychange',start);
    if(media)(media.addEventListener?media.addEventListener('change',start):media.addListener(start));
    return{
      update:function(next){
        if(disposed)return;
        for(var key in next)if(Object.prototype.hasOwnProperty.call(next,key))view[key]=next[key];
        start();
      },
      // 碎裂轉場結束時重畫外框：外框只在尺寸或顏色改變時才畫，iPhone 在轉場最吃記憶體的那一刻可能畫成空白（2026-11-24 酒館內實測），
      // 之後不會自己補。寬度先歸零，讓瀏覽器重新配置畫布。
      redraw:function(){
        if(disposed)return;
        frame.width=0;refresh();
      },
      dispose:function(){
        if(disposed)return;disposed=true;
        if(raf)cancelAnimationFrame(raf);raf=0;
        if(observer)observer.disconnect();if(themeObserver)themeObserver.disconnect();
        document.removeEventListener('visibilitychange',start);
        if(media)(media.removeEventListener?media.removeEventListener('change',start):media.removeListener(start));
        frame.remove();ring.remove();
      }
    };
  }
  // 戰場背景：霧夜街景（淺色紙面改為褐墨版），地平線對齊戰場站位；只在尺寸、色譜或主題改變時重畫。
  function drawStreet(ctx,w,h,top,gy,c,isLight){
    var sky=ctx.createLinearGradient(0,0,0,gy);
    sky.addColorStop(0,isLight?'#e6d8b8':'#181d24');sky.addColorStop(1,isLight?'#d6c49f':'#262a2c');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,gy);
    var rr=rand(21),sh=Math.max(60,gy-top),layers=isLight?[[.45,'#cdbb95',.55],[.7,'#bfab84',.7],[1,'#ad9872',.85]]:[[.45,'#20252b',.55],[.7,'#1a1e23',.7],[1,'#15181c',.85]];
    layers.forEach(function(L){
      var k=L[0],x=-20;
      while(x<w){
        var bw=50+rr()*90,bh=sh*(L[2]-.25*rr())*k*1.15;
        ctx.fillStyle=L[1];ctx.beginPath();ctx.moveTo(x,gy);ctx.lineTo(x,gy-bh);
        if(rr()>.5)ctx.lineTo(x+bw/2,gy-bh-22*k);
        ctx.lineTo(x+bw,gy-bh);ctx.lineTo(x+bw,gy);ctx.fill();
        if(k===1)for(var wy=gy-bh+16;wy<gy-26;wy+=28)for(var wx=x+12;wx<x+bw-16;wx+=24)if(rr()>.72){ctx.fillStyle=isLight?'rgba(120,78,30,.2)':'rgba(230,180,110,.22)';ctx.fillRect(wx,wy,9,13);}
        x+=bw+4;
      }
    });
    var lampH=Math.min(150,sh*.55);
    [w*.05,w*.95].forEach(function(lx){
      var ly=gy-lampH,lg=ctx.createRadialGradient(lx,ly,2,lx,ly,110);
      lg.addColorStop(0,isLight?'rgba(255,214,140,.5)':'rgba(255,205,130,.35)');lg.addColorStop(1,'rgba(255,205,130,0)');
      ctx.fillStyle=lg;ctx.fillRect(lx-110,ly-110,220,220);
      ctx.fillStyle=isLight?'#5b4a33':'#0d0f12';ctx.fillRect(lx-2,ly,4,lampH);ctx.fillRect(lx-7,ly-10,14,12);
      ctx.fillStyle=isLight?'#f3cf82':'rgba(255,215,150,.85)';ctx.fillRect(lx-4,ly-7,8,7);
    });
    var gr=ctx.createLinearGradient(0,gy,0,h);
    gr.addColorStop(0,isLight?'#cdbb96':'#2a2c2b');gr.addColorStop(Math.min(1,160/Math.max(1,h-gy)),isLight?'#dccdae':'#16181b');gr.addColorStop(1,isLight?'#e3d6ba':'#0e1013');
    ctx.fillStyle=gr;ctx.fillRect(0,gy,w,h-gy);
    ctx.save();ctx.beginPath();ctx.rect(0,gy,w,Math.min(h-gy,180));ctx.clip();
    ctx.strokeStyle=isLight?'rgba(90,64,30,.09)':'rgba(255,255,255,.04)';ctx.lineWidth=1;
    for(var i=-12;i<=12;i++){ctx.beginPath();ctx.moveTo(w/2+i*30,gy);ctx.lineTo(w/2+i*150,gy+180);ctx.stroke();}
    ctx.restore();
    for(i=0;i<4;i++){
      var fx=w*(.2+i*.22),fg=ctx.createRadialGradient(fx,gy-10,10,fx,gy-10,220);
      fg.addColorStop(0,isLight?'rgba(255,250,235,.28)':'rgba(180,190,190,.10)');fg.addColorStop(1,'rgba(180,190,190,0)');ctx.fillStyle=fg;ctx.fillRect(0,0,w,h);
    }
    // 色譜底光：戰場沾一點主題色。
    var tint=ctx.createRadialGradient(w*.5,gy+40,20,w*.5,gy+40,w*.7);
    tint.addColorStop(0,rgba(isLight?c.main:c.glow,isLight?.12:.16));tint.addColorStop(1,rgba(isLight?c.main:c.glow,0));ctx.fillStyle=tint;ctx.fillRect(0,0,w,h);
    var vg=ctx.createRadialGradient(w/2,gy,Math.min(w,h)*.3,w/2,gy,Math.max(w,h)*.8);
    vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,isLight?'rgba(92,64,28,.22)':'rgba(0,0,0,.55)');ctx.fillStyle=vg;ctx.fillRect(0,0,w,h);
  }
  function watch(targets,root,redraw){
    var observer=window.ResizeObserver?new ResizeObserver(redraw):null;
    if(observer)targets.forEach(function(t){if(t)observer.observe(t);});else window.addEventListener('resize',redraw);
    var themeObserver=window.MutationObserver?new MutationObserver(redraw):null;
    if(themeObserver)themeObserver.observe(root,{attributes:true,attributeFilter:['data-theme']});
    return function(){if(observer)observer.disconnect();else window.removeEventListener('resize',redraw);if(themeObserver)themeObserver.disconnect();};
  }
  function createArena(options){
    options=options||{};
    var host=options.host,arena=options.arena,root=options.root||document.documentElement;
    if(!host||!arena||!document.createElement('canvas').getContext)return{update:function(){},dispose:function(){}};
    var cv=document.createElement('canvas');cv.className='arena-bg';cv.setAttribute('aria-hidden','true');
    host.insertBefore(cv,host.firstChild);
    var color='basic',raf=0,key='',disposed=false;
    function draw(){
      raf=0;if(disposed)return;
      var hb=host.getBoundingClientRect(),ab=arena.getBoundingClientRect(),isLight=root.getAttribute('data-theme')==='light';
      if(!hb.width||!ab.height)return;
      var top=ab.top-hb.top,gy=top+ab.height*.72,next=[Math.round(hb.width),Math.round(hb.height),Math.round(top),Math.round(gy),color,isLight].join('|');
      if(next===key)return;key=next;
      var f=fit(cv);
      drawStreet(f.ctx,f.w,f.h,top,gy,(PALETTES[color]||PALETTES.basic).c,isLight);
    }
    function schedule(){if(!raf&&!disposed)raf=requestAnimationFrame(draw);}
    var stop=watch([host,arena],root,function(){key='';schedule();});
    schedule();
    return{
      update:function(next){if(next&&next.color&&next.color!==color){color=next.color;key='';}schedule();},
      dispose:function(){if(disposed)return;disposed=true;if(raf)cancelAnimationFrame(raf);stop();cv.remove();}
    };
  }
  // 選中招式 → 目標的虛線；招式卡捲出可視範圍時隱藏。
  function createFlow(options){
    options=options||{};
    var host=options.host,root=options.root||document.documentElement;
    if(!host||!document.createElementNS)return{update:function(){},dispose:function(){}};
    var NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');
    svg.setAttribute('class','battle-flow');svg.setAttribute('aria-hidden','true');host.appendChild(svg);
    var view={from:null,to:[],on:false},raf=0,disposed=false;
    function draw(){
      raf=0;if(disposed)return;
      var hb=host.getBoundingClientRect(),from=view.from;
      svg.setAttribute('viewBox','0 0 '+Math.max(1,hb.width).toFixed(1)+' '+Math.max(1,hb.height).toFixed(1));
      if(!view.on||!from||!from.isConnected||!view.to.length){svg.innerHTML='';return;}
      var fb=from.getBoundingClientRect(),x1=fb.left+fb.width/2-hb.left,y1=fb.top-hb.top+4,clip=from.closest('.skill-hand');
      if(!fb.width){svg.innerHTML='';return;}
      if(clip){var cb=clip.getBoundingClientRect();if(x1+hb.left<cb.left||x1+hb.left>cb.right){svg.innerHTML='';return;}}
      svg.innerHTML=view.to.filter(function(el){return el&&el.isConnected;}).map(function(el){
        var b=el.getBoundingClientRect(),x2=b.left+b.width/2-hb.left,y2=b.bottom-hb.top-6,mx=(x1+x2)/2,my=Math.min(y1,y2)-40;
        return'<path d="M'+x1.toFixed(1)+','+y1.toFixed(1)+' Q'+mx.toFixed(1)+','+my.toFixed(1)+' '+x2.toFixed(1)+','+y2.toFixed(1)+'"/><circle cx="'+x2.toFixed(1)+'" cy="'+y2.toFixed(1)+'" r="4"/>';
      }).join('');
    }
    function schedule(){if(!raf&&!disposed)raf=requestAnimationFrame(draw);}
    var stop=watch([host],root,schedule);
    host.addEventListener('scroll',schedule,true);host.addEventListener('transitionend',schedule,true);
    return{
      update:function(next){view.from=next.from||null;view.to=next.to||[];view.on=!!next.on;schedule();},
      dispose:function(){if(disposed)return;disposed=true;if(raf)cancelAnimationFrame(raf);stop();host.removeEventListener('scroll',schedule,true);host.removeEventListener('transitionend',schedule,true);svg.remove();}
    };
  }
  // 出擊準備的書頁金邊：四角渦卷＋標題下的漸層線與四芒星。
  function createPrepFrame(options){
    options=options||{};
    var panel=options.panel,root=options.root||document.documentElement;
    if(!panel||!document.createElement('canvas').getContext)return{refresh:function(){},dispose:function(){}};
    var cv=document.createElement('canvas');cv.className='prep-frame';cv.setAttribute('aria-hidden','true');
    panel.insertBefore(cv,panel.firstChild);
    var raf=0,disposed=false;
    function draw(){
      raf=0;if(disposed||!panel.getClientRects().length)return;
      var f=fit(cv),ctx=f.ctx,w=f.w,h=f.h,isLight=root.getAttribute('data-theme')==='light',gold=isLight?'#8a6630':'#cfb17b',m=4;
      ctx.beginPath();roundRect(ctx,m,m,w-2*m,h-2*m,4);ctx.strokeStyle=rgba(gold,.55);ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();roundRect(ctx,m+6,m+6,w-2*m-12,h-2*m-12,2);ctx.strokeStyle=rgba(gold,.22);ctx.stroke();
      function curl(x,y,sx,sy){
        ctx.save();ctx.translate(x,y);ctx.scale(sx,sy);ctx.strokeStyle=gold;ctx.lineWidth=1.3;
        ctx.beginPath();ctx.moveTo(0,34);ctx.bezierCurveTo(0,10,10,0,34,0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(6,24);ctx.bezierCurveTo(8,12,14,8,22,8);ctx.bezierCurveTo(28,8,28,16,22,16);ctx.stroke();
        ctx.beginPath();ctx.arc(8,8,2.2,0,TAU);ctx.fillStyle=gold;ctx.fill();ctx.restore();
      }
      curl(m+4,m+4,1,1);curl(w-m-4,m+4,-1,1);curl(m+4,h-m-4,1,-1);curl(w-m-4,h-m-4,-1,-1);
      var head=panel.querySelector('.section-head');
      if(head){
        var y=head.offsetTop+head.offsetHeight+2,lg=ctx.createLinearGradient(m+30,0,w-m-30,0);
        lg.addColorStop(0,rgba(gold,0));lg.addColorStop(.5,gold);lg.addColorStop(1,rgba(gold,0));
        ctx.strokeStyle=lg;ctx.beginPath();ctx.moveTo(m+30,y);ctx.lineTo(w-m-30,y);ctx.stroke();
        star4(ctx,w/2,y,7,2);ctx.fillStyle=gold;ctx.fill();
      }
    }
    function schedule(){if(!raf&&!disposed)raf=requestAnimationFrame(draw);}
    var stop=watch([panel],root,schedule);
    schedule();
    return{refresh:schedule,dispose:function(){if(disposed)return;disposed=true;if(raf)cancelAnimationFrame(raf);stop();cv.remove();}};
  }
  window.ExplorationDashboardArt={create:create,createArena:createArena,createFlow:createFlow,createPrepFrame:createPrepFrame,palettes:PALETTES};
})();
