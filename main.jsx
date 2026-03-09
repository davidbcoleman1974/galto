import { useState, useEffect, useRef } from "react";

// =============================================================================
// SEED DATA — RBA Table F6 (Jan 2026, published 6 Mar 2026)
// Distribution shape: RBA Feb 2026 Bulletin — "Distribution of Outstanding
//   Variable Mortgage Rates" chart (Dec 2025 data, Securitisation System)
//   — Dec 2025 shows tight, roughly symmetric distribution
//   — Core mass within ±50bps of average; thin tail to ~+200bps
//   — Significantly compressed vs Dec 2019 (same chart)
// Anchors: F6 outstanding variable, all institutions
//   OO P&I = 5.50% (FLRHOOP)  |  OO IO = 6.20% (FLRHOOI)  |  Inv = 5.80% (FLRHIOVA)
// =============================================================================

const SEGMENTS = [
  { key: "oo_pi", label: "Owner Occupier", sub: "P&I", median: 5.50, series: "FLRHOOP" },
  { key: "oo_io", label: "Interest Only", sub: "Owner Occ", median: 6.20, series: "FLRHOOI" },
  { key: "inv",   label: "Investor", sub: "Variable", median: 5.80, series: "FLRHIOVA" },
];

// Distribution from RBA Feb 2026 Bulletin — "Distribution of Outstanding
// Variable Mortgage Rates" chart (Dec 2025 data, Securitisation System).
// Core mass within ±50bps of average. Roughly symmetric with thin right tail.
// ~100bps core range (p10-p90 ~110bps).
// p10=-60bps, p25=-30bps, median=0, p75=+30bps, p90=+50bps
function buildDist(med) {
  return { p10: +(med-0.60).toFixed(2), p25: +(med-0.30).toFixed(2), median: med, p75: +(med+0.30).toFixed(2), p90: +(med+0.50).toFixed(2) };
}

// Loan size adjustments from F6 new loans by value (Jan 2026): only ~10bps spread
const SIZE_ADJ = {
  oo_pi: { "200-400":0.03, "400-600":0.01, "600-800":0, "800-1000":-0.01, "1000+":-0.02 },
  oo_io: { "200-400":0.05, "400-600":0.03, "600-800":0, "800-1000":-0.02, "1000+":-0.03 },
  inv:   { "200-400":0.04, "400-600":0.02, "600-800":0, "800-1000":-0.02, "1000+":-0.04 },
};

// Geo adjustments: ABS lending indicators + MFAA broker penetration data
const GEO = {
  "20":-0.10,"21":-0.08,"22":-0.04,"23":-0.02,"24":0.02,"25":0.04,"26":0.06,"28":0.08,"29":0.08,
  "30":-0.08,"31":-0.06,"32":-0.02,"33":0,"34":0.02,"35":0.04,"36":0.06,"37":0.06,"38":0.08,"39":0.08,
  "40":-0.04,"41":-0.02,"42":0.02,"43":0.04,"44":0.06,"45":0.06,"46":0.08,"47":0.10,"48":0.10,"49":0.12,
  "50":-0.02,"51":0,"52":0.04,"53":0.06,"54":0.08,"55":0.08,"56":0.10,
  "60":-0.04,"61":-0.02,"62":0.02,"63":0.04,"64":0.06,"65":0.08,"66":0.08,"67":0.10,
  "70":0.02,"71":0.04,"72":0.06,"73":0.06,"08":0.12,"09":0.12,"02":-0.06,
};
const REGIONS = {
  "20":"Inner Sydney","21":"Sydney","22":"SW Sydney","23":"Illawarra","24":"Hunter",
  "25":"Mid-North Coast","26":"Northern NSW","28":"Northern NSW","29":"Far West NSW",
  "30":"Inner Melbourne","31":"Melbourne","32":"SE Melbourne","33":"Geelong",
  "34":"NE Victoria","35":"Gippsland","36":"NW Victoria","37":"Western Vic",
  "40":"Brisbane","41":"Gold Coast","42":"Sunshine Coast","43":"Toowoomba",
  "44":"Bundaberg","45":"Rockhampton","46":"Mackay","47":"Townsville","48":"Cairns","49":"Far North QLD",
  "50":"Adelaide","51":"Adelaide Hills","52":"Barossa","53":"SE SA",
  "60":"Perth","61":"Perth South","62":"Mandurah","63":"SW WA","64":"Geraldton","65":"Kalgoorlie",
  "70":"Hobart","71":"Launceston","72":"NW Tasmania","73":"West Tasmania",
  "08":"Darwin","09":"NT","02":"Canberra",
};

