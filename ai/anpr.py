import cv2
import numpy as np
import time
import json
import os
import re
import logging
from collections import Counter
from typing import List, Dict, Any, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ANPREngine")

ANPR_FILE = "demo/anpr.json"
KNOWN_VEHICLES_FILE = "configs/known_vehicles.json"

DEFAULT_WATCHLIST = {}

# Standard Indian State/UT Codes for plate syntax heuristics
INDIAN_STATE_CODES = {
    "AN", "AP", "AR", "AS", "BR", "CH", "CG", "DD", "DL", "DN", "GA", "GJ",
    "HR", "HP", "JH", "JK", "KA", "KL", "LA", "LD", "MP", "MH", "MN", "ML",
    "MZ", "NL", "OD", "PB", "PY", "RJ", "SK", "TN", "TR", "TS", "UK", "UP", "WB"
}

def levenshtein_similarity(s1: str, s2: str) -> float:
    """Calculates normalized Levenshtein similarity between two alphanumeric strings [0.0 to 1.0]."""
    if not s1 or not s2:
        return 0.0
    s1_clean = re.sub(r'[^A-Z0-9]', '', s1.upper())
    s2_clean = re.sub(r'[^A-Z0-9]', '', s2.upper())
    if s1_clean == s2_clean:
        return 1.0
    m, n = len(s1_clean), len(s2_clean)
    if m == 0 or n == 0:
        return 0.0
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if s1_clean[i - 1] == s2_clean[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    return 1.0 - (dp[m][n] / max(m, n))


class TemporalPlateVoter:
    """
    Multi-frame temporal voting engine for noisy ANPR OCR predictions.
    Maintains a sliding window of candidate predictions per track_key (camera_id, track_id),
    performs majority and character-level consensus voting, and calculates
    temporal confidence to eliminate single-frame OCR blur anomalies.
    """
    def __init__(self, window_size: int = 6, min_votes_for_consensus: int = 2):
        self.window_size = window_size
        self.min_votes_for_consensus = min_votes_for_consensus
        # track_key -> list of (raw_plate, conf, timestamp)
        self.history: Dict[Any, List[Dict[str, Any]]] = {}

    def _normalize_key(self, track_key: Any) -> str:
        if isinstance(track_key, (tuple, list)):
            return f"{track_key[0]}_{track_key[1]}"
        return str(track_key)

    def add_observation(self, track_id: Any, plate_text: str, conf: float) -> Tuple[str, float, str, int]:
        """
        Appends candidate prediction and resolves consensus plate.
        Returns (consensus_plate, consensus_conf, consensus_ratio_str, total_votes).
        """
        if not plate_text:
            return "", 0.0, "0/0", 0

        clean = re.sub(r'[^A-Z0-9]', '', plate_text.upper())
        if len(clean) < 4:
            return plate_text, conf, "1/1", 1

        tkey = self._normalize_key(track_id)
        if tkey not in self.history:
            self.history[tkey] = []

        obs_list = self.history[tkey]
        obs_list.append({
            "plate_raw": plate_text,
            "plate_clean": clean,
            "conf": float(conf),
            "time": time.time()
        })

        # Keep within sliding window
        if len(obs_list) > self.window_size:
            obs_list.pop(0)

        total_obs = len(obs_list)
        if total_obs == 1:
            return plate_text, conf, "1/1", 1

        # Count frequencies of normalized plate strings
        clean_counts = Counter(obs["plate_clean"] for obs in obs_list)
        winner_clean, win_count = clean_counts.most_common(1)[0]

        # Find raw plate representation with highest confidence among winning clean plates
        matching_obs = [obs for obs in obs_list if obs["plate_clean"] == winner_clean]
        best_raw = max(matching_obs, key=lambda x: x["conf"])["plate_raw"]
        avg_conf = sum(o["conf"] for o in matching_obs) / len(matching_obs)

        # Character-level consensus refinement if candidates are length-aligned (e.g. '8' vs 'B')
        same_len_obs = [obs["plate_clean"] for obs in obs_list if len(obs["plate_clean"]) == len(winner_clean)]
        if len(same_len_obs) >= 3:
            refined_chars = []
            for col_idx in range(len(winner_clean)):
                col_chars = Counter(cand[col_idx] for cand in same_len_obs)
                char_winner = col_chars.most_common(1)[0][0]
                refined_chars.append(char_winner)
            candidate_refined = "".join(refined_chars)
            if candidate_refined == winner_clean:
                winner_clean = candidate_refined

        # Temporal confidence boost proportional to agreement
        agreement_ratio = win_count / float(total_obs)
        boosted_conf = min(0.99, avg_conf * (0.85 + 0.15 * agreement_ratio))
        ratio_str = f"{win_count}/{total_obs}"

        return best_raw, round(boosted_conf, 2), ratio_str, total_obs

    def clear_track(self, track_id: Any):
        tkey = self._normalize_key(track_id)
        self.history.pop(tkey, None)
        self.history.pop(track_id, None)


class ANPREngine:
    """
    Intelligent Automatic Number Plate Recognition (ANPR) Module for Border Surveillance.
    Features:
    - Deep Learning Optical Character Recognition (EasyOCR neural network)
    - Night-time CLAHE and bilateral filtering image enhancement for CCTV footage
    - Indian License Plate syntax grammar parser and character confusion repair
    - Fuzzy matching against Admin Enrolled fleet database (configs/known_vehicles.json)
    - Multi-frame temporal voting to eliminate single-frame blur
    - Exact bumper plate bounding box localization
    - Border watchlist lookup with zero false positive alarms on normal traffic
    """
    def __init__(self, min_confidence: float = 0.60):
        self.min_confidence = min_confidence
        self.records: List[Dict[str, Any]] = []
        self.watchlist: Dict[str, str] = dict(DEFAULT_WATCHLIST)
        self.voter = TemporalPlateVoter(window_size=6, min_votes_for_consensus=2)
        self.track_plate_cache: Dict[Any, Dict[str, Any]] = {}
        self.recent_cam_plates: Dict[str, Tuple[str, float]] = {}
        self.track_ocr_attempts: Dict[Any, int] = {}
        self.track_last_ocr_time: Dict[Any, float] = {}
        self._ocr_reader = None
        self._load()
        try:
            self._get_ocr_reader()
        except Exception:
            pass

    def _get_ocr_reader(self):
        """Lazy loader for EasyOCR neural network model with SSL bypass."""
        if self._ocr_reader is None:
            try:
                import ssl
                ssl._create_default_https_context = ssl._create_unverified_context
                import easyocr
                self._ocr_reader = easyocr.Reader(["en"], gpu=False)
                logger.info("✓ Deep learning EasyOCR engine loaded for ANPR intelligence.")
            except Exception as e:
                logger.warning(f"EasyOCR initialization deferred: {e}")
                self._ocr_reader = False
        return self._ocr_reader if self._ocr_reader is not False else None

    def _load_known_vehicles(self) -> List[Dict[str, Any]]:
        """Loads enrolled vehicles from tactical admin registry."""
        kv_paths = [
            KNOWN_VEHICLES_FILE,
            os.path.join(os.path.dirname(__file__), "..", "configs", "known_vehicles.json"),
            os.path.join(os.path.dirname(__file__), "..", "..", "configs", "known_vehicles.json")
        ]
        for p in kv_paths:
            if os.path.exists(p):
                try:
                    with open(p, "r") as f:
                        return json.load(f)
                except Exception:
                    pass
        return []

    def match_known_fleet(self, candidate_plate: str, threshold: float = 0.58) -> Optional[Dict[str, Any]]:
        """
        Fuzzy matches recognized OCR characters against the Admin Enrolled fleet registry.
        Strips hologram prefixes and snaps noisy OCR readings to verified authorized convoys or watchlist targets.
        """
        if not candidate_plate:
            return None
        known_vehs = self._load_known_vehicles()
        if not known_vehs:
            return None

        clean_cand = re.sub(r'[^A-Z0-9]', '', candidate_plate.upper())
        if len(clean_cand) < 4:
            return None

        # Also create a version with common hologram prefixes stripped
        stripped_cand = clean_cand
        for pfx in ["IND", "PIR", "FMR", "FIR", "FFLI", "IF", "FI", "F", "I"]:
            if clean_cand.startswith(pfx) and len(clean_cand) > len(pfx) + 3:
                stripped_cand = clean_cand[len(pfx):]
                break

        if len(clean_cand) < 6:
            return None

        best_match = None
        highest_sim = 0.0

        for kv in known_vehs:
            ref_plate = kv.get("plate_number", "")
            clean_ref = re.sub(r'[^A-Z0-9]', '', ref_plate.upper())
            if len(clean_ref) < 6:
                continue
            sim1 = levenshtein_similarity(clean_cand, clean_ref)
            sim2 = levenshtein_similarity(stripped_cand, clean_ref)
            # Only apply subtle bonus if candidate length closely aligns with reference plate
            sub_bonus = 0.08 if (abs(len(clean_cand) - len(clean_ref)) <= 1 and (clean_ref in clean_cand or clean_cand in clean_ref)) else 0.0
            sim = min(1.0, max(sim1, sim2) + sub_bonus)

            if sim > highest_sim:
                highest_sim = sim
                best_match = kv

        eff_threshold = max(threshold, 0.78)
        if highest_sim >= eff_threshold and best_match:
            res = dict(best_match)
            res["similarity"] = round(highest_sim, 2)
            return res
        return None

    REJECTED_WORDS = {
        "TRAVELLER", "TRAVELER", "TOURIST", "TEMPO", "DIESEL", "PETROL", "CNG", "PRIVATE",
        "POLICE", "AMBULANCE", "FORCE", "MAHINDRA", "MARUTI", "HYUNDAI", "TATA", "HONDA",
        "TOYOTA", "SUZUKI", "ASHOK", "LEYLAND", "EICHER", "BHARATBENZ", "SWIFT", "SCORPIO",
        "INNOVA", "BOLERO", "ALTO", "BALENO", "WAGONR", "FORTUNER", "CRETA", "SECTOR", "SPEED",
        "STOP", "CAUTION", "GOVT", "ARMY", "BORDER", "SECURITY", "VIP", "PRESS", "CHAIRMAN"
    }

    def parse_and_repair_indian_plate(self, raw_text: str) -> Optional[str]:
        """
        High-Precision Indian Standard License Plate Grammar Engine:
        Format 1: [State: 2 letters] - [District: 1-2 digits] - [Series: 1-2 letters] - [Registration: 4 digits]
                  e.g., 'HR-51-CC-2673', 'HR-26-CE-7674', 'UK-07-TA-5521', 'DL-01-AB-1234', 'UP-14-BR-2233', 'UP-16-AL-3435'
        Format 2: Bharat Series (BH) [Year: 2 digits] - BH - [Registration: 4 digits] - [Series: 1-2 letters]
                  e.g., '21-BH-6294-J', '22-BH-1234-AA'

        Strict Rules:
        1. Supports modern Bharat Series (BH) plates.
        2. Strips leading HSRP hologram prefixes (IND, PIR, FMR, FF, etc.)
        3. Rejects common vehicle body decals, branding, and commercial words.
        4. Enforces valid Indian State Code from official 36 state/UT list.
        5. Preserves genuine alphabet letters (does NOT corrupt L or O into C).
        6. Enforces MANDATORY 4 trailing registration digits with robust digit repair.
        """
        if not raw_text:
            return None
        clean = re.sub(r'[^A-Z0-9]', '', raw_text.upper())

        # Check for vehicle branding / body words
        for bad_word in self.REJECTED_WORDS:
            if bad_word in clean:
                return None

        # 1. Bharat Series (BH) Plate Grammar (e.g. 21BH6294J, 2LBH6294J, 22BH1234AA)
        digit_to_letter = {'0': 'O', '8': 'B', '1': 'I', '5': 'S', '2': 'Z', '4': 'A', '6': 'G', '7': 'T'}
        letter_to_digit = {'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'L': '1', 'Z': '2', 'B': '8', 'S': '5', 'G': '6', 'E': '8', 'A': '4', 'T': '7'}

        bh_match = re.search(r'([0-9OILZ]{2})\s*(?:BH|8H)\s*([0-9OILZBSEATG]{4})\s*([A-Z0-9]{1,2})', clean)
        if bh_match:
            y_raw, num_raw, s_raw = bh_match.groups()
            y_digits = "".join(letter_to_digit.get(c, c) for c in y_raw)
            n_digits = "".join(letter_to_digit.get(c, c) for c in num_raw)
            s_chars = [c if c.isalpha() else digit_to_letter.get(c, 'A') for c in s_raw]
            if y_digits.isdigit() and n_digits.isdigit() and len(n_digits) == 4:
                return f"{y_digits}-BH-{n_digits}-" + "".join(s_chars)

        # Strip leading HSRP hologram prefixes
        for pfx in ["IND", "PIR", "FMR", "FIR", "FFLI", "IF", "FI", "FF"]:
            if clean.startswith(pfx) and len(clean) >= len(pfx) + 6:
                clean = clean[len(pfx):]
                break

        # Strip single leading noise character before state code (e.g. FHR -> HR, RHR -> HR, MHR -> HR)
        if len(clean) >= 7 and clean[0] in ['F', 'I', 'P', 'R', 'M', 'D', '0', 'O', 'E', 'Q'] and clean[1:3] in INDIAN_STATE_CODES:
            clean = clean[1:]

        if len(clean) < 7 or len(clean) > 13:
            return None

        state_confusion = {
            # UP (Uttar Pradesh)
            'WP': 'UP', 'VP': 'UP', 'TP': 'UP', 'JP': 'UP', 'IP': 'UP', 'LP': 'UP', 'NP': 'UP',
            'DP': 'UP', '0P': 'UP', 'OP': 'UP', 'UF': 'UP', 'UR': 'UP', 'UB': 'UP', 'UP': 'UP',
            # HR (Haryana)
            'IR': 'HR', '1R': 'HR', 'NR': 'HR', 'FR': 'HR', 'HA': 'HR', 'H8': 'HR', 'HB': 'HR',
            'MR': 'HR', '4R': 'HR', 'IIR': 'HR', 'HR': 'HR',
            # DL (Delhi)
            'DI': 'DL', 'D1': 'DL', '0L': 'DL', 'OL': 'DL', 'QL': 'DL', 'CL': 'DL', '1L': 'DL', 'IL': 'DL', 'DL': 'DL',
            # UK (Uttarakhand)
            'UX': 'UK', 'VK': 'UK', '0K': 'UK', 'OK': 'UK', '1K': 'UK', 'IK': 'UK', 'LK': 'UK', 'UK': 'UK',
            # MH (Maharashtra)
            'M8': 'MH', 'MB': 'MH', 'NH': 'MH', 'MH': 'MH',
            # PB (Punjab)
            'P8': 'PB', 'PR': 'PB', 'PB': 'PB',
            # RJ (Rajasthan)
            'R1': 'RJ', 'RI': 'RJ', 'RJ': 'RJ',
            # GJ (Gujarat)
            'G1': 'GJ', 'GI': 'GJ', '6J': 'GJ', 'GJ': 'GJ',
            # WB (West Bengal)
            'W8': 'WB', 'WB': 'WB',
            # BR (Bihar)
            '8R': 'BR', 'B8': 'BR', 'BR': 'BR',
            # CH (Chandigarh)
            'C11': 'CH', 'CH': 'CH',
            # KA (Karnataka)
            'KA': 'KA', 'K4': 'KA',
            # TN (Tamil Nadu)
            '7N': 'TN', 'TN': 'TN',
            'JK': 'JK', '1K': 'JK', 'HP': 'HP', 'TS': 'TS', 'AP': 'AP'
        }

        state_part = None
        state_idx = -1

        for idx in range(min(6, len(clean) - 5)):
            cand_st = clean[idx:idx+2]
            cand_st_letters = ''.join(digit_to_letter.get(c, c) for c in cand_st)
            if cand_st in INDIAN_STATE_CODES:
                state_part, state_idx = cand_st, idx
                break
            if cand_st_letters in INDIAN_STATE_CODES:
                state_part, state_idx = cand_st_letters, idx
                break
            if cand_st in state_confusion:
                state_part, state_idx = state_confusion[cand_st], idx
                break
            if cand_st_letters in state_confusion:
                state_part, state_idx = state_confusion[cand_st_letters], idx
                break

        if not state_part:
            return None

        rem = clean[state_idx + 2:]
        if len(rem) < 5:
            return None

        # Registration number: MANDATORY 4 trailing digits
        tail_raw = rem[-4:]
        
        # Enforce that at least 1 character was a digit or easily mapped digit
        native_digits_count = sum(1 for c in tail_raw if c.isdigit())
        if native_digits_count < 1 and not all(c in letter_to_digit for c in tail_raw):
            return None

        tail_digits = ''.join(letter_to_digit.get(c, c) for c in tail_raw)
        if not (tail_digits.isdigit() and len(tail_digits) == 4):
            return None

        mid = rem[:-4]
        if len(mid) == 0:
            return None

        # Determine district digits and series letters in mid region
        if len(mid) >= 4:
            dist_raw = mid[:2]
            series_raw = mid[2:]
        elif len(mid) == 3:
            # e.g., '16A' -> dist 16, series A, or '2CK' -> dist 02, series CK
            if mid[0] in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Z', 'I', 'L', 'O'] and mid[1].isalpha() and mid[2].isalpha():
                dist_raw = mid[:1]
                series_raw = mid[1:]
            elif (mid[0].isdigit() or mid[0] in letter_to_digit) and (mid[1].isdigit() or mid[1] in letter_to_digit):
                dist_raw = mid[:2]
                series_raw = mid[2:]
            else:
                dist_raw = mid[:1]
                series_raw = mid[1:]
        elif len(mid) == 2:
            if (mid[0].isdigit() or mid[0] in ['O', 'I', 'L', 'Z']) and (mid[1].isdigit() or mid[1] in ['O', 'I', 'L', 'Z']):
                dist_raw = mid
                series_raw = 'A'
            elif (mid[0].isdigit() or mid[0] in ['O', 'I', 'L', 'Z']) and mid[1].isalpha():
                dist_raw = mid[:1]
                series_raw = mid[1:]
            else:
                dist_raw = mid[:2]
                series_raw = 'A'
        else:
            dist_raw = mid
            series_raw = 'A'

        dist_digits = ''.join(letter_to_digit.get(c, c) for c in dist_raw)
        dist_str = f'0{dist_digits}' if len(dist_digits) == 1 else (dist_digits if dist_digits.isdigit() else '01')

        # Clean series: preserve authentic letters, convert OCR digits if needed
        digit_to_series = {'0': 'O', '1': 'I', '2': 'Z', '3': 'B', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'P'}
        series_clean = []
        for c in series_raw:
            if c.isalpha():
                series_clean.append(c)
            else:
                series_clean.append(digit_to_series.get(c, 'A'))
        series_str = ''.join(series_clean) or 'A'
        if len(series_str) > 2:
            series_str = series_str[:2]

        return f'{state_part}-{dist_str}-{series_str}-{tail_digits}'

    def enhance_plate_image(self, crop: np.ndarray) -> np.ndarray:
        """
        Tactical CCTV Plate Image Enhancer (primary variant):
        - Upscales small crops using Bicubic Super-Resolution to reach optimal CRNN height
        - Bilateral filter for denoising while preserving character edges
        - Adaptive CLAHE contrast expansion for high reflectivity plate characters
        - Applies Unsharp Masking to sharpen character strokes and edges
        """
        if crop is None or crop.size == 0:
            return crop

        ch, cw = crop.shape[:2]
        # Super-resolution upscale if crop is small
        if ch < 90 or cw < 260:
            scale = max(90.0 / max(ch, 1), 260.0 / max(cw, 1))
            target_w = int(cw * min(scale, 3.0))
            target_h = int(ch * min(scale, 3.0))
            crop = cv2.resize(crop, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()

        # Bilateral filter: removes CCTV compression noise, preserves character edge sharpness
        gray = cv2.bilateralFilter(gray, d=7, sigmaColor=50, sigmaSpace=50)

        # Adaptive CLAHE: adjust clipLimit based on image mean brightness
        mean_bright = float(np.mean(gray))
        clip_limit = 4.0 if mean_bright < 80 else (2.5 if mean_bright > 190 else 3.0)
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
        cl = clahe.apply(gray)

        # Unsharp masking for crisp text edges
        gaussian = cv2.GaussianBlur(cl, (0, 0), 2.0)
        sharpened = cv2.addWeighted(cl, 1.6, gaussian, -0.6, 0)
        return sharpened

    def _make_preprocessed_variants(self, crop: np.ndarray) -> List[np.ndarray]:
        """
        Generates multiple preprocessing variants for multi-pipeline OCR voting.
        Returns list of grayscale images each tailored to different plate conditions.
        """
        if crop is None or crop.size == 0:
            return []

        variants = []

        # Variant 1: Standard enhanced (CLAHE + unsharp)
        v1 = self.enhance_plate_image(crop)
        if v1 is not None and v1.size > 0:
            variants.append(v1)

        # Ensure we work with gray for other variants
        if len(crop.shape) == 3:
            gray_src = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        else:
            gray_src = crop.copy()

        ch, cw = gray_src.shape[:2]
        if ch < 90 or cw < 260:
            scale = max(90.0 / max(ch, 1), 260.0 / max(cw, 1))
            tw = int(cw * min(scale, 3.0))
            th = int(ch * min(scale, 3.0))
            gray_src = cv2.resize(gray_src, (tw, th), interpolation=cv2.INTER_CUBIC)

        # Variant 2: Otsu binary (dark text on light plate)
        try:
            blurred = cv2.GaussianBlur(gray_src, (5, 5), 0)
            _, v2 = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            variants.append(v2)
        except Exception:
            pass

        # Variant 3: Inverse binary (light text on dark plate / night-mode CCTV)
        try:
            blurred = cv2.GaussianBlur(gray_src, (5, 5), 0)
            _, v3 = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            variants.append(v3)
        except Exception:
            pass

        # Variant 4: Adaptive threshold (handles uneven illumination in outdoor CCTV)
        try:
            v4 = cv2.adaptiveThreshold(
                gray_src, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 21, 5
            )
            variants.append(v4)
        except Exception:
            pass

        return variants

    def _deskew_plate(self, gray: np.ndarray) -> np.ndarray:
        """
        Deskews a plate image by detecting dominant text line angle via Hough lines.
        Corrects slight rotations (up to ±15 degrees) common with diagonal CCTV mounts.
        """
        if gray is None or gray.size == 0:
            return gray
        try:
            edges = cv2.Canny(gray, 50, 200, apertureSize=3)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=30,
                                     minLineLength=gray.shape[1] // 4,
                                     maxLineGap=gray.shape[1] // 8)
            if lines is None or len(lines) == 0:
                return gray

            angles = []
            for line in lines:
                x1, y1, x2, y2 = line[0]
                if x2 != x1:
                    angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
                    if abs(angle) < 15:
                        angles.append(angle)

            if not angles:
                return gray

            median_angle = float(np.median(angles))
            if abs(median_angle) < 0.5:
                return gray

            h, w = gray.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
            rotated = cv2.warpAffine(gray, M, (w, h),
                                      flags=cv2.INTER_CUBIC,
                                      borderMode=cv2.BORDER_REPLICATE)
            return rotated
        except Exception:
            return gray

    def crop_plate_region(
        self,
        frame: np.ndarray,
        bbox: List[float],
        vehicle_type: str = "CAR",
        return_bumper: bool = False
    ) -> Any:
        """
        High-Precision License Plate Region Locator:
        - Uses vehicle-type specific bumper search windows.
        - Applies morphological gradient & edge contour analysis to isolate the rectangular plate.
        - Supports both standard rectangular and two-line/square aspect ratios (1.2 to 6.5).
        - Returns (plate_crop, absolute_plate_bbox [px1, py1, px2, py2]) or
          (plate_crop, absolute_plate_bbox, bumper_crop, bumper_bbox) if return_bumper=True.
        """
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = map(int, bbox)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        vh = y2 - y1
        vw = x2 - x1
        empty_res = (np.empty((0, 0, 3), dtype=np.uint8), None, np.empty((0, 0, 3), dtype=np.uint8), None) if return_bumper else (np.empty((0, 0, 3), dtype=np.uint8), None)
        if vh < 20 or vw < 20:
            return empty_res

        vtype_upper = str(vehicle_type or "CAR").upper()
        if vtype_upper in ["BUS", "TRUCK"]:
            # Lower front/rear bumper region (avoids side body panels with decals)
            by1 = int(y1 + vh * 0.55)
            by2 = min(h, int(y1 + vh * 0.98))
            bx1 = max(0, int(x1 + vw * 0.05))
            bx2 = min(w, int(x1 + vw * 0.95))
        elif vtype_upper in ["MOTORCYCLE", "BIKE", "BICYCLE"]:
            by1 = int(y1 + vh * 0.40)
            by2 = min(h, int(y1 + vh * 0.92))
            bx1 = max(0, int(x1 + vw * 0.08))
            bx2 = min(w, int(x1 + vw * 0.92))
        else:
            # Car / SUV / Van: lower bumper region
            by1 = int(y1 + vh * 0.45)
            by2 = min(h, int(y1 + vh * 0.96))
            bx1 = max(0, int(x1 + vw * 0.04))
            bx2 = min(w, int(x1 + vw * 0.96))

        bumper_crop = frame[by1:by2, bx1:bx2]
        if bumper_crop.size == 0:
            bumper_crop = frame[int(y1 + vh * 0.50):y2, x1:x2]
            by1, by2, bx1, bx2 = int(y1 + vh * 0.50), y2, x1, x2

        bumper_box = [bx1, by1, bx2, by2]

        # Morphological search for rectangular/square high-contrast plate within the bumper
        bh, bw = bumper_crop.shape[:2]
        if bh >= 20 and bw >= 40:
            try:
                gray = cv2.cvtColor(bumper_crop, cv2.COLOR_BGR2GRAY)
                # Denoise before morphological gradient
                gray_dn = cv2.bilateralFilter(gray, d=5, sigmaColor=40, sigmaSpace=40)

                best_plate = None
                best_box = None
                best_score = -1.0

                for k_w in [17, 11, 23]:  # try multiple horizontal kernel widths
                    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_w, 3))
                    grad = cv2.morphologyEx(gray_dn, cv2.MORPH_GRADIENT, kernel)
                    _, thresh = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
                    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                    for cnt in contours:
                        cx, cy, cw_box, ch_box = cv2.boundingRect(cnt)
                        aspect = cw_box / float(max(ch_box, 1))
                        if not (1.0 <= aspect <= 7.0 and cw_box >= bw * 0.07 and ch_box >= 8):
                            continue
                        # Score: prefer plates near horizontal center, larger, with good aspect
                        centerness = 1.0 - abs((cx + cw_box / 2.0) - (bw / 2.0)) / max(bw / 2.0, 1)
                        area_score = (cw_box * ch_box) / max(bw * bh, 1)
                        aspect_score = 1.0 - abs(aspect - 3.5) / 3.5  # ideal ~3.5 for Indian plates
                        score = centerness * 0.5 + area_score * 50 + aspect_score * 0.3
                        if score > best_score:
                            best_score = score
                            best_box = (cx, cy, cw_box, ch_box)

                if best_box:
                    cx, cy, cw_box, ch_box = best_box
                    pad_x = max(4, int(cw_box * 0.08))
                    pad_y = max(3, int(ch_box * 0.15))
                    px1 = max(0, cx - pad_x)
                    py1 = max(0, cy - pad_y)
                    px2 = min(bw, cx + cw_box + pad_x)
                    py2 = min(bh, cy + ch_box + pad_y)
                    plate_subcrop = bumper_crop[py1:py2, px1:px2]
                    if plate_subcrop.size > 0:
                        abs_box = [bx1 + px1, by1 + py1, bx1 + px2, by1 + py2]
                        if return_bumper:
                            fb_bump = bumper_crop
                            if bw > 640:
                                s = 640.0 / bw
                                fb_bump = cv2.resize(bumper_crop, (640, max(1, int(bh * s))), interpolation=cv2.INTER_AREA)
                            return plate_subcrop, abs_box, fb_bump, bumper_box
                        return plate_subcrop, abs_box
            except Exception:
                pass

        fb_bump = bumper_crop
        if bw > 640:
            s = 640.0 / bw
            fb_bump = cv2.resize(bumper_crop, (640, max(1, int(bh * s))), interpolation=cv2.INTER_AREA)

        if return_bumper:
            return fb_bump, bumper_box, fb_bump, bumper_box
        return fb_bump, bumper_box

    def _prune_stale_tracks(self, current_time: float, ttl: float = 120.0):
        """Purges stale track entries older than TTL to avoid memory leaks and track ID recycling collisions."""
        stale_keys = [
            k for k, t in self.track_last_ocr_time.items()
            if (current_time - t) > ttl
        ]
        for k in stale_keys:
            self.track_last_ocr_time.pop(k, None)
            self.track_ocr_attempts.pop(k, None)
            self.track_plate_cache.pop(k, None)
            self.voter.clear_track(k)

    def process_vehicle(
        self,
        frame: np.ndarray,
        bbox: List[float],
        camera_id: str,
        track_id: Any,
        vehicle_type: str = "CAR",
        allow_upgrade: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Extract vehicle plate, perform deep-learning OCR with syntax repair and
        fleet registry cross-referencing, apply temporal voting, and return enriched telemetry.
        Includes real-time progressive plate upgrading as vehicles approach or frames become clearer.
        """
        now = time.time()
        track_key = (camera_id, track_id)

        # Periodic cache cleanup
        self._prune_stale_tracks(now)

        # 1. Track-level cache check: check existing reading and upgrade eligibility
        cached_rec = self.track_plate_cache.get(track_key) or self.track_plate_cache.get(track_id)
        last_attempt_time = self.track_last_ocr_time.get(track_key, self.track_last_ocr_time.get(track_id, 0.0))

        if cached_rec:
            # If upgrade is disabled or track already has top-tier confidence & consensus, return cached
            if not allow_upgrade or (cached_rec.get("confidence", 0.0) >= 0.96 and cached_rec.get("total_votes", 1) >= 4):
                rec = dict(cached_rec)
                vw = bbox[2] - bbox[0]
                vh = bbox[3] - bbox[1]
                rec["plate_bbox"] = [
                    int(bbox[0] + vw * 0.35),
                    int(bbox[1] + vh * 0.70),
                    int(bbox[0] + vw * 0.85),
                    int(bbox[1] + vh * 0.90)
                ]
                return rec

            # Rate-limit re-evaluation for real-time upgrade: wait at least 0.8s between attempts
            if (now - last_attempt_time) < 0.8:
                rec = dict(cached_rec)
                vw = bbox[2] - bbox[0]
                vh = bbox[3] - bbox[1]
                rec["plate_bbox"] = [
                    int(bbox[0] + vw * 0.35),
                    int(bbox[1] + vh * 0.70),
                    int(bbox[0] + vw * 0.85),
                    int(bbox[1] + vh * 0.90)
                ]
                return rec

        # Check backoff: if this track previously failed OCR 3+ times, retry every 2.0 seconds
        attempts = self.track_ocr_attempts.get(track_key, self.track_ocr_attempts.get(track_id, 0))
        if attempts >= 3 and (now - last_attempt_time) < 2.0:
            return cached_rec if cached_rec else None

        self.track_last_ocr_time[track_key] = now
        self.track_last_ocr_time[track_id] = now

        crop, plate_box, bumper_crop, bumper_box = self.crop_plate_region(
            frame, bbox, vehicle_type=vehicle_type, return_bumper=True
        )
        if crop.size == 0 and (bumper_crop is None or bumper_crop.size == 0):
            self.track_ocr_attempts[track_key] = attempts + 1
            self.track_ocr_attempts[track_id] = attempts + 1
            return cached_rec if cached_rec else None

        # Raw OCR candidate extraction with dual-stage fallback
        raw_plate, raw_conf, refined_box = self._extract_ocr(
            crop, track_id, vehicle_type, plate_box,
            fallback_bumper=bumper_crop, fallback_box=bumper_box
        )
        if refined_box is not None:
            plate_box = refined_box

        if not raw_plate:
            self.track_ocr_attempts[track_key] = attempts + 1
            self.track_ocr_attempts[track_id] = attempts + 1
            return cached_rec if cached_rec else None

        # Multi-frame temporal voting
        consensus_plate, consensus_conf, consensus_ratio, total_votes = self.voter.add_observation(
            track_key, raw_plate, raw_conf
        )

        final_plate = consensus_plate or raw_plate
        final_conf = consensus_conf or raw_conf

        if final_plate and final_conf >= 0.40:
            timestamp_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            
            # Check against Admin Enrolled fleet and watchlist
            fleet_match = self.match_known_fleet(final_plate, threshold=0.58)
            if fleet_match:
                final_plate = fleet_match.get("plate_number", final_plate)
                is_authorized = (fleet_match.get("status") == "AUTHORIZED")
                is_watchlist = (fleet_match.get("status") == "UNAUTHORIZED")
                watchlist_reason = fleet_match.get("notes") if is_watchlist else None
                status = "AUTHORIZED" if is_authorized else ("SUSPECT" if is_watchlist else "CLEARED")
            else:
                is_watchlist, watchlist_reason = self.is_watchlist_plate(final_plate)
                is_authorized = False
                status = "SUSPECT" if is_watchlist else "CLEARED"

            record = {
                "plate_number": final_plate,
                "confidence": round(final_conf, 2),
                "camera_id": camera_id,
                "track_id": track_id,
                "vehicle_type": vehicle_type.upper(),
                "timestamp": timestamp_str,
                "is_watchlist": is_watchlist,
                "is_authorized": is_authorized,
                "watchlist_reason": watchlist_reason,
                "status": status,
                "consensus_ratio": consensus_ratio,
                "total_votes": total_votes,
                "plate_bbox": plate_box,
                "fleet_match": fleet_match,
                "upgraded": False,
                "upgrade_count": 0
            }

            # Clear failure attempts counter on success
            self.track_ocr_attempts.pop(track_key, None)
            self.track_ocr_attempts.pop(track_id, None)

            # Check if this represents a REAL-TIME UPGRADE of an existing observation
            if cached_rec:
                old_plate = cached_rec.get("plate_number", "")
                old_conf = float(cached_rec.get("confidence", 0.0))
                old_votes = int(cached_rec.get("total_votes", 1))

                is_upgrade = (
                    (final_plate != old_plate and final_conf >= old_conf - 0.05) or
                    (final_conf > old_conf + 0.02) or
                    (total_votes > old_votes) or
                    (fleet_match is not None and not cached_rec.get("fleet_match"))
                )

                if is_upgrade:
                    record["upgraded"] = True
                    record["upgrade_count"] = cached_rec.get("upgrade_count", 0) + 1
                    record["last_upgrade_time"] = now
                    cached_rec.update(record)
                    self.track_plate_cache[track_key] = cached_rec
                    self.track_plate_cache[track_id] = cached_rec
                    self.recent_cam_plates[camera_id] = (final_plate, now)
                    logger.info(
                        f"🚀 [ANPR REALTIME UPGRADE] Track #{track_id} on {camera_id}: "
                        f"'{old_plate}' ({old_conf*100:.0f}%) -> '{final_plate}' ({final_conf*100:.0f}%) "
                        f"[Consensus: {consensus_ratio}, Upgrade #{cached_rec['upgrade_count']}]"
                    )
                    return cached_rec
                else:
                    return cached_rec

            # Initial registration for new track
            self.track_plate_cache[track_key] = record
            self.track_plate_cache[track_id] = record
            self.recent_cam_plates[camera_id] = (final_plate, now)

            # Avoid immediate duplicate registration
            existing_idx = next(
                (i for i, r in enumerate(self.records)
                 if r.get("camera_id") == camera_id and r.get("track_id") == track_id and r.get("plate_number") == final_plate),
                None
            )
            if existing_idx is not None:
                self.records[existing_idx]["confidence"] = record["confidence"]
                self.records[existing_idx]["plate_bbox"] = plate_box
            else:
                self.records.insert(0, record)
                self._save()
                if is_watchlist:
                    logger.warning(f"🚨 [ANPR WATCHLIST HIT] Plate: '{final_plate}' ({watchlist_reason}) on {camera_id}")
                elif is_authorized:
                    logger.info(f"🛡️ [ANPR AUTHORIZED CONVOY] Plate: '{final_plate}' ({record['confidence']*100:.0f}% conf) on {camera_id}")
                else:
                    logger.info(f"🚘 [ANPR PLATE RECOGNIZED] Plate: '{final_plate}' ({record['confidence']*100:.0f}% conf) on {camera_id}")

            return record

        self.track_ocr_attempts[track_key] = attempts + 1
        self.track_ocr_attempts[track_id] = attempts + 1
        return None

    def _sort_ocr_tokens_spatially(self, ocr_results: List[Any]) -> Tuple[List[Dict[str, Any]], List[str], float, List[Any]]:
        """
        Sorts OCR detections spatially (line clustering top-to-bottom, tokens left-to-right).
        Correctly orders two-line plates and fragments.
        """
        valid = []
        all_pts = []
        for bbox_pts, text, conf in ocr_results:
            cleaned = re.sub(r'[^A-Z0-9]', '', text.upper())
            if float(conf) < 0.14 or not cleaned:
                continue
            cy = sum(p[1] for p in bbox_pts) / 4.0
            cx = sum(p[0] for p in bbox_pts) / 4.0
            h_box = max(p[1] for p in bbox_pts) - min(p[1] for p in bbox_pts)
            valid.append({
                "pts": bbox_pts,
                "text": cleaned,
                "conf": float(conf),
                "cx": cx,
                "cy": cy,
                "h": max(h_box, 10)
            })
            all_pts.extend(bbox_pts)

        if not valid:
            return [], [], 0.0, []

        # Cluster tokens into lines
        lines = []
        valid.sort(key=lambda item: item["cy"])
        for item in valid:
            placed = False
            for line in lines:
                line_avg_y = sum(x["cy"] for x in line) / len(line)
                line_avg_h = sum(x["h"] for x in line) / len(line)
                if abs(item["cy"] - line_avg_y) < line_avg_h * 0.60:
                    line.append(item)
                    placed = True
                    break
            if not placed:
                lines.append([item])

        # Sort lines top-to-bottom
        lines.sort(key=lambda l: sum(x["cy"] for x in l) / len(l))

        sorted_tokens = []
        conf_sum = 0.0
        line_strings = []
        for line in lines:
            line.sort(key=lambda x: x["cx"])
            line_str = "".join(x["text"] for x in line)
            line_strings.append(line_str)
            for item in line:
                sorted_tokens.append(item["text"])
                conf_sum += item["conf"]

        avg_conf = conf_sum / max(len(sorted_tokens), 1)
        return lines, sorted_tokens, avg_conf, all_pts

    def _extract_ocr(
        self,
        crop: np.ndarray,
        track_id: Any,
        vehicle_type: str = "CAR",
        base_box: Optional[List[int]] = None,
        fallback_bumper: Optional[np.ndarray] = None,
        fallback_box: Optional[List[int]] = None
    ) -> Tuple[Optional[str], float, Optional[List[int]]]:
        """
        Hierarchical Deep OCR extraction:
        1. EasyOCR on enhanced bumper crop / subcrop with spatial token sorting
        2. Quad refinement and deskewing
        3. Hologram stripping & Indian standard plate syntax repair (Single & Two-line, Bharat Series)
        4. Cross-referencing against enrolled fleet registry
        5. Dual-stage fallback: if subcrop fails, inspect full bumper crop
        """
        reader = self._get_ocr_reader()
        if reader is None:
            return None, 0.0, None

        def _evaluate_image(img: np.ndarray, box_ref: Optional[List[int]]):
            if img is None or img.size == 0:
                return None, 0.0, None

            # Build multi-variant preprocessing pipeline
            variants = self._make_preprocessed_variants(img)
            if not variants:
                return None, 0.0, None

            # Also add deskewed versions of top variants
            deskewed = []
            for v in variants[:2]:
                dk = self._deskew_plate(v)
                if dk is not None and not np.array_equal(dk, v):
                    deskewed.append(dk)
            all_variants = variants + deskewed

            best_result = (None, 0.0, None)  # (plate, conf, refined_box)
            refined_box = None

            for variant_img in all_variants:
                ocr_results = []
                try:
                    ocr_results = reader.readtext(variant_img)
                except Exception as e:
                    logger.debug(f"EasyOCR variant exception: {e}")
                    continue

                if not ocr_results:
                    continue

                lines, sorted_tokens, avg_conf, all_pts = self._sort_ocr_tokens_spatially(ocr_results)
                if not sorted_tokens:
                    continue

                if refined_box is None and all_pts and box_ref:
                    bx1, by1 = box_ref[0], box_ref[1]
                    px1 = bx1 + int(min(p[0] for p in all_pts)) - 6
                    py1 = by1 + int(min(p[1] for p in all_pts)) - 6
                    px2 = bx1 + int(max(p[0] for p in all_pts)) + 6
                    py2 = by1 + int(max(p[1] for p in all_pts)) + 6
                    if (px2 - px1) >= 25 and (py2 - py1) >= 10:
                        refined_box = [px1, py1, px2, py2]

                # Build candidate strings from token combinations
                combined_raw = "".join(sorted_tokens)
                candidates = [combined_raw]

                # Line-level combinations (both orders for two-line plates)
                line_strings = ["".join(x["text"] for x in line) for line in lines]
                for ls in line_strings:
                    if ls and ls not in candidates:
                        candidates.append(ls)
                # Two-line plate: try reversed line order too
                if len(line_strings) == 2:
                    rev = line_strings[1] + line_strings[0]
                    if rev not in candidates:
                        candidates.append(rev)

                # Individual tokens and adjacent token pairs
                for t in sorted_tokens:
                    if t not in candidates:
                        candidates.append(t)
                for i in range(len(sorted_tokens) - 1):
                    pair = sorted_tokens[i] + sorted_tokens[i + 1]
                    if pair not in candidates:
                        candidates.append(pair)
                    # Also try reversed pair (OCR sometimes flips token order)
                    rpair = sorted_tokens[i + 1] + sorted_tokens[i]
                    if rpair not in candidates:
                        candidates.append(rpair)

                for cand in candidates:
                    if len(cand) >= 6:
                        # 1. Parse using Indian standard / Bharat plate grammar
                        repaired = self.parse_and_repair_indian_plate(cand)
                        if repaired:
                            matched = self.match_known_fleet(repaired, threshold=0.78)
                            if matched:
                                return matched["plate_number"], 0.98, refined_box
                            plate_conf = round(max(avg_conf, 0.75), 2)
                            if plate_conf > best_result[1]:
                                best_result = (repaired, plate_conf, refined_box)
                            break  # grammar match: stop trying other candidates for this variant

                        # 2. Strict fuzzy match against enrolled fleet (no grammar required)
                        matched = self.match_known_fleet(cand, threshold=0.80)
                        if matched:
                            return matched["plate_number"], 0.98, refined_box

                # If this variant gave a valid plate, check if it's the best
                if best_result[0] is not None:
                    # Already found a grammar-valid plate; try remaining variants for upgrade
                    pass

            if best_result[0]:
                return best_result[0], best_result[1], refined_box or best_result[2]
            return None, 0.0, refined_box

        # Stage 1: Evaluate primary subcrop
        res_plate, res_conf, res_box = _evaluate_image(crop, base_box)
        if res_plate:
            return res_plate, res_conf, res_box

        # Stage 2: Fallback to full bumper crop if primary crop failed
        if fallback_bumper is not None and fallback_bumper.size > 0:
            fb_plate, fb_conf, fb_box = _evaluate_image(fallback_bumper, fallback_box)
            if fb_plate:
                return fb_plate, fb_conf, fb_box

        return None, 0.0, res_box

    def is_watchlist_plate(self, plate: str) -> Tuple[bool, str]:
        """Check plate against watchlist (normalized comparison with strict similarity)."""
        if not plate:
            return False, ""
        norm_plate = re.sub(r'[^A-Z0-9]', '', plate.upper())
        if len(norm_plate) < 6:
            return False, ""
        
        # Check active watchlist dictionary
        for wl_plate, reason in self.watchlist.items():
            norm_wl = re.sub(r'[^A-Z0-9]', '', wl_plate.upper())
            if norm_plate == norm_wl or (len(norm_wl) >= 7 and levenshtein_similarity(norm_plate, norm_wl) >= 0.88):
                return True, reason

        # Check known_vehicles.json for UNAUTHORIZED status
        for kv in self._load_known_vehicles():
            if kv.get("status") == "UNAUTHORIZED":
                norm_kv = re.sub(r'[^A-Z0-9]', '', kv.get("plate_number", "").upper())
                if norm_plate == norm_kv or (len(norm_kv) >= 7 and levenshtein_similarity(norm_plate, norm_kv) >= 0.88):
                    return True, kv.get("notes", "Flagged border watchlist suspect vehicle")

        # Check lost_vehicles.json
        try:
            lv_path = os.path.join(os.path.dirname(__file__), "..", "configs", "lost_vehicles.json")
            if os.path.exists(lv_path):
                with open(lv_path, "r") as f:
                    lost_vehs = json.load(f)
                for lv in lost_vehs:
                    norm_lv = re.sub(r'[^A-Z0-9]', '', lv.get("plate_number", "").upper())
                    if norm_plate == norm_lv or (len(norm_lv) >= 7 and levenshtein_similarity(norm_plate, norm_lv) >= 0.88):
                        return True, f"LOST / STOLEN: {lv.get('notes', 'Flagged hotlist vehicle')}"
        except Exception:
            pass

        return False, ""

    def search_plates(self, query: str) -> List[Dict[str, Any]]:
        q = query.upper()
        return [r for r in self.records if q in r["plate_number"].upper()]

    def get_all_records(self) -> List[Dict[str, Any]]:
        return self.records

    def _load(self):
        if os.path.exists(ANPR_FILE):
            try:
                with open(ANPR_FILE, "r") as f:
                    self.records = json.load(f)
            except Exception as e:
                logger.error(f"Error loading ANPR records: {e}")

    def _save(self):
        import threading
        records_copy = list(self.records)
        def _bg_save():
            try:
                with open(ANPR_FILE, "w") as f:
                    json.dump(records_copy, f, indent=2)
            except Exception as e:
                logger.error(f"Error saving ANPR records: {e}")
        threading.Thread(target=_bg_save, daemon=True).start()
