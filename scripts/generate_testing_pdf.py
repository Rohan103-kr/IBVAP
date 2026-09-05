#!/usr/bin/env python3
"""
IBVAP — Phone Camera Real-Life Testing & SIH Demo Playbook Generator
Generates publication-quality PDF guide for 6-member team distribution.
"""

import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether, PageBreak
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
        
        # Header (pages 2+)
        if self._pageNumber > 1:
            self.drawString(36, 11 * inch - 25, "IBVAP — SIH 2026 FIELD MANUAL | Real-Life Phone Camera Testing & Demo Guide")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(36, 11 * inch - 28, 8.5 * inch - 36, 11 * inch - 28)

        # Footer (all pages)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(36, 20, "CONFIDENTIAL — IBVAP SIH GRAND FINALIST MANUAL (FOR 6 TEAM MEMBERS)")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 36, 20, page_text)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(36, 32, 8.5 * inch - 36, 32)
        
        self.restoreState()

def build_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=42
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Title'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        alignment=0,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#0d9488"),
        spaceAfter=10
    )

    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=4
    )

    bullet_style = ParagraphStyle(
        'BulletDark',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#0f172a")
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=10,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#1e293b")
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # Title Block
    story.append(Paragraph("IBVAP — Real-Life Phone Camera Testing & SIH Demo Playbook", title_style))
    story.append(Paragraph("Smart India Hackathon (SIH 2026) | Problem Statement ID: 26187 | Ministry of Home Affairs (MHA / SSB)", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0d9488"), spaceBefore=0, spaceAfter=8))

    # Executive Box
    exec_summary_html = """<b>OBJECTIVE FOR THE 6-MEMBER TEAM:</b><br/>
    This manual provides exact instructions for pre-recording smartphone videos and conducting live smartphone camera demos for the SIH 2026 Grand Final. By using ordinary smartphone cameras (Android/iOS) acting as mobile watchtowers, your team proves that IBVAP requires <b>zero proprietary hardware</b>, runs on edge CPUs at <b>15.2 FPS</b>, reduces sentry fatigue by <b>99.5%</b>, and provides court-admissible <b>SHA-256 evidence logging</b>."""
    
    exec_table = Table([[Paragraph(exec_summary_html, callout_style)]], colWidths=[540])
    exec_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f0fdf4")),
        ('BORDER', (0,0), (-1,-1), 1, colors.HexColor("#86efac")),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(exec_table)
    story.append(Spacer(1, 8))

    # Section 1: Team Role Matrix
    story.append(Paragraph("1. 6-Member Team Roles & Responsibility Matrix", h1_style))
    story.append(Paragraph("To execute a flawless jury demonstration, responsibilities are split across 1 Presenter, 1 Network Marshal, and 4 Smartphone Camera Operators/Actors:", body_style))

    roles_data = [
        [
            Paragraph("Member / Role", table_header_style),
            Paragraph("Hardware / Device", table_header_style),
            Paragraph("Pre-Recorded Video Task", table_header_style),
            Paragraph("Live Jury Demo Duty", table_header_style)
        ],
        [
            Paragraph("<b>Member 1</b><br/>Team Lead / Presenter", table_cell_bold),
            Paragraph("Main Laptop + Extended Display", table_cell_style),
            Paragraph("Reviews & verifies all 4 recorded MP4 clips into <code>demo/videos/</code>", table_cell_style),
            Paragraph("Operates React Command Center UI, pitch script, calls out live AI dossiers to judges", table_cell_style)
        ],
        [
            Paragraph("<b>Member 2</b><br/>Edge & Network Marshal", table_cell_bold),
            Paragraph("Backend Laptop + Wi-Fi Router", table_cell_style),
            Paragraph("Tests <code>./start.sh</code>, FastAPI endpoints & stream health", table_cell_style),
            Paragraph("Monitors CPU/FPS stats, manages Wi-Fi hotspot, executes network disconnect demo", table_cell_style)
        ],
        [
            Paragraph("<b>Member 3</b><br/>Field Actor 1 (Fence Breach)", table_cell_bold),
            Paragraph("Smartphone #1 (Android/iOS)", table_cell_style),
            Paragraph("Shoots <code>phone_recorded_fence_breach.mp4</code> (Day boundary approach & loitering)", table_cell_style),
            Paragraph("Operates Live Phone Cam #1 stream / acts perimeter breach in front of camera", table_cell_style)
        ],
        [
            Paragraph("<b>Member 4</b><br/>Field Actor 2 (Night Infiltrator)", table_cell_bold),
            Paragraph("Smartphone #2 + LED Light", table_cell_style),
            Paragraph("Shoots <code>phone_recorded_night_intrusion.mp4</code> (Low-light shadow movement)", table_cell_style),
            Paragraph("Operates Live Phone Cam #2 stream / simulates low-light border breach", table_cell_style)
        ],
        [
            Paragraph("<b>Member 5</b><br/>Field Actor 3 (ANPR Vehicle)", table_cell_bold),
            Paragraph("Smartphone #3 + Plate Card", table_cell_style),
            Paragraph("Shoots <code>phone_recorded_anpr_checkpoint.mp4</code> (Vehicle plate approach)", table_cell_style),
            Paragraph("Operates Live Phone Cam #3 stream / displays license plate to camera lens", table_cell_style)
        ],
        [
            Paragraph("<b>Member 6</b><br/>Field Actor 4 (Cross-Cam Relay)", table_cell_bold),
            Paragraph("Smartphone #4 (Android/iOS)", table_cell_style),
            Paragraph("Shoots <code>phone_recorded_cross_camera.mp4</code> (Walking CAM-01 to CAM-02)", table_cell_style),
            Paragraph("Operates Live Phone Cam #4 stream / performs cross-camera handover walk", table_cell_style)
        ]
    ]

    roles_table = Table(roles_data, colWidths=[90, 100, 175, 175])
    roles_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f172a")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(roles_table)
    story.append(Spacer(1, 10))

    # Section 2: Video Recording Blueprint
    story.append(Paragraph("2. Pre-Recording Real-Life Phone Videos (SIH Problem Statement 26187)", h1_style))
    story.append(Paragraph("Pre-recorded phone videos guarantee 100% pitch stability regardless of venue Wi-Fi congestion. Each assigned member must record their clip following these guidelines:", body_style))

    story.append(Paragraph("<b>Camera Technical Shooting Requirements:</b>", h2_style))
    story.append(Paragraph("• <b>Resolution & Format:</b> 1080p (1920x1080) or 720p (1280x720) @ 30 FPS in standard MP4 format.", bullet_style))
    story.append(Paragraph("• <b>Elevation Angle:</b> Hold/mount phone at 15–30 degrees elevated downward (simulating watchtower/pole CCTV).", bullet_style))
    story.append(Paragraph("• <b>Clip Length:</b> 15 to 25 seconds per scenario (short, dense action clips optimal for judge review).", bullet_style))
    story.append(Paragraph("• <b>File Naming & Path:</b> Save video files directly into project folder: <code>demo/videos/</code>.", bullet_style))

    vid_data = [
        [
            Paragraph("Clip File Name", table_header_style),
            Paragraph("Assigned Actor", table_header_style),
            Paragraph("Action to Record (SIH Scenario)", table_header_style),
            Paragraph("Expected AI Engine Output", table_header_style)
        ],
        [
            Paragraph("<code>phone_recorded_fence_breach.mp4</code>", table_cell_bold),
            Paragraph("Member 3", table_cell_style),
            Paragraph("Walk towards marked line/fence, step across into restricted area, loiter for 5 seconds.", table_cell_style),
            Paragraph("<b>ByteTrack ID #101</b> + <b>RESTRICTED_ZONE</b> breach alert. Risk Score: <b>85/100</b>.", table_cell_style)
        ],
        [
            Paragraph("<code>phone_recorded_night_intrusion.mp4</code>", table_cell_bold),
            Paragraph("Member 4", table_cell_style),
            Paragraph("Dim corridor/room, move stealthily with shadow/torch glare across boundary.", table_cell_style),
            Paragraph("ContextEngine activates <b>+20 Night Multiplier</b>. Risk Score: <b>90/100</b>.", table_cell_style)
        ],
        [
            Paragraph("<code>phone_recorded_anpr_checkpoint.mp4</code>", table_cell_bold),
            Paragraph("Member 5", table_cell_style),
            Paragraph("Approach camera with vehicle or holding printed plate (e.g. <code>DL 01 AB 1234</code>).", table_cell_style),
            Paragraph("ANPR Engine crops plate, extracts string via OCR, logs to vehicle entry database.", table_cell_style)
        ],
        [
            Paragraph("<code>phone_recorded_cross_camera.mp4</code>", table_cell_bold),
            Paragraph("Member 6", table_cell_style),
            Paragraph("Walk past Phone Cam #1 view, exit frame, walk into Phone Cam #2 view 3 seconds later.", table_cell_style),
            Paragraph("B-Correlation Engine links track chain: <b>CAM-01 ➔ CAM-02</b> in unified dossier.", table_cell_style)
        ]
    ]

    vid_table = Table(vid_data, colWidths=[140, 65, 175, 160])
    vid_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f172a")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(vid_table)
    story.append(Spacer(1, 10))

    # Section 3: Live Smartphone Streaming Setup
    story.append(Paragraph("3. Live Smartphone RTSP / HTTP Streaming Setup Guide", h1_style))
    story.append(Paragraph("For live stream demonstrations, follow these exact networking and app setup steps:", body_style))

    story.append(Paragraph("<b>A. Local Edge Wi-Fi Hotspot Setup (No Internet Required):</b>", h2_style))
    story.append(Paragraph("1. Member 2 creates a portable Wi-Fi Hotspot on phone/router named: <code>IBVAP-EDGE-NET</code>.", bullet_style))
    story.append(Paragraph("2. Connect both laptops (Presenter & Backend) + all 4 actor smartphones to <code>IBVAP-EDGE-NET</code>.", bullet_style))
    story.append(Paragraph("3. Verify laptop local IP address (e.g., <code>192.168.1.100</code>).", bullet_style))

    story.append(Paragraph("<b>B. Smartphone App Configuration:</b>", h2_style))
    story.append(Paragraph("• <b>Android Apps:</b> Install <i>IP Webcam</i> (by Pavel Khlebovich) or <i>DroidCam</i>.", bullet_style))
    story.append(Paragraph("  - Set Video Resolution: <b>1280x720 (720p)</b> | FPS: <b>15-20</b> | Quality: <b>80%</b>.", bullet_style))
    story.append(Paragraph("  - Click <b>'Start Server'</b> at bottom. Note stream URL shown on screen (e.g. <code>http://192.168.1.101:8080/video</code>).", bullet_style))
    story.append(Paragraph("• <b>iOS Apps:</b> Install <i>IP Camera Lite</i> or <i>Larix Broadcaster</i>.", bullet_style))
    story.append(Paragraph("  - Enable RTSP/HTTP server mode. Stream URL: <code>rtsp://192.168.1.102:8554/live</code>.", bullet_style))

    story.append(Paragraph("<b>C. Linking Phone Feeds into IBVAP:</b>", h2_style))
    story.append(Paragraph("Update <code>configs/cameras.json</code> with phone stream URLs or activate test config:", body_style))
    
    code_snippet = """[
  { "camera_id": "CAM-01", "name": "Mobile Watchtower 1", "stream_url": "http://192.168.1.101:8080/video" },
  { "camera_id": "CAM-02", "name": "Mobile Watchtower 2", "stream_url": "http://192.168.1.102:8080/video" },
  { "camera_id": "CAM-03", "name": "ANPR Checkpoint",    "stream_url": "http://192.168.1.103:8080/video" }
]"""
    code_table = Table([[Paragraph(f"<font face='Courier' size='7.5'>{code_snippet.replace('<', '&lt;').replace('>', '&gt;').replace(chr(10), '<br/>')}</font>", callout_style)]], colWidths=[540])
    code_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#1e293b")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(code_table)
    story.append(Spacer(1, 10))

    # Page Break for clean section alignment
    story.append(PageBreak())

    # Section 4: Live Jury Pitch Script
    story.append(Paragraph("4. 5-Minute Live Jury Presentation Script & Choreography", h1_style))
    story.append(Paragraph("Synchronized presentation timeline connecting field actor phone movements with live Command Center UI updates on the judges' screen:", body_style))

    script_data = [
        [
            Paragraph("Time", table_header_style),
            Paragraph("Command Center Screen (What Judges See)", table_header_style),
            Paragraph("Field Member Action (What Team Does)", table_header_style),
            Paragraph("Presenter Narration (What You Say)", table_header_style)
        ],
        [
            Paragraph("<b>0:00 - 0:45</b>", table_cell_bold),
            Paragraph("Live 4-Camera Grid View showing phone feeds & coverage health (99.8%).", table_cell_style),
            Paragraph("Member 2 verifies FPS (15.2 FPS). Member 3, 4, 5 hold phones steady.", table_cell_style),
            Paragraph("<i>'Respected Judges, existing border surveillance produces over 95% false alarms and sentry fatigue. IBVAP converts raw CCTV feeds into actionable intelligence with sub-15ms edge processing.'</i>", table_cell_style)
        ],
        [
            Paragraph("<b>0:45 - 1:30</b>", table_cell_bold),
            Paragraph("<b>BIIE Hero Alert Banner</b> triggers. Risk Score jumps to <b>85/100</b>.", table_cell_style),
            Paragraph("Member 3 walks phone across boundary line / triggers pre-recorded breach clip.", table_cell_style),
            Paragraph("<i>'As target crosses the virtual fence, ByteTrack assigns persistent ID #101. Spatial Ray-Casting detects boundary intrusion, calculating an auditable risk score of 85.'</i>", table_cell_style)
        ],
        [
            Paragraph("<b>1:30 - 2:30</b>", table_cell_bold),
            Paragraph("Single correlated movement chain: <code>CAM-01 ➔ CAM-02</code> shown in timeline.", table_cell_style),
            Paragraph("Member 6 moves subject from Cam-01 zone into Cam-02 view.", table_cell_style),
            Paragraph("<i>'Instead of 3 separate alerts as intruder moves across watchtowers, IBVAP's B-Correlation engine links sightings into a single unified incident narrative.'</i>", table_cell_style)
        ],
        [
            Paragraph("<b>2:30 - 3:30</b>", table_cell_bold),
            Paragraph("ANPR vehicle plate crop displayed + ContextEngine <b>+20 Night Multiplier</b>.", table_cell_style),
            Paragraph("Member 4 dims light. Member 5 shows vehicle plate to Cam #3.", table_cell_style),
            Paragraph("<i>'Our ANPR OCR extracts vehicle plates instantly, while ContextEngine adjusts risk weights dynamically for night-time operation.'</i>", table_cell_style)
        ],
        [
            Paragraph("<b>3:30 - 4:15</b>", table_cell_bold),
            Paragraph("<b>OFFLINE RESILIENCE DEMO:</b> Screen displays <i>'OFFLINE MODE ACTIVE - LOCAL QUEUEING'</i>.", table_cell_style),
            Paragraph("Member 2 <b>unplugs Wi-Fi cable live</b> on table in front of judges!", table_cell_style),
            Paragraph("<i>'Watch this live: when network cuts at remote outposts, IBVAP edge nodes continue AI perception locally. Upon reconnection, queued incidents auto-sync with zero data loss.'</i>", table_cell_style)
        ],
        [
            Paragraph("<b>4:15 - 5:00</b>", table_cell_bold),
            Paragraph("Forensic Dossier with <b>SHA-256 tamper-proof hash</b> & 99.5% burden reduction chart.", table_cell_style),
            Paragraph("Member 2 reconnects Wi-Fi. Presenter shows audit trail.", table_cell_style),
            Paragraph("<i>'IBVAP reduces operator burden by 99.5%, provides court-admissible evidence, and installs on existing CCTV infrastructure with zero hardware cost.'</i>", table_cell_style)
        ]
    ]

    script_table = Table(script_data, colWidths=[65, 155, 140, 180])
    script_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f172a")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(script_table)
    story.append(Spacer(1, 10))

    # Section 5: Emergency Contingency Plan
    story.append(Paragraph("5. Pre-Demo Checklist & Emergency Troubleshooting Cheat Sheet", h1_style))
    
    trouble_html = """<b>EMERGENCY CONTINGENCY PROCEDURES DURING LIVE JURY DEMO:</b><br/>
    • <b>Phone Disconnect / Wi-Fi Congestion:</b> If phone stream freezes, Member 1 presses <code>Ctrl+R</code> or toggles fallback config to pre-recorded MP4 clips instantly.<br/>
    • <b>Low FPS Warning:</b> Member 2 reduces phone resolution in IP Webcam app from 1080p to 720p or 640x480.<br/>
    • <b>System Quick Launch Command:</b> <code>./start.sh</code><br/>
    • <b>Unit Test Verification Command:</b> <code>python3 -m unittest discover -s tests -p "test_*.py"</code> (25/25 tests pass)."""
    
    trouble_table = Table([[Paragraph(trouble_html, callout_style)]], colWidths=[540])
    trouble_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#fffbeb")),
        ('BORDER', (0,0), (-1,-1), 1, colors.HexColor("#fde68a")),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(trouble_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated PDF manual at: {output_path}")

if __name__ == "__main__":
    out_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(out_dir, ".."))
    pdf_path = os.path.join(project_root, "IBVAP_SIH_Phone_Camera_Real_Life_Testing_Guide.pdf")
    build_pdf(pdf_path)
