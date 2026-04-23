import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import {
  Plus, X, Check, ChevronRight, TrendingUp, TrendingDown,
  Minus, Clock, Home, BarChart2, Users, User, Edit2,
  Camera, Settings, RotateCcw, UserPlus, UserMinus,
  ChevronLeft, Trophy, Zap, Target, Hash, Copy,
  MessageCircle, LayoutDashboard, Crown, Sparkles, ArrowRight, Trash2,
} from "lucide-react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

// parseMG("6–3") → {w:6,l:3}  — winner gets +6 games, loser gets +3
const parseMG = s => {
  const [a,b] = (s||"").split(/[–\-]/);
  return { w:parseInt(a)||0, l:parseInt(b)||0 };
};
const countGames = (sets, side) =>
  (sets||[]).reduce((acc,s) => { const {w,l}=parseMG(s); return acc+(side==="w"?w:l); }, 0);

// Tally gamesWon/gamesLost from the live feed for every player
const enrichPlayers = (players, feed) => {
  const gW={}, gL={};
  players.forEach(p => { gW[p.id]=0; gL[p.id]=0; });
  feed.forEach(m => {
    // Winner scores "w" side, but also loses "l" side games
    (m.winnerIds||[]).forEach(id => {
      gW[id]=(gW[id]||0)+countGames(m.sets,"w");
      gL[id]=(gL[id]||0)+countGames(m.sets,"l");
    });
    // Loser scores "l" side, but also loses "w" side games
    (m.loserIds||[]).forEach(id => {
      gW[id]=(gW[id]||0)+countGames(m.sets,"l");
      gL[id]=(gL[id]||0)+countGames(m.sets,"w");
    });
  });
  return players.map(p => ({ ...p, gamesWon:gW[p.id]||0, gamesLost:gL[p.id]||0 }));
};

// Derive ALL player stats (wins/losses/streak/clutchWins/etc.) from match history.
// This is the source of truth — no need to write computed stats back to the DB.
const derivePlayerStats = (players, feed) => {
  const map = {};
  players.forEach(p => { map[p.id] = { wins:0, losses:0, streak:0, bestStreak:0, clutchWins:0, gamesWon:0, gamesLost:0, comebacks:0 }; });
  const chronological = [...feed].reverse(); // oldest→newest so streak accumulates correctly
  chronological.forEach(m => {
    const isClutch = (m.sets||[]).some(s => { const {w,l}=parseMG(s); return w>6||(Math.min(w,l)>=5&&w-l===2); });
    (m.winnerIds||[]).forEach(id => {
      if (!map[id]) return;
      map[id].wins++;
      map[id].gamesWon  += countGames(m.sets, "w");
      map[id].gamesLost += countGames(m.sets, "l"); // mini-games the winner conceded
      if (isClutch) map[id].clutchWins++;
      if (m.isComeback) map[id].comebacks++;
      map[id].streak = map[id].streak >= 0 ? map[id].streak + 1 : 1;
      map[id].bestStreak = Math.max(map[id].bestStreak, map[id].streak);
    });
    (m.loserIds||[]).forEach(id => {
      if (!map[id]) return;
      map[id].losses++;
      map[id].gamesWon  += countGames(m.sets, "l"); // mini-games the loser scored
      map[id].gamesLost += countGames(m.sets, "w");
      map[id].streak = map[id].streak <= 0 ? map[id].streak - 1 : -1;
    });
  });
  return players.map(p => ({
    ...p,
    wins:        map[p.id]?.wins        || 0,
    losses:      map[p.id]?.losses      || 0,
    streak:      map[p.id]?.streak      || 0,
    bestStreak:  map[p.id]?.bestStreak  || 0,
    clutchWins:  map[p.id]?.clutchWins  || 0,
    comebacks:   map[p.id]?.comebacks   || 0,
    totalPlayed: (map[p.id]?.wins||0) + (map[p.id]?.losses||0),
    gamesWon:    map[p.id]?.gamesWon    || 0,
    gamesLost:   map[p.id]?.gamesLost   || 0,
  }));
};

const byWins = ps => [...ps].sort((a,b) => b.wins-a.wins || a.losses-b.losses);
const medal  = r => r===1?{e:"🥇",c:"#FFD700"}:r===2?{e:"🥈",c:"#C0C0C0"}:r===3?{e:"🥉",c:"#CD7F32"}:null;

/* ── SEED DATA ── */
// No seed data — players are added via onboarding (isMe) or the Add Player prompt
const INIT_PLAYERS = [];
const INIT_FEED = [];

const INIT_RULES = {format:"",scoring:"",sport:"",seasonYear:new Date().getFullYear()};

