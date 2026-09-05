import sqlite3
import os
import time
import datetime
import random
import logging
from typing import Dict, Any, List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DBAnalytics")

DB_DIR = "data"
DB_PATH = os.path.join(DB_DIR, "ibvap_analytics.db")

class AnalyticsDatabase:
    """
    Edge-Native SQLite SQL Analytics Database.
    Persists person traffic (with gender categorization), vehicle traffic (with vehicle types & ANPR number plates),
    and security incidents with support for Hourly, Daily, and Monthly analytical reporting.
    """
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        self._ensure_seed_data()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        # Enable Write-Ahead Logging for high concurrent read/write throughput
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self):
        """Create tables and performance indexes."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 1. Person Detections Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS person_detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_id TEXT NOT NULL,
                track_id INTEGER NOT NULL,
                gender TEXT NOT NULL,          -- 'MALE', 'FEMALE', 'UNKNOWN'
                age_group TEXT DEFAULT 'ADULT', -- 'CHILD', 'YOUNG_ADULT', 'ADULT', 'SENIOR'
                confidence REAL DEFAULT 0.85,
                dwell_time_sec REAL DEFAULT 0.0,
                zone_id TEXT,
                timestamp DATETIME NOT NULL,
                date TEXT NOT NULL,            -- 'YYYY-MM-DD'
                hour INTEGER NOT NULL,         -- 0 to 23
                month TEXT NOT NULL            -- 'YYYY-MM'
            );
            """)

            # 2. Vehicle Detections Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS vehicle_detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_id TEXT NOT NULL,
                track_id INTEGER NOT NULL,
                vehicle_type TEXT NOT NULL,    -- 'CAR', 'TRUCK', 'BUS', 'MOTORCYCLE', 'SUV', 'MILITARY_VEHICLE'
                plate_number TEXT,
                confidence REAL DEFAULT 0.90,
                speed_kmh REAL DEFAULT 35.0,
                watchlist_status TEXT DEFAULT 'CLEARED', -- 'CLEARED', 'SUSPECT', 'FLAGGED', 'VIP'
                timestamp DATETIME NOT NULL,
                date TEXT NOT NULL,            -- 'YYYY-MM-DD'
                hour INTEGER NOT NULL,         -- 0 to 23
                month TEXT NOT NULL            -- 'YYYY-MM'
            );
            """)

            # 3. Security Incidents Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS security_incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id TEXT UNIQUE NOT NULL,
                camera_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,        -- 'CRITICAL', 'HIGH', 'WARNING', 'INFO'
                risk_score INTEGER NOT NULL,
                target_type TEXT NOT NULL,
                details TEXT,
                timestamp DATETIME NOT NULL,
                date TEXT NOT NULL,
                hour INTEGER NOT NULL,
                month TEXT NOT NULL
            );
            """)

            # Indexes for ultra-fast aggregations
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_person_date_hour ON person_detections(date, hour);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_person_month ON person_detections(month);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_person_cam ON person_detections(camera_id);")

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vehicle_date_hour ON vehicle_detections(date, hour);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vehicle_month ON vehicle_detections(month);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vehicle_plate ON vehicle_detections(plate_number);")

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_incident_date ON security_incidents(date);")
            conn.commit()

    def log_person(self, camera_id: str, track_id: int, gender: str = "UNKNOWN",
                   age_group: str = "ADULT", confidence: float = 0.85,
                   dwell_time_sec: float = 0.0, zone_id: Optional[str] = None):
        """Insert a detected person into SQL database."""
        now = datetime.datetime.utcnow()
        date_str = now.strftime("%Y-%m-%d")
        month_str = now.strftime("%Y-%m")
        hour_int = now.hour
        ts_str = now.strftime("%Y-%m-%d %H:%M:%S")

        try:
            with self._get_connection() as conn:
                conn.execute("""
                INSERT INTO person_detections
                (camera_id, track_id, gender, age_group, confidence, dwell_time_sec, zone_id, timestamp, date, hour, month)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (camera_id, track_id, gender.upper(), age_group.upper(), confidence, dwell_time_sec, zone_id, ts_str, date_str, hour_int, month_str))
                conn.commit()
        except Exception as e:
            logger.error(f"Error logging person detection: {e}")

    def log_vehicle(self, camera_id: str, track_id: int, vehicle_type: str = "CAR",
                    plate_number: Optional[str] = None, confidence: float = 0.90,
                    speed_kmh: float = 35.0, watchlist_status: str = "CLEARED"):
        """Insert a detected vehicle into SQL database."""
        now = datetime.datetime.utcnow()
        date_str = now.strftime("%Y-%m-%d")
        month_str = now.strftime("%Y-%m")
        hour_int = now.hour
        ts_str = now.strftime("%Y-%m-%d %H:%M:%S")

        try:
            with self._get_connection() as conn:
                conn.execute("""
                INSERT INTO vehicle_detections
                (camera_id, track_id, vehicle_type, plate_number, confidence, speed_kmh, watchlist_status, timestamp, date, hour, month)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (camera_id, track_id, vehicle_type.upper(), (plate_number or "UNASSIGNED").upper(), confidence, speed_kmh, watchlist_status.upper(), ts_str, date_str, hour_int, month_str))
                conn.commit()
        except Exception as e:
            logger.error(f"Error logging vehicle detection: {e}")

    def log_incident(self, incident_id: str, camera_id: str, event_type: str,
                     severity: str, risk_score: int, target_type: str = "person",
                     details: str = ""):
        """Insert a security incident into SQL database."""
        now = datetime.datetime.utcnow()
        date_str = now.strftime("%Y-%m-%d")
        month_str = now.strftime("%Y-%m")
        hour_int = now.hour
        ts_str = now.strftime("%Y-%m-%d %H:%M:%S")

        try:
            with self._get_connection() as conn:
                conn.execute("""
                INSERT OR IGNORE INTO security_incidents
                (incident_id, camera_id, event_type, severity, risk_score, target_type, details, timestamp, date, hour, month)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (incident_id, camera_id, event_type, severity.upper(), risk_score, target_type, details, ts_str, date_str, hour_int, month_str))
                conn.commit()
        except Exception as e:
            logger.error(f"Error logging incident: {e}")

    def get_summary(self, period: str = "daily", date_str: Optional[str] = None,
                    month_str: Optional[str] = None, camera_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes analytical SQL queries across Hourly, Daily, or Monthly timebases.
        Returns aggregated counts, gender categorization, vehicle distribution, and time-series trends.
        """
        now = datetime.datetime.utcnow()
        if not date_str:
            date_str = now.strftime("%Y-%m-%d")
        if not month_str:
            month_str = now.strftime("%Y-%m")

        where_person = []
        where_vehicle = []
        params_person = []
        params_vehicle = []

        if camera_id and camera_id != "ALL":
            where_person.append("camera_id = ?")
            params_person.append(camera_id)
            where_vehicle.append("camera_id = ?")
            params_vehicle.append(camera_id)

        time_series = []

        with self._get_connection() as conn:
            # ═══ 1. Period-Specific Filtering & Time-Series ═══
            if period == "hourly":
                # Breakdown of all 24 hours for the selected date
                p_where = ["date = ?"] + where_person
                p_params = [date_str] + params_person
                v_where = ["date = ?"] + where_vehicle
                v_params = [date_str] + params_vehicle

                # Query person counts per hour
                p_query = f"SELECT hour, COUNT(*) as count, gender FROM person_detections WHERE {' AND '.join(p_where)} GROUP BY hour, gender"
                p_rows = conn.execute(p_query, p_params).fetchall()

                # Query vehicle counts per hour
                v_query = f"SELECT hour, COUNT(*) as count, vehicle_type FROM vehicle_detections WHERE {' AND '.join(v_where)} GROUP BY hour, vehicle_type"
                v_rows = conn.execute(v_query, v_params).fetchall()

                # Map 0 to 23 hours
                for h in range(24):
                    label = f"{h:02d}:00"
                    h_persons = sum(r["count"] for r in p_rows if r["hour"] == h)
                    h_males = sum(r["count"] for r in p_rows if r["hour"] == h and r["gender"] == "MALE")
                    h_females = sum(r["count"] for r in p_rows if r["hour"] == h and r["gender"] == "FEMALE")
                    h_vehicles = sum(r["count"] for r in v_rows if r["hour"] == h)
                    time_series.append({
                        "label": label,
                        "hour": h,
                        "persons": h_persons,
                        "males": h_males,
                        "females": h_females,
                        "vehicles": h_vehicles,
                        "total": h_persons + h_vehicles
                    })

            elif period == "daily":
                # Breakdown of days in the selected month
                p_where = ["month = ?"] + where_person
                p_params = [month_str] + params_person
                v_where = ["month = ?"] + where_vehicle
                v_params = [month_str] + params_vehicle

                p_query = f"SELECT date, COUNT(*) as count, gender FROM person_detections WHERE {' AND '.join(p_where)} GROUP BY date, gender"
                p_rows = conn.execute(p_query, p_params).fetchall()

                v_query = f"SELECT date, COUNT(*) as count FROM vehicle_detections WHERE {' AND '.join(v_where)} GROUP BY date"
                v_rows = conn.execute(v_query, v_params).fetchall()

                # Get unique dates in this month
                date_set = sorted(list(set([r["date"] for r in p_rows] + [r["date"] for r in v_rows])))
                if not date_set:
                    # Default to current month days
                    days_in_month = 30
                    date_set = [f"{month_str}-{d:02d}" for d in range(1, days_in_month + 1)]

                for d in date_set:
                    d_persons = sum(r["count"] for r in p_rows if r["date"] == d)
                    d_males = sum(r["count"] for r in p_rows if r["date"] == d and r["gender"] == "MALE")
                    d_females = sum(r["count"] for r in p_rows if r["date"] == d and r["gender"] == "FEMALE")
                    d_vehicles = sum(r["count"] for r in v_rows if r["date"] == d)
                    time_series.append({
                        "label": d.split("-")[-1],  # e.g. "03"
                        "full_date": d,
                        "persons": d_persons,
                        "males": d_males,
                        "females": d_females,
                        "vehicles": d_vehicles,
                        "total": d_persons + d_vehicles
                    })

            elif period == "monthly":
                # Breakdown of months in the current year
                year_str = month_str.split("-")[0]
                p_where = ["month LIKE ?"] + where_person
                p_params = [f"{year_str}-%"] + params_person
                v_where = ["month LIKE ?"] + where_vehicle
                v_params = [f"{year_str}-%"] + params_vehicle

                p_query = f"SELECT month, COUNT(*) as count, gender FROM person_detections WHERE {' AND '.join(p_where)} GROUP BY month, gender"
                p_rows = conn.execute(p_query, p_params).fetchall()

                v_query = f"SELECT month, COUNT(*) as count FROM vehicle_detections WHERE {' AND '.join(v_where)} GROUP BY month"
                v_rows = conn.execute(v_query, v_params).fetchall()

                month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                for m_idx in range(1, 13):
                    m_key = f"{year_str}-{m_idx:02d}"
                    m_persons = sum(r["count"] for r in p_rows if r["month"] == m_key)
                    m_males = sum(r["count"] for r in p_rows if r["month"] == m_key and r["gender"] == "MALE")
                    m_females = sum(r["count"] for r in p_rows if r["month"] == m_key and r["gender"] == "FEMALE")
                    m_vehicles = sum(r["count"] for r in v_rows if r["month"] == m_key)
                    time_series.append({
                        "label": month_names[m_idx - 1],
                        "month_key": m_key,
                        "persons": m_persons,
                        "males": m_males,
                        "females": m_females,
                        "vehicles": m_vehicles,
                        "total": m_persons + m_vehicles
                    })

            # ═══ 2. Total Scope Aggregations ═══
            filter_clause_p = f"WHERE {' AND '.join(p_where)}" if p_where else ""
            filter_clause_v = f"WHERE {' AND '.join(v_where)}" if v_where else ""

            # Person Totals & Gender Categorization
            gender_query = f"SELECT gender, COUNT(*) as count FROM person_detections {filter_clause_p} GROUP BY gender"
            gender_rows = conn.execute(gender_query, p_params).fetchall()
            gender_dist = { "MALE": 0, "FEMALE": 0, "UNKNOWN": 0 }
            total_persons = 0
            for r in gender_rows:
                g = r["gender"]
                c = r["count"]
                if g in gender_dist:
                    gender_dist[g] = c
                else:
                    gender_dist["UNKNOWN"] += c
                total_persons += c

            # Vehicle Totals & Vehicle Type Categorization
            vehicle_query = f"SELECT vehicle_type, COUNT(*) as count FROM vehicle_detections {filter_clause_v} GROUP BY vehicle_type"
            vehicle_rows = conn.execute(vehicle_query, v_params).fetchall()
            vehicle_dist = { "CAR": 0, "TRUCK": 0, "BUS": 0, "MOTORCYCLE": 0, "SUV": 0, "MILITARY_VEHICLE": 0 }
            total_vehicles = 0
            for r in vehicle_rows:
                vt = r["vehicle_type"]
                c = r["count"]
                if vt in vehicle_dist:
                    vehicle_dist[vt] = c
                else:
                    vehicle_dist["CAR"] += c
                total_vehicles += c

            # ANPR Watchlist Breakdown
            anpr_query = f"SELECT watchlist_status, COUNT(*) as count FROM vehicle_detections {filter_clause_v} GROUP BY watchlist_status"
            anpr_rows = conn.execute(anpr_query, v_params).fetchall()
            anpr_status_dist = { "CLEARED": 0, "SUSPECT": 0, "FLAGGED": 0, "VIP": 0 }
            for r in anpr_rows:
                ws = r["watchlist_status"]
                c = r["count"]
                if ws in anpr_status_dist:
                    anpr_status_dist[ws] = c

            # Sector/Camera Breakdown
            cam_p_query = f"SELECT camera_id, COUNT(*) as count FROM person_detections {filter_clause_p} GROUP BY camera_id"
            cam_p_rows = conn.execute(cam_p_query, p_params).fetchall()
            cam_v_query = f"SELECT camera_id, COUNT(*) as count FROM vehicle_detections {filter_clause_v} GROUP BY camera_id"
            cam_v_rows = conn.execute(cam_v_query, v_params).fetchall()

            sector_dist = {}
            for r in cam_p_rows:
                c = r["camera_id"]
                sector_dist[c] = sector_dist.get(c, {"persons": 0, "vehicles": 0, "total": 0})
                sector_dist[c]["persons"] += r["count"]
                sector_dist[c]["total"] += r["count"]
            for r in cam_v_rows:
                c = r["camera_id"]
                sector_dist[c] = sector_dist.get(c, {"persons": 0, "vehicles": 0, "total": 0})
                sector_dist[c]["vehicles"] += r["count"]
                sector_dist[c]["total"] += r["count"]

            # Recent ANPR Plates
            recent_plates_query = f"""
            SELECT plate_number, vehicle_type, camera_id, timestamp, watchlist_status, speed_kmh
            FROM vehicle_detections {filter_clause_v}
            ORDER BY id DESC LIMIT 20
            """
            plate_records = [dict(r) for r in conn.execute(recent_plates_query, v_params).fetchall()]

        # Peak calculation
        peak_entry = max(time_series, key=lambda x: x["total"]) if time_series else {"label": "N/A", "total": 0}

        return {
            "period": period,
            "selected_date": date_str,
            "selected_month": month_str,
            "camera_id": camera_id or "ALL",
            "summary_kpis": {
                "total_persons": total_persons,
                "male_persons": gender_dist["MALE"],
                "female_persons": gender_dist["FEMALE"],
                "unknown_persons": gender_dist["UNKNOWN"],
                "male_ratio_pct": round((gender_dist["MALE"] / max(total_persons, 1)) * 100, 1),
                "female_ratio_pct": round((gender_dist["FEMALE"] / max(total_persons, 1)) * 100, 1),
                "total_vehicles": total_vehicles,
                "flagged_vehicles": anpr_status_dist["SUSPECT"] + anpr_status_dist["FLAGGED"],
                "peak_time_label": peak_entry["label"],
                "peak_traffic_volume": peak_entry["total"],
                "grand_total_traffic": total_persons + total_vehicles
            },
            "gender_distribution": gender_dist,
            "vehicle_distribution": vehicle_dist,
            "anpr_status_distribution": anpr_status_dist,
            "sector_distribution": sector_dist,
            "time_series": time_series,
            "recent_plates": plate_records
        }

    def get_plates(self, search: Optional[str] = None, status: Optional[str] = None,
                   limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch searchable vehicle & ANPR plates with SQL."""
        where = []
        params = []
        if search:
            where.append("(plate_number LIKE ? OR camera_id LIKE ? OR vehicle_type LIKE ?)")
            q = f"%{search.upper()}%"
            params.extend([q, q, q])
        if status and status != "ALL":
            where.append("watchlist_status = ?")
            params.append(status.upper())

        where_clause = f"WHERE {' AND '.join(where)}" if where else ""
        query = f"""
        SELECT id, camera_id, track_id, vehicle_type, plate_number, confidence, speed_kmh, watchlist_status, timestamp, date
        FROM vehicle_detections
        {where_clause}
        ORDER BY id DESC
        LIMIT ?
        """
        params.append(limit)

        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]

    def _ensure_seed_data(self):
        """Seed realistic historical analytical records if database is fresh."""
        with self._get_connection() as conn:
            p_count = conn.execute("SELECT COUNT(*) FROM person_detections").fetchone()[0]
            i_count = conn.execute("SELECT COUNT(*) FROM security_incidents").fetchone()[0]
            if p_count > 50 and i_count > 10:
                return
            logger.info("Seeding SQL Analytics Database with historical traffic and incident records...")
            self.seed_historical_data(days=35)

    def seed_historical_data(self, days: int = 35):
        """Generates realistic daily and hourly traffic data across cameras with male/female and vehicle types."""
        now = datetime.datetime.utcnow()
        cameras = ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05", "CAM-06"]
        genders = ["MALE", "MALE", "MALE", "FEMALE", "FEMALE", "UNKNOWN"]
        veh_types = ["CAR", "CAR", "SUV", "TRUCK", "MOTORCYCLE", "BUS", "MILITARY_VEHICLE"]
        plates_pool = [
            ("PB08-CX-9912", "CLEARED"), ("DL01-AB-4321", "CLEARED"),
            ("JK02-AK-8877", "FLAGGED"), ("HR26-DF-5544", "CLEARED"),
            ("UP14-BR-2233", "SUSPECT"), ("CH01-TA-7788", "VIP"),
            ("MH12-KN-1002", "CLEARED"), ("KA04-ZX-5511", "CLEARED"),
            ("AR01-MIL-009", "CLEARED"), ("RJ19-TR-4040", "SUSPECT")
        ]

        person_rows = []
        vehicle_rows = []

        track_counter = 100

        for d in range(days, -1, -1):
            day_dt = now - datetime.timedelta(days=d)
            date_str = day_dt.strftime("%Y-%m-%d")
            month_str = day_dt.strftime("%Y-%m")

            # Traffic curve: quiet early morning (0-5), peak at 8-11, moderate at 12-16, peak at 17-21, quiet at night
            for h in range(24):
                if 0 <= h <= 4:
                    n_persons = random.randint(1, 4)
                    n_vehs = random.randint(0, 2)
                elif 5 <= h <= 7:
                    n_persons = random.randint(5, 12)
                    n_vehs = random.randint(3, 8)
                elif 8 <= h <= 11:
                    n_persons = random.randint(15, 30)
                    n_vehs = random.randint(10, 22)
                elif 12 <= h <= 16:
                    n_persons = random.randint(10, 20)
                    n_vehs = random.randint(6, 15)
                elif 17 <= h <= 21:
                    n_persons = random.randint(18, 35)
                    n_vehs = random.randint(12, 25)
                else:
                    n_persons = random.randint(3, 8)
                    n_vehs = random.randint(1, 5)

                for _ in range(n_persons):
                    minute = random.randint(0, 59)
                    second = random.randint(0, 59)
                    ts = f"{date_str} {h:02d}:{minute:02d}:{second:02d}"
                    cam = random.choice(cameras)
                    track_counter += 1
                    g = random.choice(genders)
                    age = random.choice(["ADULT", "ADULT", "YOUNG_ADULT", "SENIOR", "CHILD"])
                    dwell = round(random.uniform(2.0, 45.0), 1)
                    conf = round(random.uniform(0.78, 0.98), 2)
                    person_rows.append((cam, track_counter, g, age, conf, dwell, "ZONE-BORDER", ts, date_str, h, month_str))

                for _ in range(n_vehs):
                    minute = random.randint(0, 59)
                    second = random.randint(0, 59)
                    ts = f"{date_str} {h:02d}:{minute:02d}:{second:02d}"
                    cam = random.choice(["CAM-01", "CAM-02", "CAM-04", "CAM-05"])
                    track_counter += 1
                    vt = random.choice(veh_types)
                    plate_tuple = random.choice(plates_pool)
                    plate_num = plate_tuple[0]
                    # Randomize suffix for variety
                    if random.random() > 0.4:
                        plate_num = f"{plate_num[:4]}-{random.choice(['AA','BB','CX','TR'])}-{random.randint(1000,9999)}"
                    status = plate_tuple[1]
                    speed = round(random.uniform(20.0, 65.0), 1)
                    conf = round(random.uniform(0.85, 0.99), 2)
                    vehicle_rows.append((cam, track_counter, vt, plate_num, conf, speed, status, ts, date_str, h, month_str))

        incident_rows = []
        incident_types = [
            ("FENCE_CROSSING", "CRITICAL", 92, "Person footpoint crossed primary barbed-wire line near Pillar 114"),
            ("RESTRICTED_ZONE_ENTRY", "HIGH", 78, "Unauthorized entry into Sector North Red Polygon Buffer"),
            ("SUSPICIOUS_LOITERING", "HIGH", 68, "Target loitering near boundary with dwell time > 45s"),
            ("VEHICLE_ANPR_WATCHLIST", "CRITICAL", 88, "Stolen vehicle plate matched against national border registry"),
            ("NIGHT_TIME_INTRUSION", "CRITICAL", 94, "Low-light crawling intruder detected in zero-lux sector")
        ]

        for i, (evt_type, sev, r_score, detail) in enumerate(incident_types * 10):
            d_offset = random.randint(0, days)
            day_dt = now - datetime.timedelta(days=d_offset)
            date_str = day_dt.strftime("%Y-%m-%d")
            month_str = day_dt.strftime("%Y-%m")
            h = random.choice([21, 22, 23, 0, 1, 2, 3, 4, 14, 18])
            m = random.randint(0, 59)
            s = random.randint(0, 59)
            ts = f"{date_str} {h:02d}:{m:02d}:{s:02d}"
            cam = random.choice(cameras)
            inc_id = f"INC-{int(day_dt.timestamp())}-{i:03d}"
            target_t = "VEHICLE" if "VEHICLE" in evt_type else "PERSON"
            incident_rows.append((inc_id, cam, evt_type, sev, r_score, target_t, detail, ts, date_str, h, month_str))

        with self._get_connection() as conn:
            conn.executemany("""
            INSERT INTO person_detections
            (camera_id, track_id, gender, age_group, confidence, dwell_time_sec, zone_id, timestamp, date, hour, month)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, person_rows)

            conn.executemany("""
            INSERT INTO vehicle_detections
            (camera_id, track_id, vehicle_type, plate_number, confidence, speed_kmh, watchlist_status, timestamp, date, hour, month)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, vehicle_rows)

            conn.executemany("""
            INSERT OR REPLACE INTO security_incidents
            (incident_id, camera_id, event_type, severity, risk_score, target_type, details, timestamp, date, hour, month)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, incident_rows)
            conn.commit()

        logger.info(f"Database seeded successfully with {len(person_rows)} persons, {len(vehicle_rows)} vehicles, and {len(incident_rows)} incidents.")

# Global Singleton Database Instance
db_analytics = AnalyticsDatabase()
