# Route Reel — Telemetry & FTP-Zone Visuals: Data Inventory + Plan

> Scope: (1) enumerate every field we can extract from a `.FIT` activity file,
> (2) define how each is presented visually, and (3) plan the build. Ground
> truth below comes from actually parsing the two bundled samples
> (`public/samples/ride.fit` — Hammerhead Karoo 2 **with a power meter**, and
> `public/samples/demo.fit` — a Garmin **run, HR only**) using the same
> `fit-file-parser` the app uses.

---

## 1. What a FIT file contains (and what we use today)

A FIT file is a set of typed *messages*. The parser hands us these arrays.
Legend: ✅ already surfaced · 🆕 extracted this round (in the data model) ·
🔜 available, queued for a future visual.

### 1a. `record` messages — the per-second stream (ride.fit: 4,314 samples)

| Field | Example range (ride.fit) | Status | Notes |
|---|---|---|---|
| position_lat / position_long | 50.85…50.96 / −1.27…−1.16 | ✅ | Route geometry (semicircles → degrees). |
| altitude | −1 … 62.2 m | ✅ | Smoothed; drives elevation profile + grade. |
| distance | 0 … 34,132 m | ✅ | Cumulative; x-axis for charts. |
| speed | 0 … 16.45 m/s | ✅ | Speed-coloured line; speed-zone fallback. |
| heart_rate | 71 … 148 bpm | ✅ | Avg/max cards + tooltip. |
| power | 0 … 450 W | ✅ | Avg/max + FTP power zones. |
| **cadence** | 0 … 107 rpm | 🆕 | Crank cadence stream + avg/max cards. |
| **temperature** | 15 … 19 °C | 🆕 | Ambient sensor; avg/max cards. |
| **left_right_balance** | ≈ 53–55% right | 🆕 | Dual-sided pedal balance (decoded to right-leg %). |
| **grade** (device) | −9.1 … +9.2 % | 🔜 | Device-reported grade (we currently derive our own from altitude — good cross-check). |
| **skin_temperature** | 30.4 … 32.1 °C | 🔜 | CORE body-temperature sensor (developer field). |
| elapsed_time / timer_time | 0 … 4,313 s | 🆕 | Timer vs. clock → moving vs. elapsed time. |
| core_data_quality / core_reserved | — | — | CORE sensor internals; not user-facing. |

### 1b. `session` message — whole-activity summary (one per activity)

| Field | ride.fit | Status | Notes |
|---|---|---|---|
| sport / sub_sport | cycling / generic | ✅ | Activity type label. |
| start_time | 2025-05-09 11:38 | ✅ | Header date/time. |
| total_distance | 34,133 m | ✅ | Distance card. |
| total_elapsed_time / total_timer_time | 4,358 / 4,315 s | 🆕 | Elapsed vs. moving time. |
| total_ascent / total_descent | 351 / 351 m | ✅ | Elevation cards. |
| total_calories | — (ride) / 336 (demo) | ✅ | Energy card. |
| avg/max_speed | 7.91 / 16.45 m/s | ✅ | Speed cards. |
| avg/max_heart_rate | 127 / 148 bpm | ✅ | HR cards. |
| avg/max_power | 174 / 450 W | ✅ | Power cards. |
| **avg/max_cadence** | 77 / 107 rpm | 🆕 | Cadence cards. |
| **avg/max/min_temperature** | 16 / 19 °C | 🆕 | Temperature cards. |
| **normalized_power** | 195 W | 🆕 | Preferred NP (device-computed). |
| **intensity_factor** | 0.886 | 🆕 | IF card. |
| **training_stress_score** | 92.9 | 🆕 | TSS card. |
| **threshold_power** | **220 W** | 🆕 | **The rider's FTP stored in the file** → auto-suggests FTP. |
| num_laps | 1 (ride) / 5 (demo) | 🆕 | Lap count. |
| avg/max/min_altitude | 37.4 / 62.2 / −1 m | ✅ | Used for elevation range. |

### 1c. `lap` messages — per-lap breakdown (demo.fit has 5)

Each lap repeats the session summary on a sub-range: start_time, distance,
elapsed/timer time, ascent/descent, avg/max speed, avg/max HR, avg/max power,
avg cadence. 🆕 Extracted into `Activity.laps` → powers a lap table. 🔜

### 1d. `device_infos` — paired sensors + battery

ride.fit exposes 11 device records: head unit (**Hammerhead Karoo 2**), plus
ANT+ sensors with `battery_status` ("good"), `battery_voltage` (4.07–4.17 V)
and `charge` (86–92 %). 🆕 Extracted into `Activity.sensors` → powers a
"Sensors & battery" panel. 🔜

### 1e. `file_id` / `sports` / `events` / developer fields

- `file_id`: manufacturer, product_name ("Karoo 2"), serial, time_created → device badge (✅ partially).
- `sports`: sport + sub_sport.
- `events`: timer start/stop → accurate **moving vs. elapsed** time and pause detection. 🆕/🔜
- `developer_data_ids` + `field_descriptions`: custom fields (e.g. CORE `skin_temperature`, `charge`). 🔜

---

## 2. The FTP-zone model (the core of this round)

We use the standard **Coggan 7-zone** model, as a percentage of FTP:

| Zone | Name | % of FTP | Colour |
|---|---|---|---|
| Z1 | Active Recovery | < 55% | slate `#94a3b8` |
| Z2 | Endurance | 55–75% | sky `#38bdf8` |
| Z3 | Tempo | 75–90% | green `#4ade80` |
| Z4 | Threshold | 90–105% | yellow `#facc15` |
| Z5 | VO₂ Max | 105–120% | orange `#fb923c` |
| Z6 | Anaerobic | 120–150% | red `#f87171` |
| Z7 | Neuromuscular | ≥ 150% | fuchsia `#e879f9` |

