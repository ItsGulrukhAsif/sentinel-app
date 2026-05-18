import { useState, useEffect, useRef, useCallback } from "react";

// ── Agents ────────────────────────────────────────────────────────────────────
const AGENTS = {
  DISPATCHER: {
    id: "DISPATCHER", name: "Dispatcher Alpha", badge: "D-01",
    color: "#ff3b3b", role: "Primary Contact", avatar: "📡",
    voice: { pitch: 1.0, rate: 0.92, volume: 1 },
  },
  MEDICAL: {
    id: "MEDICAL", name: "MED Unit", badge: "M-07",
    color: "#00e5ff", role: "Medical Advisor", avatar: "🩺",
    voice: { pitch: 1.15, rate: 0.88, volume: 1 },
  },
  SAFETY: {
    id: "SAFETY", name: "Safety Lead", badge: "S-03",
    color: "#ffcc00", role: "Evacuation Specialist", avatar: "🛡️",
    voice: { pitch: 0.85, rate: 0.95, volume: 1 },
  },
};

const SYSTEM_PROMPT = `You are SENTINEL — a coordinated multi-agent emergency AI dispatch system. You manage THREE specialized agents that respond together to save the caller's life:

AGENT 1 - DISPATCHER ALPHA (D-01): Primary contact. Assesses situation, coordinates agents, keeps caller calm, asks ONE critical question at a time. Always speaks first.

AGENT 2 - MED UNIT (M-07): Medical advisor. Real-time first-aid, CPR guidance, bleeding control, shock prevention. Only speaks when medical help is relevant.

AGENT 3 - SAFETY LEAD (S-03): Evacuation & safety expert. Escape routes, shelter-in-place, fire/flood/attack response. Only speaks when movement/safety is relevant.

CRITICAL RULES:
- LIFE OR DEATH. Be URGENT, CLEAR, DIRECT. Short sentences.
- ALWAYS respond in this exact JSON format — nothing else:
{
  "messages": [
    { "agent": "DISPATCHER", "text": "..." },
    { "agent": "MEDICAL", "text": "..." }
  ],
  "status": "ACTIVE|STABLE|RESOLVED",
  "threat_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "priority_action": "Single most critical action in under 10 words"
}
- Include only agents with something relevant to say (min 1, max 3).
- DISPATCHER always leads. Others only follow if relevant.
- Keep each agent message under 40 words. Short. Punchy. Actionable.
- Ask exactly ONE question at a time.
- Use numbered steps for instructions.
- NEVER identify as AI. You ARE their lifeline.
- De-escalate if user says they are safe. Escalate if danger worsens.`;

// ── Voice Queue Manager ────────────────────────────────────────────────────────
class VoiceQueue {
  constructor() { this.queue = []; this.speaking = false; this.onStart = null; this.onEnd = null; }
  enqueue(text, agentId, onDone) {
    this.queue.push({ text, agentId, onDone });
    if (!this.speaking) this._next();
  }
  _next() {
    if (!this.queue.length) { this.speaking = false; if (this.onEnd) this.onEnd(); return; }
    this.speaking = true;
    const { text, agentId, onDone } = this.queue.shift();
    const agent = AGENTS[agentId];
    const utt = new SpeechSynthesisUtterance(text);
    utt.pitch = agent?.voice.pitch ?? 1;
    utt.rate = agent?.voice.rate ?? 0.9;
    utt.volume = agent?.voice.volume ?? 1;
    const voices = window.speechSynthesis.getVoices();
    const eng = voices.filter(v => v.lang.startsWith("en"));
    if (eng.length > 0) {
      const idx = agentId === "DISPATCHER" ? 0 : agentId === "MEDICAL" ? Math.min(1, eng.length-1) : Math.min(2, eng.length-1);
      utt.voice = eng[idx];
    }
    if (this.onStart) this.onStart(agentId);
    utt.onend = () => { if (onDone) onDone(); this._next(); };
    utt.onerror = () => { this._next(); };
    window.speechSynthesis.speak(utt);
  }
  stop() { window.speechSynthesis.cancel(); this.queue = []; this.speaking = false; }
}

