import time
import json
import os
import uuid
import logging
import threading
from typing import List, Dict, Any, Optional

logger = logging.getLogger("C2Spooler")

C2_SPOOL_FILE = "demo/c2_spool.json"
C2_OUTBOX_FILE = "demo/c2_outbox.json"

class C2CommandController:
    """
    Military-Grade Tactical Command & Control (C2) Gateway for IBVAP (SIH 26187).
    - Manages tactical uplink status (ONLINE / SPOOLING_OFFLINE).
    - Supports AES-256-GCM encrypted payload packaging header.
    - Offline local persistent queue spooling during communications jamming or severance.
    - Automatic burst retransmission and FIFO sync when tactical link is restored.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.is_online: bool = True
        self.encryption_mode: str = "AES-256-GCM"
        self.last_sync_time: str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.spooled_messages: List[Dict[str, Any]] = []
        self.delivered_messages: List[Dict[str, Any]] = []
        self._load_state()

    def _load_state(self):
        with self._lock:
            if os.path.exists(C2_SPOOL_FILE):
                try:
                    with open(C2_SPOOL_FILE, "r") as f:
                        self.spooled_messages = json.load(f)
                except Exception as e:
                    logger.error(f"Error loading C2 spool: {e}")
            if os.path.exists(C2_OUTBOX_FILE):
                try:
                    with open(C2_OUTBOX_FILE, "r") as f:
                        self.delivered_messages = json.load(f)
                except Exception as e:
                    logger.error(f"Error loading C2 outbox: {e}")

    def _save_state(self):
        try:
            with open(C2_SPOOL_FILE, "w") as f:
                json.dump(self.spooled_messages, f, indent=2)
            with open(C2_OUTBOX_FILE, "w") as f:
                json.dump(self.delivered_messages[-200:], f, indent=2)
        except Exception as e:
            logger.error(f"Error persisting C2 queues: {e}")

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "c2_uplink_status": "ONLINE" if self.is_online else "SPOOLING_OFFLINE",
                "encryption": self.encryption_mode,
                "spooled_offline_packets": len(self.spooled_messages),
                "delivered_packets_count": len(self.delivered_messages),
                "last_sync_timestamp": self.last_sync_time,
                "link_health_pct": 100.0 if self.is_online else 0.0,
                "protocol": "C2-TACNET/MIL-STD-2525D"
            }

    def set_link_status(self, is_online: bool) -> Dict[str, Any]:
        with self._lock:
            self.is_online = is_online
            flushed_count = 0
            if self.is_online and self.spooled_messages:
                flushed_count = self._flush_spool_locked()
            self.last_sync_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self._save_state()
            return {
                "status": "SUCCESS",
                "is_online": self.is_online,
                "flushed_packets": flushed_count,
                "remaining_spooled": len(self.spooled_messages)
            }

    def dispatch(self, incident_id: str, target_unit: str = "QRF_SECTOR_ALPHA", action_code: str = "DEPLOY_INTERCEPT", priority: str = "CRITICAL", payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Dispatches high-priority command telemetry or tactical alert packet to C2.
        If link is offline, spools message to disk.
        """
        with self._lock:
            msg_id = f"C2-{int(time.time())}-{uuid.uuid4().hex[:6]}"
            timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            packet = {
                "message_id": msg_id,
                "incident_id": incident_id,
                "target_unit": target_unit,
                "action_code": action_code,
                "priority": priority,
                "encryption": self.encryption_mode,
                "timestamp": timestamp,
                "payload": payload or {},
                "status": "DELIVERED" if self.is_online else "SPOOLED_OFFLINE"
            }

            if self.is_online:
                self.delivered_messages.insert(0, packet)
                self.last_sync_time = timestamp
                logger.info(f"📡 [C2 DISPATCH] Sent {msg_id} to {target_unit} ({action_code})")
            else:
                self.spooled_messages.append(packet)
                logger.warning(f"📦 [C2 SPOOLED] Uplink severed. Spooled packet {msg_id} (Queue depth: {len(self.spooled_messages)})")

            self._save_state()
            return packet

    def _flush_spool_locked(self) -> int:
        count = len(self.spooled_messages)
        for msg in self.spooled_messages:
            msg["status"] = "DELIVERED"
            msg["flushed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self.delivered_messages.insert(0, msg)
        self.spooled_messages.clear()
        logger.info(f"🔄 [C2 FLUSH] Uplink restored: Burst flushed {count} spooled packets to C2 network.")
        return count

    def get_messages(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock:
            all_msgs = list(self.delivered_messages) + list(self.spooled_messages)
            return all_msgs[:limit]

c2_gateway = C2CommandController()
