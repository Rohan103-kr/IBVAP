#!/usr/bin/env python3
"""
IBVAP — Teammates' Master Architecture & Working Guide (Hinglish Edition)
Generates a structured, conversational, defense-grade master technical and operational guide
in natural Hinglish for teammates to understand the complete pipeline, features, code, and jury demo.
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
            self.drawString(36, 11 * inch - 26, "IBVAP — Team Working & Demo Guide (Hinglish Edition) | SIH 26187")
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


def build_hinglish_pdf(output_path="IBVAP_Teammate_Master_Guide_HINGLISH.pdf"):
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
        fontSize=16.5,
        leading=20.5,
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
    story.append(Paragraph("IBVAP — TEAM KE LIYE COMPLETE MASTER GUIDE (HINGLISH)", title_style))
    story.append(Paragraph("Apne System Ka Pura Architecture, Data Flow, Features Ka Deep Dive, Code Map Aur Jury Demo Strategy", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0d9488"), spaceBefore=2, spaceAfter=8))

    # Section 1: Hamara Project Asli Me Kya Karta Hai?
    story.append(Paragraph("1. Hamara Project Asli Me Kya Karta Hai? (SIH PS 26187 Simple Words Me)", h1_style))
    story.append(Paragraph(
        "<b>Smart India Hackathon Problem Statement 26187:</b> Hum <i>Intelligent Border Video Analytics Platform (IBVAP)</i> "
        "bana rahe hain Ministry of Home Affairs (MHA / SSB / BSF) ke liye.<br/>"
        "<b>Asli Samasya Kya Hai?</b> Border par hazaron CCTV cameras lage hue hain, lekin wo sab <b>dumb cameras</b> hain — sirf video "
        "record karte hain. Jab border par koi ghuspaith (intrusion), wire cutting, patrolling suspect ya physical altercation hoti hai, "
        "toh CCTV dekhne wala jawan 20 minute ke andar thak jata hai (cognitive fatigue). Recording dekhne se incident rukta nahi hai.<br/>"
        "<b>Hamara Solution:</b> IBVAP kisi bhi standard CCTV, mobile phone webcam, ya RTSP stream ke upar ek <b>Edge AI Brain</b> laga deta hai. "
        "Ye khud detect karta hai ki kaun insaan hai, kaunsi gaadi hai, number plate kya hai, chehra kiska hai, aur agar koi suspicious harkat "
        "karta hai toh <b>real-time siren aur QRF (Quick Reaction Force) dispatch command</b> automatically bhejta hai.",
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
        "JURY KE SAAMNE YEH POINT ZAROOR BOLO: 'Sir, hamara system koi costly defense hardware nahi maangta. Jo CCTV border par pehle se "
        "lage hain, ye unhi par chal kar 92% false alerts khatam karta hai aur 14 millisecond me real-time response deta hai.'"
    ))
    story.append(Spacer(1, 6))

    # Section 2: End-to-End System Pipeline & Data Flow
    story.append(Paragraph("2. Camera Se Leker Alert Tak Ka Pura Flow (10 Stages)", h1_style))
    story.append(Paragraph(
        "Har ek video frame hamare system me in 10 steps se hokar guzarta hai:",
        body_style
    ))

    pipeline_data = [
        [Paragraph("Stage", tbl_header), Paragraph("Component", tbl_header), Paragraph("Internally Kya Hota Hai?", tbl_header), Paragraph("Outcomes / Output", tbl_header)],
        [
            Paragraph("1. Ingestion", tbl_cell_bold),
            Paragraph("ThreadedCameraReader", tbl_cell),
            Paragraph("RTSP / HTTP / Phone stream ko separate daemon thread me padhta hai. Reverse buffer (<code>rfind</code>) se pura purana lag gayab ho jata hai; instant 720p resize.", tbl_cell),
            Paragraph("30 FPS smooth frame (<20ms delay)", tbl_cell)
        ],
        [
            Paragraph("2. Detection", tbl_cell_bold),
            Paragraph("YOLODetector", tbl_cell),
            Paragraph("YOLOv8 nano model frame me Persons aur Vehicles ko dhoondhta hai. Gaadiyon ko Car, SUV, Truck aur Bike me classify karta hai.", tbl_cell),
            Paragraph("Bounding boxes + Object classes", tbl_cell)
        ],
        [
            Paragraph("3. Tracking", tbl_cell_bold),
            Paragraph("ByteTracker", tbl_cell),
            Paragraph("Kalman filter motion estimation se har target ko unique persistent Track ID deta hai taaki screen pe ID flicker na kare.", tbl_cell),
            Paragraph("Track ID + Speed (m/s) + Trajectory", tbl_cell)
        ],
        [
            Paragraph("4. Biometrics", tbl_cell_bold),
            Paragraph("FaceDetector + FRS", tbl_cell),
            Paragraph("CLAHE contrast enhance karta hai. <b>Face Quality Gate</b> lagaya hai — agar chehra door ya blur hai toh system FRS skip karta hai taaki galat arrest na ho.", tbl_cell),
            Paragraph("Face crop, Authorized vs Unknown", tbl_cell)
        ],
        [
            Paragraph("5. ANPR", tbl_cell_bold),
            Paragraph("ANPREngine", tbl_cell),
            Paragraph("Indian rectangular number plates ko isolate karta hai + EasyOCR + <b>TemporalPlateVoter</b> (5 frames me majority character select karta hai).", tbl_cell),
            Paragraph("License Plate text + Watchlist Hit", tbl_cell)
        ],
        [
            Paragraph("6. Virtual Fencing", tbl_cell_bold),
            Paragraph("ZoneEngine", tbl_cell),
            Paragraph("Operator screen par jo zones banata hai (Restricted, Buffer, Perimeter Fence), Point-in-Polygon formula se check hota hai target kahan hai.", tbl_cell),
            Paragraph("Zone Entry / Exit / Tripwire crossed", tbl_cell)
        ],
        [
            Paragraph("7. Behavioral Rules", tbl_cell_bold),
            Paragraph("RuleEngine + AnomalyDetector", tbl_cell),
            Paragraph("10+ military rules evaluate hote hain: Night movement, Loitering, Unusual Stop, Evasive zig-zag probing, aur 2D IoU combat fights.", tbl_cell),
            Paragraph("Security rule trigger", tbl_cell)
        ],
        [
            Paragraph("8. Risk Engine", tbl_cell_bold),
            Paragraph("RiskEngine", tbl_cell),
            Paragraph("Sabhi factors ko mila kar 0 se 100 ka dynamic risk score banata hai: Fence breach (+40), Loitering (+20), Watchlist vehicle (+40).", tbl_cell),
            Paragraph("Risk Score (0-100), Severity Level", tbl_cell)
        ],
        [
            Paragraph("9. Audit & Snapshots", tbl_cell_bold),
            Paragraph("EventEngine + IncidentManager", tbl_cell),
            Paragraph("Same event bar-bar bajne se rokta hai (deduplication). Evidence snapshot save karta hai aur SHA-256 blockchain hash chain banata hai.", tbl_cell),
            Paragraph("Tamper-proof snapshot + Event ID", tbl_cell)
        ],
        [
            Paragraph("10. Tactical C2", tbl_cell_bold),
            Paragraph("C2Spooler + MultiCam Correlator", tbl_cell),
            Paragraph("CAM-01 se CAM-02 aur CAM-03 tak target ka picha karta hai. Jamming hone par offline disk par save karta hai aur network aane par turant flush.", tbl_cell),
            Paragraph("Military C2 Alert + QRF Dispatch", tbl_cell)
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

    # Section 3: Core Features Deep Dive
    story.append(Paragraph("3. Har Ek Feature Ka Asli Kaam (Feature Deep Dive)", h1_style))

    features = [
        ("A. 4-Class Vehicle Classification & Driver Mismatch Rule",
         "PS 26187 me sirf 'vehicle' kehna kaafi nahi tha. Humne 4 classes integrate kiye: <b>Car, SUV, Truck, Bike</b>. "
         "Checkpoint (CAM-02) par hamara system gaadi ke number plate ke sath driver ka chehra match karta hai. "
         "Agar koi unauthorized insaan patrol vehicle chala raha hai, toh Rule 2B (CHECKPOINT_DRIVER_MISMATCH) turant alert baja deta hai."),

        ("B. End-to-End ANPR + 5-Frame Consensus + Watchlist Matching",
         "CCTV me gaadi chalti hai toh number plate ke akshar camera me halke hilte hain (fluttering). Hamara <b>TemporalPlateVoter</b> "
         "5 frames ka consensus leta hai aur majority vote se perfect number nikalta hai. Phir local watchlist se cross-check karke "
         "chori ki gaadi ya suspect ko +40 risk dekar checkpoint seal karne ka SOP recommend karta hai."),

        ("C. FRS (Face Recognition) Aur Face Quality Gate Ka Magic",
         "CCTV se FRS chalana aasan nahi hota kyunki roshni aur doori change hoti rehti hai. Humne CLAHE contrast filter aur dono taraf dekhne wale "
         "profile cascades lagaye hain. Sabse bada feature hai <b>Face Quality Gate</b>: agar banda 50 meter door hai ya daudte huye blur ho gaya hai, "
         "toh system zabardasti galat naam guess nahi karta, balki qualify hone par hi match karta hai."),

        ("D. Tactical Physical Fight & Armed Skirmish Detector",
         "Border outposts ya crowd me ladaai / wrestling pakadne ke liye humne 2D Bounding Box IoU, Combat Aspect Ratio Collapse (banda khade se girkar "
         "tackle/grapple karta hai toh height/width ratio 2.5 se 1.35 se niche gir jata hai), aur sudden combat speed ko track kiya hai. "
         "Faltu crossing par trigger na ho isliye 2-frame persistence rakhi hai."),

        ("E. Multi-Camera Spatial Fence (CAM-01 -> CAM-02 -> CAM-03)",
         "Ek camera dekhna har koi karta hai, hamara multi-camera spatial fence target ka picha karta hai: "
         "CAM-01 (Approach Corridor) &rarr; CAM-02 (Fence Tripwire) &rarr; CAM-03 (Zero-Line Core Boundary). "
         "Jaise hi ghuspaithiya CAM-03 tak pahunchta hai, system alert level ko seedhe CRITICAL (CONFIRMED_SPATIAL_INTRUSION) kar deta hai aur QRF ko vector bhejta hai."),

        ("F. Offline Spooling Aur Cryptographic SHA-256 Hash Chain",
         "Border par dushman jammer chala de ya wire kat jaye toh kya hoga? Hamara C2 Spooler packets ko local disk me SPOOLED_OFFLINE save karta hai, "
         "aur jaise hi network wapas aata hai, burst flush karke sab synchronize kar deta hai. Saath hi har evidence snapshot SHA-256 hash chain se bandha hai — "
         "court me koi police/defense evidence ko tamper nahi kar sakta.")
    ]

    for f_title, f_desc in features:
        story.append(Paragraph(f_title, h2_style))
        story.append(Paragraph(f_desc, body_style))

    story.append(Spacer(1, 6))

    # Section 4: Codebase Map
    story.append(Paragraph("4. Codebase Ka Map (Kaunsi File Kahan Hai Aur Kya Karti Hai)", h1_style))
    story.append(Paragraph("Agar jury puche ki yeh feature kahan likha hai, toh seedhe yeh files batao:", body_style))

    code_map_data = [
        [Paragraph("File Path", tbl_header), Paragraph("Asli Kaam (Responsibility)", tbl_header)],
        [Paragraph("<code>ai/pipeline.py</code>", tbl_cell_bold), Paragraph("Sabhi AI models (YOLO, Tracker, Face, ANPR) ko ek sath jodta hai.", tbl_cell)],
        [Paragraph("<code>ai/face_detector.py</code>", tbl_cell_bold), Paragraph("Face detection, CLAHE enhancement, bi-directional profile search, aur Face Quality Gate.", tbl_cell)],
        [Paragraph("<code>ai/anpr.py</code>", tbl_cell_bold), Paragraph("Indian HSRP plate isolate karna, EasyOCR, aur 5-frame TemporalPlateVoter consensus.", tbl_cell)],
        [Paragraph("<code>ai/anomaly_detector.py</code>", tbl_cell_bold), Paragraph("2D IoU ladaai/skirmish detector aur noise-masked kinetic motion flux.", tbl_cell)],
        [Paragraph("<code>backend/app/core/streamer.py</code>", tbl_cell_bold), Paragraph("ThreadedCameraReader (zero-lag rfind) aur multi-cam MJPEG video streaming loop.", tbl_cell)],
        [Paragraph("<code>backend/app/core/rule_engine.py</code>", tbl_cell_bold), Paragraph("10+ defense rules (night breach, unusual stop, probing, loitering, driver mismatch).", tbl_cell)],
        [Paragraph("<code>backend/app/core/risk_engine.py</code>", tbl_cell_bold), Paragraph("0 se 100 ka dynamic risk score banana aur severity decide karna.", tbl_cell)],
        [Paragraph("<code>backend/app/core/event_engine.py</code>", tbl_cell_bold), Paragraph("Alert deduplication, evidence snapshot capture, aur SHA-256 cryptographic blockchain audit.", tbl_cell)],
        [Paragraph("<code>backend/app/core/c2_spooler.py</code>", tbl_cell_bold), Paragraph("AES-256 encrypted C2 dispatch aur network cut hone par offline queue spooling.", tbl_cell)],
        [Paragraph("<code>backend/app/main.py</code>", tbl_cell_bold), Paragraph("FastAPI endpoints (/stream, /events, /cameras, /c2, /audit/verify-chain, /benchmark).", tbl_cell)],
        [Paragraph("<code>frontend/src/LiveFeedsView.jsx</code>", tbl_cell_bold), Paragraph("Tactical Command Center dashboard: 2x2 grid, AI stream, PTZ, FLIR/Night filters.", tbl_cell)],
        [Paragraph("<code>configs/cameras.json</code>", tbl_cell_bold), Paragraph("CAM-01 se CAM-06 tak active streams, roles aur URLs ka configuration.", tbl_cell)]
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

    # Section 5: Setup & Phone Connection
    story.append(Paragraph("5. Project Ko Run Karna Aur Phone Cameras Ko Zero-Lag Connect Karna", h1_style))
    story.append(Paragraph("Demo ke din kaise run karna hai step-by-step:", body_style))

    story.append(Paragraph("<b>Step 1: Servers Start Karein</b>", h2_style))
    story.append(Paragraph("Terminal 1 (Backend): <code>python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000</code>", code_style))
    story.append(Paragraph("Terminal 2 (Frontend): <code>cd frontend && npm run dev -- --host 0.0.0.0</code>", code_style))
    story.append(Paragraph("Browser me kholein: <b>http://localhost:3001</b>", bullet_style))

    story.append(Paragraph("<b>Step 2: Phone Camera Se Zero-Lag Kaise Payein?</b>", h2_style))
    story.append(Paragraph("• <b>iPhone</b>: USB cable se Mac me lagao. macOS iPhone ko native camera samajhta hai. IBVAP me camera source <code>0</code> ya <code>1</code> dalo (60 FPS, 0 lag).", bullet_style))
    story.append(Paragraph("• <b>Android (USB Tethering - Best)</b>: USB lagao, settings me <i>USB Tethering</i> on karo. IP Webcam app on karo aur jo IP aaye (e.g. <code>http://192.0.0.4:8080/video</code>) wo dalo.", bullet_style))
    story.append(Paragraph("• <b>Android (ADB Forward)</b>: Terminal me chalao <code>adb forward tcp:8080 tcp:8080</code> aur URL dalo <code>http://localhost:8080/video</code>.", bullet_style))
    story.append(Paragraph("• <b>Folder Videos Mode</b>: Agar phone available na ho, toh top bar me <b>DETECT ON FOLDER VIDEOS</b> dabao aur <code>demo/videos/</code> ki high-res tactical clips chala do.", bullet_style))

    story.append(Spacer(1, 7))

    # Section 6: Jury Demo Script
    story.append(Paragraph("6. Jury Ke Saamne 5-Minute Ka Killer Demo Script (Full Marks Strategy)", h1_style))
    story.append(Paragraph("Jury ke aate hi exactly is sequence me demo do:", body_style))

    demo_steps = [
        ("Minute 1: Dashboard Ka First Impression (WOW Effect)",
         "http://localhost:3001 par chaaron feeds dikhao. Bottom me 14ms latency aur 4 FEEDS ONLINE dikhao. "
         "Jury ko bolo: 'Sir, normal CCTV sirf record karta hai. Hamara system commercial cameras ko proactive defense weapon banata hai.' "
         "Top se Optical, FLIR Thermal aur Night-IR filters switch karke dikhao."),

        ("Minute 2: Vehicle Classification & ANPR Watchlist",
         "'Vehicles & ANPR' tab kholein. Gaadiyon ka Car, SUV, Truck, Bike classification dikhao. "
         "Ek gaadi ki number plate par click karke watchlist match dikhao aur bolo: 'Sir, watchlist gaadi aate hi system +40 risk badha kar gate seal SOP initiate kar deta hai.'"),

        ("Minute 3: Face Recognition Aur Face Quality Gate",
         "Camera ke saamne authorized face dikhao — screen par KNOWN OFFICER aayega. "
         "Phir thoda peeche hato ya camera hilao aur Face Quality Gate dikhao: 'Sir, notice kariye jab banda door hota hai, system galat guess nahi karta, quality gate blur ko reject karta hai.'"),

        ("Minute 4: Skirmish / Altercation & Real-Time Alert",
         "Live feed par fight karo ya fight.mp4 chalao. Screen par turant CRITICAL alert aayega: 'Violent Skirmish / Armed Clash'. "
         "Bolo: 'Sir, 2D IoU aur body aspect ratio collapse se system ne ladaai pakad li aur QRF DISPATCH recommend kar diya.'"),

        ("Minute 5: SHA-256 Blockchain Evidence & Jamming Test",
         "http://localhost:8000/api/v1/audit/verify-chain khol kar cryptographic hash chain dikhao: 'Sir, koi police ya hacker snapshot badal nahi sakta.' "
         "Phir C2 link simulate cut karke dikhao ki packets offline spool ho gaye aur reconnect par burst flush ho gaye. Conclude: 'This is defense-grade and ready for deployment.'")
    ]

    for d_title, d_desc in demo_steps:
        story.append(Paragraph(f"<b>{d_title}</b>", h2_style))
        story.append(Paragraph(d_desc, body_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated: {output_path}")


if __name__ == "__main__":
    out_file = "IBVAP_Teammate_Master_Guide_HINGLISH.pdf"
    if len(sys.argv) > 1:
        out_file = sys.argv[1]
    build_hinglish_pdf(out_file)