const voiceQueue = new VoiceQueue();

// ── Waveform Bars ─────────────────────────────────────────────────────────────
function Waveform({ color, active }) {
  const bars = 18;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 28 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2,
          background: color,
          height: active ? `${Math.random() * 80 + 20}%` : "15%",
          opacity: active ? 0.9 : 0.2,
          transition: "height 0.12s ease",
          animation: active ? `wave ${0.4 + (i % 5) * 0.1}s ${i * 0.04}s ease-in-out infinite alternate` : "none",
        }} />
      ))}
    </div>
  );
}

// ── Mic Waveform (user speaking) ──────────────────────────────────────────────
function MicWave({ active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 22 }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2,
          background: "#fff",
          animation: active ? `wave ${0.35 + (i % 4) * 0.12}s ${i * 0.05}s ease-in-out infinite alternate` : "none",
          height: active ? `${30 + (i % 5) * 14}%` : "10%",
          opacity: active ? 1 : 0.3,
          transition: "height 0.15s",
        }} />
      ))}
    </div>
  );
}

// ── PulsingDot ────────────────────────────────────────────────────────────────
function PulsingDot({ color = "#ff3b3b", size = 8 }) {
  return <span style={{
    display: "inline-block", width: size, height: size,
    borderRadius: "50%", background: color,
    boxShadow: `0 0 ${size}px ${color}`,
    animation: "pulse 1.2s ease-in-out infinite", flexShrink: 0,
  }} />;
}

