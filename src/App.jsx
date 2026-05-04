import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { parseMG, enrichPlayers, derivePlayerStats, byWins, medal } from "./lib/stats";
import {
  Plus, X, Check, ChevronRight, TrendingUp, TrendingDown,
  Minus, Clock, Home, BarChart2, Users, User, Edit2,
  Camera, Settings, RotateCcw, UserPlus, UserMinus,
  ChevronLeft, Trophy, Layers, Target, Hash, Copy,
  MessageCircle, LayoutDashboard, Crown, Sparkles, ArrowRight, Trash2,
} from "lucide-react";


/* ── CONSTANTS ── */
const N  = "#AAFF00"; // neon
const BG = "#0A0A0A";
const GRADS = [
  "linear-gradient(135deg,#AAFF00,#7DC900)",
  "linear-gradient(135deg,#3B8EFF,#1a6be0)",
  "linear-gradient(135deg,#FF6B35,#e04a10)",
  "linear-gradient(135deg,#AA55FF,#7B2FBE)",
  "linear-gradient(135deg,#FF3355,#C0143C)",
  "linear-gradient(135deg,#FFB830,#E08A00)",
  "linear-gradient(135deg,#00E5CC,#009E8E)",
];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ── PURE HELPERS ── */
const pg  = p => GRADS[(p.id - 1) % GRADS.length];
const pct = (w, l) => { const t = w + l; return t ? Math.round(w / t * 100) : 0; };
const nowTs = () => {
  const d=new Date(), h=d.getHours(), m=d.getMinutes();
  return {
    dateStr: `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`,
    timeStr: `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`,
  };
};

/* ── SEED DATA ── */
// No seed data — players are added via onboarding (isMe) or the Add Player prompt
const INIT_PLAYERS = [];
const INIT_FEED = [];

const INIT_RULES = {format:"",scoring:"",sport:"",seasonYear:new Date().getFullYear()};

// Convert the league row (sport column + settings JSON) to the rules shape used by the UI
function settingsToRules(leagueSport, settings) {
  const s = settings || {};
  const formatMap = {
    goals:"High Score", sets:"Sets & Matches",
    single:"Single Set", best3:"Best of 3",    // kept for backward compat with older leagues
    points:`${s.points||21} Points`, custom_logic:"Custom Rules",
  };
  const fmt = formatMap[s.format] || (typeof s.format === "string" && s.format) || "";
  const scoring = s.format === "points"
    ? `First to ${s.points||21} points`
    : (s.customRules?.trim() || "");
  // sportEmoji: use saved custom emoji if present, otherwise inferred at call-site from SPORTS
  const sportEmoji = s.sportEmoji || "";
  return {
    sport:            leagueSport || "",
    sportEmoji,
    format:           fmt,
    scoring,
    seasonYear:       s.seasonYear || new Date().getFullYear(),
    tournamentFormat: s.tournamentFormat || "classic",
    reportingMode:    s.reportingMode || "admin",
    groupSettings:    s.groupSettings || { playersPerGroup: 4, advancingPerGroup: 2 },
    participants:     s.participants || [],
    bracket:          s.bracket || null,
    matchLegs:        s.matchLegs || 1,
    groups:           s.groups || [],
    groupMatches:     s.groupMatches || [],
  };
}

/* ── MICRO ATOMS ── */
const GridBg = () => (
  <div className="pointer-events-none fixed inset-0 z-0" style={{
    backgroundImage:"linear-gradient(rgba(170,255,0,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(170,255,0,.028) 1px,transparent 1px)",
    backgroundSize:"48px 48px"
  }}/>
);
const GlowBlobs = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
    <motion.div animate={{scale:[1,1.1,1],opacity:[.45,.7,.45]}} transition={{duration:8,repeat:Infinity,ease:"easeInOut"}}
      style={{position:"absolute",width:450,height:450,borderRadius:"50%",background:"radial-gradient(circle,rgba(170,255,0,.07) 0%,transparent 70%)",top:-150,right:-120,filter:"blur(50px)"}}/>
    <motion.div animate={{scale:[1,1.15,1],opacity:[.3,.5,.3]}} transition={{duration:10,repeat:Infinity,ease:"easeInOut",delay:3}}
      style={{position:"absolute",width:360,height:360,borderRadius:"50%",background:"radial-gradient(circle,rgba(170,255,0,.05) 0%,transparent 70%)",bottom:-120,left:-100,filter:"blur(60px)"}}/>
  </div>
);

function Sparkline({data,color,w=88,h=24}) {
  if (!data||data.length<2) return null;
  const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
  const pts=data.map((v,i)=>[(i/(data.length-1))*w,h-((v-mn)/rng)*(h-4)-2]);
  const line=pts.map(([x,y])=>`${x},${y}`).join(" ");
  const [lx,ly]=pts[pts.length-1];
  const gid=`sg${color.replace("#","")}${w}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",overflow:"visible"}}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity=".25"/><stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${gid})`}/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={lx} cy={ly} r="2.5" fill={color}/>
    </svg>
  );
}


function AnimBar({value,color}) {
  const [w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(value),100);return()=>clearTimeout(t);},[value]);
  return (
    <div className="flex-1 rounded-[6px] overflow-hidden" style={{height:18,background:"rgba(255,255,255,.06)"}}>
      <motion.div className="h-full rounded-[6px]" style={{background:color}}
        animate={{width:`${w}%`}} transition={{duration:.8,ease:[.4,0,.2,1]}}/>
    </div>
  );
}

const ST = ({children}) => (
  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:"1.5px",color:"#fff",marginBottom:12}}>{children}</div>
);

function PBtn({children,onClick,disabled=false}) {
  return (
    <motion.button onClick={onClick} disabled={disabled}
      whileHover={!disabled?{scale:1.015,y:-1}:{}} whileTap={!disabled?{scale:.97}:{}}
      className="relative w-full overflow-hidden rounded-2xl py-4 font-black text-base"
      style={{fontFamily:"'DM Sans',sans-serif",border:"none",cursor:disabled?"not-allowed":"pointer",
        background:disabled?"rgba(170,255,0,.1)":`linear-gradient(135deg,${N},#7DC900)`,
        color:disabled?"rgba(170,255,0,.28)":"#000",boxShadow:disabled?"none":"0 6px 24px rgba(170,255,0,.3)"}}>
      {!disabled&&<div className="pointer-events-none absolute inset-0" style={{background:"linear-gradient(135deg,rgba(255,255,255,.16),transparent 55%)"}}/>}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

/* ── STANDINGS TABLE — shared by Home + League ── */
// players are expected to be pre-enriched (from derivePlayerStats) — gamesWon/gamesLost already set
function StandingsTable({players}) {
  const rows = useMemo(()=>byWins(players ?? []),[players]);
  if (!players || players.length === 0) return <div className="text-center p-10 opacity-30">No players in league yet</div>;
  // Columns: rank | player name (flex) | W/L | W% | CLT | CB | MG W–L
  // Tighter right-side columns free up ~44 px for the name vs the old layout.
  // No initials avatar — the name column now owns the full 1fr width.
  const COL = "28px 1fr 48px 34px 26px 26px 58px";
  const HDRS = ["#","PLAYER","W/L","W%","CLT","CB","MG W–L"];
  return (
    <div className="rounded-[22px] overflow-hidden mb-6" style={{border:"1px solid rgba(255,255,255,.07)"}}>
      <div className="grid px-3 py-2.5 gap-1"
        style={{gridTemplateColumns:COL,background:"rgba(255,255,255,.04)",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
        {HDRS.map((h,i)=>(
          <span key={i} style={{fontSize:8,fontWeight:800,letterSpacing:"1px",color:"rgba(255,255,255,.28)",textAlign:i>1?"center":"left",fontFamily:"'DM Sans',sans-serif"}}>{h}</span>
        ))}
      </div>
      {rows.length===0&&(
        <div style={{padding:"28px 16px",textAlign:"center",fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,.28)"}}>
          No players yet — add someone to get started 🏆
        </div>
      )}
      {rows.map((p,i)=>{
        const r      = i+1;
        const md     = medal(r);
        const winPct = p.totalPlayed>0 ? Math.round(p.wins/p.totalPlayed*100) : 0;
        const pctC   = winPct>=60?N:winPct>=40?"#FFB830":"#FF3355";
        return (
          <div key={p.id} className="grid px-3 py-3 items-center gap-1 hover:brightness-110 transition-all"
            style={{gridTemplateColumns:COL,borderBottom:i<rows.length-1?"1px solid rgba(255,255,255,.05)":"none",background:p.isMe?"rgba(170,255,0,.04)":"transparent"}}>

            {/* Rank */}
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:md?15:19,color:md?md.c:"rgba(255,255,255,.25)",lineHeight:1}}>{md?md.e:r}</div>

            {/* Name — owns the full 1fr; no avatar stealing space */}
            <div className="min-w-0">
              <div style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
                <span style={{
                  fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,
                  color:"#fff",overflow:"hidden",textOverflow:"ellipsis",
                  whiteSpace:"nowrap",flex:1,minWidth:0,
                }}>{p.name}</span>
                {p.isMe&&<span style={{fontSize:7,fontWeight:900,background:N,color:"#000",padding:"1px 4px",borderRadius:3,flexShrink:0,lineHeight:"14px"}}>ME</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:3,marginTop:2}}>
                {p.trend==="up"  &&<TrendingUp   size={8} style={{color:N,flexShrink:0}}/>}
                {p.trend==="down"&&<TrendingDown  size={8} style={{color:"#FF3355",flexShrink:0}}/>}
                {p.trend==="flat"&&<Minus         size={8} style={{color:"rgba(255,255,255,.25)",flexShrink:0}}/>}
                <span style={{fontSize:8,color:"rgba(255,255,255,.25)",fontFamily:"'DM Sans',sans-serif"}}>{p.totalPlayed} played</span>
              </div>
            </div>

            {/* W/L */}
            <div className="text-center" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700}}>
              <span style={{color:N}}>{p.wins}</span><span style={{color:"rgba(255,255,255,.18)"}}>/</span><span style={{color:"#FF3355"}}>{p.losses}</span>
            </div>
            {/* W% */}
            <div className="text-center" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:pctC}}>{winPct}%</div>
            {/* CLT */}
            <div className="text-center" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"#3B8EFF"}}>{p.clutchWins||0}</div>
            {/* CB */}
            <div className="text-center" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"#FFB830"}}>{p.comebacks||0}</div>
            {/* MG W–L */}
            <div className="text-center" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:600,color:"rgba(255,255,255,.6)",letterSpacing:"-0.3px"}}>{p.gamesWon||0}–{p.gamesLost||0}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── FEED CARD ── */
function FeedCard({m,onEdit,onDelete,canDelete=false,players=[]}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const totalMG = useMemo(()=>(m.sets||[]).reduce((a,s)=>{const{w,l}=parseMG(s);return a+w+l;},0),[m.sets]);
  // Derive display names from winnerIds/loserIds when players are available (supports doubles),
  // fall back to stored m.winner / m.loser strings for seed data compatibility.
  const winnerStr = useMemo(()=>{
    if(players.length&&m.winnerIds?.length){
      const names=m.winnerIds.map(id=>players.find(p=>p.id===id)?.name).filter(Boolean);
      if(names.length) return names.join(" & ");
    }
    return m.winner;
  },[m,players]);
  const loserStr = useMemo(()=>{
    if(players.length&&m.loserIds?.length){
      const names=m.loserIds.map(id=>players.find(p=>p.id===id)?.name).filter(Boolean);
      if(names.length) return names.join(" & ");
    }
    return m.loser;
  },[m,players]);
  return (
    <motion.div layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
      className="rounded-[20px] overflow-hidden mb-3"
      style={{background:"rgba(255,255,255,.03)",border:confirmDel?"1px solid rgba(255,51,85,.3)":"1px solid rgba(255,255,255,.08)",transition:"border-color .2s"}}>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center justify-center rounded-[11px] text-xl flex-shrink-0"
          style={{width:38,height:38,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",marginTop:1}}>
          {m.sport}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap mb-2">
            {m.isDraw ? (
              <>
                <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.85)",fontFamily:"'DM Sans',sans-serif"}}>{m.p1Name||winnerStr}</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>drew</span>
                <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.85)",fontFamily:"'DM Sans',sans-serif"}}>{m.p2Name||loserStr}</span>
              </>
            ) : (
              <>
                <span style={{fontSize:13,fontWeight:700,color:N,fontFamily:"'DM Sans',sans-serif"}}>{winnerStr}</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>def.</span>
                <span style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.42)",fontFamily:"'DM Sans',sans-serif"}}>{loserStr}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {m.sets.map((s,i)=>(
              <span key={i} className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                style={{fontFamily:"'JetBrains Mono',monospace",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.65)"}}>{s}</span>
            ))}
            <span style={{fontSize:9,color:"rgba(255,255,255,.22)",fontWeight:600,marginLeft:2}}>{totalMG} Mini-Games</span>
            {m.isComeback&&<span style={{fontSize:8,fontWeight:900,letterSpacing:"0.8px",color:"#FFB830",background:"rgba(255,184,48,.12)",border:"1px solid rgba(255,184,48,.35)",borderRadius:4,padding:"1px 5px",fontFamily:"'DM Sans',sans-serif"}}>⚡ COMEBACK</span>}
            {m.isDraw&&<span style={{fontSize:8,fontWeight:900,letterSpacing:"0.8px",color:"#3B8EFF",background:"rgba(59,142,255,.12)",border:"1px solid rgba(59,142,255,.35)",borderRadius:4,padding:"1px 5px",fontFamily:"'DM Sans',sans-serif"}}>🤝 DRAW</span>}
            {m.groupLabel&&<span style={{fontSize:8,fontWeight:800,letterSpacing:"0.5px",color:N,background:`${N}12`,border:`1px solid ${N}30`,borderRadius:4,padding:"1px 6px",fontFamily:"'DM Sans',sans-serif"}}>{m.groupLabel}</span>}
            {m.bracketRoundLabel&&!m.groupLabel&&<span style={{fontSize:8,fontWeight:800,letterSpacing:"0.5px",color:"#AA55FF",background:"rgba(170,85,255,.12)",border:"1px solid rgba(170,85,255,.35)",borderRadius:4,padding:"1px 6px",fontFamily:"'DM Sans',sans-serif"}}>🏆 {m.bracketRoundLabel}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:N,fontWeight:700}}>+{m.xp}XP</span>
          {!confirmDel && (
            <div className="flex items-center gap-1">
              <button onClick={()=>onEdit(m)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold hover:opacity-80"
                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.45)",fontFamily:"'DM Sans',sans-serif"}}>
                <Edit2 size={9}/> Edit
              </button>
              {canDelete && (
                <button onClick={()=>setConfirmDel(true)}
                  className="flex items-center justify-center w-[26px] h-[22px] rounded-lg hover:opacity-80"
                  style={{background:"rgba(255,51,85,.08)",border:"1px solid rgba(255,51,85,.25)",cursor:"pointer"}}>
                  <Trash2 size={9} style={{color:"#FF3355"}}/>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Inline delete confirmation */}
      <AnimatePresence>
        {confirmDel && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
            style={{overflow:"hidden",borderTop:"1px solid rgba(255,51,85,.2)",background:"rgba(255,51,85,.05)"}}>
            <div className="px-4 py-3">
              <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.65)",fontFamily:"'DM Sans',sans-serif",marginBottom:10}}>
                Delete this match? Standings will update immediately.
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setConfirmDel(false)}
                  className="flex-1 rounded-[10px] py-2 text-[11px] font-bold"
                  style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
                  Cancel
                </button>
                <button onClick={()=>{setConfirmDel(false);onDelete(m.id);}}
                  className="flex-1 rounded-[10px] py-2 text-[11px] font-bold flex items-center justify-center gap-1.5"
                  style={{background:"rgba(255,51,85,.15)",border:"1px solid rgba(255,51,85,.4)",color:"#FF3355",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
                  <Trash2 size={11}/> Delete Match
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between px-4 pb-3 pt-1" style={{borderTop:"1px solid rgba(255,255,255,.05)"}}>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"}}>
          <span style={{fontSize:10}}>📅</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.65)"}}>{m.dateStr}</span>
        </div>
        <div className="flex items-center gap-1" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",fontWeight:600}}>
          <Clock size={10} style={{color:"rgba(255,255,255,.25)"}}/>{m.timeStr}
        </div>
      </div>
    </motion.div>
  );
}

/* ── LOG MATCH MODAL ── */
function LogModal({players, onClose, onSubmit, prefill=null}) {
  const [step,       setStep]      = useState(0);
  const [winners,    setW]         = useState(prefill?.winnerIds||[]);
  const [losers,     setL]         = useState(prefill?.loserIds ||[]);
  const [sets,       setSets]      = useState(
    prefill?.sets?.map(s=>{const[a,b]=s.split(/[–-]/);return{w:a||"",l:b||""};}) || [{w:"",l:""}]
  );
  const [isComeback, setIsComeback] = useState(prefill?.isComeback||false);

  const canGo  = winners.length>0 && losers.length>0;
  const hasAny = sets.some(s=>s.w!==""&&s.l!=="");

  const tog = (id,side) => {
    if((side==="w"?losers:winners).includes(id)) return;
    (side==="w"?setW:setL)(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  };
  const upd = (i,side,v) => setSets(p=>p.map((s,ix)=>ix===i?{...s,[side]:v}:s));
  const submit = () => {
    setStep(2);
    setTimeout(()=>{onSubmit({winners,losers,sets,editId:prefill?.id,isComeback});onClose();},1500);
  };

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{background:"rgba(0,0,0,.9)",backdropFilter:"blur(18px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>

      <motion.div
        initial={{scale:0.9,opacity:0,y:24}}
        animate={{scale:1,  opacity:1,y:0 }}
        exit={{  scale:0.93,opacity:0,y:12}}
        transition={{type:"spring",stiffness:380,damping:30}}
        className="w-full flex flex-col rounded-[28px] overflow-hidden"
        style={{
          maxWidth:400, maxHeight:"88vh",
          background:"#0C0E13",
          border:`2px solid ${N}`,
          boxShadow:`0 0 0 1px rgba(170,255,0,.08),0 0 60px rgba(170,255,0,.2),0 0 120px rgba(170,255,0,.08),0 28px 72px rgba(0,0,0,.75)`,
        }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{borderBottom:`1px solid rgba(170,255,0,.14)`}}>
          <div>
            <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:"2px",color:"#fff",lineHeight:1}}>
              {step===2?<>Result <span style={{color:N}}>Saved!</span></>
                :<>{prefill?"Edit":"Log"} <span style={{color:N}}>Match</span></>}
            </h3>
            {step<2&&<p style={{fontSize:11,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginTop:3}}>
              {step===0?"Select winner(s) and loser(s)":"Enter the score for each mini-game"}
            </p>}
          </div>
          {step<2&&<button onClick={onClose} className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",cursor:"pointer"}}>
            <X size={15} style={{color:"rgba(255,255,255,.55)"}}/>
          </button>}
        </div>

        {/* Step progress */}
        {step<2&&<div className="flex gap-1.5 px-5 pt-3 flex-shrink-0">
          {[0,1].map(i=>(
            <div key={i} className="flex-1 rounded-full overflow-hidden" style={{height:2.5,background:"rgba(255,255,255,.07)"}}>
              <motion.div className="h-full rounded-full" style={{background:N}}
                animate={{width:i<=step?"100%":"0%"}} transition={{duration:.4}}/>
            </div>
          ))}
        </div>}

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          <AnimatePresence mode="wait">

            {/* Step 0 — Player selection */}
            {step===0&&(
              <motion.div key="s0" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:.2}}
                className="px-5 pt-4 pb-4">
                {[{lbl:"WINNERS 🏆",side:"w",c:N},{lbl:"LOSERS 💀",side:"l",c:"#FF3355"}].map(({lbl,side,c},si)=>(
                  <div key={lbl}>
                    <p style={{fontSize:10,fontWeight:800,letterSpacing:"2px",color:c,marginBottom:10,marginTop:si===1?16:0,fontFamily:"'DM Sans',sans-serif"}}>{lbl}</p>
                    {players.map(p=>{
                      const sel=(side==="w"?winners:losers).includes(p.id);
                      const dim=(side==="w"?losers:winners).includes(p.id);
                      return (
                        <button key={p.id} onClick={()=>tog(p.id,side)} disabled={dim}
                          className="flex items-center gap-3 w-full rounded-[14px] px-4 py-3 mb-2 text-left transition-all"
                          style={{
                            background:sel?(side==="w"?"rgba(170,255,0,.08)":"rgba(255,51,85,.07)"):"rgba(255,255,255,.03)",
                            border:sel?`1.5px solid ${side==="w"?N:"rgba(255,51,85,.6)"}`:"1.5px solid rgba(255,255,255,.07)",
                            opacity:dim?.3:1, cursor:dim?"not-allowed":"pointer",
                          }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                            style={{background:pg(p),color:"#000"}}>{p.initials}</div>
                          <span style={{fontSize:14,fontWeight:600,color:sel?"#fff":"rgba(255,255,255,.65)",fontFamily:"'DM Sans',sans-serif"}}>
                            {p.name}{p.isMe&&<span style={{fontSize:10,color:N}}> · YOU</span>}
                          </span>
                          {sel&&<div className="ml-auto flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                            style={{background:side==="w"?N:"#FF3355"}}>
                            <Check size={11} color={side==="w"?"#000":"#fff"} strokeWidth={3}/>
                          </div>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </motion.div>
            )}

            {/* Step 1 — Score inputs */}
            {step===1&&(
              <motion.div key="s1" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:.2}}
                className="px-5 pt-4 pb-4">

                {/* Match summary pill */}
                <div className="flex items-center rounded-[14px] px-4 py-3 mb-5"
                  style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"}}>
                  <div className="flex-1">
                    <p style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:N,marginBottom:2,fontFamily:"'DM Sans',sans-serif"}}>WINNERS</p>
                    <p style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>
                      {winners.map(id=>players.find(p=>p.id===id)?.name).join(" & ")}
                    </p>
                  </div>
                  <div style={{width:1,height:36,background:"rgba(255,255,255,.1)",flexShrink:0}}/>
                  <div className="flex-1 text-right">
                    <p style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:"#FF3355",marginBottom:2,fontFamily:"'DM Sans',sans-serif"}}>LOSERS</p>
                    <p style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>
                      {losers.map(id=>players.find(p=>p.id===id)?.name).join(" & ")}
                    </p>
                  </div>
                </div>

                {sets.map((s,i)=>(
                  <div key={i} className="mb-4">
                    <p style={{fontSize:10,fontWeight:700,letterSpacing:"1.5px",color:"rgba(255,255,255,.3)",marginBottom:8,fontFamily:"'DM Sans',sans-serif"}}>
                      MINI-GAME {i+1}
                    </p>
                    <div className="flex items-center gap-3">
                      {(["w","l"]).map(side=>(
                        <div key={side} className="flex-1 flex flex-col gap-1">
                          <span style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",
                            color:side==="w"?N:"#FF3355",fontFamily:"'DM Sans',sans-serif",
                            textAlign:"center"}}>
                            {side==="w"?"WINNER":"LOSER"}
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0" max="99"
                            placeholder="0"
                            value={s[side]}
                            onChange={e=>upd(i,side,e.target.value)}
                            className="w-full text-center rounded-[16px] py-5 outline-none"
                            style={{
                              fontFamily:"'Bebas Neue',sans-serif",
                              fontSize:42, letterSpacing:"2px",
                              background:side==="w"?"rgba(170,255,0,.06)":"rgba(255,51,85,.06)",
                              border:`2px solid ${s[side]?(side==="w"?N:"rgba(255,51,85,.75)"):(side==="w"?"rgba(170,255,0,.25)":"rgba(255,51,85,.25)")}`,
                              color:side==="w"?N:"#FF3355",
                              caretColor:side==="w"?N:"#FF3355",
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {sets.length<5&&(
                  <button onClick={()=>setSets(p=>[...p,{w:"",l:""}])}
                    className="w-full rounded-[14px] py-3 text-xs font-bold mt-1"
                    style={{background:"transparent",border:"1px dashed rgba(255,255,255,.14)",color:"rgba(255,255,255,.38)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
                    + Add Mini-Game {sets.length+1}
                  </button>
                )}

                {/* Comeback toggle */}
                <button onClick={()=>setIsComeback(v=>!v)}
                  className="flex items-center gap-3 w-full rounded-[14px] px-4 py-3 mt-3 text-left transition-all"
                  style={{background:isComeback?"rgba(255,184,48,.08)":"rgba(255,255,255,.03)",border:`1.5px solid ${isComeback?"rgba(255,184,48,.5)":"rgba(255,255,255,.08)"}`,cursor:"pointer"}}>
                  <div className="w-5 h-5 rounded-[5px] flex items-center justify-center flex-shrink-0"
                    style={{background:isComeback?"rgba(255,184,48,.9)":"rgba(255,255,255,.08)",border:`1px solid ${isComeback?"transparent":"rgba(255,255,255,.2)"}`}}>
                    {isComeback&&<Check size={12} color="#000" strokeWidth={3}/>}
                  </div>
                  <div className="flex-1">
                    <div style={{fontSize:12,fontWeight:700,color:isComeback?"#FFB830":"rgba(255,255,255,.55)",fontFamily:"'DM Sans',sans-serif"}}>Was this a comeback?</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif",marginTop:1}}>Winner came back from being behind</div>
                  </div>
                  {isComeback&&<span style={{fontSize:16}}>⚡</span>}
                </button>
              </motion.div>
            )}

            {/* Step 2 — Success */}
            {step===2&&(
              <motion.div key="s2" initial={{opacity:0,scale:.92}} animate={{opacity:1,scale:1}}
                className="flex flex-col items-center justify-center px-5 py-16 text-center">
                <motion.div initial={{scale:0}} animate={{scale:1}}
                  transition={{type:"spring",stiffness:380,damping:22,delay:.1}}
                  className="text-6xl mb-5">✅</motion.div>
                <h4 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36,letterSpacing:"2px",color:N,marginBottom:10}}>
                  {prefill?"Updated!":"Match Logged!"}
                </h4>
                <p style={{fontSize:13,color:"rgba(255,255,255,.42)",fontFamily:"'DM Sans',sans-serif",lineHeight:1.7}}>
                  The table has been updated.<br/>No excuses now.
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer CTA */}
        {step<2&&(
          <div className="px-5 pb-6 pt-4 flex-shrink-0"
            style={{borderTop:"1px solid rgba(255,255,255,.06)",background:"#0C0E13"}}>
            {step===0&&(
              <button onClick={()=>setStep(1)} disabled={!canGo}
                className="w-full rounded-[20px] py-5 font-black flex items-center justify-center gap-2 relative overflow-hidden"
                style={{
                  fontFamily:"'DM Sans',sans-serif", fontSize:17,
                  background:canGo?`linear-gradient(135deg,${N},#7DC900)`:"rgba(255,255,255,.06)",
                  color:     canGo?"#000":"rgba(255,255,255,.2)",
                  border:    canGo?"none":"1px solid rgba(255,255,255,.08)",
                  boxShadow: canGo?`0 8px 36px rgba(170,255,0,.42)`:"none",
                  cursor:    canGo?"pointer":"not-allowed",
                }}>
                {canGo&&<div className="absolute inset-0 pointer-events-none" style={{background:"linear-gradient(135deg,rgba(255,255,255,.15),transparent 55%)"}}/>}
                <span style={{position:"relative"}}>{canGo?"Set Scores →":"Select Players First"}</span>
              </button>
            )}
            {step===1&&(
              <div className="flex gap-3">
                <button onClick={()=>setStep(0)}
                  className="rounded-[18px] py-4 px-5 font-bold text-sm"
                  style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.65)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
                  ← Back
                </button>
                <button onClick={submit} disabled={!hasAny}
                  className="flex-1 rounded-[20px] py-4 font-black flex items-center justify-center gap-2 relative overflow-hidden"
                  style={{
                    fontFamily:"'DM Sans',sans-serif", fontSize:17,
                    background:hasAny?`linear-gradient(135deg,${N},#7DC900)`:"rgba(255,255,255,.06)",
                    color:     hasAny?"#000":"rgba(255,255,255,.2)",
                    border:    hasAny?"none":"1px solid rgba(255,255,255,.08)",
                    boxShadow: hasAny?`0 8px 36px rgba(170,255,0,.42)`:"none",
                    cursor:    hasAny?"pointer":"not-allowed",
                  }}>
                  {hasAny&&<div className="absolute inset-0 pointer-events-none" style={{background:"linear-gradient(135deg,rgba(255,255,255,.15),transparent 55%)"}}/>}
                  <Check size={18} style={{position:"relative"}}/>
                  <span style={{position:"relative"}}>Save Match</span>
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ── DRAW EMPTY STATE (reusable) ── */
function _DrawEmptyState({ isAdmin, onGenerateDraw }) {
  return (
    <div style={{ borderRadius: 20, padding: "32px 20px", textAlign: "center",
      background: "rgba(255,255,255,.02)", border: "1.5px dashed rgba(255,255,255,.1)",
      marginBottom: 8 }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🎲</div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "rgba(255,255,255,.35)",
        marginBottom: isAdmin ? 20 : 0, lineHeight: 1.6 }}>
        {isAdmin ? "The draw hasn't been generated yet." : "Waiting for the admin to generate the draw."}
      </div>
      {isAdmin && onGenerateDraw && (
        <button onClick={onGenerateDraw} style={{
          borderRadius: 16, padding: "12px 24px", cursor: "pointer",
          background: `linear-gradient(135deg,${N},#7DC900)`,
          border: "none", fontFamily: "'DM Sans',sans-serif", fontWeight: 800, fontSize: 13, color: "#000",
        }}>GENERATE DRAW →</button>
      )}
    </div>
  );
}

/* ── HOME TAB ── */
function HomeTab({
  players, feed, onEditFeed, onDeleteFeed, isAdmin=false, myPlayerId=null,
  isTournament=false, tournamentFormat="classic",
  bracket=null, onMatchTap=null, onGenerateDraw=null, matchLegs=1,
  groups=[], groupMatches=[], onGroupMatchTap=null, advancingPerGroup=2,
}) {
  const [showAll,setShowAll]               = useState(false);
  const [showDT,setDT]                     = useState(false);
  const mvp    = useMemo(()=>players.length>0?[...players].sort((a,b)=>b.wins-a.wins)[0]:{name:"No Players",wins:0,losses:0},[players]);
  const streak = useMemo(()=>players.length>0?[...players].sort((a,b)=>(b.bestStreak||0)-(a.bestStreak||0))[0]:{name:"No Players",bestStreak:0},[players]);

  // TBD bracket — shown before real bracket is generated; uses crossover pairing to match actual seeding
  const tdbBracket = useMemo(() => {
    if (bracket || !groups.length || tournamentFormat !== "groups_knockout") return null;
    const ordinals = ["1st","2nd","3rd","4th","5th","6th"];
    const tdbByGroup = groups.map(g =>
      Array.from({ length: advancingPerGroup }, (_, rank) => ({
        id: `tbd_${rank}_${g.name}`,
        name: `${ordinals[rank] ?? `${rank+1}th`} Group ${g.name}`,
        isTBD: true,
      }))
    );
    return groups.length >= 2
      ? generateCrossoverBracket(tdbByGroup)
      : generateKnockoutBracket(tdbByGroup.flat());
  }, [bracket, groups, advancingPerGroup, tournamentFormat]);
  const visible = showAll ? feed : feed.slice(0,5);

  return (
    <div className="px-5 pt-5 pb-2">
      {/* ── CLASSIC: standings table ── */}
      {!isTournament && (
        <>
          <ST>📊 Standings</ST>
          <StandingsTable players={players} feed={feed}/>
        </>
      )}

      {/* ── KNOCKOUT: full bracket ── */}
      {isTournament && tournamentFormat === "knockout" && (
        <div style={{ marginBottom: 20 }}>
          <div className="flex items-center justify-between mb-3">
            <ST style={{ margin: 0 }}>⚡ Tournament Bracket</ST>
            {matchLegs === 2 && (
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                color: `${N}77`, letterSpacing: "1px", background: `${N}10`,
                border: `1px solid ${N}25`, borderRadius: 8, padding: "3px 8px" }}>
                HOME & AWAY
              </span>
            )}
          </div>
          {bracket ? (
            <TournamentBracket bracket={bracket} isAdmin={isAdmin} onMatchTap={onMatchTap} matchLegs={matchLegs}/>
          ) : (
            <_DrawEmptyState isAdmin={isAdmin} onGenerateDraw={onGenerateDraw}/>
          )}
        </div>
      )}

      {/* ── GROUPS + KNOCKOUT: groups → bracket tree → knockout fixtures ── */}
      {isTournament && tournamentFormat === "groups_knockout" && (
        <div style={{ marginBottom: 20 }}>
          {!groups.length && <_DrawEmptyState isAdmin={isAdmin} onGenerateDraw={onGenerateDraw}/>}

          {/* Group standings + fixtures (repeated per group) */}
          {groups.map(group => (
            <GroupTable
              key={group.name}
              group={group}
              groupMatches={groupMatches.filter(m => m.groupName === group.name)}
              feed={feed}
              allGroupMatches={groupMatches}
              onMatchTap={onGroupMatchTap}
              isAdmin={isAdmin}
              advancingPerGroup={advancingPerGroup}
            />
          ))}

          {/* Bracket tree — real if generated, TBD preview while groups in progress */}
          {groups.length > 0 && (bracket || tdbBracket) && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: "2px", color: "#fff" }}>
                  ⚡ Knockout <span style={{ color: N }}>Bracket</span>
                </div>
                {!bracket && (
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 800,
                    letterSpacing: "1px", color: "rgba(255,255,255,.28)", background: "rgba(255,255,255,.05)",
                    border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, padding: "2px 7px" }}>
                    PREVIEW
                  </span>
                )}
              </div>
              <TournamentBracket
                bracket={bracket || tdbBracket}
                isAdmin={!!bracket && isAdmin}
                onMatchTap={bracket ? onMatchTap : null}
                matchLegs={matchLegs}
              />
            </div>
          )}

          {/* Knockout fixtures list (below bracket tree) */}
          {groups.length > 0 && (bracket || tdbBracket) && (
            <KnockoutFixtures
              bracket={bracket || tdbBracket}
              onMatchTap={bracket ? onMatchTap : null}
              isAdmin={!!bracket && isAdmin}
              matchLegs={matchLegs}
              feed={feed}
            />
          )}
        </div>
      )}

      {/* MVP + Streak — classic only */}
      {!isTournament && <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-[20px] p-4 relative overflow-hidden" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,215,0,.22)"}}>
          <div className="absolute inset-0 pointer-events-none" style={{background:"linear-gradient(135deg,rgba(255,215,0,.05),transparent 60%)"}}/>
          <span className="text-[22px] mb-1 block">🎖️</span>
          <div style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:"rgba(255,215,0,.8)",fontFamily:"'DM Sans',sans-serif",marginBottom:3}}>MVP OF THE DAY</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,color:"#fff",marginBottom:2}}>{mvp.name}</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,letterSpacing:"2px",color:"rgba(255,215,0,.9)",lineHeight:1}}>{mvp.wins}</div>
          <div style={{fontSize:9,fontWeight:700,color:"rgba(255,215,0,.5)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>WINS</div>
        </div>
        <div className="rounded-[20px] p-4 relative overflow-hidden" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(170,255,0,.2)"}}>
          <div className="absolute inset-0 pointer-events-none" style={{background:"linear-gradient(135deg,rgba(170,255,0,.05),transparent 60%)"}}/>
          <span className="text-[22px] mb-1 block">🔥</span>
          <div style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:"rgba(170,255,0,.8)",fontFamily:"'DM Sans',sans-serif",marginBottom:3}}>SUPER STREAK</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,color:"#fff",marginBottom:2}}>{streak.name}</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,letterSpacing:"2px",color:N,lineHeight:1}}>{streak.bestStreak||0}</div>
          <div style={{fontSize:9,fontWeight:700,color:"rgba(170,255,0,.5)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>WIN STREAK</div>
        </div>
      </div>}

      {/* Decision Touch */}
      <motion.div whileTap={{scale:.98}} onClick={()=>setDT(true)}
        className="flex items-center gap-4 rounded-[20px] p-4 mb-3 relative overflow-hidden cursor-pointer hover:brightness-110 transition-all"
        style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(170,85,255,.28)"}}>
        <div className="absolute inset-0 pointer-events-none" style={{background:"linear-gradient(135deg,rgba(170,85,255,.06),transparent 60%)"}}/>
        <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0 relative z-10"
          style={{background:"linear-gradient(135deg,#AA55FF,#7B2FBE)",boxShadow:"0 4px 16px rgba(170,85,255,.35)"}}>☝️</div>
        <div className="relative z-10 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,color:"#fff"}}>Decision Touch</span>
            <span style={{fontSize:8,fontWeight:900,letterSpacing:"1px",background:"rgba(170,85,255,.18)",color:"#AA55FF",border:"1px solid rgba(170,85,255,.4)",borderRadius:5,padding:"2px 6px"}}>NEW</span>
          </div>
          <p style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'DM Sans',sans-serif"}}>Who goes first? Place fingers · last one standing wins</p>
        </div>
        <ChevronRight size={18} style={{color:"#AA55FF",flexShrink:0,position:"relative",zIndex:10}}/>
      </motion.div>

      {/* AI Ref */}
      <div className="flex items-center gap-4 rounded-[20px] p-4 mb-6 relative overflow-hidden cursor-pointer hover:brightness-110 transition-all"
        style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(170,255,0,.22)"}}>
        <div className="absolute inset-0 pointer-events-none" style={{background:"linear-gradient(135deg,rgba(170,255,0,.04),transparent 60%)"}}/>
        <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0 relative z-10"
          style={{background:`linear-gradient(135deg,${N},#7DC900)`,boxShadow:"0 4px 16px rgba(170,255,0,.3)"}}>🤖</div>
        <div className="relative z-10 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,color:"#fff"}}>AI Referee</span>
            <span style={{fontSize:8,fontWeight:900,letterSpacing:"1px",background:"rgba(170,255,0,.14)",color:N,border:"1px solid rgba(170,255,0,.3)",borderRadius:5,padding:"2px 6px"}}>BETA</span>
          </div>
          <p style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'DM Sans',sans-serif"}}>Settle disputes · Check rules · Call it fair</p>
        </div>
        <ChevronRight size={18} style={{color:N,flexShrink:0,position:"relative",zIndex:10}}/>
      </div>

      {/* Decision Touch Overlay */}
      <AnimatePresence>
        {showDT && <DecisionTouchOverlay onClose={()=>setDT(false)}/>}
      </AnimatePresence>

      {/* League feed — classic leagues only; tournament results live in group tables + bracket */}
      {!isTournament && (
        <>
          <ST>⚡ League Feed</ST>
          {visible.map(m=><FeedCard key={m.id} m={m} onEdit={onEditFeed} onDelete={onDeleteFeed} canDelete={isAdmin||(myPlayerId&&(m.winnerIds?.includes(myPlayerId)||m.loserIds?.includes(myPlayerId)))} players={players}/>)}
          {feed.length>5&&!showAll&&(
            <button onClick={()=>setShowAll(true)}
              className="w-full rounded-[16px] py-3.5 font-bold text-sm hover:opacity-80 mb-4"
              style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
              ↓ Load {feed.length-5} More Matches
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ── DECISION TOUCH OVERLAY ── */
const DT_COLORS = ["#AAFF00","#3B8EFF","#FF3355","#FFB830","#AA55FF","#FF6B35","#00E5CC","#FF55AA","#7DC900","#4ECDC4"];
const DT_GOLD   = "#FFD700";
const DT_BASE   = 90; // base circle diameter px

function DecisionTouchOverlay({ onClose }) {
  const [circles,    setCircles]    = useState([]);
  const [phase,      setPhase]      = useState("waiting"); // waiting | countdown | winner
  const [countdown,  setCountdown]  = useState(4);
  const [winnerIds,  setWinnerIds]  = useState([]);
  const [numWins,    setNumWins]    = useState(1);
  const [isTouchDev, setIsTouchDev] = useState(false);

  // All mutable state shared across handlers lives here to avoid stale closures
  const st = useRef({
    circles:[], phase:"waiting", colorMap:{}, colorCount:0,
    numWins:1, tmr:null, intvl:null, mouseCount:0
  });

  // Keep numWins synced into ref so the 4s timeout reads the latest value
  useEffect(() => { st.current.numWins = numWins; }, [numWins]);

  const doStop = () => { clearTimeout(st.current.tmr); clearInterval(st.current.intvl); };

  const doStart = useCallback(() => {
    const s = st.current;
    doStop();
    let cnt = 4;
    s.phase = "countdown";
    setPhase("countdown"); setCountdown(4);
    s.intvl = setInterval(() => { cnt--; setCountdown(cnt); }, 1000);
    s.tmr = setTimeout(() => {
      clearInterval(s.intvl);
      if (!s.circles.length) return;
      const shuffled = [...s.circles].sort(() => Math.random() - 0.5);
      const nw = Math.min(s.numWins, s.circles.length);
      const wIds = shuffled.slice(0, nw).map(c => c.id);
      s.phase = "winner";
      setWinnerIds(wIds); setPhase("winner");
      try { navigator.vibrate([80,40,160,40,80]); } catch { /* ignore */ }
    }, 4000);
  }, []);

  const doCancel = useCallback(() => {
    doStop();
    st.current.phase = "waiting";
    setPhase("waiting"); setCountdown(4); setWinnerIds([]);
  }, []);

  const addPt = useCallback((id, x, y) => {
    const s = st.current;
    if (s.phase === "winner") return;
    if (!s.colorMap[id])
      s.colorMap[id] = DT_COLORS[s.colorCount++ % DT_COLORS.length];
    if (!s.circles.find(c => c.id === id))
      s.circles.push({ id, x, y, color: s.colorMap[id] });
    setCircles([...s.circles]);
    if (s.circles.length >= 2 && s.phase === "waiting") doStart();
  }, [doStart]);

  const removePt = useCallback((id) => {
    const s = st.current;
    if (s.phase === "winner") return;
    s.circles = s.circles.filter(c => c.id !== id);
    setCircles([...s.circles]);
    if (s.circles.length < 2) doCancel();
  }, [doCancel]);

  const onTS = useCallback((e) => {
    e.preventDefault();
    setIsTouchDev(true);
    for (const t of e.changedTouches) addPt(t.identifier, t.clientX, t.clientY);
  }, [addPt]);

  const onTM = useCallback((e) => {
    e.preventDefault();
    const s = st.current;
    for (const t of e.changedTouches) {
      const c = s.circles.find(c => c.id === t.identifier);
      if (c) { c.x = t.clientX; c.y = t.clientY; }
    }
    setCircles([...s.circles]);
  }, []);

  const onTE = useCallback((e) => {
    e.preventDefault();
    for (const t of e.changedTouches) removePt(t.identifier);
  }, [removePt]);

  // Desktop: click anywhere in the touch zone adds a persistent virtual circle
  const onMD = (e) => {
    if (isTouchDev || st.current.phase === "winner") return;
    const id = `m${st.current.mouseCount++}`;
    addPt(id, e.clientX, e.clientY);
  };

  useEffect(() => () => doStop(), []);

  // Pulse frequency increases as countdown shrinks: 4→0.72s, 3→0.54s, 2→0.36s, 1→0.18s
  const pulseDur = phase === "countdown" ? Math.max(0.18, countdown * 0.18) : 0.88;
  const pulseAmt = phase === "countdown" ? 1 + 0.025 * (5 - countdown) : 1.06;

  return (
    <motion.div
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      style={{position:"fixed",inset:0,zIndex:9998,
        background:"rgba(0,0,0,.97)",backdropFilter:"blur(24px)",
        touchAction:"none",userSelect:"none",WebkitUserSelect:"none",
        display:"flex",flexDirection:"column",overflow:"hidden"}}
      onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
      onMouseDown={!isTouchDev ? onMD : undefined}>

      {/* Compact header — fixed height, no scroll */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 20px 10px",
        paddingTop:"max(env(safe-area-inset-top,12px),12px)",
        background:"rgba(0,0,0,.5)",borderBottom:"1px solid rgba(255,255,255,.06)",
        flexShrink:0,pointerEvents:"auto",zIndex:10}}>
        <div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:"3px",color:"#fff",lineHeight:1}}>
            DECISION TOUCH
          </div>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,color:"rgba(255,255,255,.28)",marginTop:2}}>
            Place fingers · last one{numWins>1?" two":""} standing win{numWins>1?"":"s"}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,pointerEvents:"auto"}}>
          {phase==="waiting" && (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:9,fontWeight:700,letterSpacing:"1px",
                color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>WINNERS</span>
              {[1,2].map(n=>(
                <button key={n} onClick={()=>setNumWins(n)}
                  style={{width:26,height:26,borderRadius:7,cursor:"pointer",
                    border:`1.5px solid ${numWins===n?"#AA55FF":"rgba(255,255,255,.1)"}`,
                    background:numWins===n?"rgba(170,85,255,.2)":"transparent",
                    color:numWins===n?"#AA55FF":"rgba(255,255,255,.38)",
                    fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,
                    transition:"all .2s"}}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <button onClick={onClose}
            style={{width:34,height:34,borderRadius:"50%",flexShrink:0,
              background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",
              display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <X size={14} style={{color:"rgba(255,255,255,.5)"}}/>
          </button>
        </div>
      </div>

      {/* Touch zone — fills all remaining viewport height */}
      <div style={{flex:1,overflow:"hidden"}}>

        {/* Phase instructions / countdown / result — each phase is a full-screen fixed layer,
            content centered via flexbox so Framer Motion's y/scale transforms never fight
            the centering offset */}
        <AnimatePresence mode="wait">
          {phase==="waiting" && (
            <motion.div key="inst"
              initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}
              style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                pointerEvents:"none",zIndex:9999}}>
              <div style={{textAlign:"center",width:"80%"}}>
                <motion.div animate={{scale:[1,1.12,1],opacity:[.5,1,.5]}} transition={{duration:2,repeat:Infinity}}>
                  <div style={{fontSize:48,marginBottom:12}}>☝️</div>
                </motion.div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:"3px",
                  color:"rgba(255,255,255,.85)",marginBottom:6}}>
                  {circles.length===0?"PLACE YOUR FINGERS":circles.length===1?"NEED 1 MORE...":"HOLD STILL..."}
                </div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"rgba(255,255,255,.28)"}}>
                  {circles.length===0
                    ?(isTouchDev?"Everyone touch the screen at the same time":"Click to place fingers · 2+ to start")
                    :circles.length===1?"At least 2 fingers required":""}
                </div>
              </div>
            </motion.div>
          )}

          {phase==="countdown" && (
            <motion.div key="cd"
              initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                pointerEvents:"none",zIndex:9999}}>
              <div style={{textAlign:"center"}}>
                <AnimatePresence mode="wait">
                  <motion.div key={countdown}
                    initial={{scale:1.7,opacity:0}} animate={{scale:1,opacity:1}}
                    exit={{scale:.4,opacity:0}} transition={{duration:.28}}
                    style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:100,letterSpacing:"4px",
                      color:N,lineHeight:1,textShadow:`0 0 50px ${N}88`}}>
                    {countdown}
                  </motion.div>
                </AnimatePresence>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"rgba(255,255,255,.32)",marginTop:6}}>
                  Keep holding...
                </div>
              </div>
            </motion.div>
          )}

          {phase==="winner" && (
            <motion.div key="win"
              initial={{opacity:0,scale:.85}} animate={{opacity:1,scale:1}}
              style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                pointerEvents:"none",zIndex:9999}}>
              <div style={{textAlign:"center",pointerEvents:"auto"}}>
                <motion.div animate={{scale:[1,1.06,1]}} transition={{duration:.55,repeat:3}}
                  style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:"4px",
                    color:"#fff",marginBottom:8}}>
                  🏆 {winnerIds.length>1?"WINNERS CHOSEN!":"WINNER CHOSEN!"}
                </motion.div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:24}}>
                  {winnerIds.length>1?"The golden fingers are the chosen ones":"The golden finger is the chosen one"}
                </div>
                <button onClick={onClose}
                  style={{padding:"14px 40px",borderRadius:14,
                    background:`linear-gradient(135deg,${N},#7DC900)`,border:"none",
                    fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,color:"#000",
                    cursor:"pointer",boxShadow:"0 6px 22px rgba(170,255,0,.35)"}}>
                  Done ✓
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Touch circles — marginLeft/Top centering lets Framer Motion own transform for scale */}
        {circles.map(c => {
          const isWinner = phase==="winner" && winnerIds.includes(c.id);
          const isLoser  = phase==="winner" && !winnerIds.includes(c.id);
          const col = isWinner ? DT_GOLD : c.color;
          return (
            <motion.div key={c.id}
              initial={{scale:0,opacity:1}}
              animate={
                isLoser  ? {opacity:0,scale:0}
                : isWinner ? {scale:[1,1.55,1.4,1.55,1.4]}
                : {scale:[1,pulseAmt,1]}
              }
              transition={
                isLoser  ? {duration:.45,ease:"easeOut"}
                : isWinner ? {duration:.65,repeat:Infinity,ease:"easeInOut"}
                : {duration:pulseDur,repeat:Infinity,ease:"easeInOut"}
              }
              style={{
                position:"absolute",
                left:c.x, top:c.y,
                width:DT_BASE, height:DT_BASE,
                marginLeft:-DT_BASE/2, marginTop:-DT_BASE/2,
                borderRadius:"50%",
                background:`radial-gradient(circle,${col}55 0%,${col}18 60%,transparent 100%)`,
                border:`3px solid ${col}`,
                boxShadow:isWinner
                  ?`0 0 50px ${DT_GOLD}cc,0 0 90px ${DT_GOLD}66,0 0 130px ${DT_GOLD}33`
                  :`0 0 22px ${c.color}77,0 0 44px ${c.color}33`,
                display:"flex",alignItems:"center",justifyContent:"center",
                pointerEvents:"none",zIndex:8
              }}>
              {isWinner && (
                <motion.div initial={{scale:0}} animate={{scale:1}} style={{fontSize:24}}>🏆</motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ── STATS TAB ── */
function StatsTab({players, feed, isTournament = false, groupMatches = [], bracket = null}) {
  const [sub,setSub] = useState("lb");
  const enriched = useMemo(()=>enrichPlayers(players,feed),[players,feed]);

  // Derive all unique tournament participants from fixtures and bracket
  const allParticipants = useMemo(() => {
    if (!isTournament) return [];
    const seen = new Set();
    const list = [];
    const add = (p) => { if (p?.name && !seen.has(p.name)) { seen.add(p.name); list.push({ id: p.id, name: p.name }); } };
    for (const m of groupMatches) { add(m.p1); add(m.p2); }
    if (bracket?.rounds) {
      for (const round of bracket.rounds) {
        for (const m of round) { if (!m.isBye) { add(m.p1); add(m.p2); } }
      }
    }
    return list;
  }, [isTournament, groupMatches, bracket]);

  const mePlayer = players.find(p => p.isMe) || enriched.find(p => p.isMe);
  const [selectedName, setSelectedName] = useState(() => mePlayer?.name || "");

  function LbView() {
    const FALLBACK = {name:"N/A",wins:0,losses:0,gamesWon:0,gamesLost:0,totalPlayed:0,mvTrend:[0,0,0,0,0,0,0],partners:{}};
    const me   = enriched.find(p=>p.isMe) || FALLBACK;
    const mW        = players.length>0?[...players].sort((a,b)=>b.wins-a.wins)[0]:FALLBACK;
    const mP        = players.length>0?[...players].sort((a,b)=>b.totalPlayed-a.totalPlayed)[0]:FALLBACK;
    const mL        = players.length>0?[...players].sort((a,b)=>b.losses-a.losses)[0]:FALLBACK;
    const mLeast    = players.length>0?[...players].sort((a,b)=>a.totalPlayed-b.totalPlayed)[0]:FALLBACK;
    const mGM       = enriched.length>0?[...enriched].sort((a,b)=>b.gamesWon-a.gamesWon)[0]:FALLBACK;
    const mGL       = enriched.length>0?[...enriched].sort((a,b)=>b.gamesLost-a.gamesLost)[0]:FALLBACK;
    const mClutch   = players.length>0?[...players].sort((a,b)=>(b.clutchWins||0)-(a.clutchWins||0))[0]:FALLBACK;
    const mStreak   = players.length>0?[...players].sort((a,b)=>(b.bestStreak||0)-(a.bestStreak||0))[0]:FALLBACK;
    const mComeback = players.length>0?[...players].sort((a,b)=>(b.comebacks||0)-(a.comebacks||0))[0]:FALLBACK;
    const barC = pc=>pc>=70?`linear-gradient(90deg,${N},#7DC900)`:pc>=50?"linear-gradient(90deg,#FFB830,#E08A00)":"linear-gradient(90deg,#FF3355,#C0143C)";

    // ── TOURNAMENT AWARDS (hard-wired to settings data + feed) ──
    if (isTournament) {
      // Dual-key player map: by String(id) AND by name — handles ID type mismatches.
      // Seed from ALL sources so tournament-only participants (not in the players table) get a bucket.
      const pById = {}, pByName = {};
      const _addP = (id, name) => {
        if (!name || pByName[name]) return;
        const s = { id, name, wins:0, losses:0, played:0, gf:0, ga:0, bestStreak:0, streak:0 };
        if (id != null) pById[String(id)] = s;
        pByName[name] = s;
      };
      for (const p of players) _addP(p.id, p.name);
      for (const fx of (groupMatches || [])) { _addP(fx.p1?.id, fx.p1?.name); _addP(fx.p2?.id, fx.p2?.name); }
      for (const round of (bracket?.rounds || [])) {
        for (const bm of (round || [])) { if (!bm?.isBye) { _addP(bm.p1?.id, bm.p1?.name); _addP(bm.p2?.id, bm.p2?.name); } }
      }
      const lookup = (id, name) => pById[String(id ?? "")] || pByName[name] || null;

      let totalMatches = 0;

      // SOURCE 1: Group stage — check fixture for embedded scores (settings-stored) or fall back to feed
      for (const fixture of (groupMatches || [])) {
        const result = feed.find(m => String(m.id) === String(fixture.id));
        // Scores may live directly on the fixture object (settings.groupMatches) or in the feed
        const hasResult = result != null || fixture.winner != null || fixture.p1Goals != null || fixture.isDraw === true;
        if (!hasResult) continue;
        totalMatches++;
        const p1 = lookup(fixture.p1?.id, fixture.p1?.name);
        const p2 = lookup(fixture.p2?.id, fixture.p2?.name);
        const p1g = fixture.p1Goals != null ? Number(fixture.p1Goals) : (Number(result?.p1Goals) || 0);
        const p2g = fixture.p2Goals != null ? Number(fixture.p2Goals) : (Number(result?.p2Goals) || 0);
        const isDraw = fixture.isDraw ?? result?.isDraw ?? (p1g === p2g && (p1g > 0 || result != null));
        if (p1) { p1.gf += p1g; p1.ga += p2g; }
        if (p2) { p2.gf += p2g; p2.ga += p1g; }
        if (isDraw) {
          if (p1) { p1.played++; p1.streak = 0; }
          if (p2) { p2.played++; p2.streak = 0; }
        } else {
          const winner = p1g >= p2g ? p1 : p2;
          const loser  = p1g >= p2g ? p2 : p1;
          if (winner) { winner.wins++; winner.played++; winner.streak++; winner.bestStreak = Math.max(winner.bestStreak, winner.streak); }
          if (loser)  { loser.losses++; loser.played++; loser.streak = 0; }
        }
      }

      // SOURCE 2: Bracket — walk rounds directly from bracket state (authoritative for knockout scores)
      if (bracket?.rounds?.length) {
        for (let ri = 0; ri < bracket.rounds.length; ri++) {
          for (const match of bracket.rounds[ri]) {
            if (!match.winner || match.isBye) continue;
            totalMatches++;
            const p1 = lookup(match.p1?.id, match.p1?.name);
            const p2 = lookup(match.p2?.id, match.p2?.name);
            const p1g = Number(match.score?.p1Goals) || 0;
            const p2g = Number(match.score?.p2Goals) || 0;
            if (p1) { p1.gf += p1g; p1.ga += p2g; }
            if (p2) { p2.gf += p2g; p2.ga += p1g; }
            const winner = lookup(match.winner.id, match.winner.name);
            const loserObj = String(match.winner.id) === String(match.p1?.id) ? match.p2 : match.p1;
            const loser = lookup(loserObj?.id, loserObj?.name);
            if (winner) { winner.wins++; winner.played++; winner.streak++; winner.bestStreak = Math.max(winner.bestStreak, winner.streak); }
            if (loser)  { loser.losses++; loser.played++; loser.streak = 0; }
          }
        }
      }

      const pArr = Object.values(pByName).filter(p => p.played > 0);
      const FALLBACK_P = { name: "N/A", wins: 0, losses: 0, played: 0, gf: 0, ga: 0, bestStreak: 0 };
      const byStr   = pArr.length ? [...pArr].sort((a,b)=>b.bestStreak-a.bestStreak)[0] : FALLBACK_P;
      const byPlay  = pArr.length ? [...pArr].sort((a,b)=>b.played-a.played)[0]         : FALLBACK_P;
      const byLoss  = pArr.length ? [...pArr].sort((a,b)=>b.losses-a.losses)[0]         : FALLBACK_P;
      const byGF    = pArr.length ? [...pArr].sort((a,b)=>b.gf-a.gf)[0]                 : FALLBACK_P;
      const byGA    = pArr.length ? [...pArr].sort((a,b)=>a.ga-b.ga)[0]                 : FALLBACK_P;
      const bySieve = pArr.length ? [...pArr].sort((a,b)=>b.ga-a.ga)[0]                 : FALLBACK_P;

      const activeName = selectedName || mePlayer?.name || (allParticipants[0]?.name ?? "");
      const selectedDbPlayer = players.find(p => p.name === activeName) || enriched.find(p => p.name === activeName);
      const meStats = activeName ? (lookup(selectedDbPlayer?.id, activeName) || null) : null;

      const byMostW = pArr.length ? [...pArr].sort((a,b)=>b.wins-a.wins)[0]           : FALLBACK_P;
      const T_AWARDS = [
        {icon:"🏆",lbl:"MOST WINS",           lc:"rgba(255,215,0,.8)",  sc:"#FFD700", bdr:"rgba(255,215,0,.25)",  name:byMostW.name,      bigNum:byMostW.wins,              unit:"WINS",       stat:"Most wins in tournament"},
        {icon:"🔥",lbl:"SUPER STREAK",        lc:"rgba(170,255,0,.7)",  sc:N,         bdr:"rgba(170,255,0,.2)",   name:byStr.name,        bigNum:byStr.bestStreak,          unit:"WIN STREAK", stat:"Longest consecutive wins"},
        {icon:"⚙️",lbl:"THE GRINDER",         lc:"rgba(255,184,48,.7)", sc:"#FFB830", bdr:"rgba(255,184,48,.2)",  name:byPlay.name,       bigNum:byPlay.played,             unit:"MATCHES",    stat:"Most matches played"},
        {icon:"💀",lbl:"PROFESSIONAL LOSER",  lc:"rgba(255,51,85,.7)",  sc:"#FF3355", bdr:"rgba(255,51,85,.2)",   name:byLoss.name,       bigNum:byLoss.losses,             unit:"LOSSES",     stat:"Most losses in tournament"},
        {icon:"⚽",lbl:"HIGHEST SCORE",       lc:"rgba(59,142,255,.7)", sc:"#3B8EFF", bdr:"rgba(59,142,255,.2)",  name:byGF.name,         bigNum:byGF.gf,                   unit:"GOALS",      stat:"Most goals scored"},
        {icon:"🧱",lbl:"THE WALL",            lc:"rgba(170,255,0,.7)",  sc:N,         bdr:"rgba(170,255,0,.2)",   name:byGA.name,         bigNum:pArr.length?byGA.ga:"N/A", unit:"CONCEDED",   stat:"Fewest goals conceded"},
        {icon:"🕳️",lbl:"THE SIEVE",           lc:"rgba(255,107,53,.7)", sc:"#FF6B35", bdr:"rgba(255,107,53,.2)",  name:bySieve.name,      bigNum:bySieve.ga,                unit:"CONCEDED",   stat:"Most goals conceded"},
      ];

      const noDataMsg = (
        <div className="rounded-[20px] p-4 mb-5 text-center" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
          <span style={{fontSize:12,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>No matches played yet</span>
        </div>
      );

      return (
        <div>
          {/* Player selector — pick any participant */}
          {allParticipants.length > 0 && (
            <div className="mb-4">
              <div style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginBottom:8}}>SELECT PLAYER</div>
              <div className="relative">
                <select value={activeName} onChange={e => setSelectedName(e.target.value)}
                  className="w-full rounded-[14px] py-3 px-4 text-[13px] font-bold appearance-none"
                  style={{background:"rgba(255,255,255,.06)",border:`1px solid ${N}40`,color:"#fff",fontFamily:"'DM Sans',sans-serif",
                    outline:"none",cursor:"pointer",WebkitAppearance:"none",paddingRight:36}}>
                  {allParticipants.map(p => (
                    <option key={p.name} value={p.name} style={{background:"#111",color:"#fff"}}>{p.name}{p.name===mePlayer?.name?" (me)":""}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{color:N,fontSize:14}}>▾</div>
              </div>
            </div>
          )}

          {/* Personal Score Ratio — always visible even at 0 */}
          <ST>📊 Score Ratio — {activeName||"Select player"}</ST>
          <div className="rounded-[20px] p-4 mb-5" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
            {meStats && meStats.played > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[{v:meStats.gf,l:"GOALS SCORED",c:"#AAFF00"},{v:meStats.ga,l:"GOALS CONCEDED",c:"#FF3355"}].map(({v,l,c})=>(
                    <div key={l} className="text-center">
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,letterSpacing:"2px",lineHeight:1,color:c,marginBottom:4}}>{v}</div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:"1.5px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex rounded-[8px] overflow-hidden" style={{height:16}}>
                  {(()=>{ const tot=(meStats.gf+meStats.ga)||1; const p=Math.round(meStats.gf/tot*100); return(<><div style={{width:`${p}%`,background:"linear-gradient(90deg,#AAFF00,#7DC900)",minWidth:p>0?4:0,transition:"width .4s ease"}}/><div style={{flex:1,background:"linear-gradient(90deg,#FF3355,#C0143C)"}}/></>); })()}
                </div>
                <div className="flex justify-between mt-2">
                  <span style={{fontSize:10,fontWeight:700,color:"#AAFF00",fontFamily:"'DM Sans',sans-serif"}}>{meStats.gf} scored</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{meStats.played} matches</span>
                  <span style={{fontSize:10,fontWeight:700,color:"#FF3355",fontFamily:"'DM Sans',sans-serif"}}>{meStats.ga} conceded</span>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[{v:0,l:"GOALS SCORED",c:"#AAFF00"},{v:0,l:"GOALS CONCEDED",c:"#FF3355"}].map(({v,l,c})=>(
                    <div key={l} className="text-center">
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,letterSpacing:"2px",lineHeight:1,color:c,marginBottom:4,opacity:.35}}>{v}</div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:"1.5px",color:"rgba(255,255,255,.25)",fontFamily:"'DM Sans',sans-serif"}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex rounded-[8px] overflow-hidden" style={{height:16}}>
                  <div style={{width:"50%",background:"linear-gradient(90deg,#AAFF00,#7DC900)",opacity:.25}}/>
                  <div style={{flex:1,background:"linear-gradient(90deg,#FF3355,#C0143C)",opacity:.25}}/>
                </div>
                <div className="text-center mt-2" style={{fontSize:10,color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif"}}>No matches yet</div>
              </>
            )}
          </div>

          <ST>🏅 Tournament Awards</ST>
          {totalMatches === 0 ? noDataMsg : (
            <div className="flex flex-col gap-3 mb-5">
              {T_AWARDS.map(c => (
                <div key={c.lbl} className="rounded-[20px] p-4 relative overflow-hidden" style={{background:"rgba(255,255,255,.03)",border:`1px solid ${c.bdr}`}}>
                  <div className="absolute inset-0 pointer-events-none" style={{background:`linear-gradient(135deg,${c.sc}08,transparent 60%)`}}/>
                  <div className="flex items-center justify-between gap-3 relative">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-[22px] flex-shrink-0 mt-0.5">{c.icon}</span>
                      <div className="min-w-0">
                        <div style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:c.lc,fontFamily:"'DM Sans',sans-serif",marginBottom:3}}>{c.lbl}</div>
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"#fff",marginBottom:2}}>{c.name}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{c.stat}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,letterSpacing:"2px",color:c.sc,lineHeight:1}}>{c.bigNum}</div>
                      <div style={{fontSize:8,fontWeight:700,letterSpacing:"1px",color:`${c.sc}99`,fontFamily:"'DM Sans',sans-serif",marginTop:2}}>{c.unit}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const ALL_AWARDS = [
      {icon:"🏆",lbl:"THE WINNER",        lc:"rgba(170,255,0,.7)",   sc:N,         bdr:"rgba(170,255,0,.2)",   p:mW,        bigNum:mW.wins,                   unit:"WINS",        stat:`${pct(mW.wins,mW.losses)}% win rate`,       hasTrend:true},
      {icon:"⚡",lbl:"CLUTCH PLAYER",     lc:"rgba(59,142,255,.7)",  sc:"#3B8EFF", bdr:"rgba(59,142,255,.2)",  p:mClutch,   bigNum:mClutch.clutchWins||0,     unit:"CLUTCH WINS", stat:`Tight-score wins`,                           hasTrend:false},
      {icon:"🔥",lbl:"SUPER STREAK",      lc:"rgba(170,255,0,.7)",   sc:N,         bdr:"rgba(170,255,0,.2)",   p:mStreak,   bigNum:mStreak.bestStreak||0,     unit:"WIN STREAK",  stat:`Best consecutive wins`,                      hasTrend:false},
      {icon:"👑",lbl:"COMEBACK KING",     lc:"rgba(255,184,48,.7)",  sc:"#FFB830", bdr:"rgba(255,184,48,.2)",  p:mComeback, bigNum:mComeback.comebacks||0,    unit:"COMEBACKS",   stat:`Most comeback victories`,                    hasTrend:false},
      {icon:"⚙️",lbl:"THE GRINDER",       lc:"rgba(255,184,48,.7)",  sc:"#FFB830", bdr:"rgba(255,184,48,.2)",  p:mP,        bigNum:mP.totalPlayed,            unit:"MATCHES",     stat:`Most matches played`,                        hasTrend:true},
      {icon:"💀",lbl:"PROFESSIONAL LOSER",lc:"rgba(255,51,85,.7)",   sc:"#FF3355", bdr:"rgba(255,51,85,.2)",   p:mL,        bigNum:mL.losses,                 unit:"LOSSES",      stat:`Most losses on record`,                      hasTrend:true},
      {icon:"🩹",lbl:"THE INJURED ONE",   lc:"rgba(255,107,53,.7)",  sc:"#FF6B35", bdr:"rgba(255,107,53,.2)",  p:mLeast,    bigNum:mLeast.totalPlayed,        unit:"MATCHES",     stat:`${mLeast.totalPlayed===0?"Hasn't played yet":"Fewest matches played"}`, hasTrend:false},
      {icon:"🎯",lbl:"GAME MASTER",       lc:"rgba(59,142,255,.7)",  sc:"#3B8EFF", bdr:"rgba(59,142,255,.2)",  p:mGM,       bigNum:mGM.gamesWon,              unit:"MINI-GAMES",  stat:`${mGM.gamesWon} mini-games won`,             hasTrend:true},
      {icon:"💔",lbl:"THE VICTIM",        lc:"rgba(170,85,255,.7)",  sc:"#AA55FF", bdr:"rgba(170,85,255,.2)",  p:mGL,       bigNum:mGL.gamesLost,             unit:"GAMES LOST",  stat:`${mGL.gamesLost} mini-games lost`,           hasTrend:true},
    ];
    const partners = me.partners
      ? Object.entries(me.partners).map(([id,p])=>({pp:players.find(x=>x.id===Number(id)),pc:Math.round(p*100)})).filter(x=>x.pp).sort((a,b)=>b.pc-a.pc)
      : [];
    return (
      <div>
        <ST>🏅 Season Awards</ST>
        <div className="flex flex-col gap-3 mb-5">
          {ALL_AWARDS.map(c=>(
            <div key={c.lbl} className="rounded-[20px] p-4 relative overflow-hidden" style={{background:"rgba(255,255,255,.03)",border:`1px solid ${c.bdr}`}}>
              <div className="absolute inset-0 pointer-events-none" style={{background:`linear-gradient(135deg,${c.sc}08,transparent 60%)`}}/>
              <div className="flex items-center justify-between gap-3 relative">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-[22px] flex-shrink-0 mt-0.5">{c.icon}</span>
                  <div className="min-w-0">
                    <div style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:c.lc,fontFamily:"'DM Sans',sans-serif",marginBottom:3}}>{c.lbl}</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"#fff",marginBottom:2}}>{c.p.name}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginBottom:c.hasTrend?6:0}}>{c.stat}</div>
                    {c.hasTrend&&<Sparkline data={c.p.mvTrend||[0,0,0,0,0,0,0]} color={c.sc} w={100} h={20}/>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,letterSpacing:"2px",color:c.sc,lineHeight:1}}>{c.bigNum}</div>
                  <div style={{fontSize:8,fontWeight:700,letterSpacing:"1px",color:`${c.sc}99`,fontFamily:"'DM Sans',sans-serif",marginTop:2}}>{c.unit}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!isTournament && <ST>🤝 My Partner Rate</ST>}
        {!isTournament && (
          <div className="rounded-[20px] p-4 mb-5" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
            {partners.map(({pp,pc:ppc})=>(
              <div key={pp.id} className="flex items-center gap-2.5 mb-3">
                <div style={{width:72,fontSize:12,fontWeight:600,color:"rgba(255,255,255,.65)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>{pp.name}</div>
                <AnimBar value={ppc} color={barC(ppc)}/>
                <div style={{width:32,fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",textAlign:"right"}}>{ppc}%</div>
              </div>
            ))}
          </div>
        )}

        {/* League player selector for Score Ratio */}
        {enriched.length > 0 && (
          <div className="mb-4">
            <div style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginBottom:8}}>SELECT PLAYER</div>
            <div className="relative">
              <select
                value={selectedName && enriched.find(p=>p.name===selectedName) ? selectedName : me.name}
                onChange={e => setSelectedName(e.target.value)}
                className="w-full rounded-[14px] py-3 px-4 text-[13px] font-bold appearance-none"
                style={{background:"rgba(255,255,255,.06)",border:`1px solid ${N}40`,color:"#fff",fontFamily:"'DM Sans',sans-serif",outline:"none",cursor:"pointer",WebkitAppearance:"none",paddingRight:36}}>
                {enriched.map(p => (
                  <option key={p.id} value={p.name} style={{background:"#111",color:"#fff"}}>{p.name}{p.isMe?" (me)":""}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{color:N,fontSize:14}}>▾</div>
            </div>
          </div>
        )}
        {(()=>{
          const lgName = (selectedName && enriched.find(p=>p.name===selectedName)) ? selectedName : me.name;
          const lgP    = enriched.find(p=>p.name===lgName) || me;
          const lgTot  = (lgP.gamesWon+lgP.gamesLost)||1;
          const lgPct  = Math.round(lgP.gamesWon/lgTot*100);
          return (
            <>
              <ST>⚽ Score Ratio — {lgName||"Select player"}</ST>
              <div className="rounded-[20px] p-4 mb-2" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[{v:lgP.gamesWon,l:"MINI-GAMES WON",c:"#AAFF00"},{v:lgP.gamesLost,l:"MINI-GAMES LOST",c:"#FF3355"}].map(({v,l,c})=>(
                    <div key={l} className="text-center">
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,letterSpacing:"2px",lineHeight:1,color:c,marginBottom:4}}>{v}</div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:"1.5px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex rounded-[8px] overflow-hidden" style={{height:16}}>
                  <div style={{width:`${lgPct}%`,background:"linear-gradient(90deg,#AAFF00,#7DC900)",minWidth:lgPct>0?4:0,transition:"width .4s ease"}}/>
                  <div style={{flex:1,background:"linear-gradient(90deg,#FF3355,#C0143C)"}}/>
                </div>
                <div className="flex justify-between mt-2">
                  <span style={{fontSize:10,fontWeight:700,color:"#AAFF00",fontFamily:"'DM Sans',sans-serif"}}>{lgP.gamesWon} won</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{lgP.gamesWon+lgP.gamesLost} total</span>
                  <span style={{fontSize:10,fontWeight:700,color:"#FF3355",fontFamily:"'DM Sans',sans-serif"}}>{lgP.gamesLost} lost</span>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    );
  }

  function H2HView() {
    // All selectable names: DB players + tournament-only participants (from fixtures/bracket)
    const allNames = useMemo(() => {
      const seen = new Set();
      const list = [];
      const add = (name) => { if (name && !seen.has(name)) { seen.add(name); list.push(name); } };
      players.forEach(p => add(p?.name));
      allParticipants.forEach(p => add(p?.name));
      return list;
    }, [players, allParticipants]);

    const mePlayer = players.find(p => p?.isMe);
    const defaultP1 = mePlayer?.name || allNames[0] || "";
    const defaultP2 = allNames.find(n => n !== defaultP1) || "";
    const [p1Name, setP1Name] = useState(defaultP1);
    const [p2Name, setP2Name] = useState(defaultP2);

    // Unified match data from all sources, deduped by ID
    const allMatchData = useMemo(() => {
      const result = [];
      const seenIds = new Set();
      for (const m of (feed || [])) {
        if (!m?.id || seenIds.has(String(m.id))) continue;
        seenIds.add(String(m.id));
        result.push({ source: "feed", raw: m });
      }
      for (const fx of (groupMatches || [])) {
        if (!fx?.id || seenIds.has(String(fx.id))) continue;
        if (fx.p1Goals == null && fx.winner == null && fx.isDraw !== true) continue;
        seenIds.add(String(fx.id));
        result.push({ source: "group", raw: fx });
      }
      for (const round of (bracket?.rounds || [])) {
        for (const bm of (round || [])) {
          if (!bm?.id || bm?.isBye || !bm?.winner || seenIds.has(String(bm.id))) continue;
          seenIds.add(String(bm.id));
          result.push({ source: "bracket", raw: bm });
        }
      }
      return result;
    }, [feed, groupMatches, bracket]);

    // Compute H2H stats between p1Name and p2Name
    const stats = useMemo(() => {
      if (!p1Name || !p2Name || p1Name === p2Name) return null;
      let p1w = 0, p2w = 0, draws = 0, p1gf = 0, p2gf = 0;
      const p1Obj = players.find(p => p?.name === p1Name);
      const p2Obj = players.find(p => p?.name === p2Name);

      for (const { source, raw } of allMatchData) {
        try {
          if (source === "feed") {
            const m = raw;
            const nameIn = (n) => m?.p1Name === n || m?.p2Name === n || m?.winner === n || m?.loser === n;
            const idIn   = (o) => o?.id && [...(m?.winnerIds||[]),...(m?.loserIds||[])].map(String).includes(String(o.id));
            if ((!nameIn(p1Name) && !idIn(p1Obj)) || (!nameIn(p2Name) && !idIn(p2Obj))) continue;

            if (m?.isDraw) {
              draws++;
            } else {
              const p1wins =
                m?.winner === p1Name ||
                (m?.p1Name === p1Name && Number(m?.p1Goals||0) > Number(m?.p2Goals||0)) ||
                (p1Obj?.id && (m?.winnerIds||[]).map(String).includes(String(p1Obj.id)));
              const p2wins =
                m?.winner === p2Name ||
                (m?.p2Name === p2Name && Number(m?.p2Goals||0) > Number(m?.p1Goals||0)) ||
                (p2Obj?.id && (m?.winnerIds||[]).map(String).includes(String(p2Obj.id)));
              if (p1wins) p1w++;
              else if (p2wins) p2w++;
              else continue;
            }
            // Group-stage feed entries have explicit p1Goals/p2Goals with named slots.
            // League and bracket feed entries embed the score in sets[] as "winner–loser"
            // strings (e.g. "3–2"), with no p1Name/p1Goals fields at all.
            if (m?.p1Name === p1Name) {
              p1gf += Number(m?.p1Goals)||0; p2gf += Number(m?.p2Goals)||0;
            } else if (m?.p2Name === p1Name) {
              p1gf += Number(m?.p2Goals)||0; p2gf += Number(m?.p1Goals)||0;
            } else {
              // sets-based fallback: skip 2-leg aggregate strings like "[1–0, 2–1] Agg"
              const raw0 = (m?.sets||[])[0]?.toString() || "";
              if (raw0 && !raw0.includes("[")) {
                const wG = (m.sets||[]).reduce((a,s)=>{ const {w}=parseMG(s); return a+w; },0);
                const lG = (m.sets||[]).reduce((a,s)=>{ const {l}=parseMG(s); return a+l; },0);
                const p1isW = p1Obj?.id && (m?.winnerIds||[]).map(String).includes(String(p1Obj.id));
                const p2isW = p2Obj?.id && (m?.winnerIds||[]).map(String).includes(String(p2Obj.id));
                if (p1isW)      { p1gf += wG; p2gf += lG; }
                else if (p2isW) { p2gf += wG; p1gf += lG; }
              }
            }

          } else if (source === "group") {
            const fx = raw;
            const fp1 = fx?.p1?.name, fp2 = fx?.p2?.name;
            const normal = fp1 === p1Name && fp2 === p2Name;
            const flipped = fp1 === p2Name && fp2 === p1Name;
            if (!normal && !flipped) continue;
            const rawG1 = Number(fx?.p1Goals)||0, rawG2 = Number(fx?.p2Goals)||0;
            const [g1, g2] = normal ? [rawG1, rawG2] : [rawG2, rawG1];
            const isDraw = fx?.isDraw === true || (rawG1 === rawG2 && (rawG1 > 0 || fx?.winner != null));
            if (isDraw) draws++;
            else if (g1 > g2) p1w++;
            else p2w++;
            p1gf += g1; p2gf += g2;

          } else if (source === "bracket") {
            const bm = raw;
            const bp1 = bm?.p1?.name, bp2 = bm?.p2?.name;
            const normal = bp1 === p1Name && bp2 === p2Name;
            const flipped = bp1 === p2Name && bp2 === p1Name;
            if (!normal && !flipped) continue;
            const wn = bm?.winner?.name;
            if (wn === p1Name) p1w++;
            else if (wn === p2Name) p2w++;
            else continue;
            const sc = bm?.score || {};
            const rawG1 = Number(sc?.p1Goals)||0, rawG2 = Number(sc?.p2Goals)||0;
            const [g1, g2] = normal ? [rawG1, rawG2] : [rawG2, rawG1];
            p1gf += g1; p2gf += g2;
          }
        } catch { /* skip malformed entries */ }
      }
      return { p1w, p2w, draws, p1gf, p2gf, total: p1w + p2w + draws };
    }, [p1Name, p2Name, allMatchData, players]);

    const vrd = useMemo(() => {
      if (!stats || !p1Name || !p2Name) return null;
      const { p1w, p2w, draws, total } = stats;
      if (!total) return { icon:"❓", title:"NO DATA YET",       text:"These two haven't faced each other yet.",         bg:"rgba(255,255,255,.04)", bdr:"rgba(255,255,255,.12)", color:"rgba(255,255,255,.5)", badge:null           };
      const r = p1w / total;
      if (!p2w&&!draws) return { icon:"👑", title:"UNTOUCHABLE",   text:`${p1Name} has NEVER lost to ${p2Name}.`,        bg:"rgba(170,255,0,.07)",   bdr:"rgba(170,255,0,.25)",  color:N,           badge:"PERFECT RECORD"  };
      if (!p1w&&!draws) return { icon:"😰", title:"NIGHTMARE",     text:`${p1Name} has ZERO wins vs ${p2Name}.`,         bg:"rgba(255,51,85,.07)",   bdr:"rgba(255,51,85,.25)",  color:"#FF3355",   badge:"0 WINS"          };
      if (r >= .8)      return { icon:"💪", title:"DOMINANT",      text:`${p1Name} wins ${Math.round(r*100)}% of H2Hs.`, bg:"rgba(170,255,0,.07)",   bdr:"rgba(170,255,0,.22)",  color:N,           badge:"DOMINANT"        };
      if (r >= .6)      return { icon:"📈", title:"SLIGHT EDGE",   text:`${p1Name} leads ${p1w}–${p2w}.`,               bg:"rgba(170,255,0,.05)",   bdr:"rgba(170,255,0,.15)",  color:N,           badge:"AHEAD"           };
      if (r >= .4)      return { icon:"⚔️", title:"DEAD HEAT",    text:`${p1w}–${draws}–${p2w}. Every match counts.`,  bg:"rgba(255,184,48,.06)",  bdr:"rgba(255,184,48,.22)", color:"#FFB830",   badge:"EVEN"            };
      if (r >= .25)     return { icon:"📉", title:"LOSING GROUND", text:`${p2Name} leads ${p2w}–${p1w}.`,               bg:"rgba(255,107,53,.06)",  bdr:"rgba(255,107,53,.22)", color:"#FF6B35",   badge:"BEHIND"          };
      return              { icon:"🚨", title:"NIGHTMARE",          text:`${p2Name} dominates ${p2w}–${p1w}.`,           bg:"rgba(255,51,85,.07)",   bdr:"rgba(255,51,85,.25)",  color:"#FF3355",   badge:"LOSING BADLY"    };
    }, [stats, p1Name, p2Name]);

    const C1 = "#AAFF00", C2 = "#FF3355";
    const total = stats?.total || 0;
    const yp = total ? Math.round((stats.p1w / total) * 100) : 50;
    const tp = 100 - yp;
    const canCompare = p1Name && p2Name && p1Name !== p2Name;

    const Selector = ({ label, value, onChange, exclude }) => (
      <div className="flex-1">
        <div style={{fontSize:9,fontWeight:800,letterSpacing:"1.5px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginBottom:6}}>{label}</div>
        <div className="relative">
          <select value={value} onChange={e => onChange(e.target.value)}
            className="w-full rounded-[14px] py-3 px-3 text-[12px] font-bold appearance-none"
            style={{background:"rgba(255,255,255,.06)",border:`1px solid ${label==="PLAYER 1"?C1+"50":C2+"50"}`,color:"#fff",
              fontFamily:"'DM Sans',sans-serif",outline:"none",cursor:"pointer",WebkitAppearance:"none",paddingRight:28}}>
            {allNames.filter(n => n !== exclude).map(n => (
              <option key={n} value={n} style={{background:"#111",color:"#fff"}}>{n}{n===mePlayer?.name?" (me)":""}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{color:label==="PLAYER 1"?C1:C2,fontSize:12}}>▾</div>
        </div>
      </div>
    );

    return (
      <div>
        {/* Dual player selectors */}
        <div className="flex gap-3 mb-5">
          <Selector label="PLAYER 1" value={p1Name} onChange={setP1Name} exclude={p2Name}/>
          <Selector label="PLAYER 2" value={p2Name} onChange={setP2Name} exclude={p1Name}/>
        </div>

        <AnimatePresence mode="wait">
          {canCompare ? (
            <motion.div key={`${p1Name}||${p2Name}`} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.22}}>

              {/* VS Header */}
              <div className="rounded-t-[22px] px-5 py-5"
                style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.09)",borderBottom:"none"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:0}}>
                  <div className="flex flex-col items-center">
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:"1px",fontWeight:800,
                      color:"#fff",textAlign:"center",wordBreak:"break-word",maxWidth:110,lineHeight:1.1}}>{p1Name}</div>
                  </div>
                  <div className="flex items-center justify-center" style={{padding:"0 12px"}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:"2px",color:"rgba(255,255,255,.2)",lineHeight:1}}>VS</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:"1px",fontWeight:800,
                      color:"#fff",textAlign:"center",wordBreak:"break-word",maxWidth:110,lineHeight:1.1}}>{p2Name}</div>
                  </div>
                </div>
              </div>

              {/* Score + bar */}
              <div className="rounded-b-[22px] px-5 py-4 mb-4"
                style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="text-center">
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"2px",lineHeight:1,color:C1}}>{stats?.p1w ?? 0}</div>
                    <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.28)",marginTop:3,fontFamily:"'DM Sans',sans-serif",letterSpacing:"1px"}}>
                      {(stats?.p1w??0)===1?"WIN":"WINS"}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:"rgba(255,255,255,.3)",lineHeight:1}}>{stats?.draws ?? 0}</div>
                    <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,.25)",fontFamily:"'DM Sans',sans-serif"}}>DRAWS</div>
                  </div>
                  <div className="text-center">
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"2px",lineHeight:1,color:C2}}>{stats?.p2w ?? 0}</div>
                    <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.28)",marginTop:3,fontFamily:"'DM Sans',sans-serif",letterSpacing:"1px"}}>
                      {(stats?.p2w??0)===1?"WIN":"WINS"}
                    </div>
                  </div>
                </div>
                <div className="flex rounded-[8px] overflow-hidden" style={{height:14,background:"rgba(255,255,255,.08)"}}>
                  <motion.div style={{background:"linear-gradient(90deg,#AAFF00,#7DC900)"}}
                    initial={{width:"0%"}} animate={{width:`${yp}%`}} transition={{duration:.7}}/>
                  <motion.div style={{background:"linear-gradient(90deg,#FF3355,#C0143C)"}}
                    initial={{width:"0%"}} animate={{width:`${tp}%`}} transition={{duration:.7,delay:.05}}/>
                </div>
                <div className="flex justify-between mt-2">
                  <span style={{fontSize:10,fontWeight:700,color:C1,fontFamily:"'DM Sans',sans-serif"}}>{total ? `${yp}%` : "—"}</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>{total} match{total!==1?"es":""}</span>
                  <span style={{fontSize:10,fontWeight:700,color:C2,fontFamily:"'DM Sans',sans-serif"}}>{total ? `${tp}%` : "—"}</span>
                </div>
                {total > 0 && (()=>{
                  const totalG = (stats?.p1gf??0)+(stats?.p2gf??0);
                  const gp1 = totalG ? Math.round((stats?.p1gf??0)/totalG*100) : 50;
                  const gp2 = 100-gp1;
                  return (
                    <div className="mt-5">
                      <div style={{fontSize:8,fontWeight:800,letterSpacing:"1.5px",color:"rgba(255,255,255,.28)",
                        fontFamily:"'DM Sans',sans-serif",textAlign:"center",marginBottom:10}}>AGGREGATE SCORE</div>
                      <div className="flex items-center justify-center gap-3 mb-3">
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"2px",lineHeight:1,color:C1}}>{stats?.p1gf??0}</div>
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:"1px",lineHeight:1,color:"rgba(255,255,255,.22)"}}>—</div>
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"2px",lineHeight:1,color:C2}}>{stats?.p2gf??0}</div>
                      </div>
                      <div className="flex rounded-[8px] overflow-hidden" style={{height:16,background:"rgba(255,255,255,.08)"}}>
                        {totalG > 0 ? (
                          <>
                            <motion.div style={{background:"linear-gradient(90deg,#AAFF00,#7DC900)"}}
                              initial={{width:"0%"}} animate={{width:`${gp1}%`}} transition={{duration:.7}}/>
                            <motion.div style={{background:"linear-gradient(90deg,#FF3355,#C0143C)"}}
                              initial={{width:"0%"}} animate={{width:`${gp2}%`}} transition={{duration:.7,delay:.05}}/>
                          </>
                        ) : (
                          <div style={{flex:1,background:"linear-gradient(90deg,#AAFF0022,#FF335522)"}}/>
                        )}
                      </div>
                      <div className="flex justify-between mt-2">
                        <span style={{fontSize:10,fontWeight:700,color:C1,fontFamily:"'DM Sans',sans-serif"}}>{stats?.p1gf??0} goals</span>
                        <span style={{fontSize:10,fontWeight:700,color:C2,fontFamily:"'DM Sans',sans-serif"}}>{stats?.p2gf??0} goals</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Verdict */}
              {vrd && (
                <div className="rounded-[18px] p-4 flex items-start gap-4 mb-4" style={{background:vrd.bg,border:`1px solid ${vrd.bdr}`}}>
                  <span style={{fontSize:28,flexShrink:0,marginTop:2}}>{vrd.icon}</span>
                  <div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:"1.5px",color:"#fff",marginBottom:4}}>{vrd.title}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.55)",lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>{vrd.text}</div>
                    {vrd.badge && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg mt-2"
                        style={{background:`${vrd.color}18`,border:`1px solid ${vrd.color}44`,fontSize:9,fontWeight:800,letterSpacing:"1px",color:vrd.color,fontFamily:"'DM Sans',sans-serif"}}>
                        ⚡ {vrd.badge}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stats chips */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { l:"WIN RATE", v:total?`${yp}%`:"—",                                                              c:yp>=50?C1:C2          },
                  { l:"MATCHES",  v:total,                                                                             c:"rgba(255,255,255,.7)" },
                  { l:"BALANCE",  v:(stats?.p1w||0)>(stats?.p2w||0)?`+${(stats?.p1w||0)-(stats?.p2w||0)}`:(stats?.p1w||0)<(stats?.p2w||0)?`-${(stats?.p2w||0)-(stats?.p1w||0)}`:"0", c:(stats?.p1w||0)>=(stats?.p2w||0)?C1:C2 },
                  { l:"DRAWS",    v:stats?.draws??0,                                                                   c:"#FFB830"             },
                ].map(s => (
                  <div key={s.l} className="text-center rounded-[12px] py-3 px-2" style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)"}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:"1px",lineHeight:1,color:s.c,marginBottom:4}}>{s.v}</div>
                    <div style={{fontSize:8,fontWeight:800,letterSpacing:"1.5px",color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="emp" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="flex flex-col items-center justify-center rounded-[20px] py-12 text-center"
              style={{background:"rgba(255,255,255,.03)",border:"1px dashed rgba(255,255,255,.1)"}}>
              <span style={{fontSize:32,marginBottom:12}}>⚔️</span>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:"2px",color:"rgba(255,255,255,.35)"}}>SELECT TWO PLAYERS</div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"rgba(255,255,255,.25)",marginTop:6}}>Choose Player 1 and Player 2 above</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="px-5 pt-5 pb-2">
      <div className="flex gap-2 mb-5">
        {[{id:"lb",lbl:"Leaderboard"},{id:"h2h",lbl:"Head-to-Head"}].map(t=>(
          <button key={t.id} onClick={()=>setSub(t.id)}
            className="flex-1 rounded-[14px] py-2.5 px-3 text-xs font-bold tracking-wide text-center transition-all"
            style={{background:sub===t.id?"rgba(170,255,0,.1)":"rgba(255,255,255,.04)",border:sub===t.id?"1px solid rgba(170,255,0,.35)":"1px solid rgba(255,255,255,.08)",color:sub===t.id?N:"rgba(255,255,255,.4)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
            {t.lbl}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {sub==="lb"?(
          <motion.div key="lb" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:.22}}><LbView/></motion.div>
        ):(
          <motion.div key="h2h" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:.22}}><H2HView/></motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── LEAGUE TAB ── */
function JoinCodeCard({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="rounded-[20px] p-4 mb-6" style={{background:`linear-gradient(135deg,rgba(170,255,0,.08),rgba(170,255,0,.03))`,border:`1.5px solid rgba(170,255,0,.3)`}}>
      <div style={{fontSize:10,fontWeight:800,letterSpacing:"2px",color:"rgba(255,255,255,.4)",fontFamily:"'DM Sans',sans-serif",marginBottom:10}}>SHARE THIS CODE TO INVITE PLAYERS</div>
      <div className="flex items-center justify-between gap-3">
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:34,fontWeight:700,letterSpacing:"8px",color:N,textShadow:"0 0 24px rgba(170,255,0,.5)"}}>{code}</div>
        <motion.button whileTap={{scale:.93}} onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-[12px] px-3 py-2"
          style={{background:copied?"rgba(170,255,0,.18)":"rgba(170,255,0,.1)",border:`1px solid rgba(170,255,0,.${copied?5:3})`,cursor:"pointer",transition:"all .2s"}}>
          <Copy size={14} style={{color:N}}/>
          <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:800,color:N}}>{copied?"Copied!":"Copy"}</span>
        </motion.button>
      </div>
      <div style={{fontSize:11,color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif",marginTop:8}}>Players enter this code in &quot;Join by Code&quot; to join your league</div>
    </div>
  );
}

function LeagueTab({players,feed=[],rules,onRulesUpdate,onResetSeason,onAddPlayer,onRemovePlayer,onJoinAsPlayer,leagueId,ownerId,user,onDeleteLeague,squadPhotoUrl=null,onSquadPhotoUpdate=null,joinCode=null,bracket=null,onGenerateDraw=null}) {
  const [editing,          setEditing]          = useState(false);
  const [draft,            setDraft]            = useState(rules);
  const [confirm,          setConfirm]          = useState(false);
  const [confirmDelete,    setConfirmDelete]    = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [lobbyOpen,        setLobbyOpen]        = useState(false);

  // Admin = strict match only — user must be the league owner.
  // No fallback: if ownerId is null this league pre-dates the owner_id column and
  // nobody gets elevated access until the DB is backfilled.
  const isAdmin = !!(user?.id && ownerId && user.id === ownerId);

  const squadFileRef = useRef(null);
  const [squadUploading, setSquadUploading] = useState(false);
  const handleSquadPhotoChange = useCallback(async e => {
    const file = e.target.files?.[0];
    if (!file || !leagueId) return;
    setSquadUploading(true);
    try {
      const path = `league-${leagueId}`;
      await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("leagues").update({ image_url: publicUrl }).eq("id", leagueId);
      onSquadPhotoUpdate?.(publicUrl);
    } catch { /* ignore */ }
    setSquadUploading(false);
    e.target.value = "";
  }, [leagueId, onSquadPhotoUpdate]);

  const handleShare = useCallback(async () => {
    const code = joinCode || leagueId;
    const url = `https://league-it-app.vercel.app/join/${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join my League-It league!", text: "You've been invited 🏆", url }); }
      catch { /* user cancelled */ }
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [joinCode, leagueId]);

  const TOOLS = [
    {Icon:Settings,  bg:`linear-gradient(135deg,${N},#7DC900)`,        bdr:"rgba(170,255,0,.22)",    lbl:"Edit Rules",       sub:"Modify format, scoring, season",  arr:N,         fn:()=>setEditing(true)},
    {Icon:UserPlus,  bg:"linear-gradient(135deg,#3B8EFF,#1a6be0)",     bdr:"rgba(59,142,255,.22)",   lbl:"Add Player",       sub:"Add a new member to the league",   arr:"#3B8EFF", fn:onAddPlayer},
    {Icon:UserMinus, bg:"linear-gradient(135deg,#FFB830,#E08A00)",     bdr:"rgba(255,184,48,.22)",   lbl:"Remove Players",   sub:"Remove a member this season",      arr:"#FFB830", fn:onRemovePlayer},
    {Icon:RotateCcw, bg:"linear-gradient(135deg,#FF3355,#C0143C)",     bdr:"rgba(255,51,85,.22)",    lbl:"Reset Season",     sub:"Clear all stats and start fresh",  arr:"#FF3355", fn:()=>setConfirm(true)},
  ];

  return (
    <div className="px-5 pt-5 pb-2">
      <ST>📸 Squad Photo</ST>
      <div className="rounded-[20px] mb-6 relative overflow-hidden transition-all"
        style={{background:"rgba(255,255,255,.03)",border:"2px dashed rgba(255,255,255,.12)",minHeight:130,cursor:isAdmin?"pointer":"default"}}
        onClick={()=>isAdmin&&squadFileRef.current?.click()}>
        <input ref={squadFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleSquadPhotoChange}/>
        {squadPhotoUrl ? (
          <>
            <img src={squadPhotoUrl} alt="Squad" style={{width:"100%",maxHeight:200,objectFit:"cover",display:"block"}}/>
            {isAdmin&&<div className="absolute bottom-0 inset-x-0 flex items-center justify-center py-2"
              style={{background:"rgba(0,0,0,.55)"}}>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.7)",letterSpacing:"1px"}}>
                {squadUploading?"UPLOADING...":"TAP TO CHANGE PHOTO"}
              </span>
            </div>}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3" style={{minHeight:130}}>
            <Camera size={28} style={{color:"rgba(255,255,255,.2)"}}/>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:"2px",color:"rgba(255,255,255,.25)"}}>
              {isAdmin?(squadUploading?"UPLOADING...":"ADD SQUAD PHOTO"):"NO SQUAD PHOTO YET"}
            </div>
          </div>
        )}
      </div>

      {/* Squad Roster — hidden for tournament leagues (bracket lives on Home tab) */}
      {!(rules?.tournamentFormat && rules.tournamentFormat !== "classic") && (
        <>
          <ST>👥 Squad Roster — Standings</ST>
          <StandingsTable players={players} feed={feed}/>
        </>
      )}

      <ST>📜 The Constitution</ST>
      <div className="rounded-[20px] p-4 mb-5" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(170,255,0,.15)"}}>
        {(editing && isAdmin)?(
          <div className="flex flex-col gap-3">
            {[{lbl:"Sport",k:"sport"},{lbl:"Format",k:"format"},{lbl:"Scoring",k:"scoring"}].map(f=>(
              <div key={f.k}>
                <p style={{fontSize:10,fontWeight:700,letterSpacing:"1px",color:"rgba(255,255,255,.4)",fontFamily:"'DM Sans',sans-serif",marginBottom:5}}>{f.lbl.toUpperCase()}</p>
                <input value={draft[f.k]} onChange={e=>setDraft(d=>({...d,[f.k]:e.target.value}))}
                  className="w-full rounded-[12px] px-3 py-2.5 text-sm outline-none"
                  style={{background:"rgba(255,255,255,.06)",border:`1px solid ${N}55`,color:"#fff",caretColor:N,fontFamily:"'DM Sans',sans-serif"}}/>
              </div>
            ))}
            <div className="flex gap-2 mt-1">
              <button onClick={()=>{onRulesUpdate(draft);setEditing(false);}}
                className="flex-1 rounded-[14px] py-3 font-bold text-sm"
                style={{background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Save Rules</button>
              <button onClick={()=>{setEditing(false);setDraft(rules);}}
                className="rounded-[14px] py-3 px-4 font-bold text-sm"
                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.6)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
            </div>
          </div>
        ):(
          [
            [rules.sportEmoji || "🏸","Sport",      rules.sport   || "Standard Rules"],
            ["🎯","Format",     rules.format  || "Standard Rules"],
            ["📋","Scoring",    rules.scoring || "Standard Rules"],
            ["🏆","Season",     `Season ${rules.seasonYear || new Date().getFullYear()}`],
          ].map(([ic,lb,vl])=>(
            <div key={lb} className="flex items-start gap-3 mb-4">
              <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{ic}</span>
              <div>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:"1px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginBottom:2}}>{lb.toUpperCase()}</div>
                <div style={{fontSize:13,fontWeight:600,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>{vl}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Invite Friends */}
      <ST>🔗 Invite Friends</ST>
      <motion.button whileHover={{scale:1.015,y:-2}} whileTap={{scale:.97}}
        onClick={handleShare}
        className="flex items-center gap-3 rounded-[18px] px-4 py-4 w-full mb-6 text-left"
        style={{background:"rgba(170,255,0,.05)",border:`1px solid rgba(170,255,0,.3)`,cursor:"pointer"}}>
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
          style={{background:`linear-gradient(135deg,${N},#7DC900)`}}>
          <MessageCircle size={18} color="#000"/>
        </div>
        <div className="flex-1">
          <div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>
            {copied ? "Link Copied! 🎉" : "Invite Friends"}
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'DM Sans',sans-serif"}}>
            Share the join link via any app
          </div>
        </div>
        <ChevronRight size={16} style={{color:N,flexShrink:0}}/>
      </motion.button>

      {/* Join Code — admin only (they own the code and control who gets it) */}
      {isAdmin && joinCode && (
        <>
          <ST>🔑 League Join Code</ST>
          <JoinCodeCard code={joinCode} />
          {/* Lobby button — big Kahoot-style panel */}
          <motion.button whileHover={{ scale:1.015,y:-2 }} whileTap={{ scale:.97 }}
            onClick={() => setLobbyOpen(true)}
            className="flex items-center gap-3 rounded-[18px] px-4 py-4 w-full mb-6 text-left"
            style={{ background:`linear-gradient(135deg,rgba(170,255,0,.1),rgba(170,255,0,.04))`,
              border:`1.5px solid rgba(170,255,0,.4)`,cursor:"pointer",
              boxShadow:"0 0 32px rgba(170,255,0,.1)" }}>
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background:`linear-gradient(135deg,${N},#7DC900)` }}>
              <Hash size={18} color="#000"/>
            </div>
            <div className="flex-1">
              <div style={{ fontSize:13,fontWeight:800,color:N,fontFamily:"'DM Sans',sans-serif" }}>
                Open Lobby
              </div>
              <div style={{ fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'DM Sans',sans-serif" }}>
                PIN display · QR code · Live player list
              </div>
            </div>
            <ChevronRight size={16} style={{ color:N,flexShrink:0 }}/>
          </motion.button>
        </>
      )}

      {/* Lobby overlay */}
      <AnimatePresence>
        {lobbyOpen && (
          <motion.div key="lobby" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            transition={{ duration:.15 }}>
            <LobbyScreen
              leagueId={leagueId}
              joinCode={joinCode}
              leagueName={rules?.sport ? `${rules.sport} League` : "League"}
              user={user}
              ownerId={ownerId}
              onClose={() => setLobbyOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join as Player — shown to admin if they're not yet in the standings */}
      {isAdmin && !players.some(p => p.isMe) && (
        <div className="rounded-[18px] px-4 py-4 mb-5 flex items-center gap-3"
          style={{background:"rgba(170,255,0,.05)",border:"1.5px dashed rgba(170,255,0,.35)"}}>
          <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
            style={{background:"rgba(170,255,0,.12)",border:"1px solid rgba(170,255,0,.3)"}}>
            <UserPlus size={18} color={N}/>
          </div>
          <div className="flex-1">
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:800,color:N,lineHeight:1}}>
              You&apos;re not in the standings yet
            </div>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"rgba(255,255,255,.38)",marginTop:3}}>
              Admins must opt in to play
            </div>
          </div>
          <button onClick={onJoinAsPlayer}
            className="rounded-[12px] px-3 py-2 text-xs font-black flex-shrink-0"
            style={{background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",
              fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.3px",cursor:"pointer",border:"none"}}>
            Join as Player
          </button>
        </div>
      )}

      {/* Generate Draw — admin + tournament only + no bracket yet */}
      {isAdmin && rules?.tournamentFormat && rules.tournamentFormat !== "classic" && !bracket && onGenerateDraw && (
        <div style={{ marginBottom: 24 }}>
          <ST>🎲 Tournament Draw</ST>
          <motion.button
            whileHover={{ scale: 1.015, y: -2 }} whileTap={{ scale: 0.97 }}
            onClick={onGenerateDraw}
            style={{
              width: "100%", borderRadius: 20, padding: "20px 20px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 16, textAlign: "left",
              background: `linear-gradient(135deg,${N}12,rgba(170,255,0,0.04))`,
              border: `1.5px solid ${N}44`,
              boxShadow: `0 0 40px ${N}12`,
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 16, flexShrink: 0,
              background: `linear-gradient(135deg,${N},#7DC900)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Trophy size={22} color="#000"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 800, color: N, lineHeight: 1, marginBottom: 4 }}>
                Generate Tournament Draw
              </div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.38)" }}>
                {(rules.participants || []).length} participants registered
                {rules.participants?.some(p => p.tier) ? " · Seeded draw" : " · Random draw"}
              </div>
            </div>
            <ChevronRight size={18} style={{ color: N, flexShrink: 0 }}/>
          </motion.button>
        </div>
      )}

      {/* Bracket already generated — info card */}
      {isAdmin && bracket && rules?.tournamentFormat && rules.tournamentFormat !== "classic" && (
        <div style={{ marginBottom: 24 }}>
          <ST>🏆 Tournament Status</ST>
          <div style={{
            borderRadius: 18, padding: "14px 16px",
            background: "rgba(170,255,0,.04)", border: `1px solid ${N}22`,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: N, flexShrink: 0, boxShadow: `0 0 8px ${N}` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: N }}>Draw is Live</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 2 }}>
                {bracket.rounds[0]?.filter(m => !m.isBye).length || 0} R1 matches · Go to Bracket tab to log results
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Tools — strictly admin only */}
      {isAdmin && (
        <>
          <ST>⚙️ Admin Tools</ST>
          <div className="flex flex-col gap-3 mb-6">
            {TOOLS.map(({Icon,bg,bdr,lbl,sub,arr,fn})=>(
              <button key={lbl} onClick={fn}
                className="flex items-center gap-3 rounded-[18px] px-4 py-4 hover:brightness-110 transition-all text-left"
                style={{background:"rgba(255,255,255,.03)",border:`1px solid ${bdr}`,cursor:"pointer"}}>
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0" style={{background:bg}}>
                  <Icon size={18} color={lbl==="Edit Rules"?"#000":"#fff"}/>
                </div>
                <div className="flex-1">
                  <div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>{lbl}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'DM Sans',sans-serif"}}>{sub}</div>
                </div>
                <ChevronRight size={16} style={{color:arr,flexShrink:0}}/>
              </button>
            ))}

            {/* Delete League */}
            <button onClick={()=>setConfirmDelete(true)}
              className="flex items-center gap-3 rounded-[18px] px-4 py-4 hover:brightness-110 transition-all text-left"
              style={{background:"rgba(255,51,85,.04)",border:"1px solid rgba(255,51,85,.3)",cursor:"pointer"}}>
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                style={{background:"linear-gradient(135deg,#FF3355,#C0143C)"}}>
                <X size={18} color="#fff"/>
              </div>
              <div className="flex-1">
                <div style={{fontSize:13,fontWeight:800,color:"#FF3355",fontFamily:"'DM Sans',sans-serif"}}>Delete League</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'DM Sans',sans-serif"}}>Permanently remove this league</div>
              </div>
              <ChevronRight size={16} style={{color:"#FF3355",flexShrink:0}}/>
            </button>
          </div>
        </>
      )}

      <AnimatePresence>
        {confirm&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{background:"rgba(0,0,0,.82)",backdropFilter:"blur(12px)"}}
            onClick={e=>{if(e.target===e.currentTarget)setConfirm(false);}}>
            <motion.div initial={{scale:.88,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.88,opacity:0}}
              transition={{type:"spring",stiffness:360,damping:28}}
              className="w-full rounded-[24px] p-6" style={{maxWidth:340,background:"#131820",border:"1.5px solid rgba(255,51,85,.35)"}}>
              <div className="text-4xl text-center mb-4">⚠️</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:"2px",color:"#fff",textAlign:"center",marginBottom:8}}>Reset Season?</div>
              <p style={{fontSize:13,color:"rgba(255,255,255,.45)",lineHeight:1.65,textAlign:"center",fontFamily:"'DM Sans',sans-serif",marginBottom:20}}>All wins, losses, and streaks will be cleared. Cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={()=>setConfirm(false)} className="flex-1 rounded-[16px] py-3.5 font-bold text-sm"
                  style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.65)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
                <button onClick={()=>{onResetSeason();setConfirm(false);}} className="flex-1 rounded-[16px] py-3.5 font-bold text-sm"
                  style={{background:"linear-gradient(135deg,#FF3355,#C0143C)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Reset Now</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {confirmDelete&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{background:"rgba(0,0,0,.88)",backdropFilter:"blur(14px)"}}
            onClick={e=>{if(e.target===e.currentTarget)setConfirmDelete(false);}}>
            <motion.div initial={{scale:.88,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.88,opacity:0}}
              transition={{type:"spring",stiffness:360,damping:28}}
              className="w-full rounded-[24px] p-6" style={{maxWidth:340,background:"#131820",border:"1.5px solid rgba(255,51,85,.5)"}}>
              <div className="text-4xl text-center mb-4">🗑️</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:"2px",color:"#FF3355",textAlign:"center",marginBottom:8}}>Delete League?</div>
              <p style={{fontSize:13,color:"rgba(255,255,255,.45)",lineHeight:1.65,textAlign:"center",fontFamily:"'DM Sans',sans-serif",marginBottom:20}}>
                This will permanently delete the league, all players, and all match history. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={()=>setConfirmDelete(false)} className="flex-1 rounded-[16px] py-3.5 font-bold text-sm"
                  style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.65)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
                <button onClick={()=>{onDeleteLeague?.();setConfirmDelete(false);}} className="flex-1 rounded-[16px] py-3.5 font-bold text-sm"
                  style={{background:"linear-gradient(135deg,#FF3355,#C0143C)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Delete Forever</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── PROFILE TAB ── */
const XP_LEVELS = [
  {level:1,min:0,    max:499,   label:"Rookie"},
  {level:2,min:500,  max:1199,  label:"Contender"},
  {level:3,min:1200, max:2499,  label:"Competitor"},
  {level:4,min:2500, max:4499,  label:"Veteran"},
  {level:5,min:4500, max:7499,  label:"Elite"},
  {level:6,min:7500, max:11999, label:"Champion"},
  {level:7,min:12000,max:Infinity,label:"Legend"},
];
function calcLevel(xp) {
  const cur = [...XP_LEVELS].reverse().find(l=>xp>=l.min) || XP_LEVELS[0];
  const next = XP_LEVELS.find(l=>l.level===cur.level+1) || null;
  const pct  = next ? Math.min(100,Math.round((xp-cur.min)/(next.min-cur.min)*100)) : 100;
  return {cur, next, pct};
}
function calcOVR(wins,losses,totalPlayed,clutchWins,comebacks,winRate) {
  if (totalPlayed===0) return 0;
  const winComp    = (winRate/100)*50;
  const expComp    = Math.min(totalPlayed,60)/60*25;
  const clutchComp = Math.min((clutchWins||0)+(comebacks||0),15)/15*24;
  return Math.min(99, Math.max(1, Math.round(winComp+expComp+clutchComp)));
}
function styleTitle(wins,comebacks,winRate,totalPlayed) {
  const cbRate = wins>0?(comebacks||0)/wins:0;
  if (cbRate>0.2)     return {title:"The Comeback King", icon:"👑", color:"#FFB830"};
  if (winRate>=80)    return {title:"The Dominator",     icon:"💀", color:"#FF3355"};
  if (totalPlayed>=50)return {title:"The Veteran",       icon:"🎖️", color:"#3B8EFF"};
  if (wins>=10)       return {title:"The Contender",     icon:"⚔️", color:N};
  return               {title:"The Challenger",          icon:"🔰", color:"rgba(255,255,255,.5)"};
}

function ProfileTab({players,feed,user=null,profile=null,onProfileUpdate=null,onAvatarUpdate=null}) {
  const enriched  = useMemo(()=>enrichPlayers(players,feed),[players,feed]);
  const me        = players.find(p=>p.isMe);
  const meE       = enriched.find(p=>p.isMe);
  const displayName = profile?.display_name || user?.user_metadata?.full_name || me?.name || "Player";
  const wr        = pct(me?.wins ?? 0, me?.losses ?? 0);
  const [editName, setEditName] = useState(false);
  const [draftName,setDraftName] = useState(displayName);
  const rows      = useMemo(()=>byWins(players),[players]);
  const myMatches = useMemo(()=>feed.filter(m=>(m.winnerIds||[]).includes(me?.id)||(m.loserIds||[]).includes(me?.id)),[feed,me?.id]);

  // ── Gamification ──────────────────────────────────────────────────────────
  const totalXP = useMemo(()=>myMatches.reduce((acc,m)=>{
    const isWin=(m.winnerIds||[]).includes(me?.id);
    return acc+(isWin?100:25)+(isWin&&m.isComeback?75:0);
  },0),[myMatches,me?.id]);
  const lvlData   = useMemo(()=>calcLevel(totalXP),[totalXP]);
  const ovr       = useMemo(()=>calcOVR(me?.wins??0,me?.losses??0,me?.totalPlayed??0,me?.clutchWins??0,me?.comebacks??0,wr),[me,wr]);
  const dnaTitle  = useMemo(()=>styleTitle(me?.wins??0,me?.comebacks??0,wr,me?.totalPlayed??0),[me,wr]);

  const [ready, setReady] = useState(true);
  const [quote, setQuote] = useState("I came for trophies, not prisoners.");
  const [editQ, setEditQ] = useState(false);
  const [draftQ,setDraftQ]= useState(quote);

  const avatarFileRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const handleAvatarChange = useCallback(async e => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setAvatarUploading(true);
    try {
      const path = `profile-${user.id}`;
      await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
      onAvatarUpdate?.(publicUrl);
    } catch { /* ignore */ }
    setAvatarUploading(false);
    e.target.value = "";
  }, [user, onAvatarUpdate]);

  const skills = useMemo(()=>[
    {l:"Clutch",      v:Math.min(99,Math.round(50+wr/2+((me?.streak??0)>0?(me?.streak??0)*3:0))),c:N},
    {l:"Power",       v:Math.min(99,Math.round(40+(meE?.gamesWon??0)*.8)),                  c:"#3B8EFF"},
    {l:"Reliability", v:Math.min(99,Math.round((me?.totalPlayed??0)/14*85+10)),             c:"#FFB830"},
    {l:"Stamina",     v:Math.min(99,Math.round(45+(me?.totalPlayed??0)*2.5)),               c:"#AA55FF"},
  ].map(s=>({...s,v:Math.round(s.v)})),[me,meE,wr]);

  // Trophies
  const mvpPlayer  = useMemo(()=>[...players].sort((a,b)=>b.wins-a.wins)[0],[players]);
  const mgChampion = useMemo(()=>[...enriched].sort((a,b)=>b.gamesWon-a.gamesWon)[0],[enriched]);
  const clutchLeader = useMemo(()=>[...players].sort((a,b)=>(b.clutchWins||0)-(a.clutchWins||0))[0],[players]);
  const streakLeader = useMemo(()=>[...players].sort((a,b)=>(b.bestStreak||0)-(a.bestStreak||0))[0],[players]);

  // Admin who hasn't joined as a player — show nothing (caller renders AdminDashboard instead)
  if (!me) return (
    <div style={{padding:"60px 20px",textAlign:"center",fontFamily:"'DM Sans',sans-serif",color:"rgba(255,255,255,.35)",fontSize:13}}>
      <div style={{fontSize:36,marginBottom:12}}>👤</div>
      <div style={{fontWeight:700,marginBottom:6}}>No player profile yet</div>
      <div style={{fontSize:11}}>Head to the League tab and tap &quot;Join as Player&quot; to create yours.</div>
    </div>
  );

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;
  const myRank    = rows.findIndex(p=>p.isMe)+1;
  const isMVP      = mvpPlayer.id===me.id;
  const isMGChamp  = mgChampion.id===me.id;
  const isClutchLeader = clutchLeader.id===me.id;
  const isStreakLeader = streakLeader.id===me.id;
  const rankLabel  = myRank===1?"🥇":myRank===2?"🥈":myRank===3?"🥉":`#${myRank}`;
  const sg = i=>({initial:{opacity:0,y:18},animate:{opacity:1,y:0},transition:{delay:.08+i*.07,type:"spring",stiffness:260,damping:22}});

  const badges = [
    {i:"🔥",l:"Win Streak",   s:"5 in a row",          earned:me.streak>=5,                        bc:"rgba(170,255,0,.15)", bb:"rgba(170,255,0,.35)"},
    {i:"👑",l:"Comeback King",s:"CB > 20% of wins",     earned:(me.wins>0&&(me.comebacks||0)/me.wins>0.2),bc:"rgba(255,184,48,.12)",bb:"rgba(255,184,48,.35)"},
    {i:"💀",l:"The Dominator",s:"Win rate ≥ 80%",       earned:wr>=80,                              bc:"rgba(255,51,85,.12)", bb:"rgba(255,51,85,.35)"},
    {i:"📈",l:"Serial Winner",s:"10+ wins",             earned:me.wins>=10,                         bc:"rgba(59,142,255,.12)",bb:"rgba(59,142,255,.35)"},
    {i:"🎖️",l:"The Veteran",  s:"50+ matches",         earned:me.totalPlayed>=50,                  bc:"rgba(170,85,255,.12)",bb:"rgba(170,85,255,.35)"},
    {i:"🛡️",l:"Iron Wall",   s:"Lost < 20 mini-games", earned:meE.gamesLost<20,                    bc:"rgba(0,229,204,.12)", bb:"rgba(0,229,204,.35)"},
  ];

  return (
    <div className="pb-4">
      <div className="relative overflow-hidden" style={{background:"linear-gradient(180deg,rgba(170,255,0,.06) 0%,transparent 100%)",borderBottom:"1px solid rgba(255,255,255,.07)",paddingBottom:24}}>
        {/* Status toggle */}
        <motion.div {...sg(0)} className="flex items-center justify-between px-5 pt-5 pb-4">
          <div>
            <div style={{fontSize:10,fontWeight:800,letterSpacing:"2px",color:"rgba(255,255,255,.4)",fontFamily:"'DM Sans',sans-serif",marginBottom:4}}>STATUS</div>
            <div style={{fontSize:14,fontWeight:800,color:ready?N:"rgba(255,255,255,.5)",fontFamily:"'DM Sans',sans-serif"}}>{ready?"✅ Ready to Play":"😴 Resting"}</div>
          </div>
          <motion.button onClick={()=>setReady(v=>!v)}
            animate={{background:ready?"rgba(170,255,0,.2)":"rgba(255,255,255,.08)"}}
            className="w-14 h-7 rounded-full relative"
            style={{border:ready?`1.5px solid ${N}`:"1px solid rgba(255,255,255,.15)",flexShrink:0}}>
            <motion.div className="absolute top-0.5 w-6 h-6 rounded-full"
              animate={{left:ready?"calc(100% - 26px)":"3px",background:ready?N:"rgba(255,255,255,.35)"}}
              transition={{type:"spring",stiffness:500,damping:28}}/>
            {ready&&<motion.div className="absolute inset-0 rounded-full pointer-events-none"
              animate={{boxShadow:["0 0 0 0 rgba(170,255,0,.5)","0 0 0 8px rgba(170,255,0,0)"]}}
              transition={{duration:1.8,repeat:Infinity}}/>}
          </motion.button>
        </motion.div>
        {/* Avatar — tap to upload */}
        <motion.div {...sg(1)} className="flex justify-center mb-5">
          <div className="relative cursor-pointer" onClick={()=>avatarFileRef.current?.click()}>
            <input ref={avatarFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleAvatarChange}/>
            <motion.div
              animate={ready?{boxShadow:["0 0 0 0 rgba(170,255,0,.4)","0 0 0 16px rgba(170,255,0,0)","0 0 0 0 rgba(170,255,0,0)"]}:{}}
              transition={{duration:2.5,repeat:Infinity}}
              className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center font-black"
              style={avatarUrl
                ? {border:`3px solid ${N}55`}
                : {background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",fontFamily:"'Bebas Neue',sans-serif",fontSize:30,letterSpacing:"2px"}}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : me.initials
              }
            </motion.div>
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{background:`linear-gradient(135deg,${N},#7DC900)`,border:"2px solid #0A0A0A"}}>
              {avatarUploading
                ? <div style={{width:10,height:10,borderRadius:"50%",border:"2px solid #000",borderTopColor:"transparent",animation:"spin 0.7s linear infinite"}}/>
                : <Camera size={12} color="#000"/>
              }
            </div>
          </div>
        </motion.div>
        {/* Name + stats */}
        <motion.div {...sg(2)} className="text-center px-5 mb-4">
          {editName?(
            <div className="flex items-center justify-center gap-2 mb-2">
              <input autoFocus value={draftName} onChange={e=>setDraftName(e.target.value)} maxLength={32}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&draftName.trim()){onProfileUpdate?.(draftName.trim());setEditName(false);}
                  if(e.key==="Escape")setEditName(false);
                }}
                className="rounded-[12px] px-3 py-2 text-center outline-none"
                style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:"2px",background:"rgba(255,255,255,.06)",border:`1.5px solid ${N}66`,color:"#fff",caretColor:N,width:"100%",maxWidth:220}}/>
              <button onClick={()=>{if(draftName.trim()){onProfileUpdate?.(draftName.trim());setEditName(false);}}}
                className="rounded-[12px] px-3 py-2 font-bold text-xs flex-shrink-0"
                style={{background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Save</button>
            </div>
          ):(
            <div className="flex items-center justify-center gap-2 mb-2 cursor-pointer" onClick={()=>{setDraftName(displayName);setEditName(true);}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36,letterSpacing:"3px",color:"#fff",lineHeight:1}}>{displayName}</div>
              <Edit2 size={14} style={{color:"rgba(255,255,255,.3)",flexShrink:0,marginTop:4}}/>
            </div>
          )}
          {user?.email&&<div style={{fontSize:11,color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif",marginBottom:4}}>{user.email}</div>}
          {/* OVR + Level + Rank row */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {/* OVR — the big number */}
            <div className="flex flex-col items-center justify-center rounded-[14px] px-4 py-2.5"
              style={{background:`linear-gradient(135deg,${N}22,${N}0A)`,border:`1px solid ${N}55`,minWidth:64}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,letterSpacing:"2px",color:N,lineHeight:1}}>{ovr}</div>
              <div style={{fontSize:8,fontWeight:900,letterSpacing:"2px",color:`${N}99`,fontFamily:"'DM Sans',sans-serif",marginTop:1}}>OVR</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.6)",fontFamily:"'DM Sans',sans-serif"}}>{rankLabel} Ranked</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                style={{background:"rgba(170,255,0,.08)",border:`1px solid ${N}33`,color:N,fontFamily:"'DM Sans',sans-serif"}}>LVL {lvlData.cur.level} · {lvlData.cur.label}</span>
            </div>
          </div>
          <div className="flex justify-center gap-5 mb-3">
            {[{v:`${me.wins}W`,l:"WINS",c:N},{v:`${me.losses}L`,l:"LOSSES",c:"#FF3355"},{v:`${wr}%`,l:"WIN RATE",c:"#FFB830"},{v:`${totalXP.toLocaleString()}`,l:"TOTAL XP",c:"#AA55FF"}].map(s=>(
              <div key={s.l} className="text-center">
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:"1px",color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:8,fontWeight:700,letterSpacing:"1px",color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
          {/* XP progress bar */}
          <div className="mx-5">
            <div className="flex justify-between mb-1">
              <span style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",letterSpacing:"1px"}}>XP PROGRESS</span>
              <span style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>
                {lvlData.next ? `${(lvlData.next.min-totalXP).toLocaleString()} XP to LVL ${lvlData.next.level}` : "MAX LEVEL"}
              </span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{height:6,background:"rgba(255,255,255,.08)"}}>
              <motion.div initial={{width:0}} animate={{width:`${lvlData.pct}%`}} transition={{duration:1,ease:"easeOut",delay:.3}}
                style={{height:"100%",borderRadius:9999,background:`linear-gradient(90deg,${N},#7DC900)`}}/>
            </div>
          </div>
        </motion.div>
        {/* Quote */}
        <motion.div {...sg(3)} className="mx-5">
          {editQ?(
            <div className="flex gap-2">
              <input value={draftQ} onChange={e=>setDraftQ(e.target.value)} autoFocus
                className="flex-1 rounded-[12px] px-3 py-2.5 text-sm outline-none"
                style={{background:"rgba(255,255,255,.06)",border:`1.5px solid ${N}66`,color:"#fff",caretColor:N,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}/>
              <button onClick={()=>{setQuote(draftQ);setEditQ(false);}}
                className="rounded-[12px] px-4 py-2.5 font-bold text-xs"
                style={{background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Save</button>
            </div>
          ):(
            <div className="flex items-center gap-2 rounded-[14px] px-4 py-3 cursor-pointer"
              style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"}}
              onClick={()=>{setDraftQ(quote);setEditQ(true);}}>
              <span style={{fontSize:16,flexShrink:0}}>💬</span>
              <span className="flex-1 text-sm italic" style={{color:"rgba(255,255,255,.6)",fontFamily:"'DM Sans',sans-serif"}}>&quot;{quote}&quot;</span>
              <Edit2 size={13} style={{color:"rgba(255,255,255,.3)",flexShrink:0}}/>
            </div>
          )}
        </motion.div>
      </div>

      <div className="px-5 pt-5">
        {/* DNA */}
        <motion.div {...sg(4)}>
          <ST>🧬 Player DNA</ST>
          <div className="rounded-[20px] p-4 mb-6" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
            {/* Style Title */}
            <div className="flex items-center gap-3 rounded-[14px] px-4 py-3 mb-5"
              style={{background:"rgba(255,255,255,.04)",border:`1px solid ${dnaTitle.color}44`}}>
              <span style={{fontSize:22,flexShrink:0}}>{dnaTitle.icon}</span>
              <div>
                <div style={{fontSize:9,fontWeight:800,letterSpacing:"2px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginBottom:2}}>PLAYER STYLE</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:"1.5px",color:dnaTitle.color,lineHeight:1}}>{dnaTitle.title}</div>
              </div>
            </div>
            {skills.map(s=>(
              <div key={s.l} className="mb-4">
                <div className="flex justify-between mb-2">
                  <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)",fontFamily:"'DM Sans',sans-serif"}}>{s.l}</span>
                  <span style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:s.c}}>{s.v}</span>
                </div>
                <AnimBar value={s.v} color={s.c}/>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Trophy Room — MVP of Day + Mini-Game Champion */}
        <motion.div {...sg(5)}>
          <ST>🏆 Trophy Room</ST>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              {icon:"🥇",t:"MVP OF THE DAY",     holder:mvpPlayer.name,    stat:`${mvpPlayer.wins} wins`,          bg:"rgba(255,215,0,.06)",  bdr:"rgba(255,215,0,.2)",  tc:"rgba(255,215,0,.8)",  mine:isMVP,          mc:N},
              {icon:"🎮",t:"MINI-GAME CHAMP",   holder:mgChampion.name,   stat:`${mgChampion.gamesWon} MG`,       bg:"rgba(59,142,255,.06)", bdr:"rgba(59,142,255,.2)", tc:"rgba(59,142,255,.8)", mine:isMGChamp,      mc:"#3B8EFF"},
              {icon:"⚡",t:"CLUTCH PLAYER",     holder:clutchLeader.name, stat:`${clutchLeader.clutchWins||0} clutch wins`, bg:"rgba(59,142,255,.06)", bdr:"rgba(59,142,255,.2)", tc:"rgba(59,142,255,.8)", mine:isClutchLeader, mc:"#3B8EFF"},
              {icon:"🔥",t:"SUPER STREAK",      holder:streakLeader.name, stat:`${streakLeader.bestStreak||0} win streak`,  bg:"rgba(170,255,0,.06)",  bdr:"rgba(170,255,0,.2)",  tc:"rgba(170,255,0,.8)",  mine:isStreakLeader,  mc:N},
            ].map(({icon,t,holder,stat,bg,bdr,tc,mine,mc})=>(
              <motion.div key={t} whileHover={{scale:1.04,y:-3}} whileTap={{scale:.97}}
                className="rounded-[18px] py-4 px-3 text-center cursor-pointer"
                style={{background:bg,border:`1px solid ${bdr}`,opacity:mine?1:.5}}>
                <div style={{fontSize:28,marginBottom:6}}>{icon}</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:10,letterSpacing:"1px",color:tc,marginBottom:2}}>{t}</div>
                <div style={{fontSize:11,fontWeight:700,color:"#fff",marginBottom:2}}>{holder}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.35)"}}>{stat}</div>
                {mine&&<div style={{fontSize:9,fontWeight:800,color:mc,marginTop:4}}>✓ YOURS</div>}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Badges */}
        <motion.div {...sg(6)}>
          <ST>🎖️ Badge Collection</ST>
          <div className="grid grid-cols-3 gap-2.5 mb-6">
            {badges.map((b,i)=>(
              <motion.div key={i} whileHover={b.earned?{scale:1.04,y:-2}:{}} whileTap={b.earned?{scale:.97}:{}}
                className="rounded-[18px] py-4 px-3 text-center"
                style={{background:b.bc,border:`1px solid ${b.bb}`,opacity:b.earned?1:.45}}>
                <div style={{fontSize:24,marginBottom:6,filter:b.earned?"none":"grayscale(100%)"}}>{b.i}</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:11,letterSpacing:".5px",color:b.earned?"#fff":"rgba(255,255,255,.4)",marginBottom:2}}>{b.l}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.3)",lineHeight:1.4}}>{b.s}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Full match history — every match involving me from global feed */}
        <motion.div {...sg(7)}>
          <ST>📋 My Match History <span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.35)",letterSpacing:0}}>({myMatches.length})</span></ST>
          {myMatches.length===0?(
            <div className="rounded-[20px] py-10 text-center" style={{background:"rgba(255,255,255,.03)",border:"1px dashed rgba(255,255,255,.1)"}}>
              <div style={{fontSize:24,marginBottom:8}}>🏸</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:"2px",color:"rgba(255,255,255,.3)"}}>NO MATCHES YET</div>
            </div>
          ):(
            <div className="flex flex-col gap-3 pb-4">
              {myMatches.map((m,i)=>{
                const isWin=(m.winnerIds||[]).includes(me.id);
                const totalMG=(m.sets||[]).reduce((a,s)=>{const{w,l}=parseMG(s);return a+w+l;},0);
                return (
                  <motion.div key={m.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.08+i*.05}}
                    className="rounded-[18px] overflow-hidden"
                    style={{background:"rgba(255,255,255,.03)",border:`1px solid ${isWin?"rgba(170,255,0,.2)":"rgba(255,51,85,.2)"}`}}>
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="flex items-center justify-center rounded-[10px] font-black text-xs flex-shrink-0"
                        style={{width:44,height:36,background:isWin?"rgba(170,255,0,.15)":"rgba(255,51,85,.15)",border:`1.5px solid ${isWin?"rgba(170,255,0,.45)":"rgba(255,51,85,.45)"}`,color:isWin?N:"#FF3355",fontFamily:"'DM Sans',sans-serif",letterSpacing:".5px"}}>
                        {isWin?"WIN":"LOSS"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-1 flex-wrap">
                          <span style={{fontSize:13,fontWeight:700,color:isWin?N:"rgba(255,255,255,.7)",fontFamily:"'DM Sans',sans-serif"}}>{m.winner}</span>
                          <span style={{fontSize:11,color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>def.</span>
                          <span style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.42)",fontFamily:"'DM Sans',sans-serif"}}>{m.loser}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(m.sets||[]).map((s,si)=>(
                            <span key={si} className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                              style={{fontFamily:"'JetBrains Mono',monospace",background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.5)"}}>{s}</span>
                          ))}
                          <span style={{fontSize:9,color:"rgba(255,255,255,.22)",fontWeight:600}}>{totalMG} MG</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:2}}>{m.dateStr}</div>
                        {isWin&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:N,fontWeight:700}}>+{m.xp}XP</div>}
                        <div style={{fontSize:11}}>{m.sport}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TOURNAMENT BRACKET VISUAL
// ─────────────────────────────────────────────
const SLOT_H      = 80;  // vertical space per r1 match
const MATCH_H     = 62;  // actual card height

function TournamentBracket({ bracket, onMatchTap = null, isAdmin = false, matchLegs = 1 }) {
  if (!bracket?.rounds?.length) return null;
  const { rounds } = bracket;
  const r1Count    = rounds[0].length;
  const totalH     = r1Count * SLOT_H;
  const ROUND_W    = 155;
  const ROUND_GAP  = 20;

  const roundLabel = (ri) => {
    const n = rounds.length;
    const fromEnd = n - 1 - ri; // 0 = final, 1 = semis, 2 = quarters
    if (fromEnd === 0) return "Final";
    if (fromEnd === 1) return "Semi-Finals";
    if (fromEnd === 2) return "Quarter-Finals";
    const playersAtRound = rounds[ri].length * 2;
    return `Round of ${playersAtRound}`;
  };

  const matchTop = (roundIdx, matchIdx) =>
    (matchIdx + 0.5) * Math.pow(2, roundIdx) * SLOT_H - MATCH_H / 2;

  return (
    <div style={{ overflowX: "auto", overflowY: "visible", WebkitOverflowScrolling: "touch", paddingBottom: 8 }}>
      <div style={{
        display: "flex", gap: ROUND_GAP, padding: "0 20px 0",
        minWidth: rounds.length * (ROUND_W + ROUND_GAP) + 40,
      }}>
        {rounds.map((round, ri) => (
          <div key={ri} style={{ flex: `0 0 ${ROUND_W}px` }}>
            {/* Round label */}
            <div style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
              letterSpacing: "1.5px", color: `${N}55`, textAlign: "center",
              marginBottom: 10,
            }}>{roundLabel(ri)}</div>

            {/* Match cards — absolutely positioned for alignment */}
            <div style={{ position: "relative", height: totalH }}>
              {round.map((match, mi) => {
                const top = matchTop(ri, mi);
                const bothSet   = match.p1 && match.p2;
                const hasWinner = !!match.winner;
                // For 2-leg: also tappable when leg1 done but leg2 not yet
                const leg1Done  = matchLegs === 2 && match.leg1 && !match.leg2;
                const canLog    = isAdmin && bothSet && !match.isBye && (!hasWinner || leg1Done);

                // 2-leg score display
                const showLegs  = matchLegs === 2 && (match.leg1 || match.leg2);
                const aggP1     = (Number(match.leg1?.p1Goals)||0) + (Number(match.leg2?.p1Goals)||0);
                const aggP2     = (Number(match.leg1?.p2Goals)||0) + (Number(match.leg2?.p2Goals)||0);
                // Single-leg score from stored match.score field
                const singleScore = !showLegs && match.score ? match.score : null;

                return (
                  <div key={match.id} style={{
                    position: "absolute", top, left: 0, right: 0, height: MATCH_H,
                    borderRadius: 14,
                    background: match.isBye
                      ? "rgba(255,255,255,.015)"
                      : hasWinner
                        ? "rgba(170,255,0,.04)"
                        : "rgba(255,255,255,.04)",
                    border: `1px solid ${
                      match.isBye     ? "rgba(255,255,255,.05)"
                      : hasWinner     ? `${N}25`
                      : canLog        ? "rgba(255,255,255,.18)"
                      : "rgba(255,255,255,.09)"
                    }`,
                    cursor: canLog ? "pointer" : "default",
                    overflow: "hidden",
                    transition: "border-color .15s",
                  }}
                    onClick={() => canLog && onMatchTap?.(match)}
                  >
                    {match.isBye ? (
                      // BYE — auto-advance display
                      <div style={{ height: "100%", display: "flex", flexDirection: "column",
                        justifyContent: "center", padding: "0 12px" }}>
                        <div style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
                          color: N, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {(match.p1 || match.p2)?.name || "—"}
                        </div>
                        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: `${N}66`, marginTop: 3, letterSpacing: "1px" }}>
                          AUTO ADVANCE
                        </div>
                      </div>
                    ) : (
                      // Regular match — two player slots
                      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                        {[match.p1, match.p2].map((player, pi) => {
                          const isWinner = player && match.winner?.id === player.id;
                          const isLoser  = player && match.winner && match.winner.id !== player.id;
                          const tierMeta = player?.tier ? TIER_META[player.tier] : null;
                          // Per-player aggregate goal count
                          const aggGoals = showLegs ? (pi === 0 ? aggP1 : aggP2) : null;
                          return (
                            <div key={pi} style={{
                              flex: 1, display: "flex", alignItems: "center", gap: 7,
                              padding: "0 8px 0 10px",
                              background: isWinner ? `${N}10` : "transparent",
                              borderBottom: pi === 0 ? "1px solid rgba(255,255,255,.06)" : "none",
                            }}>
                              {/* Tier dot */}
                              {tierMeta && (
                                <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: tierMeta.color }}/>
                              )}
                              <span style={{
                                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                color: isWinner ? N : isLoser ? "rgba(255,255,255,.28)" : player ? "#fff" : "rgba(255,255,255,.2)",
                              }}>
                                {player?.name || (match.round > 1 ? "TBD" : "—")}
                              </span>
                              {/* Aggregate score badge for 2-leg */}
                              {showLegs && aggGoals !== null && (
                                <span style={{
                                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, fontWeight: 800,
                                  color: isWinner ? N : isLoser ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.5)",
                                  minWidth: 14, textAlign: "right", flexShrink: 0,
                                }}>{aggGoals}</span>
                              )}
                              {/* Single-leg score on completed cards */}
                              {singleScore && (
                                <span style={{
                                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 13,
                                  color: isWinner ? N : isLoser ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.4)",
                                  minWidth: 14, textAlign: "right", flexShrink: 0,
                                }}>
                                  {pi === 0 ? singleScore.p1Goals : singleScore.p2Goals}
                                </span>
                              )}
                              {isWinner && !showLegs && !singleScore && <div style={{ width: 5, height: 5, borderRadius: "50%", background: N, flexShrink: 0 }}/>}
                            </div>
                          );
                        })}
                        {/* 2-leg per-leg score breakdown */}
                        {showLegs && (
                          <div style={{
                            position: "absolute", bottom: 2, left: 10, right: 8,
                            fontFamily: "'DM Sans',sans-serif", fontSize: 8, fontWeight: 600,
                            color: "rgba(255,255,255,.3)", letterSpacing: "0.3px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {match.leg1 && `L1 ${match.leg1.p1Goals}–${match.leg1.p2Goals}`}
                            {match.leg1 && match.leg2 && "  "}
                            {match.leg2 && `L2 ${match.leg2.p1Goals}–${match.leg2.p2Goals}`}
                            {!match.leg2 && match.leg1 && (
                              <span style={{ color: `${N}66` }}> · L2 pending</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Log indicator — icon only, no text */}
                    {canLog && !showLegs && (
                      <div style={{ position: "absolute", bottom: 4, right: 8,
                        width: 16, height: 16, borderRadius: "50%", background: `${N}20`, border: `1px solid ${N}50`,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Plus size={8} style={{ color: N }}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// KNOCKOUT FIXTURES LIST
// ─────────────────────────────────────────────
function KnockoutFixtures({ bracket, onMatchTap, isAdmin, matchLegs }) {
  if (!bracket?.rounds?.length) return null;
  const n = bracket.rounds.length;

  const rlabel = (roundNum) => {
    const fromEnd = n - roundNum;
    if (fromEnd === 0) return "Final";
    if (fromEnd === 1 && n > 1) return "Semi-Finals";
    if (fromEnd === 2 && n > 2) return "Quarter-Finals";
    const mc = bracket.rounds[roundNum - 1]?.length || 0;
    return `Round of ${mc * 2}`;
  };

  const groups = bracket.rounds.map((round, ri) => ({
    label: rlabel(ri + 1),
    matches: round.filter(m => !m.isBye),
  })).filter(g => g.matches.length > 0);

  if (!groups.length) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: "2px",
        color: "#fff", marginBottom: 14 }}>
        ⚡ Knockout <span style={{ color: N }}>Fixtures</span>
      </div>
      {groups.map(({ label, matches }) => (
        <div key={label} style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 800,
            letterSpacing: "1.5px", color: "rgba(255,255,255,.3)", marginBottom: 8 }}>
            {label.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {matches.map(match => {
              const p1 = match.p1, p2 = match.p2;
              const bothKnown = p1 && p2 && !p1.isTBD && !p2.isTBD;
              const isDone = !!match.winner;
              const leg1Done = matchLegs === 2 && match.leg1 && !match.leg2;
              const tappable = isAdmin && bothKnown && (matchLegs === 2 ? (!isDone || leg1Done) : !p1.isTBD && !p2.isTBD);

              let scoreDisplay = null;
              if (match.score) {
                scoreDisplay = `${match.score.p1Goals}–${match.score.p2Goals}`;
              } else if (match.leg1) {
                const a1 = (Number(match.leg1?.p1Goals)||0)+(Number(match.leg2?.p1Goals)||0);
                const a2 = (Number(match.leg1?.p2Goals)||0)+(Number(match.leg2?.p2Goals)||0);
                scoreDisplay = match.leg2 ? `${a1}–${a2}` : null;
              }

              return (
                <div key={match.id}
                  onClick={() => tappable && onMatchTap?.(match)}
                  style={{
                    borderRadius: 12, padding: "10px 12px",
                    display: "flex", alignItems: "center", gap: 10,
                    background: isDone ? "rgba(170,255,0,.04)" : "rgba(255,255,255,.025)",
                    border: `1px solid ${isDone ? "rgba(170,255,0,.2)" : tappable ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.07)"}`,
                    cursor: tappable ? "pointer" : "default",
                  }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                      color: match.winner?.id === p1?.id ? N : !bothKnown ? "rgba(255,255,255,.28)" : "#fff",
                      flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p1?.name || "TBD"}
                    </span>
                    {scoreDisplay ? (
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: "2px",
                        color: N, flexShrink: 0, minWidth: 40, textAlign: "center" }}>
                        {scoreDisplay}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10,
                        color: "rgba(255,255,255,.2)", flexShrink: 0, minWidth: 40, textAlign: "center" }}>vs</span>
                    )}
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                      color: match.winner?.id === p2?.id ? N : !bothKnown ? "rgba(255,255,255,.28)" : "#fff",
                      flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p2?.name || "TBD"}
                    </span>
                  </div>
                  {tappable && (
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${N}20`,
                      border: `1px solid ${N}50`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Plus size={9} style={{ color: N }}/>
                    </div>
                  )}
                  {isDone && !tappable && (
                    <div style={{ width: 18, height: 18, borderRadius: "50%",
                      background: "rgba(170,255,0,.12)", border: "1px solid rgba(170,255,0,.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Check size={9} style={{ color: N }}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// SCORE INPUT ROW — used by BracketResultSheet
// ─────────────────────────────────────────────
const ScoreInputRow = ({ labelL, valueL, onChangeL, labelR, valueR, onChangeR, locked = false }) => (
  <div className="flex items-center gap-3">
    <div style={{ flex: 1, textAlign: "center" }}>
      {labelL && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700,
        color: "rgba(255,255,255,.3)", letterSpacing: "1px", marginBottom: 6 }}>{labelL}</div>}
      <input value={valueL} onChange={e => !locked && onChangeL(e.target.value)}
        readOnly={locked} maxLength={4}
        style={{ width: "100%", borderRadius: 14, padding: "12px 0", textAlign: "center", outline: "none",
          fontFamily: "'DM Sans',sans-serif", fontSize: 22, fontWeight: 800,
          background: locked ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)",
          border: `1.5px solid ${valueL && !locked ? N : "rgba(255,255,255,.1)"}`,
          color: locked ? "rgba(255,255,255,.4)" : "#fff", caretColor: N }}/>
    </div>
    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 16, color: "rgba(255,255,255,.25)", fontWeight: 700, flexShrink: 0 }}>—</span>
    <div style={{ flex: 1, textAlign: "center" }}>
      {labelR && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700,
        color: "rgba(255,255,255,.3)", letterSpacing: "1px", marginBottom: 6 }}>{labelR}</div>}
      <input value={valueR} onChange={e => !locked && onChangeR(e.target.value)}
        readOnly={locked} maxLength={4}
        style={{ width: "100%", borderRadius: 14, padding: "12px 0", textAlign: "center", outline: "none",
          fontFamily: "'DM Sans',sans-serif", fontSize: 22, fontWeight: 800,
          background: locked ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)",
          border: `1.5px solid ${valueR && !locked ? N : "rgba(255,255,255,.1)"}`,
          color: locked ? "rgba(255,255,255,.4)" : "#fff", caretColor: N }}/>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// BRACKET MATCH RESULT SHEET
// ─────────────────────────────────────────────
function BracketResultSheet({ match, matchLegs = 1, onResult, onClose }) {
  // Single-leg / leg-2 state
  const [p1Goals, setP1Goals] = useState("");
  const [p2Goals, setP2Goals] = useState("");
  const [chosen,  setChosen]  = useState(null); // "p1" | "p2" — only for single-leg or tie-break

  if (!match) return null;

  // Determine which leg to log
  const legToLog = (matchLegs === 2 && match.leg1 && !match.leg2) ? 2 : 1;
  const isTwoLeg = matchLegs === 2;

  // Aggregate live display for leg-2
  const l1p1 = Number(match.leg1?.p1Goals) || 0;
  const l1p2 = Number(match.leg1?.p2Goals) || 0;
  const l2p1 = Number(p1Goals) || 0;
  const l2p2 = Number(p2Goals) || 0;
  const aggP1 = l1p1 + l2p1;
  const aggP2 = l1p2 + l2p2;
  const bothGoalsEntered = p1Goals !== "" && p2Goals !== "";

  const canSubmitSingle = isTwoLeg ? false : chosen !== null;
  const canSubmitLeg1   = isTwoLeg && legToLog === 1 && bothGoalsEntered;
  const canSubmitLeg2   = isTwoLeg && legToLog === 2 && bothGoalsEntered;
  const canSubmit = canSubmitSingle || canSubmitLeg1 || canSubmitLeg2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (!isTwoLeg) {
      // Single-leg — old flow
      const winner = chosen === "p1" ? match.p1 : match.p2;
      const loser  = chosen === "p1" ? match.p2 : match.p1;
      onResult({ match, winner, loser, p1Goals, p2Goals, leg: 1, isLeg1Only: false });
      return;
    }
    if (legToLog === 1) {
      // Save leg 1 only — no winner yet
      onResult({ match, leg: 1, p1Goals, p2Goals, winner: null, loser: null, isLeg1Only: true });
      return;
    }
    // Leg 2 — determine winner by aggregate
    const totalP1 = l1p1 + Number(p1Goals);
    const totalP2 = l1p2 + Number(p2Goals);
    let winner = null, loser = null;
    if (totalP1 > totalP2)     { winner = match.p1; loser = match.p2; }
    else if (totalP2 > totalP1){ winner = match.p2; loser = match.p1; }
    // tie: winner stays null, sheet still closes — admin can re-open to resolve
    onResult({ match, leg: 2, p1Goals, p2Goals, winner, loser, isLeg1Only: false });
  };

  const legLabel = isTwoLeg
    ? (legToLog === 1 ? "LEG 1" : "LEG 2")
    : "WHO WON?";

  let ctaLabel = "Pick a Winner";
  if (isTwoLeg && legToLog === 1 && canSubmit)  ctaLabel = "Save Leg 1 →";
  if (isTwoLeg && legToLog === 2 && canSubmit) {
    if (aggP1 > aggP2)      ctaLabel = `${match.p1?.name} Wins (${aggP1}–${aggP2}) →`;
    else if (aggP2 > aggP1) ctaLabel = `${match.p2?.name} Wins (${aggP2}–${aggP1}) →`;
    else if (bothGoalsEntered)ctaLabel = `Tie (${aggP1}–${aggP2}) — Confirm`;
  }
  if (!isTwoLeg && chosen) ctaLabel = `${chosen === "p1" ? match.p1?.name : match.p2?.name} Wins →`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,.82)", backdropFilter: "blur(12px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="w-full rounded-t-[28px]"
        style={{ maxWidth: 430, background: "#111318", border: "1.5px solid rgba(255,255,255,.08)", borderBottom: "none" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.15)" }}/>
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <div>
            <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: "2px", color: "#fff", lineHeight: 1 }}>
              Log <span style={{ color: N }}>Result</span>
            </h3>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 3 }}>
              Round {match.round} · Match {match.position + 1}
              {isTwoLeg && <span style={{ color: `${N}88` }}> · {legToLog === 1 ? "1st Leg" : "2nd Leg"}</span>}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", cursor: "pointer",
          }}>
            <X size={14} style={{ color: "rgba(255,255,255,.5)" }}/>
          </button>
        </div>

        <div style={{ padding: "0 20px 32px" }}>
          {/* Player name headers */}
          <div className="flex mb-3">
            {[match.p1, match.p2].map((player, pi) => {
              const tier = player?.tier ? TIER_META[player.tier] : null;
              return (
                <div key={pi} style={{ flex: 1, textAlign: "center" }}>
                  {tier && <div style={{ width: 6, height: 6, borderRadius: "50%", background: tier.color,
                    margin: "0 auto 4px" }}/>}
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
                    color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    padding: "0 4px" }}>{player?.name || "—"}</div>
                </div>
              );
            })}
          </div>

          {/* Section label */}
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
            letterSpacing: "1.5px", color: "rgba(255,255,255,.3)", marginBottom: 10 }}>
            {legLabel}
          </div>

          {/* For 2-leg: show locked leg 1 score if logging leg 2 */}
          {isTwoLeg && legToLog === 2 && match.leg1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700,
                letterSpacing: "1px", color: "rgba(255,255,255,.25)", marginBottom: 6 }}>LEG 1 (LOCKED)</div>
              <ScoreInputRow
                labelL={match.p1?.name} valueL={String(match.leg1.p1Goals || 0)}
                onChangeL={() => {}} locked
                labelR={match.p2?.name} valueR={String(match.leg1.p2Goals || 0)}
                onChangeR={() => {}}
              />
            </motion.div>
          )}

          {/* Current leg score entry */}
          <div style={{ marginBottom: 14 }}>
            {isTwoLeg && (
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700,
                letterSpacing: "1px", color: `${N}88`, marginBottom: 6 }}>
                LEG {legToLog}
              </div>
            )}
            <ScoreInputRow
              valueL={p1Goals} onChangeL={setP1Goals}
              valueR={p2Goals} onChangeR={setP2Goals}
            />
          </div>

          {/* Single-leg: who won buttons if no scores entered */}
          {!isTwoLeg && (
            <div className="flex gap-3 mb-5">
              {[{key:"p1",player:match.p1},{key:"p2",player:match.p2}].map(({key,player}) => {
                const sel = chosen === key;
                const tier = player?.tier ? TIER_META[player.tier] : null;
                return (
                  <button key={key} onClick={() => setChosen(key)} style={{
                    flex: 1, borderRadius: 14, padding: "10px 8px", cursor: "pointer", textAlign: "center",
                    background: sel ? `${N}10` : "rgba(255,255,255,.04)",
                    border: `1.5px solid ${sel ? N : "rgba(255,255,255,.1)"}`,
                    transition: "all 0.15s ease",
                  }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
                      color: sel ? N : "rgba(255,255,255,.65)" }}>
                      {player?.name || "—"}
                    </div>
                    {tier && <div style={{ fontSize: 9, color: tier.color, marginTop: 2 }}>{tier.label}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Aggregate live display for leg 2 */}
          {isTwoLeg && legToLog === 2 && (p1Goals !== "" || p2Goals !== "") && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              style={{ marginBottom: 14, borderRadius: 12, padding: "10px 14px",
                background: aggP1 === aggP2 ? "rgba(255,183,0,.08)" : `${N}08`,
                border: `1px solid ${aggP1 === aggP2 ? "rgba(255,183,0,.3)" : `${N}25`}`,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                color: "rgba(255,255,255,.4)", letterSpacing: "1px" }}>AGGREGATE</span>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: "2px",
                color: aggP1 === aggP2 ? "#FFB700" : N }}>
                {aggP1} – {aggP2}
              </span>
              {aggP1 !== aggP2 && (
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                  color: N }}>{aggP1 > aggP2 ? match.p1?.name : match.p2?.name} leads</span>
              )}
            </motion.div>
          )}

          <button onClick={handleSubmit} disabled={!canSubmit} style={{
            width: "100%", borderRadius: 18, padding: "15px 0", cursor: canSubmit ? "pointer" : "not-allowed",
            background: canSubmit ? `linear-gradient(135deg,${N},#7DC900)` : "rgba(255,255,255,.06)",
            border: "none", fontFamily: "'DM Sans',sans-serif", fontWeight: 800, fontSize: 13,
            color: canSubmit ? "#000" : "rgba(255,255,255,.25)",
          }}>
            {ctaLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// GROUP MATCH RESULT SHEET
// ─────────────────────────────────────────────
function GroupResultSheet({ match, onResult, onClose }) {
  const [p1Goals, setP1Goals] = useState("");
  const [p2Goals, setP2Goals] = useState("");
  if (!match) return null;
  const canSubmit = p1Goals !== "" && p2Goals !== "";
  const p1n = Number(p1Goals) || 0;
  const p2n = Number(p2Goals) || 0;
  const isDraw = canSubmit && p1n === p2n;
  const resultLabel = !canSubmit ? "" : isDraw ? "Draw" : p1n > p2n ? `${match.p1?.name} wins` : `${match.p2?.name} wins`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,.88)", backdropFilter: "blur(16px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="w-full rounded-t-[28px] overflow-hidden"
        style={{ maxWidth: 430, background: "#111318", border: "1.5px solid rgba(255,255,255,.1)", borderBottom: "none" }}>
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.15)" }}/>
        </div>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}>
          <div>
            <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: "2px", color: "#fff", lineHeight: 1 }}>
              Log <span style={{ color: N }}>Group Match</span>
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: `${N}88`, fontWeight: 700 }}>
                Group {match.groupName}
              </span>
              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.8px", color: "rgba(255,255,255,.35)",
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 5, padding: "1px 6px", fontFamily: "'DM Sans',sans-serif" }}>
                🔒 PLAYERS LOCKED
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", cursor: "pointer" }}>
            <X size={14} style={{ color: "rgba(255,255,255,.5)" }}/>
          </button>
        </div>

        <div style={{ padding: "20px" }}>
          {/* Score entry row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            {/* P1 */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.p1?.name}</div>
              <input type="number" min="0" max="99" value={p1Goals} onChange={e => setP1Goals(e.target.value)}
                placeholder="0" style={{
                  width: "100%", borderRadius: 14, padding: "14px 8px", textAlign: "center",
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, fontWeight: 700, color: "#fff",
                  background: "rgba(255,255,255,.06)", border: `2px solid ${p1Goals !== "" ? N : "rgba(255,255,255,.12)"}`,
                  outline: "none", caretColor: N,
                }}/>
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: "rgba(255,255,255,.25)", flexShrink: 0, paddingTop: 26 }}>–</div>
            {/* P2 */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.p2?.name}</div>
              <input type="number" min="0" max="99" value={p2Goals} onChange={e => setP2Goals(e.target.value)}
                placeholder="0" style={{
                  width: "100%", borderRadius: 14, padding: "14px 8px", textAlign: "center",
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, fontWeight: 700, color: "#fff",
                  background: "rgba(255,255,255,.06)", border: `2px solid ${p2Goals !== "" ? "rgba(59,142,255,.6)" : "rgba(255,255,255,.12)"}`,
                  outline: "none", caretColor: "#3B8EFF",
                }}/>
            </div>
          </div>

          {/* Live result preview */}
          {canSubmit && (
            <div style={{ textAlign: "center", marginBottom: 18, fontFamily: "'DM Sans',sans-serif",
              fontSize: 12, fontWeight: 700,
              color: isDraw ? "#3B8EFF" : N }}>
              {isDraw ? "🤝 " : "🏆 "}{resultLabel}
            </div>
          )}

          <button onClick={() => { if (canSubmit) onResult({ match, p1Goals, p2Goals }); }} disabled={!canSubmit} style={{
            width: "100%", borderRadius: 18, padding: "16px", border: "none", cursor: canSubmit ? "pointer" : "not-allowed",
            background: canSubmit ? `linear-gradient(135deg,${N},#7DC900)` : "rgba(255,255,255,.06)",
            fontFamily: "'DM Sans',sans-serif", fontWeight: 800, fontSize: 15,
            color: canSubmit ? "#000" : "rgba(255,255,255,.2)",
          }}>
            {canSubmit ? "Save Result" : "Enter Both Scores"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// TOURNAMENT LOG MODAL (full-screen, locked participants)
// ─────────────────────────────────────────────
function TournamentLogModal({ match, matchType, matchLegs = 1, contextLabel = "", onGroupResult, onBracketResult, onClose }) {
  const initP1 = match?.existingP1Goals != null ? String(match.existingP1Goals)
    : match?.score?.p1Goals != null ? String(match.score.p1Goals) : "";
  const initP2 = match?.existingP2Goals != null ? String(match.existingP2Goals)
    : match?.score?.p2Goals != null ? String(match.score.p2Goals) : "";
  const [p1Score, setP1Score] = useState(initP1);
  const [p2Score, setP2Score] = useState(initP2);
  const [tieWinner, setTieWinner] = useState(null); // "p1"|"p2" — only for tied bracket matches
  const [saved, setSaved] = useState(false);

  if (!match) return null;

  const p1 = match.p1 || {};
  const p2 = match.p2 || {};
  const isBracket = matchType === "bracket";
  const isLeg2    = isBracket && matchLegs === 2 && match.leg1 && !match.leg2;
  const isLeg1Only = isBracket && matchLegs === 2 && !match.leg1;

  const p1n = Number(p1Score) || 0;
  const p2n = Number(p2Score) || 0;
  const scoresEntered = p1Score !== "" && p2Score !== "";
  const isTied  = scoresEntered && p1n === p2n;
  // Bracket needs a winner; group allows draw
  const autoWinner = !scoresEntered ? null : p1n > p2n ? "p1" : p2n > p1n ? "p2" : null;
  const winner     = autoWinner || (isBracket ? tieWinner : null);
  const canSubmit  = scoresEntered && (!isBracket || winner !== null);

  // Live aggregate for leg 2
  const l1p1 = Number(match.leg1?.p1Goals) || 0;
  const l1p2 = Number(match.leg1?.p2Goals) || 0;
  const aggP1 = l1p1 + p1n;
  const aggP2 = l1p2 + p2n;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSaved(true);
    setTimeout(() => {
      if (!isBracket) {
        onGroupResult?.({ match, p1Goals: String(p1n), p2Goals: String(p2n) });
      } else {
        const winnerObj = winner === "p1" ? p1 : p2;
        const loserObj  = winner === "p1" ? p2 : p1;
        onBracketResult?.({
          match,
          winner: winnerObj,
          loser:  loserObj,
          p1Goals: String(p1n),
          p2Goals: String(p2n),
          leg: isLeg2 ? 2 : 1,
          isLeg1Only,
        });
      }
      onClose();
    }, 900);
  };

  const resultText = !scoresEntered ? null
    : !isBracket && isTied ? "🤝 Draw"
    : winner === "p1" ? `🏆 ${p1.name} wins`
    : winner === "p2" ? `🏆 ${p2.name} wins`
    : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.92)", backdropFilter: "blur(20px)" }}
      onClick={e => { if (e.target === e.currentTarget && !saved) onClose(); }}>

      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="w-full flex flex-col rounded-[28px] overflow-hidden"
        style={{
          maxWidth: 400, maxHeight: "90vh",
          background: "#0C0E13",
          border: `2px solid ${N}`,
          boxShadow: `0 0 0 1px rgba(170,255,0,.08),0 0 60px rgba(170,255,0,.2),0 28px 72px rgba(0,0,0,.8)`,
        }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid rgba(170,255,0,.14)` }}>
          <div>
            {saved ? (
              <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: "2px", color: "#fff", lineHeight: 1 }}>
                Result <span style={{ color: N }}>Saved!</span>
              </h3>
            ) : (
              <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: "2px", color: "#fff", lineHeight: 1 }}>
                Log <span style={{ color: N }}>Result</span>
              </h3>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              {contextLabel && (
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: "1px",
                  color: N, background: `${N}12`, border: `1px solid ${N}30`, borderRadius: 6, padding: "2px 7px" }}>
                  {contextLabel}
                </span>
              )}
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "rgba(255,255,255,.3)",
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 5, padding: "2px 6px", fontWeight: 700 }}>🔒 LOCKED</span>
            </div>
          </div>
          {!saved && (
            <button onClick={onClose} className="flex items-center justify-center w-9 h-9 rounded-full"
              style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", cursor: "pointer" }}>
              <X size={16} style={{ color: "rgba(255,255,255,.55)" }}/>
            </button>
          )}
        </div>

        {/* Body */}
        {saved ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <motion.div animate={{ scale: [0.5, 1.15, 1] }} transition={{ duration: 0.5 }}
              style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg,${N},#7DC900)`,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={28} color="#000" strokeWidth={3}/>
            </motion.div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.6)" }}>
              {resultText}
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-5" style={{ WebkitOverflowScrolling: "touch" }}>

            {/* Leg 2 banner — show locked leg 1 score */}
            {isLeg2 && match.leg1 && (
              <div style={{ borderRadius: 14, padding: "10px 14px", marginBottom: 18,
                background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>
                  Leg 1 (locked)
                </div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: "2px", color: "rgba(255,255,255,.55)" }}>
                  {match.leg1.p1Goals} – {match.leg1.p2Goals}
                </div>
              </div>
            )}

            {/* Score entry */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 12, marginBottom: 20 }}>
              {/* P1 */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                  background: `linear-gradient(135deg,${p1.tier ? TIER_META[p1.tier]?.color || N : N},${p1.tier ? TIER_META[p1.tier]?.bg?.replace("rgba","").replace(","," ") || "#7DC900" : "#7DC900"})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 800, color: "#000", fontFamily: "'Bebas Neue',sans-serif" }}>
                  {(p1.name || "?")[0].toUpperCase()}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: "#fff",
                  textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                  {p1.name || "Player 1"}
                </div>
                <input type="number" min="0" max="99" inputMode="numeric" value={p1Score}
                  onChange={e => { setP1Score(e.target.value); setTieWinner(null); }}
                  placeholder="0" style={{
                    width: "100%", borderRadius: 16, padding: "14px 8px", textAlign: "center",
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, lineHeight: 1, color: "#fff",
                    background: "rgba(255,255,255,.06)",
                    border: `2px solid ${p1Score !== "" ? (winner === "p1" ? N : "rgba(255,255,255,.25)") : "rgba(255,255,255,.12)"}`,
                    outline: "none", caretColor: N,
                  }}/>
              </div>

              {/* VS divider */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 8, gap: 6 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "rgba(255,255,255,.18)", letterSpacing: "2px" }}>
                  {isLeg2 ? "LEG 2" : "VS"}
                </div>
                {scoresEntered && resultText && (
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 800,
                    color: isTied && !isBracket ? "#3B8EFF" : N, textAlign: "center", whiteSpace: "nowrap" }}>
                    {resultText}
                  </div>
                )}
              </div>

              {/* P2 */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                  background: "linear-gradient(135deg,#3B8EFF,#1a6be0)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: "'Bebas Neue',sans-serif" }}>
                  {(p2.name || "?")[0].toUpperCase()}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: "#fff",
                  textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                  {p2.name || "Player 2"}
                </div>
                <input type="number" min="0" max="99" inputMode="numeric" value={p2Score}
                  onChange={e => { setP2Score(e.target.value); setTieWinner(null); }}
                  placeholder="0" style={{
                    width: "100%", borderRadius: 16, padding: "14px 8px", textAlign: "center",
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, lineHeight: 1, color: "#fff",
                    background: "rgba(255,255,255,.06)",
                    border: `2px solid ${p2Score !== "" ? (winner === "p2" ? "#3B8EFF" : "rgba(255,255,255,.25)") : "rgba(255,255,255,.12)"}`,
                    outline: "none", caretColor: "#3B8EFF",
                  }}/>
              </div>
            </div>

            {/* Tiebreaker — bracket only when scores are equal */}
            {isBracket && isTied && scoresEntered && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: "1.5px",
                  color: "rgba(255,255,255,.35)", textAlign: "center", marginBottom: 10 }}>
                  SCORES LEVEL — PICK WINNER (PENS / ET)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ key: "p1", player: p1 }, { key: "p2", player: p2 }].map(({ key, player }) => (
                    <button key={key} onClick={() => setTieWinner(key)} style={{
                      flex: 1, borderRadius: 14, padding: "12px 8px", cursor: "pointer", border: "none",
                      background: tieWinner === key ? `linear-gradient(135deg,${N},#7DC900)` : "rgba(255,255,255,.06)",
                      fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 800,
                      color: tieWinner === key ? "#000" : "rgba(255,255,255,.55)",
                      transition: "all .15s",
                    }}>
                      {player.name || `Player ${key === "p1" ? 1 : 2}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live aggregate for leg 2 */}
            {isLeg2 && scoresEntered && (
              <div style={{ borderRadius: 14, padding: "12px 16px", marginBottom: 18, textAlign: "center",
                background: `${N}08`, border: `1px solid ${N}22` }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: "1.5px",
                  color: "rgba(255,255,255,.35)", marginBottom: 6 }}>AGGREGATE</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: "3px",
                  color: aggP1 !== aggP2 ? N : "#3B8EFF" }}>
                  {aggP1} – {aggP2}
                </div>
                {aggP1 !== aggP2 && (
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, color: N, marginTop: 4 }}>
                    {aggP1 > aggP2 ? p1.name : p2.name} advances
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <PBtn onClick={handleSubmit} disabled={!canSubmit}>
              {!scoresEntered
                ? "Enter Both Scores"
                : isBracket && isTied && !tieWinner
                  ? "Pick a Winner First"
                  : isLeg1Only
                    ? "Save Leg 1 Score"
                    : "Save Result"}
            </PBtn>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// GROUP STANDINGS TABLE
// ─────────────────────────────────────────────
const GROUP_COLORS = ["#AAFF00","#3B8EFF","#FFB830","#FF6B35","#AA55FF","#00E5CC","#FF3355","#FFD700"];
const GROUP_LETTER_IDX = { A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7 };

function GroupTable({ group, groupMatches, feed, onMatchTap, isAdmin, advancingPerGroup = 2 }) {
  const gc = GROUP_COLORS[GROUP_LETTER_IDX[group.name] ?? 0];
  const completedIds = useMemo(() => new Set(feed.map(m => m.id)), [feed]);

  // Compute group standings from feed
  const standings = useMemo(() => {
    const fixtureIds = new Set(groupMatches.map(m => m.id));
    const results = feed.filter(m => fixtureIds.has(m.id));
    const stats = {};
    group.participants.forEach(p => {
      stats[p.name] = { participant: p, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
    });
    results.forEach(m => {
      const p1g = Number(m.p1Goals ?? 0);
      const p2g = Number(m.p2Goals ?? 0);
      const p1n = m.p1Name, p2n = m.p2Name;
      if (stats[p1n]) {
        stats[p1n].played++;
        stats[p1n].gf += p1g; stats[p1n].ga += p2g;
        if (p1g > p2g) { stats[p1n].won++; stats[p1n].pts += 3; }
        else if (p1g === p2g) { stats[p1n].drawn++; stats[p1n].pts += 1; }
        else stats[p1n].lost++;
      }
      if (stats[p2n]) {
        stats[p2n].played++;
        stats[p2n].gf += p2g; stats[p2n].ga += p1g;
        if (p2g > p1g) { stats[p2n].won++; stats[p2n].pts += 3; }
        else if (p1g === p2g) { stats[p2n].drawn++; stats[p2n].pts += 1; }
        else stats[p2n].lost++;
      }
    });
    return Object.values(stats).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
      if (gdB !== gdA) return gdB - gdA;
      return b.gf - a.gf;
    });
  }, [group, groupMatches, feed]);

  const played = groupMatches.filter(m => completedIds.has(m.id)).length;
  const total  = groupMatches.length;
  const done   = played === total && total > 0;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Group header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: gc, boxShadow: `0 0 6px ${gc}` }}/>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: "2px", color: "#fff" }}>
            Group {group.name}
          </span>
          {done && <span style={{ fontSize: 8, fontWeight: 800, color: gc, background: `${gc}15`, border: `1px solid ${gc}40`,
            borderRadius: 6, padding: "1px 6px", fontFamily: "'DM Sans',sans-serif", letterSpacing: "1px" }}>COMPLETE</span>}
        </div>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "rgba(255,255,255,.3)", fontWeight: 700 }}>
          {played}/{total} played
        </span>
      </div>

      {/* Standings mini-table */}
      <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,.07)", marginBottom: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 24px 24px 24px 28px 32px",
          padding: "7px 12px", background: "rgba(255,255,255,.04)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          {["PLAYER","MP","W","D","L","GD","PTS"].map((h, i) => (
            <span key={h} style={{ fontSize: 8, fontWeight: 800, letterSpacing: "1px",
              color: "rgba(255,255,255,.28)", textAlign: i > 0 ? "center" : "left",
              fontFamily: "'DM Sans',sans-serif" }}>{h}</span>
          ))}
        </div>
        {standings.map((row, i) => {
          const isAdvancing = i < advancingPerGroup;
          return (
            <div key={row.participant.name} style={{
              display: "grid", gridTemplateColumns: "1fr 24px 24px 24px 24px 28px 32px",
              padding: "9px 12px", alignItems: "center",
              borderBottom: i < standings.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
              background: isAdvancing ? `${gc}06` : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 12,
                  color: isAdvancing ? gc : "rgba(255,255,255,.25)", flexShrink: 0 }}>{i + 1}</span>
                {row.participant.tier && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: TIER_META[row.participant.tier]?.color || gc }}/>
                )}
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
                  color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.participant.name}
                </span>
              </div>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "rgba(255,255,255,.4)" }}>{row.played}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, color: N }}>{row.won}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#3B8EFF" }}>{row.drawn}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#FF3355" }}>{row.lost}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                color: row.gf - row.ga >= 0 ? N : "#FF3355" }}>{row.gf - row.ga >= 0 ? "+" : ""}{row.gf - row.ga}</span>
              <span style={{ textAlign: "center", fontFamily: "'Bebas Neue',sans-serif", fontSize: 14,
                color: isAdvancing ? gc : "#fff" }}>{row.pts}</span>
            </div>
          );
        })}
      </div>

      {/* Fixtures */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {groupMatches.map(fixture => {
          const result = feed.find(m => m.id === fixture.id);
          const isPending = !result;
          const canLog    = isAdmin;
          return (
            <div key={fixture.id}
              onClick={() => canLog && onMatchTap?.({ ...fixture, existingP1Goals: result?.p1Goals, existingP2Goals: result?.p2Goals })}
              style={{
                borderRadius: 12, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10,
                background: result ? `${gc}05` : "rgba(255,255,255,.025)",
                border: `1px solid ${result ? `${gc}20` : "rgba(255,255,255,.07)"}`,
                cursor: canLog ? "pointer" : "default",
              }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                  color: result && !result.isDraw && result.p1Goals > result.p2Goals ? N : "#fff",
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fixture.p1.name}
                </span>
                {result ? (
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: "2px",
                    color: result.isDraw ? "#3B8EFF" : N, flexShrink: 0, minWidth: 40, textAlign: "center" }}>
                    {result.p1Goals}–{result.p2Goals}
                  </span>
                ) : (
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "rgba(255,255,255,.2)",
                    flexShrink: 0, minWidth: 40, textAlign: "center" }}>vs</span>
                )}
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                  color: result && !result.isDraw && result.p2Goals > result.p1Goals ? N : "#fff",
                  flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fixture.p2.name}
                </span>
              </div>
              {isPending && canLog && (
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${gc}20`, border: `1px solid ${gc}50`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Plus size={9} style={{ color: gc }}/>
                </div>
              )}
              {result && (
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: isAdmin ? "rgba(170,255,0,.08)" : "rgba(170,255,0,.12)",
                  border: `1px solid ${isAdmin ? "rgba(170,255,0,.4)" : "rgba(170,255,0,.3)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  cursor: isAdmin ? "pointer" : "default" }}>
                  {isAdmin ? <Edit2 size={9} style={{ color: N }}/> : <Check size={9} style={{ color: N }}/>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ADMIN DASHBOARD (non-participant admin)
// ─────────────────────────────────────────────
function AdminDashboard({ players, feed, rules, bracket, groups, groupMatches }) {
  const isTournament  = rules?.tournamentFormat && rules.tournamentFormat !== "classic";
  const isGroups      = rules?.tournamentFormat === "groups_knockout";
  const totalPlayers  = players.length;
  const totalMatches  = feed.length;
  const completedIds  = useMemo(() => new Set(feed.map(m => m.id)), [feed]);
  const groupTotal    = (groupMatches || []).length;
  const groupPlayed   = (groupMatches || []).filter(m => completedIds.has(m.id)).length;
  const groupPct      = groupTotal > 0 ? Math.round(groupPlayed / groupTotal * 100) : 0;
  const bracketTotal  = bracket ? bracket.rounds.reduce((a, r) => a + r.filter(m => !m.isBye).length, 0) : 0;
  const bracketPlayed = bracket ? bracket.rounds.reduce((a, r) => a + r.filter(m => !m.isBye && m.winner).length, 0) : 0;

  return (
    <div className="px-5 pt-5 pb-6">
      {/* Hero card */}
      <div style={{ borderRadius: 22, padding: "22px 20px", marginBottom: 20, position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg,rgba(170,255,0,.08),rgba(170,255,0,.02))",
        border: `1.5px solid ${N}25` }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg,rgba(170,255,0,.04),transparent 60%)" }}/>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, position: "relative" }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg,${N},#7DC900)`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Crown size={22} color="#000"/>
          </div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: "2px", color: N, lineHeight: 1 }}>
              Admin Dashboard
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
              League overview — you&apos;re managing, not playing
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, position: "relative" }}>
          {[
            { label: "PLAYERS", value: totalPlayers, color: N },
            { label: "MATCHES", value: totalMatches, color: "#3B8EFF" },
            { label: "FORMAT",  value: rules?.tournamentFormat === "classic" ? "Classic" : rules?.tournamentFormat === "knockout" ? "Knockout" : "Groups+KO", color: "#FFB830" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, fontWeight: 800, letterSpacing: "1px", color: "rgba(255,255,255,.35)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tournament progress */}
      {isTournament && (
        <>
          <ST>⚡ Tournament Progress</ST>
          {isGroups && groupTotal > 0 && (
            <div style={{ borderRadius: 18, padding: "16px", marginBottom: 12,
              background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>Group Stage</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: groupPct === 100 ? N : "rgba(255,255,255,.5)" }}>
                  {groupPlayed}/{groupTotal}
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${groupPct}%`, transition: "width .6s ease",
                  background: groupPct === 100 ? `linear-gradient(90deg,${N},#7DC900)` : "linear-gradient(90deg,#3B8EFF,#1a6be0)" }}/>
              </div>
              <div style={{ marginTop: 8 }}>
                {(groups || []).map((group, gi) => {
                  const gMatches = (groupMatches || []).filter(m => m.groupName === group.name);
                  const gPlayed  = gMatches.filter(m => completedIds.has(m.id)).length;
                  const gc = GROUP_COLORS[gi % GROUP_COLORS.length];
                  return (
                    <div key={group.name} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: gc, flexShrink: 0 }}/>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.55)", flex: 1 }}>
                        Group {group.name}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: gPlayed === gMatches.length && gMatches.length > 0 ? gc : "rgba(255,255,255,.35)" }}>
                        {gPlayed}/{gMatches.length}
                        {gPlayed === gMatches.length && gMatches.length > 0 ? " ✓" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {bracket && (
            <div style={{ borderRadius: 18, padding: "16px", marginBottom: 20,
              background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>Knockout Stage</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700,
                  color: bracketPlayed === bracketTotal && bracketTotal > 0 ? N : "rgba(255,255,255,.5)" }}>
                  {bracketPlayed}/{bracketTotal}
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <motion.div style={{ height: "100%", borderRadius: 3,
                  background: `linear-gradient(90deg,${N},#7DC900)` }}
                  animate={{ width: `${bracketTotal > 0 ? Math.round(bracketPlayed/bracketTotal*100) : 0}%` }}
                  transition={{ duration: .6 }}/>
              </div>
            </div>
          )}
          {!bracket && (!isGroups || groupTotal === 0) && (
            <div style={{ borderRadius: 18, padding: "20px", textAlign: "center", marginBottom: 20,
              background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.1)",
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "rgba(255,255,255,.3)" }}>
              🎲 No draw generated yet — go to the Home tab to generate one
            </div>
          )}
        </>
      )}

      {/* Classic league progress */}
      {!isTournament && (
        <>
          <ST>📊 League Overview</ST>
          <div style={{ borderRadius: 18, padding: "16px", marginBottom: 20,
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "rgba(255,255,255,.55)", marginBottom: 8 }}>
              {totalMatches} matches logged · {totalPlayers} players
            </div>
            {players.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[...players].sort((a, b) => b.wins - a.wins).slice(0, 5).map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, color: "rgba(255,255,255,.3)", width: 14 }}>{i+1}</span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: "#fff", flex: 1 }}>{p.name}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: N }}>{p.wins}W</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#FF3355" }}>{p.losses}L</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ borderRadius: 16, padding: "12px 16px",
        background: "rgba(170,255,0,.04)", border: `1px solid ${N}18`,
        fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.4)", lineHeight: 1.5 }}>
        💡 Want to appear in standings? Go to the <strong style={{ color: N }}>League</strong> tab and tap &quot;Join as Player&quot;.
      </div>
    </div>
  );
}

/* ── CHAMPION CELEBRATION ────────────────────────────────────────────────── */
function ChampionCelebration({ champion, isAdmin, onDismiss }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const COLORS = ["#CCFF00", "#FFD700", "#AAFF00", "#FFF176", "#FFFFFF", "#FFE57F"];
    const particles = Array.from({ length: 140 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight * -1,
      r: Math.random() * 6 + 3,
      d: Math.random() * 120 + 20,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tiltAngle: Math.random() * Math.PI * 2,
      tiltIncrement: Math.random() * 0.07 + 0.04,
      shape: Math.random() > 0.55 ? "rect" : "circle",
      vx: (Math.random() - 0.5) * 1.5,
    }));

    let angle = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.01;
      for (const p of particles) {
        p.tiltAngle += p.tiltIncrement;
        p.y += (Math.cos(angle + p.d) + 1 + p.r / 2) * 1.3;
        p.x += Math.sin(angle) * 1.8 + p.vx;
        if (p.y > canvas.height + 20) { p.y = -10; p.x = Math.random() * canvas.width; }
        const tilt = Math.sin(p.tiltAngle) * 14;
        ctx.save();
        ctx.translate(p.x + tilt + p.r / 2, p.y);
        ctx.rotate(p.tiltAngle);
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        }
        ctx.restore();
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) { onDismiss(); return; }
    const tid = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(tid);
  }, [timeLeft, onDismiss]);

  const initials = champion.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,.88)", backdropFilter: "blur(10px)" }}>

      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}/>

      <motion.div
        initial={{ scale: 0.7, opacity: 0, y: 48 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: 0.18, type: "spring", stiffness: 170, damping: 18 }}
        style={{ position: "relative", zIndex: 1, textAlign: "center",
          padding: "48px 56px 36px", borderRadius: 28,
          background: "linear-gradient(150deg,rgba(22,22,22,.98),rgba(6,6,6,.98))",
          border: "2px solid #FFD700",
          boxShadow: "0 0 70px rgba(255,215,0,.22), 0 0 140px rgba(170,255,0,.10), inset 0 1px 0 rgba(255,215,0,.18)",
          maxWidth: 480, width: "88vw" }}>

        {/* Animated trophy */}
        <div style={{ marginBottom: 20 }}>
          <motion.div animate={{ scale: [1, 1.14, 1], rotate: [-5, 5, -5, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2 }}
            style={{ display: "inline-flex" }}>
            <Trophy size={56} style={{ color: "#FFD700", filter: "drop-shadow(0 0 18px rgba(255,215,0,.75))" }}/>
          </motion.div>
        </div>

        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: "5px",
          color: "#FFD700", marginBottom: 22, opacity: 0.88 }}>
          TOURNAMENT CHAMPION
        </div>

        {/* Rotating avatar ring */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
          <div style={{ position: "relative", width: 140, height: 140 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{ position: "absolute", inset: -3, borderRadius: "50%",
                background: "conic-gradient(#CCFF00,#FFD700,#AAFF00,#FFD700,#CCFF00)",
                filter: "blur(1.5px)" }}/>
            <div style={{ position: "absolute", inset: 2, borderRadius: "50%", background: "#000" }}/>
            <div style={{ position: "absolute", inset: 6, borderRadius: "50%", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(170,255,0,.07)" }}>
              {champion.avatar_url
                ? <img src={champion.avatar_url} alt={champion.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                : <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 46,
                    color: "#CCFF00", textShadow: "0 0 22px rgba(204,255,0,.65)" }}>
                    {initials}
                  </span>}
            </div>
          </div>
        </div>

        {/* Winner name with glow pulse */}
        <motion.div
          animate={{ textShadow: ["0 0 18px rgba(204,255,0,.35)","0 0 44px rgba(204,255,0,.85)","0 0 18px rgba(204,255,0,.35)"] }}
          transition={{ duration: 2.2, repeat: Infinity }}
          style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 50, letterSpacing: "3px",
            color: "#CCFF00", lineHeight: 1, marginBottom: 8 }}>
          {champion.name}
        </motion.div>

        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13,
          color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 30 }}>
          🏆 Tournament Winner
        </div>

        {/* 15s progress bar */}
        <div style={{ marginBottom: isAdmin ? 20 : 0 }}>
          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
            <motion.div initial={{ width: "100%" }} animate={{ width: "0%" }}
              transition={{ duration: 15, ease: "linear" }}
              style={{ height: "100%", borderRadius: 2,
                background: "linear-gradient(90deg,#CCFF00,#FFD700)" }}/>
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11,
            color: "rgba(255,255,255,.22)", letterSpacing: "1px", marginTop: 7 }}>
            Closing in {timeLeft}s
          </div>
        </div>

        {isAdmin && (
          <button onClick={onDismiss}
            style={{ padding: "10px 32px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)",
              color: "rgba(255,255,255,.55)", fontFamily: "'DM Sans',sans-serif",
              fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "1px" }}>
            DISMISS
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ── TV DASHBOARD ────────────────────────────────────────────────────────── */
function TVDashboard({ players, feed, rules, bracket, groups, groupMatches,
  leagueId, leagueName, isAdmin, onClose, onGroupResult, onSyncEntry, onBracketMatchTap }) {

  const TV = 1.2;
  const tvF = n => Math.round(n * TV);

  const ARENA_PAGE_SIZE = 9;

  const [arenaMode,        setArenaMode]        = useState(false);
  const [arenaPage,        setArenaPage]        = useState(0);
  const [localScores,      setLocalScores]      = useState({});
  const [saving,           setSaving]           = useState(null);
  const [activeCol,        setActiveCol]        = useState("standings");
  const [champCelebration, setChampCelebration] = useState(null);

  // ── Champion detection: watch bracket directly, 500ms debounce, one-shot ref guard ──
  // celebratedRef starts true if the final was already complete when TVDashboard mounted
  // so we never celebrate a past tournament that was already decided.
  const celebratedRef = useRef(
    !!(bracket?.rounds?.length &&
       bracket.rounds[bracket.rounds.length - 1]?.find(m => !m.isBye && m.p1 && m.p2)?.winner)
  );
  useEffect(() => {
    if (!bracket?.rounds?.length || celebratedRef.current) return;
    const lastRound  = bracket.rounds[bracket.rounds.length - 1];
    const finalMatch = lastRound?.find(m => !m.isBye && m.p1 && m.p2);
    if (!finalMatch?.winner) return;
    // 500ms delay: lets React batch its state updates and DB sync settle
    const tid = setTimeout(() => {
      if (celebratedRef.current) return; // race-condition guard
      celebratedRef.current = true;
      const playerObj = players.find(p =>
        (finalMatch.winner.id && p.id === finalMatch.winner.id) ||
        p.name === finalMatch.winner.name
      );
      setChampCelebration({
        name:       finalMatch.winner.name || playerObj?.name || "Champion",
        avatar_url: playerObj?.avatar_url  || null,
      });
    }, 500);
    return () => clearTimeout(tid);
  }, [bracket, players]);

  const completedIds   = useMemo(() => new Set(feed.map(m => m.id)), [feed]);
  const isGroups       = rules?.tournamentFormat === "groups_knockout";
  const isTournament   = !!(rules?.tournamentFormat && rules.tournamentFormat !== "classic");
  const advPerGroup    = rules?.groupSettings?.advancingPerGroup || 2;

  // ── Supabase real-time: sync scores from other devices ──────────────────
  useEffect(() => {
    if (!leagueId || !onSyncEntry || !supabase) return;
    const ch = supabase.channel(`tv-${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches",
        filter: `league_id=eq.${leagueId}` },
        p => { if (p.new?.score) onSyncEntry(p.new.score); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [leagueId, onSyncEntry]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const groupStandings = useMemo(() =>
    groups.map(g => ({
      group: g,
      gc:     GROUP_COLORS[GROUP_LETTER_IDX[g.name] ?? 0],
      rows:   computeGroupStandings(g.participants, g.name, groupMatches, feed),
      total:  groupMatches.filter(m => m.groupName === g.name).length,
      played: groupMatches.filter(m => m.groupName === g.name && completedIds.has(m.id)).length,
    })), [groups, groupMatches, feed, completedIds]);

  const totalArenaPages = Math.ceil(groupStandings.length / ARENA_PAGE_SIZE);
  const hasBracketPage  = !!(bracket?.rounds?.length);
  const totalArenaItems = totalArenaPages + (hasBracketPage ? 1 : 0);
  const arenaOnBracket  = hasBracketPage && arenaPage >= totalArenaPages;

  // ── Arena View: variable-delay cycle (10s groups, 12s bracket page) ─────
  useEffect(() => {
    if (!arenaMode || totalArenaItems <= 1) return;
    const delay = arenaOnBracket ? 12000 : 10000;
    const tid = setTimeout(() => setArenaPage(p => (p + 1) % totalArenaItems), delay);
    return () => clearTimeout(tid);
  }, [arenaMode, arenaPage, totalArenaItems, arenaOnBracket]);

  // Intentional: reset page to 0 when arena mode is disabled so re-enabling starts from the beginning
  useEffect(() => { if (!arenaMode) setArenaPage(0); }, [arenaMode]); // eslint-disable-line react-hooks/set-state-in-effect

  const topScorers = useMemo(() => {
    if (isGroups) {
      const goals = {};
      feed.filter(m => m.tournament_stage === "group").forEach(m => {
        if (m.p1Name) goals[m.p1Name] = (goals[m.p1Name] || 0) + Number(m.p1Goals || 0);
        if (m.p2Name) goals[m.p2Name] = (goals[m.p2Name] || 0) + Number(m.p2Goals || 0);
      });
      return players.map(p => ({ ...p, goals: goals[p.name] || 0 }))
        .sort((a, b) => b.goals - a.goals || b.wins - a.wins).slice(0, 8);
    }
    return [...players].sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, 8);
  }, [players, feed, isGroups]);

  const pendingMatches = useMemo(() =>
    groupMatches.filter(m => !completedIds.has(m.id)), [groupMatches, completedIds]);
  const recentResults  = useMemo(() =>
    feed.filter(m => m.tournament_stage === "group").slice(0, 8), [feed]);

  // ── Score entry ──────────────────────────────────────────────────────────
  const handleScoreChange = (matchId, side, val) =>
    setLocalScores(p => ({ ...p, [matchId]: { ...(p[matchId] || {}), [side]: val } }));

  const handleSaveScore = async (match) => {
    const s = localScores[match.id] || {};
    if (s.p1 === undefined || s.p1 === "" || s.p2 === undefined || s.p2 === "") return;
    setSaving(match.id);
    try {
      await onGroupResult({ match, p1Goals: parseInt(s.p1) || 0, p2Goals: parseInt(s.p2) || 0 });
      setLocalScores(p => { const n = { ...p }; delete n[match.id]; return n; });
    } catch { /* ignore */ }
    setSaving(null);
  };

  // ── Shared style shortcuts ────────────────────────────────────────────────
  const cardS = {
    borderRadius: 16, border: "1px solid rgba(255,255,255,.07)",
    background: "rgba(255,255,255,.03)", marginBottom: 14, overflow: "hidden",
  };
  const colHdrS = {
    fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(13),
    letterSpacing: "2.5px", color: "rgba(255,255,255,.32)", marginBottom: 14,
  };
  const inputS = {
    width: 52, height: 42, borderRadius: 10,
    border: `1.5px solid rgba(170,255,0,.3)`, background: "rgba(170,255,0,.06)",
    color: N, textAlign: "center", fontFamily: "'JetBrains Mono',monospace",
    fontSize: tvF(18), fontWeight: 700, outline: "none", padding: "0 4px",
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  // isCompact = true in arena grid (tighter padding, glow on advancing players)
  const renderStandingCard = (gs, idx, isCompact = false) => {
    const rowPy  = isCompact ? "6px"  : "11px";
    const rowPx  = isCompact ? "10px" : "16px";
    const hdrPy  = isCompact ? "8px"  : "12px";
    const hdrPx  = isCompact ? "10px" : "16px";
    const nameFz = isCompact ? tvF(11) : tvF(14);
    const statFz = isCompact ? tvF(10) : tvF(12);
    const ptsFz  = isCompact ? tvF(14) : tvF(18);
    const grpFz  = isCompact ? tvF(15) : tvF(20);
    const dot    = isCompact ? 7 : 10;
    const cols   = "1fr 26px 26px 26px 26px 30px 36px";
    return (
      <div key={gs.group.name}
        style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,.07)",
          background: "rgba(255,255,255,.03)", overflow: "hidden",
          ...(isCompact ? {} : { marginBottom: 14 }) }}>
        {/* header */}
        <div style={{ padding: `${hdrPy} ${hdrPx}`, borderBottom: "1px solid rgba(255,255,255,.05)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: `${gs.gc}08` }}>
          <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 7 : 10 }}>
            <div style={{ width: dot, height: dot, borderRadius: "50%", background: gs.gc,
              boxShadow: `0 0 ${isCompact ? 5 : 8}px ${gs.gc}`, flexShrink: 0 }}/>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: grpFz,
              letterSpacing: "2px", color: "#fff" }}>
              Group {gs.group.name}
            </span>
            {gs.played === gs.total && gs.total > 0 && (
              <span style={{ fontSize: tvF(8), fontWeight: 800, color: gs.gc, background: `${gs.gc}18`,
                border: `1px solid ${gs.gc}40`, borderRadius: 5, padding: "1px 6px",
                fontFamily: "'DM Sans',sans-serif", letterSpacing: "1px" }}>DONE</span>
            )}
          </div>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: tvF(9), color: "rgba(255,255,255,.28)" }}>
            {gs.played}/{gs.total}
          </span>
        </div>
        {/* col labels */}
        <div style={{ display: "grid", gridTemplateColumns: cols,
          padding: `5px ${hdrPx}`, background: "rgba(255,255,255,.02)" }}>
          {["PLAYER","MP","W","D","L","GD","PTS"].map((h, j) => (
            <span key={h} style={{ fontSize: tvF(8), fontWeight: 800, letterSpacing: "1px",
              color: "rgba(255,255,255,.22)", textAlign: j > 0 ? "center" : "left",
              fontFamily: "'DM Sans',sans-serif" }}>{h}</span>
          ))}
        </div>
        {/* rows */}
        {gs.rows.map((row, ri) => {
          const adv = ri < advPerGroup;
          const gd  = row.gf - row.ga;
          return (
            <div key={row.participant.name} style={{
              display: "grid", gridTemplateColumns: cols,
              padding: `${rowPy} ${rowPx}`, alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,.04)",
              background: adv ? `${gs.gc}07` : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 5 : 7, minWidth: 0 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: isCompact ? tvF(11) : tvF(14),
                  color: adv ? gs.gc : "rgba(255,255,255,.2)", flexShrink: 0 }}>{ri + 1}</span>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: nameFz, fontWeight: 700,
                  color: adv ? "#fff" : "rgba(255,255,255,.7)",
                  textShadow: adv && isCompact ? `0 0 8px ${gs.gc}55` : "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.participant.name}
                </span>
              </div>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: statFz, color: "rgba(255,255,255,.35)" }}>{row.played}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: statFz, fontWeight: 700, color: N }}>{row.won}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: statFz, color: "#3B8EFF" }}>{row.drawn}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: statFz, color: "#FF3355" }}>{row.lost}</span>
              <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: statFz,
                color: gd >= 0 ? N : "#FF3355" }}>{gd >= 0 ? "+" : ""}{gd}</span>
              <span style={{ textAlign: "center", fontFamily: "'Bebas Neue',sans-serif", fontSize: ptsFz,
                color: adv ? gs.gc : "#fff",
                textShadow: adv ? `0 0 10px ${gs.gc}60` : "none" }}>{row.pts}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPendingMatch = (match) => {
    const s = localScores[match.id] || {};
    const dirty   = s.p1 !== undefined && s.p1 !== "" && s.p2 !== undefined && s.p2 !== "";
    const isSaving = saving === match.id;
    const gc = GROUP_COLORS[GROUP_LETTER_IDX[match.groupName] ?? 0];
    return (
      <div key={match.id} style={{ ...cardS, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: gc, flexShrink: 0 }}/>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(9), fontWeight: 800,
            letterSpacing: "1.5px", color: "rgba(255,255,255,.28)" }}>GROUP {match.groupName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(14), fontWeight: 700,
              color: "#fff", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {match.p1?.name}
            </span>
          </div>
          {isAdmin ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <input type="number" min="0" max="99" value={s.p1 ?? ""}
                onChange={e => handleScoreChange(match.id, "p1", e.target.value)}
                style={inputS} placeholder="–"/>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(22), color: "rgba(255,255,255,.2)" }}>:</span>
              <input type="number" min="0" max="99" value={s.p2 ?? ""}
                onChange={e => handleScoreChange(match.id, "p2", e.target.value)}
                style={inputS} placeholder="–"/>
            </div>
          ) : (
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(22),
              color: "rgba(255,255,255,.18)", padding: "0 8px" }}>VS</span>
          )}
          <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(14), fontWeight: 700,
              color: "#fff", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {match.p2?.name}
            </span>
          </div>
        </div>
        {isAdmin && dirty && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => handleSaveScore(match)}
              disabled={isSaving}
              style={{ background: `linear-gradient(135deg,${N},#7DC900)`, border: "none",
                borderRadius: 12, padding: "9px 28px", fontFamily: "'DM Sans',sans-serif",
                fontSize: tvF(13), fontWeight: 800, color: "#000",
                cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.7 : 1 }}>
              {isSaving ? "Saving…" : "✓ Save Result"}
            </motion.button>
          </div>
        )}
      </div>
    );
  };

  const renderRecentResult = (m) => {
    const isDraw = m.isDraw || m.p1Goals === m.p2Goals;
    return (
      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
        <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(13), fontWeight: 700,
            color: !isDraw && m.winner === m.p1Name ? "#fff" : "rgba(255,255,255,.38)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {m.p1Name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          background: "rgba(255,255,255,.05)", borderRadius: 8, padding: "4px 10px" }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(18), color: N }}>{m.p1Goals}</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(14), color: "rgba(255,255,255,.2)" }}>–</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(18), color: N }}>{m.p2Goals}</span>
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(13), fontWeight: 700,
            color: !isDraw && m.winner === m.p2Name ? "#fff" : "rgba(255,255,255,.38)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {m.p2Name}
          </span>
        </div>
      </div>
    );
  };

  // ── Column A: Live Management ─────────────────────────────────────────────
  const colA = (
    <div style={{ padding: "0 16px 32px" }}>
      {isGroups && pendingMatches.length > 0 && (
        <>
          <div style={{ ...colHdrS, display: "flex", alignItems: "center", gap: 8 }}>
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: N, boxShadow: `0 0 6px ${N}`, flexShrink: 0 }}/>
            UPCOMING FIXTURES
          </div>
          {pendingMatches.map(m => renderPendingMatch(m))}
        </>
      )}
      {recentResults.length > 0 && (
        <div style={{ ...cardS, marginTop: isGroups && pendingMatches.length > 0 ? 20 : 0 }}>
          <div style={{ padding: "12px 14px 4px",
            fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(13), letterSpacing: "2px", color: "rgba(255,255,255,.3)" }}>
            RECENT RESULTS
          </div>
          {recentResults.map(m => renderRecentResult(m))}
          <div style={{ height: 8 }}/>
        </div>
      )}
      {!isTournament && (
        <div style={{ borderRadius: 14, padding: "22px", textAlign: "center",
          background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.08)",
          fontFamily: "'DM Sans',sans-serif", fontSize: tvF(12), color: "rgba(255,255,255,.28)", lineHeight: 1.7 }}>
          Classic league mode.<br/>Log matches via the app.
        </div>
      )}
      {isTournament && !isGroups && (
        <div style={{ borderRadius: 14, padding: "22px", textAlign: "center",
          background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.08)",
          fontFamily: "'DM Sans',sans-serif", fontSize: tvF(12), color: "rgba(255,255,255,.28)", lineHeight: 1.7 }}>
          Knockout format.<br/>Use the bracket to log results.
        </div>
      )}
      {isGroups && pendingMatches.length === 0 && recentResults.length === 0 && (
        <div style={{ borderRadius: 14, padding: "22px", textAlign: "center",
          background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.08)",
          fontFamily: "'DM Sans',sans-serif", fontSize: tvF(12), color: "rgba(255,255,255,.28)" }}>
          No fixtures yet — generate a draw first.
        </div>
      )}

      {/* ── Knockout Fixtures (bracket matches for admin logging) ── */}
      {hasBracketPage && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...colHdrS, display: "flex", alignItems: "center", gap: 8 }}>
            ⚡ KNOCKOUT FIXTURES
          </div>
          {bracket.rounds.flatMap(round => round.filter(m => !m.isBye && m.p1 && m.p2))
            .map(match => {
              const isDone   = !!match.winner;
              const canLog   = isAdmin && !isDone;
              const n        = bracket.rounds.length;
              const fromEnd  = n - match.round;
              const rLabel   = fromEnd === 0 ? "FINAL" : fromEnd === 1 ? "SEMI" : fromEnd === 2 ? "QUARTER" : `ROUND ${match.round}`;
              return (
                <div key={match.id}
                  onClick={() => canLog && onBracketMatchTap?.(match)}
                  style={{ ...cardS, padding: "11px 14px", marginBottom: 8, cursor: canLog ? "pointer" : "default",
                    borderColor: isDone ? "rgba(170,255,0,.22)" : canLog ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.07)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(8), fontWeight: 800,
                      letterSpacing: "1.5px", color: "rgba(255,255,255,.28)" }}>{rLabel}</span>
                    {isDone && (
                      <span style={{ fontSize: tvF(8), fontWeight: 800, color: N, background: `${N}15`,
                        border: `1px solid ${N}35`, borderRadius: 4, padding: "1px 6px",
                        fontFamily: "'DM Sans',sans-serif", letterSpacing: "1px" }}>DONE</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, fontFamily: "'DM Sans',sans-serif", fontSize: tvF(13), fontWeight: 700,
                      color: match.winner?.id === match.p1?.id ? N : isDone ? "rgba(255,255,255,.32)" : "#fff",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                      {match.p1?.name || "TBD"}
                    </span>
                    {match.score ? (
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(18), color: N,
                        textShadow: `0 0 10px rgba(170,255,0,.5)`, flexShrink: 0, minWidth: 44, textAlign: "center" }}>
                        {match.score.p1Goals}–{match.score.p2Goals}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(11),
                        color: "rgba(255,255,255,.2)", flexShrink: 0, minWidth: 44, textAlign: "center" }}>vs</span>
                    )}
                    <span style={{ flex: 1, fontFamily: "'DM Sans',sans-serif", fontSize: tvF(13), fontWeight: 700,
                      color: match.winner?.id === match.p2?.id ? N : isDone ? "rgba(255,255,255,.32)" : "#fff",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {match.p2?.name || "TBD"}
                    </span>
                    {canLog && (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${N}18`,
                        border: `1px solid ${N}40`, display: "flex", alignItems: "center",
                        justifyContent: "center", flexShrink: 0 }}>
                        <Plus size={10} style={{ color: N }}/>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );

  // ── Column B: Live Standings ──────────────────────────────────────────────
  const arenaPageGroups = groupStandings.slice(
    arenaPage * ARENA_PAGE_SIZE, (arenaPage + 1) * ARENA_PAGE_SIZE
  );

  const colB = (
    <div style={{ padding: "0 16px 24px" }}>

      {/* ── ARENA VIEW: bracket page ── */}
      {arenaMode && arenaOnBracket && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={colHdrS}>⚡ KNOCKOUT BRACKET</div>
            {totalArenaItems > 1 && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: tvF(10), color: "rgba(255,255,255,.32)" }}>
                BRACKET PAGE
              </span>
            )}
          </div>
          <motion.div key="arena-bracket"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
            style={{ borderRadius: 16, border: `1px solid ${N}22`,
              background: `linear-gradient(135deg,rgba(170,255,0,.03),transparent 60%)`,
              padding: "18px 4px 12px",
              boxShadow: `0 0 60px rgba(170,255,0,.04), inset 0 1px 0 ${N}18` }}>
            <TournamentBracket
              bracket={bracket}
              isAdmin={false}
              onMatchTap={null}
              matchLegs={rules?.matchLegs || 1}
            />
          </motion.div>
          {/* unified pagination */}
          {totalArenaItems > 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 18 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {Array.from({ length: totalArenaItems }, (_, i) => {
                  const isBkt = hasBracketPage && i === totalArenaItems - 1;
                  const active = arenaPage === i;
                  return (
                    <button key={i} onClick={() => setArenaPage(i)}
                      style={{ width: active ? 28 : 8, height: 8, borderRadius: 4,
                        background: active ? N : isBkt ? `${N}50` : "rgba(255,255,255,.18)",
                        border: "none", cursor: "pointer", transition: "all .35s ease",
                        boxShadow: active ? `0 0 8px ${N}` : "none" }}/>
                  );
                })}
              </div>
              <div style={{ width: 120, height: 3, borderRadius: 2, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <motion.div key={`progress-${arenaPage}`}
                  initial={{ width: "100%" }} animate={{ width: "0%" }}
                  transition={{ duration: 12, ease: "linear" }}
                  style={{ height: "100%", borderRadius: 2, background: N }}/>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── ARENA VIEW: groups grid ── */}
      {arenaMode && !arenaOnBracket && groupStandings.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={colHdrS}>LIVE STANDINGS — ALL GROUPS</div>
            {totalArenaItems > 1 && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: tvF(10), color: "rgba(255,255,255,.32)" }}>
                PAGE {arenaPage + 1}/{totalArenaPages}{hasBracketPage ? ` +KO` : ""}
              </span>
            )}
          </div>
          <motion.div key={`arena-groups-${arenaPage}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 10 }}>
            {arenaPageGroups.map((gs, i) =>
              renderStandingCard(gs, arenaPage * ARENA_PAGE_SIZE + i, true)
            )}
          </motion.div>
          {/* unified pagination */}
          {totalArenaItems > 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 18 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {Array.from({ length: totalArenaItems }, (_, i) => {
                  const isBkt = hasBracketPage && i === totalArenaItems - 1;
                  const active = arenaPage === i;
                  return (
                    <button key={i} onClick={() => setArenaPage(i)}
                      style={{ width: active ? 28 : 8, height: 8, borderRadius: 4,
                        background: active ? N : isBkt ? `${N}50` : "rgba(255,255,255,.18)",
                        border: "none", cursor: "pointer", transition: "all .35s ease",
                        boxShadow: active ? `0 0 8px ${N}` : "none" }}/>
                  );
                })}
              </div>
              <div style={{ width: 120, height: 3, borderRadius: 2, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <motion.div key={`progress-${arenaPage}`}
                  initial={{ width: "100%" }} animate={{ width: "0%" }}
                  transition={{ duration: 10, ease: "linear" }}
                  style={{ height: "100%", borderRadius: 2, background: N }}/>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── NORMAL VIEW: stacked group cards ── */}
      {!arenaMode && isGroups && groupStandings.length > 0 && (
        <>
          <div style={colHdrS}>LIVE STANDINGS</div>
          {groupStandings.map((gs, i) => renderStandingCard(gs, i, false))}
        </>
      )}

      {/* ── NORMAL VIEW: bracket fixtures list ── */}
      {!arenaMode && hasBracketPage && (
        <div style={{ marginTop: isGroups && groupStandings.length > 0 ? 24 : 0 }}>
          <div style={{ ...colHdrS }}>⚡ KNOCKOUT BRACKET</div>
          <div style={{ borderRadius: 14, border: `1px solid ${N}18`,
            background: `linear-gradient(135deg,rgba(170,255,0,.02),transparent 60%)`,
            padding: "14px 4px 8px" }}>
            <TournamentBracket
              bracket={bracket}
              isAdmin={isAdmin}
              onMatchTap={onBracketMatchTap}
              matchLegs={rules?.matchLegs || 1}
            />
          </div>
        </div>
      )}

      {/* Classic standings */}
      {!isTournament && players.length > 0 && (
        <>
          <div style={colHdrS}>STANDINGS</div>
          <div style={cardS}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 38px 38px 44px",
              padding: "8px 16px", background: "rgba(255,255,255,.03)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              {["PLAYER","W","L","WIN%"].map((h, j) => (
                <span key={h} style={{ fontSize: tvF(9), fontWeight: 800, letterSpacing: "1px",
                  color: "rgba(255,255,255,.24)", textAlign: j > 0 ? "center" : "left",
                  fontFamily: "'DM Sans',sans-serif" }}>{h}</span>
              ))}
            </div>
            {[...players].sort((a, b) => b.wins - a.wins || a.losses - b.losses).map((p, i) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 38px 38px 44px",
                padding: "11px 16px", alignItems: "center", borderTop: "1px solid rgba(255,255,255,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(14), color: "rgba(255,255,255,.22)", flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(14), fontWeight: 700,
                    color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </div>
                <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: tvF(12), color: N, fontWeight: 700 }}>{p.wins}</span>
                <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: tvF(12), color: "#FF3355" }}>{p.losses}</span>
                <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: tvF(12), color: "rgba(255,255,255,.38)" }}>{pct(p.wins, p.losses)}%</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Top scorer leaderboard — hidden in arena mode */}
      {!arenaMode && topScorers.length > 0 && (
        <>
          <div style={{ ...colHdrS, marginTop: 8 }}>
            ⚡ TOP {isGroups ? "SCORERS" : "PLAYERS"}
          </div>
          <div style={cardS}>
            {topScorers.map((p, i) => {
              const medalC = ["#FFD700","#C0C0C0","#CD7F32"];
              return (
                <div key={p.id || p.name} style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderTop: i > 0 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(15),
                    color: medalC[i] || "rgba(255,255,255,.2)", width: 24, textAlign: "center", flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(14), fontWeight: 700,
                    color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(22),
                      color: N, textShadow: `0 0 12px rgba(170,255,0,.5)` }}>
                      {isGroups ? p.goals : p.wins}
                    </span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(10), fontWeight: 800,
                      color: "rgba(255,255,255,.3)", letterSpacing: "1px" }}>
                      {isGroups ? "GLS" : "W"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "#000",
        display: "flex", flexDirection: "column", fontFamily: "'DM Sans',sans-serif",
        overflow: "hidden" }}>

      <style>{`
        @media (max-width: 767px) {
          .tv-col-b.tv-active { display: flex !important; flex-direction: column; }
          .tv-mobtabs { display: flex !important; }
        }
        @media (min-width: 768px) {
          .tv-mobtabs { display: none !important; }
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: 60, display: "flex", alignItems: "center",
        padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,.08)",
        background: "rgba(0,0,0,.9)", backdropFilter: "blur(20px)", gap: 14 }}>
        {/* League name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: tvF(22), letterSpacing: "3px",
            color: N, textShadow: `0 0 16px rgba(170,255,0,.5)`, lineHeight: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {leagueName}
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(9), color: "rgba(255,255,255,.3)",
            letterSpacing: "2px", fontWeight: 700, marginTop: 2 }}>TV DASHBOARD</div>
        </div>

        {/* ARENA VIEW toggle (admin only) */}
        {isAdmin && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: tvF(11), fontWeight: 800,
              letterSpacing: ".5px", color: arenaMode ? N : "rgba(255,255,255,.35)" }}>
              ARENA VIEW
            </span>
            <button onClick={() => setArenaMode(v => !v)}
              style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                background: arenaMode ? N : "rgba(255,255,255,.12)", position: "relative",
                transition: "background .3s", flexShrink: 0 }}>
              <motion.div animate={{ x: arenaMode ? 22 : 2 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{ position: "absolute", top: 3, left: 0, width: 18, height: 18,
                  borderRadius: "50%", background: arenaMode ? "#000" : "rgba(255,255,255,.85)" }}/>
            </button>
          </div>
        )}

        {/* Live pulse + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <motion.div animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
              style={{ width: 7, height: 7, borderRadius: "50%", background: N, boxShadow: `0 0 7px ${N}` }}/>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: tvF(10), fontWeight: 700,
              color: N, letterSpacing: ".5px" }}>LIVE</span>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.06)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} style={{ color: "rgba(255,255,255,.6)" }}/>
          </button>
        </div>
      </div>

      {/* ── Mobile tab bar ────────────────────────────────────────────────── */}
      <div className="tv-mobtabs" style={{ display: "none", flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        {[{ id: "standings", label: "Standings" }, { id: "management", label: "Management" }].map(t => (
          <button key={t.id} onClick={() => setActiveCol(t.id)}
            style={{ flex: 1, padding: "10px", border: "none", background: "none", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", fontSize: tvF(12), fontWeight: 700,
              color: activeCol === t.id ? N : "rgba(255,255,255,.32)",
              borderBottom: activeCol === t.id ? `2px solid ${N}` : "2px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Two-column body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* Col A — Live Management (40%) — hidden in arena mode */}
        {!arenaMode && (
          <div className={`tv-col-a${activeCol === "management" ? " tv-active" : ""}`}
            style={{ width: "40%", flexShrink: 0, overflow: "auto",
              borderRight: "1px solid rgba(255,255,255,.06)",
              flexDirection: "column", display: "flex" }}>
            <div style={{ padding: "16px 16px 10px", fontFamily: "'Bebas Neue',sans-serif",
              fontSize: tvF(17), letterSpacing: "3px", color: "#fff", flexShrink: 0 }}>
              Live <span style={{ color: N }}>Management</span>
            </div>
            {colA}
          </div>
        )}

        {/* Col B — Live Standings (60% or fullscreen in theater) */}
        <div className={`tv-col-b${activeCol === "standings" ? " tv-active" : ""}`}
          style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column",
            width: arenaMode ? "100%" : undefined }}>
          <div style={{ padding: "16px 16px 10px", fontFamily: "'Bebas Neue',sans-serif",
            fontSize: tvF(17), letterSpacing: "3px", color: "#fff", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 12 }}>
            Live <span style={{ color: N }}>Standings</span>
            {arenaMode && (
              <span style={{ fontSize: tvF(11), fontWeight: 800, color: N,
                background: `${N}15`, border: `1px solid ${N}30`, borderRadius: 6,
                padding: "2px 10px", letterSpacing: "1.5px", fontFamily: "'DM Sans',sans-serif" }}>
                ARENA VIEW
              </span>
            )}
          </div>
          {colB}
        </div>
      </div>

      {/* ── Champion Celebration overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {champCelebration && (
          <ChampionCelebration
            key="champion-celebration"
            champion={champCelebration}
            isAdmin={isAdmin}
            onDismiss={() => setChampCelebration(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── BOTTOM NAV ── */
function BottomNav({active, onChange}) {
  const tabs = [
    {id:"home",    Icon:Home,     lbl:"Home"},
    {id:"stats",   Icon:BarChart2,lbl:"Stats"},
    {id:"league",  Icon:Users,    lbl:"League"},
    {id:"profile", Icon:User,     lbl:"Profile"},
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40"
      style={{background:"rgba(10,10,10,.96)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,.07)",maxWidth:430,margin:"0 auto",left:"50%",transform:"translateX(-50%)",width:"100%"}}>
      <div className="flex">
        {tabs.map(({id,Icon,lbl})=>(
          <button key={id} onClick={()=>onChange(id)} className="flex-1 flex flex-col items-center gap-1 py-3"
            style={{background:"none",border:"none",cursor:"pointer"}}>
            <Icon size={20} style={{color:active===id?N:"rgba(255,255,255,.28)"}} strokeWidth={active===id?2.5:1.8}/>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:".5px",color:active===id?N:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>{lbl.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── ROOT ── */
function LeagueItApp({ initialPlayers = INIT_PLAYERS, initialFeed = INIT_FEED, initialRules = null, leagueId = null, leagueName = "MY LEAGUE", user = null, onBack = null, ownerId = null, onDeleteLeague = null, profile = null, onProfileUpdate = null, squadPhotoUrl = null, onSquadPhotoUpdate = null, onAvatarUpdate = null, joinCode = null }) {
  const [activeTab,  setActiveTab]  = useState("home");
  const [showTVDash, setShowTVDash] = useState(false);
  const [players,    setPlayers]    = useState(initialPlayers);
  const [feed,       setFeed]       = useState(initialFeed);
  const [rules,    setRules]     = useState(initialRules || INIT_RULES);
  const rulesRef = useRef(initialRules || INIT_RULES);
  useEffect(() => { rulesRef.current = rules; }, [rules]);
  const [showLog,         setShowLog]         = useState(false);
  const [editMatch,       setEditMatch]       = useState(null);
  const [showAddPlayer,   setShowAddPlayer]   = useState(false);
  const [addPlayerName,   setAddPlayerName]   = useState("");
  const [showRemovePlayer,setShowRemovePlayer]= useState(false);

  // ── BRACKET STATE ──────────────────────────────────────────────────────────
  const [bracket,             setBracket]             = useState(initialRules?.bracket || null);
  const [showDrawReveal,      setShowDrawReveal]      = useState(false);
  const [pendingBracket,      setPendingBracket]      = useState(null);
  const [pendingGroups,       setPendingGroups]       = useState(null);
  const [pendingGroupMatches, setPendingGroupMatches] = useState(null);
  // Unified tournament match modal — holds { match, type: "bracket"|"group", contextLabel }
  const [tournamentModal, setTournamentModal] = useState(null);

  const isTournament = rules?.tournamentFormat && rules.tournamentFormat !== "classic";
  const isAdmin      = !!(user?.id && ownerId && user.id === ownerId);
  const groups       = rules?.groups       || [];
  const groupMatches = rules?.groupMatches || [];


  // Derive all stats from match history — single source of truth
  const enrichedPlayers = useMemo(()=>derivePlayerStats(players, feed),[players, feed]);
  const sortedPlayers   = useMemo(()=>byWins(enrichedPlayers),[enrichedPlayers]);

  // ── ON-MOUNT SYNC: pull fresh settings + matches from Supabase ───────────
  useEffect(() => {
    if (!leagueId) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: leagueRow, error: leagueErr }, { data: mData, error: matchErr }] = await Promise.all([
          supabase.from("leagues").select("settings, sport").eq("id", leagueId).maybeSingle(),
          supabase.from("matches").select("*").eq("league_id", leagueId).order("date", { ascending: false }),
        ]);
        if (leagueErr) console.error("[mount] leagues fetch error:", leagueErr);
        if (matchErr)  console.error("[mount] matches fetch error:", matchErr);
        // If both requests failed and env vars are missing, the client is misconfigured — reload to pick up fresh Vercel env vars
        if (leagueErr && matchErr && !supabaseConfigured) {
          console.warn("[mount] Supabase client misconfigured — reloading to pick up env vars");
          setTimeout(() => window.location.reload(), 800);
          return;
        }
        if (!alive) return;
        if (leagueRow?.settings) {
          const freshRules = settingsToRules(leagueRow.sport, leagueRow.settings);
          // Preserve groups/groupMatches from initialRules if the DB row doesn't carry them
          // (can happen when a settings write succeeded but didn't include groups)
          const mergedRules = {
            ...freshRules,
            groups:       freshRules.groups?.length       ? freshRules.groups       : (initialRules?.groups       || []),
            groupMatches: freshRules.groupMatches?.length ? freshRules.groupMatches : (initialRules?.groupMatches || []),
          };
          console.log("[mount] loaded rules — groups:", mergedRules.groups?.length, "groupMatches:", mergedRules.groupMatches?.length, "bracket:", !!mergedRules.bracket);
          setRules(mergedRules);
          setBracket(mergedRules.bracket || null);
        }
        if (mData) {
          setFeed(mData.map(m => ({ id: m.id, ...m.score })));
        }
      } catch (e) { console.error("[mount] sync failed:", e); }
    })();
    return () => { alive = false; };
  }, [leagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── BRACKET DRAW HANDLERS ─────────────────────────────────────────────────
  const handleShowGenerateDraw = useCallback(() => {
    const participants = rules?.participants || [];
    if (participants.length < 2) return;
    const isGroupsFormat = rules?.tournamentFormat === "groups_knockout";
    if (isGroupsFormat) {
      const { playersPerGroup } = rules?.groupSettings || { playersPerGroup: 4 };
      const { groups: g, groupMatches: gm } = generateGroupStage(participants, playersPerGroup);
      setPendingGroups(g);
      setPendingGroupMatches(gm);
      setPendingBracket(null);
    } else {
      const generated = generateKnockoutBracket(participants);
      setPendingBracket(generated);
      setPendingGroups(null);
      setPendingGroupMatches(null);
    }
    setShowDrawReveal(true);
  }, [rules]);

  const handleConfirmDraw = useCallback(async (drawData) => {
    if (!leagueId) return;
    const { data } = await supabase.from("leagues").select("settings").eq("id", leagueId).maybeSingle();
    const isGroups = rules?.tournamentFormat === "groups_knockout";
    if (isGroups) {
      const { groups: g, groupMatches: gm } = drawData;
      const newSettings = { ...(data?.settings || {}), groups: g, groupMatches: gm };
      await supabase.from("leagues").update({ settings: newSettings }).eq("id", leagueId);
      setRules(r => ({ ...r, groups: g, groupMatches: gm }));
    } else {
      const newSettings = { ...(data?.settings || {}), bracket: drawData };
      await supabase.from("leagues").update({ settings: newSettings }).eq("id", leagueId);
      setBracket(drawData);
      setRules(r => ({ ...r, bracket: drawData }));
    }
    setShowDrawReveal(false);
    setActiveTab("home");
  }, [leagueId, rules]);

  const _saveBracket = useCallback(async (updatedBracket) => {
    setBracket(updatedBracket);
    setRules(r => ({ ...r, bracket: updatedBracket }));
    try {
      const { data, error } = await supabase.from("leagues").select("settings").eq("id", leagueId).maybeSingle();
      if (error) throw error;
      const localRules = rulesRef.current;
      const dbSettings = data?.settings || {};
      // Never drop groups/groupMatches — prefer DB value, fall back to live local state
      const newSettings = {
        ...dbSettings,
        groups:       dbSettings.groups?.length       ? dbSettings.groups       : (localRules?.groups       || []),
        groupMatches: dbSettings.groupMatches?.length ? dbSettings.groupMatches : (localRules?.groupMatches || []),
        bracket:      updatedBracket,
      };
      await supabase.from("leagues").update({ settings: newSettings }).eq("id", leagueId);
    } catch (e) { console.error("[tournament] _saveBracket failed:", e); }
  }, [leagueId]);

  // Save both groups state and optionally bracket in one write
  const _saveGroupsState = useCallback(async (newGroups, newGroupMatches, newBracket) => {
    const localRules = rulesRef.current;
    const patch = {};
    if (newGroups !== undefined)       patch.groups       = newGroups;
    if (newGroupMatches !== undefined)  patch.groupMatches = newGroupMatches;
    if (newBracket !== undefined)       patch.bracket      = newBracket;
    // Optimistic local update first
    setRules(r => ({ ...r, ...patch }));
    if (newBracket !== undefined) setBracket(newBracket);
    try {
      const { data, error } = await supabase.from("leagues").select("settings").eq("id", leagueId).maybeSingle();
      if (error) throw error;
      const dbSettings = data?.settings || {};
      // Preserve existing groups from DB or local state — never silently drop them
      const newSettings = {
        ...dbSettings,
        groups:       patch.groups       ?? (dbSettings.groups?.length       ? dbSettings.groups       : (localRules?.groups       || [])),
        groupMatches: patch.groupMatches ?? (dbSettings.groupMatches?.length ? dbSettings.groupMatches : (localRules?.groupMatches || [])),
        ...(patch.bracket !== undefined ? { bracket: patch.bracket } : {}),
      };
      console.log("[saveGroupsState] writing settings — league_id:", leagueId, "keys:", Object.keys(newSettings));
      const { error: updateErr } = await supabase.from("leagues").update({ settings: newSettings }).eq("id", leagueId);
      if (updateErr) {
        console.error("[saveGroupsState] update failed", {
          message: updateErr.message,
          details: updateErr.details,
          hint:    updateErr.hint,
          code:    updateErr.code,
        });
      }
    } catch (e) {
      console.error("[saveGroupsState] unexpected error:", e);
    }
  }, [leagueId]);

  const handleGroupResult = useCallback(async ({ match, p1Goals, p2Goals }) => {
    if (!leagueId) { alert("League ID is missing — cannot save match."); return; }
    setTournamentModal(null);
    const ts = nowTs();
    const p1g = Number(p1Goals) || 0;
    const p2g = Number(p2Goals) || 0;
    const isDraw     = p1g === p2g;
    const p1Player   = players.find(p => p.name === match.p1?.name);
    const p2Player   = players.find(p => p.name === match.p2?.name);
    const winnerId   = isDraw ? null : (p1g > p2g ? p1Player?.id : p2Player?.id) || null;
    const loserId    = isDraw ? null : (p1g > p2g ? p2Player?.id : p1Player?.id) || null;
    const winnerName = isDraw ? match.p1?.name : (p1g > p2g ? match.p1?.name : match.p2?.name);
    const loserName  = isDraw ? match.p2?.name : (p1g > p2g ? match.p2?.name : match.p1?.name);

    const entry = {
      id: match.id,
      winner: winnerName, winnerIds: winnerId ? [winnerId] : [],
      loser:  loserName,  loserIds:  loserId  ? [loserId]  : [],
      sets: [`${p1g}–${p2g}`], sport: rules?.sportEmoji || "⚽",
      dateStr: ts.dateStr, timeStr: ts.timeStr, xp: 80, isComeback: false,
      groupLabel: `Group ${match.groupName}`,
      p1Name: match.p1?.name, p2Name: match.p2?.name,
      p1Goals: p1g, p2Goals: p2g, isDraw,
      is_tournament: true, tournament_stage: 'group',
    };
    setFeed(prev => [entry, ...prev.filter(m => m.id !== match.id)]);
    const { error: matchSaveErr } = await supabase.from("matches").upsert({
      id:        match.id,
      league_id: leagueId,
      winner_id: winnerId ?? null,
      loser_id:  loserId  ?? null,
      score:     entry,
      date:      new Date().toISOString(),
    });
    if (matchSaveErr) {
      console.error("[groupResult] save failed", {
        message: matchSaveErr.message,
        details: matchSaveErr.details,
        hint:    matchSaveErr.hint,
        code:    matchSaveErr.code,
      });
    }

    // Check if all group stage matches are now complete — if so, auto-generate knockout bracket
    const updatedFeed = [entry, ...feed.filter(m => m.id !== match.id)];
    const completedIds = new Set(updatedFeed.map(m => m.id));
    const allComplete  = groupMatches.length > 0 && groupMatches.every(m => completedIds.has(m.id));
    if (allComplete) {
      const advancingPerGroup = rules?.groupSettings?.advancingPerGroup || 2;
      const advancingByGroup = groups.map(g =>
        computeGroupStandings(g.participants, g.name, groupMatches, updatedFeed)
          .slice(0, advancingPerGroup)
          .map(s => s.participant)
      );
      const totalAdvancing = advancingByGroup.reduce((s, g) => s + g.length, 0);
      if (totalAdvancing >= 2) {
        const knockoutBracket = groups.length >= 2
          ? generateCrossoverBracket(advancingByGroup)
          : generateKnockoutBracket(advancingByGroup.flat());
        await _saveGroupsState(undefined, undefined, knockoutBracket);
      }
    }
  }, [leagueId, players, feed, groups, groupMatches, rules, _saveGroupsState]);

  const handleBracketResult = useCallback(async ({ match, winner, loser, p1Goals, p2Goals, leg, isLeg1Only }) => {
    if (!bracket || !leagueId) { alert("League ID is missing — cannot save match."); return; }
    setTournamentModal(null);

    // Compute round label for feed display
    const totalRounds = bracket.rounds.length;
    const bracketRoundLabel = match.round === totalRounds ? "FINAL"
      : match.round === totalRounds - 1 && totalRounds > 2 ? "SEMI-FINAL"
      : match.round === totalRounds - 2 && totalRounds > 3 ? "QTR-FINAL"
      : `ROUND ${match.round}`;

    if (isLeg1Only) {
      const updated = applyBracketLeg(bracket, match.id, 1, {
        p1Goals: p1Goals || "0", p2Goals: p2Goals || "0",
      });
      await _saveBracket(updated);
      return;
    }

    if (leg === 2) {
      const updated = applyBracketLeg(bracket, match.id, 2, {
        p1Goals: p1Goals || "0", p2Goals: p2Goals || "0",
      });
      await _saveBracket(updated);
      if (winner && loser) {
        const ts = nowTs();
        const leg1 = match.leg1;
        const scoreStr = `[${leg1?.p1Goals||0}–${leg1?.p2Goals||0}, ${p1Goals||0}–${p2Goals||0}] Agg`;
        const winnerId = players.find(p => p.name === winner.name)?.id || null;
        const loserId  = players.find(p => p.name === loser.name)?.id  || null;
        const entry = { id: match.id, winner: winner.name, winnerIds: winnerId ? [winnerId] : [],
          loser: loser.name, loserIds: loserId ? [loserId] : [], sets: [scoreStr],
          sport: "🏆", dateStr: ts.dateStr, timeStr: ts.timeStr, xp: 110, isComeback: false,
          bracketMatchId: match.id, bracketRound: match.round, bracketRoundLabel,
          is_tournament: true, tournament_stage: bracketRoundLabel };
        setFeed(prev => [entry, ...prev.filter(m => m.id !== match.id)]);
        const { id: _l2id, ...scoreData2 } = entry;
        try {
          await supabase.from("matches").insert({
            league_id: leagueId,
            winner_id: winnerId,
            loser_id: loserId,
            score: scoreData2,
            date: new Date().toISOString(),
          });
        } catch (e) { console.error("[tournament] leg-2 match save failed:", e); }
      }
      return;
    }

    // Single-leg result
    if (!winner) return;
    const ts = nowTs();
    const scoreStr = (p1Goals !== "" && p2Goals !== "") ? `${p1Goals}–${p2Goals}` : "1–0";
    const winnerId = players.find(p => p.name === winner.name)?.id || null;
    const loserId  = players.find(p => p.name === loser?.name)?.id  || null;
    const entry = {
      id: match.id, winner: winner.name, winnerIds: winnerId ? [winnerId] : [],
      loser: loser?.name || "—", loserIds: loserId ? [loserId] : [],
      sets: [scoreStr], sport: "🏆",
      dateStr: ts.dateStr, timeStr: ts.timeStr, xp: 110, isComeback: false,
      bracketMatchId: match.id, bracketRound: match.round, bracketRoundLabel,
      is_tournament: true, tournament_stage: bracketRoundLabel,
    };
    setFeed(prev => [entry, ...prev.filter(m => m.id !== match.id)]);
    try {
      await supabase.from("matches").upsert({
        id:        match.id,
        league_id: leagueId,
        winner_id: winnerId,
        loser_id:  loserId ?? null,
        score:     entry,
        date:      new Date().toISOString(),
      });
    } catch (e) { console.error("[tournament] bracket match save failed:", e); }
    const updated = applyBracketResult(bracket, match.id, winner, { p1Goals: Number(p1Goals)||0, p2Goals: Number(p2Goals)||0 });
    await _saveBracket(updated);
  }, [bracket, leagueId, players, _saveBracket]);

  const handleSubmit = useCallback(async ({winners,losers,sets,editId,isComeback=false})=>{
    const filled=sets.filter(s=>s.w!==""&&s.l!=="").map(s=>`${s.w}–${s.l}`);
    if (!filled.length) return;
    const ts=nowTs();

    const wPlayers=winners.map(id=>players.find(p=>p.id===id)).filter(Boolean);
    const lPlayers=losers.map(id=>players.find(p=>p.id===id)).filter(Boolean);
    if(!wPlayers.length||!lPlayers.length) return;
    const winnerStr=wPlayers.map(p=>p.name).join(" & ");
    const loserStr =lPlayers.map(p=>p.name).join(" & ");
    const matchId  =editId||crypto.randomUUID();
    const entry={id:matchId,winner:winnerStr,winnerIds:winners,loser:loserStr,loserIds:losers,sets:filled,sport:wPlayers[0].sport,dateStr:ts.dateStr,timeStr:ts.timeStr,xp:110,isComeback:!!isComeback};

    // Optimistic update — standings recalculate instantly from feed via derivePlayerStats
    setFeed(prev=>editId?prev.map(m=>m.id===editId?entry:m):[entry,...prev]);

    // Persist to Supabase (awaited — matches table is the source of truth for standings)
    if (leagueId) {
      try {
        await supabase.from("matches").upsert({
          id:          matchId,
          league_id:   leagueId,
          winner_id:   winners[0],
          loser_id:    losers[0],
          is_comeback: !!isComeback,
          score:       { sets:filled, winnerIds:winners, loserIds:losers, winner:winnerStr, loser:loserStr, sport:wPlayers[0]?.sport, dateStr:ts.dateStr, timeStr:ts.timeStr, xp:110, isComeback:!!isComeback },
          date:        new Date().toISOString(),
        });
      } catch {
        // Revert optimistic feed update on failure
        setFeed(prev=>editId?prev:prev.filter(m=>m.id!==matchId));
      }
    }
  },[players, leagueId]);

  // ── JOIN AS PLAYER (admin self-enroll) ──────────────────────────────────
  const handleJoinAsPlayer = useCallback(async () => {
    if (!user || !leagueId) return;
    if (players.some(p => p.isMe)) return; // already enrolled
    const displayName = profile?.display_name || user.user_metadata?.full_name || user.email || "Player";
    const initials    = displayName.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").slice(0, 2).join("") || "??";
    const newId       = crypto.randomUUID();
    try {
      await supabase.from("players").insert({
        id: newId, league_id: leagueId, user_id: user.id, name: displayName, is_me: true,
        stats: { initials, wins:0, losses:0, streak:0, totalPlayed:0, trend:"flat", sport:"🏸",
          mvTrend:[0,0,0,0,0,0,0], partners:{}, clutchWins:0, bestStreak:0 },
      });
      setPlayers(prev => [...prev, {
        id: newId, name: displayName, initials, isMe: true,
        wins:0, losses:0, streak:0, totalPlayed:0, trend:"flat", sport:"🏸",
        mvTrend:[0,0,0,0,0,0,0], partners:{}, clutchWins:0, bestStreak:0,
        gamesWon:0, gamesLost:0, comebacks:0,
      }]);
    } catch { /* silently fail */ }
  }, [user, leagueId, players, profile]);

  // ── ADD PLAYER ──────────────────────────────────────────────────────────
  const handleAddPlayer = useCallback(()=>{
    setAddPlayerName("");
    setShowAddPlayer(true);
  },[]);

  const confirmAddPlayer = useCallback(()=>{
    const name = addPlayerName.trim();
    if (!name) return;
    const words    = name.split(/\s+/);
    const initials = words.map(w=>(w[0]||"").toUpperCase()).slice(0,2).join('');
    const newPlayer = {
      id:          crypto.randomUUID(),
      name,
      initials,
      isMe:        false,
      wins:        0,
      losses:      0,
      streak:      0,
      totalPlayed: 0,
      trend:       'flat',
      sport:       '🏸',
      mvTrend:     [0,0,0,0,0,0,0],
      partners:    {},
      clutchWins:  0,
      bestStreak:  0,
    };
    setPlayers(prev=>[...prev, newPlayer]);
    setShowAddPlayer(false);
    if (leagueId) {
      supabase.from("players").insert({
        id:        newPlayer.id,
        league_id: leagueId,
        name:      newPlayer.name,
        is_me:     false,
        stats:     playerToStats(newPlayer),
      }).then(() => {}).catch(() => {});
    }
  },[addPlayerName, leagueId]);

  // ── REMOVE PLAYER ────────────────────────────────────────────────────────
  const handleRemovePlayer = useCallback(()=>{
    if (!players.filter(p=>!p.isMe).length) return;
    setShowRemovePlayer(true);
  },[players]);

  const confirmRemovePlayer = useCallback((target)=>{
    setPlayers(prev=>prev.filter(p=>p.id!==target.id));
    setFeed(prev=>prev.filter(m=>
      !m.winnerIds?.includes(target.id) && !m.loserIds?.includes(target.id)
    ));
    setShowRemovePlayer(false);
    if (leagueId) {
      supabase.from("players").delete().eq("id", target.id).then(() => {}).catch(() => {});
    }
  },[leagueId]);

  const handleEdit = useCallback(m=>{
    setEditMatch({id:m.id,winnerIds:m.winnerIds||[],loserIds:m.loserIds||[],sets:m.sets});
    setShowLog(true);
  },[]);

  const handleDeleteMatch = useCallback(async (matchId) => {
    // Optimistic removal — standings/awards recalculate from updated feed
    setFeed(prev => prev.filter(m => m.id !== matchId));
    if (leagueId) {
      try {
        await supabase.from("matches").delete().eq("id", matchId);
      } catch {
        // Nothing to revert — stale entry silently dropped; next load will re-sync
      }
    }
  }, [leagueId]);

  // Returns the human-readable round label for a bracket match (used in modal header)
  const _bracketRoundLabel = (bkt, match) => {
    if (!bkt?.rounds) return "";
    const n = bkt.rounds.length;
    const fromEnd = n - match.round;
    if (fromEnd === 0) return "FINAL";
    if (fromEnd === 1 && n > 1) return "SEMI-FINAL";
    if (fromEnd === 2 && n > 2) return "QUARTER-FINAL";
    const playersAtRound = bkt.rounds[match.round - 1]?.length * 2 || 0;
    return playersAtRound ? `ROUND OF ${playersAtRound}` : `ROUND ${match.round}`;
  };

  const myPlayer = players.find(p => p.isMe);
  const content = {
    home:    <HomeTab
               players={enrichedPlayers} feed={feed}
               onEditFeed={handleEdit} onDeleteFeed={handleDeleteMatch}
               isAdmin={isAdmin} myPlayerId={myPlayer?.id || null}
               isTournament={isTournament} tournamentFormat={rules?.tournamentFormat || "classic"}
               bracket={bracket} onMatchTap={m => setTournamentModal({ match: m, type: "bracket", contextLabel: _bracketRoundLabel(bracket, m) })}
               onGenerateDraw={handleShowGenerateDraw} matchLegs={rules?.matchLegs || 1}
               groups={groups} groupMatches={groupMatches}
               onGroupMatchTap={m => setTournamentModal({ match: m, type: "group", contextLabel: `Group ${m.groupName}` })}
               advancingPerGroup={rules?.groupSettings?.advancingPerGroup || 2}
             />,
    stats:   <StatsTab   players={enrichedPlayers} feed={feed} isTournament={isTournament} groupMatches={groupMatches} bracket={bracket}/>,
    league:  <LeagueTab  players={enrichedPlayers} feed={feed} rules={rules} onRulesUpdate={setRules} onResetSeason={()=>{setPlayers([]);setFeed([]);}} onAddPlayer={handleAddPlayer} onRemovePlayer={handleRemovePlayer} onJoinAsPlayer={handleJoinAsPlayer} leagueId={leagueId} ownerId={ownerId} user={user} onDeleteLeague={onDeleteLeague} squadPhotoUrl={squadPhotoUrl} onSquadPhotoUpdate={onSquadPhotoUpdate} joinCode={joinCode} bracket={bracket} onGenerateDraw={handleShowGenerateDraw}/>,
    profile: isAdmin && !myPlayer
      ? <AdminDashboard players={enrichedPlayers} feed={feed} rules={rules} bracket={bracket} groups={groups} groupMatches={groupMatches}/>
      : <ProfileTab players={enrichedPlayers} feed={feed} user={user} profile={profile} onProfileUpdate={async (n)=>{ await onProfileUpdate?.(n); const ini=n.trim().split(/\s+/).map(w=>w[0].toUpperCase()).slice(0,2).join(""); setPlayers(prev=>prev.map(p=>p.isMe?{...p,name:n.trim(),initials:ini}:p)); }} onAvatarUpdate={onAvatarUpdate}/>,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;background:#0A0A0A;}
        ::-webkit-scrollbar{display:none;}
        input,button,textarea{-webkit-tap-highlight-color:transparent;}
      `}</style>
      <div style={{minHeight:"100vh",background:BG,color:"#fff",display:"flex",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        <GridBg/><GlowBlobs/>
        <div style={{width:"100%",maxWidth:430,minHeight:"100vh",display:"flex",flexDirection:"column",position:"relative",zIndex:1}}>
          {/* HEADER */}
          <motion.header initial={{y:-20,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:.1}}
            className="sticky top-0 z-30 flex-shrink-0"
            style={{background:"rgba(10,10,10,.93)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,.07)",padding:"14px 20px"}}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {onBack&&(
                  <button onClick={onBack}
                    className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
                    style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)"}}>
                    <ChevronLeft size={16} style={{color:"rgba(255,255,255,.7)"}}/>
                  </button>
                )}
                <div className="min-w-0">
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:"3px",color:N,textShadow:"0 0 20px rgba(170,255,0,.4)",lineHeight:1}}>LEAGUE-IT</div>
                  <div style={{fontSize:9,color:"#C1FF00",fontFamily:"'DM Sans',sans-serif",letterSpacing:"2px",fontWeight:800,marginTop:2,textShadow:"0 0 10px rgba(193,255,0,.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{leagueName}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isAdmin && (
                  <button onClick={() => setShowTVDash(true)}
                    title="TV Dashboard"
                    className="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{ background: `${N}14`, border: `1px solid ${N}35` }}>
                    <LayoutDashboard size={16} style={{ color: N }}/>
                  </button>
                )}
                {(profile?.avatar_url || user?.user_metadata?.avatar_url)
                  ? <img src={profile?.avatar_url || user.user_metadata.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" style={{border:`2px solid ${N}44`}}/>
                  : <div className="flex items-center justify-center rounded-full w-9 h-9 text-[11px] font-black"
                      style={{background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",fontFamily:"'DM Sans',sans-serif"}}>
                      {(profile?.display_name||user?.user_metadata?.full_name||user?.email||"YO").trim().split(/\s+/).map(w=>w[0].toUpperCase()).slice(0,2).join("")}
                    </div>
                }
              </div>
            </div>
          </motion.header>

          {/* CONTENT */}
          <div className="flex-1 overflow-y-auto pb-24" style={{WebkitOverflowScrolling:"touch"}}>
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:.22}}>
                {content[activeTab]}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* FAB — hidden in tournament mode (all fixtures are pre-generated) */}
          {activeTab==="home"&&!isTournament&&(
            <div className="fixed z-30" style={{bottom:80,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 40px)",maxWidth:390}}>
              <motion.button onClick={()=>{setEditMatch(null);setShowLog(true);}}
                whileHover={{scale:1.03,y:-3}} whileTap={{scale:.96}}
                className="flex items-center justify-center gap-3 rounded-[22px] py-4 font-black text-base relative overflow-hidden w-full"
                style={{fontFamily:"'DM Sans',sans-serif",background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",border:"none",boxShadow:"0 8px 28px rgba(170,255,0,.36)"}}>
                <div className="absolute inset-0 pointer-events-none" style={{background:"linear-gradient(135deg,rgba(255,255,255,.16),transparent 55%)"}}/>
                <Plus size={20} strokeWidth={2.8} style={{position:"relative"}}/><span style={{position:"relative"}}>Log Match</span>
              </motion.button>
            </div>
          )}

          <BottomNav active={activeTab} onChange={setActiveTab}/>
        </div>
      </div>

      <AnimatePresence>
        {showLog&&(
          <LogModal key="modal" players={sortedPlayers} prefill={editMatch}
            onClose={()=>{setShowLog(false);setEditMatch(null);}}
            onSubmit={handleSubmit}/>
        )}

        {showTVDash && (
          <TVDashboard
            key="tv-dashboard"
            players={enrichedPlayers}
            feed={feed}
            rules={rules}
            bracket={bracket}
            groups={groups}
            groupMatches={groupMatches}
            leagueId={leagueId}
            leagueName={leagueName}
            isAdmin={isAdmin}
            onClose={() => setShowTVDash(false)}
            onGroupResult={handleGroupResult}
            onSyncEntry={entry => setFeed(prev => [entry, ...prev.filter(m => m.id !== entry.id)])}
            onBracketMatchTap={m => setTournamentModal({ match: m, type: "bracket", contextLabel: _bracketRoundLabel(bracket, m) })}
          />
        )}

        {showDrawReveal && (pendingBracket || pendingGroups?.length > 0) && (
          <DrawRevealOverlay
            key="draw-reveal"
            groups={pendingGroups || []}
            bracket={pendingBracket}
            tournFormat={rules?.tournamentFormat}
            leagueName={leagueName}
            leagueId={leagueId}
            isAdmin={isAdmin}
            onConfirm={async () => {
              await handleConfirmDraw(
                pendingGroups
                  ? { groups: pendingGroups, groupMatches: pendingGroupMatches }
                  : pendingBracket
              );
            }}
          />
        )}

        {tournamentModal && (
          <TournamentLogModal
            key="tournament-log"
            match={tournamentModal.match}
            matchType={tournamentModal.type}
            matchLegs={rules?.matchLegs || 1}
            contextLabel={tournamentModal.contextLabel}
            onGroupResult={handleGroupResult}
            onBracketResult={handleBracketResult}
            onClose={() => setTournamentModal(null)}
          />
        )}

        {showAddPlayer&&(
          <motion.div key="add-player-backdrop"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{background:"rgba(0,0,0,.78)",backdropFilter:"blur(12px)"}}
            onClick={e=>{if(e.target===e.currentTarget)setShowAddPlayer(false);}}>
            <motion.div
              initial={{y:"100%",opacity:0}} animate={{y:0,opacity:1}} exit={{y:"100%",opacity:0}}
              transition={{type:"spring",stiffness:320,damping:34}}
              className="w-full rounded-t-[28px] overflow-hidden"
              style={{maxWidth:430,background:"#111318",border:"1.5px solid rgba(255,255,255,.08)",borderBottom:"none"}}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{background:"rgba(255,255,255,.15)"}}/></div>
              <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:"1px solid rgba(255,255,255,.07)"}}>
                <div>
                  <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:"2px",color:"#fff"}}>
                    Add <span style={{color:N}}>Player</span>
                  </h3>
                  <p style={{fontSize:11,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>They&apos;ll appear on the leaderboard immediately.</p>
                </div>
                <button onClick={()=>setShowAddPlayer(false)}
                  className="flex items-center justify-center w-8 h-8 rounded-full"
                  style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)"}}>
                  <X size={15} style={{color:"rgba(255,255,255,.55)"}}/>
                </button>
              </div>
              <div className="px-5 pt-5 pb-8">
                <input
                  autoFocus
                  type="text"
                  value={addPlayerName}
                  onChange={e=>setAddPlayerName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&confirmAddPlayer()}
                  placeholder="e.g. Alex Silva"
                  maxLength={32}
                  className="w-full rounded-[16px] px-4 py-4 mb-5 outline-none text-sm font-bold"
                  style={{
                    fontFamily:"'DM Sans',sans-serif",
                    background:"rgba(255,255,255,.05)",
                    border:`1.5px solid ${addPlayerName.trim()?N:"rgba(255,255,255,.12)"}`,
                    color:"#fff", caretColor:N,
                    boxShadow:addPlayerName.trim()?"0 0 18px rgba(170,255,0,.1)":"none",
                  }}
                />
                <PBtn onClick={confirmAddPlayer} disabled={!addPlayerName.trim()}>
                  {addPlayerName.trim()?`Add "${addPlayerName.trim()}" to League`:"Enter a Name First"}
                </PBtn>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showRemovePlayer&&(
          <motion.div key="remove-player-backdrop"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{background:"rgba(0,0,0,.78)",backdropFilter:"blur(12px)"}}
            onClick={e=>{if(e.target===e.currentTarget)setShowRemovePlayer(false);}}>
            <motion.div
              initial={{y:"100%",opacity:0}} animate={{y:0,opacity:1}} exit={{y:"100%",opacity:0}}
              transition={{type:"spring",stiffness:320,damping:34}}
              className="w-full rounded-t-[28px] overflow-hidden"
              style={{maxWidth:430,background:"#111318",border:"1.5px solid rgba(255,255,255,.08)",borderBottom:"none"}}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{background:"rgba(255,255,255,.15)"}}/></div>
              <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:"1px solid rgba(255,255,255,.07)"}}>
                <div>
                  <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:"2px",color:"#fff"}}>
                    Remove <span style={{color:"#FF3355"}}>Player</span>
                  </h3>
                  <p style={{fontSize:11,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>All their matches will also be removed from the feed.</p>
                </div>
                <button onClick={()=>setShowRemovePlayer(false)}
                  className="flex items-center justify-center w-8 h-8 rounded-full"
                  style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)"}}>
                  <X size={15} style={{color:"rgba(255,255,255,.55)"}}/>
                </button>
              </div>
              <div className="px-5 pt-4 pb-8 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                {players.filter(p=>!p.isMe).map(p=>(
                  <button key={p.id} onClick={()=>confirmRemovePlayer(p)}
                    className="flex items-center gap-3 w-full rounded-[14px] px-4 py-3 text-left transition-all hover:brightness-110"
                    style={{background:"rgba(255,51,85,.05)",border:"1.5px solid rgba(255,51,85,.18)",cursor:"pointer"}}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                      style={{background:pg(p),color:"#000"}}>{p.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div style={{fontSize:14,fontWeight:700,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>{p.name}</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{p.wins}W · {p.losses}L · {p.totalPlayed} played</div>
                    </div>
                    <UserMinus size={16} style={{color:"#FF3355",flexShrink:0}}/>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ══════════════════════════════════════════════
   ONBOARDING FLOW
══════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// ONBOARDING CONSTANTS
// ─────────────────────────────────────────────
const NEON = N; // alias — same neon as app section

const SPORTS = [
  { id: "padel",        label: "Padel",      emoji: "🏸" },
  { id: "footvolley",   label: "Footvolley", emoji: "🏖️" },
  { id: "volleyball",   label: "Volleyball", emoji: "🏐" },
  { id: "tennis",       label: "Tennis",     emoji: "🎾" },
  { id: "pingpong",     label: "Ping Pong",  emoji: "🏓" },
  { id: "fifa",         label: "FIFA",       emoji: "🎮" },
  { id: "custom_sport", label: "Custom",     emoji: "⚙️" },
];

const CUSTOM_SPORT_EMOJIS = [
  "⚽","🏀","🏈","⚾","🏐","🏉","🎾","🏒","🏑","🥍","🏏","🎱","🏓","🏸",
  "🥊","🥋","🤸","🏋️","🚴","🏊","🧗","🤺","🎯","🎳","🛹","🏆","🔥","⚡",
];

const FORMATS = [
  { id: "goals",        label: "High Score",     Icon: Trophy,   desc: "Most goals or points at the end of regulated time."          },
  { id: "sets",         label: "Sets & Matches", Icon: Layers,   desc: "Standard set-based format for Tennis, Padel, or Volleyball." },
  { id: "points",       label: "Target Score",   Icon: Target,   desc: "First to reach a specific score wins (e.g., 21 points)."     },
  { id: "custom_logic", label: "Custom Format",  Icon: Settings, desc: "Describe your own specific house rules."                     },
];

const PT_PRESETS = [11, 15, 21];

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
const generateNumericPin = () => String(Math.floor(Math.random() * 900000 + 100000));

// ─────────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────────
const pageVariants = {
  enter:  (dir) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0   }),
  center:            { x: 0,                           opacity: 1   },
  exit:   (dir) => ({ x: dir > 0 ? "-60%"  : "60%",  opacity: 0   }),
};
const pageTransition = {
  type: "spring", stiffness: 320, damping: 36, mass: 0.85,
};

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show:   { opacity: 1, y: 0,  transition: { type: "spring", stiffness: 260, damping: 22 } },
};
const stagger = (delay = 0) => ({
  hidden: {},
  show:   { transition: { staggerChildren: 0.1, delayChildren: delay } },
});

// ─────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────
function ProgressBar({ step, total }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="relative flex-1 rounded-full overflow-hidden"
          style={{ height: 3, background: "rgba(255,255,255,0.08)" }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: NEON, boxShadow: `0 0 8px ${NEON}60` }}
            initial={false}
            animate={{ width: i <= step - 1 ? "100%" : "0%" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// TOP NAV (wizard header)
// ─────────────────────────────────────────────
function TopNav({ step, total, onBack }) {
  return (
    <div className="px-5 pt-5 pb-3 relative z-20 flex-shrink-0">
      <ProgressBar step={step} total={total} />
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 13, fontWeight: 600,
          }}
        >
          <ChevronLeft size={15} />
          Back
        </button>
        <span
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "2.5px",
            color: "rgba(255,255,255,0.22)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          STEP {step} OF {total}
        </span>
        <div className="w-[68px]" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRIMARY BUTTON
// ─────────────────────────────────────────────
function PrimaryBtn({ children, onClick, disabled = false, icon: Icon }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.018, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className="relative w-full overflow-hidden rounded-2xl py-[17px] font-black text-base tracking-wide transition-colors"
      style={{
        fontFamily: "'DM Sans', sans-serif",
        background: disabled
          ? "rgba(170,255,0,0.1)"
          : `linear-gradient(135deg, ${NEON} 0%, #7DC900 100%)`,
        color:  disabled ? "rgba(170,255,0,0.28)" : "#000",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 8px 28px rgba(170,255,0,0.32), 0 2px 8px rgba(0,0,0,0.5)",
        fontSize: 15,
      }}
    >
      {!disabled && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.16), transparent 55%)" }}
        />
      )}
      <span className="relative flex items-center justify-center gap-2">
        {children}
        {!disabled && Icon && <Icon size={16} />}
        {!disabled && !Icon && <ArrowRight size={16} />}
      </span>
    </motion.button>
  );
}

// ─────────────────────────────────────────────
// FIXED FOOTER (gradient fade + CTA)
// ─────────────────────────────────────────────
function FixedFooter({ children }) {
  return (
    <div
      className="flex-shrink-0 px-5 pb-8 pt-5"
      style={{ background: `linear-gradient(to top, ${BG} 55%, transparent)` }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP HEADING
// ─────────────────────────────────────────────
function StepHeading({ line1, line2, sub }) {
  return (
    <motion.div variants={fadeUp} className="mb-6">
      <h2
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 44, letterSpacing: "2px",
          lineHeight: 1.02, color: "#fff",
          marginBottom: 2,
        }}
      >
        {line1}
        {line2 && (
          <>
            <br />
            <span style={{ color: NEON, textShadow: `0 0 28px rgba(170,255,0,0.4)` }}>
              {line2}
            </span>
          </>
        )}
      </h2>
      {sub && (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.65, marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
          {sub}
        </p>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// STEP 0 — LANDING
// ─────────────────────────────────────────────
function StepLanding({ onNext, onSignIn = null, hasPendingJoin = false }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center relative z-10">
      <motion.div
        variants={stagger(0)}
        initial="hidden"
        animate="show"
        className="flex flex-col items-center w-full max-w-[340px]"
      >
        {/* Badge */}
        <motion.div variants={fadeUp} className="mb-6">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-[2px]"
            style={{
              background: "rgba(170,255,0,0.08)",
              border: "1px solid rgba(170,255,0,0.22)",
              color: "rgba(170,255,0,0.8)",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <Sparkles size={10} color={NEON} />
            SPORTS LEAGUE MANAGER
          </span>
        </motion.div>

        {/* Logo */}
        <motion.div variants={fadeUp}>
          <motion.h1
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(64px, 18vw, 80px)",
              letterSpacing: "8px",
              lineHeight: 1,
              color: NEON,
              userSelect: "none",
            }}
            animate={{
              textShadow: [
                "0 0 40px rgba(170,255,0,0.45), 0 0 80px rgba(170,255,0,0.18)",
                "0 0 65px rgba(170,255,0,0.72), 0 0 130px rgba(170,255,0,0.32)",
                "0 0 40px rgba(170,255,0,0.45), 0 0 80px rgba(170,255,0,0.18)",
              ],
            }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          >
            LEAGUE-IT
          </motion.h1>
        </motion.div>

        {/* Divider */}
        <motion.div variants={fadeUp} className="flex items-center gap-3 my-5 w-full">
          <div className="flex-1 h-px" style={{ background: "rgba(170,255,0,0.18)" }} />
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "3px", color: "rgba(170,255,0,0.45)", fontFamily: "'DM Sans', sans-serif" }}>
            THE GAME IS ON
          </span>
          <div className="flex-1 h-px" style={{ background: "rgba(170,255,0,0.18)" }} />
        </motion.div>

        {/* Tagline */}
        <motion.div variants={fadeUp} className="mb-12">
          <p
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 32, letterSpacing: "2.5px",
              color: "rgba(255,255,255,0.88)", lineHeight: 1.2,
            }}
          >
            The table
          </p>
          <p
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 32, letterSpacing: "2.5px",
              color: "rgba(255,255,255,0.88)", lineHeight: 1.2,
            }}
          >
            doesn&apos;t lie.
          </p>
        </motion.div>

        {/* Sport pills */}
        <motion.div variants={fadeUp} className="flex flex-wrap gap-2 justify-center mb-12">
          {["🏸 Padel", "🏖️ Footvolley", "🏐 Volleyball", "🎾 Tennis", "🏓 Ping Pong", "🎮 FIFA"].map((s) => (
            <span
              key={s}
              style={{
                padding: "5px 13px",
                borderRadius: 24,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(255,255,255,0.045)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.42)",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {s}
            </span>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div variants={fadeUp} className="w-full">
          <motion.button
            onClick={onSignIn || onNext}
            whileHover={{ scale: 1.018, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="relative w-full overflow-hidden rounded-2xl py-[17px] font-black text-base tracking-wide"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              background: `linear-gradient(135deg, ${NEON} 0%, #7DC900 100%)`,
              color: "#000",
              cursor: "pointer",
              boxShadow: "0 8px 28px rgba(170,255,0,0.32), 0 2px 8px rgba(0,0,0,0.5)",
              fontSize: 15,
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.16), transparent 55%)" }}
            />
            <span className="relative flex items-center justify-center gap-2.5">
              {/* Google "G" logo */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#000" fillOpacity=".55"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#000" fillOpacity=".55"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#000" fillOpacity=".55"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#000" fillOpacity=".55"/>
              </svg>
              {hasPendingJoin ? "Join League & Get Started" : "Continue with Google"}
            </span>
          </motion.button>

          <p
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "rgba(255,255,255,0.32)",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              textAlign: "center",
              letterSpacing: "0.2px",
            }}
          >
            Log in or sign up — free forever.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 1 — SPORT SELECTION
// ─────────────────────────────────────────────
function StepSport({ sport, setSport, customSportName, setCustomSportName, customSportEmoji, setCustomSportEmoji, onNext }) {
  const isCustom    = sport === "custom_sport";
  const canContinue = !!sport && (!isCustom || customSportName.trim().length > 0);
  const customRef   = useRef(null);
  const emojiRef    = useRef(null);

  useEffect(() => {
    if (isCustom) setTimeout(() => customRef.current?.focus(), 120);
  }, [isCustom]);

  const label = canContinue
    ? `Continue with ${isCustom ? customSportName.trim() : SPORTS.find(s => s.id === sport)?.label}`
    : "Select a Sport to Continue";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <StepHeading
            line1="Choose Your"
            line2="Sport"
            sub="The rules engine adapts automatically to your selection."
          />

          {/* Grid */}
          <div className="grid grid-cols-2 gap-3">
            {SPORTS.map((s, _i) => {
              const selected = sport === s.id;
              return (
                <motion.button
                  key={s.id}
                  variants={fadeUp}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSport(s.id);
                    if (s.id !== "custom_sport") setCustomSportName("");
                  }}
                  className="relative flex flex-col items-center justify-center text-center rounded-[22px] py-6 px-3 transition-all"
                  style={{
                    gridColumn: s.id === "custom_sport" ? "span 2" : undefined,
                    background: selected ? "rgba(170,255,0,0.07)" : "rgba(255,255,255,0.03)",
                    border: selected
                      ? `1.5px solid ${NEON}`
                      : "1.5px solid rgba(255,255,255,0.07)",
                    boxShadow: selected
                      ? "0 0 30px rgba(170,255,0,0.18), 0 0 70px rgba(170,255,0,0.07)"
                      : "none",
                  }}
                >
                  <AnimatePresence>
                    {selected && (
                      <motion.div
                        key="check"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 20 }}
                        className="absolute top-2.5 right-2.5 flex items-center justify-center rounded-full w-5 h-5"
                        style={{ background: NEON }}
                      >
                        <Check size={11} color="#000" strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <span className="text-4xl mb-3 leading-none">
                    {s.id === "custom_sport" && isCustom
                      ? (customSportEmoji || s.emoji)
                      : s.emoji}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 17, letterSpacing: "1px", color: "#fff",
                    }}
                  >
                    {s.id === "custom_sport" && isCustom && customSportName.trim()
                      ? customSportName.trim()
                      : s.label}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Custom sport inputs */}
          <AnimatePresence>
            {isCustom && (
              <motion.div
                key="custom-input"
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 14 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                {/* Sport Name */}
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(170,255,0,0.6)", fontFamily: "'DM Sans', sans-serif", marginBottom: 6, textTransform: "uppercase" }}>
                  Sport Name
                </p>
                <input
                  ref={customRef}
                  type="text"
                  value={customSportName}
                  onChange={(e) => setCustomSportName(e.target.value)}
                  placeholder="e.g. Street Tennis, Spikeball…"
                  maxLength={32}
                  className="w-full rounded-[16px] px-4 py-4 text-sm font-bold outline-none mb-4"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${customSportName.trim() ? NEON : "rgba(170,255,0,0.38)"}`,
                    color: "#fff",
                    caretColor: NEON,
                    fontFamily: "'DM Sans', sans-serif",
                    boxShadow: customSportName.trim() ? "0 0 20px rgba(170,255,0,0.12)" : "0 0 12px rgba(170,255,0,0.06)",
                  }}
                />

                {/* Emoji Picker */}
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(170,255,0,0.6)", fontFamily: "'DM Sans', sans-serif", marginBottom: 6, textTransform: "uppercase" }}>
                  Sport Emoji
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {CUSTOM_SPORT_EMOJIS.map(e => {
                    const active = customSportEmoji === e;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setCustomSportEmoji(e)}
                        className="flex items-center justify-center rounded-[10px] transition-all"
                        style={{
                          width: 40, height: 40, fontSize: 20,
                          background: active ? "rgba(170,255,0,0.15)" : "rgba(255,255,255,0.05)",
                          border: active ? `1.5px solid ${NEON}` : "1.5px solid rgba(255,255,255,0.08)",
                          boxShadow: active ? "0 0 12px rgba(170,255,0,0.2)" : "none",
                          cursor: "pointer",
                        }}
                      >
                        {e}
                      </button>
                    );
                  })}
                </div>

                {/* Custom emoji text input */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      ref={emojiRef}
                      type="text"
                      value={CUSTOM_SPORT_EMOJIS.includes(customSportEmoji) ? "" : customSportEmoji}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) setCustomSportEmoji([...val].slice(0, 1).join(""));
                      }}
                      placeholder="Or paste your own…"
                      className="w-full rounded-[14px] px-4 py-3 text-sm outline-none"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1.5px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                        caretColor: NEON,
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 16,
                      }}
                    />
                  </div>
                  <div
                    className="flex items-center justify-center rounded-[14px] flex-shrink-0"
                    style={{
                      width: 52, height: 52, fontSize: 26,
                      background: "rgba(170,255,0,0.07)",
                      border: `1.5px solid ${NEON}44`,
                    }}
                  >
                    {customSportEmoji || "⚙️"}
                  </div>
                </div>

                <p style={{ fontSize: 11, marginTop: 10, paddingLeft: 4, color: "rgba(255,255,255,0.28)", fontFamily: "'DM Sans', sans-serif" }}>
                  Emoji and name appear on the leaderboard and all match cards.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <FixedFooter>
        <PrimaryBtn onClick={onNext} disabled={!canContinue}>
          {label}
        </PrimaryBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// BRACKET GENERATION
// ─────────────────────────────────────────────
function _nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
function _shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Returns array of length n where result[position] = seed number (1-indexed)
// Seed 1 and Seed 2 can only meet in the final.
function _bracketSeedOrder(n) {
  let order = [1, 2];
  while (order.length < n) {
    const next = [];
    for (const s of order) { next.push(s); next.push(n + 1 - s); }
    order = next;
  }
  return order;
}

function generateKnockoutBracket(participants) {
  if (!participants || participants.length < 2) return null;
  const isSeeded = participants.some(p => p.tier);
  const TIER_RANK = { A: 0, B: 1, C: 2, D: 3, E: 4 };

  let sorted = isSeeded
    ? [...participants].sort((a, b) => {
        const ra = a.tier ? (TIER_RANK[a.tier] ?? 9) : 9;
        const rb = b.tier ? (TIER_RANK[b.tier] ?? 9) : 9;
        return ra !== rb ? ra - rb : Math.random() - 0.5;
      })
    : _shuffleArr([...participants]);

  const size    = _nextPow2(sorted.length);
  const padded  = [...sorted, ...Array(size - sorted.length).fill(null)]; // nulls = BYEs
  const order   = _bracketSeedOrder(size);
  const slots   = order.map(seed => padded[seed - 1]); // position → participant

  // Round 1
  const round1 = [];
  for (let i = 0; i < size; i += 2) {
    const p1 = slots[i], p2 = slots[i + 1];
    const isBye = p1 === null || p2 === null;
    round1.push({ id: crypto.randomUUID(), round: 1, position: i / 2,
      p1, p2, winner: isBye ? (p1 || p2) : null, isBye });
  }

  // Subsequent rounds — placeholders, BYE winners propagated
  const totalRounds = Math.log2(size);
  const rounds = [round1];
  for (let r = 2; r <= totalRounds; r++) {
    const prev  = rounds[r - 2];
    const count = prev.length / 2;
    const round = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(), round: r, position: i,
      p1: prev[i * 2]?.isBye     ? prev[i * 2].winner     : null,
      p2: prev[i * 2 + 1]?.isBye ? prev[i * 2 + 1].winner : null,
      winner: null, isBye: false,
    }));
    rounds.push(round);
  }

  return { rounds, seeded: isSeeded, size, generatedAt: new Date().toISOString() };
}

// Cross-group seeded bracket: pairs consecutive groups (A+B, C+D…) with crossover.
// advancingByGroup: [[1stA, 2ndA], [1stB, 2ndB], …] — one array per group.
function generateCrossoverBracket(advancingByGroup) {
  if (!advancingByGroup?.length) return null;
  // Fallback for single group (no crossover possible)
  if (advancingByGroup.length < 2) return generateKnockoutBracket(advancingByGroup.flat());

  const numGroups = advancingByGroup.length;
  const perGroup  = advancingByGroup[0]?.length || 2;
  const pairs     = []; // each element is { p1, p2 } for one R1 match

  // Pair consecutive groups: (A+B), (C+D), …
  for (let gi = 0; gi < numGroups - 1; gi += 2) {
    const gA = advancingByGroup[gi]     || [];
    const gB = advancingByGroup[gi + 1] || [];
    for (let rank = 0; rank < perGroup; rank++) {
      const crossRank = perGroup - 1 - rank; // top of A vs bottom of B
      pairs.push({ p1: gA[rank] ?? null, p2: gB[crossRank] ?? null });
    }
  }

  // Odd number of groups: last group's players get automatic BYEs
  if (numGroups % 2 === 1) {
    for (const p of (advancingByGroup[numGroups - 1] || [])) {
      pairs.push({ p1: p, p2: null });
    }
  }

  const r1Size   = _nextPow2(pairs.length);
  const padCount = r1Size - pairs.length;
  for (let i = 0; i < padCount; i++) pairs.push({ p1: null, p2: null });

  const r1 = pairs.map((pair, i) => {
    const { p1, p2 } = pair;
    const isBye = Boolean(p1) !== Boolean(p2);
    return {
      id: crypto.randomUUID(), round: 1, position: i,
      p1: p1 || null, p2: p2 || null,
      winner: isBye ? (p1 || p2) : null, isBye,
    };
  });

  const totalRounds = Math.round(Math.log2(r1Size)) + 1;
  const rounds = [r1];
  for (let r = 2; r <= totalRounds; r++) {
    const prev  = rounds[r - 2];
    const count = prev.length / 2;
    const rnd   = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(), round: r, position: i,
      p1: prev[i * 2]?.isBye     ? prev[i * 2].winner     : null,
      p2: prev[i * 2 + 1]?.isBye ? prev[i * 2 + 1].winner : null,
      winner: null, isBye: false,
    }));
    rounds.push(rnd);
  }

  return { rounds, seeded: true, crossover: true, size: r1Size, generatedAt: new Date().toISOString() };
}

// Store a leg score on a bracket match (for Home & Away).
// If both legs are present, determines winner by aggregate and propagates.
function applyBracketLeg(bracket, matchId, legNum, legData) {
  const b = JSON.parse(JSON.stringify(bracket));
  for (let ri = 0; ri < b.rounds.length; ri++) {
    const mi = b.rounds[ri].findIndex(m => m.id === matchId);
    if (mi === -1) continue;
    const m = b.rounds[ri][mi];
    if (legNum === 1) {
      m.leg1 = legData; // { p1Goals, p2Goals }
    } else {
      m.leg2 = legData;
      const p1Total = (Number(m.leg1?.p1Goals) || 0) + (Number(legData.p1Goals) || 0);
      const p2Total = (Number(m.leg1?.p2Goals) || 0) + (Number(legData.p2Goals) || 0);
      if (p1Total !== p2Total) {
        const winner = p1Total > p2Total ? m.p1 : m.p2;
        m.winner = winner;
        // Propagate to next round
        if (ri + 1 < b.rounds.length) {
          const nextMi   = Math.floor(mi / 2);
          const next     = b.rounds[ri + 1][nextMi];
          if (next) { if (mi % 2 === 0) next.p1 = winner; else next.p2 = winner; }
        }
      }
      // Tie: winner stays null, admin must re-log or pick
    }
    break;
  }
  return b;
}

// Deep-clone bracket and set winner for a match; propagate to next round.
// score = { p1Goals, p2Goals } — stored on the match so cards can display it.
function applyBracketResult(bracket, matchId, winnerObj, score) {
  const b = JSON.parse(JSON.stringify(bracket));
  for (let ri = 0; ri < b.rounds.length; ri++) {
    const mi = b.rounds[ri].findIndex(m => m.id === matchId);
    if (mi === -1) continue;
    b.rounds[ri][mi].winner = winnerObj;
    if (score) b.rounds[ri][mi].score = score;
    if (ri + 1 < b.rounds.length) {
      const nextMi    = Math.floor(mi / 2);
      const isP1Slot  = mi % 2 === 0;
      const nextMatch = b.rounds[ri + 1][nextMi];
      if (nextMatch) {
        if (isP1Slot) nextMatch.p1 = winnerObj;
        else          nextMatch.p2 = winnerObj;
      }
    }
    break;
  }
  return b;
}

// ─────────────────────────────────────────────
// GROUP STAGE GENERATION
// ─────────────────────────────────────────────
function generateGroupStage(participants, playersPerGroup) {
  if (!participants || participants.length < 2) return { groups: [], groupMatches: [] };
  const numGroups = Math.max(1, Math.ceil(participants.length / playersPerGroup));
  const groups = Array.from({ length: numGroups }, (_, i) => ({
    name: String.fromCharCode(65 + i), // A, B, C, D...
    participants: [],
  }));

  // Sort by tier (best players first), then snake-draft into groups for balance
  const TIER_RANK = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  const sorted = [...participants].sort((a, b) => {
    const ra = a.tier ? (TIER_RANK[a.tier] ?? 9) : 9;
    const rb = b.tier ? (TIER_RANK[b.tier] ?? 9) : 9;
    return ra !== rb ? ra - rb : Math.random() - 0.5;
  });

  // Snake draft: row 0 → A,B,C... row 1 → ...C,B,A row 2 → A,B,C...
  sorted.forEach((p, idx) => {
    const row = Math.floor(idx / numGroups);
    const col = row % 2 === 0 ? idx % numGroups : numGroups - 1 - (idx % numGroups);
    if (groups[col]) groups[col].participants.push(p);
  });

  // Round-robin fixtures within each group
  const groupMatches = [];
  for (const group of groups) {
    const ps = group.participants;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        groupMatches.push({
          id: crypto.randomUUID(),
          groupName: group.name,
          p1: ps[i],
          p2: ps[j],
        });
      }
    }
  }

  return { groups, groupMatches };
}

// Derive group standings for a single group from the live feed
function computeGroupStandings(groupParticipants, groupName, allGroupMatches, feed) {
  const fixtureIds = new Set(
    allGroupMatches.filter(m => m.groupName === groupName).map(m => m.id)
  );
  const results = feed.filter(m => fixtureIds.has(m.id));
  const stats = {};
  groupParticipants.forEach(p => {
    stats[p.name] = { participant: p, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
  });
  results.forEach(m => {
    const p1g = Number(m.p1Goals ?? 0);
    const p2g = Number(m.p2Goals ?? 0);
    const p1n = m.p1Name, p2n = m.p2Name;
    if (stats[p1n]) {
      stats[p1n].played++; stats[p1n].gf += p1g; stats[p1n].ga += p2g;
      if (p1g > p2g) { stats[p1n].won++; stats[p1n].pts += 3; }
      else if (p1g === p2g) { stats[p1n].drawn++; stats[p1n].pts += 1; }
      else stats[p1n].lost++;
    }
    if (stats[p2n]) {
      stats[p2n].played++; stats[p2n].gf += p2g; stats[p2n].ga += p1g;
      if (p2g > p1g) { stats[p2n].won++; stats[p2n].pts += 3; }
      else if (p1g === p2g) { stats[p2n].drawn++; stats[p2n].pts += 1; }
      else stats[p2n].lost++;
    }
  });
  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
    return gdB !== gdA ? gdB - gdA : b.gf - a.gf;
  });
}

// ─────────────────────────────────────────────
// STEP 2 — TOURNAMENT FORMAT
// ─────────────────────────────────────────────
const TOURNAMENT_FORMATS = [
  {
    id:    "classic",
    emoji: "📊",
    label: "Classic League",
    sub:   "Everyone plays everyone. Live standings, points table.",
  },
  {
    id:    "knockout",
    emoji: "⚡",
    label: "Knockout Tournament",
    sub:   "Single-elimination bracket. Lose once and you're out.",
  },
  {
    id:    "groups_knockout",
    emoji: "🏆",
    label: "Groups + Knockout",
    sub:   "Group stage then knockout. Everyone gets guaranteed games, best advance.",
  },
];

function StepTournamentFormat({ tournamentFormat, setTournamentFormat, groupSettings, setGroupSettings, onNext }) {
  const isGroupsKnockout = tournamentFormat === "groups_knockout";

  const ctaLabel = tournamentFormat === "knockout" || tournamentFormat === "groups_knockout"
    ? "Add Participants →"
    : "Set Up Rules →";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <StepHeading
            line1="Choose Your"
            line2="Format"
            sub="This decides how the competition is structured from day one."
          />

          <div className="flex flex-col gap-3">
            {TOURNAMENT_FORMATS.map(tf => {
              const selected = tournamentFormat === tf.id;
              return (
                <motion.button
                  key={tf.id}
                  variants={fadeUp}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setTournamentFormat(tf.id)}
                  style={{
                    width: "100%", padding: "18px 20px", borderRadius: 22, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                    background: selected ? "rgba(170,255,0,0.07)" : "rgba(255,255,255,0.03)",
                    border: selected
                      ? `1.5px solid ${NEON}`
                      : "1.5px solid rgba(255,255,255,0.07)",
                    boxShadow: selected
                      ? "0 0 30px rgba(170,255,0,0.14), 0 0 60px rgba(170,255,0,0.05)"
                      : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26,
                    background: selected ? "rgba(170,255,0,0.1)" : "rgba(255,255,255,0.04)",
                    border: selected ? `1px solid ${NEON}44` : "1px solid rgba(255,255,255,0.08)",
                  }}>
                    {tf.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 700,
                      color: selected ? NEON : "#fff", lineHeight: 1, marginBottom: 5,
                    }}>
                      {tf.label}
                    </div>
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                      color: "rgba(255,255,255,0.38)", lineHeight: 1.5,
                    }}>
                      {tf.sub}
                    </div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    border: selected ? `2px solid ${NEON}` : "2px solid rgba(255,255,255,0.15)",
                    background: selected ? NEON : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.18s ease",
                  }}>
                    {selected && <Check size={12} strokeWidth={3} color="#000" />}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Group Settings — only for Groups + Knockout */}
          <AnimatePresence>
            {isGroupsKnockout && (
              <motion.div
                key="group-settings"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.22 }}
                style={{
                  marginTop: 20, borderRadius: 20, padding: "20px 20px",
                  background: "rgba(170,255,0,0.04)", border: `1.5px solid ${NEON}22`,
                }}
              >
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: `${NEON}cc`, marginBottom: 16, letterSpacing: "0.5px" }}>
                  GROUP STAGE SETTINGS
                </div>
                <div className="flex gap-4">
                  {/* Players per group */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 8, fontWeight: 600 }}>
                      Players per Group
                    </div>
                    <div className="flex gap-2">
                      {[3, 4, 5, 6].map(n => (
                        <button
                          key={n}
                          onClick={() => setGroupSettings(g => ({ ...g, playersPerGroup: n }))}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                            background: groupSettings.playersPerGroup === n ? `${NEON}18` : "rgba(255,255,255,.04)",
                            border: `1.5px solid ${groupSettings.playersPerGroup === n ? NEON : "rgba(255,255,255,.1)"}`,
                            fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 800,
                            color: groupSettings.playersPerGroup === n ? NEON : "rgba(255,255,255,.45)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Advancing per group */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 8, fontWeight: 600 }}>
                      Advance per Group
                    </div>
                    <div className="flex gap-2">
                      {[1, 2, 3].filter(n => n < groupSettings.playersPerGroup).map(n => (
                        <button
                          key={n}
                          onClick={() => setGroupSettings(g => ({ ...g, advancingPerGroup: n }))}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                            background: groupSettings.advancingPerGroup === n ? `${NEON}18` : "rgba(255,255,255,.04)",
                            border: `1.5px solid ${groupSettings.advancingPerGroup === n ? NEON : "rgba(255,255,255,.1)"}`,
                            fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 800,
                            color: groupSettings.advancingPerGroup === n ? NEON : "rgba(255,255,255,.45)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,.3)", lineHeight: 1.6 }}>
                  Groups of {groupSettings.playersPerGroup} · Top {groupSettings.advancingPerGroup} advance to knockout
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <FixedFooter>
        <PBtn onClick={onNext} disabled={!tournamentFormat}>
          {ctaLabel}
        </PBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 3 (KNOCKOUT ONLY) — ADD PARTICIPANTS
// ─────────────────────────────────────────────
const TIER_META = {
  A: { label: "Tier A", color: "#FFD700", bg: "rgba(255,215,0,.12)",   border: "rgba(255,215,0,.35)",   desc: "Elite"      },
  B: { label: "Tier B", color: "#00D4FF", bg: "rgba(0,212,255,.10)",   border: "rgba(0,212,255,.32)",   desc: "Strong"     },
  C: { label: "Tier C", color: "#BF00FF", bg: "rgba(191,0,255,.12)",   border: "rgba(191,0,255,.35)",   desc: "Mid"        },
  D: { label: "Tier D", color: "#FF8C42", bg: "rgba(255,140,66,.12)",  border: "rgba(255,140,66,.35)",  desc: "Developing" },
  E: { label: "Tier E", color: "#AA7FFF", bg: "rgba(170,127,255,.10)", border: "rgba(170,127,255,.32)", desc: "Novice"     },
};
const TIER_ORDER = ["A", "B", "C", "D", "E"];

function StepParticipants({ participants, setParticipants, onNext, setIsLiveLobby = () => {} }) {
  const [drawMode,   setDrawMode]   = useState(null);   // null | "simple" | "seeded" | "lobby"
  const [inputName,  setInputName]  = useState("");
  const [activeTier, setActiveTier] = useState("A");    // seeded mode only
  const inputRef = useRef(null);

  const MIN = 4;
  const canContinue = drawMode === "lobby" || participants.length >= MIN;

  // Focus input when mode is chosen
  useEffect(() => {
    if (drawMode) setTimeout(() => inputRef.current?.focus(), 160);
  }, [drawMode]);

  const handleAdd = () => {
    const name = inputName.trim();
    if (!name) return;
    if (participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      setInputName("");
      return;
    }
    setParticipants(prev => [...prev, {
      id:   crypto.randomUUID(),
      name,
      tier: drawMode === "seeded" ? activeTier : null,
    }]);
    setInputName("");
  };

  const handleRemove = (id) => setParticipants(prev => prev.filter(p => p.id !== id));

  const handleChangeTier = (id, tier) =>
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, tier } : p));

  const switchMode = (mode) => {
    if (mode === "simple") setParticipants(prev => prev.map(p => ({ ...p, tier: null })));
    setIsLiveLobby(false);
    setDrawMode(mode);
  };

  // ── MODE SELECTION ──────────────────────────────────────────────────────
  if (!drawMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
          <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
            <StepHeading
              line1="Add"
              line2="Participants"
              sub="How do you want players to join?"
            />
            <div className="flex flex-col gap-3">
              {[
                { id: "simple", emoji: "🎲", label: "Add Manually — Simple",  sub: "Type player names — bracket is randomised automatically.", highlight: false },
                { id: "seeded", emoji: "🎯", label: "Add Manually — Seeded",   sub: "Assign Tiers A–E so stronger players are kept apart early on.", highlight: false },
                { id: "lobby",  emoji: "📲", label: "Open Live Lobby (QR)",    sub: "Players scan a QR code or type a PIN to join in real-time. No manual entry needed.", highlight: true  },
              ].map(opt => (
                <motion.button
                  key={opt.id}
                  variants={fadeUp}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (opt.id === "lobby") {
                      setIsLiveLobby(true);
                      setDrawMode("lobby");
                    } else {
                      switchMode(opt.id);
                    }
                  }}
                  style={{
                    width: "100%", padding: "18px 20px", borderRadius: 22, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                    background: opt.highlight ? "rgba(170,255,0,.06)" : "rgba(255,255,255,0.03)",
                    border: opt.highlight ? `1.5px solid rgba(170,255,0,.4)` : "1.5px solid rgba(255,255,255,0.07)",
                    transition: "all 0.18s ease",
                    boxShadow: opt.highlight ? "0 0 28px rgba(170,255,0,.1)" : "none",
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0, fontSize: 26,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: opt.highlight ? "rgba(170,255,0,.1)" : "rgba(255,255,255,0.04)",
                    border: opt.highlight ? `1px solid rgba(170,255,0,.3)` : "1px solid rgba(255,255,255,0.08)",
                  }}>{opt.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 700,
                      color: opt.highlight ? NEON : "#fff", lineHeight: 1, marginBottom: 5 }}>{opt.label}</div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                      color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>{opt.sub}</div>
                  </div>
                  <ChevronRight size={18} style={{ color: opt.highlight ? NEON : "rgba(255,255,255,0.2)", flexShrink: 0 }} />
                </motion.button>
              ))}
            </div>

            {participants.length > 0 && (
              <motion.div variants={fadeUp} style={{ marginTop: 16, textAlign: "center" }}>
                <button
                  onClick={() => setDrawMode(participants.some(p => p.tier) ? "seeded" : "simple")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: `${NEON}88`, fontWeight: 600 }}
                >
                  ← Continue editing {participants.length} player{participants.length !== 1 ? "s" : ""} already added
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // ── LIVE LOBBY CONFIRMATION SCREEN ──────────────────────────────────────
  if (drawMode === "lobby") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
          <motion.div variants={stagger(0.06)} initial="hidden" animate="show">
            <StepHeading line1="Live" line2="Lobby" sub="Players will join using a PIN or QR code — no manual entry needed." />
            <div className="flex flex-col gap-3 mb-5">
              {[
                { icon: "📲", text: "QR code and PIN shown after you launch the league" },
                { icon: "⚡", text: "Players scan and appear in the lobby in real-time" },
                { icon: "🏷️", text: "Assign or let players self-select their tier in the lobby" },
                { icon: "🔒", text: "Lock the lobby to kick off the draw when everyone's in" },
              ].map(item => (
                <motion.div key={item.text} variants={fadeUp}
                  className="flex items-center gap-3 rounded-[16px] px-4 py-3.5"
                  style={{ background: "rgba(170,255,0,.05)", border: "1px solid rgba(170,255,0,.14)" }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.75)", lineHeight: 1.4 }}>{item.text}</span>
                </motion.div>
              ))}
            </div>
            <motion.div variants={fadeUp} style={{ textAlign: "center" }}>
              <button
                onClick={() => { setIsLiveLobby(false); setDrawMode(null); }}
                style={{ background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "rgba(255,255,255,.35)", fontWeight: 600 }}
              >
                ← Switch to manual entry
              </button>
            </motion.div>
          </motion.div>
        </div>
        <FixedFooter>
          <PBtn onClick={onNext}>Continue → Launch Lobby</PBtn>
        </FixedFooter>
      </div>
    );
  }

  // ── PLAYER LIST ─────────────────────────────────────────────────────────
  const isSeeded = drawMode === "seeded";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.04)} initial="hidden" animate="show">

          {/* Header row with mode badge + switch link */}
          <motion.div variants={fadeUp} className="flex items-center justify-between mb-5">
            <div>
              <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, letterSpacing: "2px", lineHeight: 1, color: "#fff" }}>
                Add <span style={{ color: NEON }}>{isSeeded ? "Seeded" : "Players"}</span>
              </h2>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>
                {isSeeded
                  ? "Pick a tier, type a name, hit Add."
                  : "Type a name and hit Add. All equal."}
              </p>
            </div>
            <button
              onClick={() => switchMode(isSeeded ? "simple" : "seeded")}
              style={{
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 12, padding: "6px 10px", cursor: "pointer", flexShrink: 0,
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                color: "rgba(255,255,255,.5)",
              }}
            >
              Switch to {isSeeded ? "Simple" : "Seeded"}
            </button>
          </motion.div>

          {/* Tier selector — seeded mode only */}
          {isSeeded && (
            <motion.div variants={fadeUp} className="flex gap-2 mb-4">
              {Object.entries(TIER_META).map(([t, meta]) => (
                <button
                  key={t}
                  onClick={() => setActiveTier(t)}
                  style={{
                    flex: 1, padding: "10px 6px", borderRadius: 14, cursor: "pointer",
                    background: activeTier === t ? meta.bg : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${activeTier === t ? meta.border : "rgba(255,255,255,.08)"}`,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 800, color: activeTier === t ? meta.color : "rgba(255,255,255,.4)" }}>{meta.label}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "rgba(255,255,255,.28)", marginTop: 2 }}>{meta.desc}</div>
                </button>
              ))}
            </motion.div>
          )}

          {/* Input row */}
          <motion.div variants={fadeUp} className="flex gap-2 mb-4">
            <input
              ref={inputRef}
              type="text"
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="Player name…"
              maxLength={24}
              style={{
                flex: 1, borderRadius: 16, padding: "13px 16px", outline: "none",
                fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600,
                background: "rgba(255,255,255,.05)",
                border: inputName ? `1.5px solid ${NEON}` : "1.5px solid rgba(255,255,255,.12)",
                color: "#fff", caretColor: NEON,
              }}
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleAdd}
              disabled={!inputName.trim()}
              style={{
                borderRadius: 16, padding: "13px 18px", cursor: inputName.trim() ? "pointer" : "not-allowed",
                background: inputName.trim() ? `linear-gradient(135deg,${NEON},#7DC900)` : "rgba(255,255,255,.06)",
                border: "none", color: inputName.trim() ? "#000" : "rgba(255,255,255,.25)",
                fontFamily: "'DM Sans',sans-serif", fontWeight: 800, fontSize: 13,
                transition: "all 0.15s ease", flexShrink: 0,
              }}
            >
              + Add
            </motion.button>
          </motion.div>

          {/* Player list */}
          <AnimatePresence>
            {participants.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,.18)", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                No players yet — add at least {MIN}
              </motion.div>
            ) : (
              <div className="flex flex-col gap-2">
                {participants.map((p, i) => {
                  const tierM = isSeeded && p.tier ? TIER_META[p.tier] : null;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-3 rounded-[16px] px-4 py-3"
                      style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 34, height: 34, borderRadius: 12, flexShrink: 0,
                        background: tierM ? tierM.bg : GRADS[i % GRADS.length],
                        border: tierM ? `1px solid ${tierM.border}` : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, fontFamily: "'DM Sans',sans-serif",
                        color: tierM ? tierM.color : "#000",
                      }}>
                        {p.name.trim().split(/\s+/).map(w => (w[0] || "").toUpperCase()).slice(0, 2).join("")}
                      </div>
                      {/* Name */}
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      {/* Tier badge — seeded mode: tap to cycle */}
                      {isSeeded && (
                        <button
                          onClick={() => {
                            const next = TIER_ORDER[(TIER_ORDER.indexOf(p.tier || "E") + 1) % TIER_ORDER.length];
                            handleChangeTier(p.id, next);
                          }}
                          style={{
                            borderRadius: 8, padding: "3px 8px", cursor: "pointer", flexShrink: 0,
                            background: tierM ? tierM.bg : "rgba(255,255,255,.06)",
                            border: `1px solid ${tierM ? tierM.border : "rgba(255,255,255,.12)"}`,
                            fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 800,
                            color: tierM ? tierM.color : "rgba(255,255,255,.4)",
                          }}
                          title="Tap to change tier"
                        >
                          {p.tier || "—"}
                        </button>
                      )}
                      {/* Remove */}
                      <button onClick={() => handleRemove(p.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", flexShrink: 0 }}>
                        <X size={14} style={{ color: "rgba(255,255,255,.25)" }} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>

          {/* Counter */}
          {participants.length > 0 && (
            <motion.div variants={fadeUp} style={{ marginTop: 12, textAlign: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: canContinue ? `${NEON}77` : "rgba(255,255,255,.25)" }}>
              {participants.length} player{participants.length !== 1 ? "s" : ""}
              {canContinue ? " · Ready to generate bracket ✓" : ` · Need ${MIN - participants.length} more`}
            </motion.div>
          )}

          {/* Tier summary — seeded mode */}
          {isSeeded && participants.length > 0 && (
            <motion.div variants={fadeUp} className="flex gap-2 mt-3">
              {Object.entries(TIER_META).map(([t, meta]) => {
                const count = participants.filter(p => p.tier === t).length;
                return (
                  <div key={t} style={{ flex: 1, borderRadius: 12, padding: "8px 6px", textAlign: "center",
                    background: count > 0 ? meta.bg : "rgba(255,255,255,.02)",
                    border: `1px solid ${count > 0 ? meta.border : "rgba(255,255,255,.06)"}` }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 800, color: count > 0 ? meta.color : "rgba(255,255,255,.15)" }}>{count}</div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "rgba(255,255,255,.3)", marginTop: 1 }}>{meta.label}</div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </motion.div>
      </div>

      <FixedFooter>
        <PBtn onClick={onNext} disabled={!canContinue}>
          {canContinue ? `Lock In ${participants.length} Players →` : `Add ${MIN - participants.length} More to Continue`}
        </PBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP — MATCH LEGS (KNOCKOUT/GROUPS ONLY)
// ─────────────────────────────────────────────
const MATCH_LEGS_OPTIONS = [
  {
    id:    1,
    emoji: "⚡",
    label: "Single Match",
    sub:   "One game decides the tie. First to win moves on.",
  },
  {
    id:    2,
    emoji: "🔄",
    label: "Home & Away (2 Legs)",
    sub:   "Two games, aggregate score decides who advances.",
  },
];

function StepMatchLegs({ matchLegs, setMatchLegs, onNext }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <StepHeading
            line1="Match"
            line2="Format"
            sub="How many legs does each knockout tie consist of?"
          />

          <div className="flex flex-col gap-3">
            {MATCH_LEGS_OPTIONS.map(opt => {
              const selected = matchLegs === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  variants={fadeUp}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setMatchLegs(opt.id)}
                  style={{
                    width: "100%", padding: "18px 20px", borderRadius: 22, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                    background: selected ? "rgba(170,255,0,0.07)" : "rgba(255,255,255,0.03)",
                    border: selected ? `1.5px solid ${NEON}` : "1.5px solid rgba(255,255,255,0.07)",
                    boxShadow: selected ? "0 0 30px rgba(170,255,0,0.14)" : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0, fontSize: 26,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: selected ? "rgba(170,255,0,0.1)" : "rgba(255,255,255,0.04)",
                    border: selected ? `1px solid ${NEON}44` : "1px solid rgba(255,255,255,0.08)",
                  }}>
                    {opt.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 700,
                      color: selected ? NEON : "#fff", lineHeight: 1, marginBottom: 5 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                      color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>
                      {opt.sub}
                    </div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    border: selected ? `2px solid ${NEON}` : "2px solid rgba(255,255,255,0.15)",
                    background: selected ? NEON : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.18s ease",
                  }}>
                    {selected && <Check size={12} strokeWidth={3} color="#000" />}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>
      <FixedFooter>
        <PBtn onClick={onNext}>
          {matchLegs === 2 ? "Home & Away Confirmed →" : "Single Match Confirmed →"}
        </PBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 4 (KNOCKOUT/GROUPS ONLY) — REPORTING MODE
// ─────────────────────────────────────────────
const REPORTING_OPTIONS = [
  {
    id:    "admin",
    emoji: "🔒",
    label: "Admin Only",
    sub:   "Only you can enter scores. Full control over every result.",
  },
  {
    id:    "self",
    emoji: "📲",
    label: "Self-Reporting",
    sub:   "Any player can log their own match results after playing.",
  },
];

function StepReportingMode({ reportingMode, setReportingMode, onNext }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <StepHeading
            line1="Who Reports"
            line2="Scores?"
            sub="Decide how match results get entered into the system."
          />

          <div className="flex flex-col gap-3">
            {REPORTING_OPTIONS.map(opt => {
              const selected = reportingMode === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  variants={fadeUp}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setReportingMode(opt.id)}
                  style={{
                    width: "100%", padding: "18px 20px", borderRadius: 22, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                    background: selected ? "rgba(170,255,0,0.07)" : "rgba(255,255,255,0.03)",
                    border: selected
                      ? `1.5px solid ${NEON}`
                      : "1.5px solid rgba(255,255,255,0.07)",
                    boxShadow: selected
                      ? "0 0 30px rgba(170,255,0,0.14), 0 0 60px rgba(170,255,0,0.05)"
                      : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26,
                    background: selected ? "rgba(170,255,0,0.1)" : "rgba(255,255,255,0.04)",
                    border: selected ? `1px solid ${NEON}44` : "1px solid rgba(255,255,255,0.08)",
                  }}>
                    {opt.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 700,
                      color: selected ? NEON : "#fff", lineHeight: 1, marginBottom: 5,
                    }}>
                      {opt.label}
                    </div>
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                      color: "rgba(255,255,255,0.38)", lineHeight: 1.5,
                    }}>
                      {opt.sub}
                    </div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    border: selected ? `2px solid ${NEON}` : "2px solid rgba(255,255,255,0.15)",
                    background: selected ? NEON : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.18s ease",
                  }}>
                    {selected && <Check size={12} strokeWidth={3} color="#000" />}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>
      <FixedFooter>
        <PBtn onClick={onNext} disabled={!reportingMode}>
          {reportingMode === "admin" ? "Set Up Rules →" : "Set Up Rules →"}
        </PBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 4 — RULE ENGINE
// ─────────────────────────────────────────────
function StepRules({ format, setFormat, points, setPoints, customRules, setCustomRules, onNext }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <StepHeading
            line1="Define your game."
            line2="Set your legacy."
            sub="This shapes how wins are counted and how the leaderboard is calculated."
          />

          <div className="flex flex-col gap-3">
            {FORMATS.map((f, _i) => {
              const sel = format === f.id;
              const { Icon } = f;
              return (
                <motion.div
                  key={f.id}
                  variants={fadeUp}
                  onClick={() => setFormat(f.id)}
                  className="rounded-[20px] overflow-hidden cursor-pointer transition-all"
                  style={{
                    background: sel ? "rgba(170,255,0,0.06)" : "rgba(255,255,255,0.03)",
                    border: sel ? `1.5px solid ${NEON}` : "1.5px solid rgba(255,255,255,0.07)",
                    boxShadow: sel ? "0 0 24px rgba(170,255,0,0.14)" : "none",
                  }}
                >
                  {/* Row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Radio dot */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full transition-all"
                      style={{
                        width: 22, height: 22,
                        border: sel ? `2px solid ${NEON}` : "2px solid rgba(255,255,255,0.15)",
                        background: sel ? "rgba(170,255,0,0.1)" : "transparent",
                      }}
                    >
                      <AnimatePresence>
                        {sel && (
                          <motion.div
                            key="dot"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 24 }}
                            className="rounded-full"
                            style={{ width: 10, height: 10, background: NEON }}
                          />
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div
                        className="font-bold text-sm flex items-center gap-2"
                        style={{
                          color: sel ? "#fff" : "rgba(255,255,255,0.68)",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {f.label}
                        {f.id === "goals" && (
                          <span
                            style={{
                              fontSize: 8, fontWeight: 800, letterSpacing: "1px",
                              background: "rgba(170,255,0,0.14)",
                              color: NEON,
                              border: "1px solid rgba(170,255,0,0.3)",
                              borderRadius: 5,
                              padding: "2px 6px",
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11, marginTop: 2,
                          color: "rgba(255,255,255,0.34)",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {f.desc}
                      </div>
                    </div>
                    <Icon
                      size={22}
                      style={{ flexShrink: 0, color: sel ? NEON : "rgba(255,255,255,0.28)" }}
                    />
                  </div>

                  {/* Expandable panel */}
                  <AnimatePresence>
                    {sel && (f.id === "points" || f.id === "custom_logic") && (
                      <motion.div
                        key={`panel-${f.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: "easeInOut" }}
                        style={{ overflow: "hidden", borderTop: "1px solid rgba(170,255,0,0.14)" }}
                      >
                        <div className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                          {f.id === "points" && (
                            <>
                              <p
                                style={{
                                  fontSize: 11, fontWeight: 700, marginBottom: 12,
                                  color: "rgba(255,255,255,0.38)", fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                POINTS TARGET
                              </p>
                              {/* Presets */}
                              <div className="flex gap-2 mb-3">
                                {PT_PRESETS.map((p) => (
                                  <button
                                    key={p}
                                    onClick={() => setPoints(p)}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                                    style={{
                                      fontFamily: "'DM Sans', sans-serif",
                                      background: points === p ? NEON : "rgba(255,255,255,0.05)",
                                      color:      points === p ? "#000" : "rgba(255,255,255,0.48)",
                                      border:     points === p ? "none" : "1px solid rgba(255,255,255,0.08)",
                                      boxShadow:  points === p ? "0 0 18px rgba(170,255,0,0.32)" : "none",
                                    }}
                                  >
                                    {p} pts
                                  </button>
                                ))}
                              </div>
                              {/* Stepper */}
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setPoints(Math.max(5, points - 1))}
                                  className="flex items-center justify-center rounded-xl transition-all active:scale-90 flex-shrink-0"
                                  style={{
                                    width: 40, height: 40,
                                    background: "rgba(255,255,255,0.07)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    color: "rgba(255,255,255,0.7)",
                                    fontSize: 22,
                                  }}
                                >
                                  −
                                </button>
                                <div className="flex-1 text-center">
                                  <span
                                    style={{
                                      fontFamily: "'Bebas Neue', sans-serif",
                                      fontSize: 38, letterSpacing: "2px", color: NEON,
                                    }}
                                  >
                                    {points}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 13, marginLeft: 6,
                                      color: "rgba(255,255,255,0.28)",
                                      fontFamily: "'DM Sans', sans-serif",
                                    }}
                                  >
                                    pts
                                  </span>
                                </div>
                                <button
                                  onClick={() => setPoints(Math.min(50, points + 1))}
                                  className="flex items-center justify-center rounded-xl transition-all active:scale-90 flex-shrink-0"
                                  style={{
                                    width: 40, height: 40,
                                    background: "rgba(255,255,255,0.07)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    color: "rgba(255,255,255,0.7)",
                                    fontSize: 22,
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </>
                          )}

                          {f.id === "custom_logic" && (
                            <>
                              <p
                                style={{
                                  fontSize: 11, fontWeight: 700, marginBottom: 10,
                                  color: "rgba(255,255,255,0.38)", fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                DESCRIBE YOUR HOUSE RULES
                              </p>
                              <textarea
                                autoFocus
                                value={customRules}
                                onChange={(e) => setCustomRules(e.target.value)}
                                placeholder="e.g. First to 15 pts, must win by 2. Serve rotates every 5 pts. Disputes go to a coin flip…"
                                rows={4}
                                className="w-full rounded-[14px] px-4 py-3 text-sm outline-none resize-none"
                                style={{
                                  fontFamily: "'DM Sans', sans-serif",
                                  background: "rgba(255,255,255,0.05)",
                                  border: `1.5px solid ${customRules.trim() ? NEON : "rgba(170,255,0,0.3)"}`,
                                  color: "#fff",
                                  caretColor: NEON,
                                  lineHeight: 1.65,
                                  boxShadow: customRules.trim()
                                    ? "0 0 18px rgba(170,255,0,0.1)"
                                    : "none",
                                }}
                              />
                              <p
                                style={{
                                  fontSize: 10, marginTop: 6,
                                  color: "rgba(255,255,255,0.24)",
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                {customRules.trim().length} chars · Rules will be pinned to your league&apos;s info page.
                              </p>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      <FixedFooter>
        <PrimaryBtn onClick={onNext} disabled={!format}>
          Continue
        </PrimaryBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 3 — BRANDING
// ─────────────────────────────────────────────
function StepBranding({ sport, format, points, customSportName, customSportEmoji, leagueName, setLeagueName, onNext }) {
  const inputRef  = useRef(null);
  const canSubmit = leagueName.trim().length >= 2;

  const sportData   = SPORTS.find(s => s.id === sport) || SPORTS[0];
  const resolvedSport = sport === "custom_sport"
    ? (customSportName.trim() || "Custom")
    : sportData.label;
  const resolvedEmoji = sport === "custom_sport" ? (customSportEmoji || "⚙️") : sportData.emoji;

  const formatLabel = (() => {
    if (format === "single")       return "⚡ Single Set";
    if (format === "best3")        return "🎯 Best of 3";
    if (format === "points")       return `🔢 ${points} Points`;
    if (format === "custom_logic") return "⚙️ Custom Rules";
    return "—";
  })();

  const initials = leagueName.trim()
    ? leagueName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("")
    : "?";

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <StepHeading
            line1="Name Your"
            line2="League"
            sub="This is what your squad sees on every leaderboard, trophy, and notification."
          />

          {/* Input */}
          <motion.div variants={fadeUp} className="relative mb-2">
            <input
              ref={inputRef}
              type="text"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value.toUpperCase())}
              maxLength={24}
              placeholder="E.G. JUNGLE PADEL"
              className="w-full rounded-[18px] py-5 px-5 outline-none transition-all"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 26, letterSpacing: "3px",
                background: "rgba(255,255,255,0.04)",
                border: leagueName
                  ? `1.5px solid ${NEON}`
                  : "1.5px solid rgba(255,255,255,0.1)",
                color: "#fff",
                caretColor: NEON,
                boxShadow: leagueName ? "0 0 24px rgba(170,255,0,0.1)" : "none",
                paddingRight: 52,
              }}
            />
            <Trophy
              size={20}
              className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "rgba(255,255,255,0.3)" }}
            />
          </motion.div>
          <motion.div variants={fadeUp} className="flex justify-end mb-6">
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
              {leagueName.length} / 24
            </span>
          </motion.div>

          {/* Live Preview Card */}
          <motion.div variants={fadeUp}>
            <p
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "2px", marginBottom: 12,
                color: "rgba(255,255,255,0.28)", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              LIVE PREVIEW
            </p>

            <motion.div
              layout
              className="rounded-[22px] p-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                border: "1.5px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Top shimmer line */}
              <div
                className="absolute top-0 left-8 right-8"
                style={{
                  height: 1.5,
                  background: "linear-gradient(90deg, transparent, rgba(170,255,0,0.5), transparent)",
                }}
              />

              {/* Avatar + name */}
              <div className="flex items-center gap-4 mb-5">
                <div
                  className="flex items-center justify-center rounded-[16px] flex-shrink-0"
                  style={{
                    width: 54, height: 54,
                    background: `linear-gradient(135deg, ${NEON}, #7DC900)`,
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 20, letterSpacing: "1px", color: "#000",
                  }}
                >
                  {initials}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 20, letterSpacing: "2px",
                      color: leagueName ? "#fff" : "rgba(255,255,255,0.2)",
                    }}
                  >
                    {leagueName || "YOUR LEAGUE"}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Crown size={11} style={{ color: NEON }} />
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
                        color: NEON, fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      ADMIN / COMMISSIONER
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats chips */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "SPORT",  value: `${resolvedEmoji} ${resolvedSport}` },
                  { label: "FORMAT", value: formatLabel },
                  { label: "ROLE",   value: "👑 Commissioner" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl px-3 py-3 text-center"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 5,
                        color: "rgba(255,255,255,0.28)", fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", fontFamily: "'DM Sans', sans-serif" }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          {/* Commissioner callout */}
          <motion.div
            variants={fadeUp}
            className="flex items-center gap-3 mt-4 rounded-[16px] px-4 py-3.5"
            style={{ background: "rgba(170,255,0,0.05)", border: "1px solid rgba(170,255,0,0.14)" }}
          >
            <Crown size={20} style={{ color: NEON, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
                You are the Commissioner
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.34)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                Full admin access · Edit rules · Manage players
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <FixedFooter>
        <PrimaryBtn onClick={onNext} disabled={!canSubmit}>
          {canSubmit ? "Launch League 🚀" : "Enter a League Name"}
        </PrimaryBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 4 — VIRAL INVITE
// ─────────────────────────────────────────────
function StepInvite({ sport, format, points, customSportName, customSportEmoji, leagueName, leagueCode, onFinish, saving = false, createErr = "" }) {
  const [copied, setCopied] = useState(false);

  const sportData     = SPORTS.find(s => s.id === sport) || SPORTS[0];
  const resolvedSport = sport === "custom_sport"
    ? (customSportName.trim() || "Custom Sport")
    : sportData.label;
  const resolvedEmoji = sport === "custom_sport" ? (customSportEmoji || "⚙️") : sportData.emoji;

  const formatLabel = (() => {
    if (format === "single")       return "Single Set ⚡";
    if (format === "best3")        return "Best of 3 🎯";
    if (format === "points")       return `${points} Points 🔢`;
    if (format === "custom_logic") return "Custom Rules ⚙️";
    return "—";
  })();

  const slug     = `${leagueName.replace(/\s+/g, "-")}-${leagueCode}`;
  const link     = `league-it.app/join/${slug}`;
  const fullLink = `https://${link}`;
  const initials = leagueName.trim()
    ? leagueName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("")
    : "LG";

  const waMessage =
    `Yo squad! 🏆 I just started our official *${leagueName}* on LEAGUE-IT.\n\n` +
    `👉 Join the table here: ${fullLink}\n\n` +
    `No more excuses. Let's see who's #1. 😤\n\n` +
    `_"The table doesn't lie."_`;

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(fullLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [fullLink]);

  const handleWhatsApp = useCallback(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(waMessage)}`, "_blank");
  }, [waMessage]);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="px-5 pb-10">
        <motion.div
          variants={stagger(0.06)}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center text-center"
        >
          {/* Trophy animation */}
          <motion.div
            variants={fadeUp}
            className="text-[60px] leading-none mt-4 mb-4"
            animate={{ rotate: [0, -8, 8, -4, 4, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 0.9, delay: 0.3 }}
          >
            🎉
          </motion.div>

          <motion.div variants={fadeUp}>
            <h2
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 46, letterSpacing: "2px",
                lineHeight: 1.05, color: "#fff",
              }}
            >
              Your League is
            </h2>
            <h2
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 46, letterSpacing: "2px",
                color: NEON,
                textShadow: "0 0 30px rgba(170,255,0,0.42)",
                marginBottom: 10,
              }}
            >
              Live!
            </h2>
          </motion.div>

          <motion.p
            variants={fadeUp}
            style={{
              fontSize: 13, color: "rgba(255,255,255,0.4)",
              lineHeight: 1.7, maxWidth: 280, marginBottom: 24,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Share the link. Fill the table. Watch the drama unfold.
          </motion.p>

          {/* League summary */}
          <motion.div
            variants={fadeUp}
            className="w-full rounded-[22px] p-4 mb-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-[14px] flex-shrink-0"
                style={{
                  width: 48, height: 48,
                  background: `linear-gradient(135deg, ${NEON}, #7DC900)`,
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 17, letterSpacing: "1px", color: "#000",
                }}
              >
                {initials}
              </div>
              <div className="text-left min-w-0">
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 18, letterSpacing: "2px", color: NEON,
                  }}
                  className="truncate"
                >
                  {leagueName}
                </div>
                <div
                  style={{
                    fontSize: 11, color: "rgba(255,255,255,0.34)",
                    marginTop: 2, fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {resolvedEmoji} {resolvedSport} · {formatLabel} · 👑 Commissioner
                </div>
              </div>
            </div>
          </motion.div>

          {/* Link card */}
          <motion.div
            variants={fadeUp}
            className="w-full rounded-[22px] p-4 mb-3 relative overflow-hidden"
            style={{
              background: "rgba(170,255,0,0.05)",
              border: "1.5px solid rgba(170,255,0,0.24)",
            }}
          >
            <div
              className="absolute top-0 left-10 right-10"
              style={{ height: 1.5, background: "linear-gradient(90deg, transparent, rgba(170,255,0,0.55), transparent)" }}
            />
            <p
              style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "2px",
                color: "rgba(170,255,0,0.55)", marginBottom: 10, textAlign: "left",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              YOUR LEAGUE LINK
            </p>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 rounded-xl px-3 py-2.5 truncate"
                style={{
                  fontFamily: "monospace", fontSize: 11,
                  color: NEON,
                  background: "rgba(0,0,0,0.45)",
                  border: "1px solid rgba(170,255,0,0.15)",
                }}
              >
                {link}
              </div>
              <motion.button
                onClick={handleCopy}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-1.5 flex-shrink-0 rounded-xl px-3 py-2.5 font-bold text-xs transition-all"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  background: copied ? NEON : "rgba(170,255,0,0.12)",
                  color:      copied ? "#000" : NEON,
                  border:     `1px solid ${copied ? NEON : "rgba(170,255,0,0.32)"}`,
                  minWidth: 76,
                  justifyContent: "center",
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy"}
              </motion.button>
            </div>
          </motion.div>

          {/* WhatsApp CTA */}
          <motion.div variants={fadeUp} className="w-full mb-2.5">
            <motion.button
              onClick={handleWhatsApp}
              whileHover={{ scale: 1.015, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="w-full rounded-[22px] py-[18px] flex items-center justify-center gap-3 font-black text-base relative overflow-hidden"
              style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 16,
                background: "linear-gradient(135deg, #25D366, #1aaa52)",
                color: "#fff",
                boxShadow: "0 8px 30px rgba(37,211,102,0.38), 0 2px 8px rgba(0,0,0,0.45)",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14), transparent 55%)" }}
              />
              <MessageCircle size={22} style={{ flexShrink: 0, position: "relative" }} />
              <span style={{ position: "relative" }}>Share to WhatsApp</span>
            </motion.button>
          </motion.div>

          {/* Secondary share chips */}
          <motion.div variants={fadeUp} className="w-full flex gap-2 mb-5">
            {[
              { label: "Telegram", emoji: "✈️" },
              { label: "SMS",      emoji: "📱" },
              { label: "More",     emoji: "🔗" },
            ].map(({ label, emoji }) => (
              <button
                key={label}
                className="flex-1 flex flex-col items-center justify-center gap-1 rounded-[18px] py-3.5 transition-all active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span className="text-xl leading-none">{emoji}</span>
                <span
                  style={{
                    fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.38)",
                    letterSpacing: "0.5px", fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {label.toUpperCase()}
                </span>
              </button>
            ))}
          </motion.div>

          {/* Message preview */}
          <motion.div
            variants={fadeUp}
            className="w-full rounded-[18px] p-4 mb-5 text-left"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p
              style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "2px",
                color: "rgba(255,255,255,0.22)", marginBottom: 8,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              WHATSAPP MESSAGE PREVIEW
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.72, fontFamily: "'DM Sans', sans-serif" }}>
              Yo squad! 🏆 I just started our official{" "}
              <strong style={{ color: "rgba(255,255,255,0.78)" }}>{leagueName}</strong>
              {" "}on LEAGUE-IT. 👉 Join the table here:{" "}
              <span style={{ color: NEON }}>{fullLink}</span>.
              {" "}No more excuses. Let&apos;s see who&apos;s #1. 😤
            </p>
          </motion.div>

          {/* Dashboard button */}
          <motion.div variants={fadeUp} className="w-full">
            <motion.button
              onClick={saving ? undefined : onFinish}
              whileTap={saving ? {} : { scale: 0.97 }}
              whileHover={saving ? {} : { scale: 1.015, y: -2 }}
              className="w-full flex items-center justify-center gap-2 rounded-[22px] py-4 font-bold text-sm relative overflow-hidden"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                background: `linear-gradient(135deg, ${NEON}, #7DC900)`,
                color: "#000",
                boxShadow: saving
                  ? "0 0 20px rgba(170,255,0,0.2)"
                  : "0 8px 32px rgba(170,255,0,0.38), 0 2px 8px rgba(0,0,0,0.45)",
                opacity: saving ? 0.75 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    style={{
                      width: 16, height: 16, borderRadius: "50%",
                      border: "2px solid rgba(0,0,0,0.3)",
                      borderTopColor: "#000",
                      flexShrink: 0,
                    }}
                  />
                  Creating League…
                </>
              ) : (
                <>
                  <LayoutDashboard size={16} />
                  Go to Dashboard
                </>
              )}
            </motion.button>
            {createErr && (
              <div style={{marginTop:10,fontSize:12,fontWeight:600,color:"#FF3355",fontFamily:"'DM Sans',sans-serif",textAlign:"center"}}>
                {createErr}
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 4 — PROFILE (admin / commissioner)
// ─────────────────────────────────────────────
function StepProfile({ adminName, setAdminName, onNext }) {
  const inputRef  = useRef(null);
  const canSubmit = adminName.trim().length >= 2;

  const initials = adminName.trim()
    ? adminName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <StepHeading
            line1="Who's the"
            line2="Commissioner?"
            sub="You'll be the first player in the league. Your name appears on the leaderboard."
          />

          {/* Avatar preview */}
          <motion.div variants={fadeUp} className="flex justify-center mb-6">
            <motion.div
              animate={{ boxShadow: canSubmit
                ? ["0 0 0 0 rgba(170,255,0,.4)","0 0 0 18px rgba(170,255,0,0)","0 0 0 0 rgba(170,255,0,0)"]
                : [] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              className="flex items-center justify-center rounded-full font-black"
              style={{
                width: 80, height: 80,
                background: canSubmit
                  ? `linear-gradient(135deg, ${NEON}, #7DC900)`
                  : "rgba(255,255,255,0.07)",
                color: canSubmit ? "#000" : "rgba(255,255,255,0.2)",
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 28, letterSpacing: "2px",
                transition: "background 0.3s",
              }}
            >
              {initials}
            </motion.div>
          </motion.div>

          {/* Input */}
          <motion.div variants={fadeUp} className="relative mb-2">
            <input
              ref={inputRef}
              type="text"
              value={adminName}
              onChange={e => setAdminName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && canSubmit && onNext()}
              maxLength={32}
              placeholder="Your full name"
              className="w-full rounded-[18px] py-5 px-5 outline-none transition-all"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 18, fontWeight: 700,
                background: "rgba(255,255,255,0.04)",
                border: adminName.trim()
                  ? `1.5px solid ${NEON}`
                  : "1.5px solid rgba(255,255,255,0.1)",
                color: "#fff",
                caretColor: NEON,
                boxShadow: adminName.trim() ? "0 0 24px rgba(170,255,0,0.1)" : "none",
              }}
            />
          </motion.div>
          <motion.div variants={fadeUp} className="flex justify-end mb-6">
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
              {adminName.length} / 32
            </span>
          </motion.div>

          {/* Commissioner callout */}
          <motion.div
            variants={fadeUp}
            className="flex items-center gap-3 rounded-[16px] px-4 py-3.5"
            style={{ background: "rgba(170,255,0,0.05)", border: "1px solid rgba(170,255,0,0.14)" }}
          >
            <Crown size={20} style={{ color: NEON, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
                You are the Commissioner
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.34)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                Full admin access · First player on the board
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <FixedFooter>
        <PrimaryBtn onClick={onNext} disabled={!canSubmit}>
          {canSubmit ? `Let's go, ${adminName.trim().split(" ")[0]}! 🚀` : "Enter Your Name"}
        </PrimaryBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// PLAYER JOIN FLOW — nickname → tier → confirmation
// Shown when a player arrives via /join/:pin URL
// ─────────────────────────────────────────────
function PlayerJoinFlow({ user, leagueId, leagueName, isSeeded, defaultNickname, onDone }) {
  const [step,     setStep]     = useState(1); // 1: nickname  2: tier  3: done
  const [nickname, setNickname] = useState(defaultNickname || "");
  const [tier,     setTier]     = useState(null);
  const [joining,  setJoining]  = useState(false);
  const [err,      setErr]      = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 150); }, []);

  const doJoin = async (selectedTier) => {
    setJoining(true);
    setErr("");
    try {
      const name     = nickname.trim() || defaultNickname || "Player";
      const initials = name.split(/\s+/).map(w => (w[0]||"").toUpperCase()).slice(0, 2).join("");
      const { error } = await supabase.from("players").insert({
        league_id: leagueId,
        user_id:   user.id,
        name,
        is_me:     false,
        stats: { initials, wins:0, losses:0, streak:0, totalPlayed:0, trend:"flat",
                 sport:"🏸", mvTrend:[0,0,0,0,0,0,0], partners:{}, clutchWins:0, bestStreak:0,
                 tier: selectedTier || null },
      });
      if (error) { setErr("Something went wrong — please try again"); setJoining(false); return; }
      setStep(3);
    } catch {
      setErr("Something went wrong — please try again");
    }
    setJoining(false);
  };

  const handleNicknameNext = () => {
    if (!nickname.trim() || joining) return;
    if (isSeeded) { setStep(2); } else { doJoin(null); }
  };

  const C2 = "#FF3355";

  // ── Step 1: Nickname ────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={{ position:"fixed",inset:0,background:BG,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"0 24px",zIndex:3000 }}>
      <GridBg/><GlowBlobs/>
      <div style={{ width:"100%",maxWidth:390,position:"relative",zIndex:1 }}>
        <div style={{ textAlign:"center",marginBottom:32 }}>
          <div style={{ fontSize:13,fontWeight:700,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",letterSpacing:"2px",marginBottom:8 }}>
            JOINING
          </div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:40,letterSpacing:"3px",color:"#fff",lineHeight:1,marginBottom:6 }}>
            {(leagueName||"").toUpperCase()}
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,.38)" }}>
            What should we call you?
          </div>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={nickname}
          onChange={e => setNickname(e.target.value.slice(0, 24))}
          onKeyDown={e => e.key === "Enter" && handleNicknameNext()}
          placeholder="Your nickname..."
          style={{ width:"100%",borderRadius:18,padding:"16px 20px",outline:"none",
            fontFamily:"'DM Sans',sans-serif",fontSize:18,fontWeight:700,textAlign:"center",
            background:"rgba(255,255,255,.05)",
            border:`1.5px solid ${nickname.trim() ? N : "rgba(255,255,255,.15)"}`,
            color:"#fff",caretColor:N,letterSpacing:".5px",marginBottom:8,
            boxShadow:nickname.trim()?`0 0 20px rgba(170,255,0,.12)`:"none",transition:"all .2s" }}
        />
        <div style={{ textAlign:"right",fontFamily:"'DM Sans',sans-serif",fontSize:11,
          color:"rgba(255,255,255,.2)",marginBottom:24 }}>{nickname.length}/24</div>

        {err && <div style={{ textAlign:"center",color:C2,fontFamily:"'DM Sans',sans-serif",fontSize:12,marginBottom:12 }}>{err}</div>}

        <motion.button whileTap={{ scale:.97 }} onClick={handleNicknameNext}
          disabled={!nickname.trim() || joining}
          style={{ width:"100%",borderRadius:18,padding:"16px",border:"none",cursor:"pointer",
            background: nickname.trim() ? `linear-gradient(135deg,${N},#7DC900)` : "rgba(255,255,255,.08)",
            fontFamily:"'DM Sans',sans-serif",fontWeight:800,fontSize:16,
            color: nickname.trim() ? "#000" : "rgba(255,255,255,.25)",
            transition:"all .2s",letterSpacing:".5px",
            opacity: joining ? .6 : 1 }}>
          {joining ? "Joining..." : isSeeded ? "Next — Pick Your Tier →" : "Join League →"}
        </motion.button>
      </div>
    </div>
  );

  // ── Step 2: Tier selection ───────────────────────────────────────────────
  if (step === 2) return (
    <div style={{ position:"fixed",inset:0,background:BG,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"0 24px",overflowY:"auto",zIndex:3000 }}>
      <GridBg/><GlowBlobs/>
      <div style={{ width:"100%",maxWidth:390,position:"relative",zIndex:1,paddingTop:24,paddingBottom:24 }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:42,letterSpacing:"3px",color:"#fff",lineHeight:1 }}>
            SELECT YOUR <span style={{ color:N }}>TIER</span>
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,.38)",marginTop:8 }}>
            Helps the admin seed the bracket fairly
          </div>
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:20 }}>
          {TIER_ORDER.map(t => {
            const meta = TIER_META[t];
            const sel  = tier === t;
            return (
              <motion.button key={t} whileTap={{ scale:.97 }}
                onClick={() => { setTier(t); doJoin(t); }}
                disabled={joining}
                style={{ width:"100%",borderRadius:18,padding:"16px 20px",cursor:"pointer",
                  display:"flex",alignItems:"center",gap:14,textAlign:"left",
                  background: sel ? meta.bg : "rgba(255,255,255,.03)",
                  border:`1.5px solid ${sel ? meta.border : "rgba(255,255,255,.08)"}`,
                  transition:"all .15s",opacity:joining&&!sel?.45:1 }}>
                <div style={{ width:46,height:46,borderRadius:14,flexShrink:0,display:"flex",
                  alignItems:"center",justifyContent:"center",background:meta.bg,border:`1px solid ${meta.border}` }}>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:meta.color }}>{t}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:16,fontWeight:700,color:meta.color,lineHeight:1,marginBottom:3 }}>
                    {meta.label}
                  </div>
                  <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.38)" }}>
                    {meta.desc}
                  </div>
                </div>
                {sel && joining && (
                  <div style={{ width:18,height:18,borderRadius:"50%",border:`2px solid transparent`,
                    borderTopColor:meta.color,animation:"spin .7s linear infinite",flexShrink:0 }}/>
                )}
              </motion.button>
            );
          })}
        </div>

        {err && <div style={{ textAlign:"center",color:C2,fontFamily:"'DM Sans',sans-serif",fontSize:12,marginBottom:12 }}>{err}</div>}

        <div style={{ textAlign:"center" }}>
          <button onClick={() => setStep(1)} style={{ background:"none",border:"none",cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.28)",fontWeight:600 }}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Confirmation ─────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed",inset:0,background:BG,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"0 32px",zIndex:3000,textAlign:"center" }}>
      <GridBg/><GlowBlobs/>
      <div style={{ position:"relative",zIndex:1 }}>
        <motion.div initial={{ scale:.5,opacity:0 }} animate={{ scale:1,opacity:1 }}
          transition={{ type:"spring",stiffness:320,damping:22 }}
          style={{ fontSize:72,marginBottom:16 }}>🎉</motion.div>
        <motion.div initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} transition={{ delay:.2 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:48,letterSpacing:"3px",color:"#fff",lineHeight:1,marginBottom:6 }}>
            YOU&apos;RE <span style={{ color:N }}>IN!</span>
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:600,color:"rgba(255,255,255,.55)",marginBottom:8 }}>
            {nickname.trim() || defaultNickname}
            {tier && <> · <span style={{ color: TIER_META[tier]?.color }}>{TIER_META[tier]?.label}</span></>}
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,.3)",lineHeight:1.6,maxWidth:280,margin:"0 auto 32px" }}>
            Wait for the admin to start the tournament.
            <br/>You&apos;ll be notified when the bracket drops.
          </div>
          <motion.button whileTap={{ scale:.97 }} onClick={onDone}
            style={{ borderRadius:18,padding:"14px 40px",border:`1.5px solid rgba(170,255,0,.4)`,
              background:`linear-gradient(135deg,${N},#7DC900)`,cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif",fontWeight:800,fontSize:15,color:"#000",letterSpacing:".5px" }}>
            Go to Hub
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// JOIN TIER SCREEN — shown to QR joiners of seeded tournaments
// ─────────────────────────────────────────────
function JoinTierScreen({ user, leagueId, onDone }) {
  const [selected, setSelected] = useState(null);
  const [saving,   setSaving]   = useState(false);

  const handlePick = async (tier) => {
    if (saving) return;
    setSelected(tier);
    setSaving(true);
    try {
      const { data: pRow } = await supabase.from("players").select("id,stats")
        .eq("league_id", leagueId).eq("user_id", user.id).maybeSingle();
      if (pRow) {
        await supabase.from("players").update({ stats: { ...(pRow.stats || {}), tier } }).eq("id", pRow.id);
      }
    } catch { /* ignore */ }
    setSaving(false);
    onDone();
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:3000,background:BG,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"0 24px" }}>
      <GridBg/><GlowBlobs/>
      <div style={{ width:"100%",maxWidth:390,position:"relative",zIndex:1 }}>
        <div style={{ textAlign:"center",marginBottom:32 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:42,letterSpacing:"3px",color:"#fff",lineHeight:1 }}>
            SELECT YOUR <span style={{ color:N }}>TIER</span>
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,.38)",marginTop:8 }}>
            This helps the admin seed the bracket fairly
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {TIER_ORDER.map(t => {
            const meta = TIER_META[t];
            const isSelected = selected === t;
            return (
              <motion.button key={t} whileTap={{ scale:.97 }}
                onClick={() => handlePick(t)} disabled={saving}
                style={{ width:"100%",borderRadius:18,padding:"16px 20px",cursor:"pointer",
                  display:"flex",alignItems:"center",gap:14,textAlign:"left",
                  background: isSelected ? meta.bg : "rgba(255,255,255,.03)",
                  border: `1.5px solid ${isSelected ? meta.border : "rgba(255,255,255,.08)"}`,
                  transition:"all .15s ease",opacity:saving&&!isSelected?.45:1 }}>
                <div style={{ width:44,height:44,borderRadius:14,flexShrink:0,display:"flex",
                  alignItems:"center",justifyContent:"center",
                  background:meta.bg,border:`1px solid ${meta.border}` }}>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:meta.color }}>{t}</span>
                </div>
                <div>
                  <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:16,fontWeight:700,color:meta.color,lineHeight:1,marginBottom:3 }}>
                    {meta.label}
                  </div>
                  <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.38)" }}>
                    {meta.desc}
                  </div>
                </div>
                {isSelected && saving && (
                  <div style={{ marginLeft:"auto",width:18,height:18,borderRadius:"50%",
                    border:"2px solid transparent",borderTopColor:meta.color,
                    animation:"spin .7s linear infinite",flexShrink:0 }}/>
                )}
              </motion.button>
            );
          })}
        </div>
        <div style={{ textAlign:"center",marginTop:20 }}>
          <button onClick={onDone} style={{ background:"none",border:"none",cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.28)",fontWeight:600 }}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LOBBY SCREEN — Kahoot-style invite panel
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// DRAW REVEAL — helper: flicker-resolve name
// ─────────────────────────────────────────────
function FlickerName({ name, isActive, delay = 0 }) {
  const [display, setDisplay] = useState("▓▓▓▓▓▓▓▓");
  const raf = useRef(null);
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%$!";

  useEffect(() => {
    if (!isActive) return;
    const DURATION = 720;
    let started = false;
    let startTs = null;

    const tick = (now) => {
      if (!started) {
        if (!startTs) startTs = now + delay;
        if (now < startTs) { raf.current = requestAnimationFrame(tick); return; }
        started = true;
        startTs = now;
      }
      const t = Math.min((now - startTs) / DURATION, 1);
      const resolved = Math.floor(t * name.length);
      let s = name.slice(0, resolved);
      for (let i = resolved; i < name.length; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
      setDisplay(s || "▓");
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(name);
    };

    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [isActive, name, delay]);

  return <>{display}</>;
}

// ─────────────────────────────────────────────
// DRAW REVEAL — group card with staggered slots
// ─────────────────────────────────────────────
const REVEAL_GROUP_COLORS = ["#00BFFF","#39FF14","#FF1493","#FF6600","#9B59FF","#00FFCC","#FFD700"];

function GroupRevealCard({ group, groupIndex, isVisible, onComplete }) {
  const [visCount, setVisCount] = useState(0);
  const n = group.participants.length;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isVisible || visCount >= n) return;
    const t = setTimeout(() => setVisCount(c => c + 1), visCount === 0 ? 320 : 490);
    return () => clearTimeout(t);
  }, [isVisible, visCount, n]);

  // Fire onComplete exactly once when the last slot locks in
  useEffect(() => {
    if (isVisible && n > 0 && visCount >= n && !firedRef.current) {
      firedRef.current = true;
      onComplete?.();
    }
  }, [isVisible, visCount, n, onComplete]);

  const gc = REVEAL_GROUP_COLORS[groupIndex % REVEAL_GROUP_COLORS.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 44 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      style={{ marginBottom: 22, borderRadius: 18, overflow: "hidden",
        border: `1px solid ${gc}30`, background: "rgba(0,0,0,.72)", backdropFilter: "blur(10px)" }}
    >
      {/* Group header */}
      <div style={{ padding: "11px 20px", background: `${gc}0d`,
        borderBottom: `1px solid ${gc}20`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, letterSpacing: "5px",
          color: gc, opacity: 0.65 }}>GROUP</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: gc, lineHeight: 1,
          textShadow: `0 0 22px ${gc}` }}>
          {group.name}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: "rgba(255,255,255,.28)", letterSpacing: "1px" }}>
          {n} PLAYERS
        </div>
      </div>

      {/* Player slots */}
      <div style={{ padding: "6px 0" }}>
        {group.participants.map((p, i) => {
          const tier   = p.tier;
          const tm     = tier ? TIER_META[tier] : null;
          const active = i < visCount;
          return (
            <motion.div key={p.id || p.name + i}
              initial={{ opacity: 0, x: -18 }}
              animate={active ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.32, ease: "easeOut" }}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 20px",
                borderBottom: i < n - 1 ? "1px solid rgba(255,255,255,.05)" : "none" }}
            >
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
                color: "rgba(255,255,255,.22)", width: 22, textAlign: "right", flexShrink: 0 }}>
                {String(i + 1).padStart(2, "0")}
              </div>

              <div style={{ flex: 1, fontFamily: "'Bebas Neue',sans-serif", fontSize: 22,
                letterSpacing: "1px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                color: active ? (tm?.color || "#fff") : "rgba(255,255,255,.12)",
                textShadow: active && tm ? `0 0 16px ${tm.color}88` : "none",
                transition: "color .3s,text-shadow .3s" }}>
                {active ? <FlickerName name={p.name} isActive delay={0} /> : "▓▓▓▓▓▓▓▓"}
              </div>

              {tier && active && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.65, type: "spring", stiffness: 420, damping: 22 }}
                  style={{ borderRadius: 8, padding: "3px 10px", background: tm.bg,
                    border: `1px solid ${tm.border}`, fontFamily: "'DM Sans',sans-serif",
                    fontSize: 11, fontWeight: 800, color: tm.color, flexShrink: 0,
                    boxShadow: `0 0 12px ${tm.color}50` }}>
                  {tier}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// DRAW REVEAL OVERLAY — fullscreen cinematic
// ─────────────────────────────────────────────
function DrawRevealOverlay({ groups = [], bracket = null, tournFormat, leagueName, isAdmin, isSpectator = false, onConfirm }) {
  const [visGroupCount,    setVisGroupCount]    = useState(0);
  const [currentGroupDone, setCurrentGroupDone] = useState(false);
  const [allRevealed,      setAllRevealed]      = useState(false);
  const [locking,          setLocking]          = useState(false);
  const scrollRef      = useRef(null);
  const groupRefs      = useRef([]);

  const displayGroups = useMemo(() => {
    if (tournFormat === "groups_knockout" || groups.length > 0) return groups;
    if (bracket?.rounds?.length) {
      return bracket.rounds.slice(0, 1).map((round, i) => ({
        name: `ROUND ${i + 1}`,
        participants: round
          .flatMap(m => [m.p1, m.p2].filter(p => p && !p.isTBD))
          .filter((p, idx, arr) => arr.findIndex(x => (x.id || x.name) === (p.id || p.name)) === idx),
      }));
    }
    return [];
  }, [groups, bracket, tournFormat]);

  // Reveal first group after intro
  useEffect(() => {
    if (displayGroups.length === 0) { const t = setTimeout(() => setAllRevealed(true), 2200); return () => clearTimeout(t); }
    const t = setTimeout(() => setVisGroupCount(1), 1900);
    return () => clearTimeout(t);
  }, [displayGroups.length]);

  // Spectator: auto-advance to next group 700ms after each group completes
  useEffect(() => {
    if (!isSpectator || !currentGroupDone) return;
    const next = visGroupCount + 1;
    // Intentional: terminal step of the draw-reveal animation sequence — all groups have been shown
    if (next > displayGroups.length) { setAllRevealed(true); return; } // eslint-disable-line react-hooks/set-state-in-effect
    const t = setTimeout(() => { setVisGroupCount(next); setCurrentGroupDone(false); }, 700);
    return () => clearTimeout(t);
  }, [isSpectator, currentGroupDone, visGroupCount, displayGroups.length]);

  // Auto-scroll the scroll container to the latest group card
  useEffect(() => {
    if (visGroupCount < 1) return;
    const el = groupRefs.current[visGroupCount - 1];
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }, [visGroupCount]);

  // Called by GroupRevealCard when its last player locks in
  const handleGroupComplete = useCallback(() => {
    setCurrentGroupDone(true);
    // Spectator auto-advance is handled by the effect above.
    // Admin waits for "Next Group" click.
    // If there are no more groups at all, mark all revealed immediately for spectators.
  }, []);

  // Admin clicks "Next Group →" or gets final CTA
  const handleNextGroup = () => {
    const next = visGroupCount + 1;
    if (next > displayGroups.length) {
      setAllRevealed(true);
    } else {
      setVisGroupCount(next);
      setCurrentGroupDone(false);
    }
  };

  const handleConfirm = async () => {
    setLocking(true);
    try { await onConfirm?.(); } catch { /* ignore */ }
    setLocking(false);
  };

  const isLastGroup   = visGroupCount >= displayGroups.length;
  const showNextBtn   = isAdmin && !isSpectator && currentGroupDone && !allRevealed && !isLastGroup;
  const showLockBtn   = isAdmin && !isSpectator && currentGroupDone && !allRevealed && isLastGroup;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000",
      overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ position: "relative", zIndex: 2, padding: "16px 20px 12px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>

        {/* Left spacer — mirrors the skip button width so title stays centred */}
        <div style={{ width: 80 }} />

        {/* Centred title */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: "3px",
            color: N, lineHeight: 1, textShadow: `0 0 20px rgba(170,255,0,.6)` }}>
            Tournament Draw
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11,
            color: "rgba(170,255,0,.55)", marginTop: 3 }}>
            {leagueName}
          </div>
        </motion.div>

        {/* Skip button — always visible */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          whileTap={{ scale: 0.94 }}
          onClick={handleConfirm}
          style={{ width: 80, borderRadius: 12, padding: "8px 0", cursor: "pointer",
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)",
            fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
            color: "rgba(255,255,255,.5)", letterSpacing: ".3px", flexShrink: 0 }}>
          Skip →
        </motion.button>
      </div>

      {/* Thin divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,.07)", flexShrink: 0, position: "relative", zIndex: 2 }} />

      {/* Scrollable groups */}
      <div ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2, padding: "4px 20px 16px" }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          {displayGroups.slice(0, visGroupCount).map((g, i) => (
            <div key={g.name} ref={el => { groupRefs.current[i] = el; }}>
              <GroupRevealCard
                group={g}
                groupIndex={i}
                isVisible
                onComplete={i === visGroupCount - 1 ? handleGroupComplete : undefined}
              />
            </div>
          ))}

          {/* Initial "scanning..." before first group */}
          {visGroupCount === 0 && (
            <motion.div animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ repeat: Infinity, duration: 1.4 }}
              style={{ textAlign: "center", padding: "48px 0", fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11, letterSpacing: "4px", color: "rgba(170,255,0,.5)" }}>
              SCANNING DATABASE...
            </motion.div>
          )}
        </div>
      </div>

      {/* Sticky footer — progress counter + action buttons */}
      <div style={{ position: "relative", zIndex: 2, padding: "14px 20px 36px", flexShrink: 0,
        textAlign: "center", borderTop: "1px solid rgba(170,255,0,.08)",
        background: "linear-gradient(0deg,rgba(0,0,0,.9) 80%,transparent)" }}>

        <AnimatePresence mode="wait">

          {/* Scanning / in-progress counter */}
          {!currentGroupDone && !allRevealed && visGroupCount > 0 && (
            <motion.div key="counter"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: "4px",
                color: "rgba(170,255,0,.35)", paddingBottom: 4 }}>
              GROUP {String.fromCharCode(64 + visGroupCount)} INCOMING — {visGroupCount} / {displayGroups.length}
            </motion.div>
          )}

          {/* Admin: Next Group button */}
          {(showNextBtn) && (
            <motion.div key="next-btn"
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}>
              <motion.button
                whileTap={{ scale: 0.96 }}
                animate={{ boxShadow: ["0 0 16px rgba(0,212,255,.3)", "0 0 42px rgba(0,212,255,.7)", "0 0 16px rgba(0,212,255,.3)"] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                onClick={handleNextGroup}
                style={{ width: "100%", maxWidth: 480, borderRadius: 18, padding: "18px 24px",
                  cursor: "pointer", border: "1.5px solid rgba(0,212,255,.5)",
                  background: "rgba(0,212,255,.1)", fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: 26, letterSpacing: "3px", color: "#00D4FF",
                  display: "block", margin: "0 auto" }}>
                REVEAL GROUP {String.fromCharCode(65 + visGroupCount)} →
              </motion.button>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: "3px",
                color: "rgba(255,255,255,.22)", marginTop: 10 }}>
                {visGroupCount} / {displayGroups.length} GROUPS REVEALED
              </div>
            </motion.div>
          )}

          {/* Admin: Lock Brackets (last group done, not yet confirmed) */}
          {(showLockBtn || (allRevealed && isAdmin && !isSpectator)) && (
            <motion.div key="lock-btn"
              initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 180, damping: 18 }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                animate={{ boxShadow: [
                  `0 0 20px rgba(170,255,0,.35)`,
                  `0 0 55px rgba(170,255,0,.75)`,
                  `0 0 20px rgba(170,255,0,.35)`,
                ]}}
                transition={{ repeat: Infinity, duration: 1.8 }}
                onClick={handleConfirm} disabled={locking}
                style={{ width: "100%", maxWidth: 480, borderRadius: 18, padding: "20px",
                  cursor: locking ? "not-allowed" : "pointer",
                  background: `linear-gradient(135deg,${N},#7DC900)`,
                  border: "none", fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: 28, letterSpacing: "3px", color: "#000",
                  opacity: locking ? 0.7 : 1, display: "block", margin: "0 auto" }}>
                {locking ? "LOCKING..." : "🔒  LOCK BRACKETS & START"}
              </motion.button>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: "3px",
                color: "rgba(170,255,0,.35)", marginTop: 10 }}>
                ALL {displayGroups.length} GROUPS REVEALED
              </div>
            </motion.div>
          )}

          {/* Spectator waiting */}
          {allRevealed && isSpectator && (
            <motion.div key="spec" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13,
                color: "rgba(255,255,255,.38)", lineHeight: 1.6 }}>
              Waiting for admin to lock brackets and start...
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LOBBY SCREEN
// ─────────────────────────────────────────────
function LobbyScreen({ leagueId, joinCode, leagueName, user, ownerId, onClose }) {
  const [livePlayers,    setLivePlayers]    = useState([]);
  const [locking,        setLocking]        = useState(false);
  const [locked,         setLocked]         = useState(false);
  const [lobbyPin,       setLobbyPin]       = useState(null);
  const [tournFormat,    setTournFormat]    = useState(null);
  const [grpSettings,    setGrpSettings]    = useState({ playersPerGroup: 4, advancingPerGroup: 2 });
  const [hasBracket,     setHasBracket]     = useState(false);
  const [isSeeded,       setIsSeeded]       = useState(false);
  const [commJoining,    setCommJoining]    = useState(false);
  const [showTierModal,  setShowTierModal]  = useState(false);
  const [generating,     setGenerating]     = useState(false);
  const [generated,      setGenerated]      = useState(false);
  const [showDrawReveal, setShowDrawReveal] = useState(false);
  const [drawGroups,     setDrawGroups]     = useState([]);
  const [drawBracket,    setDrawBracket]    = useState(null);
  const [drawSpectator,  setDrawSpectator]  = useState(false);

  const isAdmin      = !!(user?.id && ownerId && user.id === ownerId);
  const isTournament = !!(tournFormat && tournFormat !== "classic");
  const commInLobby  = livePlayers.some(p => p.user_id === user?.id);

  // Self-fetch all needed settings on mount
  useEffect(() => {
    supabase.from("leagues").select("settings").eq("id", leagueId).maybeSingle()
      .then(({ data }) => {
        const s = data?.settings || {};
        if (s.lobbyPin)                              setLobbyPin(s.lobbyPin);
        if (s.lobbyState === "locked")               setLocked(true);
        if (s.tournamentFormat)                      setTournFormat(s.tournamentFormat);
        if (s.groupSettings)                         setGrpSettings(s.groupSettings);
        if (s.bracket || s.groups?.length > 0)      setHasBracket(true);
        if ((s.participants || []).some(p => p.tier)) setIsSeeded(true);
        // Spectator: show draw overlay if admin already triggered it
        if (s.lobbyState === "draw_in_progress" && !isAdmin) {
          setDrawGroups(s.groups || []);
          setDrawBracket(s.bracket || null);
          setDrawSpectator(true);
          setShowDrawReveal(true);
        }
      }).catch(() => {});
  }, [leagueId, isAdmin]);

  const displayPin = lobbyPin || (joinCode || "").toUpperCase();
  const joinUrl    = `https://league-it-app.vercel.app/join/${lobbyPin || joinCode || leagueId}`;
  const qrUrl      = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}&bgcolor=0a0a0a&color=aaff00&margin=14&format=png&ecc=M`;

  const fetchPlayers = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { data } = await supabase.from("players")
        .select("id,name,stats,created_at,user_id")
        .eq("league_id", leagueId).order("created_at", { ascending: true });
      if (data) setLivePlayers(data);
    } catch { /* ignore */ }
  }, [leagueId]);

  useEffect(() => {
    fetchPlayers(); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch; setState runs after await, not synchronously
    if (locked) return;
    const t = setInterval(fetchPlayers, 4000);
    return () => clearInterval(t);
  }, [fetchPlayers, locked]);

  const handleLock = async () => {
    if (!isAdmin || locking) return;
    setLocking(true);
    try {
      const { data: lg } = await supabase.from("leagues").select("settings").eq("id", leagueId).maybeSingle();
      await supabase.from("leagues").update({ settings: { ...(lg?.settings||{}), lobbyState:"locked" } }).eq("id", leagueId);
      setLocked(true);
    } catch { /* ignore */ }
    setLocking(false);
  };

  const doCommissionerJoin = async (tier = null) => {
    if (!user || commInLobby || commJoining) return;
    setCommJoining(true);
    setShowTierModal(false);
    try {
      const name     = user.user_metadata?.full_name || user.email || "Commissioner";
      const initials = name.trim().split(/\s+/).map(w => (w[0]||"").toUpperCase()).slice(0, 2).join("");
      await supabase.from("players").insert({
        league_id: leagueId, user_id: user.id, name, is_me: true,
        stats: { initials, wins:0, losses:0, streak:0, totalPlayed:0, trend:"flat",
                 sport:"🏸", mvTrend:[0,0,0,0,0,0,0], partners:{}, clutchWins:0, bestStreak:0,
                 tier: tier || null },
      });
      await fetchPlayers();
    } catch { /* ignore */ }
    setCommJoining(false);
  };

  const handleGenerate = async () => {
    if (!isAdmin || generating || generated || livePlayers.length < 2) return;
    setGenerating(true);
    try {
      const participants = livePlayers.map(p => ({
        id: p.id, name: p.name, tier: p.stats?.tier || null,
      }));
      const { data: lg } = await supabase.from("leagues").select("settings").eq("id", leagueId).maybeSingle();
      const base = { ...(lg?.settings || {}), participants };
      let newSettings;
      let revealGroups = [];
      let revealBracket = null;
      if (tournFormat === "groups_knockout") {
        const { groups: g, groupMatches: gm } = generateGroupStage(participants, grpSettings.playersPerGroup || 4);
        newSettings = { ...base, groups: g, groupMatches: gm, lobbyState: "draw_in_progress" };
        revealGroups = g;
      } else {
        const bkt = generateKnockoutBracket(participants);
        newSettings = { ...base, bracket: bkt, lobbyState: "draw_in_progress" };
        revealBracket = bkt;
      }
      await supabase.from("leagues").update({ settings: newSettings }).eq("id", leagueId);
      setGenerated(true);
      setHasBracket(true);
      setDrawGroups(revealGroups);
      setDrawBracket(revealBracket);
      setDrawSpectator(false);
      setShowDrawReveal(true);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:2000,background:BG,display:"flex",flexDirection:"column",
      alignItems:"center",overflowY:"auto" }}>
      <GridBg/><GlowBlobs/>

      {/* Fullscreen cinematic draw reveal */}
      <AnimatePresence>
        {showDrawReveal && (
          <DrawRevealOverlay
            groups={drawGroups}
            bracket={drawBracket}
            tournFormat={tournFormat}
            leagueName={leagueName}
            leagueId={leagueId}
            isAdmin={isAdmin && !drawSpectator}
            isSpectator={drawSpectator}
            onConfirm={async () => {
              try {
                const { data: lg } = await supabase.from("leagues").select("settings").eq("id", leagueId).maybeSingle();
                await supabase.from("leagues").update({
                  settings: { ...(lg?.settings || {}), lobbyState: "active" },
                }).eq("id", leagueId);
              } catch { /* ignore */ }
              setShowDrawReveal(false);
              onClose();
            }}
          />
        )}
      </AnimatePresence>

      {/* Tier picker modal — shown for commissioner on seeded tournaments */}
      <AnimatePresence>
        {showTierModal && (
          <motion.div key="tier-modal"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ position:"fixed",inset:0,zIndex:4000,background:"rgba(0,0,0,.8)",display:"flex",
              alignItems:"center",justifyContent:"center",padding:"0 24px" }}>
            <motion.div initial={{ scale:.9,y:20 }} animate={{ scale:1,y:0 }} exit={{ scale:.9,y:20 }}
              style={{ width:"100%",maxWidth:360,borderRadius:24,background:"#141414",
                border:"1px solid rgba(255,255,255,.1)",padding:"24px 20px" }}>
              <div style={{ textAlign:"center",marginBottom:20 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:"2px",color:"#fff" }}>
                  YOUR TIER
                </div>
                <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.38)",marginTop:4 }}>
                  Select your skill tier as Commissioner
                </div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {TIER_ORDER.map(t => {
                  const meta = TIER_META[t];
                  return (
                    <motion.button key={t} whileTap={{ scale:.97 }}
                      onClick={() => doCommissionerJoin(t)}
                      style={{ borderRadius:14,padding:"12px 16px",cursor:"pointer",display:"flex",
                        alignItems:"center",gap:12,background:meta.bg,border:`1.5px solid ${meta.border}` }}>
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:meta.color,width:24 }}>{t}</span>
                      <div>
                        <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:700,color:meta.color }}>{meta.label}</div>
                        <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"rgba(255,255,255,.38)" }}>{meta.desc}</div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              <button onClick={() => setShowTierModal(false)}
                style={{ width:"100%",marginTop:14,background:"none",border:"none",cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.3)",fontWeight:600 }}>
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ width:"100%",maxWidth:430,padding:"0 0 48px",position:"relative",zIndex:1 }}>

        {/* Header */}
        <div style={{ padding:"20px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:"3px",color:"rgba(255,255,255,.45)" }}>LOBBY</div>
          <motion.button whileTap={{ scale:.9 }} onClick={onClose}
            style={{ width:36,height:36,borderRadius:18,background:"rgba(255,255,255,.07)",
              border:"1px solid rgba(255,255,255,.12)",display:"flex",alignItems:"center",
              justifyContent:"center",cursor:"pointer" }}>
            <X size={18} style={{ color:"rgba(255,255,255,.55)" }}/>
          </motion.button>
        </div>

        {/* League name + total players counter */}
        <div style={{ textAlign:"center",padding:"14px 20px 0" }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:"4px",color:"#fff",lineHeight:1 }}>
            {leagueName || "LEAGUE"}
          </div>
          {/* Total players pill */}
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,marginTop:10,
            borderRadius:20,padding:"6px 16px",
            background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)" }}>
            <Users size={13} style={{ color:N }}/>
            <span style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:"1px",color:N }}>
              {livePlayers.length}
            </span>
            <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:"rgba(255,255,255,.4)" }}>
              {livePlayers.length === 1 ? "Player Joined" : "Players Joined"}
            </span>
          </div>
          <div style={{ fontSize:11,color:"rgba(255,255,255,.25)",fontFamily:"'DM Sans',sans-serif",marginTop:6 }}>
            {locked ? "Lobby locked — no new players can join" : "Waiting for players to join..."}
          </div>
        </div>

        {/* PIN display */}
        <div style={{ margin:"16px 20px 0",borderRadius:20,padding:"20px",
          background:"rgba(170,255,0,.05)",border:`1.5px solid rgba(170,255,0,${locked?.15:.28})`,textAlign:"center" }}>
          <div style={{ fontSize:10,fontWeight:800,letterSpacing:"2.5px",color:"rgba(255,255,255,.3)",
            fontFamily:"'DM Sans',sans-serif",marginBottom:16 }}>GAME PIN</div>
          <div style={{ display:"flex",justifyContent:"center",gap:lobbyPin?10:7,marginBottom:16 }}>
            {displayPin.split("").map((ch, i) => (
              <motion.div key={i}
                initial={{ opacity:0,y:20,scale:.6 }} animate={{ opacity:1,y:0,scale:1 }}
                transition={{ delay:i*.06,type:"spring",stiffness:360,damping:22 }}
                style={{ width:lobbyPin?52:44,height:lobbyPin?64:54,borderRadius:12,
                  background:"rgba(170,255,0,.07)",border:`2px solid rgba(170,255,0,${locked?.1:.45})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Bebas Neue',sans-serif",fontSize:lobbyPin?40:28,letterSpacing:0,
                  color:locked?"rgba(170,255,0,.25)":N,
                  textShadow:locked?"none":`0 0 28px rgba(170,255,0,.7)` }}>
                {ch}
              </motion.div>
            ))}
          </div>
          {locked ? (
            <div style={{ display:"inline-flex",alignItems:"center",gap:6,borderRadius:20,padding:"5px 14px",
              background:"rgba(255,51,85,.1)",border:"1px solid rgba(255,51,85,.3)" }}>
              <div style={{ width:6,height:6,borderRadius:3,background:"#FF3355" }}/>
              <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:"#FF3355" }}>LOBBY LOCKED</span>
            </div>
          ) : (
            <div style={{ display:"inline-flex",alignItems:"center",gap:6,borderRadius:20,padding:"5px 14px",
              background:"rgba(170,255,0,.08)",border:"1px solid rgba(170,255,0,.2)" }}>
              <div style={{ width:6,height:6,borderRadius:3,background:N,animation:"hub-dot-pulse 1.4s ease-in-out infinite" }}/>
              <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:N }}>OPEN</span>
            </div>
          )}
        </div>

        {/* QR code */}
        <div style={{ margin:"12px 20px 0",borderRadius:20,padding:"20px",
          background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",
          display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
          <img src={qrUrl} alt="QR code" width={140} height={140}
            style={{ borderRadius:14,opacity:locked?.25:1,transition:"opacity .4s",display:"block" }}/>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:4 }}>Scan to join</div>
            <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:10,color:"rgba(255,255,255,.22)",wordBreak:"break-all",lineHeight:1.5 }}>
              league-it-app.vercel.app/join/{lobbyPin || joinCode || leagueId}
            </div>
          </div>
        </div>

        {/* Commissioner quick-join (admin only, not yet in lobby) */}
        {isAdmin && !commInLobby && !locked && (
          <div style={{ margin:"12px 20px 0" }}>
            <motion.button whileTap={{ scale:.97 }}
              onClick={() => isSeeded ? setShowTierModal(true) : doCommissionerJoin(null)}
              disabled={commJoining}
              style={{ width:"100%",borderRadius:16,padding:"14px 20px",cursor:"pointer",
                display:"flex",alignItems:"center",gap:12,
                background:"rgba(170,255,0,.08)",border:`1.5px solid rgba(170,255,0,.35)`,
                opacity:commJoining?.6:1,transition:"opacity .2s" }}>
              <div style={{ width:36,height:36,borderRadius:12,flexShrink:0,display:"flex",alignItems:"center",
                justifyContent:"center",background:`linear-gradient(135deg,${N},#7DC900)` }}>
                <Crown size={16} color="#000"/>
              </div>
              <div style={{ flex:1,textAlign:"left" }}>
                <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:800,color:N }}>
                  {commJoining ? "Joining..." : "Join as Commissioner"}
                </div>
                <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"rgba(255,255,255,.38)" }}>
                  Add yourself without scanning the QR
                </div>
              </div>
              <ChevronRight size={16} style={{ color:N,flexShrink:0 }}/>
            </motion.button>
          </div>
        )}

        {/* Player list */}
        <div style={{ margin:"16px 20px 0" }}>
          <AnimatePresence initial={false}>
            {livePlayers.length === 0 ? (
              <motion.div key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ textAlign:"center",padding:"28px 0",color:"rgba(255,255,255,.2)",
                  fontFamily:"'DM Sans',sans-serif",fontSize:13 }}>
                No players yet — share the PIN!
              </motion.div>
            ) : (
              livePlayers.map((p, i) => {
                const tier      = p.stats?.tier;
                const tm        = tier ? TIER_META[tier] : null;
                const ini       = (p.name||"?").trim().split(/\s+/).map(w=>(w[0]||"").toUpperCase()).slice(0,2).join("");
                const isCommRow = p.user_id === user?.id;
                return (
                  <motion.div key={p.id}
                    initial={{ opacity:0,x:-24 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:24 }}
                    transition={{ delay:Math.min(i,.8)*.05,type:"spring",stiffness:280,damping:24 }}
                    style={{ display:"flex",alignItems:"center",gap:12,padding:"10px 14px",marginBottom:8,
                      borderRadius:14,
                      background: isCommRow ? "rgba(170,255,0,.06)" : "rgba(255,255,255,.04)",
                      border: isCommRow ? `1px solid rgba(170,255,0,.22)` : "1px solid rgba(255,255,255,.07)" }}>
                    <div style={{ width:38,height:38,borderRadius:19,flexShrink:0,display:"flex",
                      alignItems:"center",justifyContent:"center",
                      background: isCommRow ? `linear-gradient(135deg,${N},#7DC900)` : "rgba(255,255,255,.1)",
                      fontFamily:"'DM Sans',sans-serif",fontWeight:800,fontSize:13,color:isCommRow?"#000":"#fff" }}>
                      {isCommRow ? <Crown size={16} color="#000"/> : ini}
                    </div>
                    <div style={{ flex:1,fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:700,
                      color:isCommRow?N:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
                      {p.name || "Player"}
                      {isCommRow && <span style={{ fontSize:10,fontWeight:600,color:"rgba(170,255,0,.55)",marginLeft:6 }}>ADMIN</span>}
                    </div>
                    {tm && (
                      <div style={{ borderRadius:8,padding:"3px 9px",background:tm.bg,border:`1px solid ${tm.border}`,
                        fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:800,color:tm.color,flexShrink:0 }}>
                        {tier}
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Admin action strip */}
        <div style={{ padding:"16px 20px 0",display:"flex",flexDirection:"column",gap:10 }}>

          {/* Lock Lobby — admin, not yet locked */}
          {isAdmin && !locked && (
            <motion.button whileTap={{ scale:.97 }} onClick={handleLock} disabled={locking}
              style={{ width:"100%",borderRadius:16,padding:"14px",border:"1.5px solid rgba(255,51,85,.4)",
                background:"rgba(255,51,85,.08)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
                fontWeight:800,fontSize:14,color:"#FF3355",letterSpacing:".5px",
                opacity:locking?.6:1,transition:"opacity .2s" }}>
              {locking ? "Locking..." : "🔒 Lock Lobby — No More Joins"}
            </motion.button>
          )}

          {/* Generate bracket — admin only, tournament only, not already generated */}
          {isAdmin && isTournament && !hasBracket && (
            <motion.button whileTap={{ scale:.97 }} onClick={handleGenerate}
              disabled={generating || livePlayers.length < 2}
              style={{ width:"100%",borderRadius:16,padding:"14px",cursor:"pointer",
                background: generated ? "rgba(170,255,0,.08)" : `linear-gradient(135deg,${N},#7DC900)`,
                border: generated ? `1.5px solid rgba(170,255,0,.4)` : "none",
                fontFamily:"'DM Sans',sans-serif",fontWeight:800,fontSize:14,letterSpacing:".5px",
                color: generated ? N : "#000",
                opacity: (generating || livePlayers.length < 2) ? .5 : 1,
                transition:"opacity .2s" }}>
              {generating ? "Generating..." :
               livePlayers.length < 2 ? "Add at least 2 players first" :
               tournFormat === "groups_knockout" ? `🎲 GENERATE DRAW — ${livePlayers.length} Players` :
               `🏆 GENERATE DRAW — ${livePlayers.length} Players`}
            </motion.button>
          )}

          {/* Success state after generation */}
          {generated && (
            <div style={{ borderRadius:16,padding:"12px 16px",background:"rgba(170,255,0,.06)",
              border:`1px solid rgba(170,255,0,.25)`,textAlign:"center" }}>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:N }}>
                ✓ {tournFormat === "groups_knockout" ? "Groups generated" : "Bracket generated"} — go to the Bracket tab to start
              </div>
            </div>
          )}

          {/* Already has bracket — info */}
          {isAdmin && isTournament && hasBracket && !generated && (
            <div style={{ borderRadius:16,padding:"12px 16px",background:"rgba(170,255,0,.04)",
              border:`1px solid rgba(170,255,0,.15)`,textAlign:"center" }}>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)" }}>
                Draw already generated — manage it in the Bracket tab
              </div>
            </div>
          )}

          {/* Non-admin waiting message (tournament only, no bracket yet) */}
          {!isAdmin && isTournament && !hasBracket && (
            <div style={{ borderRadius:16,padding:"16px",background:"rgba(255,255,255,.03)",
              border:"1.5px dashed rgba(255,255,255,.12)",textAlign:"center" }}>
              <div style={{ fontSize:28,marginBottom:8 }}>⏳</div>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,color:"rgba(255,255,255,.45)",lineHeight:1.5 }}>
                Waiting for the admin to generate matches...
              </div>
            </div>
          )}

          {/* Back to League */}
          <motion.button whileTap={{ scale:.97 }} onClick={onClose}
            style={{ width:"100%",borderRadius:16,padding:"14px",
              border:`1.5px solid rgba(255,255,255,.12)`,
              background:"rgba(255,255,255,.05)",cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,
              color:"rgba(255,255,255,.55)",letterSpacing:".5px" }}>
            ← Back to League
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LEAGUEITONBOARDING
// ─────────────────────────────────────────────
function LeagueItOnboarding({ onFinish, initialStep = 0, onBackToHub = null, user = null, onSignIn = null, hasPendingJoin = false }) {
  const [step, setStep] = useState(initialStep);
  const [dir,  setDir]  = useState(1);

  const [sport,             setSport]             = useState(null);
  const [customSportName,   setCustomSportName]   = useState("");
  const [customSportEmoji,  setCustomSportEmoji]  = useState("🏆");
  const [tournamentFormat,  setTournamentFormat]  = useState("classic");
  const [participants,      setParticipants]      = useState([]);
  const [isLiveLobby,       setIsLiveLobby]       = useState(false);
  const [reportingMode,     setReportingMode]     = useState("admin");
  const [groupSettings,     setGroupSettings]     = useState({ playersPerGroup: 4, advancingPerGroup: 2 });
  const [matchLegs,         setMatchLegs]         = useState(1);
  const [format,            setFormat]            = useState("single");
  const [points,            setPoints]            = useState(21);
  const [customRules,       setCustomRules]       = useState("");
  const [leagueName,        setLeagueName]        = useState("");
  const [adminName,         setAdminName]         = useState(user?.user_metadata?.full_name || "");
  const [leagueCode]                              = useState(generateCode);
  const [saving,            setSaving]            = useState(false);
  const [createErr,         setCreateErr]         = useState("");

  const isNonClassic        = tournamentFormat !== "classic";
  const TOTAL_WIZARD_STEPS  = isNonClassic ? 9 : 6;
  const MAX_STEP            = isNonClassic ? 9 : 6;

  const goNext = useCallback(() => {
    setDir(1);
    setStep(s => Math.min(s + 1, MAX_STEP));
  }, [MAX_STEP]);

  const goBack = useCallback(() => {
    if (step <= initialStep) { if (onBackToHub) onBackToHub(); return; }
    setDir(-1);
    setStep(s => Math.max(s - 1, initialStep));
  }, [step, initialStep, onBackToHub]);

  const handleFinish = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setCreateErr("");
    try {
      await onFinish({ leagueName, adminName, sport, tournamentFormat, participants, reportingMode, groupSettings, matchLegs, format, points, customSportName, customSportEmoji, customRules, leagueCode, isLiveLobby });
    } catch (e) {
      console.error(e);
      setCreateErr("Something went wrong. Please try again.");
      setSaving(false);
    }
  }, [saving, onFinish, leagueName, adminName, sport, tournamentFormat, participants, format, points, customSportName, customSportEmoji, customRules, leagueCode, isLiveLobby]);

  const sportProps = { sport, setSport, customSportName, setCustomSportName, customSportEmoji, setCustomSportEmoji };
  const rulesProps = { format, setFormat, points, setPoints, customRules, setCustomRules };

  const screens = [
    <StepLanding key="landing" onNext={goNext} onSignIn={onSignIn} hasPendingJoin={hasPendingJoin} />,
    <StepSport   key="sport"   {...sportProps} onNext={goNext} />,
    <StepTournamentFormat
      key="tournament-format"
      tournamentFormat={tournamentFormat} setTournamentFormat={setTournamentFormat}
      groupSettings={groupSettings} setGroupSettings={setGroupSettings}
      onNext={goNext}
    />,
    // Non-classic: participants + reporting mode before rules
    ...(isNonClassic ? [
      <StepParticipants
        key="participants"
        participants={participants} setParticipants={setParticipants}
        setIsLiveLobby={setIsLiveLobby}
        onNext={goNext}
      />,
      <StepReportingMode
        key="reporting-mode"
        reportingMode={reportingMode} setReportingMode={setReportingMode}
        onNext={goNext}
      />,
      <StepMatchLegs
        key="match-legs"
        matchLegs={matchLegs} setMatchLegs={setMatchLegs}
        onNext={goNext}
      />,
    ] : []),
    <StepRules   key="rules"   {...rulesProps} onNext={goNext} />,
    <StepBranding
      key="branding"
      sport={sport} format={format} points={points}
      customSportName={customSportName} customSportEmoji={customSportEmoji}
      leagueName={leagueName} setLeagueName={setLeagueName}
      onNext={goNext}
    />,
    <StepProfile
      key="profile"
      adminName={adminName} setAdminName={setAdminName}
      onNext={goNext}
    />,
    <StepInvite
      key="invite"
      sport={sport} format={format} points={points}
      customSportName={customSportName} customSportEmoji={customSportEmoji} customRules={customRules}
      leagueName={leagueName} leagueCode={leagueCode}
      saving={saving} createErr={createErr}
      onFinish={handleFinish}
    />,
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: ${BG}; }
        ::-webkit-scrollbar { display: none; }
        input, button, textarea { -webkit-tap-highlight-color: transparent; font-family: inherit; }
        textarea { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: BG,
          color: "#fff",
          display: "flex",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <GridBg />
        <GlowBlobs />

        <div
          style={{
            width: "100%",
            maxWidth: 430,
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 1,
          }}
        >
          <AnimatePresence>
            {step > 0 && step < MAX_STEP && (
              <motion.div
                key="topnav"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <TopNav step={step} total={TOTAL_WIZARD_STEPS} onBack={goBack} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={step}
                custom={dir}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageTransition}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {screens[step]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// SQL MIGRATION — run once in Supabase SQL Editor:
//   ALTER TABLE public.players ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
//   CREATE INDEX IF NOT EXISTS players_user_id_idx ON public.players(user_id);
// ─────────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────────
function rowToPlayer(row, userId = null) {
  const s = row.stats || {};
  return {
    id:          row.id,
    name:        row.name,
    initials:    s.initials || (row.name || "").slice(0, 2).toUpperCase(),
    isMe:        userId ? row.user_id === userId : row.is_me,
    wins:        s.wins        || 0,
    losses:      s.losses      || 0,
    streak:      s.streak      || 0,
    totalPlayed: s.totalPlayed || 0,
    trend:       s.trend       || "flat",
    sport:       s.sport       || "🏸",
    mvTrend:     s.mvTrend     || [0,0,0,0,0,0,0],
    partners:    s.partners    || {},
    clutchWins:  s.clutchWins  || 0,
    bestStreak:  s.bestStreak  || 0,
  };
}

function playerToStats(p) {
  return {
    initials:    p.initials,
    wins:        p.wins,
    losses:      p.losses,
    streak:      p.streak,
    totalPlayed: p.totalPlayed,
    trend:       p.trend,
    sport:       p.sport,
    mvTrend:     p.mvTrend,
    partners:    p.partners,
    clutchWins:  p.clutchWins,
    bestStreak:  p.bestStreak,
  };
}


// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// LEAGUE HUB HELPERS
// ─────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const diffMs = Date.now() - d.getTime();
  const mins  = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days  = Math.floor(diffMs / 86400000);
  if (mins  <  1) return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  ===1) return "yesterday";
  if (days  <  7) return `${days}d ago`;
  if (days  < 30) return `${Math.floor(days/7)}w ago`;
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

function getSportEmoji(league) {
  const saved = league.settings?.sportEmoji;
  if (saved) return saved;
  const found = SPORTS.find(s => s.label === league.sport || s.id === league.sport);
  return found?.emoji || "🏆";
}

const HUB_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Sparkline — score per set as a polyline SVG
function SetSparkline({ sets, isWin }) {
  if (!sets || sets.length < 2) return null;
  const color = isWin ? N : "#FF3355";
  const pts = sets.map(s => {
    const [a, b] = String(s).split("-").map(Number);
    if (isNaN(a) || isNaN(b)) return 0;
    return isWin ? Math.max(a, b) : Math.min(a, b);
  });
  const W = 76, H = 28, pad = 3;
  const max = Math.max(...pts, 1);
  const n = pts.length;
  const xs = pts.map((_, i) => pad + (i / (n - 1)) * (W - pad * 2));
  const ys = pts.map(p => H - pad - (p / max) * (H - pad * 2.5));
  const polyPts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ overflow: "visible", display: "block" }}>
      <polyline points={polyPts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}99)` }} />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={2.5} fill={color}
          style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────
// LEAGUE HUB  (clean)
// ─────────────────────────────────────────────

function LeagueHub({ user, leagues, onEnter, onCreateWizard, onJoin, onSignOut }) {
  const [showJoin,      setShowJoin]      = useState(false);
  const [joinCode,      setJoinCode]      = useState("");
  const [joinErr,       setJoinErr]       = useState("");
  const [saving,        setSaving]        = useState(false);
  const [lastMatch,     setLastMatch]     = useState(null);
  const [nextChallenge, setNextChallenge] = useState(null);
  const [leagueRanks,   setLeagueRanks]   = useState({});
  const [hubStats,      setHubStats]      = useState(null);
  const [ovr,           setOvr]           = useState(null);

  const displayName  = user?.user_metadata?.full_name || user?.email || "Player";
  const firstName    = (displayName.split(" ")[0] || "").slice(0, 14);
  const avatarUrl    = user?.user_metadata?.avatar_url;
  const initials     = displayName.trim().split(/\s+/).map(w => (w[0] || "").toUpperCase()).slice(0, 2).join("");
  const currentMonth = HUB_MONTHS[new Date().getMonth()];

  useEffect(() => {
    if (!leagues.length || !user) return;
    const ids = leagues.map(l => l.id);
    (async () => {
      try {
        const [{ data: myPlayerRows }, { data: allPlayerRows }] = await Promise.all([
          supabase.from("players").select("id,league_id").in("league_id", ids).eq("user_id", user.id),
          supabase.from("players").select("id,league_id,user_id,name,stats,is_me").in("league_id", ids),
        ]);
        const playerIds = (myPlayerRows || []).map(p => p.id);
        if (!playerIds.length) return;

        // ── League ranks ──────────────────────────────────────────────
        const ranks = {};
        for (const league of leagues) {
          const lgRows    = (allPlayerRows || []).filter(r => r.league_id === league.id);
          const lgPlayers = lgRows.map(r => rowToPlayer(r, user.id));
          const sorted    = byWins(lgPlayers);
          const myIdx     = sorted.findIndex(p => p.isMe);
          if (myIdx >= 0) ranks[league.id] = { rank: myIdx + 1, total: sorted.length };
        }
        setLeagueRanks(ranks);

        // ── OVR rating ────────────────────────────────────────────────
        const myRows = (allPlayerRows || []).filter(r => r.user_id === user.id);
        const totW   = myRows.reduce((s, r) => s + (r.stats?.wins       || 0), 0);
        const totL   = myRows.reduce((s, r) => s + (r.stats?.losses     || 0), 0);
        const totP   = totW + totL;
        const totC   = myRows.reduce((s, r) => s + (r.stats?.clutchWins || 0), 0);
        const totCB  = myRows.reduce((s, r) => s + (r.stats?.comebacks  || 0), 0);
        if (totP > 0) {
          const wr         = (totW / totP) * 100;
          const winComp    = (wr / 100) * 50;
          const expComp    = Math.min(totP, 60) / 60 * 25;
          const clutchComp = Math.min(totC + totCB, 15) / 15 * 24;
          setOvr(Math.min(99, Math.max(1, Math.round(winComp + expComp + clutchComp))));
        }

        // ── Matches ───────────────────────────────────────────────────
        const { data: matches } = await supabase.from("matches").select("*")
          .in("league_id", ids).order("date", { ascending: false }).limit(100);
        if (!matches?.length) return;
        const userMatches = matches.filter(m => playerIds.includes(m.winner_id) || playerIds.includes(m.loser_id));
        if (!userMatches.length) return;

        // Last match
        const lm     = userMatches[0];
        const lgName = leagues.find(l => l.id === lm.league_id)?.name || "League";
        const isWin  = playerIds.includes(lm.winner_id);
        setLastMatch({ winner: lm.score?.winner || "?", loser: lm.score?.loser || "?",
          sets: lm.score?.sets || [], date: lm.date || null, isWin, lgName });

        // Hub stats
        const now = new Date();
        const thisMonthCount = userMatches.filter(m => {
          const d = new Date(m.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length;
        let streak = 0;
        for (const m of userMatches) { if (playerIds.includes(m.winner_id)) streak++; else break; }
        setHubStats({ total: userMatches.length, thisMonth: thisMonthCount, winStreak: streak, leagueCount: leagues.length });

        // Rival
        const rivalMap = {};
        for (const m of userMatches) {
          const userWon = playerIds.includes(m.winner_id);
          const oppId   = userWon ? m.loser_id  : m.winner_id;
          const oppName = userWon ? (m.score?.loser || "?") : (m.score?.winner || "?");
          if (!oppId || oppName === "?") continue;
          if (!rivalMap[oppId]) rivalMap[oppId] = { name: oppName, myWins: 0, rivalWins: 0 };
          if (userWon) rivalMap[oppId].myWins++; else rivalMap[oppId].rivalWins++;
        }
        const rivals = Object.values(rivalMap)
          .filter(r => r.myWins + r.rivalWins >= 2)
          .sort((a, b) => (b.myWins + b.rivalWins) - (a.myWins + a.rivalWins));
        if (rivals.length) setNextChallenge(rivals[0]);
      } catch { /* ignore */ }
    })();
  }, [leagues, user]);

  // ── Ticker items (all strings guarded — no toUpperCase on unknown values) ──
  const tickerItems = useMemo(() => {
    const base = [];
    if (lastMatch) {
      base.push(`Last match · ${lastMatch.winner || "?"} def. ${lastMatch.loser || "?"}`);
    }
    if (hubStats?.winStreak >= 2) base.push(`${hubStats.winStreak}× win streak 🔥`);
    leagues.forEach(lg => {
      const r = leagueRanks[lg.id];
      if (r) base.push(`${getSportEmoji(lg)} ${lg.name || "League"} · Rank #${r.rank} of ${r.total}`);
    });
    if (nextChallenge) {
      base.push(`⚔️ Rivalry: ${nextChallenge.name || "?"} — ${nextChallenge.myWins}–${nextChallenge.rivalWins}`);
    }
    if (hubStats?.total) base.push(`${hubStats.total} matches logged`);
    base.push(`The ${currentMonth} season is live`);
    if (ovr !== null) base.push(`Overall rating: ${ovr}`);
    const items = base.length ? base : ["League-It · System active", "The arena awaits"];
    return [...items, ...items]; // duplicate for seamless loop
  }, [lastMatch, hubStats, leagues, leagueRanks, nextChallenge, ovr, currentMonth]);

  const fallbackFactPool = useMemo(() => {
    if (!hubStats) return [];
    const pool = [];
    if (hubStats.winStreak >= 3) pool.push(`${hubStats.winStreak}-match win streak 🔥`);
    else if (hubStats.winStreak === 2) pool.push(`Two wins in a row ⚡`);
    if (hubStats.thisMonth > 0) pool.push(`${hubStats.thisMonth} match${hubStats.thisMonth>1?"es":""} played this month`);
    if (hubStats.total >= 10) pool.push(`${hubStats.total} total matches logged 🏆`);
    if (hubStats.leagueCount > 1) pool.push(`Active in ${hubStats.leagueCount} leagues 🎯`);
    if (!pool.length && hubStats.total > 0) pool.push(`${hubStats.total} total match${hubStats.total>1?"es":""} logged`);
    return pool;
  }, [hubStats]);
  const [fallbackFactSeed] = useState(() => Math.floor(Math.random() * 1000));
  const fallbackFact = fallbackFactPool.length ? fallbackFactPool[fallbackFactSeed % fallbackFactPool.length] : null;

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setSaving(true);
    try {
      const result = await onJoin(joinCode.trim().toUpperCase());
      if (result?.error) { setJoinErr(result.error); return; }
      setJoinCode(""); setJoinErr(""); setShowJoin(false);
    } catch {
      setJoinErr("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;background:#0A0A0A;}
        ::-webkit-scrollbar{display:none;}
        @keyframes hub-dot-pulse {
          0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(170,255,0,.5)}
          50%{opacity:.5;box-shadow:0 0 0 4px rgba(170,255,0,0)}
        }
        @keyframes hub-ticker {
          from{transform:translateX(0)} to{transform:translateX(-50%)}
        }
      `}</style>
      <div style={{minHeight:"100vh",background:BG,color:"#fff",display:"flex",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        <GridBg/><GlowBlobs/>
        <div style={{width:"100%",maxWidth:430,minHeight:"100vh",display:"flex",flexDirection:"column",position:"relative",zIndex:1}}>

          {/* ── TOP BAR ─────────────────────────────────────── */}
          <div style={{padding:"20px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:"5px",color:N,
              textShadow:"0 0 24px rgba(170,255,0,.5)"}}>LEAGUE-IT</div>
            <div className="flex items-center gap-2">
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{width:34,height:34,borderRadius:17,objectFit:"cover",
                    border:"2px solid rgba(170,255,0,.35)"}}/>
                : <div style={{width:34,height:34,borderRadius:17,display:"flex",alignItems:"center",justifyContent:"center",
                    background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",fontSize:12,fontWeight:800,
                    fontFamily:"'DM Sans',sans-serif"}}>
                    {initials}
                  </div>
              }
              <button onClick={onSignOut} style={{
                borderRadius:12,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",
                background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",
                color:"rgba(255,255,255,.45)",fontFamily:"'DM Sans',sans-serif"}}>
                Sign out
              </button>
            </div>
          </div>

          {/* ── WELCOME HEADER ──────────────────────────────── */}
          <div style={{margin:"14px 20px 0",borderRadius:20,padding:"18px 22px 16px",flexShrink:0,
            background:"rgba(170,255,0,.05)",border:`1.5px solid ${N}25`}}>
            <div style={{fontSize:13,fontWeight:500,color:"rgba(255,255,255,.38)",
              fontFamily:"'DM Sans',sans-serif",marginBottom:4,letterSpacing:"0.1px"}}>
              Welcome back,
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"3px",
              color:"#fff",lineHeight:1,textShadow:"0 2px 24px rgba(255,255,255,.08)",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {firstName}
            </div>
            <div style={{fontSize:10,fontWeight:500,color:`${N}45`,
              fontFamily:"'DM Sans',sans-serif",marginTop:6,letterSpacing:"0.5px"}}>
              {currentMonth} Season
            </div>
          </div>

          {/* ── SCROLLABLE CONTENT ──────────────────────────── */}
          <div style={{padding:"16px 20px 36px",flex:1,overflowY:"auto"}}>

            {/* ── ACTION BUTTONS ──────────────────────────────── */}
            <div className="flex flex-col gap-3 mb-7">
              <motion.button whileHover={{scale:1.015,y:-1}} whileTap={{scale:.98}}
                onClick={onCreateWizard}
                style={{width:"100%",padding:"15px 18px",borderRadius:20,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:14,
                  background:"rgba(170,255,0,.07)",border:`1.5px solid ${N}55`,
                  boxShadow:`0 4px 20px rgba(170,255,0,.08)`}}>
                <div style={{width:40,height:40,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",
                  background:`${N}18`,flexShrink:0}}>
                  <Plus size={20} style={{color:N}}/>
                </div>
                <div className="flex-1 text-left">
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:700,color:N,lineHeight:1}}>Create League</div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",marginTop:3}}>
                    Start a new league from scratch
                  </div>
                </div>
                <ChevronRight size={18} style={{color:`${N}55`,flexShrink:0}}/>
              </motion.button>

              <motion.button whileHover={{scale:1.015,y:-1}} whileTap={{scale:.98}}
                onClick={()=>{setShowJoin(true);setJoinErr("");}}
                style={{width:"100%",padding:"15px 18px",borderRadius:20,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:14,
                  background:"rgba(59,142,255,.07)",border:"1.5px solid rgba(59,142,255,.45)",
                  boxShadow:"0 4px 20px rgba(59,142,255,.08)"}}>
                <div style={{width:40,height:40,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",
                  background:"rgba(59,142,255,.15)",flexShrink:0}}>
                  <Hash size={20} style={{color:"#3B8EFF"}}/>
                </div>
                <div className="flex-1 text-left">
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:700,color:"#3B8EFF",lineHeight:1}}>Join by Code</div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",marginTop:3}}>
                    Enter a 6-character invite code
                  </div>
                </div>
                <ChevronRight size={18} style={{color:"rgba(59,142,255,.5)",flexShrink:0}}/>
              </motion.button>
            </div>

            {/* ── MY LEAGUES ──────────────────────────────────── */}
            <div style={{fontSize:11,fontWeight:700,letterSpacing:"2px",color:"rgba(255,255,255,.3)",
              fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>MY LEAGUES</div>

            {leagues.length === 0 ? (
              <div style={{borderRadius:20,padding:"36px 20px",textAlign:"center",
                background:"rgba(255,255,255,.03)",border:"1.5px dashed rgba(255,255,255,.1)",marginBottom:24}}>
                <div style={{fontSize:28,marginBottom:8}}>🏟️</div>
                <div style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,.25)",
                  fontFamily:"'DM Sans',sans-serif",marginBottom:4}}>No leagues yet</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.18)",fontFamily:"'DM Sans',sans-serif"}}>
                  Create or join one above
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-7">
                {leagues.map((lg, i) => {
                  const rankInfo   = leagueRanks[lg.id];
                  const rankNum    = rankInfo?.rank;
                  const medalData  = rankNum ? medal(rankNum) : null;
                  const sportEmoji = getSportEmoji(lg);
                  const glowDelay  = i * 0.8;
                  return (
                    <motion.div key={lg.id}
                      whileTap={{scale:.98}}
                      animate={{ boxShadow:[
                        `0 0 0 0 rgba(170,255,0,0), 0 2px 12px rgba(0,0,0,.3)`,
                        `0 0 22px 2px rgba(170,255,0,.12), 0 2px 12px rgba(0,0,0,.3)`,
                        `0 0 0 0 rgba(170,255,0,0), 0 2px 12px rgba(0,0,0,.3)`,
                      ]}}
                      transition={{ boxShadow:{ duration:3.5,repeat:Infinity,ease:"easeInOut",delay:glowDelay },
                        scale:{type:"spring",stiffness:400,damping:22} }}
                      onClick={()=>onEnter(lg)}
                      style={{borderRadius:20,padding:"14px 16px",cursor:"pointer",
                        background:"rgba(255,255,255,.04)",border:"1.5px solid rgba(255,255,255,.08)"}}>
                      <div className="flex items-center gap-3">
                        <div style={{width:44,height:44,borderRadius:14,display:"flex",alignItems:"center",
                          justifyContent:"center",background:"rgba(170,255,0,.08)",
                          border:"1px solid rgba(170,255,0,.2)",fontSize:20,flexShrink:0}}>
                          {sportEmoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:700,
                              color:"#fff",lineHeight:1}}>
                              {lg.name || "League"}
                            </span>
                            {rankNum && (
                              <span style={{
                                fontSize:11,fontWeight:700,fontFamily:"'DM Sans',sans-serif",
                                color: medalData ? medalData.c : `${N}88`,
                                background: medalData ? `${medalData.c}18` : `${N}0A`,
                                border: `1px solid ${medalData ? `${medalData.c}44` : `${N}2A`}`,
                                borderRadius:8,padding:"1px 7px",lineHeight:"18px",
                              }}>
                                {medalData ? medalData.e : `#${rankNum}`}
                              </span>
                            )}
                          </div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,.3)",
                            fontFamily:"'DM Sans',sans-serif",marginTop:3}}>
                            {lg.sport || "Sport"}{rankInfo ? ` · ${rankInfo.total} players` : ""}
                          </div>
                        </div>
                        <ChevronRight size={16} style={{color:"rgba(255,255,255,.2)",flexShrink:0}}/>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* ── LAST MATCH ──────────────────────────────────── */}
            {lastMatch && (() => {
              const isWin   = lastMatch.isWin;
              const ac      = isWin ? N : "#FF3355";
              const bgTint  = isWin ? "rgba(170,255,0,.05)" : "rgba(255,51,85,.05)";
              const bdrTint = isWin ? "rgba(170,255,0,.25)" : "rgba(255,51,85,.25)";
              return (
                <div style={{marginBottom:24}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:"2px",color:"rgba(255,255,255,.3)",
                    fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>LAST MATCH</div>
                  <div style={{borderRadius:20,padding:"14px 16px",background:bgTint,border:`1.5px solid ${bdrTint}`}}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div style={{fontSize:14,fontWeight:700,color:"#fff",fontFamily:"'DM Sans',sans-serif",
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:3}}>
                          {lastMatch.winner} <span style={{color:"rgba(255,255,255,.25)",fontWeight:400,fontSize:12}}>vs</span> {lastMatch.loser}
                        </div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>
                          {lastMatch.lgName || ""}  ·  {relativeTime(lastMatch.date)}
                        </div>
                        {lastMatch.sets.length >= 2 && (
                          <div style={{marginTop:8}}>
                            <SetSparkline sets={lastMatch.sets} isWin={isWin}/>
                            <div style={{fontSize:10,color:"rgba(255,255,255,.2)",fontFamily:"'DM Sans',sans-serif",marginTop:3}}>
                              {lastMatch.sets.join("  ·  ")}
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{flexShrink:0,borderRadius:12,padding:"8px 12px",display:"flex",
                        flexDirection:"column",alignItems:"center",justifyContent:"center",
                        background: isWin ? `${N}14` : "rgba(255,51,85,.14)",
                        border: `1.5px solid ${ac}44`,minWidth:50}}>
                        <span style={{fontSize:18,lineHeight:1}}>{isWin?"🏆":"😤"}</span>
                        <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,
                          color:ac,letterSpacing:"0.5px",marginTop:4}}>{isWin?"WIN":"LOSS"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── NEXT CHALLENGE / FALLBACK ────────────────────── */}
            {(nextChallenge || fallbackFact) && (() => {
              if (nextChallenge) {
                const { name: rivalName, myWins, rivalWins } = nextChallenge;
                const tied    = myWins === rivalWins;
                const leading = myWins > rivalWins;
                const ac      = tied ? "#FFB830" : leading ? N : "#FF3355";
                const cta     = tied ? "All square — who breaks first?" : leading ? "You're ahead. Defend it." : "Schedule revenge?";
                return (
                  <div style={{marginBottom:24}}>
                    <div style={{fontSize:11,fontWeight:700,letterSpacing:"2px",color:"rgba(255,255,255,.3)",
                      fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>NEXT CHALLENGE</div>
                    <div style={{borderRadius:20,padding:"14px 16px",background:`${ac}08`,border:`1.5px solid ${ac}33`}}>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,
                        color:"rgba(255,255,255,.75)",lineHeight:1.55,marginBottom:6}}>
                        Rivalry with{" "}
                        <span style={{fontWeight:800,color:"#fff"}}>{rivalName || "?"}</span>
                        {" "}stands at{" "}
                        <span style={{fontWeight:800,color:ac}}>{myWins}–{rivalWins}</span>
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:ac,fontFamily:"'DM Sans',sans-serif"}}>
                        {cta} →
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div style={{borderRadius:20,padding:"14px 16px",marginBottom:24,
                  background:"rgba(255,255,255,.03)",border:"1.5px solid rgba(255,255,255,.08)"}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:"2px",color:"rgba(255,255,255,.25)",
                    fontFamily:"'DM Sans',sans-serif",marginBottom:6}}>DID YOU KNOW</div>
                  <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.6)",
                    fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}>{fallbackFact}</div>
                </div>
              );
            })()}

            {/* bottom spacer for ticker */}
            <div style={{height:8}}/>
          </div>

          {/* ── LIVE TICKER ─────────────────────────────────── */}
          <div style={{height:36,flexShrink:0,overflow:"hidden",display:"flex",alignItems:"center",position:"relative",
            borderTop:"1px solid rgba(255,255,255,.06)",
            background:"rgba(10,10,10,.85)",backdropFilter:"blur(8px)"}}>
            {/* fade masks */}
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:32,zIndex:2,
              background:`linear-gradient(to right,${BG},transparent)`,pointerEvents:"none"}}/>
            <div style={{position:"absolute",right:0,top:0,bottom:0,width:32,zIndex:2,
              background:`linear-gradient(to left,${BG},transparent)`,pointerEvents:"none"}}/>
            {/* scrolling track */}
            <div style={{display:"flex",whiteSpace:"nowrap",
              animation:"hub-ticker 32s linear infinite",willChange:"transform"}}>
              {tickerItems.map((item, i) => (
                <span key={i} style={{
                  display:"inline-flex",alignItems:"center",gap:8,
                  padding:"0 22px",
                  fontSize:11,fontWeight:600,
                  color:"rgba(170,255,0,.55)",
                  fontFamily:"'DM Sans',sans-serif",
                  letterSpacing:"0.2px",
                }}>
                  <span style={{color:`${N}28`,fontSize:8}}>●</span>
                  {item}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── JOIN MODAL ──────────────────────────────────── */}
      <AnimatePresence>
        {showJoin&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{background:"rgba(0,0,0,.8)",backdropFilter:"blur(8px)"}}
            onClick={e=>{if(e.target===e.currentTarget)setShowJoin(false)}}>
            <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} transition={{type:"spring",damping:28,stiffness:300}}
              className="w-full overflow-hidden"
              style={{maxWidth:430,background:"#0D0F12",borderRadius:"24px 24px 0 0",
                border:`1.5px solid rgba(170,255,0,.25)`,borderBottom:"none",
                boxShadow:`0 -12px 48px rgba(170,255,0,.1)`}}>
              <div className="flex justify-center pt-4 pb-2">
                <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,.15)"}}/>
              </div>
              <div className="flex items-center justify-between px-6 py-3">
                <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:"3px",color:"#fff"}}>
                  Join <span style={{color:"#3B8EFF"}}>League</span>
                </h3>
                <button onClick={()=>setShowJoin(false)} style={{
                  display:"flex",alignItems:"center",justifyContent:"center",
                  width:32,height:32,borderRadius:16,
                  background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)"}}>
                  <X size={14} style={{color:"rgba(255,255,255,.5)"}}/>
                </button>
              </div>
              <div style={{padding:"8px 24px 36px"}}>
                <p style={{fontSize:12,color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>
                  Enter the invite code shared with you
                </p>
                <input autoFocus type="text" value={joinCode}
                  onChange={e=>{setJoinCode(e.target.value.toUpperCase());setJoinErr("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleJoin()}
                  placeholder="ABC123" maxLength={12}
                  style={{width:"100%",borderRadius:16,padding:"14px 16px",marginBottom:8,outline:"none",
                    fontFamily:"'DM Sans',sans-serif",fontSize:18,letterSpacing:"4px",fontWeight:700,
                    background:"rgba(255,255,255,.05)",
                    border:`1.5px solid ${joinErr?"#FF3355":joinCode?N:"rgba(255,255,255,.15)"}`,
                    color:"#fff",caretColor:N}}/>
                {joinErr&&<p style={{fontSize:11,color:"#FF3355",fontFamily:"'DM Sans',sans-serif",marginBottom:10}}>{joinErr}</p>}
                <div style={{height:joinErr?0:10}}/>
                <PBtn onClick={handleJoin} disabled={!joinCode.trim()||saving}
                  style={{background:"linear-gradient(135deg,#3B8EFF,#1A5FCC)",borderRadius:16}}>
                  {saving?"Joining…":"Join League"}
                </PBtn>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────
export default function Root() {
  const [phase,            setPhase]            = useState("loading");
  const [user,             setUser]             = useState(null);
  const [leagues,          setLeagues]          = useState([]);
  const [activeData,       setActiveData]       = useState(null);
  const [profile,          setProfile]          = useState(null);
  const [pendingJoinId,    setPendingJoinId]    = useState(null);
  const [pendingJoinCode,  setPendingJoinCode]  = useState(null);
  const [lobbyData,        setLobbyData]        = useState(null);   // { leagueId, joinCode, leagueName, ownerId }
  const [joinFlowData,     setJoinFlowData]     = useState(null);   // { leagueId, leagueName, isSeeded, defaultNickname }

  // ── Hard 10-second loading timeout — completely independent from the auth
  //    effect so it can NEVER be cancelled by auth re-subscriptions or errors.
  //    If the app is still on "loading" after 10 s, show the error screen.
  useEffect(() => {
    const t = setTimeout(() => {
      setPhase(prev => prev === "loading" ? "timedout" : prev);
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  // ── Detect /join/<slug-or-code> URL on first mount ───────────────────────
  // Invite links look like:  /join/My-League-ABC123  (slug ending in 6-char code)
  //                      or  /join/ABC123            (bare alphanumeric code)
  //                      or  /join/472915            (6-digit numeric lobby PIN)
  //                      or  /join/<uuid>            (legacy league-ID link)
  useEffect(() => {
    const m = window.location.pathname.match(/^\/join\/([^/]+)$/);
    if (!m) return;
    const segment = m[1];
    window.history.replaceState({}, "", "/");
    const parts    = segment.split("-");
    const lastPart = parts[parts.length - 1];
    const isAlphaCode = /^[A-Z2-9]{6}$/.test(lastPart);
    const isNumPin    = /^[0-9]{6}$/.test(segment); // full-segment numeric pin
    if (isAlphaCode || isNumPin) {
      localStorage.setItem("pending_join_code", isNumPin ? segment : lastPart);
    } else {
      sessionStorage.setItem("league_it_join_id", segment);
    }
  }, []);

  // Race any promise against a hard deadline so a hanging Supabase query
  // can never block the loading screen indefinitely.
  const withTimeout = useCallback((promise, ms = 8000) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("query_timeout")), ms)
      ),
    ])
  , []);

  const loadProfile = useCallback(async (uid) => {
    try {
      const { data } = await withTimeout(
        supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle()
      );
      setProfile(data || null);
    } catch {
      setProfile(null);
    }
  }, [withTimeout]);

  const loadLeagues = useCallback(async (uid) => {
    try {
      // Step 1 — league IDs from player rows + leagues the user owns (admin may not be a player yet)
      const [{ data: pRows }, { data: ownedRows }] = await Promise.all([
        withTimeout(supabase.from("players").select("league_id").eq("user_id", uid)),
        withTimeout(supabase.from("leagues").select("id").eq("owner_id", uid)),
      ]);
      const idSet = new Set([
        ...(pRows    || []).map(r => r.league_id),
        ...(ownedRows || []).map(r => r.id),
      ]);
      if (!idSet.size) { setLeagues([]); return; }
      const ids = [...idSet];

      // Step 2 — fetch league rows. Try with join_code first; if the column
      // doesn't exist yet (migration not run) the error field is set and we
      // fall back to the base column set — no second hanging query needed.
      const { data: lRowsFull, error } = await withTimeout(
        supabase
          .from("leagues")
          .select("id,name,sport,settings,created_at,owner_id,created_by,image_url,join_code")
          .in("id", ids)
      );

      if (!error) {
        setLeagues(lRowsFull || []);
        return;
      }

      // join_code column not present — fall back without it
      const { data: lRowsBase } = await withTimeout(
        supabase
          .from("leagues")
          .select("id,name,sport,settings,created_at,owner_id,created_by,image_url")
          .in("id", ids)
      );
      setLeagues(lRowsBase || []);
    } catch {
      // Query timed out or threw — fail gracefully, don't block loading
      setLeagues([]);
    }
  }, [withTimeout]);

  // Auth listener — single source of truth, handles initial session + changes
  useEffect(() => {
    // Intentional: no Supabase config — skip auth setup and land on login screen immediately
    if (!supabaseConfigured || !supabase) { setPhase("login"); return; } // eslint-disable-line react-hooks/set-state-in-effect
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          setUser(session.user);
          // Each loader has its own try-catch — Promise.all will not hang even if one fails
          await Promise.all([
            loadLeagues(session.user.id).catch(() => setLeagues([])),
            loadProfile(session.user.id).catch(() => setProfile(null)),
          ]);
          const joinCode = localStorage.getItem("pending_join_code");
          const joinId   = sessionStorage.getItem("league_it_join_id");
          const intent   = sessionStorage.getItem("league_it_intent");
          if (joinCode) {
            localStorage.removeItem("pending_join_code");
            setPendingJoinCode(joinCode);
            setPhase("hub");
          } else if (joinId) {
            sessionStorage.removeItem("league_it_join_id");
            setPendingJoinId(joinId);
            setPhase("hub");
          } else if (intent === "create") {
            sessionStorage.removeItem("league_it_intent");
            setPhase("wizard");
          } else {
            setPhase("hub");
          }
        } else {
          setUser(null); setLeagues([]); setActiveData(null); setProfile(null);
          setPhase("login");
        }
      } catch {
        // Safety net: if anything above throws unexpectedly, don't leave the user on loading
        setPhase(prev => prev === "loading" ? "login" : prev);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [loadLeagues, loadProfile]);

  const handleEnterLeague = useCallback(async (league) => {
    try {
      const [{ data: pData }, { data: mData }] = await Promise.all([
        supabase.from("players").select("*").eq("league_id", league.id),
        supabase.from("matches").select("*").eq("league_id", league.id).order("date", { ascending: false }),
      ]);
      setActiveData({
        leagueId:       league.id,
        leagueName:     (league.name || "").toUpperCase(),
        initialPlayers: (pData || []).map(r => rowToPlayer(r, user?.id)),
        initialFeed:    (mData || []).map(m => ({ id: m.id, ...m.score })),
        ownerId:        league.owner_id || league.created_by || null,
        squadPhotoUrl:  league.image_url || null,
        joinCode:       league.join_code || league.settings?.leagueCode || null,
        initialRules:   settingsToRules(league.sport, league.settings),
      });
      setPhase("app");
    } catch {
      // network error — stay on hub
    }
  }, [user]);

  // ── Process pending join after enter is available ─────────────────────────
  useEffect(() => {
    if (!pendingJoinId || !user) return;
    (async () => {
      try {
        const { data: league } = await supabase.from("leagues").select("*").eq("id", pendingJoinId).maybeSingle();
        if (!league) { setPendingJoinId(null); return; }
        const { data: existing } = await supabase.from("players").select("id")
          .eq("league_id", pendingJoinId).eq("user_id", user.id).maybeSingle();
        if (!existing) {
          const dn = profile?.display_name || user.user_metadata?.full_name || user.email || "Player";
          const ini = dn.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join("");
          await supabase.from("players").insert({
            league_id: league.id, user_id: user.id, name: dn, is_me: false,
            stats: { initials:ini, wins:0, losses:0, streak:0, totalPlayed:0, trend:"flat", sport:"🏸", mvTrend:[0,0,0,0,0,0,0], partners:{}, clutchWins:0, bestStreak:0 },
          });
          await loadLeagues(user.id);
        }
        setPendingJoinId(null);
        await handleEnterLeague(league);
      } catch {
        setPendingJoinId(null);
      }
    })();
  }, [pendingJoinId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join flow: look up league from URL code/pin, then show PlayerJoinFlow ──
  useEffect(() => {
    if (!pendingJoinCode || !user) return;
    (async () => {
      try {
        const code = pendingJoinCode;
        // Look up league by join_code first, then by lobbyPin / leagueCode
        let { data: league } = await supabase.from("leagues").select("*").eq("join_code", code).maybeSingle();
        if (!league) {
          const { data: all } = await supabase.from("leagues").select("*");
          league = all?.find(l => l.settings?.lobbyPin === code || l.settings?.leagueCode === code) || null;
        }
        if (!league || league.settings?.lobbyState === "locked") { setPendingJoinCode(null); return; }

        // Already a member? — just enter
        const { data: existing } = await supabase.from("players").select("id")
          .eq("league_id", league.id).eq("user_id", user.id).maybeSingle();
        if (existing) {
          setPendingJoinCode(null);
          await handleEnterLeague(league);
          return;
        }

        // Show the join onboarding flow
        const defaultNickname = profile?.display_name || user.user_metadata?.full_name || user.email || "Player";
        setJoinFlowData({
          leagueId:        league.id,
          leagueName:      league.name || "League",
          isSeeded:        (league.settings?.participants || []).some(p => p.tier),
          defaultNickname,
        });
        setPhase("join_flow");
      } catch { /* ignore */ }
      setPendingJoinCode(null);
    })();
  }, [pendingJoinCode, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoinLeague = useCallback(async (code) => {
    if (!user) return { error: "Not logged in" };
    try {
      // Primary lookup — dedicated join_code column (fast, indexed)
      let { data: league } = await supabase.from("leagues").select("*").eq("join_code", code).maybeSingle();
      // Fallback — numeric lobby pin or legacy settings.leagueCode
      if (!league) {
        const { data: allLeagues } = await supabase.from("leagues").select("*");
        league = allLeagues?.find(l =>
          l.settings?.lobbyPin === code ||
          l.settings?.leagueCode === code
        ) || null;
      }
      if (!league) return { error: "League not found — check the code" };
      if (league.settings?.lobbyState === "locked") return { error: "This league is locked — the admin has closed the lobby" };
      const isSeeded = (league.settings?.participants || []).some(p => p.tier);
      const { data: existing } = await supabase.from("players").select("id")
        .eq("league_id", league.id).eq("user_id", user.id).maybeSingle();
      if (existing) return { error: "You're already in this league" };
      const displayName = profile?.display_name || user.user_metadata?.full_name || user.email || "Player";
      const initials    = displayName.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join("");
      await supabase.from("players").insert({
        league_id: league.id, user_id: user.id, name: displayName, is_me: false,
        stats: { initials, wins:0, losses:0, streak:0, totalPlayed:0, trend:"flat", sport:"🏸", mvTrend:[0,0,0,0,0,0,0], partners:{}, clutchWins:0, bestStreak:0 },
      });
      await loadLeagues(user.id);
      return { success: true, leagueId: league.id, isSeeded };
    } catch {
      return { error: "Network error — please try again" };
    }
  }, [user, profile, loadLeagues]);

  const handleDeleteLeague = useCallback(async () => {
    if (!activeData?.leagueId || !user) return;
    try {
      await supabase.from("matches").delete().eq("league_id", activeData.leagueId);
      await supabase.from("players").delete().eq("league_id", activeData.leagueId);
      await supabase.from("leagues").delete().eq("id", activeData.leagueId);
      setActiveData(null);
      setPhase("hub");
      await loadLeagues(user.id);
    } catch {
      // silently fail — user stays in app
    }
  }, [activeData, user, loadLeagues]);

  const handleUpdateDisplayName = useCallback(async (newName) => {
    if (!user || !newName.trim()) return;
    const trimmed = newName.trim();
    try {
      const { data } = await supabase.from("profiles")
        .upsert({ user_id: user.id, display_name: trimmed, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select().single();
      setProfile(data);
      // Keep players table in sync — every row owned by this user gets the new name
      await supabase.from("players").update({ name: trimmed }).eq("user_id", user.id);
    } catch {
      // silently fail
    }
  }, [user]);

  const handleUpdateSquadPhoto = useCallback((url) => {
    setActiveData(prev => prev ? { ...prev, squadPhotoUrl: url } : prev);
  }, []);

  const handleUpdateAvatar = useCallback((url) => {
    setProfile(prev => ({ ...(prev || {}), avatar_url: url }));
  }, []);

  const handleSignOut = useCallback(() => supabase.auth.signOut(), []);

  const handleBack = useCallback(() => {
    setActiveData(null);
    setPhase("hub");
    if (user) loadLeagues(user.id);
  }, [user, loadLeagues]);

  const handleWizardFinish = useCallback(async ({ leagueName, sport, tournamentFormat, participants, reportingMode, groupSettings, matchLegs, format, points, customSportName, customSportEmoji, customRules, leagueCode, isLiveLobby }) => {
    if (!user) throw new Error("Not logged in");

    const name        = leagueName?.trim() || "My League";
    const sportData   = SPORTS.find(s => s.id === sport);
    const sportLabel  = customSportName?.trim() || sportData?.label || "Sport";
    const sportEmoji  = sport === "custom_sport" ? (customSportEmoji || "⚙️") : (sportData?.emoji || "🏸");
    // Generate IDs client-side — never depend on Supabase returning the row back
    // (RLS SELECT policy may block the row even after a successful INSERT)
    const leagueId = crypto.randomUUID();
    const code      = leagueCode || generateCode();
    const lobbyPin  = isLiveLobby ? generateNumericPin() : null;
    const baseSettings = { leagueCode: code, tournamentFormat: tournamentFormat || "classic", participants: participants || [], reportingMode: reportingMode || "admin", groupSettings: groupSettings || { playersPerGroup: 4, advancingPerGroup: 2 }, matchLegs: matchLegs || 1, format, points, customRules, sportEmoji, ...(lobbyPin ? { lobbyPin } : {}) };

    // ── Step 1: League insert — only step allowed to throw (league not yet created) ──
    const { error: leagueErr } = await supabase.from("leagues").insert({
      id: leagueId, name, sport: sportLabel, join_code: code,
      settings: baseSettings, owner_id: user.id, created_by: user.id,
    });
    if (leagueErr) {
      // join_code column missing in DB — retry without it
      if (leagueErr.message?.includes("join_code") || leagueErr.code === "42703") {
        const { error: retryErr } = await supabase.from("leagues").insert({
          id: leagueId, name, sport: sportLabel,
          settings: baseSettings, owner_id: user.id, created_by: user.id,
        });
        if (retryErr) throw new Error(retryErr.message || "Failed to create league");
      } else {
        throw new Error(leagueErr.message || "Failed to create league");
      }
    }

    // Admin is NOT auto-added to players — they must use "Join as Player" inside the league view.
    // Step 2: Reload leagues, then go to lobby (if live lobby) or hub
    try { await loadLeagues(user.id); } catch { /* ignore */ }
    if (isLiveLobby) {
      setLobbyData({ leagueId, joinCode: code, leagueName: name, ownerId: user.id });
      setPhase("lobby");
    } else {
      setPhase("hub");
    }
  }, [user, loadLeagues]);

  if (phase === "loading") return (
    <div style={{background:"#0A0A0A",height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <div style={{color:"#AAFF00",fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:6,textShadow:"0 0 30px rgba(170,255,0,.4)"}}>LEAGUE-IT</div>
      <div style={{display:"flex",gap:6}}>
        {[0,1,2].map(i=>(
          <div key={i} style={{
            width:7,height:7,borderRadius:"50%",background:"#AAFF00",
            animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`,
            opacity:0.8,
          }}/>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{transform:scale(.6);opacity:.3}50%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );

  if (phase === "timedout") return (
    <div style={{background:"#0A0A0A",height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 32px",textAlign:"center",gap:0}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
      `}</style>
      <div style={{fontSize:44,marginBottom:16}}>😔</div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,letterSpacing:"3px",color:"#fff",marginBottom:8}}>
        TROUBLE <span style={{color:"#FF3355"}}>LOADING</span>
      </div>
      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,.45)",lineHeight:1.7,maxWidth:300,marginBottom:32}}>
        We&apos;re having trouble loading your data.<br/>
        Please try again or contact support if the issue persists.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          fontFamily:"'DM Sans',sans-serif",fontWeight:800,fontSize:15,
          background:"linear-gradient(135deg,#AAFF00,#7DC900)",
          color:"#000",border:"none",borderRadius:18,
          padding:"14px 36px",cursor:"pointer",letterSpacing:"0.5px",
          boxShadow:"0 8px 28px rgba(170,255,0,.35)",
        }}>
        Try Again
      </button>
    </div>
  );

  if (phase === "app" && activeData) return (
    <LeagueItApp
      initialPlayers={activeData.initialPlayers}
      initialFeed={activeData.initialFeed}
      initialRules={activeData.initialRules}
      leagueId={activeData.leagueId}
      leagueName={activeData.leagueName}
      user={user}
      onBack={handleBack}
      ownerId={activeData.ownerId}
      onDeleteLeague={handleDeleteLeague}
      profile={profile}
      onProfileUpdate={handleUpdateDisplayName}
      squadPhotoUrl={activeData.squadPhotoUrl}
      onSquadPhotoUpdate={handleUpdateSquadPhoto}
      onAvatarUpdate={handleUpdateAvatar}
      joinCode={activeData.joinCode}
    />
  );
  if (phase === "lobby" && lobbyData) return (
    <LobbyScreen
      leagueId={lobbyData.leagueId}
      joinCode={lobbyData.joinCode}
      leagueName={lobbyData.leagueName}
      user={user}
      ownerId={lobbyData.ownerId}
      onClose={() => { setLobbyData(null); setPhase("hub"); }}
    />
  );
  if (phase === "join_flow" && joinFlowData) return (
    <PlayerJoinFlow
      user={user}
      leagueId={joinFlowData.leagueId}
      leagueName={joinFlowData.leagueName}
      isSeeded={joinFlowData.isSeeded}
      defaultNickname={joinFlowData.defaultNickname}
      onDone={() => { setJoinFlowData(null); setPhase("hub"); if (user) loadLeagues(user.id).catch(()=>{}); }}
    />
  );
  if (phase === "wizard") return (
    <LeagueItOnboarding
      initialStep={1}
      user={user}
      onFinish={handleWizardFinish}
      onBackToHub={() => setPhase("hub")}
    />
  );
  if (phase === "hub") return (
    <LeagueHub
      user={user}
      leagues={leagues}
      onEnter={handleEnterLeague}
      onCreateWizard={() => setPhase("wizard")}
      onJoin={handleJoinLeague}
      onSignOut={handleSignOut}
    />
  );
  return (
    <LeagueItOnboarding
      initialStep={0}
      hasPendingJoin={!!localStorage.getItem("pending_join_code")}
      onSignIn={() => {
        sessionStorage.setItem("league_it_intent", "create");
        supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
      }}
      onFinish={() => {}}
    />
  );
}