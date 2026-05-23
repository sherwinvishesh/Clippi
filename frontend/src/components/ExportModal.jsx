import { useState, useMemo } from "react";
import { X, Download, Film, Loader2, Sparkles, Zap, Shield } from "lucide-react";
import useClippiStore from "../store/useClippiStore";
import axios from "axios";

const TRANSITION_COLORS = {
  cut:      { color: "#6b7280", label: "Cut" },
  fade:     { color: "#6366f1", label: "Fade" },
  dissolve: { color: "#8b5cf6", label: "Dissolve" },
  wipe:     { color: "#10b981", label: "Wipe" },
  slide:    { color: "#f97316", label: "Slide" },
  zoom:     { color: "#ef4444", label: "Zoom" },
};

const QUALITY_OPTIONS = [
  { value: "high",   label: "High",   sub: "Best quality", icon: Sparkles },
  { value: "medium", label: "Medium", sub: "Balanced",     icon: Shield   },
  { value: "low",    label: "Low",    sub: "Smaller file", icon: Zap      },
];

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getEffectBadges(clip) {
  const badges = [];
  const e = clip.edits || {};
  if (e.trimStart || e.trimEnd) badges.push("Trim");
  if (e.crop) badges.push("Crop");
  if (e.rotation) badges.push("Rotate");
  if (e.flipH || e.flipV) badges.push("Flip");
  if (e.speed && e.speed !== 1) badges.push(`${e.speed}×`);
  const c = e.colorEdits || {};
  if (Object.values(c).some(v => v !== 0)) badges.push("Color");
  if (e.filterEdits?.preset) badges.push(e.filterEdits.preset);
  if (e.textOverlays?.length) badges.push(`${e.textOverlays.length} Text`);
  if (e.captions?.length) badges.push(`${e.captions.length} Cap`);
  return badges;
}

