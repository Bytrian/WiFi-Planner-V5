"use client";
import React, { useRef, useEffect, useState, useCallback } from 'react';

// --- Interfaces para Tipado Estricto ---
interface Point { x: number; y: number; }
interface Wall { p1: Point; p2: Point; loss: number; }
interface SelectedItem { type: "AP" | "USER" | "WALL"; index: number; }
interface CalcData { rssi: number; d: number; wallLoss: number; }

const PTX = 22;
const L0 = 40;
const SCALE = 20;
const MATERIALS: Record<string, number> = { Ladrillo: 7, Concreto: 12, Madera: 3, Metal: 20 };

// --- Funciones de Utilidad (Fuera del componente para evitar problemas de dependencias) ---
const intersect = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
    const ccw = (A: Point, B: Point, C: Point) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
};

const distPointToLine = (p: Point, l1: Point, l2: Point): number => {
    const dx = l2.x - l1.x; const dy = l2.y - l1.y;
    if (dx === 0 && dy === 0) return Math.sqrt((p.x - l1.x) ** 2 + (p.y - l1.y) ** 2);
    let t = ((p.x - l1.x) * dx + (p.y - l1.y) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((p.x - (l1.x + t * dx)) ** 2 + (p.y - (l1.y + t * dy)) ** 2);
};

export default function WiFiPlanner() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<string>("SELECT");
    const [zoom, setZoom] = useState<number>(1.0);
    const [aps, setAps] = useState<Point[]>([]); 
    const [users, setUsers] = useState<Point[]>([]);
    const [walls, setWalls] = useState<Wall[]>([]);
    const [tempWall, setTempWall] = useState<Point | null>(null);
    const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [wallMaterial, setWallMaterial] = useState<string>("Concreto");
    const [calculationData, setCalculationData] = useState<CalcData | null>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(zoom, zoom);

        // Grilla
        ctx.strokeStyle = "#f1f2f6";
        ctx.lineWidth = 1 / zoom;
        for (let i = 0; i < 2000; i += SCALE) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 2000); ctx.stroke(); }
        for (let i = 0; i < 2000; i += SCALE) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(2000, i); ctx.stroke(); }

        // 1. Muros
        walls.forEach((w, i) => {
            const isSel = selectedItem?.type === "WALL" && selectedItem.index === i;
            ctx.strokeStyle = isSel ? "#ff9f43" : "#2d3436";
            ctx.lineWidth = (isSel ? 7 : 5) / zoom;
            ctx.beginPath(); ctx.moveTo(w.p1.x, w.p1.y); ctx.lineTo(w.p2.x, w.p2.y); ctx.stroke();
            ctx.fillStyle = "black";
            ctx.font = `${10 / zoom}px Arial`;
            ctx.fillText(`${w.loss}dB`, (w.p1.x + w.p2.x) / 2, (w.p1.y + w.p2.y) / 2 - (10 / zoom));
        });

        // 2. APs
        aps.forEach((ap, i) => {
            const isSel = selectedItem?.type === "AP" && selectedItem.index === i;
            [{ d: 5, c: "#2ecc71" }, { d: 12, c: "#f1c40f" }, { d: 22, c: "#e74c3c" }].forEach(circle => {
                ctx.strokeStyle = circle.c;
                ctx.lineWidth = 1 / zoom;
                ctx.setLineDash([2 / zoom, 12 / zoom]);
                ctx.beginPath(); ctx.arc(ap.x, ap.y, circle.d * SCALE, 0, Math.PI * 2); ctx.stroke();
            });
            ctx.setLineDash([]);
            ctx.font = `${(isSel ? 24 : 20) / zoom}px Arial`;
            ctx.fillText("📡", ap.x - (12 / zoom), ap.y + (8 / zoom));
        });

        // 3. Usuarios
        users.forEach((u, i) => {
            const isSel = selectedItem?.type === "USER" && selectedItem.index === i;
            
            let bestRSSI = -120;
            let bestDist = 0;
            let bestAP: Point | null = null; 
            let wallLossTotal = 0;

                    for (const ap of aps) {
            const d = Math.max(
                0.1,
                Math.sqrt((u.x - ap.x) ** 2 + (u.y - ap.y) ** 2) / SCALE
            );

            const currentWallLoss = walls.reduce(
                (acc, w) => acc + (intersect(u, ap, w.p1, w.p2) ? w.loss : 0),
                0
            );

            const rssi = PTX - (L0 + 20 * Math.log10(d) + currentWallLoss);

            if (rssi > bestRSSI) {
                bestRSSI = rssi;
                bestDist = d;
                bestAP = ap;
                wallLossTotal = currentWallLoss;
            }
        }

            const color = bestRSSI > -60 ? "#2ecc71" : bestRSSI > -75 ? "#f1c40f" : "#e74c3c";
            
            if (bestAP) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1 / zoom;
                ctx.setLineDash([3 / zoom, 3 / zoom]);
                ctx.beginPath(); 
                ctx.moveTo(u.x, u.y); 
                ctx.lineTo(bestAP.x, bestAP.y); 
                ctx.stroke();
                ctx.setLineDash([]);
                // Solo actualizamos el estado si es el usuario seleccionado para evitar bucles de renderizado
                if (isSel && calculationData?.rssi !== bestRSSI) {
                    setCalculationData({ rssi: bestRSSI, d: bestDist, wallLoss: wallLossTotal });
                }
            }

            if (isSel) { 
                ctx.strokeStyle = "#0984e3"; ctx.lineWidth = 2 / zoom; 
                ctx.beginPath(); ctx.arc(u.x, u.y, 15 / zoom, 0, Math.PI * 2); ctx.stroke(); 
            }
            
            ctx.fillStyle = "black";
            ctx.font = `${20 / zoom}px Arial`;
            ctx.fillText("📱", u.x - (10 / zoom), u.y + (8 / zoom));
            ctx.fillStyle = color;
            ctx.font = `bold ${9 / zoom}px Arial`;
            ctx.fillText(`${bestRSSI.toFixed(1)}dBm`, u.x - (18 / zoom), u.y + (22 / zoom));
        });

        ctx.restore();
    }, [aps, users, walls, selectedItem, zoom, calculationData]); 

    useEffect(() => { draw(); }, [draw]);

    const getPos = (e: React.MouseEvent): Point => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const pos = getPos(e);
        if (mode === "ADD_AP") setAps([...aps, pos]);
        else if (mode === "ADD_USER") setUsers([...users, pos]);
        else if (mode === "ADD_WALL") setTempWall(pos);
        else if (mode === "SELECT") {
            let found: SelectedItem | null = null;
            users.forEach((u, i) => { if (Math.sqrt((pos.x - u.x) ** 2 + (pos.y - u.y) ** 2) < 20 / zoom) found = { type: "USER", index: i }; });
            if (!found) aps.forEach((ap, i) => { if (Math.sqrt((pos.x - ap.x) ** 2 + (pos.y - ap.y) ** 2) < 20 / zoom) found = { type: "AP", index: i }; });
            if (!found) walls.forEach((w, i) => { if (distPointToLine(pos, w.p1, w.p2) < 10 / zoom) found = { type: "WALL", index: i }; });
            setSelectedItem(found);
            if (found) setIsDragging(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !selectedItem || mode !== "SELECT") return;
        const pos = getPos(e);
        if (selectedItem.type === "AP") { const n = [...aps]; n[selectedItem.index] = pos; setAps(n); }
        else if (selectedItem.type === "USER") { const n = [...users]; n[selectedItem.index] = pos; setUsers(n); }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (mode === "ADD_WALL" && tempWall) {
            const pos = getPos(e);
            setWalls([...walls, { p1: tempWall, p2: pos, loss: MATERIALS[wallMaterial] }]);
            setTempWall(null);
        }
        setIsDragging(false);
    };

    return (
        <div className="flex h-screen bg-[#1e272e] text-white overflow-hidden">
            <div className="w-80 p-6 flex flex-col gap-4 border-r border-slate-700">
                <h1 className="text-xl font-bold text-[#00d2d3]">WIFI PLANNER V5</h1>
                <div className="flex gap-2 p-2 bg-slate-800 rounded">
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="flex-1 bg-slate-700 hover:bg-slate-600 p-1 rounded font-bold">🔍 -</button>
                    <span className="flex-1 text-center self-center text-xs font-mono">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="flex-1 bg-slate-700 hover:bg-slate-600 p-1 rounded font-bold">🔍 +</button>
                </div>
                <div className="space-y-1">
                    {[["🖱️ Seleccionar", "SELECT"], ["📡 Añadir AP", "ADD_AP"], ["📱 Añadir Usuario", "ADD_USER"], ["🧱 Añadir Muro", "ADD_WALL"]].map(([l, m]) => (
                        <button key={m} onClick={() => setMode(m)} className={`w-full p-2 text-left text-sm rounded ${mode === m ? 'bg-[#34495e] border-l-4 border-cyan-400' : 'bg-slate-800'}`}>{l}</button>
                    ))}
                </div>
                <div className="pt-2">
                    <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase">Material:</p>
                    <select value={wallMaterial} onChange={(e) => setWallMaterial(e.target.value)} className="w-full p-2 bg-slate-800 rounded text-sm border border-slate-600">
                        {Object.keys(MATERIALS).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <button onClick={() => {
                    if (selectedItem) {
                        if (selectedItem.type === "AP") setAps(aps.filter((_, i) => i !== selectedItem.index));
                        else if (selectedItem.type === "USER") setUsers(users.filter((_, i) => i !== selectedItem.index));
                        else if (selectedItem.type === "WALL") setWalls(walls.filter((_, i) => i !== selectedItem.index));
                        setSelectedItem(null);
                        setCalculationData(null);
                    }
                }} disabled={!selectedItem} className={`p-2 rounded text-sm ${selectedItem ? 'bg-[#ee5253]' : 'bg-gray-600'}`}>🗑️ Eliminar</button>
                
                <div className="mt-auto p-3 bg-black/40 rounded border border-[#f1c40f]/20">
                    <p className="text-[#f1c40f] text-[10px] font-bold mb-2">📊 CÁLCULO TÉCNICO</p>
                    {calculationData ? (
                        <pre className="text-[9px] leading-tight font-mono text-cyan-100">
                            {`RSSI = Ptx - [L0 + 20log(d) + ΣWi]\nOp: ${PTX} - [${L0} + ${(20 * Math.log10(Math.max(0.1, calculationData.d))).toFixed(1)} + ${calculationData.wallLoss}]\nRESULTADO: ${calculationData.rssi.toFixed(1)} dBm`}
                        </pre>
                    ) : <p className="text-[10px] italic text-slate-500">Selecciona un usuario.</p>}
                </div>
            </div>
            <div className="flex-1 bg-white relative overflow-auto p-10 flex justify-center items-center">
                <canvas 
                    ref={canvasRef} width={1200} height={900}
                    onMouseDown={handleMouseDown} 
                    onMouseMove={handleMouseMove} 
                    onMouseUp={handleMouseUp}
                    className="cursor-crosshair shadow-2xl border border-gray-200"
                />
            </div>
        </div>
    );
}