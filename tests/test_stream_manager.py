import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.stream_manager import StreamManager, generate_synthetic_cctv_video

TEST_VIDEO_PATH = "demo/videos/test_sample.mp4"

class TestStreamManager(unittest.TestCase):
    def test_generate_synthetic_video(self):
        generate_synthetic_cctv_video(TEST_VIDEO_PATH, duration_sec=2, fps=10)
        self.assertTrue(os.path.exists(TEST_VIDEO_PATH))

    def test_stream_manager_read(self):
        if not os.path.exists(TEST_VIDEO_PATH):
            generate_synthetic_cctv_video(TEST_VIDEO_PATH, duration_sec=2, fps=10)

        sm = StreamManager("CAM-TEST", TEST_VIDEO_PATH, target_fps=10)
        self.assertTrue(sm.connect())

        count = 0
        for frame, frame_id, status in sm.read_frames(loop=False):
            count += 1
            self.assertIsNotNone(frame)
            self.assertIn(status, ["ONLINE", "DEGRADED"])
            if count >= 5:
                break

        sm.release()
        self.assertEqual(count, 5)
        self.assertEqual(sm.status, "OFFLINE")

if __name__ == "__main__":
    unittest.main()
