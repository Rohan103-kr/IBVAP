import json
import os
import time
import logging
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FeedbackStore")

FEEDBACK_FILE = "demo/feedback.json"

class FeedbackStore:
    """
    Manages Human-in-the-Loop operator feedback:
    - Operator can mark alert as VALID_INCIDENT or FALSE_POSITIVE
    - Operator can attach notes for model evaluation & tuning
    """
    def __init__(self, filepath: str = FEEDBACK_FILE):
        self.filepath = filepath
        self.feedback_entries: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r") as f:
                    self.feedback_entries = json.load(f)
            except Exception as e:
                logger.error(f"Error loading feedback file: {e}")

    def _save(self):
        try:
            with open(self.filepath, "w") as f:
                json.dump(self.feedback_entries, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving feedback file: {e}")

    def add_feedback(self, incident_id: str, feedback_type: str, operator_notes: str = "", operator_id: str = "Op-01") -> Dict[str, Any]:
        """
        Record feedback (VALID_INCIDENT or FALSE_POSITIVE).
        """
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        entry = {
            "incident_id": incident_id,
            "feedback_type": feedback_type,  # VALID_INCIDENT or FALSE_POSITIVE
            "operator_notes": operator_notes,
            "operator_id": operator_id,
            "timestamp": timestamp
        }
        
        # Remove existing feedback for same incident if updating
        self.feedback_entries = [f for f in self.feedback_entries if f.get("incident_id") != incident_id]
        self.feedback_entries.insert(0, entry)
        self._save()

        logger.info(f"👤 [HUMAN-IN-THE-LOOP FEEDBACK] {incident_id} marked as {feedback_type} by {operator_id}")
        return entry

    def get_feedback_for_incident(self, incident_id: str) -> Optional[Dict[str, Any]]:
        for f in self.feedback_entries:
            if f.get("incident_id") == incident_id:
                return f
        return None

    def get_all_feedback(self) -> List[Dict[str, Any]]:
        return self.feedback_entries
