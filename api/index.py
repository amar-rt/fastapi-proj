# Vercel Python entrypoint. All /api/* requests are rewritten here (see vercel.json).
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from _app.main import app  # noqa: E402,F401