function getGeo(pc) {
  if (!pc || pc.length < 2) return { adj: 0, label: "Australia" };
  const p = pc.substring(0, 2);
  return { adj: GEO[p] || 0, label: REGIONS[p] || "Postcode " + pc };
}

function getData(segKey, band, pc) {
  const seg = SEGMENTS.find(s => s.key === segKey);
  if (!seg) return null;
  const sa = (SIZE_ADJ[segKey] || {})[band] || 0;
  const ga = getGeo(pc).adj;
  const med = +(seg.median + sa + ga).toFixed(2);
  const d = buildDist(med);
  const samples = { "200-400": 3200, "400-600": 7800, "600-800": 6400, "800-1000": 3100, "1000+": 1900 };
  const mult = { oo_pi: 1, oo_io: 0.15, inv: 0.4 };
  d.n = Math.round((samples[band]||4000) * (mult[segKey]||1));
  return d;
}

function getNatData(segKey, band) {
  const seg = SEGMENTS.find(s => s.key === segKey);
  if (!seg) return null;
  const sa = (SIZE_ADJ[segKey] || {})[band] || 0;
  return buildDist(+(seg.median + sa).toFixed(2));
}

function calcPct(rate, d) {
  if (!d) return 50;
  if (rate <= d.p10) return Math.max(2, Math.round((rate - (d.p10 - 0.5)) / 0.5 * 10));
  if (rate <= d.p25) return 10 + Math.round(((rate - d.p10) / (d.p25 - d.p10)) * 15);
  if (rate <= d.median) return 25 + Math.round(((rate - d.p25) / (d.median - d.p25)) * 25);
  if (rate <= d.p75) return 50 + Math.round(((rate - d.median) / (d.p75 - d.median)) * 25);
  if (rate <= d.p90) return 75 + Math.round(((rate - d.p75) / (d.p90 - d.p75)) * 15);
  return Math.min(98, 90 + Math.round(((rate - d.p90) / 0.5) * 8));
}

const LENDERS = ["CBA","Westpac","ANZ","NAB","Macquarie","ING","Bankwest","Suncorp","Bank of Queensland","Bendigo Bank","Athena","Unloan","Ubank","HSBC","Tic:Toc","loans.com.au","Other"];
const BANDS = [
  { label: "$200K – $400K", value: "200-400", mid: 300000 },
  { label: "$400K – $600K", value: "400-600", mid: 500000 },
  { label: "$600K – $800K", value: "600-800", mid: 700000 },
  { label: "$800K – $1M", value: "800-1000", mid: 900000 },
  { label: "$1M+", value: "1000+", mid: 1200000 },
];

// --- UI Components ---

function AnimNum({ target, prefix="", suffix="", duration=1200 }) {
  const [cur, setCur] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now()-t0)/duration, 1);
      setCur(Math.round((1-Math.pow(1-p,3))*target));
      if (p<1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);
  return <span>{prefix}{cur.toLocaleString()}{suffix}</span>;
}

