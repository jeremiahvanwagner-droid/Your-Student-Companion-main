"""
Shared pytest configuration for the backend suite.

Keep local test runs off the real Sentry project. `routes.*` and `server`
call `load_dotenv(backend/.env)` at import time and `server` then runs
`init_sentry()`, so a developer whose backend/.env carries a production
SENTRY_DSN would otherwise ship every test-induced exception to Sentry
("Sentry is attempting to send N pending events" at the end of a run).

python-dotenv never overrides a variable that is already present in the
process, so pre-setting SENTRY_DSN to the empty string here — before any test
module is imported — makes init_sentry() take its documented "DSN not set"
no-op path. Tests that exercise init_sentry() set the DSN explicitly or pass
it as an argument, so they are unaffected. An operator who really wants Sentry
on during a local run can export SENTRY_DSN in the shell (setdefault keeps it).
"""

import os

os.environ.setdefault("SENTRY_DSN", "")
