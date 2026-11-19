// Browser voices are discovered asynchronously. Never silently pick an English voice.
export function koreanVoices(voices){return voices.filter(v=>/^ko(?:[-_]|$)/i.test(v.lang));}
export function chooseKoreanVoice(voices,preferred='auto'){
 const list=koreanVoices(voices);
 return list.find(v=>preferred!=='auto'&&v.voiceURI===preferred)||list.find(v=>/google/i.test(v.name+' '+v.voiceURI))||list.find(v=>v.default)||list[0]||null;
}
export class Narrator{
 constructor(getState,onChange,onError){this.getState=getState;this.onChange=onChange;this.onError=onError;this.synth=globalThis.speechSynthesis;this.voices=[];this.token=0;this.speaking=false;this.refresh=()=>{this.voices=this.synth?.getVoices()||[];this.onChange?.();};this.synth?.addEventListener('voiceschanged',this.refresh);this.refresh();}
 get voice(){return chooseKoreanVoice(this.voices,this.getState().voiceURI);}
 get label(){const v=this.voice;return v?(/google/i.test(v.name+' '+v.voiceURI)?'Google 한국어':v.name+' · 기기 음성'):'한국어 음성을 찾는 중';}
 cancel(){this.token++;this.speaking=false;this.synth?.cancel();this.onChange?.();}
 async speak(text){
  if(!this.synth)return this.onError?.('이 브라우저는 설명 읽기를 지원하지 않아요.');
  this.cancel();const token=this.token;this.refresh();
  if(!this.voice)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);this.synth.removeEventListener('voiceschanged',done);resolve();};const timer=setTimeout(done,1200);this.synth.addEventListener('voiceschanged',done);});
  if(token!==this.token)return;this.refresh();const voice=this.voice;
  if(!voice)return this.onError?.('한국어 음성이 없어요. 기기의 음성 설정에서 한국어를 추가해 주세요.');
  // Short sentences also avoid long-utterance timeouts in Chrome voices.
  const chunks=text.match(/[^.!?。！？]+[.!?。！？]*/g)||[text];let i=0;
  const next=()=>{if(token!==this.token)return;if(i>=chunks.length){this.speaking=false;this.onChange?.();return;}const u=new SpeechSynthesisUtterance(chunks[i++]);u.voice=voice;u.lang='ko-KR';u.rate=.9;u.volume=this.getState().volume??.6;this.utterance=u;u.onend=next;u.onerror=e=>{if(token!==this.token||['canceled','interrupted'].includes(e.error))return;this.speaking=false;this.onChange?.();this.onError?.('음성을 재생하지 못했어요. 인터넷 연결이나 다른 한국어 음성을 확인해 주세요.');};this.speaking=true;this.onChange?.();this.synth.speak(u);};next();
 }
}
// Small original game sounds, synthesized locally; no recordings or microphone.
export class GameAudio{
 constructor(getState,onError){this.getState=getState;this.onError=onError;this.ctx=null;this.timer=null;this.step=0;this.lastStep=0;}
 async unlock(){try{this.ctx??=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')await this.ctx.resume();this.sync();return this.ctx.state==='running';}catch{this.onError?.('이 브라우저에서는 소리를 켤 수 없어요.');return false;}}
 sync(){if(this.timer)return;this.timer=setInterval(()=>{const s=this.getState();if(!s.sound||!s.music||document.hidden||globalThis.speechSynthesis?.speaking)return;const notes=[261.63,329.63,392,0,440,392,329.63,0,293.66,349.23,440,0,392,329.63,261.63,0],f=notes[this.step++%notes.length];if(f)this.tone(f,.65,.025);},560);}
 tone(f,d,v=.08,delay=0,type='sine'){if(!this.ctx||this.ctx.state!=='running'||!this.getState().sound||(this.getState().volume??.6)<=0||document.hidden)return;const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(Math.max(.001,v*(this.getState().volume??.6)),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+d);o.onended=()=>{o.disconnect();g.disconnect();};}
 play(kind){if(!this.getState().sound)return;const tones={click:[[620,.065,.035]],move:[[440,.08,.045],[660,.1,.035,.08]],arrival:[[392,.15,.08],[523,.22,.08,.13]],discovery:[[523,.28,.09],[659,.28,.09,.1],[784,.4,.09,.2]],correct:[[659,.2,.08],[880,.35,.08,.15]],retry:[[294,.12,.055],[330,.15,.055,.13]],coin:[[1046,.1,.07],[1318,.2,.07,.09]]};for(const a of tones[kind]||tones.click)this.tone(...a);}
 chime(){this.play('discovery');}
 footstep(t){if(t-this.lastStep<330||globalThis.speechSynthesis?.speaking)return;this.lastStep=t;this.tone(110+this.step++%2*25,.055,.018,0,'triangle');}
 stop(){clearInterval(this.timer);this.timer=null;this.ctx?.suspend();}
}