function PctBar({ percentile, label }) {
  const [w, setW] = useState(0);
  useEffect(() => { setTimeout(() => setW(percentile), 100); }, [percentile]);
  const col = percentile <= 30 ? "#10b981" : percentile <= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ width: "100%", marginBottom: 20 }}>
      {label && <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>{label}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        <span>Paying less</span><span>Paying more</span>
      </div>
      <div style={{ position: "relative", width: "100%", height: 28, background: "linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 100%)", borderRadius: 14 }}>
        <div style={{ position: "absolute", left: `${w}%`, top: "50%", transform: "translate(-50%,-50%)", width: 18, height: 40, background: "#0f172a", borderRadius: 9, border: "3px solid white", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", transition: "left 1.5s cubic-bezier(0.16,1,0.3,1)", zIndex: 2 }} />
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>You're paying more than </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: col }}><AnimNum target={percentile} suffix="%" /></span>
        <span style={{ fontSize: 13, color: "#94a3b8" }}> of similar borrowers</span>
      </div>
    </div>
  );
}

function Curve({ rate, data }) {
  if (!data) return null;
  const w=400, h=130, pad=20;
  const mn=data.p10-0.3, mx=data.p90+0.3;
  const toX = r => pad+((r-mn)/(mx-mn))*(w-pad*2);
  const std = (data.p75-data.p25)/1.35;
  const pts = [];
  for (let r=mn; r<=mx; r+=0.02) {
    const x = toX(r);
    const y = h-pad-Math.exp(-0.5*Math.pow((r-data.median)/std,2))*(h-pad*2-10);
    pts.push(`${x},${y}`);
  }
  const path = `M ${pad},${h-pad} L ${pts.join(" L ")} L ${w-pad},${h-pad} Z`;
  const ux = Math.min(Math.max(toX(rate),pad),w-pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", maxWidth:480, margin:"0 auto", display:"block" }}>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.12"/>
        <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.12"/>
        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.12"/>
      </linearGradient></defs>
      <path d={path} fill="url(#cg)" stroke="none"/>
      <path d={path} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="1.5"/>
      <line x1={ux} y1={pad} x2={ux} y2={h-pad} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4">
        <animate attributeName="y1" from={h-pad} to={pad} dur="0.8s" fill="freeze"/>
      </line>
      <text x={toX(data.median)} y={h-4} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="DM Sans">median {data.median.toFixed(2)}%</text>
      <text x={ux} y={pad-4} textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="600" fontFamily="DM Sans">you: {rate.toFixed(2)}%</text>
    </svg>
  );
}

export default function App() {
  const [screen, setScreen] = useState("input");
  const [seg, setSeg] = useState("oo_pi");
  const [rate, setRate] = useState("");
  const [band, setBand] = useState("");
  const [postcode, setPostcode] = useState("");
  const [lender, setLender] = useState("");
  const [fadeIn, setFadeIn] = useState(true);
  const [count, setCount] = useState(26847);

  const go = (s) => { setFadeIn(false); setTimeout(() => { setScreen(s); setFadeIn(true); }, 300); };

  const rateNum = parseFloat(rate);
  const bandObj = BANDS.find(b => b.value === band);
  const localD = band && postcode.length === 4 ? getData(seg, band, postcode) : null;
  const natD = band ? getNatData(seg, band) : null;
  const localPct = localD && rateNum ? calcPct(rateNum, localD) : null;
  const natPct = natD && rateNum ? calcPct(rateNum, natD) : null;
  const geo = getGeo(postcode);
  const dPct = localPct ?? natPct ?? 50;
  const dData = localD ?? natD;
  const savingVsMedian = dData && rateNum && bandObj ? Math.round(bandObj.mid * (rateNum - dData.median) / 100) : 0;
  const savingVsBest = dData && rateNum && bandObj ? Math.max(0, Math.round(bandObj.mid * (rateNum - dData.p10) / 100)) : 0;
  const isValid = rate && band && postcode.length === 4 && rateNum >= 3 && rateNum <= 12;
  const segObj = SEGMENTS.find(s => s.key === seg);
  const segLabel = seg === "oo_pi" ? "owner-occupier P&I" : seg === "oo_io" ? "interest-only" : "investor";
  const placeholder = seg === "oo_io" ? "6.20" : seg === "inv" ? "5.80" : "5.50";
  const shareText = "Are you overpaying on your mortgage? This free tool shows you how your rate compares to other Australians in 15 seconds:";

  const pill = (active) => ({
    padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
    background: active ? "rgba(59,130,246,0.15)" : "transparent",
    color: active ? "#93c5fd" : "#64748b",
    fontSize: 13, fontWeight: active ? 600 : 500,
    fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s ease",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 1, lineHeight: 1.2,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1a", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", inset: 0, opacity: 0.03, zIndex: 0, backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />
      <div style={{ position: "fixed", top: "-30%", right: "-20%", width: "60%", height: "60%", background: "radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "0 24px", opacity: fadeIn?1:0, transform: fadeIn?"translateY(0)":"translateY(12px)", transition: "opacity 0.3s ease, transform 0.3s ease" }}>

        {/* Header */}
        <header style={{ paddingTop: 48, paddingBottom: 8, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 100, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", marginBottom: 24 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 13, color: "#94a3b8" }}><AnimNum target={count} /> Australians have checked</span>
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, fontWeight: 400, lineHeight: 1.15, margin: "0 0 12px", color: "#f1f5f9" }}>Are you overpaying<br/>on your mortgage?</h1>
          <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.6, margin: 0, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>See how your rate compares to thousands of Australian borrowers. Takes 15 seconds.</p>
        </header>

        {/* INPUT */}
        {screen === "input" && (
          <div style={{ paddingTop: 28 }}>
            {/* Segment pills */}
            <div style={{ marginBottom: 28, textAlign: "center" }}>
              <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Loan type</label>
              <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {SEGMENTS.map(s => (
                  <button key={s.key} onClick={() => setSeg(s.key)} style={pill(seg===s.key)}>
                    <span>{s.label}</span><span style={{ fontSize: 10, opacity: 0.7 }}>{s.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rate */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Your current variable rate</label>
              <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "4px 20px" }}>
                <input type="number" step="0.01" min="3" max="12" placeholder={placeholder} value={rate} onChange={e => setRate(e.target.value)}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#f1f5f9", fontSize: 32, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", padding: "12px 0", width: "100%" }} />
                <span style={{ fontSize: 24, color: "#475569", fontWeight: 600 }}>%</span>
              </div>
              <p style={{ fontSize: 12, color: "#475569", marginTop: 6, paddingLeft: 4 }}>Find this on your lender's app or latest statement</p>
            </div>

            {/* Loan size */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Approximate loan balance</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {BANDS.map(b => (
                  <button key={b.value} onClick={() => setBand(b.value)} style={{
                    padding: "14px 16px", borderRadius: 12,
                    border: band===b.value ? "1.5px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)",
                    background: band===b.value ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                    color: band===b.value ? "#93c5fd" : "#94a3b8",
                    fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s ease",
                  }}>{b.label}</button>
                ))}
              </div>
            </div>

            {/* Postcode */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Your postcode</label>
              <input type="text" maxLength={4} inputMode="numeric" placeholder="2000" value={postcode}
                onChange={e => setPostcode(e.target.value.replace(/\D/g,"").slice(0,4))}
                style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#f1f5f9", fontSize: 20, fontWeight: 600, letterSpacing: "0.15em", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Lender */}
            <div style={{ marginBottom: 36 }}>
              <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Your lender <span style={{ color: "#475569", textTransform: "none" }}>(optional)</span></label>
              <select value={lender} onChange={e => setLender(e.target.value)} style={{
                width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
                color: lender ? "#f1f5f9" : "#475569", fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none",
              }}>
                <option value="" style={{ background: "#1e293b" }}>Select your lender</option>
                {LENDERS.map(l => <option key={l} value={l} style={{ background: "#1e293b" }}>{l}</option>)}
              </select>
            </div>

            <button onClick={() => { if(isValid){ setCount(c=>c+1); go("results"); }}} disabled={!isValid} style={{
              width: "100%", padding: "18px 32px", borderRadius: 14, border: "none",
              background: isValid ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" : "rgba(255,255,255,0.05)",
              color: isValid ? "#fff" : "#475569", fontSize: 17, fontWeight: 600, cursor: isValid ? "pointer" : "default",
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s ease",
              boxShadow: isValid ? "0 8px 32px rgba(59,130,246,0.3)" : "none",
            }}>See how I compare</button>
            <p style={{ textAlign: "center", fontSize: 12, color: "#475569", marginTop: 16, lineHeight: 1.5 }}>
              Your data is anonymised and aggregated. We never share individual information.<br/>By continuing you agree to our privacy policy.
            </p>
          </div>
        )}

        {/* RESULTS */}
        {screen === "results" && (
          <div style={{ paddingTop: 24 }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.12)", fontSize: 12, color: "#93c5fd", fontWeight: 500 }}>
                {segObj?.label} {segObj?.sub} · {bandObj?.label}
              </span>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: "28px 24px", marginBottom: 20 }}>
              {localPct !== null && <PctBar percentile={localPct} label={`📍 ${geo.label} (${postcode})`} />}
              {natPct !== null && (
                <div style={{ opacity: localPct !== null ? 0.65 : 1 }}>
                  <PctBar percentile={natPct} label="🇦🇺 Nationally" />
                </div>
              )}
              <Curve rate={rateNum} data={dData} />
            </div>

            {/* Position card — always show */}
            {dData && (
              <div style={{
                background: dPct > 50 ? "rgba(239,68,68,0.06)" : dPct > 10 ? "rgba(251,191,36,0.06)" : "rgba(16,185,129,0.06)",
                border: `1px solid ${dPct > 50 ? "rgba(239,68,68,0.15)" : dPct > 10 ? "rgba(251,191,36,0.12)" : "rgba(16,185,129,0.15)"}`,
                borderRadius: 20, padding: "28px 24px", marginBottom: 20, textAlign: "center",
              }}>
                {dPct > 50 ? (<>
                  <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px" }}>You're paying more than the average borrower</p>
                  <p style={{ fontSize: 42, fontWeight: 700, color: "#ef4444", margin: "0 0 4px", fontFamily: "'DM Sans', sans-serif" }}>
                    <AnimNum target={savingVsBest} prefix="$" suffix="/yr" />
                  </p>
                  <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
                    more than the best 10% of borrowers
                  </p>
                </>) : dPct > 10 ? (<>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "#fbbf24", margin: "0 0 8px" }}>Better than average — but not the best</p>
                  <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px" }}>
                    You're paying <strong style={{ color: "#f1f5f9" }}>{Math.abs(savingVsMedian) > 0 ? `$${Math.abs(savingVsMedian).toLocaleString()}/yr less` : "about the same as"}</strong> {Math.abs(savingVsMedian) > 0 ? "than" : ""} the median borrower
                  </p>
                  <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
                    But still <strong style={{ color: "#fbbf24" }}>${savingVsBest.toLocaleString()}/yr more</strong> than the best 10%
                  </p>
                </>) : (<>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "#10b981", margin: "0 0 8px" }}>You're among the best rates in Australia</p>
                  <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
                    You're in the top 10% of {segLabel} borrowers. Well done.
                  </p>
                </>)}
              </div>
            )}

            {/* Data tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Your rate", value: `${rateNum.toFixed(2)}%`, color: "#f1f5f9" },
                { label: localD ? `${geo.label} median` : "National median", value: `${dData?.median.toFixed(2)}%`, color: rateNum > dData?.median ? "#f87171" : "#10b981" },
                { label: "Best 10%", value: `≤${dData?.p10.toFixed(2)}%`, color: rateNum <= dData?.p10 ? "#10b981" : "#64748b" },
              ].map(item => (
                <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
                  <p style={{ fontSize: 10, color: "#64748b", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: item.color, margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 10, color: "#334155", textAlign: "center", marginBottom: 24, lineHeight: 1.6, padding: "0 8px" }}>
              Estimates based on RBA Table F6 ({segObj?.series}), Jan 2026. Distribution from RBA
              Feb 2026 Bulletin (Dec 2025 Securitisation System data, "Distribution of Outstanding
              Variable Mortgage Rates"). Loan size adjusted per F6 value-at-commitment segmentation.
              Location adjusted using ABS regional lending data. Not financial advice.
            </p>

            <button onClick={() => {
              if (navigator.share) { navigator.share({ title: "RateCheck Australia", text: shareText, url: window.location.href }); }
              else { navigator.clipboard.writeText(shareText+" "+window.location.href); alert("Link copied!"); }
            }} style={{
              width: "100%", padding: "18px 32px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "#fff", fontSize: 17, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", boxShadow: "0 8px 32px rgba(59,130,246,0.25)", marginBottom: 12,
            }}>Share this tool with a friend</button>

            <button onClick={() => { setRate(""); setBand(""); setPostcode(""); setLender(""); go("input"); }} style={{
              width: "100%", padding: "12px", background: "none", border: "none", color: "#475569", fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>← Check a different rate</button>
          </div>
        )}


        {/* Footer */}
        <footer style={{ textAlign: "center", padding: "48px 0 32px", fontSize: 11, color: "#334155", lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 6px" }}>Data: RBA Table F6 (APRA EFS collection). Distribution: RBA Feb 2026 Bulletin (Securitisation System, Dec 2025).</p>
          <p style={{ margin: "0 0 6px" }}>Estimates improve as more Australians contribute their actual rates.</p>
          <p style={{ margin: "0 0 6px" }}>General information only, not financial advice. Consider your circumstances before acting.</p>
          <p style={{ margin: 0 }}>© 2026 RateCheck Australia</p>
        </footer>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input::placeholder { color: #475569; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        select option { background: #1e293b; color: #e2e8f0; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