**Metric selection (automatic):**
- If a power meter is present (>40% of samples have power) **and** an FTP is
  available → **power zones** (% of FTP).
- Otherwise → **speed zones** using the same 7 bands as a % of an estimated
  **threshold speed** (best rolling effort, ~20-min equivalent). This is what a
  rider without a power meter sees.

**FTP resolution order:** rider profile (settings) → the file's own
`threshold_power` → a default of 200 W. The active source is shown in the UI so
it's never a mystery which FTP was used.

**Derived training load:** Normalized Power (30-s rolling 4th-power mean),
Intensity Factor (NP/FTP) and TSS (duration·IF²·100/3600). When the device
already recorded NP/IF/TSS we prefer those.

---

## 3. Visual plan — every dataset, and how it's shown

### A. Route map coloured by zone ✅ (built this round)
- The route polyline is segmented and coloured **per GPS point by its zone**
  (Z1→Z7 palette), replacing the single speed gradient.
- Header toggle **Zones ⇄ Speed** lets the rider switch colouring; each mode has
  its own legend (Z1–Z7 swatches vs. slow→fast gradient).
- Hovering the elevation profile drops a marker on the map at the same instant.

### B. Training Zones panel ✅ (built this round)
- Header: metric used (Power/Speed), the threshold value (FTP in W or threshold
  km/h) and where the FTP came from.
- NP / IF / TSS cards (power activities).
- Avg/max of the zoning metric.
- **Time-in-zone distribution:** seven bars (one per zone) showing time, % of
  ride and distance — instantly readable effort profile.

### C. Expanded telemetry grid ✅ (built this round)
- Added: max power, normalized power, intensity factor, TSS, avg/max cadence,
  avg temperature, plus moving vs. elapsed time. Cards only render when the
  underlying sensor data exists (a run shows HR; a powered ride shows the lot).

### D. Elevation tooltip ✅ (built this round)
- Now shows the live **zone badge** (coloured Z#) plus instantaneous power,
  cadence, HR, grade, speed, altitude and time at the cursor.

### E. Multi-stream telemetry chart ✅ (built)
- Stacked, distance-aligned lanes for **power, speed, heart rate, cadence** and
  **temperature** — each lane auto-appears only when that sensor has enough
  data (a run shows just Speed + HR; a powered ride shows all five).
- A shared scrub cursor syncs with the map and the elevation profile (same
  `hoverIdx` bus); hovering any of the three drives all three.
- When zoning by power, the **FTP zone boundaries (55/75/90/105/120/150% of
  FTP)** are drawn as guides on the power lane, with the FTP line emphasised and
  labelled.
- Hover readout shows the live zone badge plus each stream's value at the cursor.

### F. Lap table 🔜
- One row per lap (from `Activity.laps`): #, distance, time, avg speed, avg/max
  HR, avg/max power, avg cadence, gain. Useful for structured workouts & races
  (demo.fit's 5×1 km intervals are a perfect test case).

### G. Sensors & battery panel 🔜
- Cards for each paired sensor (power meter, HR strap, CORE temp, head unit)
  with battery %/voltage — "your Karoo 2 + Assioma pedals, 92% battery".

### H. Extra derived views 🔜
- **Grade-coloured route** (device grade or derived), **HR-zone mode** (needs
  max-HR/LTHR from the profile), **W/kg** (needs weight), **power-duration
  curve / best-efforts** (best 5 s / 1 / 5 / 20 min power), **pedal-balance
  donut**, **temperature trend**, and **zones baked into the exported video**
  (the Reel renderer already draws a speed-coloured trace — swap in zone
  colours + a zone HUD chip).

---

## 4. Data-model changes made (reference)

- `TrackPoint`: + `cadence`, `temp`, `lrBalance`.
- `ActivityStats`: + `movingTime`, `elapsedTime`, `avgCadence`, `maxCadence`,
  `avgTemp`, `maxTemp`, `deviceNp`, `deviceIf`, `deviceTss`, `thresholdPower`.
- `Activity`: + `laps: LapInfo[]`, `sensors: SensorInfo[]`.
- New `src/lib/settings.ts` (persisted athlete profile: FTP/weight/maxHR/LTHR)
  + `src/hooks/useAthleteSettings.ts`.
- `src/lib/zones.ts` (existing, previously unused) is now wired in and gained
  `avgValue`/`maxValue`.

## 5. Files touched this round

`lib/activity.ts`, `lib/fit.ts`, `lib/zones.ts`, `lib/settings.ts` (new),
`hooks/useAthleteSettings.ts` (new), `components/RouteMap.tsx`,
`components/ElevationChart.tsx`, `components/StatsGrid.tsx`,
`components/Dashboard.tsx`, `components/Landing.tsx`,
`components/ZonePanel.tsx` (new), `components/SettingsModal.tsx` (new),
`components/TelemetryChart.tsx` (new).

## 6. Suggested order for the remaining visuals

1. ~~**Multi-stream telemetry chart (E)**~~ ✅ done.
2. **Zones in the exported video (part of H)** — makes shared reels match the
   dashboard; small change in `lib/reel.ts` (swap the speed-coloured trace for
   zone colours + a zone HUD chip).
3. **Lap table (F)** and **Sensors panel (G)** — both just render data we now
   already extract.
4. **HR-zone mode + W/kg + power-duration curve (H)** — once weight/max-HR are
   in the profile (fields already exist in settings).
