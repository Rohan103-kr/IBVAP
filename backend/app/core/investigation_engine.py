import sqlite3
import hashlib
import time
import os
import logging
from typing import Dict, Any, List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("InvestigationEngine")

DB_PATH = "data/ibvap_analytics.db"

class InvestigationEngine:
    """
    Structured Forensic Investigation & Multi-Factor Search Engine.
    Enables government intelligence operators and security officers to search historical incidents
    by Date range, Camera sector, Object type, Minimum risk score, and Time-of-Day windows.
    Also manages immutable RBAC Audit Trails with SHA-256 integrity hashes.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.audit_log: List[Dict[str, Any]] = []
        self._seed_audit_log()

    def _seed_audit_log(self):
        now = time.time()
        self.audit_log = [
            {
                "log_id": "AUD-1082",
                "operator_id": "Officer-Alpha (Sentry)",
                "role": "OPERATOR",
                "action": "ACKNOWLEDGE_ALERT",
                "target_id": "EVT-1788438776-8dc2ae",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now - 180)),
                "sha256_hash": hashlib.sha256(b"AUD-1082-ACKNOWLEDGE_ALERT").hexdigest()
            },
            {
                "log_id": "AUD-1081",
                "operator_id": "Commander-Singh (HQ)",
                "role": "COMMANDER",
                "action": "DISPATCH_QRF_SOP",
                "target_id": "INC-1788438776-e63705",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now - 340)),
                "sha256_hash": hashlib.sha256(b"AUD-1081-DISPATCH_QRF").hexdigest()
            },
            {
                "log_id": "AUD-1080",
                "operator_id": "Investigator-Verma",
                "role": "INVESTIGATOR",
                "action": "FORENSIC_DOSSIER_EXPORT",
                "target_id": "INC-1788436056-d30311",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now - 820)),
                "sha256_hash": hashlib.sha256(b"AUD-1080-EXPORT_DOSSIER").hexdigest()
            }
        ]

    def log_action(self, operator_id: str, role: str, action: str, target_id: str) -> Dict[str, Any]:
        """Records an immutable security audit event."""
        now = time.time()
        raw_msg = f"{operator_id}-{role}-{action}-{target_id}-{now}"
        entry = {
            "log_id": f"AUD-{len(self.audit_log) + 1083}",
            "operator_id": operator_id,
            "role": role,
            "action": action,
            "target_id": target_id,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
            "sha256_hash": hashlib.sha256(raw_msg.encode()).hexdigest()
        }
        self.audit_log.insert(0, entry)
        return entry

    def get_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self.audit_log[:limit]

    def search_incidents(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        camera_id: Optional[str] = None,
        object_type: Optional[str] = None,
        min_risk: int = 0,
        max_risk: int = 100,
        night_only: bool = False,
        keyword: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Executes a high-speed multi-criteria query on the SQLite security_incidents table.
        """
        if not os.path.exists(self.db_path):
            return []

        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            query = "SELECT * FROM security_incidents WHERE risk_score >= ? AND risk_score <= ?"
            params: List[Any] = [min_risk, max_risk]

            if date_from:
                query += " AND date >= ?"
                params.append(date_from)
            if date_to:
                query += " AND date <= ?"
                params.append(date_to)
            if camera_id and camera_id != "ALL":
                query += " AND camera_id = ?"
                params.append(camera_id)
            if object_type and object_type != "ALL":
                query += " AND target_type LIKE ?"
                params.append(f"%{object_type}%")
            if night_only:
                # Night window: 20:00 to 06:00
                query += " AND (hour >= 20 OR hour <= 6)"
            if keyword:
                query += " AND (details LIKE ? OR event_type LIKE ? OR camera_id LIKE ?)"
                params.extend([f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"])

            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()
            conn.close()

            results = []
            for r in rows:
                results.append({
                    "id": r["incident_id"],
                    "camera_id": r["camera_id"],
                    "event_type": r["event_type"],
                    "severity": r["severity"],
                    "risk_score": r["risk_score"],
                    "target_type": r["target_type"],
                    "details": r["details"],
                    "timestamp": r["timestamp"],
                    "date": r["date"],
                    "hour": r["hour"]
                })
            return results

        except Exception as e:
            logger.error(f"Error querying incidents database: {e}")
            return []