// Convert the league row (sport column + settings JSON) to the rules shape used by the UI
function settingsToRules(leagueSport, settings) {
  const s = settings || {};
  const formatMap = { single:"Single Set", best3:"Best of 3", points:`${s.points||21} Points`, custom_logic:"Custom Rules" };
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

function StreakBadge({streak}) {
  const hot=streak>=3,cold=streak<=-3;
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-extrabold"
      style={{fontFamily:"'JetBrains Mono',monospace",
        background:hot?"rgba(170,255,0,.1)":cold?"rgba(59,142,255,.1)":"rgba(255,255,255,.05)",
        border:`1px solid ${hot?"rgba(170,255,0,.3)":cold?"rgba(59,142,255,.3)":"rgba(255,255,255,.1)"}`,
        color:hot?N:cold?"#3B8EFF":"rgba(255,255,255,.38)"}}>
      {streak>0?"🔥":streak<0?"❄️":"—"}{streak!==0?Math.abs(streak):""}
    </span>
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
function StandingsTable({players, feed = []}) {
  if (!players || players.length === 0) return <div className="text-center p-10 opacity-30">No players in league yet</div>;
  const rows = useMemo(()=>byWins(players),[players]);
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
            <span style={{fontSize:13,fontWeight:700,color:N,fontFamily:"'DM Sans',sans-serif"}}>{winnerStr}</span>
            <span style={{fontSize:11,color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>def.</span>
            <span style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.42)",fontFamily:"'DM Sans',sans-serif"}}>{loserStr}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {m.sets.map((s,i)=>(
              <span key={i} className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                style={{fontFamily:"'JetBrains Mono',monospace",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.65)"}}>{s}</span>
            ))}
            <span style={{fontSize:9,color:"rgba(255,255,255,.22)",fontWeight:600,marginLeft:2}}>{totalMG} Mini-Games</span>
            {m.isComeback&&<span style={{fontSize:8,fontWeight:900,letterSpacing:"0.8px",color:"#FFB830",background:"rgba(255,184,48,.12)",border:"1px solid rgba(255,184,48,.35)",borderRadius:4,padding:"1px 5px",fontFamily:"'DM Sans',sans-serif"}}>⚡ COMEBACK</span>}
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
    prefill?.sets?.map(s=>{const[a,b]=s.split(/[–\-]/);return{w:a||"",l:b||""};}) || [{w:"",l:""}]
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

/* ── HOME TAB ── */
function HomeTab({players,feed,onEditFeed,onDeleteFeed,isAdmin=false,myPlayerId=null}) {
  const [showAll,setShowAll] = useState(false);
  // MVP = highest wins
  const mvp    = useMemo(()=>players.length>0?[...players].sort((a,b)=>b.wins-a.wins)[0]:{name:"No Players",wins:0,losses:0},[players]);
  const streak = useMemo(()=>players.length>0?[...players].sort((a,b)=>(b.bestStreak||0)-(a.bestStreak||0))[0]:{name:"No Players",bestStreak:0},[players]);
  const visible = showAll ? feed : feed.slice(0,5);

  return (
    <div className="px-5 pt-5 pb-2">
      <ST>📊 Standings</ST>
      <StandingsTable players={players} feed={feed}/>

      {/* MVP + Streak — 2-col grid below standings */}
      <div className="grid grid-cols-2 gap-3 mb-6">
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
      </div>

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

      <ST>⚡ League Feed</ST>
      {visible.map(m=><FeedCard key={m.id} m={m} onEdit={onEditFeed} onDelete={onDeleteFeed} canDelete={isAdmin||(myPlayerId&&(m.winnerIds?.includes(myPlayerId)||m.loserIds?.includes(myPlayerId)))} players={players}/>)}
      {/* Load More — shows only if feed > 5 entries */}
      {feed.length>5&&!showAll&&(
        <button onClick={()=>setShowAll(true)}
          className="w-full rounded-[16px] py-3.5 font-bold text-sm hover:opacity-80 mb-4"
          style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
          ↓ Load {feed.length-5} More Matches
        </button>
      )}
    </div>
  );
}

/* ── STATS TAB ── */
function StatsTab({players,feed}) {
  const [sub,setSub] = useState("lb");
  const enriched = useMemo(()=>enrichPlayers(players,feed),[players,feed]);

  function LbView() {
    const FALLBACK = {name:"N/A",wins:0,losses:0,gamesWon:0,gamesLost:0,totalPlayed:0,mvTrend:[0,0,0,0,0,0,0],partners:{}};
    const me   = enriched.find(p=>p.isMe) || FALLBACK;
    const totG = (me.gamesWon+me.gamesLost)||1;
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

        <ST>🤝 My Partner Rate</ST>
        <div className="rounded-[20px] p-4 mb-5" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
          {partners.map(({pp,pc:ppc})=>(
            <div key={pp.id} className="flex items-center gap-2.5 mb-3">
              <div style={{width:72,fontSize:12,fontWeight:600,color:"rgba(255,255,255,.65)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>{pp.name}</div>
              <AnimBar value={ppc} color={barC(ppc)}/>
              <div style={{width:32,fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",textAlign:"right"}}>{ppc}%</div>
            </div>
          ))}
        </div>

        {/* Mini-Games Breakdown — uses gamesWon/gamesLost from parseMG, not setsWon */}
        <ST>🎮 My Mini-Games Breakdown</ST>
        <div className="rounded-[20px] p-4 mb-2" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[{v:me.gamesWon,l:"MINI-GAMES WON",c:N},{v:me.gamesLost,l:"MINI-GAMES LOST",c:"#FF3355"}].map(({v,l,c})=>(
              <div key={l} className="text-center">
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,letterSpacing:"2px",lineHeight:1,color:c,marginBottom:4}}>{v}</div>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:"1.5px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{l}</div>
              </div>
            ))}
          </div>
          <div className="flex rounded-[4px] overflow-hidden" style={{height:6}}>
            <div style={{width:`${Math.round(me.gamesWon/totG*100)}%`,background:`linear-gradient(90deg,${N},#7DC900)`}}/>
            <div style={{flex:1,background:"linear-gradient(90deg,#FF3355,#C0143C)"}}/>
          </div>
          <div className="flex justify-between mt-2">
            <span style={{fontSize:10,fontWeight:700,color:N,fontFamily:"'DM Sans',sans-serif"}}>{Math.round(me.gamesWon/totG*100)}% won</span>
            <span style={{fontSize:10,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif"}}>{me.gamesWon+me.gamesLost} total</span>
            <span style={{fontSize:10,fontWeight:700,color:"#FF3355",fontFamily:"'DM Sans',sans-serif"}}>{Math.round(me.gamesLost/totG*100)}% lost</span>
          </div>
        </div>
      </div>
    );
  }

  function H2HView() {
    const [rivalId, setRivalId] = useState(null);
    const me     = players.find(p => p.isMe);
    const rivals = players.filter(p => !p.isMe);
    const rival  = rivalId ? players.find(p => p.id === rivalId) : null;

    // ── Dynamic H2H from feed ───────────────────────────────
    const h2h = useMemo(() => {
      if (!rival || !me) return null;
      let w = 0, l = 0;
      (feed || []).forEach(m => {
        const wIds = m.winnerIds || [];
        const lIds = m.loserIds  || [];
        const meW  = wIds.includes(me.id),   meL  = lIds.includes(me.id);
        const rivW = wIds.includes(rival.id), rivL = lIds.includes(rival.id);
        if ((meW || meL) && (rivW || rivL)) {
          if (meW && rivL) w++;
          else if (meL && rivW) l++;
        }
      });
      return { w, l };
    }, [rival, me, feed]);

    // ── Mini-Games Balance (total games won/lost in H2H matches) ──
    const mgBalance = useMemo(() => {
      if (!rival || !me) return { my: 0, their: 0 };
      let my = 0, their = 0;
      (feed || []).forEach(m => {
        const wIds = m.winnerIds || [];
        const lIds = m.loserIds  || [];
        const meW  = wIds.includes(me.id),   meL  = lIds.includes(me.id);
        const rivW = wIds.includes(rival.id), rivL = lIds.includes(rival.id);
        if ((meW || meL) && (rivW || rivL)) {
          if (meW) { my += countGames(m.sets,"w"); their += countGames(m.sets,"l"); }
          else     { my += countGames(m.sets,"l"); their += countGames(m.sets,"w"); }
        }
      });
      return { my, their };
    }, [rival, me, feed]);

    const total = h2h ? h2h.w + h2h.l : 0;
    const yp    = total ? Math.round(h2h.w / total * 100) : 50;
    const tp    = 100 - yp;

    const vrd = useMemo(() => {
      if (!rival || !h2h) return null;
      const t = h2h.w + h2h.l;
      if (!t)      return { icon:"❓", title:"NO DATA YET",          text:"Haven't played yet.",                          bg:"rgba(255,255,255,.04)", bdr:"rgba(255,255,255,.12)", color:"rgba(255,255,255,.5)", badge:null          };
      const r = h2h.w / t;
      if (!h2h.l)  return { icon:"👑", title:"UNTOUCHABLE",          text:`${rival.name} has NEVER beaten you.`,          bg:"rgba(170,255,0,.07)",   bdr:"rgba(170,255,0,.25)",  color:N,           badge:"PERFECT RECORD" };
      if (!h2h.w)  return { icon:"😰", title:"YOUR NIGHTMARE",       text:`Zero wins vs ${rival.name}. Trauma.`,          bg:"rgba(255,51,85,.07)",   bdr:"rgba(255,51,85,.25)",  color:"#FF3355",   badge:"0 WINS"         };
      if (r >= .8) return { icon:"💪", title:"DELIVERY BOY",         text:`${Math.round(r*100)}% win rate vs them.`,      bg:"rgba(170,255,0,.07)",   bdr:"rgba(170,255,0,.22)",  color:N,           badge:"DOMINANT"       };
      if (r >= .6) return { icon:"📈", title:"SLIGHT EDGE",          text:`You lead ${h2h.w}–${h2h.l}.`,                  bg:"rgba(170,255,0,.05)",   bdr:"rgba(170,255,0,.15)",  color:N,           badge:"AHEAD"          };
      if (r >= .45)return { icon:"⚔️", title:"DEAD HEAT",            text:`${h2h.w}–${h2h.l}. Every match counts.`,      bg:"rgba(255,184,48,.06)",  bdr:"rgba(255,184,48,.22)", color:"#FFB830",   badge:"EVEN"           };
      if (r >= .3) return { icon:"📉", title:"LOSING GROUND",        text:`${rival.name} leads ${h2h.l}–${h2h.w}.`,      bg:"rgba(255,107,53,.06)",  bdr:"rgba(255,107,53,.22)", color:"#FF6B35",   badge:"BEHIND"         };
      return         { icon:"🚨", title:"NIGHTMARE MATCHUP",         text:`${rival.name} dominates ${h2h.l}–${h2h.w}.`,  bg:"rgba(255,51,85,.07)",   bdr:"rgba(255,51,85,.25)",  color:"#FF3355",   badge:"LOSING BADLY"   };
    }, [rival, h2h]);

    return (
      <div>
        {/* ── Rival selector ── */}
        <p style={{fontSize:10,fontWeight:800,letterSpacing:"2px",color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginBottom:10}}>SELECT YOUR RIVAL</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {rivals.map(p => (
            <motion.button key={p.id} whileTap={{scale:.96}}
              onClick={() => setRivalId(prev => prev === p.id ? null : p.id)}
              className="flex items-center gap-2 rounded-[14px] px-3 py-3 text-left"
              style={{
                background: rivalId === p.id ? "rgba(170,255,0,.07)" : "rgba(255,255,255,.03)",
                border:     rivalId === p.id ? `1.5px solid ${N}` : "1.5px solid rgba(255,255,255,.07)",
                minWidth: 0,
              }}>
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px]"
                style={{background:pg(p),color:"#000",fontFamily:"'Bebas Neue',sans-serif"}}>
                {p.initials}
              </div>
              <div style={{minWidth:0, flex:1}}>
                <div style={{
                  fontSize:12, fontWeight:700,
                  color: rivalId === p.id ? "#fff" : "rgba(255,255,255,.65)",
                  fontFamily:"'DM Sans',sans-serif",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                }}>{p.name}</div>
              </div>
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {rival ? (
            <motion.div key={rival.id} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-12}} transition={{duration:.25}}>

              {/* ── VS Header — 3-column grid ── */}
              <div className="rounded-t-[22px] px-5 py-5"
                style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.09)",borderBottom:"none"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:0}}>
                  {/* Me */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center justify-center rounded-full font-black"
                      style={{width:52,height:52,background:pg(me),color:"#000",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:"1px",flexShrink:0}}>
                      {me.initials}
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:"'DM Sans',sans-serif",textAlign:"center",wordBreak:"break-word",maxWidth:90}}>
                      {me.name}
                    </div>
                    <div style={{fontSize:8,fontWeight:800,letterSpacing:"1.5px",color:N,fontFamily:"'DM Sans',sans-serif"}}>YOU</div>
                  </div>
                  {/* VS */}
                  <div className="flex items-center justify-center" style={{padding:"0 12px"}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:"2px",color:"rgba(255,255,255,.2)",lineHeight:1}}>VS</div>
                  </div>
                  {/* Rival */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center justify-center rounded-full font-black"
                      style={{width:52,height:52,background:pg(rival),color:"#000",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:"1px",flexShrink:0}}>
                      {rival.initials}
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:"'DM Sans',sans-serif",textAlign:"center",wordBreak:"break-word",maxWidth:90}}>
                      {rival.name}
                    </div>
                    <div style={{fontSize:8,fontWeight:800,letterSpacing:"1.5px",color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>RIVAL</div>
                  </div>
                </div>
              </div>

              {/* ── Score + progress bar ── */}
              <div className="rounded-b-[22px] px-5 py-4 mb-4"
                style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="text-center">
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"2px",lineHeight:1,color:N}}>{h2h.w}</div>
                    <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.35)",marginTop:4,fontFamily:"'DM Sans',sans-serif"}}>YOUR WINS</div>
                  </div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:"rgba(255,255,255,.18)",lineHeight:1}}>–</div>
                  <div className="text-center">
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"2px",lineHeight:1,color:"#FF3355"}}>{h2h.l}</div>
                    <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.35)",marginTop:4,fontFamily:"'DM Sans',sans-serif"}}>THEIR WINS</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="flex rounded-[6px] overflow-hidden" style={{height:8,background:"rgba(255,255,255,.08)"}}>
                  <motion.div style={{background:`linear-gradient(90deg,${N},#7DC900)`,borderRadius:total===0?"6px":"6px 0 0 6px"}}
                    initial={{width:"0%"}} animate={{width:`${yp}%`}} transition={{duration:.7}}/>
                  <motion.div style={{background:"linear-gradient(90deg,#FF3355,#C0143C)",borderRadius:"0 6px 6px 0"}}
                    initial={{width:"0%"}} animate={{width:`${tp}%`}} transition={{duration:.7,delay:.05}}/>
                </div>
                <div className="flex justify-between mt-2">
                  <span style={{fontSize:10,fontWeight:700,color:N,fontFamily:"'DM Sans',sans-serif"}}>{total ? `${yp}%` : "—"}</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,.28)",fontFamily:"'DM Sans',sans-serif"}}>{total} match{total !== 1 ? "es" : ""}</span>
                  <span style={{fontSize:10,fontWeight:700,color:"#FF3355",fontFamily:"'DM Sans',sans-serif"}}>{total ? `${tp}%` : "—"}</span>
                </div>

                {/* Mini-Games Balance */}
                {(mgBalance.my + mgBalance.their) > 0 && (
                  <div className="flex items-center justify-between mt-4 rounded-[12px] px-4 py-3"
                    style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)"}}>
                    <div className="text-center">
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:"1px",lineHeight:1,color:N}}>{mgBalance.my}</div>
                      <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>YOUR GAMES</div>
                    </div>
                    <div style={{fontSize:9,fontWeight:800,letterSpacing:"2px",color:"rgba(255,255,255,.2)",fontFamily:"'DM Sans',sans-serif"}}>MINI-GAMES</div>
                    <div className="text-center">
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:"1px",lineHeight:1,color:"#FF3355"}}>{mgBalance.their}</div>
                      <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>THEIR GAMES</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Verdict ── */}
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

              {/* ── Stats chips ── */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { l:"WIN RATE", v: total ? `${yp}%` : "—",                                       c: yp >= 50 ? N : "#FF3355"           },
                  { l:"MATCHES",  v: total,                                                          c: "rgba(255,255,255,.7)"             },
                  { l:"BALANCE",  v: h2h.w > h2h.l ? `+${h2h.w-h2h.l}` : h2h.w < h2h.l ? `-${h2h.l-h2h.w}` : "0", c: h2h.w >= h2h.l ? N : "#FF3355" },
                  { l:"MG BALANCE", v: (() => { const diff = mgBalance.my - mgBalance.their; return (mgBalance.my + mgBalance.their) > 0 ? (diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "0") : "—"; })(), c: mgBalance.my >= mgBalance.their ? N : "#FF3355" },
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
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:"2px",color:"rgba(255,255,255,.35)"}}>PICK A RIVAL</div>
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
      <div style={{fontSize:11,color:"rgba(255,255,255,.3)",fontFamily:"'DM Sans',sans-serif",marginTop:8}}>Players enter this code in "Join by Code" to join your league</div>
    </div>
  );
}

