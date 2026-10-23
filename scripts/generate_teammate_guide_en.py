#!/usr/bin/env python3
"""
IBVAP — Teammates' Master Architecture & Working Guide (English Edition)
Generates a structured, defense-grade master technical and operational guide
for teammates to understand the complete pipeline, features, code, and jury demo.
"""

import os
import sys
import time
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak, KeepTogether
)
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#0f172a"))

        # Running Header (pages 2+)
        if self._pageNumber > 1:
            self.drawString(36, 11 * inch - 26, "IBVAP — Teammates' Master Architecture & Working Guide | SIH 26187")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(36, 11 * inch - 29, 8.5 * inch - 36, 11 * inch - 29)

        # Running Footer (all pages)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(36, 20, "IBVAP INTERNAL TEAM DOCUMENT — HACKATHON OPERATIONS & CODEBASE BIBLE")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 36, 20, page_text)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(36, 30, 8.5 * inch - 36, 30)

        self.restoreState()


def build_en_pdf(output_path="IBVAP_Teammate_Master_Guide_EN.pdf"):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=42
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Title'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=21,
        textColor=colors.HexColor("#0f172a"),
        alignment=0,
        spaceAfter=2
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#0d9488"),
        spaceAfter=8
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=11,
        spaceAfter=4,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        fontName='Helvetica-Bold',
        fontSize=9.8,
        leading=12.5,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=7,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        fontName='Helvetica',
        fontSize=8.3,
        leading=11.2,
        textColor=colors.HexColor("#334155"),
        spaceAfter=4.5
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        fontName='Helvetica',
        fontSize=8.1,
        leading=11,
        textColor=colors.HexColor("#334155"),
        leftIndent=12,
        spaceAfter=2.5
    )

    code_style = ParagraphStyle(
        'Code_Custom',
        fontName='Courier',
        fontSize=7.8,
        leading=10.2,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=2.5
    )

    callout_style = ParagraphStyle(
        'Callout_Text',
        fontName='Helvetica-Bold',
        fontSize=8.2,
        leading=11,
        textColor=colors.HexColor("#0f766e")
    )

    tbl_header = ParagraphStyle(
        'TH_Style',
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    tbl_cell = ParagraphStyle(
        'TC_Style',
        fontName='Helvetica',
        fontSize=7.8,
        leading=10,
        textColor=colors.HexColor("#1e293b")
    )

    tbl_cell_bold = ParagraphStyle(
        'TCB_Style',
        fontName='Helvetica-Bold',
        fontSize=7.8,
        leading=10,
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # Title Banner
    story.append(Paragraph("IBVAP — TEAMMATES' MASTER ARCHITECTURE & WORKING GUIDE", title_style))
    story.append(Paragraph("Complete Engineering Blueprint, Core Features Deep Dive, Code Map & SIH 26187 Demo Playbook", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0d9488"), spaceBefore=2, spaceAfter=8))

    # Executive Overview
    story.append(Paragraph("1. Executive Overview & Problem Statement Context", h1_style))
    story.append(Paragraph(
        "<b>Smart India Hackathon Problem Statement 26187:</b> Developing an <i>Intelligent Border Video Analytics Platform (IBVAP)</i> "
        "designed for defense agencies (MHA / SSB / BSF). Existing border surveillance relies on thousands of passive CCTV cameras that "
        "record hours of footage without real-time contextual intelligence. Human operators suffer from cognitive fatigue within 20 minutes, "
        "causing critical security intrusions to go unnoticed. IBVAP transforms raw optical, night-vision, and thermal streams into "
        "<b>actionable tactical intelligence</b> through automated edge AI, multi-camera correlation, behavioral anomaly detection, "
        "cryptographic audit trails, and military C2 dispatch.",
        body_style
    ))

    def make_callout(text, bg="#f0fdfa", border="#0d9488"):
        t = Table([[Paragraph(text, callout_style)]], colWidths=[7.4 * inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(bg)),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor(border)),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    story.append(make_callout(
        "CORE VALUE FOR JUDGES: IBVAP does NOT require expensive military hardware. It operates on existing commercial CCTV, "
        "RTSP feeds, mobile IP cameras, and local webcams while delivering 92% false-alert reduction, 14ms low latency, and 55/55 passed tests."
    ))
    story.append(Spacer(1, 6))

    # System Architecture Section
    story.append(Paragraph("2. End-to-End System Pipeline & Data Flow", h1_style))
    story.append(Paragraph(
        "The system executes a seamless 10-stage sequential pipeline from physical camera sensors to tactical interdiction:",
        body_style
    ))

    pipeline_data = [
        [Paragraph("Stage", tbl_header), Paragraph("Component", tbl_header), Paragraph("Technical Execution & Mechanism", tbl_header), Paragraph("Key Output", tbl_header)],
        [
            Paragraph("1. Ingestion", tbl_cell_bold),
            Paragraph("ThreadedCameraReader", tbl_cell),
            Paragraph("Dedicated daemon threads for RTSP/HTTP chunked streams. Reverse buffer slicing (<code>rfind</code>) drops socket lag; bilinear downscaling to 720p.", tbl_cell),
            Paragraph("Zero-lag raw frames (30 FPS, <20ms)", tbl_cell)
        ],
        [
            Paragraph("2. Detection", tbl_cell_bold),
            Paragraph("YOLODetector", tbl_cell),
            Paragraph("YOLOv8 nano edge model. Detects persons and vehicles (Car, SUV, Truck, Bike). Runs inference on CPU every 4th frame.", tbl_cell),
            Paragraph("Bounding boxes, class tags, conf scores", tbl_cell)
        ],
        [
            Paragraph("3. Tracking", tbl_cell_bold),
            Paragraph("ByteTracker", tbl_cell),
            Paragraph("Kalman Filter motion model + Hungarian matching. Links detections across frames with persistent Track IDs and speed vectors.", tbl_cell),
            Paragraph("Track ID, velocity (m/s), trajectory waypoints", tbl_cell)
        ],
        [
            Paragraph("4. Biometrics", tbl_cell_bold),
            Paragraph("FaceDetector + FRS", tbl_cell),
            Paragraph("CLAHE contrast equalization + bi-directional profile cascades. Strict Face Quality Gate (Laplacian sharpness) prevents false matches on distant targets.", tbl_cell),
            Paragraph("Face chip, identity tag (Authorized / Unknown)", tbl_cell)
        ],
        [
            Paragraph("5. ANPR", tbl_cell_bold),
            Paragraph("ANPREngine", tbl_cell),
            Paragraph("Aspect-ratio plate localization (2.0-5.5) + EasyOCR + 5-frame TemporalPlateVoter majority consensus. Cross-references watchlist.", tbl_cell),
            Paragraph("License plate string, watchlist hit (+40 risk)", tbl_cell)
        ],
        [
            Paragraph("6. Spatial Fencing", tbl_cell_bold),
            Paragraph("ZoneEngine", tbl_cell),
            Paragraph("Point-in-polygon (Ray Casting) & line-intersection algorithms. Evaluates Restricted, Buffer, and Watch zone crossings.", tbl_cell),
            Paragraph("Zone containment, perimeter fence tripwires", tbl_cell)
        ],
        [
            Paragraph("7. Behavioral Rules", tbl_cell_bold),
            Paragraph("RuleEngine + AnomalyDetector", tbl_cell),
            Paragraph("Evaluates 10+ defense rules: loitering, unusual vehicle stop, evasive probing, night movement breach, and 2D IoU combat skirmishes.", tbl_cell),
            Paragraph("Security rule violation triggers", tbl_cell)
        ],
        [
            Paragraph("8. Risk Scoring", tbl_cell_bold),
            Paragraph("RiskEngine", tbl_cell),
            Paragraph("Multi-factor dynamic risk formula: Base Object + Threat Actions (Fence +40, Loitering +20, Watchlist +40) - Friendly Modifiers.", tbl_cell),
            Paragraph("Composite Risk Score (0-100), Severity Level", tbl_cell)
        ],
        [
            Paragraph("9. Incident Audit", tbl_cell_bold),
            Paragraph("EventEngine + IncidentManager", tbl_cell),
            Paragraph("Deduplicates alerts, initiates tactical incidents, captures evidence snapshots, and computes cryptographic SHA-256 hash chains.", tbl_cell),
            Paragraph("Tamper-proof evidence snapshot + Event ID", tbl_cell)
        ],
        [
            Paragraph("10. C2 Dispatch", tbl_cell_bold),
            Paragraph("C2Spooler + MultiCam Correlator", tbl_cell),
            Paragraph("Transfers cross-camera tracks (CAM-01->02->03). Dispatches AES-256-GCM encrypted military alerts; spools offline during jamming.", tbl_cell),
            Paragraph("QRF Tactical Dispatch & Telemetry", tbl_cell)
        ]
    ]

    t_pipe = Table(pipeline_data, colWidths=[0.85 * inch, 1.35 * inch, 3.6 * inch, 1.6 * inch])
    t_pipe.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f172a")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_pipe)
    story.append(Spacer(1, 7))

    # Core Features Section
    story.append(Paragraph("3. Core Features Deep Dive (What Each Feature Does)", h1_style))

    features = [
        ("A. 4-Class Vehicle Classification & Driver Cross-Examination",
         "Under SIH PS 26187, detecting generic 'vehicles' is insufficient. IBVAP extracts 4 distinct classes: <b>Car, SUV, Truck, and Bike</b>. "
         "Tracks retain vehicle types across frames. At checkpoints (CAM-02), the system cross-examines vehicle registration with driver facial biometrics. "
         "If an unauthorized or unknown individual operates a registered military/patrol vehicle, Rule 2B (CHECKPOINT_DRIVER_MISMATCH) triggers an immediate alert."),

        ("B. End-to-End ANPR with Temporal Consensus & Watchlist Matching",
         "Indian HSRP number plates flutter across video frames due to angle and vibration. Our <b>TemporalPlateVoter</b> maintains a sliding 5-frame "
         "majority voter that stabilizes OCR output. Recognized plates are instantly scanned against the local tactical watchlist. Flagged vehicles "
         "receive a +40 risk penalty, prompting immediate checkpoint gate seal SOPs."),

        ("C. Biometric Face Recognition System (FRS) with CLAHE & Quality Gate",
         "Operates over CCTV rather than dedicated access-control cameras. Enhances facial contrast using CLAHE and bi-directional profile cascades. "
         "Features an essential <b>Face Quality Gate</b>: if a person is distant (50m at fence line) or motion-blurred, the system skips FRS rather than "
         "forcing false identity matches. When qualified, it classifies faces into AUTHORIZED (Officers) vs UNAUTHORIZED / UNKNOWN."),

        ("D. Tactical Combat & Armed Skirmish Detection",
         "Detects physical fights, grappling, and violent altercations between individuals. Evaluates 2D Bounding Box Overlap (IoU > 0.05), "
         "Combat Aspect Ratio Collapse (h/w drops from 2.5 to < 1.35 during ground wrestling/tackling), and velocity divergence vectors. "
         "Requires 2-frame persistence to distinguish true fights from casual pedestrian crossovers."),

        ("E. Multi-Camera Spatial Fence & Trajectory Handover",
         "The platform connects disparate cameras into a unified defense perimeter: CAM-01 (Approach Corridor) &rarr; CAM-02 (Perimeter Fence) &rarr; "
         "CAM-03 (Zero-Line Core). When a target moves across cameras, their trajectory is spatially correlated. Reaching CAM-03 escalates alert "
         "level to CRITICAL (CONFIRMED_SPATIAL_INTRUSION) and vectors Quick Reaction Force (QRF) along the breach trajectory."),

        ("F. Offline Spooling & Cryptographic Audit Hash-Chain",
         "Border outposts face electronic jamming and severed uplinks. When connectivity fails, outbound C2 dispatch packets are automatically spooled "
         "locally to disk (SPOOLED_OFFLINE) and burst-flushed upon recovery. Furthermore, every evidence snapshot is cryptographically hashed in a "
         "SHA-256 blockchain-style chain: H_i = SHA256(H_i-1 + ImageBytes + EventID). Tampering with a single evidence image is instantly detected.")
    ]

    for f_title, f_desc in features:
        story.append(Paragraph(f_title, h2_style))
        story.append(Paragraph(f_desc, body_style))

    story.append(Spacer(1, 6))

    # Codebase Structure Section
    story.append(Paragraph("4. Codebase Architecture & File Organization", h1_style))
    story.append(Paragraph("Where things live and which file is responsible for what:", body_style))

    code_map_data = [
        [Paragraph("Directory / File", tbl_header), Paragraph("Responsibility & Key Functions", tbl_header)],
        [Paragraph("<code>ai/pipeline.py</code>", tbl_cell_bold), Paragraph("Orchestrates detection, tracking, ANPR, and face recognition across camera frames.", tbl_cell)],
        [Paragraph("<code>ai/face_detector.py</code>", tbl_cell_bold), Paragraph("Haar cascade + CLAHE equalization + Face Quality Gate (Laplacian sharpness filter).", tbl_cell)],
        [Paragraph("<code>ai/anpr.py</code>", tbl_cell_bold), Paragraph("Indian HSRP plate detection + EasyOCR + TemporalPlateVoter multi-frame consensus.", tbl_cell)],
        [Paragraph("<code>ai/anomaly_detector.py</code>", tbl_cell_bold), Paragraph("2D IoU combat skirmish detector + noise-masked kinetic motion flux engine.", tbl_cell)],
        [Paragraph("<code>backend/app/core/streamer.py</code>", tbl_cell_bold), Paragraph("ThreadedCameraReader (zero-lag rfind ingestion) + multi-camera MJPEG streaming generator.", tbl_cell)],
        [Paragraph("<code>backend/app/core/rule_engine.py</code>", tbl_cell_bold), Paragraph("10+ defense rules (night breach, unusual stop, probing, driver mismatch, loitering).", tbl_cell)],
        [Paragraph("<code>backend/app/core/risk_engine.py</code>", tbl_cell_bold), Paragraph("Dynamic risk scoring (0-100), severity tiering, and human-in-the-loop calibration.", tbl_cell)],
        [Paragraph("<code>backend/app/core/event_engine.py</code>", tbl_cell_bold), Paragraph("Event deduplication, snapshot capture, and SHA-256 cryptographic hash-chain verification.", tbl_cell)],
        [Paragraph("<code>backend/app/core/c2_spooler.py</code>", tbl_cell_bold), Paragraph("MIL-STD-2525D C2 alert dispatch + offline queue spooling + auto burst flush.", tbl_cell)],
        [Paragraph("<code>backend/app/main.py</code>", tbl_cell_bold), Paragraph("FastAPI REST endpoints (/stream, /events, /cameras, /c2, /audit/verify-chain, /benchmark).", tbl_cell)],
        [Paragraph("<code>frontend/src/LiveFeedsView.jsx</code>", tbl_cell_bold), Paragraph("Tactical Command Center dashboard: 2x2 grid, AI Sentry Stream, PTZ, sensor filters.", tbl_cell)],
        [Paragraph("<code>configs/cameras.json</code>", tbl_cell_bold), Paragraph("Active camera registry (CAM-01 to CAM-06), roles, URLs, and resolution configs.", tbl_cell)]
    ]

    t_code = Table(code_map_data, colWidths=[2.2 * inch, 5.2 * inch])
    t_code.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f172a")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 2.8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.8),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_code)
    story.append(Spacer(1, 7))

    # Operational Playbook for Hackathon
    story.append(Paragraph("5. Step-by-Step Setup, Deployment & Zero-Lag Phone Connection", h1_style))
    story.append(Paragraph("How teammates can launch, connect live cameras, and maintain zero latency:", body_style))

    story.append(Paragraph("<b>Step 1: Start Backend & Frontend Dev Servers</b>", h2_style))
    story.append(Paragraph("In terminal 1 (Backend): <code>python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000</code>", code_style))
    story.append(Paragraph("In terminal 2 (Frontend): <code>cd frontend && npm run dev -- --host 0.0.0.0</code>", code_style))
    story.append(Paragraph("Open browser at: <b>http://localhost:3001</b>", bullet_style))

    story.append(Paragraph("<b>Step 2: Connecting Mobile Phone Cameras with Zero Lag</b>", h2_style))
    story.append(Paragraph("• <b>iPhone</b>: Connect via USB cable. Select webcam device index <code>0</code> or <code>1</code>. macOS recognizes it natively at 60 FPS.", bullet_style))
    story.append(Paragraph("• <b>Android (USB Tethering)</b>: Plug USB cable, enable <i>USB Tethering</i> in settings. Start IP Webcam app. Enter URL (e.g. <code>http://192.0.0.4:8080/video</code>).", bullet_style))
    story.append(Paragraph("• <b>Android (ADB Forward)</b>: Run <code>adb forward tcp:8080 tcp:8080</code>, then use <code>http://localhost:8080/video</code>.", bullet_style))
    story.append(Paragraph("• <b>Built-in Folder Videos</b>: If phones are unavailable, click <b>DETECT ON FOLDER VIDEOS</b> to stream pre-recorded tactical scenarios from <code>demo/videos/</code>.", bullet_style))

    story.append(Spacer(1, 7))

    # Winning Jury Demo Script
    story.append(Paragraph("6. Winning 5-Minute Hackathon Demo Script for the Jury", h1_style))
    story.append(Paragraph("Follow this exact sequence when presenting to judges for maximum impact:", body_style))

    demo_steps = [
        ("Minute 1: The Problem & Live Dashboard (WOW Factor)",
         "Show all 4 synchronized camera feeds on http://localhost:3001. Point out the latency counter (14ms) and multi-sensor filters (Optical, FLIR Thermal, Night-IR). "
         "Explain: 'Judges, this isn't passive recording — this is proactive edge intelligence running on standard CCTV cameras.'"),

        ("Minute 2: Vehicle Classification & ANPR Intelligence",
         "Switch to 'Vehicles & ANPR' tab. Show vehicle classification (Car, SUV, Truck, Bike) and license plate OCR. Highlight the TemporalPlateVoter consensus and "
         "demonstrate how a watchlist hit immediately flags the vehicle with +40 risk penalty and auto-recommends checkpoint seal SOP."),

        ("Minute 3: Face Recognition & Quality Gate",
         "Demonstrate FRS. Show an authorized officer recognized with a green tag. Step back or blur the camera to show the Face Quality Gate: "
         "'Notice how our system refuses to guess on blurry or distant faces at the border fence, preventing catastrophic false arrests.'"),

        ("Minute 4: Behavioral Analytics & Skirmish Detection",
         "Stage a quick scuffle or play fight.mp4. Show how the 2D IoU and aspect-ratio collapse detector triggers a CRITICAL alert ('Violent Skirmish / Armed Clash') "
         "with real-time QRF DISPATCH recommendation and siren."),

        ("Minute 5: Cryptographic Chain & C2 Offline Resilience",
         "Open http://localhost:8000/api/v1/audit/verify-chain to show the SHA-256 evidence blockchain. Simulate network jamming using POST /api/v1/c2/simulate-link "
         "and show packets spooling offline and burst-flushing when recovered. Conclude: 'This is defense-grade, tamper-proof, and deployment-ready.'")
    ]

    for d_title, d_desc in demo_steps:
        story.append(Paragraph(f"<b>{d_title}</b>", h2_style))
        story.append(Paragraph(d_desc, body_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated: {output_path}")


if __name__ == "__main__":
    out_file = "IBVAP_Teammate_Master_Guide_EN.pdf"
    if len(sys.argv) > 1:
        out_file = sys.argv[1]
    build_en_pdf(out_file)