// ── AgentBadge ────────────────────────────────────────────────────────────────
function AgentBadge({ agent, mini }) {
  const a = AGENTS[agent]; if (!a) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${a.color}18`, border: `1px solid ${a.color}55`,
      borderRadius: 6, padding: mini ? "2px 8px" : "4px 10px",
      fontSize: mini ? 10 : 11, fontFamily: "'Share Tech Mono', monospace",
      color: a.color, letterSpacing: 1,
    }}>
      <span>{a.avatar}</span>
      <span style={{ fontWeight: 700 }}>{a.badge}</span>
      {!mini && <><span style={{ opacity: 0.6 }}>·</span><span style={{ opacity: 0.6 }}>{a.role}</span></>}
    </div>
  );
}

// ── ThreatMeter ───────────────────────────────────────────────────────────────
function ThreatMeter({ level }) {
  const levels = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const colors = { LOW: "#00ff88", MEDIUM: "#ffcc00", HIGH: "#ff8800", CRITICAL: "#ff3b3b" };
  const n = levels[level] || 0; const c = colors[level] || "#555";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 9, color: "#555", fontFamily: "'Share Tech Mono', monospace", letterSpacing: 1 }}>THREAT</span>
      {[1,2,3,4].map(i => (
        <div key={i} style={{
          width: 14, height: 7, borderRadius: 2,
          background: i <= n ? c : "#1a1a1a",
          boxShadow: i <= n ? `0 0 5px ${c}` : "none",
          transition: "all 0.4s",
        }} />
      ))}
      <span style={{ fontSize: 10, color: c, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700, letterSpacing: 1 }}>{level}</span>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, isNew, speakingAgent }) {
  const agent = AGENTS[msg.agent];
  const [displayed, setDisplayed] = useState(isNew ? "" : msg.text);
  useEffect(() => {
    if (!isNew) return;
    setDisplayed("");
    let i = 0;
    const t = setInterval(() => {
      setDisplayed(msg.text.slice(0, i + 1)); i++;
      if (i >= msg.text.length) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [msg.text, isNew]);

  const text = isNew ? displayed : msg.text;
  const isSpeaking = speakingAgent === msg.agent && isNew;

  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <div style={{
          maxWidth: "65%", background: "#161616", border: "1px solid #2a2a2a",
          borderRadius: "12px 12px 2px 12px", padding: "10px 14px",
          fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: "#ccc", lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 9, color: "#444", marginBottom: 4, letterSpacing: 1 }}>YOU · {msg.time}</div>
          {msg.isVoice && <span style={{ fontSize: 9, color: "#555", marginRight: 6 }}>🎙️ VOICE</span>}
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-start" }}>
      <div style={{
        width: 38, height: 38, borderRadius: 8,
        background: `${agent?.color}1a`, border: `1.5px solid ${agent?.color}${isSpeaking ? "cc" : "55"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, flexShrink: 0,
        boxShadow: isSpeaking ? `0 0 20px ${agent?.color}88` : `0 0 8px ${agent?.color}22`,
        transition: "all 0.3s",
      }}>
        {agent?.avatar}
      </div>
      <div style={{ maxWidth: "74%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <AgentBadge agent={msg.agent} mini />
          {isSpeaking && <Waveform color={agent?.color} active={true} />}
          <span style={{ fontSize: 9, color: "#333", fontFamily: "'Share Tech Mono', monospace" }}>{msg.time}</span>
        </div>
        <div style={{
          background: `${agent?.color}08`,
          border: `1px solid ${agent?.color}${isSpeaking ? "55" : "22"}`,
          borderRadius: "2px 12px 12px 12px",
          padding: "10px 14px",
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 13, color: "#e8e8e8", lineHeight: 1.75,
          whiteSpace: "pre-wrap",
          transition: "border-color 0.3s",
        }}>
          {text}
          {isNew && text.length < msg.text.length && (
            <span style={{ animation: "blink 0.7s infinite", color: agent?.color }}>▋</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function Sentinel() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("STANDBY");
  const [threatLevel, setThreatLevel] = useState("LOW");
  const [priorityAction, setPriorityAction] = useState(null);
  const [newMsgIds, setNewMsgIds] = useState(new Set());
  const [callTime, setCallTime] = useState(0);
  const [error, setError] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speakingAgent, setSpeakingAgent] = useState(null);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const bottomRef = useRef(null);
  const historyRef = useRef([]);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setCallTime(c => c + 1), 1000);
    return () => clearInterval(t);
  }, [started]);

  // Check voice support
  useEffect(() => {
    const hasSpeech = "speechSynthesis" in window;
    const hasSR = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    setVoiceSupported(hasSpeech && hasSR);
    // pre-load voices
    if (hasSpeech) window.speechSynthesis.getVoices();
  }, []);

  // Voice queue callbacks
  useEffect(() => {
    voiceQueue.onStart = (agentId) => setSpeakingAgent(agentId);
    voiceQueue.onEnd = () => setSpeakingAgent(null);
  }, []);

  const formatTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const nowStamp = () => new Date().toLocaleTimeString("en-US", { hour12: false });

  // ── Speak agent messages ──────────────────────────────────────────────────
  const speakMessages = useCallback((agentMsgs) => {
    if (!voiceEnabled) return;
    agentMsgs.forEach((msg, i) => {
      const prefix = `${AGENTS[msg.agent]?.name ?? msg.agent} says: `;
      voiceQueue.enqueue(msg.text, msg.agent, null);
    });
  }, [voiceEnabled]);

  // ── Call API ──────────────────────────────────────────────────────────────
  const callAgent = useCallback(async (userText, isFirst = false, isVoice = false) => {
    setLoading(true); setError(null);

    const apiMessages = isFirst
      ? [{ role: "user", content: "EMERGENCY CALL INITIATED. Greet caller urgently, identify yourself as SENTINEL AI dispatch, ask what their emergency is." }]
      : [...historyRef.current, { role: "user", content: userText }];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";
      let parsed;
      try {
        const clean = raw.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      }
      if (!parsed) throw new Error("Bad response");

      const stamp = nowStamp();
      const agentMsgs = (parsed.messages || []).map((m, i) => ({
        role: "agent", id: Date.now() + i + 1,
        agent: m.agent, text: m.text, time: stamp,
      }));

      setStatus(parsed.status || "ACTIVE");
      setThreatLevel(parsed.threat_level || "MEDIUM");
      if (parsed.priority_action) setPriorityAction(parsed.priority_action);

      const assistantContent = (parsed.messages || []).map(m => `[${m.agent}]: ${m.text}`).join("\n");
      historyRef.current = [
        ...historyRef.current,
        ...(isFirst ? [] : [{ role: "user", content: userText }]),
        { role: "assistant", content: assistantContent },
      ];

      const ids = new Set(agentMsgs.map(m => m.id));
      setNewMsgIds(ids);

      setMessages(prev => {
        const next = [...prev];
        if (!isFirst && userText) {
          next.push({ role: "user", id: Date.now(), text: userText, time: stamp, isVoice });
        }
        agentMsgs.forEach(m => next.push(m));
        return next;
      });

      setTimeout(() => speakMessages(agentMsgs), 400);

    } catch (e) {
      setError("Signal lost. Stay calm — try again.");
    } finally {
      setLoading(false);
    }
  }, [speakMessages]);

  // ── Voice Input ───────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!voiceSupported) return;
    voiceQueue.stop(); setSpeakingAgent(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(t);
    };
    rec.onend = () => {
      setIsListening(false);
      setTranscript(prev => {
        if (prev.trim()) {
          callAgent(prev.trim(), false, true);
        }
        return "";
      });
    };
    rec.onerror = () => { setIsListening(false); setTranscript(""); };
    recognitionRef.current = rec;
    rec.start();
  }, [voiceSupported, callAgent]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    callAgent(text, false, false);
  };

  const handleStart = () => {
    setStarted(true);
    callAgent("", true);
  };

  const statusColors = { STANDBY: "#444", ACTIVE: "#ff3b3b", STABLE: "#ffcc00", RESOLVED: "#00ff88" };

  // ── LANDING ───────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={{
        minHeight: "100vh", background: "#030303",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'Share Tech Mono', monospace",
        position: "relative", overflow: "hidden",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@300;400;600;700;800&display=swap');
          @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes wave { from{height:15%} to{height:90%} }
          @keyframes scanline { 0%{top:-2px} 100%{top:100vh} }
          @keyframes ring { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.8);opacity:0} }
          @keyframes slidein { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
          @keyframes gridpulse { 0%,100%{opacity:0.04} 50%{opacity:0.09} }
          @keyframes flash { 0%,100%{background:#ff3b3b07} 50%{background:#ff3b3b1a} }
          @keyframes glitch { 0%,100%{clip-path:inset(0 0 100% 0)} 20%{clip-path:inset(15% 0 65% 0)} 40%{clip-path:inset(55% 0 20% 0)} 60%{clip-path:inset(40% 0 40% 0)} 80%{clip-path:inset(80% 0 5% 0)} }
        `}</style>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(#ff3b3b0a 1px, transparent 1px), linear-gradient(90deg, #ff3b3b0a 1px, transparent 1px)",
          backgroundSize: "48px 48px", animation: "gridpulse 5s ease-in-out infinite",
        }} />
        <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(transparent,#ff3b3b18,transparent)", animation: "scanline 7s linear infinite", pointerEvents: "none" }} />

        <div style={{ position: "relative", marginBottom: 52 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              position: "absolute", inset: `-${i*24}px`, border: "1px solid #ff3b3b22",
              borderRadius: "50%", animation: `ring 4s ${i*0.7}s ease-out infinite`,
            }} />
          ))}
          <div style={{
            width: 90, height: 90, borderRadius: "50%",
            background: "radial-gradient(circle, #ff3b3b30, #030303)",
            border: "2px solid #ff3b3b", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, boxShadow: "0 0 60px #ff3b3b55",
          }}>📡</div>
        </div>

        <div style={{ textAlign: "center", animation: "slidein 0.9s ease", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 8, color: "#ff3b3b88", marginBottom: 10 }}>
            MULTI-AGENT EMERGENCY DISPATCH · NETWORK v4.0
          </div>
          <h1 style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 72, fontWeight: 800, margin: "0 0 4px",
            color: "#fff", letterSpacing: 12,
            textShadow: "0 0 60px #ff3b3b88, 0 0 120px #ff3b3b33",
          }}>SENTINEL</h1>
          <div style={{ fontSize: 11, color: "#444", letterSpacing: 4, marginBottom: 48 }}>
            AI · POWERED · EMERGENCY · RESPONSE · SYSTEM
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 52 }}>
            {Object.values(AGENTS).map(a => (
              <div key={a.id} style={{
                background: `${a.color}0a`, border: `1px solid ${a.color}33`,
                borderRadius: 10, padding: "12px 18px",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>{a.avatar}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 11, color: a.color, fontWeight: 700, letterSpacing: 1 }}>{a.badge}</div>
                  <div style={{ fontSize: 9, color: "#444", letterSpacing: 1 }}>{a.role}</div>
                </div>
                <PulsingDot color={a.color} />
              </div>
            ))}
          </div>

          {voiceSupported && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
              marginBottom: 20, fontSize: 10, color: "#00ff8888", letterSpacing: 2,
            }}>
              <PulsingDot color="#00ff88" size={6} />
              VOICE COMMUNICATION ENABLED
            </div>
          )}

          <button onClick={handleStart} style={{
            background: "linear-gradient(135deg, #ff3b3b, #cc0000)",
            border: "none", borderRadius: 10, padding: "18px 56px",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: 5,
            cursor: "pointer", boxShadow: "0 0 40px #ff3b3b99, 0 4px 20px #ff3b3b44",
            transition: "all 0.2s", textTransform: "uppercase",
          }}
            onMouseOver={e => e.currentTarget.style.boxShadow = "0 0 60px #ff3b3bcc, 0 4px 30px #ff3b3b66"}
            onMouseOut={e => e.currentTarget.style.boxShadow = "0 0 40px #ff3b3b99, 0 4px 20px #ff3b3b44"}
          >
            📞 CALL EMERGENCY
          </button>
          <div style={{ fontSize: 9, color: "#252525", marginTop: 16, letterSpacing: 2 }}>
            NOT A SUBSTITUTE FOR REAL 911 · DEMO SYSTEM ONLY
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", maxHeight: "100vh", background: "#040404",
      display: "flex", flexDirection: "column",
      fontFamily: "'Share Tech Mono', monospace", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@300;400;600;700;800&display=swap');
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.82)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes wave { from{height:12%} to{height:88%} }
        @keyframes scanline { 0%{top:-2px} 100%{top:100vh} }
        @keyframes slidein { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes flash { 0%,100%{background:#ff3b3b07} 50%{background:#ff3b3b18} }
        @keyframes micpulse { 0%,100%{box-shadow:0 0 0 0 #ff3b3b55} 50%{box-shadow:0 0 0 12px #ff3b3b00} }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #080808; }
        ::-webkit-scrollbar-thumb { background: #ff3b3b33; border-radius: 2px; }
        textarea { resize: none; outline: none; }
        textarea:focus { border-color: #ff3b3b55 !important; box-shadow: 0 0 12px #ff3b3b22 !important; }
      `}</style>

      {/* scanline */}
      <div style={{
        position: "fixed", left: 0, right: 0, height: 2, zIndex: 999,
        background: "linear-gradient(transparent,#ff3b3b0d,transparent)",
        animation: "scanline 9s linear infinite", pointerEvents: "none",
      }} />

      {/* ── Header ── */}
      <div style={{
        borderBottom: "1px solid #181818", padding: "8px 18px",
        display: "flex", alignItems: "center", gap: 14, background: "#070707", flexShrink: 0,
      }}>
        <PulsingDot color={statusColors[status]} />
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: 6,
          textShadow: "0 0 20px #ff3b3b44",
        }}>SENTINEL</span>

        <div style={{ width: 1, height: 18, background: "#222" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, color: "#333", letterSpacing: 1 }}>STATUS</span>
          <span style={{ fontSize: 11, color: statusColors[status], fontWeight: 700, letterSpacing: 2 }}>{status}</span>
        </div>
        <div style={{ width: 1, height: 18, background: "#222" }} />
        <ThreatMeter level={threatLevel} />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          {/* Voice toggle */}
          {voiceSupported && (
            <button onClick={() => { setVoiceEnabled(v => { if (v) voiceQueue.stop(); return !v; }); }}
              style={{
                background: voiceEnabled ? "#00ff8811" : "#1a1a1a",
                border: `1px solid ${voiceEnabled ? "#00ff8855" : "#333"}`,
                borderRadius: 6, padding: "4px 10px",
                color: voiceEnabled ? "#00ff88" : "#444",
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
                display: "flex", alignItems: "center", gap: 5,
              }}>
              {voiceEnabled ? "🔊" : "🔇"}
              <span>{voiceEnabled ? "VOICE ON" : "VOICE OFF"}</span>
            </button>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, color: "#2a2a2a", letterSpacing: 1 }}>CALL TIME</div>
            <div style={{ fontSize: 15, color: "#ff3b3b", fontWeight: 700, fontFamily: "'Share Tech Mono', monospace" }}>{formatTime(callTime)}</div>
          </div>
        </div>
      </div>

      {/* ── Priority Banner ── */}
      {priorityAction && (
        <div style={{
          background: "#ff3b3b0c", borderBottom: "1px solid #ff3b3b33",
          padding: "7px 18px", display: "flex", alignItems: "center", gap: 10,
          animation: "flash 2s infinite", flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, color: "#ff3b3b", letterSpacing: 2, fontWeight: 700 }}>⚡ NOW</span>
          <span style={{ fontSize: 12, color: "#fff", letterSpacing: 1 }}>{priorityAction.toUpperCase()}</span>
        </div>
      )}

      {/* ── Agent Bar ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #111", flexShrink: 0 }}>
        {Object.values(AGENTS).map(a => {
          const isTalking = speakingAgent === a.id;
          return (
            <div key={a.id} style={{
              flex: 1, padding: "6px 12px", borderRight: "1px solid #111",
              display: "flex", alignItems: "center", gap: 8,
              background: isTalking ? `${a.color}08` : "transparent",
              transition: "background 0.3s",
            }}>
              <span style={{ fontSize: 16 }}>{a.avatar}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: a.color, letterSpacing: 1 }}>{a.badge} · {a.role}</div>
                {isTalking && <div style={{ fontSize: 8, color: a.color, opacity: 0.7, letterSpacing: 1 }}>SPEAKING...</div>}
              </div>
              {isTalking
                ? <Waveform color={a.color} active={true} />
                : <PulsingDot color={loading ? "#2a2a2a" : a.color} size={7} />
              }
            </div>
          );
        })}
      </div>

      {/* ── Messages ── */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "18px 18px 10px",
        backgroundImage: "radial-gradient(ellipse at 50% 0%, #ff3b3b05 0%, transparent 55%)",
      }}>
        {messages.length === 0 && loading && (
          <div style={{ textAlign: "center", color: "#2a2a2a", fontSize: 12, marginTop: 60 }}>
            <div style={{ fontSize: 28, marginBottom: 14, animation: "pulse 1s infinite" }}>📡</div>
            CONNECTING TO SENTINEL DISPATCH...
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ animation: "slidein 0.3s ease" }}>
            <MessageBubble
              msg={msg}
              isNew={newMsgIds.has(msg.id)}
              speakingAgent={speakingAgent}
            />
          </div>
        ))}
        {loading && messages.length > 0 && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0 12px", opacity: 0.5 }}>
            <div style={{ width: 38 }} />
            <div style={{
              background: "#ff3b3b0a", border: "1px solid #ff3b3b1a",
              borderRadius: "2px 12px 12px 12px", padding: "10px 14px",
              display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0,1,2].map(i => (
                <span key={i} style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                  background: "#ff3b3b", animation: `pulse 1s ${i*0.22}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        {error && (
          <div style={{
            background: "#ff3b3b0d", border: "1px solid #ff3b3b33",
            borderRadius: 8, padding: "10px 14px", color: "#ff3b3b",
            fontSize: 12, marginBottom: 12,
          }}>⚠ {error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Bar ── */}
      <div style={{ borderTop: "1px solid #181818", padding: "12px 14px", background: "#070707", flexShrink: 0 }}>
        {/* Live transcript preview */}
        {isListening && (
          <div style={{
            background: "#ff3b3b0a", border: "1px solid #ff3b3b33",
            borderRadius: 8, padding: "8px 12px", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <MicWave active={true} />
            <span style={{ fontSize: 12, color: "#ccc", fontFamily: "'Share Tech Mono', monospace", flex: 1 }}>
              {transcript || <span style={{ color: "#444" }}>Listening...</span>}
            </span>
            <span style={{ fontSize: 9, color: "#ff3b3b", letterSpacing: 1, animation: "blink 1s infinite" }}>● REC</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          {/* Text input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type your situation... (Enter to send)"
            rows={2}
            disabled={isListening}
            style={{
              flex: 1, background: "#0c0c0c",
              border: "1px solid #1e1e1e", borderRadius: 8,
              padding: "10px 13px",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13, color: "#ccc", lineHeight: 1.5,
              boxSizing: "border-box", transition: "all 0.2s",
              opacity: isListening ? 0.4 : 1,
            }}
          />

          {/* Mic button */}
          {voiceSupported && (
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={loading}
              style={{
                width: 56, height: 56, borderRadius: 10,
                background: isListening ? "#ff3b3b" : "#141414",
                border: `1.5px solid ${isListening ? "#ff3b3b" : "#282828"}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 2,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: isListening ? "0 0 24px #ff3b3b88" : "none",
                animation: isListening ? "micpulse 1s infinite" : "none",
                transition: "all 0.2s", flexShrink: 0,
              }}>
              <span style={{ fontSize: 20 }}>🎙️</span>
              <span style={{ fontSize: 7, color: isListening ? "#fff" : "#333", letterSpacing: 1 }}>
                {isListening ? "HOLD" : "HOLD"}
              </span>
            </button>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || isListening}
            style={{
              height: 56, padding: "0 18px", borderRadius: 8,
              background: loading || !input.trim() || isListening ? "#0e0e0e" : "#ff3b3b",
              border: `1px solid ${loading || !input.trim() || isListening ? "#1e1e1e" : "#ff3b3b"}`,
              color: loading || !input.trim() || isListening ? "#2a2a2a" : "#fff",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 14, fontWeight: 700, letterSpacing: 2,
              cursor: loading || !input.trim() || isListening ? "not-allowed" : "pointer",
              boxShadow: loading || !input.trim() ? "none" : "0 0 16px #ff3b3b44",
              transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0,
            }}>
            {loading ? "···" : "SEND ▶"}
          </button>
        </div>

        <div style={{ fontSize: 8, color: "#1c1c1c", marginTop: 8, letterSpacing: 1, textAlign: "center" }}>
          SENTINEL AI · ENCRYPTED CHANNEL · HOLD MIC TO SPEAK · NOT A SUBSTITUTE FOR REAL 911
        </div>
      </div>
    </div>
  );
}