function LeagueTab({players,feed=[],rules,onRulesUpdate,onResetSeason,onAddPlayer,onRemovePlayer,onJoinAsPlayer,leagueId,ownerId,user,onDeleteLeague,squadPhotoUrl=null,onSquadPhotoUpdate=null,joinCode=null}) {
  const [editing,          setEditing]          = useState(false);
  const [draft,            setDraft]            = useState(rules);
  const [confirm,          setConfirm]          = useState(false);
  const [confirmDelete,    setConfirmDelete]    = useState(false);
  const [copied,           setCopied]           = useState(false);

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
    } catch {}
    setSquadUploading(false);
    e.target.value = "";
  }, [leagueId, onSquadPhotoUpdate]);

  const handleShare = useCallback(async () => {
    const code = joinCode || leagueId;
    const url = `https://league-it-app.vercel.app/join/${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join my League-It league!", text: "You've been invited 🏆", url }); }
      catch {} // user cancelled
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

      {/* Real Standings Table here too */}
      <ST>👥 Squad Roster — Standings</ST>
      <StandingsTable players={players} feed={feed}/>

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
        </>
      )}

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
              You're not in the standings yet
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
  const [editName, setEditName] = useState(false);
  const [draftName,setDraftName] = useState(displayName);
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;
  const rows      = useMemo(()=>byWins(players),[players]);
  const myRank    = rows.findIndex(p=>p.isMe)+1;
  const wr        = pct(me.wins,me.losses);
  const myMatches = useMemo(()=>feed.filter(m=>(m.winnerIds||[]).includes(me.id)||(m.loserIds||[]).includes(me.id)),[feed,me.id]);

  // ── Gamification ──────────────────────────────────────────────────────────
  const totalXP = useMemo(()=>myMatches.reduce((acc,m)=>{
    const isWin=(m.winnerIds||[]).includes(me.id);
    return acc+(isWin?100:25)+(isWin&&m.isComeback?75:0);
  },0),[myMatches,me.id]);
  const lvlData   = useMemo(()=>calcLevel(totalXP),[totalXP]);
  const ovr       = useMemo(()=>calcOVR(me.wins,me.losses,me.totalPlayed,me.clutchWins,me.comebacks,wr),[me,wr]);
  const dnaTitle  = useMemo(()=>styleTitle(me.wins,me.comebacks,wr,me.totalPlayed),[me,wr]);

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
    } catch {}
    setAvatarUploading(false);
    e.target.value = "";
  }, [user, onAvatarUpdate]);

  const skills = useMemo(()=>[
    {l:"Clutch",      v:Math.min(99,Math.round(50+wr/2+(me.streak>0?me.streak*3:0))),c:N},
    {l:"Power",       v:Math.min(99,Math.round(40+meE.gamesWon*.8)),                  c:"#3B8EFF"},
    {l:"Reliability", v:Math.min(99,Math.round(me.totalPlayed/14*85+10)),             c:"#FFB830"},
    {l:"Stamina",     v:Math.min(99,Math.round(45+me.totalPlayed*2.5)),               c:"#AA55FF"},
  ].map(s=>({...s,v:Math.round(s.v)})),[me,meE,wr]);

  // Trophies
  const mvpPlayer  = useMemo(()=>[...players].sort((a,b)=>b.wins-a.wins)[0],[players]);
  const mgChampion = useMemo(()=>[...enriched].sort((a,b)=>b.gamesWon-a.gamesWon)[0],[enriched]);
  const isMVP      = mvpPlayer.id===me.id;
  const isMGChamp  = mgChampion.id===me.id;
  const clutchLeader = useMemo(()=>[...players].sort((a,b)=>(b.clutchWins||0)-(a.clutchWins||0))[0],[players]);
  const streakLeader = useMemo(()=>[...players].sort((a,b)=>(b.bestStreak||0)-(a.bestStreak||0))[0],[players]);
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
              <span className="flex-1 text-sm italic" style={{color:"rgba(255,255,255,.6)",fontFamily:"'DM Sans',sans-serif"}}>"{quote}"</span>
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

/* ── BOTTOM NAV ── */
function BottomNav({active,onChange}) {
  const tabs=[{id:"home",Icon:Home,lbl:"Home"},{id:"stats",Icon:BarChart2,lbl:"Stats"},{id:"league",Icon:Users,lbl:"League"},{id:"profile",Icon:User,lbl:"Profile"}];
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
  const [activeTab,setActiveTab] = useState("home");
  const [players,  setPlayers]   = useState(initialPlayers);
  const [feed,     setFeed]      = useState(initialFeed);
  const [rules,    setRules]     = useState(initialRules || INIT_RULES);
  const [showLog,         setShowLog]         = useState(false);
  const [editMatch,       setEditMatch]       = useState(null);
  const [showAddPlayer,   setShowAddPlayer]   = useState(false);
  const [addPlayerName,   setAddPlayerName]   = useState("");
  const [showRemovePlayer,setShowRemovePlayer]= useState(false);


  // Derive all stats from match history — single source of truth
  const enrichedPlayers = useMemo(()=>derivePlayerStats(players, feed),[players, feed]);
  const sortedPlayers   = useMemo(()=>byWins(enrichedPlayers),[enrichedPlayers]);

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

  const content = {
    home:    <HomeTab    players={enrichedPlayers} feed={feed} onEditFeed={handleEdit} onDeleteFeed={handleDeleteMatch} isAdmin={!!(user?.id && ownerId && user.id===ownerId)} myPlayerId={players.find(p=>p.isMe)?.id||null}/>,
    stats:   <StatsTab   players={enrichedPlayers} feed={feed}/>,
    league:  <LeagueTab  players={enrichedPlayers} feed={feed} rules={rules} onRulesUpdate={setRules} onResetSeason={()=>{setPlayers([]);setFeed([]);}} onAddPlayer={handleAddPlayer} onRemovePlayer={handleRemovePlayer} onJoinAsPlayer={handleJoinAsPlayer} leagueId={leagueId} ownerId={ownerId} user={user} onDeleteLeague={onDeleteLeague} squadPhotoUrl={squadPhotoUrl} onSquadPhotoUpdate={onSquadPhotoUpdate} joinCode={joinCode}/>,
    profile: <ProfileTab players={enrichedPlayers} feed={feed} user={user} profile={profile} onProfileUpdate={async (n)=>{ await onProfileUpdate?.(n); const ini=n.trim().split(/\s+/).map(w=>w[0].toUpperCase()).slice(0,2).join(""); setPlayers(prev=>prev.map(p=>p.isMe?{...p,name:n.trim(),initials:ini}:p)); }} onAvatarUpdate={onAvatarUpdate}/>,
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
              {(profile?.avatar_url || user?.user_metadata?.avatar_url)
                ? <img src={profile?.avatar_url || user.user_metadata.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{border:`2px solid ${N}44`}}/>
                : <div className="flex items-center justify-center rounded-full w-9 h-9 text-[11px] font-black flex-shrink-0"
                    style={{background:`linear-gradient(135deg,${N},#7DC900)`,color:"#000",fontFamily:"'DM Sans',sans-serif"}}>
                    {(profile?.display_name||user?.user_metadata?.full_name||user?.email||"YO").trim().split(/\s+/).map(w=>w[0].toUpperCase()).slice(0,2).join("")}
                  </div>
              }
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

          {/* FAB */}
          {activeTab==="home"&&(
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
                  <p style={{fontSize:11,color:"rgba(255,255,255,.35)",fontFamily:"'DM Sans',sans-serif",marginTop:2}}>They'll appear on the leaderboard immediately.</p>
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
  { id: "padel",        label: "Padel",      emoji: "🏸", sub: "Racket · Sets · Doubles"    },
  { id: "footvolley",   label: "Footvolley", emoji: "🏖️", sub: "Beach · No hands · Fun"      },
  { id: "volleyball",   label: "Volleyball", emoji: "🏐", sub: "Team · Rally scoring"         },
  { id: "tennis",       label: "Tennis",     emoji: "🎾", sub: "Classic · Singles/Doubles"    },
  { id: "pingpong",     label: "Ping Pong",  emoji: "🏓", sub: "Fast · Spin · 11 pts"         },
  { id: "fifa",         label: "FIFA",       emoji: "🎮", sub: "Console · 6 min halves · 1v1" },
  { id: "custom_sport", label: "Custom",     emoji: "⚙️", sub: "Name it, brand it, play it"  },
];

const CUSTOM_SPORT_EMOJIS = [
  "⚽","🏀","🏈","⚾","🏐","🏉","🎾","🏒","🏑","🥍","🏏","🎱","🏓","🏸",
  "🥊","🥋","🤸","🏋️","🚴","🏊","🧗","🤺","🎯","🎳","🛹","🏆","🔥","⚡",
];

const FORMATS = [
  { id: "single",       label: "Single Set",    Icon: Zap,      desc: "1 set decides everything — fastest format"   },
  { id: "best3",        label: "Best of 3",     Icon: Target,   desc: "First to win 2 sets takes the match"         },
  { id: "points",       label: "Points-Based",  Icon: Hash,     desc: "First to reach target points wins"           },
  { id: "custom_logic", label: "Custom Rules",  Icon: Settings, desc: "Describe your specific house rules"          },
];

const PT_PRESETS = [11, 15, 21];

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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
            doesn't lie.
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
            {SPORTS.map((s, i) => {
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
                  className="relative flex flex-col items-center text-center rounded-[22px] py-6 px-3 transition-all"
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
                  <span
                    style={{
                      fontSize: 10, marginTop: 3, fontWeight: 500,
                      color: "rgba(255,255,255,0.33)", fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {s.sub}
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
];

function StepTournamentFormat({ tournamentFormat, setTournamentFormat, onNext }) {
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
        </motion.div>
      </div>
      <FixedFooter>
        <PBtn onClick={onNext} disabled={!tournamentFormat}>
          {tournamentFormat === "knockout" ? "Build the Bracket →" : "Set Up Rules →"}
        </PBtn>
      </FixedFooter>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 3 — RULE ENGINE
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
            {FORMATS.map((f, i) => {
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
                        {f.id === "single" && (
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
                                {customRules.trim().length} chars · Rules will be pinned to your league's info page.
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
function StepInvite({ sport, format, points, customSportName, customSportEmoji, customRules, leagueName, leagueCode, onFinish, saving = false, createErr = "" }) {
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
              {" "}No more excuses. Let's see who's #1. 😤
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
// LEAGUEITONBOARDING
// ─────────────────────────────────────────────
function LeagueItOnboarding({ onFinish, initialStep = 0, onBackToHub = null, user = null, onSignIn = null, hasPendingJoin = false }) {
  const [step, setStep] = useState(initialStep);
  const [dir,  setDir]  = useState(1);

  const [sport,             setSport]             = useState(null);
  const [customSportName,   setCustomSportName]   = useState("");
  const [customSportEmoji,  setCustomSportEmoji]  = useState("🏆");
  const [tournamentFormat,  setTournamentFormat]  = useState("classic");
  const [format,            setFormat]            = useState("single");
  const [points,            setPoints]            = useState(21);
  const [customRules,       setCustomRules]       = useState("");
  const [leagueName,        setLeagueName]        = useState("");
  const [adminName,         setAdminName]         = useState(user?.user_metadata?.full_name || "");
  const [leagueCode]                              = useState(generateCode);
  const [saving,            setSaving]            = useState(false);
  const [createErr,         setCreateErr]         = useState("");

  const TOTAL_WIZARD_STEPS = 6;

  const goNext = useCallback(() => {
    setDir(1);
    setStep(s => Math.min(s + 1, 6));
  }, []);

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
      await onFinish({ leagueName, adminName, sport, tournamentFormat, format, points, customSportName, customSportEmoji, customRules, leagueCode });
    } catch (e) {
      console.error(e);
      setCreateErr("Something went wrong. Please try again.");
      setSaving(false);
    }
  }, [saving, onFinish, leagueName, adminName, sport, tournamentFormat, format, points, customSportName, customSportEmoji, customRules, leagueCode]);

  const sportProps = { sport, setSport, customSportName, setCustomSportName, customSportEmoji, setCustomSportEmoji };
  const rulesProps = { format, setFormat, points, setPoints, customRules, setCustomRules };

  const screens = [
    <StepLanding key="landing" onNext={goNext} onSignIn={onSignIn} hasPendingJoin={hasPendingJoin} />,
    <StepSport   key="sport"   {...sportProps} onNext={goNext} />,
    <StepTournamentFormat
      key="tournament-format"
      tournamentFormat={tournamentFormat} setTournamentFormat={setTournamentFormat}
      onNext={goNext}
    />,
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
            {step > 0 && step < 6 && (
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
// LOGIN SCREEN
// ─────────────────────────────────────────────
function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const handleGoogle = async () => {
    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
    } catch {
      setLoading(false);
    }
  };
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;background:#0A0A0A;}
      `}</style>
      <div style={{minHeight:"100vh",background:BG,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        <GridBg/><GlowBlobs/>
        <div style={{width:"100%",maxWidth:380,padding:"0 24px",position:"relative",zIndex:1,textAlign:"center"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,letterSpacing:"6px",color:N,textShadow:"0 0 32px rgba(170,255,0,.5)",lineHeight:1,marginBottom:8}}>LEAGUE-IT</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.4)",fontFamily:"'DM Sans',sans-serif",letterSpacing:"2px",fontWeight:600,marginBottom:48}}>YOUR LEAGUE. YOUR RULES.</div>
          <motion.button
            whileHover={{scale:1.03,y:-2}} whileTap={{scale:.97}}
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-[18px] py-4 font-bold text-[15px] relative overflow-hidden"
            style={{background:"#fff",color:"#000",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",boxShadow:"0 8px 28px rgba(255,255,255,.14)",opacity:loading?.6:1}}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? "Signing in…" : "Continue with Google"}
          </motion.button>
          <p style={{fontSize:11,color:"rgba(255,255,255,.2)",fontFamily:"'DM Sans',sans-serif",marginTop:20}}>By continuing you agree to play fair 🤝</p>
        </div>
      </div>
    </>
  );
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
      } catch {}
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

  const fallbackFact = useMemo(() => {
    if (!hubStats) return null;
    const pool = [];
    if (hubStats.winStreak >= 3) pool.push(`${hubStats.winStreak}-match win streak 🔥`);
    else if (hubStats.winStreak === 2) pool.push(`Two wins in a row ⚡`);
    if (hubStats.thisMonth > 0) pool.push(`${hubStats.thisMonth} match${hubStats.thisMonth>1?"es":""} played this month`);
    if (hubStats.total >= 10) pool.push(`${hubStats.total} total matches logged 🏆`);
    if (hubStats.leagueCount > 1) pool.push(`Active in ${hubStats.leagueCount} leagues 🎯`);
    if (!pool.length && hubStats.total > 0) pool.push(`${hubStats.total} total match${hubStats.total>1?"es":""} logged`);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }, [hubStats]);

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
  const [phase,         setPhase]         = useState("loading");
  const [user,          setUser]          = useState(null);
  const [leagues,          setLeagues]          = useState([]);
  const [activeData,       setActiveData]       = useState(null);
  const [profile,          setProfile]          = useState(null);
  const [pendingJoinId,    setPendingJoinId]    = useState(null);
  const [pendingJoinCode,  setPendingJoinCode]  = useState(null);

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
  //                      or  /join/ABC123            (bare code)
  //                      or  /join/<uuid>            (legacy league-ID link)
  // Join codes are 6 uppercase alphanumeric chars (no O, I, 0, 1) from generateCode().
  useEffect(() => {
    const m = window.location.pathname.match(/^\/join\/([^/]+)$/);
    if (!m) return;
    const segment = m[1];
    window.history.replaceState({}, "", "/");
    // Extract the last dash-delimited part and check if it's a join code
    const parts    = segment.split("-");
    const lastPart = parts[parts.length - 1];
    const isCode   = /^[A-Z2-9]{6}$/.test(lastPart);
    if (isCode) {
      // New code-based flow — use localStorage so it survives the OAuth redirect
      localStorage.setItem("pending_join_code", lastPart);
    } else {
      // Legacy UUID-based flow
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

  // ── Auto-join via pending join code (from share URL) ─────────────────────
  useEffect(() => {
    if (!pendingJoinCode || !user) return;
    (async () => {
      try {
        const result = await handleJoinLeague(pendingJoinCode);
        if (result?.error && result.error !== "You're already in this league") {
          // code not found or network error — silently clear
        }
      } catch {}
      setPendingJoinCode(null);
    })();
  }, [pendingJoinCode, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateLeague = useCallback(async (name, sport) => {
    if (!user) return;
    try {
      const code      = generateCode();
      const leagueId  = crypto.randomUUID();
      // Insert without .select() — RLS SELECT may block the row back even when INSERT succeeds
      const { error: leagueErr } = await supabase.from("leagues").insert({
        id: leagueId, name, sport, join_code: code,
        settings: { leagueCode: code }, owner_id: user.id, created_by: user.id,
      });
      if (leagueErr) return;
      const displayName = profile?.display_name || user.user_metadata?.full_name || user.email || "Player";
      const initials    = displayName.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").slice(0, 2).join("");
      await supabase.from("players").insert({
        id: crypto.randomUUID(), league_id: leagueId, user_id: user.id,
        name: displayName, is_me: true,
        stats: { initials, wins:0, losses:0, streak:0, totalPlayed:0, trend:"flat", sport:"🏸", mvTrend:[0,0,0,0,0,0,0], partners:{}, clutchWins:0, bestStreak:0 },
      });
      await loadLeagues(user.id);
    } catch {
      // network error — silently ignore
    }
  }, [user, profile, loadLeagues]);

  const handleJoinLeague = useCallback(async (code) => {
    if (!user) return { error: "Not logged in" };
    try {
      // Primary lookup — dedicated join_code column (fast, indexed)
      let { data: league } = await supabase.from("leagues").select("*").eq("join_code", code).maybeSingle();
      // Fallback — legacy leagues whose code lives in settings JSON
      if (!league) {
        const { data: allLeagues } = await supabase.from("leagues").select("*");
        league = allLeagues?.find(l => l.settings?.leagueCode === code) || null;
      }
      if (!league) return { error: "League not found — check the code" };
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
      return { success: true };
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

  const handleWizardFinish = useCallback(async ({ leagueName, adminName, sport, tournamentFormat, format, points, customSportName, customSportEmoji, customRules, leagueCode }) => {
    if (!user) throw new Error("Not logged in");

    const name        = leagueName?.trim() || "My League";
    const sportData   = SPORTS.find(s => s.id === sport);
    const sportLabel  = customSportName?.trim() || sportData?.label || "Sport";
    const sportEmoji  = sport === "custom_sport" ? (customSportEmoji || "⚙️") : (sportData?.emoji || "🏸");
    const displayName = adminName?.trim() || profile?.display_name || user.user_metadata?.full_name || user.email || "Player";
    const initials    = displayName.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").slice(0, 2).join("") || "??";
    // Generate IDs client-side — never depend on Supabase returning the row back
    // (RLS SELECT policy may block the row even after a successful INSERT)
    const leagueId = crypto.randomUUID();
    const playerId  = crypto.randomUUID();
    const code      = leagueCode || generateCode();

    // ── Step 1: League insert — only step allowed to throw (league not yet created) ──
    const { error: leagueErr } = await supabase.from("leagues").insert({
      id:         leagueId,
      name,
      sport:      sportLabel,
      join_code:  code,
      settings:   { leagueCode: code, tournamentFormat: tournamentFormat || "classic", format, points, customRules, sportEmoji },
      owner_id:   user.id,
      created_by: user.id,
    });
    if (leagueErr) {
      // join_code column missing in DB — retry without it
      if (leagueErr.message?.includes("join_code") || leagueErr.code === "42703") {
        const { error: retryErr } = await supabase.from("leagues").insert({
          id: leagueId, name, sport: sportLabel,
          settings: { leagueCode: code, tournamentFormat: tournamentFormat || "classic", format, points, customRules, sportEmoji },
          owner_id: user.id, created_by: user.id,
        });
        if (retryErr) throw new Error(retryErr.message || "Failed to create league");
      } else {
        throw new Error(leagueErr.message || "Failed to create league");
      }
    }

    // Admin is NOT auto-added to players — they must use "Join as Player" inside the league view.
    // Step 2: Reload leagues from DB then go to hub — guaranteed sync, no local state guessing ──
    try { await loadLeagues(user.id); } catch { /* ignore */ }
    setPhase("hub");
  }, [user, profile, loadLeagues]);

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
        We're having trouble loading your data.<br/>
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