export default function ExportModal({ onClose }) {
  const { nodes, edges, clips } = useClippiStore();
  const [quality, setQuality] = useState("medium");
  const [format] = useState("mp4");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const { orderedClips, transitions } = useMemo(() => {
    const clipMap = Object.fromEntries((clips || []).map(c => [String(c.id), c]));
    const nodeMap = Object.fromEntries((nodes || []).map(n => [n.id, n]));
    const hasIncoming = new Set((edges || []).map(e => e.target));
    const startNodes = (nodes || []).filter(n => !hasIncoming.has(n.id));

    if (!startNodes.length && nodes.length > 0) {
      return {
        orderedClips: nodes.map(n => ({ node: n, clip: clipMap[String(n.id)] })).filter(x => x.clip),
        transitions: [],
      };
    }
    if (!startNodes.length) return { orderedClips: [], transitions: [] };

    const ordered = [];
    const transitionList = [];
    let current = startNodes[0];
    const visited = new Set();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const clip = clipMap[String(current.id)];
      if (clip) ordered.push({ node: current, clip });
      const outEdge = (edges || []).find(e => e.source === current.id);
      if (outEdge) {
        transitionList.push({
          type:     outEdge.data?.transition || "cut",
          duration: outEdge.data?.transitionDuration || outEdge.data?.duration || 0.5,
        });
        current = nodeMap[outEdge.target];
      } else {
        break;
      }
    }
    return { orderedClips: ordered, transitions: transitionList };
  }, [nodes, edges, clips]);

  const totalDuration = useMemo(() => {
    return orderedClips.reduce((sum, { clip }) => {
      const e = clip.edits || {};
      const dur = clip.duration || 0;
      const trimmed = (e.trimEnd || dur) - (e.trimStart || 0);
      return sum + trimmed / (e.speed || 1);
    }, 0);
  }, [orderedClips]);

  async function handleExport() {
    if (!orderedClips.length) return;
    setExporting(true);
    setError(null);
    setProgress(5);

    const timer = setInterval(() => {
      setProgress(p => p >= 85 ? 85 : p + Math.random() * 7);
    }, 700);

    try {
      const clipsPayload = orderedClips.map(({ clip }) => {
        const e  = clip.edits     || {};
        const ce = e.colorEdits   || {};
        const fe = e.filterEdits  || null;
        const to = e.textOverlays || [];
        const ca = e.captions     || [];
        return {
          clip_id:    String(clip.id),
          video_path: clip.video_path || clip.videoPath || clip.url || "",
          trim_start: e.trim?.start  ?? e.trimStart ?? 0,
          trim_end:   e.trim?.end    ?? e.trimEnd   ?? null,
          crop:       e.crop         || null,
          rotation:   e.rotation     || 0,
          flip_h:     e.flipH        || false,
          flip_v:     e.flipV        || false,
          speed:      e.speed        || 1.0,
          color_edits: {
            exposure: ce.exposure ?? 0, contrast: ce.contrast ?? 0,
            saturation: ce.saturation ?? 0, temperature: ce.temperature ?? 0,
            highlights: ce.highlights ?? 0, shadows: ce.shadows ?? 0,
            sharpness: ce.sharpness ?? 0, vignette: ce.vignette ?? 0,
          },
          filter_edits: fe ? { filterId: fe.filterId ?? fe.preset ?? null, intensity: fe.intensity ?? 1.0 } : null,
          text_overlays: to.map(o => ({
            text: o.text || "", x: o.x ?? 0.5, y: o.y ?? 0.5,
            fontSize: o.fontSize ?? 24, fontColor: o.fontColor || "#ffffff",
            fontFamily: o.fontFamily || "Arial", bold: o.bold || false,
            italic: o.italic || false, background: o.background || false,
            bgColor: o.bgColor || "#000000", bgOpacity: o.bgOpacity ?? 0.5,
            startTime: o.startTime ?? 0, endTime: o.endTime ?? 5,
          })),
          captions: ca.map(c => ({
            text: c.text || "", startTime: c.start ?? c.startTime ?? 0,
            endTime: c.end ?? c.endTime ?? 5, fontSize: c.fontSize ?? 20,
            fontColor: c.fontColor || "#ffffff",
          })),
        };
      });

      const response = await axios.post(
        "/api/clips/export",
        { clips: clipsPayload, transitions, format, quality },
        { responseType: "blob", timeout: 600_000 }
      );

      clearInterval(timer);
      setProgress(100);
      await new Promise(r => setTimeout(r, 350));

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setError(err.response?.data?.detail || err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes _em_in {
          from { opacity:0; transform: scale(.96) translateY(10px); }
          to   { opacity:1; transform: scale(1)   translateY(0);    }
        }
        @keyframes _em_spin { to { transform: rotate(360deg); } }
        @keyframes _em_shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        ._em_modal  { animation: _em_in .22s cubic-bezier(.16,1,.3,1) forwards; }
        ._em_spin   { animation: _em_spin 1s linear infinite; }
        ._em_prog   {
          background: linear-gradient(90deg,#7c3aed 0%,#a78bfa 45%,#c4b5fd 50%,#a78bfa 55%,#7c3aed 100%);
          background-size: 200% auto;
          animation: _em_shimmer 1.4s linear infinite;
        }
        ._em_qbtn   { transition: all .15s ease; cursor: pointer; }
        ._em_qbtn:hover:not(._em_qa) { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,.18) !important; }
        ._em_close  { transition: all .15s; }
        ._em_close:hover { background: rgba(255,255,255,.1) !important; color: rgba(255,255,255,.8) !important; }
        ._em_cancel { transition: all .15s; }
        ._em_cancel:hover { background: rgba(255,255,255,.09) !important; color: rgba(255,255,255,.8) !important; }
        ._em_export { transition: all .15s; }
        ._em_export:not(:disabled):hover { background: linear-gradient(135deg,#8b5cf6,#7c3aed) !important; }
        ._em_body::-webkit-scrollbar { display:none; }
      `}</style>

      <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        {/* Backdrop */}
        <div
          onClick={!exporting ? onClose : undefined}
          style={{ position:"absolute", inset:0, background:"rgba(4,4,14,0.82)", backdropFilter:"blur(14px)" }}
        />

        {/* Panel */}
        <div
          className="_em_modal"
          style={{
            position:"relative", zIndex:1, width:"100%", maxWidth:420,
            display:"flex", flexDirection:"column", maxHeight:"90vh",
            background:"linear-gradient(160deg,#17172b 0%,#111120 100%)",
            border:"1px solid rgba(139,92,246,.18)",
            borderRadius:18,
            boxShadow:"0 30px 70px rgba(0,0,0,.65), 0 0 0 1px rgba(139,92,246,.07) inset, 0 1px 0 rgba(255,255,255,.07) inset",
          }}
        >
          {/* Top glow line */}
          <div style={{ position:"absolute", top:0, left:"15%", right:"15%", height:1, background:"linear-gradient(90deg,transparent,rgba(167,139,250,.55),transparent)", borderRadius:99 }} />

          {/* ── Header ── */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 20px 16px", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{
                width:36, height:36, borderRadius:10, flexShrink:0,
                background:"linear-gradient(135deg,rgba(124,58,237,.28),rgba(139,92,246,.14))",
                border:"1px solid rgba(139,92,246,.28)",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                <Film style={{ width:15, height:15, color:"#a78bfa" }} />
              </div>
              <div>
                <p style={{ color:"#f0f0f8", fontWeight:600, fontSize:14, margin:0, lineHeight:1 }}>Export Video</p>
                <p style={{ color:"rgba(255,255,255,.32)", fontSize:11, margin:"4px 0 0", lineHeight:1 }}>
                  {orderedClips.length} clip{orderedClips.length !== 1 ? "s" : ""}&nbsp;·&nbsp;{formatDuration(totalDuration)}
                </p>
              </div>
            </div>
            {!exporting && (
              <button
                className="_em_close"
                onClick={onClose}
                style={{
                  width:28, height:28, borderRadius:8, flexShrink:0,
                  background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.08)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer", color:"rgba(255,255,255,.35)",
                }}
              >
                <X style={{ width:13, height:13 }} />
              </button>
            )}
          </div>

          {/* ── Body ── */}
          <div className="_em_body" style={{ flex:1, overflowY:"auto", padding:"14px 20px" }}>

            {/* Clip list */}
            {orderedClips.length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                {orderedClips.map(({ clip }, i) => {
                  const badges     = getEffectBadges(clip);
                  const transition  = transitions[i];
                  const tInfo      = TRANSITION_COLORS[transition?.type] || TRANSITION_COLORS.cut;
                  const e          = clip.edits || {};
                  const dur        = clip.duration || 0;
                  const clipLen    = ((e.trimEnd || dur) - (e.trimStart || 0)) / (e.speed || 1);

                  return (
                    <div key={clip.id}>
                      {/* Clip card */}
                      <div style={{
                        display:"flex", alignItems:"center", gap:11,
                        padding:"9px 11px", borderRadius:11,
                        background:"rgba(255,255,255,.04)",
                        border:"1px solid rgba(255,255,255,.07)",
                      }}>
                        {/* Thumbnail */}
                        <div style={{
                          width:54, height:34, borderRadius:7, flexShrink:0,
                          background:"rgba(255,255,255,.07)",
                          border:"1px solid rgba(255,255,255,.09)",
                          overflow:"hidden", position:"relative",
                        }}>
                          {clip.thumbnail_url
                            ? <img src={clip.thumbnail_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                            : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <Film style={{ width:13, height:13, color:"rgba(255,255,255,.18)" }} />
                              </div>
                          }
                          {clipLen > 0 && (
                            <div style={{
                              position:"absolute", bottom:2, right:2,
                              background:"rgba(0,0,0,.72)", borderRadius:4,
                              padding:"1px 4px", fontSize:9,
                              color:"rgba(255,255,255,.75)", fontVariantNumeric:"tabular-nums",
                            }}>
                              {formatDuration(clipLen)}
                            </div>
                          )}
                        </div>

                        {/* Name + badges */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{
                            color:"#e4e4ee", fontSize:12, fontWeight:500, margin:0,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          }}>
                            {clip.name || `Clip ${i + 1}`}
                          </p>
                          {badges.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:5 }}>
                              {badges.map(b => (
                                <span key={b} style={{
                                  fontSize:9, padding:"2px 6px", borderRadius:4,
                                  background:"rgba(139,92,246,.14)",
                                  border:"1px solid rgba(139,92,246,.22)",
                                  color:"#c4b5fd", fontWeight:600,
                                }}>
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Index badge */}
                        <div style={{
                          width:20, height:20, borderRadius:6, flexShrink:0,
                          background:"rgba(255,255,255,.05)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:10, color:"rgba(255,255,255,.28)", fontWeight:700,
                        }}>
                          {i + 1}
                        </div>
                      </div>

                      {/* Transition pill */}
                      {transition && i < orderedClips.length - 1 && (
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"4px 0" }}>
                          <div style={{ width:20, height:1, background:"rgba(255,255,255,.08)" }} />
                          <div style={{
                            margin:"0 8px", display:"flex", alignItems:"center", gap:5,
                            padding:"3px 9px", borderRadius:20,
                            background:`${tInfo.color}15`,
                            border:`1px solid ${tInfo.color}38`,
                          }}>
                            <div style={{ width:5, height:5, borderRadius:"50%", background:tInfo.color }} />
                            <span style={{ fontSize:10, color:tInfo.color, fontWeight:600 }}>
                              {tInfo.label}
                              {transition.type !== "cut" && (
                                <span style={{ opacity:.65, fontWeight:400 }}> · {transition.duration}s</span>
                              )}
                            </span>
                          </div>
                          <div style={{ width:20, height:1, background:"rgba(255,255,255,.08)" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color:"rgba(255,255,255,.22)", fontSize:12, textAlign:"center", padding:"28px 0" }}>
                No clips in timeline
              </p>
            )}

            {/* Divider */}
            <div style={{ height:1, background:"rgba(255,255,255,.06)", margin:"14px 0" }} />

            {/* Quality */}
            <div>
              <p style={{ color:"rgba(255,255,255,.38)", fontSize:10, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", margin:"0 0 9px" }}>
                Quality
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7 }}>
                {QUALITY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const on   = quality === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className={`_em_qbtn${on ? " _em_qa" : ""}`}
                      onClick={() => setQuality(opt.value)}
                      style={{
                        padding:"11px 9px", borderRadius:11, textAlign:"left",
                        border: on ? "1px solid rgba(139,92,246,.48)" : "1px solid rgba(255,255,255,.08)",
                        background: on
                          ? "linear-gradient(135deg,rgba(124,58,237,.22),rgba(139,92,246,.12))"
                          : "rgba(255,255,255,.03)",
                        boxShadow: on ? "0 0 0 1px rgba(139,92,246,.12) inset" : "none",
                      }}
                    >
                      <Icon style={{ width:13, height:13, marginBottom:7, color: on ? "#a78bfa" : "rgba(255,255,255,.28)" }} />
                      <p style={{ color: on ? "#eaeaf4" : "rgba(255,255,255,.55)", fontSize:12, fontWeight:600, margin:0, lineHeight:1 }}>
                        {opt.label}
                      </p>
                      <p style={{ color:"rgba(255,255,255,.28)", fontSize:10, margin:"3px 0 0", lineHeight:1 }}>
                        {opt.sub}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                marginTop:13, background:"rgba(239,68,68,.1)",
                border:"1px solid rgba(239,68,68,.25)", borderRadius:10,
                padding:"10px 13px", color:"#fca5a5", fontSize:12, lineHeight:1.5,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Progress bar */}
          {exporting && (
            <div style={{ padding:"0 20px 2px" }}>
              <div style={{ height:2, background:"rgba(255,255,255,.07)", borderRadius:99, overflow:"hidden" }}>
                <div
                  className="_em_prog"
                  style={{ height:"100%", borderRadius:99, width:`${progress}%`, transition:"width .65s cubic-bezier(.4,0,.2,1)" }}
                />
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ display:"flex", gap:9, padding:"13px 20px 17px", borderTop:"1px solid rgba(255,255,255,.06)" }}>
            {!exporting && (
              <button
                className="_em_cancel"
                onClick={onClose}
                style={{
                  padding:"0 17px", height:39, borderRadius:10, flexShrink:0,
                  background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.08)",
                  color:"rgba(255,255,255,.45)", fontSize:13, fontWeight:500, cursor:"pointer",
                }}
              >
                Cancel
              </button>
            )}
            <button
              className="_em_export"
              onClick={handleExport}
              disabled={exporting || orderedClips.length === 0}
              style={{
                flex:1, height:39, borderRadius:10,
                background: exporting ? "rgba(109,40,217,.45)" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                border:"1px solid rgba(139,92,246,.35)",
                boxShadow: exporting ? "none" : "0 4px 18px rgba(109,40,217,.38)",
                color:"#fff", fontSize:13, fontWeight:600, cursor: exporting || !orderedClips.length ? "not-allowed" : "pointer",
                opacity: !orderedClips.length ? .4 : 1,
                display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                letterSpacing:".01em",
              }}
            >
              {exporting ? (
                <>
                  <Loader2 className="_em_spin" style={{ width:14, height:14 }} />
                  Exporting…
                  {progress > 0 && <span style={{ opacity:.55, fontWeight:400 }}>{Math.round(progress)}%</span>}
                </>
              ) : (
                <>
                  <Download style={{ width:14, height:14 }} />
                  Export MP4
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}