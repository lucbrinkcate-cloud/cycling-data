import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Pane, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import type { Activity } from '../lib/activity';
import { fmtInt, fmtKmh } from '../lib/activity';
import type { ZoneResult } from '../lib/zones';
import { ZONES } from '../lib/zones';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30] });
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map, bounds]);
  return null;
}

interface Props {
  activity: Activity;
  hoverIdx: number | null;
  /** Optional per-point color array (e.g. FTP zones). Falls back to speed color. */
  pointColors?: string[] | null;
  zones?: ZoneResult;
}

export default function RouteMap({ activity, hoverIdx, pointColors, zones }: Props) {
  // Colour segments chunked for Leaflet (SVG renderer friendly). Colours come
  // from `pointColors` (zones) when supplied, else the built-in speed colours.
  const segments = useMemo(() => {
    const pts = activity.points;
    const target = 640; // total SVG paths
    const chunk = Math.max(2, Math.ceil(pts.length / target));
    const out: Array<{ positions: Array<[number, number]>; color: string; key: number }> = [];
    for (let i = 0; i < pts.length - 1; i += chunk) {
      const end = Math.min(pts.length - 1, i + chunk);
      const positions: Array<[number, number]> = [];
      for (let k = i; k <= end; k++) positions.push([pts[k].lat, pts[k].lng]);
      const mid = Math.min(end, i + Math.floor(chunk / 2));
      const color = pointColors ? pointColors[mid] : pts[mid].color;
      out.push({ positions, color, key: i });
    }
    return out;
  }, [activity, pointColors]);

  const bounds = useMemo<L.LatLngBoundsExpression>(() => {
    const pts = activity.points;
    return L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])).pad(0.04);
  }, [activity]);

  const casing = useMemo(
    () => activity.points.filter((_, i) => i % Math.max(1, Math.floor(activity.points.length / 1500)) === 0).map((p) => [p.lat, p.lng] as [number, number]),
    [activity],
  );

  const start = activity.points[0];
  const end = activity.points[activity.points.length - 1];
  const hovered = hoverIdx != null ? activity.points[hoverIdx] : null;

  const hoveredPt = hoverIdx != null ? activity.points[hoverIdx] : null;
  const hoveredZone = hoverIdx != null && zones ? ZONES[zones.idx[hoverIdx]] : null;

  return (
    <>
    <MapContainer
      key={activity.id}
      bounds={bounds}
      zoomControl={false}
      className="h-full w-full"
      style={{ background: '#070b10' }}
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} opacity={0.82} />
      <ZoomControl position="bottomright" />
      <FitBounds bounds={bounds} />
      <Pane name="route" style={{ zIndex: 500 }}>
        <Polyline positions={casing} pathOptions={{ color: '#030509', weight: 8, opacity: 0.5, lineJoin: 'round', lineCap: 'round' }} interactive={false} />
        {segments.map((s) => (
          <Polyline
            key={s.key}
            positions={s.positions}
            pathOptions={{ color: s.color, weight: 4.2, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }}
            interactive={false}
          />
        ))}
      </Pane>
      <Pane name="markers" style={{ zIndex: 600 }}>
        <CircleMarker center={[start.lat, start.lng]} radius={6.5} pathOptions={{ color: '#052e16', weight: 2, fillColor: '#b5f13e', fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -9]} className="map-tag">Start</Tooltip>
        </CircleMarker>
        <CircleMarker center={[end.lat, end.lng]} radius={6.5} pathOptions={{ color: '#0b0f14', weight: 2, fillColor: '#f8fafc', fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -9]} className="map-tag">Finish</Tooltip>
        </CircleMarker>
        {hovered && (
          <>
            <CircleMarker center={[hovered.lat, hovered.lng]} radius={13} pathOptions={{ color: '#b5f13e', weight: 1.6, opacity: 0.4, fillOpacity: 0 }} interactive={false} />
            <CircleMarker center={[hovered.lat, hovered.lng]} radius={6} pathOptions={{ color: '#05080c', weight: 2.4, fillColor: '#ffffff', fillOpacity: 1 }} interactive={false} />
          </>
        )}
      </Pane>
    </MapContainer>

    {/* live telemetry HUD while scrubbing (driven by the elevation/telemetry hover) */}
    {hoveredPt && (
      <div className="pointer-events-none absolute left-3 top-3 z-[700] flex items-stretch gap-0 overflow-hidden rounded-xl border border-line-strong bg-ink-950/85 shadow-[0_12px_34px_rgba(0,0,0,0.6)] backdrop-blur-md">
        {hoveredZone && zones && (
          <div
            className="flex flex-col items-center justify-center px-3 text-ink-950"
            style={{ background: hoveredZone.color }}
            title={hoveredZone.name}
          >
            <span className="font-display text-lg font-bold leading-none">{hoveredZone.short}</span>
            <span className="mt-0.5 font-mono text-[7px] font-semibold tracking-[0.08em] uppercase opacity-80">
              {zones.metric === 'power' ? `${hoveredPt.power != null ? Math.round(hoveredPt.power) : 0} W` : `${fmtKmh(hoveredPt.speed)} km/h`}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3.5 py-2.5 font-mono text-[11px] tabular-nums">
          <span className="text-mist-500">SPEED</span>
          <span className="text-right text-zinc-100">{fmtKmh(hoveredPt.speed)} km/h</span>
          {hoveredPt.power != null && (
            <>
              <span className="text-mist-500">POWER</span>
              <span className="text-right text-lime-300">{Math.round(hoveredPt.power)} W</span>
            </>
          )}
          {hoveredPt.hr != null && (
            <>
              <span className="text-mist-500">HEART</span>
              <span className="text-right text-rose-300">{hoveredPt.hr} bpm</span>
            </>
          )}
          {hoveredPt.cadence != null && (
            <>
              <span className="text-mist-500">CADENCE</span>
              <span className="text-right text-teal-300">{hoveredPt.cadence} rpm</span>
            </>
          )}
          <span className="text-mist-500">ALT</span>
          <span className="text-right text-zinc-100">{fmtInt(hoveredPt.alt)} m</span>
          <span className="text-mist-500">GRADE</span>
          <span className={`text-right ${hoveredPt.grade >= 0 ? 'text-amber-300' : 'text-sky-300'}`}>
            {hoveredPt.grade >= 0 ? '+' : ''}
            {hoveredPt.grade.toFixed(1)}%
          </span>
        </div>
      </div>
    )}
    </>
  );
}
